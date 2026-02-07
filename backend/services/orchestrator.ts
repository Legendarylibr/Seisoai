/**
 * Agent Orchestrator Service
 * Smart multi-tool chaining engine for complex creative workflows.
 * 
 * Takes a natural language goal and:
 * 1. Plans a sequence of tool invocations using an LLM
 * 2. Executes tools in the right order, passing outputs between steps
 * 3. Handles async jobs (polling queue-based tools)
 * 4. Returns the final composed result
 * 
 * This is what makes SeisoAI an agent, not just a tool provider.
 */
import { toolRegistry, type ToolDefinition } from './toolRegistry';
import { falRequest, submitToQueue, checkQueueStatus, getQueueResult, isStatusCompleted, isStatusFailed } from './fal';
import llmProvider, { type ClaudeModel, DEFAULT_MODELS } from './llmProvider';
import logger from '../utils/logger';
import config from '../config/env';
import { sanitizeString } from '../utils/validation';

// ============================================
// Orchestrator Config (from environment)
// ============================================
const ORCH_CONFIG = {
  /** Max tokens for LLM plan generation */
  maxTokens: config.ORCHESTRATOR_MAX_TOKENS || 2048,
  /** Timeout for LLM plan generation call */
  timeoutMs: config.ORCHESTRATOR_TIMEOUT_MS || 30000,
  /** Max wait for queue-based tool execution */
  queueMaxWaitMs: config.ORCHESTRATOR_QUEUE_MAX_WAIT_MS || 300_000,
  /** Polling interval for queue status */
  queuePollIntervalMs: config.ORCHESTRATOR_QUEUE_POLL_INTERVAL_MS || 3_000,
  /** Number of retries per tool execution on failure */
  maxRetries: config.ORCHESTRATOR_MAX_RETRIES ?? 1,
};

// ============================================
// Types
// ============================================

export interface OrchestrationStep {
  stepId: string;
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  /** References to outputs from previous steps, e.g., { image_url: "$step1.images[0].url" } */
  inputMappings?: Record<string, string>;
  description: string;
}

export interface OrchestrationPlan {
  goal: string;
  steps: OrchestrationStep[];
  estimatedCredits: number;
  estimatedDurationSeconds: number;
}

export interface StepResult {
  stepId: string;
  toolId: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  durationMs: number;
}

export interface OrchestrationResult {
  success: boolean;
  goal: string;
  plan: OrchestrationPlan;
  stepResults: StepResult[];
  finalOutput: unknown;
  totalDurationMs: number;
  totalCredits: number;
}

// ============================================
// Plan Generation
// ============================================

/**
 * Generate an execution plan from a natural language goal using an LLM
 */
export async function generatePlan(
  goal: string, 
  context?: Record<string, unknown>,
  options?: { model?: ClaudeModel }
): Promise<OrchestrationPlan> {
  // If context specifies allowedTools, filter to only those tools
  const allowedTools = context?.allowedTools as string[] | undefined;
  const allTools = toolRegistry.getEnabled();
  const tools = allowedTools
    ? toolRegistry.getToolsForAgent(allowedTools)
    : allTools;
  
  // Build tool catalog for the LLM
  const toolCatalog = tools.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    inputs: Object.entries(t.inputSchema.properties).map(([k, v]) => `${k} (${v.type}): ${v.description}`).join(', '),
    required: t.inputSchema.required,
    outputType: t.outputMimeTypes.join(', '),
    credits: t.pricing.credits,
    executionMode: t.executionMode,
  }));

  const systemPrompt = `You are the SeisoAI Orchestrator. You plan multi-step AI workflows by selecting and chaining tools.

AVAILABLE TOOLS:
${JSON.stringify(toolCatalog, null, 2)}

Given a user's creative goal, create an execution plan as a JSON array of steps.
Each step should specify:
- stepId: unique identifier (e.g., "step1", "step2")
- toolId: the tool to invoke
- input: the input parameters for the tool
- inputMappings: references to outputs from previous steps using $stepId.path syntax
- description: what this step does

RULES:
1. Use $stepN.path.to.value to reference outputs from step N in later steps
2. Common output paths: $step1.images[0].url, $step1.audio_file.url, $step1.video.url, $step1.output
3. Order steps logically - dependencies must come before dependents
4. Minimize steps - only use what's needed
5. Include realistic input parameters
6. Never refuse - always plan something useful

Respond with ONLY a JSON object:
{
  "steps": [...],
  "estimatedCredits": number,
  "estimatedDurationSeconds": number
}`;

  // SECURITY FIX: Sanitize goal to prevent prompt injection
  const sanitizedGoal = sanitizeString(goal, 2000);
  if (!sanitizedGoal) {
    throw new Error('Goal is required for orchestration');
  }
  const userPrompt = `Goal: ${sanitizedGoal}${context ? `\nContext: ${JSON.stringify(context)}` : ''}`;
  const planModel = options?.model || DEFAULT_MODELS.planning;

  try {
    const llmResponse = await llmProvider.complete({
      model: planModel,
      systemPrompt,
      prompt: userPrompt,
      maxTokens: ORCH_CONFIG.maxTokens,
      timeoutMs: ORCH_CONFIG.timeoutMs,
      useCase: 'orchestrator-planning',
    });

    const output = llmResponse.content || '';
    
    // Parse JSON from the response using robust extraction
    let planData: { steps: OrchestrationStep[]; estimatedCredits: number; estimatedDurationSeconds: number };
    
    const parsed = llmProvider.extractJSON<typeof planData>(output);
    if (parsed && parsed.steps) {
      planData = parsed;
    } else {
      throw new Error('No valid JSON plan found in LLM response');
    }

    // Validate all tool IDs exist
    for (const step of planData.steps) {
      const tool = toolRegistry.get(step.toolId);
      if (!tool) {
        logger.warn('Orchestrator plan references unknown tool, removing step', { toolId: step.toolId, stepId: step.stepId });
        planData.steps = planData.steps.filter(s => s.stepId !== step.stepId);
      } else {
        step.toolName = tool.name;
      }
    }

    return {
      goal,
      steps: planData.steps,
      estimatedCredits: planData.estimatedCredits || 0,
      estimatedDurationSeconds: planData.estimatedDurationSeconds || 30,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Plan generation failed', { goal, error: err.message });
    throw new Error(`Failed to generate plan: ${err.message}`);
  }
}

