/**
 * MCP (Model Context Protocol) Server
 * Exposes all SeisoAI AI inference tools via the MCP protocol.
 * 
 * This allows AI assistants (Claude, Cursor, ChatGPT, etc.) to:
 * - Discover all available AI tools
 * - Invoke tools with structured input
 * - Monitor async job status
 * 
 * Transport: SSE (Server-Sent Events) for HTTP-based MCP
 * Mount at: /api/mcp
 */
import type { Request, Response, Router } from 'express';
import { Router as ExpressRouter } from 'express';
import mongoose from 'mongoose';
import { toolRegistry } from './toolRegistry';
import { falRequest, submitToQueue, checkQueueStatus, getQueueResult, isStatusCompleted, isStatusFailed } from './fal';
import { executePlan, orchestrate, WORKFLOW_TEMPLATES } from './orchestrator';
import { authenticateApiKey } from '../middleware/apiKeyAuth';
import type { IApiKey } from '../models/ApiKey';
import logger from '../utils/logger';

// ============================================
// MCP Protocol Types
// ============================================

interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ============================================
// MCP Handler
// ============================================

/** Auth context passed through from Express middleware */
interface MCPAuthContext {
  apiKey?: IApiKey;
  isApiKeyAuth?: boolean;
}

/**
 * Deduct credits from an API key atomically.
 * Returns updated key or null if insufficient credits.
 */
async function deductCredits(apiKey: IApiKey, credits: number): Promise<IApiKey | null> {
  try {
    const ApiKey = mongoose.model<IApiKey>('ApiKey');
    return await ApiKey.findOneAndUpdate(
      { _id: apiKey._id, credits: { $gte: credits } },
      { $inc: { credits: -credits, totalCreditsSpent: credits } },
      { new: true },
    );
  } catch {
    return null;
  }
}

/**
 * Handle an MCP JSON-RPC request and return a response
 */
