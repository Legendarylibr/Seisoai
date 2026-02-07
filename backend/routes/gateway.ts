/**
 * Agentic Gateway Routes
 * Unified API for AI agents to discover, price, and invoke all SeisoAI capabilities.
 * 
 * This is the primary interface for external agents. Supports:
 * - Tool discovery (GET /api/gateway/tools)
 * - Tool invocation (POST /api/gateway/invoke/:toolId)
 * - Pricing queries (GET /api/gateway/price/:toolId)
 * - x402 pay-per-request (USDC on Base)
 * - API key authentication for agents
 * - Async job management for queue-based tools
 * 
 * Designed to work with MCP, x402, and ERC-8004 agent protocols.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { toolRegistry, type ToolCategory, type ToolDefinition } from '../services/toolRegistry';
import { falRequest, submitToQueue, checkQueueStatus, getQueueResult, isStatusCompleted, isStatusFailed } from '../services/fal';
import { settleX402Payment, type X402Request } from '../middleware/x402Payment';
import { generatePlan, executePlan, orchestrate, WORKFLOW_TEMPLATES } from '../services/orchestrator';
import { authenticateApiKey } from '../middleware/apiKeyAuth';
import { sendGenerationWebhook } from '../services/webhook';
import { getCustomAgentById, getAllCustomAgents } from './agents';
import logger from '../utils/logger';
import { isValidWebhookUrl } from '../utils/validation';

// Dependencies injected from parent
interface Dependencies {
  authenticateFlexible?: (req: Request, res: Response, next: NextFunction) => void;
  requireCredits?: (amount: number) => (req: Request, res: Response, next: NextFunction) => void;
  [key: string]: unknown;
}

/**
 * Create gateway routes
 */