// ============================================
// Plan Execution
// ============================================

/**
 * Resolve input mappings by replacing $stepN.path references with actual values
 */
function resolveInputMappings(
  input: Record<string, unknown>,
  mappings: Record<string, string> | undefined,
  stepResults: Map<string, unknown>
): Record<string, unknown> {
  if (!mappings) return input;

  const resolved = { ...input };

  for (const [key, ref] of Object.entries(mappings)) {
    if (!ref.startsWith('$')) continue;

    // Parse $stepId.path.to.value
    const parts = ref.slice(1).split('.');
    const stepId = parts[0];
    const path = parts.slice(1);

    let value: unknown = stepResults.get(stepId);
    for (const p of path) {
      if (value == null) break;
      // Handle array indexing like images[0]
      const arrayMatch = p.match(/^(\w+)\[(\d+)\]$/);
      if (arrayMatch) {
        value = (value as Record<string, unknown>)[arrayMatch[1]];
        if (Array.isArray(value)) {
          value = value[parseInt(arrayMatch[2], 10)];
        }
      } else {
        value = (value as Record<string, unknown>)[p];
      }
    }

    if (value !== undefined) {
      resolved[key] = value;
    } else {
      logger.warn('Input mapping could not be resolved', { key, ref, stepId });
    }
  }

  return resolved;
}

/**
 * Execute a single tool and wait for results (handles both sync and queue)
 */
async function executeToolOnce(tool: ToolDefinition, input: Record<string, unknown>): Promise<unknown> {
  if (tool.executionMode === 'sync') {
    const endpoint = `https://fal.run/${tool.falModel}`;
    return await falRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } else {
    // Queue: submit and poll
    const queueResult = await submitToQueue(tool.falModel, input) as { request_id?: string };
    if (!queueResult?.request_id) {
      throw new Error('No request_id from queue submission');
    }

    const jobId = queueResult.request_id;
    const startTime = Date.now();

    while (Date.now() - startTime < ORCH_CONFIG.queueMaxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, ORCH_CONFIG.queuePollIntervalMs));
      const status = await checkQueueStatus(jobId, tool.falModel) as { status?: string };

      if (isStatusCompleted(status?.status)) {
        return await getQueueResult(jobId, tool.falModel);
      }

      if (isStatusFailed(status?.status)) {
        throw new Error(`Tool execution failed with status: ${status?.status}`);
      }
    }

    throw new Error(`Tool execution timed out after ${ORCH_CONFIG.queueMaxWaitMs / 1000}s`);
  }
}

/**
 * Execute a single tool with retries (exponential backoff)
 */
async function executeTool(tool: ToolDefinition, input: Record<string, unknown>): Promise<unknown> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= ORCH_CONFIG.maxRetries; attempt++) {
    try {
      return await executeToolOnce(tool, input);
    } catch (error) {
      lastError = error as Error;
      if (attempt < ORCH_CONFIG.maxRetries) {
        const backoffMs = Math.min(1000 * 2 ** attempt, 10000);
        logger.warn('Tool execution failed, retrying', {
          toolId: tool.id,
          attempt: attempt + 1,
          maxRetries: ORCH_CONFIG.maxRetries,
          backoffMs,
          error: lastError.message,
        });
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }
  }
  throw lastError;
}