async function handleMCPRequest(request: MCPRequest, auth?: MCPAuthContext): Promise<MCPResponse> {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'seisoai-gateway',
              version: '1.0.0',
            },
          },
        };

      case 'tools/list': {
        const mcpTools = toolRegistry.toMCPTools();
        // Add orchestration meta-tool
        const templateNames = Object.keys(WORKFLOW_TEMPLATES);
        mcpTools.push({
          name: 'orchestrate',
          description: `Multi-step workflow orchestrator. Give it a natural language goal and it plans & executes a sequence of AI tools automatically. Available templates: ${templateNames.join(', ')}. Cost depends on tools used.`,
          inputSchema: {
            type: 'object',
            properties: {
              goal: { type: 'string', description: 'Natural language description of the creative goal' },
              template: { type: 'string', description: `Optional workflow template: ${templateNames.join(', ')}` },
              params: { type: 'object', description: 'Template parameters (if using a template)' },
            },
            required: ['goal'],
          },
        });
        return {
          jsonrpc: '2.0',
          id,
          result: { tools: mcpTools },
        };
      }

      case 'tools/call':
        return await handleToolCall(id, params as { name: string; arguments: Record<string, unknown> }, auth);

      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };

      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  } catch (error) {
    const err = error as Error;
    logger.error('MCP request handler error', { method, error: err.message });
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Internal error: ${err.message}`,
      },
    };
  }
}

/**
 * Handle a tool call via MCP
 */
async function handleToolCall(
  id: string | number,
  params: { name: string; arguments: Record<string, unknown> },
  auth?: MCPAuthContext,
): Promise<MCPResponse> {
  const { name: toolId, arguments: input } = params;

  // Handle orchestration meta-tool
  if (toolId === 'orchestrate') {
    try {
      const { goal, template, params: tplParams } = input as {
        goal: string;
        template?: string;
        params?: Record<string, unknown>;
      };

      if (!goal) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing required field: goal' } };
      }

      let result;
      if (template && WORKFLOW_TEMPLATES[template]) {
        const plan = WORKFLOW_TEMPLATES[template](tplParams || {});
        plan.goal = goal;
        result = await executePlan(plan);
      } else {
        result = await orchestrate(goal);
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: result.success,
              goal: result.goal,
              totalCredits: result.totalCredits,
              totalDurationMs: result.totalDurationMs,
              steps: result.stepResults.map(s => ({
                stepId: s.stepId,
                toolId: s.toolId,
                status: s.status,
                durationMs: s.durationMs,
                error: s.error,
              })),
              finalOutput: result.finalOutput,
            }, null, 2),
          }],
        },
      };
    } catch (error) {
      const err = error as Error;
      logger.error('MCP orchestration failed', { error: err.message });
      return { jsonrpc: '2.0', id, error: { code: -32603, message: `Orchestration failed: ${err.message}` } };
    }
  }

  const tool = toolRegistry.get(toolId);
  if (!tool) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: `Unknown tool: ${toolId}. Use tools/list to see available tools.`,
      },
    };
  }

  if (!tool.enabled) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Tool is currently disabled: ${toolId}`,
      },
    };
  }

  // Validate input against tool's JSON Schema
  const validation = toolRegistry.validateInput(toolId, input);
  if (!validation.valid) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: `Invalid input: ${validation.errors.join('; ')}`,
        data: { validationErrors: validation.errors, schema: tool.inputSchema },
      },
    };
  }

  // Credit check and deduction for API key authenticated requests
  const price = toolRegistry.calculatePrice(toolId, input);
  const creditsNeeded = price?.credits || tool.pricing.credits;

  if (auth?.isApiKeyAuth && auth.apiKey) {
    if (auth.apiKey.credits < creditsNeeded) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: `Insufficient credits. Need ${creditsNeeded}, have ${auth.apiKey.credits}`,
          data: { required: creditsNeeded, available: auth.apiKey.credits },
        },
      };
    }

    const updated = await deductCredits(auth.apiKey, creditsNeeded);
    if (!updated) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32000,
          message: 'Credit deduction failed (race condition)',
        },
      };
    }
    auth.apiKey = updated;
  }

  logger.info('MCP tool call', { toolId, executionMode: tool.executionMode, credits: creditsNeeded, hasAuth: !!auth?.isApiKeyAuth });

  try {
    if (tool.executionMode === 'sync') {
      // Sync: call and return immediately
      const endpoint = `https://fal.run/${tool.falModel}`;
      const result = await falRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(input),
      });

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        },
      };
    } else {
      // Queue: submit and poll until complete (with timeout)
      const queueResult = await submitToQueue(tool.falModel, input) as { request_id?: string };
      if (!queueResult?.request_id) {
        throw new Error('No request_id returned from queue submission');
      }

      const jobId = queueResult.request_id;
      const maxWaitMs = 300_000; // 5 minutes max
      const pollIntervalMs = 3_000; // 3 seconds
      const startTime = Date.now();

      // Poll for completion
      while (Date.now() - startTime < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

        const status = await checkQueueStatus(jobId, tool.falModel) as { status?: string };

        if (isStatusCompleted(status?.status)) {
          const result = await getQueueResult(jobId, tool.falModel);
          return {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
            },
          };
        }

        if (isStatusFailed(status?.status)) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32603,
              message: `Tool execution failed with status: ${status?.status}`,
              data: { jobId, status },
            },
          };
        }
      }

      // Timeout - return job info so agent can check later
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'PROCESSING',
                message: 'Job is still processing. Use the gateway API to check status.',
                jobId,
                statusUrl: `/api/gateway/jobs/${jobId}?model=${encodeURIComponent(tool.falModel)}`,
                resultUrl: `/api/gateway/jobs/${jobId}/result?model=${encodeURIComponent(tool.falModel)}`,
              }, null, 2),
            },
          ],
        },
      };
    }
  } catch (error) {
    const err = error as Error;
    logger.error('MCP tool call failed', { toolId, error: err.message });
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: `Tool execution failed: ${err.message}`,
      },
    };
  }
}