export default function createGatewayRoutes(_deps: Dependencies): Router {
  const router = Router();

  // Apply API key authentication to all gateway routes
  // This allows agents to authenticate with X-API-Key header
  // Falls through to x402 or JWT auth if no API key is present
  router.use(authenticateApiKey);

  // ============================================
  // DISCOVERY ENDPOINTS
  // ============================================

  /**
   * GET /api/gateway/tools
   * List all available tools with optional filtering
   * 
   * Query params:
   *   category - Filter by category (e.g., 'image-generation')
   *   tag - Filter by tag (e.g., 'video')
   *   q - Search query
   *   enabled - Only show enabled tools (default: true)
   */
  router.get('/tools', (_req: Request, res: Response) => {
    try {
      const { category, tag, q, enabled } = _req.query;

      let tools: ToolDefinition[];

      if (q && typeof q === 'string') {
        tools = toolRegistry.search(q);
      } else if (category && typeof category === 'string') {
        tools = toolRegistry.getByCategory(category as ToolCategory);
      } else if (tag && typeof tag === 'string') {
        tools = toolRegistry.getByTag(tag);
      } else if (enabled === 'false') {
        tools = toolRegistry.getAll();
      } else {
        tools = toolRegistry.getEnabled();
      }

      // Return lightweight summaries by default
      const summaries = tools.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        tags: t.tags,
        executionMode: t.executionMode,
        pricing: {
          baseUsd: t.pricing.baseUsdCost * t.pricing.markup,
          credits: t.pricing.credits,
          perUnit: t.pricing.perUnitCost ? {
            usd: t.pricing.perUnitCost * t.pricing.markup,
            credits: t.pricing.perUnitCredits,
            unitType: t.pricing.unitType,
          } : undefined,
        },
        enabled: t.enabled,
        version: t.version,
      }));

      res.json({
        success: true,
        gateway: 'seisoai',
        version: '1.0.0',
        toolCount: summaries.length,
        categories: toolRegistry.getCategories(),
        tools: summaries,
        protocols: {
          mcp: { supported: true, endpoint: '/api/mcp' },
          x402: { supported: true, network: 'eip155:8453', asset: 'USDC' },
          erc8004: { supported: true, standard: 'ERC-8004' },
        },
      });
    } catch (error) {
      logger.error('Gateway tools listing failed', { error });
      res.status(500).json({ success: false, error: 'Failed to list tools' });
    }
  });

  /**
   * GET /api/gateway/tools/:toolId
   * Get full tool details including input schema
   */
  router.get('/tools/:toolId', (req: Request, res: Response) => {
    const tool = toolRegistry.get(req.params.toolId);
    if (!tool) {
      return res.status(404).json({ success: false, error: `Tool not found: ${req.params.toolId}` });
    }

    res.json({
      success: true,
      tool: {
        ...tool,
        pricing: {
          ...tool.pricing,
          x402: {
            network: 'eip155:8453',
            asset: 'USDC',
            baseAmount: Math.round(tool.pricing.baseUsdCost * tool.pricing.markup * 1e6).toString(),
          },
        },
      },
    });
  });

  /**
   * GET /api/gateway/price/:toolId
   * Calculate price for a specific invocation
   */
  router.get('/price/:toolId', (req: Request, res: Response) => {
    const tool = toolRegistry.get(req.params.toolId);
    if (!tool) {
      return res.status(404).json({ success: false, error: `Tool not found: ${req.params.toolId}` });
    }

    // Accept query params as mock input for price calculation
    const params = req.query as Record<string, unknown>;
    const price = toolRegistry.calculatePrice(req.params.toolId, params);

    res.json({
      success: true,
      toolId: req.params.toolId,
      toolName: tool.name,
      pricing: price,
      x402: {
        network: 'eip155:8453',
        asset: 'USDC',
        amount: price?.usdcUnits,
        amountUsd: price ? `$${price.usd.toFixed(4)}` : null,
      },
    });
  });

  /**
   * GET /api/gateway/schema
   * Get OpenAPI-compatible schema for all tools
   */
  router.get('/schema', (_req: Request, res: Response) => {
    res.json({
      openapi: '3.0.3',
      info: {
        title: 'SeisoAI Agentic Gateway',
        version: '1.0.0',
        description: 'Unified AI inference gateway. All creative AI capabilities as invokable tools for agents.',
      },
      paths: toolRegistry.toOpenAPISchema(),
    });
  });

  /**
   * GET /api/gateway/mcp-manifest
   * Return MCP-compatible tool listing for agent discovery
   */
  router.get('/mcp-manifest', (_req: Request, res: Response) => {
    res.json({
      name: 'seisoai-gateway',
      version: '1.0.0',
      description: 'SeisoAI Agentic Inference Gateway - Image, Video, Music, 3D, and Audio AI tools',
      tools: toolRegistry.toMCPTools(),
    });
  });

  // ============================================
  // INVOCATION ENDPOINTS
  // ============================================

  /**
   * POST /api/gateway/invoke/:toolId
   * Invoke a tool directly
   * 
   * Authentication: x402 payment OR JWT + credits
   * Body: Tool-specific input parameters (validated against schema)
   * 
   * For sync tools: Returns result immediately
   * For queue tools: Returns job ID for polling
   */
  router.post('/invoke/:toolId', async (req: Request, res: Response) => {
    const { toolId } = req.params;
    const tool = toolRegistry.get(toolId);

    if (!tool) {
      return res.status(404).json({ success: false, error: `Tool not found: ${toolId}` });
    }

    if (!tool.enabled) {
      return res.status(503).json({ success: false, error: `Tool is currently disabled: ${toolId}` });
    }

    // Extract webhook URL from body or API key config
    const { webhookUrl: bodyWebhookUrl, ...input } = req.body;
    const webhookUrl = bodyWebhookUrl || req.apiKey?.webhookUrl;
    const webhookSecret = req.apiKey?.webhookSecret;
    const requestId = (req as any).requestId || `gw-${Date.now()}`;

    // SECURITY FIX: Validate webhook URL to prevent SSRF/data exfiltration
    if (webhookUrl) {
      const webhookValidation = isValidWebhookUrl(webhookUrl);
      if (!webhookValidation.valid) {
        return res.status(400).json({
          success: false,
          error: `Invalid webhook URL: ${webhookValidation.error}`,
        });
      }
    }

    // Validate input against tool's JSON Schema
    const validation = toolRegistry.validateInput(toolId, input);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: `Invalid input: ${validation.errors.join('; ')}`,
        validationErrors: validation.errors,
        schema: tool.inputSchema,
      });
    }

    // SECURITY FIX: Atomically deduct API key credits before processing
    // Previously credits were only checked but never deducted, allowing free usage
    if (req.isApiKeyAuth && req.apiKey) {
      const price = toolRegistry.calculatePrice(toolId, input);
      const creditsNeeded = price?.credits || tool.pricing.credits;

      const ApiKeyModel = (await import('mongoose')).default.model('ApiKey');
      const updatedKey = await ApiKeyModel.findOneAndUpdate(
        { _id: req.apiKey._id, credits: { $gte: creditsNeeded } },
        {
          $inc: {
            credits: -creditsNeeded,
            totalCreditsSpent: creditsNeeded,
          },
        },
        { new: true }
      );

      if (!updatedKey) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient API key credits',
          required: creditsNeeded,
          available: req.apiKey.credits,
          topUpUrl: '/api/api-keys/top-up',
        });
      }

      // Update the request's apiKey reference with the new balance
      req.apiKey = updatedKey as typeof req.apiKey;
    }

    // Calculate price
    const price = toolRegistry.calculatePrice(toolId, input);

    logger.info('Gateway invoke', { toolId, executionMode: tool.executionMode, requestId, price, hasWebhook: !!webhookUrl, authType: req.isApiKeyAuth ? 'api-key' : 'other' });

    try {
      if (tool.executionMode === 'sync') {
        // Sync execution - call fal.ai directly and return result
        const endpoint = `https://fal.run/${tool.falModel}`;
        const result = await falRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(input),
        });

        // SECURITY FIX: Only settle x402 payment AFTER successful generation
        // Previously, payment could be settled even if the response was malformed
        const x402Req = req as X402Request;
        if (x402Req.isX402Paid && result) {
          try {
            await settleX402Payment(x402Req);
          } catch (settleErr) {
            logger.error('x402 settlement failed after successful generation', {
              toolId, requestId, error: (settleErr as Error).message
            });
            // Don't fail the request — the generation succeeded, settlement can be retried
          }
        }

        // Send webhook callback if configured
        if (webhookUrl) {
          sendGenerationWebhook(
            webhookUrl,
            webhookSecret,
            'generation.completed',
            requestId,
            { toolId, toolName: tool.name, result, pricing: price },
            toolId
          );
        }

        return res.json({
          success: true,
          toolId,
          toolName: tool.name,
          executionMode: 'sync',
          requestId,
          result,
          pricing: price,
          webhook: webhookUrl ? { url: webhookUrl, status: 'delivered' } : undefined,
        });
      } else {
        // Queue execution - submit and return job ID
        const queueResult = await submitToQueue(tool.falModel, input) as { request_id?: string };

        if (!queueResult?.request_id) {
          throw new Error('No request_id returned from queue submission');
        }

        // For queue-based tools with webhooks, start polling in the background
        if (webhookUrl) {
          pollAndDeliverWebhook(
            queueResult.request_id,
            tool.falModel,
            toolId,
            tool.name,
            requestId,
            webhookUrl,
            webhookSecret,
            price
          );
        }

        return res.json({
          success: true,
          toolId,
          toolName: tool.name,
          executionMode: 'queue',
          requestId,
          job: {
            id: queueResult.request_id,
            model: tool.falModel,
            status: 'IN_QUEUE',
            statusUrl: `/api/gateway/jobs/${queueResult.request_id}?model=${encodeURIComponent(tool.falModel)}`,
            resultUrl: `/api/gateway/jobs/${queueResult.request_id}/result?model=${encodeURIComponent(tool.falModel)}`,
          },
          pricing: price,
          webhook: webhookUrl ? { url: webhookUrl, status: 'pending' } : undefined,
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Gateway invoke failed', { toolId, error: err.message, requestId });

      // SECURITY FIX: Refund API key credits on generation failure
      if (req.isApiKeyAuth && req.apiKey) {
        try {
          const { refundApiKeyCredits } = await import('../middleware/apiKeyAuth.js');
          const creditsToRefund = price?.credits || tool.pricing.credits;
          await refundApiKeyCredits(
            (req.apiKey as any)._id?.toString(),
            creditsToRefund,
            `Gateway invoke failed: ${err.message}`
          );
          logger.info('API key credits refunded after gateway failure', {
            keyPrefix: req.apiKey.keyPrefix,
            credits: creditsToRefund,
            toolId,
          });
        } catch (refundErr) {
          logger.error('Failed to refund API key credits after gateway failure', {
            error: (refundErr as Error).message,
            toolId,
          });
        }
      }

      // Send failure webhook if configured
      if (webhookUrl) {
        sendGenerationWebhook(
          webhookUrl,
          webhookSecret,
          'generation.failed',
          requestId,
          { toolId, error: err.message },
          toolId
        );
      }

      return res.status(500).json({
        success: false,
        error: `Tool invocation failed: ${err.message}`,
        toolId,
      });
    }
  });

  /**
   * POST /api/gateway/invoke
   * Invoke a tool with toolId in the body (alternative to URL param)
   */
  router.post('/invoke', async (req: Request, res: Response) => {
    const { toolId, ...input } = req.body;
    if (!toolId) {
      return res.status(400).json({ success: false, error: 'Missing toolId in request body' });
    }
    // Delegate to the parameterized route handler
    req.params.toolId = toolId;
    req.body = input;
    // Re-route through the invoke handler
    const tool = toolRegistry.get(toolId);
    if (!tool) {
      return res.status(404).json({ success: false, error: `Tool not found: ${toolId}` });
    }
    if (!tool.enabled) {
      return res.status(503).json({ success: false, error: `Tool is currently disabled: ${toolId}` });
    }

    const missingFields = tool.inputSchema.required.filter(field => !(field in input));
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        schema: tool.inputSchema,
      });
    }

    const price = toolRegistry.calculatePrice(toolId, input);
    const requestId = (req as any).requestId || `gw-${Date.now()}`;

    try {
      if (tool.executionMode === 'sync') {
        const endpoint = `https://fal.run/${tool.falModel}`;
        const result = await falRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(input),
        });

        const x402Req = req as X402Request;
        if (x402Req.isX402Paid) {
          await settleX402Payment(x402Req);
        }

        return res.json({ success: true, toolId, toolName: tool.name, executionMode: 'sync', requestId, result, pricing: price });
      } else {
        const queueResult = await submitToQueue(tool.falModel, input) as { request_id?: string };
        if (!queueResult?.request_id) {
          throw new Error('No request_id returned from queue submission');
        }
        return res.json({
          success: true, toolId, toolName: tool.name, executionMode: 'queue', requestId,
          job: {
            id: queueResult.request_id,
            model: tool.falModel,
            status: 'IN_QUEUE',
            statusUrl: `/api/gateway/jobs/${queueResult.request_id}?model=${encodeURIComponent(tool.falModel)}`,
            resultUrl: `/api/gateway/jobs/${queueResult.request_id}/result?model=${encodeURIComponent(tool.falModel)}`,
          },
          pricing: price,
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Gateway invoke failed', { toolId, error: err.message });
      return res.status(500).json({ success: false, error: `Tool invocation failed: ${err.message}`, toolId });
    }
  });

  // ============================================
  // JOB MANAGEMENT (for queue-based tools)
  // ============================================

  /**
   * GET /api/gateway/jobs/:jobId
   * Check the status of an async job
   */
  router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const model = req.query.model as string;

    if (!model) {
      return res.status(400).json({ success: false, error: 'Missing model query parameter' });
    }

    try {
      const status = await checkQueueStatus(jobId, model) as { status?: string; logs?: unknown[] };

      const isDone = isStatusCompleted(status?.status);
      const isFailed = isStatusFailed(status?.status);

      res.json({
        success: true,
        jobId,
        status: status?.status || 'UNKNOWN',
        completed: isDone,
        failed: isFailed,
        ...(isDone ? {
          resultUrl: `/api/gateway/jobs/${jobId}/result?model=${encodeURIComponent(model)}`,
        } : {}),
        logs: status?.logs,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Job status check failed', { jobId, model, error: err.message });
      res.status(500).json({ success: false, error: `Status check failed: ${err.message}` });
    }
  });

  /**
   * GET /api/gateway/jobs/:jobId/result
   * Get the result of a completed async job
   */
  router.get('/jobs/:jobId/result', async (req: Request, res: Response) => {
    const { jobId } = req.params;
    const model = req.query.model as string;

    if (!model) {
      return res.status(400).json({ success: false, error: 'Missing model query parameter' });
    }

    try {
      const result = await getQueueResult(jobId, model);

      // Settle x402 payment on result retrieval
      const x402Req = req as X402Request;
      if (x402Req.isX402Paid) {
        await settleX402Payment(x402Req);
      }

      res.json({
        success: true,
        jobId,
        result,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Job result fetch failed', { jobId, model, error: err.message });
      res.status(500).json({ success: false, error: `Result fetch failed: ${err.message}` });
    }
  });

  // ============================================
  // BATCH INVOCATION
  // ============================================

  /**
   * POST /api/gateway/batch
   * Invoke multiple tools in a single request
   * Useful for agent workflows that need multiple capabilities
   */
  router.post('/batch', async (req: Request, res: Response) => {
    const { invocations } = req.body as { invocations: Array<{ toolId: string; input: Record<string, unknown>; id?: string }> };

    if (!invocations || !Array.isArray(invocations) || invocations.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing or empty invocations array' });
    }

    if (invocations.length > 10) {
      return res.status(400).json({ success: false, error: 'Maximum 10 invocations per batch' });
    }

    // Validate all tools exist first
    for (const inv of invocations) {
      const tool = toolRegistry.get(inv.toolId);
      if (!tool) {
        return res.status(400).json({ success: false, error: `Tool not found: ${inv.toolId}` });
      }
      if (!tool.enabled) {
        return res.status(400).json({ success: false, error: `Tool disabled: ${inv.toolId}` });
      }
    }

    // Execute all invocations in parallel
    const results = await Promise.allSettled(
      invocations.map(async (inv) => {
        const tool = toolRegistry.get(inv.toolId)!;
        const price = toolRegistry.calculatePrice(inv.toolId, inv.input);

        if (tool.executionMode === 'sync') {
          const endpoint = `https://fal.run/${tool.falModel}`;
          const result = await falRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(inv.input),
          });
          return { id: inv.id || inv.toolId, toolId: inv.toolId, status: 'completed', result, pricing: price };
        } else {
          const queueResult = await submitToQueue(tool.falModel, inv.input) as { request_id?: string };
          return {
            id: inv.id || inv.toolId,
            toolId: inv.toolId,
            status: 'queued',
            job: {
              id: queueResult?.request_id,
              statusUrl: `/api/gateway/jobs/${queueResult?.request_id}?model=${encodeURIComponent(tool.falModel)}`,
              resultUrl: `/api/gateway/jobs/${queueResult?.request_id}/result?model=${encodeURIComponent(tool.falModel)}`,
            },
            pricing: price,
          };
        }
      })
    );

    const formattedResults = results.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return { id: invocations[i].id || invocations[i].toolId, toolId: invocations[i].toolId, status: 'failed', error: (r.reason as Error).message };
    });

    res.json({
      success: true,
      batchSize: invocations.length,
      results: formattedResults,
    });
  });

  // ============================================
  // ORCHESTRATION ENDPOINTS
  // ============================================

  /**
   * POST /api/gateway/orchestrate
   * Submit a natural language goal and let the orchestrator plan and execute it
   */
  router.post('/orchestrate', async (req: Request, res: Response) => {
    const { goal, context, planOnly } = req.body;

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing "goal" string in request body' });
    }

    try {
      if (planOnly) {
        // Just return the plan without executing
        const plan = await generatePlan(goal, context);
        return res.json({ success: true, plan });
      }

      // Plan and execute
      const result = await orchestrate(goal, context);
      return res.json(result);
    } catch (error) {
      const err = error as Error;
      logger.error('Orchestration failed', { goal, error: err.message });
      return res.status(500).json({ success: false, error: `Orchestration failed: ${err.message}` });
    }
  });

  /**
   * POST /api/gateway/orchestrate/plan
   * Generate a plan without executing (for agent review before committing)
   */
  router.post('/orchestrate/plan', async (req: Request, res: Response) => {
    const { goal, context } = req.body;

    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing "goal" string in request body' });
    }

    try {
      const plan = await generatePlan(goal, context);
      return res.json({ success: true, plan });
    } catch (error) {
      const err = error as Error;
      return res.status(500).json({ success: false, error: `Plan generation failed: ${err.message}` });
    }
  });

  /**
   * POST /api/gateway/orchestrate/execute
   * Execute a previously generated plan (pass the plan object)
   */
  router.post('/orchestrate/execute', async (req: Request, res: Response) => {
    const { plan } = req.body;

    if (!plan || !plan.steps || !Array.isArray(plan.steps)) {
      return res.status(400).json({ success: false, error: 'Missing valid "plan" object with steps array' });
    }

    try {
      const result = await executePlan(plan);
      return res.json(result);
    } catch (error) {
      const err = error as Error;
      return res.status(500).json({ success: false, error: `Plan execution failed: ${err.message}` });
    }
  });

  /**
   * GET /api/gateway/workflows
   * List available pre-built workflow templates
   */
  router.get('/workflows', (_req: Request, res: Response) => {
    const workflows = Object.entries(WORKFLOW_TEMPLATES).map(([id, factory]) => {
      const sample = factory({});
      return {
        id,
        goal: sample.goal,
        stepCount: sample.steps.length,
        estimatedCredits: sample.estimatedCredits,
        estimatedDurationSeconds: sample.estimatedDurationSeconds,
        steps: sample.steps.map(s => ({ toolId: s.toolId, toolName: s.toolName, description: s.description })),
      };
    });

    res.json({ success: true, workflows });
  });

  /**
   * POST /api/gateway/workflows/:workflowId
   * Execute a pre-built workflow template
   */
  router.post('/workflows/:workflowId', async (req: Request, res: Response) => {
    const { workflowId } = req.params;
    const template = WORKFLOW_TEMPLATES[workflowId];

    if (!template) {
      return res.status(404).json({ success: false, error: `Workflow not found: ${workflowId}`, available: Object.keys(WORKFLOW_TEMPLATES) });
    }

    try {
      const plan = template(req.body);
      const result = await executePlan(plan);
      return res.json(result);
    } catch (error) {
      const err = error as Error;
      return res.status(500).json({ success: false, error: `Workflow execution failed: ${err.message}` });
    }
  });

  // ============================================
  // WEBHOOK BACKGROUND POLLING (for async jobs)
  // ============================================

  /**
   * Poll a queue-based job and deliver the result via webhook when complete
   * Runs in the background - does not block the API response
   */
  async function pollAndDeliverWebhook(
    jobId: string,
    model: string,
    toolId: string,
    toolName: string,
    requestId: string,
    webhookUrl: string,
    webhookSecret: string | undefined,
    pricing: unknown
  ): Promise<void> {
    const maxPollTime = 10 * 60 * 1000; // 10 minutes max
    const pollInterval = 3000; // 3 seconds
    const startTime = Date.now();

    try {
      while (Date.now() - startTime < maxPollTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const status = await checkQueueStatus(jobId, model) as { status?: string };

        if (isStatusCompleted(status?.status)) {
          // Job completed - fetch result and deliver webhook
          const result = await getQueueResult(jobId, model);
          sendGenerationWebhook(
            webhookUrl,
            webhookSecret,
            'generation.completed',
            requestId,
            { toolId, toolName, jobId, result, pricing },
            toolId
          );
          logger.info('Webhook delivered for completed async job', { jobId, toolId, requestId });
          return;
        }

        if (isStatusFailed(status?.status)) {
          // Job failed - deliver failure webhook
          sendGenerationWebhook(
            webhookUrl,
            webhookSecret,
            'generation.failed',
            requestId,
            { toolId, toolName, jobId, error: 'Generation failed', status: status?.status },
            toolId
          );
          logger.warn('Webhook delivered for failed async job', { jobId, toolId, requestId });
          return;
        }
      }

      // Timeout - deliver timeout webhook
      sendGenerationWebhook(
        webhookUrl,
        webhookSecret,
        'generation.failed',
        requestId,
        { toolId, toolName, jobId, error: 'Polling timeout exceeded (10 minutes)' },
        toolId
      );
      logger.warn('Async job polling timed out', { jobId, toolId, requestId });

    } catch (error) {
      const err = error as Error;
      logger.error('Webhook polling error', { jobId, toolId, error: err.message });
      sendGenerationWebhook(
        webhookUrl,
        webhookSecret,
        'generation.failed',
        requestId,
        { toolId, toolName, jobId, error: `Polling error: ${err.message}` },
        toolId
      );
    }
  }

  // ============================================
  // AGENT-SCOPED ENDPOINTS
  // ============================================

  /**
   * GET /api/gateway/agents
   * Machine-readable agent discovery — list all custom agents with invoke URLs
   */
  router.get('/agents', async (req: Request, res: Response) => {
    try {
      const agents = await getAllCustomAgents();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      res.json({
        success: true,
        gateway: 'seisoai',
        agentCount: agents.length,
        agents: agents.map(a => ({
          agentId: a.agentId,
          name: a.name,
          description: a.description,
          type: a.type,
          tools: a.tools,
          owner: a.owner,
          createdAt: a.createdAt,
          invokeUrl: `${baseUrl}/api/gateway/agent/${a.agentId}/invoke`,
          orchestrateUrl: `${baseUrl}/api/gateway/agent/${a.agentId}/orchestrate`,
          mcpManifestUrl: `${baseUrl}/api/gateway/agent/${a.agentId}/mcp-manifest`,
          infoUrl: `${baseUrl}/api/gateway/agent/${a.agentId}`,
          x402Supported: true,
        })),
        protocols: {
          x402: { supported: true, network: 'eip155:8453', asset: 'USDC' },
          mcp: { supported: true, endpoint: '/api/mcp' },
        },
      });
    } catch (error) {
      logger.error('Gateway agents listing failed', { error });
      res.status(500).json({ success: false, error: 'Failed to list agents' });
    }
  });

  /**
   * GET /api/gateway/agent/:agentId
   * Canonical agent info — single machine-readable contract for callers
   */
  router.get('/agent/:agentId', async (req: Request, res: Response) => {
    const agent = await getCustomAgentById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: `Agent not found: ${req.params.agentId}` });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const agentTools = agent.tools
      .map(tid => toolRegistry.get(tid))
      .filter(Boolean)
      .map(t => ({
        id: t!.id,
        name: t!.name,
        description: t!.description,
        category: t!.category,
        inputSchema: t!.inputSchema,
        pricing: {
          baseUsd: t!.pricing.baseUsdCost * t!.pricing.markup,
          credits: t!.pricing.credits,
        },
      }));

    res.json({
      success: true,
      agent: {
        agentId: agent.agentId,
        name: agent.name,
        description: agent.description,
        type: agent.type,
        owner: agent.owner,
        createdAt: agent.createdAt,
        toolCount: agent.tools.length,
        tools: agentTools,
        endpoints: {
          invokeUrl: `${baseUrl}/api/gateway/agent/${agent.agentId}/invoke`,
          orchestrateUrl: `${baseUrl}/api/gateway/agent/${agent.agentId}/orchestrate`,
          mcpManifestUrl: `${baseUrl}/api/gateway/agent/${agent.agentId}/mcp-manifest`,
        },
        x402: {
          supported: true,
          network: 'eip155:8453',
          asset: 'USDC',
          description: 'Pay per request with USDC on Base. Include payment-signature header.',
        },
        agentURI: agent.agentURI,
      },
    });
  });

  /**
   * GET /api/gateway/agent/:agentId/mcp-manifest
   * Per-agent MCP manifest — only this agent's tools
   */
  router.get('/agent/:agentId/mcp-manifest', async (req: Request, res: Response) => {
    const agent = await getCustomAgentById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: `Agent not found: ${req.params.agentId}` });
    }

    const toolSet = new Set(agent.tools);
    const allMcpTools = toolRegistry.toMCPTools();
    const agentMcpTools = allMcpTools.filter(t => toolSet.has(t.name));

    res.json({
      name: `seisoai-agent-${agent.agentId}`,
      version: '1.0.0',
      description: `${agent.name} — ${agent.description}`,
      agentId: agent.agentId,
      tools: agentMcpTools,
    });
  });

  /**
   * POST /api/gateway/agent/:agentId/invoke
   * Agent-scoped tool invocation — 402 or API key required
   * Body: { toolId, ...input } or use /invoke/:toolId
   */
  router.post('/agent/:agentId/invoke/:toolId?', async (req: Request, res: Response) => {
    const agent = await getCustomAgentById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: `Agent not found: ${req.params.agentId}` });
    }

    const toolId = req.params.toolId || req.body.toolId;
    if (!toolId) {
      return res.status(400).json({ success: false, error: 'Missing toolId in URL or request body' });
    }

    // Ensure tool belongs to this agent
    if (!agent.tools.includes(toolId)) {
      return res.status(400).json({
        success: false,
        error: `Tool ${toolId} is not part of agent ${agent.name}`,
        availableTools: agent.tools,
      });
    }

    const tool = toolRegistry.get(toolId);
    if (!tool) {
      return res.status(404).json({ success: false, error: `Tool not found: ${toolId}` });
    }
    if (!tool.enabled) {
      return res.status(503).json({ success: false, error: `Tool is currently disabled: ${toolId}` });
    }

    // Extract webhook URL from body or API key config
    const { webhookUrl: bodyWebhookUrl, toolId: _bodyToolId, ...input } = req.body;
    const webhookUrl = bodyWebhookUrl || (req as any).apiKey?.webhookUrl;
    const webhookSecret = (req as any).apiKey?.webhookSecret;
    const requestId = (req as any).requestId || `ag-${agent.agentId}-${Date.now()}`;

    // Validate required fields
    const missingFields = tool.inputSchema.required.filter((field: string) => !(field in input));
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`,
        schema: tool.inputSchema,
      });
    }

    // Deduct API key credits if authenticated via API key
    if ((req as any).isApiKeyAuth && (req as any).apiKey) {
      const price = toolRegistry.calculatePrice(toolId, input);
      const creditsNeeded = price?.credits || tool.pricing.credits;
      if ((req as any).apiKey.credits < creditsNeeded) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient API key credits',
          required: creditsNeeded,
          available: (req as any).apiKey.credits,
        });
      }
    }

    const price = toolRegistry.calculatePrice(toolId, input);

    logger.info('Agent-scoped invoke', {
      agentId: agent.agentId,
      agentName: agent.name,
      toolId,
      executionMode: tool.executionMode,
      requestId,
      price,
    });

    try {
      if (tool.executionMode === 'sync') {
        const endpoint = `https://fal.run/${tool.falModel}`;
        const result = await falRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(input),
        });

        // Settle x402 payment if applicable
        const x402Req = req as X402Request;
        if (x402Req.isX402Paid) {
          await settleX402Payment(x402Req);
        }

        if (webhookUrl) {
          sendGenerationWebhook(webhookUrl, webhookSecret, 'generation.completed', requestId, {
            agentId: agent.agentId, agentName: agent.name, toolId, toolName: tool.name, result, pricing: price,
          }, toolId);
        }

        return res.json({
          success: true,
          agentId: agent.agentId,
          agentName: agent.name,
          toolId,
          toolName: tool.name,
          executionMode: 'sync',
          requestId,
          result,
          pricing: price,
        });
      } else {
        const queueResult = await submitToQueue(tool.falModel, input) as { request_id?: string };
        if (!queueResult?.request_id) {
          throw new Error('No request_id returned from queue submission');
        }

        if (webhookUrl) {
          pollAndDeliverWebhook(queueResult.request_id, tool.falModel, toolId, tool.name, requestId, webhookUrl, webhookSecret, price);
        }

        return res.json({
          success: true,
          agentId: agent.agentId,
          agentName: agent.name,
          toolId,
          toolName: tool.name,
          executionMode: 'queue',
          requestId,
          job: {
            id: queueResult.request_id,
            model: tool.falModel,
            status: 'IN_QUEUE',
            statusUrl: `/api/gateway/jobs/${queueResult.request_id}?model=${encodeURIComponent(tool.falModel)}`,
            resultUrl: `/api/gateway/jobs/${queueResult.request_id}/result?model=${encodeURIComponent(tool.falModel)}`,
          },
          pricing: price,
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Agent-scoped invoke failed', { agentId: agent.agentId, toolId, error: err.message, requestId });

      if (webhookUrl) {
        sendGenerationWebhook(webhookUrl, webhookSecret, 'generation.failed', requestId, {
          agentId: agent.agentId, toolId, error: err.message,
        }, toolId);
      }

      return res.status(500).json({
        success: false,
        error: `Tool invocation failed: ${err.message}`,
        agentId: agent.agentId,
        toolId,
      });
    }
  });

  /**
   * POST /api/gateway/agent/:agentId/orchestrate
   * Agent-scoped orchestration — restricts to agent's tools only
   * Body: { goal: string, context?: object, planOnly?: boolean }
   */
  router.post('/agent/:agentId/orchestrate', async (req: Request, res: Response) => {
    const agent = await getCustomAgentById(req.params.agentId);
    if (!agent) {
      return res.status(404).json({ success: false, error: `Agent not found: ${req.params.agentId}` });
    }

    const { goal, context, planOnly } = req.body;
    if (!goal || typeof goal !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing "goal" string in request body' });
    }

    // Build context that restricts to this agent's tools
    const agentContext = {
      ...context,
      allowedTools: agent.tools,
      agentId: agent.agentId,
      agentName: agent.name,
    };

    try {
      if (planOnly) {
        const plan = await generatePlan(goal, agentContext);
        return res.json({ success: true, agentId: agent.agentId, agentName: agent.name, plan });
      }

      const result = await orchestrate(goal, agentContext);

      // Settle x402 payment if applicable
      const x402Req = req as X402Request;
      if (x402Req.isX402Paid) {
        await settleX402Payment(x402Req);
      }

      return res.json({ agentId: agent.agentId, agentName: agent.name, ...result });
    } catch (error) {
      const err = error as Error;
      logger.error('Agent-scoped orchestration failed', { agentId: agent.agentId, goal, error: err.message });
      return res.status(500).json({
        success: false,
        error: `Orchestration failed: ${err.message}`,
        agentId: agent.agentId,
      });
    }
  });

  // ============================================
  // GATEWAY INFO
  // ============================================

  /**
   * GET /api/gateway
   * Gateway overview and capabilities
   */
  router.get('/', (_req: Request, res: Response) => {
    const tools = toolRegistry.getEnabled();
    const categories = toolRegistry.getCategories();

    res.json({
      name: 'SeisoAI Agentic Gateway',
      version: '1.0.0',
      description: 'The home of agentic inference. Unified AI gateway for image, video, music, audio, 3D, and text generation.',
      toolCount: tools.length,
      categories: categories.map(c => ({ name: c.category, count: c.count })),
      endpoints: {
        discovery: {
          tools: 'GET /api/gateway/tools',
          toolDetail: 'GET /api/gateway/tools/:toolId',
          pricing: 'GET /api/gateway/price/:toolId',
          schema: 'GET /api/gateway/schema',
          mcpManifest: 'GET /api/gateway/mcp-manifest',
          agents: 'GET /api/gateway/agents',
        },
        invocation: {
          invoke: 'POST /api/gateway/invoke/:toolId',
          invokeWithBody: 'POST /api/gateway/invoke',
          batch: 'POST /api/gateway/batch',
        },
        agents: {
          list: 'GET /api/gateway/agents',
          info: 'GET /api/gateway/agent/:agentId',
          invoke: 'POST /api/gateway/agent/:agentId/invoke/:toolId',
          orchestrate: 'POST /api/gateway/agent/:agentId/orchestrate',
          mcpManifest: 'GET /api/gateway/agent/:agentId/mcp-manifest',
        },
        jobs: {
          status: 'GET /api/gateway/jobs/:jobId?model=...',
          result: 'GET /api/gateway/jobs/:jobId/result?model=...',
        },
      },
      protocols: {
        mcp: {
          supported: true,
          transport: 'sse',
          endpoint: '/api/mcp',
          description: 'Model Context Protocol for AI assistants (Claude, Cursor, etc.)',
        },
        x402: {
          supported: true,
          network: 'eip155:8453',
          asset: 'USDC',
          description: 'Pay-per-request with USDC on Base. Include payment-signature header.',
        },
        erc8004: {
          supported: true,
          standard: 'ERC-8004',
          description: 'On-chain agent identity, reputation, and provenance.',
        },
      },
      authentication: {
        methods: ['x402-payment', 'jwt-bearer', 'api-key'],
        description: 'Use x402 for pay-per-request, JWT for authenticated users, or API key for registered agents.',
      },
    });
  });

  return router;
}