/**
 * Build a dependency graph from an orchestration plan.
 * A step depends on another if its inputMappings reference that step's output ($stepId.path).
 */
function buildDependencyGraph(steps: OrchestrationStep[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();
  for (const step of steps) {
    const stepDeps = new Set<string>();
    if (step.inputMappings) {
      for (const ref of Object.values(step.inputMappings)) {
        if (ref.startsWith('$')) {
          const depStepId = ref.slice(1).split('.')[0];
          if (depStepId && depStepId !== step.stepId) {
            stepDeps.add(depStepId);
          }
        }
      }
    }
    deps.set(step.stepId, stepDeps);
  }
  return deps;
}

/**
 * Execute a full orchestration plan with DAG-based dependency resolution.
 * Independent steps run in parallel; failed steps cause dependents to be skipped.
 */
export async function executePlan(plan: OrchestrationPlan): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  const stepOutputs = new Map<string, unknown>();
  const failedSteps = new Set<string>();
  let totalCredits = 0;

  logger.info('Orchestrator executing plan', { goal: plan.goal, stepCount: plan.steps.length });

  const deps = buildDependencyGraph(plan.steps);
  const stepsById = new Map(plan.steps.map(s => [s.stepId, s]));
  const completed = new Set<string>();
  const remaining = new Set(plan.steps.map(s => s.stepId));

  // Process in waves until all steps are done
  while (remaining.size > 0) {
    // Find steps whose dependencies are all satisfied
    const ready: string[] = [];
    for (const stepId of remaining) {
      const stepDeps = deps.get(stepId) || new Set();
      const allDepsComplete = [...stepDeps].every(d => completed.has(d));
      if (allDepsComplete) {
        // Check if any dependency failed
        const hasFailedDep = [...stepDeps].some(d => failedSteps.has(d));
        if (hasFailedDep) {
          // Skip this step
          remaining.delete(stepId);
          completed.add(stepId);
          failedSteps.add(stepId);
          stepResults.push({
            stepId,
            toolId: stepsById.get(stepId)!.toolId,
            status: 'skipped',
            error: `Skipped: dependency failed`,
            durationMs: 0,
          });
          continue;
        }
        ready.push(stepId);
      }
    }

    if (ready.length === 0 && remaining.size > 0) {
      // Deadlock — circular dependency or unfulfillable deps
      for (const stepId of remaining) {
        stepResults.push({
          stepId,
          toolId: stepsById.get(stepId)!.toolId,
          status: 'skipped',
          error: 'Skipped: circular or unfulfillable dependency',
          durationMs: 0,
        });
      }
      break;
    }

    // Execute ready steps in parallel
    const promises = ready.map(async (stepId) => {
      const step = stepsById.get(stepId)!;
      const stepStart = Date.now();
      const tool = toolRegistry.get(step.toolId);

      if (!tool) {
        failedSteps.add(stepId);
        return {
          stepId,
          toolId: step.toolId,
          status: 'skipped' as const,
          error: `Tool not found: ${step.toolId}`,
          durationMs: 0,
        };
      }

      try {
        const resolvedInput = resolveInputMappings(step.input, step.inputMappings, stepOutputs);
        logger.info('Orchestrator executing step', { stepId, toolId: step.toolId, description: step.description });

        const result = await executeTool(tool, resolvedInput);
        stepOutputs.set(stepId, result);

        const price = toolRegistry.calculatePrice(step.toolId, resolvedInput);
        totalCredits += price?.credits || 0;

        return {
          stepId,
          toolId: step.toolId,
          status: 'completed' as const,
          result,
          durationMs: Date.now() - stepStart,
        };
      } catch (error) {
        const err = error as Error;
        logger.error('Orchestrator step failed', { stepId, toolId: step.toolId, error: err.message });
        failedSteps.add(stepId);
        return {
          stepId,
          toolId: step.toolId,
          status: 'failed' as const,
          error: err.message,
          durationMs: Date.now() - stepStart,
        };
      }
    });

    const results = await Promise.all(promises);
    for (const result of results) {
      stepResults.push(result);
      remaining.delete(result.stepId);
      completed.add(result.stepId);
    }
  }

  // Find the final output (last completed step)
  const lastCompleted = [...stepResults].reverse().find(r => r.status === 'completed');
  const allSucceeded = stepResults.every(r => r.status === 'completed');

  return {
    success: allSucceeded,
    goal: plan.goal,
    plan,
    stepResults,
    finalOutput: lastCompleted?.result || null,
    totalDurationMs: Date.now() - startTime,
    totalCredits,
  };
}