// ============================================
// SSE Transport
// ============================================

/**
 * Create MCP router with SSE transport
 * Mounts at /api/mcp
 */
export function createMCPRoutes(): Router {
  const router = ExpressRouter();

  // Active SSE connections for message-based transport
  const connections = new Map<string, Response>();

  // Apply API key authentication to all MCP routes (optional — falls through if no key)
  router.use(authenticateApiKey);

  /**
   * GET /api/mcp/sse
   * SSE endpoint for MCP communication
   * Client connects here and sends messages via POST /api/mcp/message
   */
  router.get('/sse', (req: Request, res: Response) => {
    const sessionId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Store connection
    connections.set(sessionId, res);
    logger.info('MCP SSE connection opened', { sessionId });

    // Send the endpoint URL for the client to send messages to
    const messageEndpoint = `/api/mcp/message?sessionId=${sessionId}`;
    res.write(`event: endpoint\ndata: ${messageEndpoint}\n\n`);

    // Keepalive
    const keepalive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 30_000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(keepalive);
      connections.delete(sessionId);
      logger.info('MCP SSE connection closed', { sessionId });
    });
  });

  /**
   * POST /api/mcp/message
   * Receive MCP JSON-RPC messages from the client
   * Responses are sent back via the SSE connection
   */
  router.post('/message', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId query parameter' });
    }

    const sseConnection = connections.get(sessionId);
    if (!sseConnection) {
      return res.status(404).json({ error: 'SSE connection not found. Connect to /api/mcp/sse first.' });
    }

    const mcpRequest = req.body as MCPRequest;

    // Handle notification (no id = notification, no response needed)
    if (!mcpRequest.id && mcpRequest.method) {
      // Handle notifications like 'notifications/initialized'
      logger.info('MCP notification received', { method: mcpRequest.method, sessionId });
      return res.status(202).json({ accepted: true });
    }

    // Build auth context from Express middleware
    const auth: MCPAuthContext = {
      apiKey: req.apiKey,
      isApiKeyAuth: req.isApiKeyAuth,
    };

    // Handle request with auth context
    const response = await handleMCPRequest(mcpRequest, auth);

    // Send response via SSE
    sseConnection.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);

    // Acknowledge receipt via HTTP
    res.status(202).json({ accepted: true });
  });

  /**
   * POST /api/mcp
   * Direct JSON-RPC endpoint (simpler alternative to SSE)
   * For clients that prefer request-response over streaming
   */
  router.post('/', async (req: Request, res: Response) => {
    const mcpRequest = req.body as MCPRequest;

    if (!mcpRequest.jsonrpc || !mcpRequest.method) {
      return res.status(400).json({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid JSON-RPC request' },
      });
    }

    // Handle notification
    if (!mcpRequest.id) {
      return res.status(202).json({ accepted: true });
    }

    const auth: MCPAuthContext = {
      apiKey: req.apiKey,
      isApiKeyAuth: req.isApiKeyAuth,
    };

    const response = await handleMCPRequest(mcpRequest, auth);
    res.json(response);
  });

  /**
   * GET /api/mcp
   * MCP server info
   */
  router.get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'seisoai-gateway',
      version: '1.0.0',
      description: 'SeisoAI Agentic Inference Gateway - MCP Server',
      protocol: 'MCP (Model Context Protocol)',
      protocolVersion: '2024-11-05',
      transport: {
        sse: {
          connect: '/api/mcp/sse',
          message: '/api/mcp/message?sessionId=...',
        },
        jsonrpc: {
          endpoint: '/api/mcp',
        },
      },
      capabilities: {
        tools: true,
        toolCount: toolRegistry.getEnabled().length,
      },
    });
  });

  return router;
}

export default { createMCPRoutes, handleMCPRequest };