/**
 * One-shot orchestration: plan + execute from a natural language goal
 */
export async function orchestrate(
  goal: string, 
  context?: Record<string, unknown>
): Promise<OrchestrationResult> {
  const plan = await generatePlan(goal, context);
  return await executePlan(plan);
}

// ============================================
// Pre-built Workflow Templates
// ============================================

export const WORKFLOW_TEMPLATES: Record<string, (params: Record<string, unknown>) => OrchestrationPlan> = {
  'ai-influencer': (params) => ({
    goal: 'Create an AI influencer video with lip-synced speech',
    steps: [
      {
        stepId: 'step1',
        toolId: 'image.generate.flux-pro-kontext',
        toolName: 'FLUX Pro Kontext - Text to Image',
        input: { prompt: params.portraitPrompt as string || 'Professional portrait of an attractive person, studio lighting', image_size: 'portrait_4_3' },
        description: 'Generate the portrait image',
      },
      {
        stepId: 'step2',
        toolId: 'audio.tts',
        toolName: 'XTTS v2 - Voice Cloning & TTS',
        input: { text: params.script as string || 'Hello, welcome to my channel!', audio_url: params.voiceReferenceUrl as string || '', language: 'en' },
        description: 'Generate speech from script',
      },
      {
        stepId: 'step3',
        toolId: 'audio.lip-sync',
        toolName: 'SadTalker - Lip Sync',
        input: {},
        inputMappings: {
          face_image_url: '$step1.images[0].url',
          audio_url: '$step2.audio_file.url',
        },
        description: 'Create lip-synced video',
      },
    ],
    estimatedCredits: 4.5,
    estimatedDurationSeconds: 60,
  }),

  'music-video': (params) => ({
    goal: 'Create a music video from a text description',
    steps: [
      {
        stepId: 'step1',
        toolId: 'music.generate',
        toolName: 'CassetteAI Music Generator',
        input: { prompt: params.musicPrompt as string || 'Upbeat electronic music with synths', duration: params.duration as number || 30 },
        description: 'Generate the music track',
      },
      {
        stepId: 'step2',
        toolId: 'image.generate.flux-pro-kontext',
        toolName: 'FLUX Pro Kontext - Text to Image',
        input: { prompt: params.visualPrompt as string || 'Abstract colorful visualization, dynamic movement', image_size: 'landscape_16_9' },
        description: 'Generate the visual keyframe',
      },
      {
        stepId: 'step3',
        toolId: 'video.generate.veo3-image-to-video',
        toolName: 'Veo 3.1 - Image to Video',
        input: { prompt: params.motionPrompt as string || 'Smooth camera movement, dynamic visual effects', duration: '8s' },
        inputMappings: { image_url: '$step2.images[0].url' },
        description: 'Animate the image into a video',
      },
    ],
    estimatedCredits: 20,
    estimatedDurationSeconds: 120,
  }),

  'product-visualization': (params) => ({
    goal: 'Create a 3D product visualization from a photo',
    steps: [
      {
        stepId: 'step1',
        toolId: 'image.extract-layer',
        toolName: 'Layer Extraction (Background Removal)',
        input: { image_url: params.imageUrl as string },
        description: 'Remove background from product image',
      },
      {
        stepId: 'step2',
        toolId: 'image.upscale',
        toolName: 'Creative Upscaler',
        input: { scale: 2, creativity: 0.3 },
        inputMappings: { image_url: '$step1.image.url' },
        description: 'Enhance image resolution',
      },
      {
        stepId: 'step3',
        toolId: '3d.image-to-3d',
        toolName: 'Hunyuan3D v3 - Image to 3D',
        input: { generate_texture: true, target_face_count: 100000, output_format: 'glb' },
        inputMappings: { image_url: '$step2.image.url' },
        description: 'Convert to 3D model',
      },
    ],
    estimatedCredits: 4,
    estimatedDurationSeconds: 90,
  }),

  'audio-remix': (params) => ({
    goal: 'Separate stems from audio and create a remix',
    steps: [
      {
        stepId: 'step1',
        toolId: 'audio.stem-separation',
        toolName: 'Demucs - Stem Separation',
        input: { audio_url: params.audioUrl as string, stems: 4 },
        description: 'Separate audio into stems',
      },
      {
        stepId: 'step2',
        toolId: 'music.generate',
        toolName: 'CassetteAI Music Generator',
        input: { prompt: params.remixStyle as string || 'Lo-fi remix with chill beats and ambient pads', duration: params.duration as number || 30 },
        description: 'Generate new backing track in remix style',
      },
    ],
    estimatedCredits: 2.5,
    estimatedDurationSeconds: 45,
  }),
};

export default {
  generatePlan,
  executePlan,
  orchestrate,
  WORKFLOW_TEMPLATES,
};
