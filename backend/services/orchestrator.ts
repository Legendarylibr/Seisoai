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
import logger from '../utils/logger';

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
export async function generatePlan(goal: string, context?: Record<string, unknown>): Promise<OrchestrationPlan> {
  const tools = toolRegistry.getEnabled();
  
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

  const userPrompt = `Goal: ${goal}${context ? `\nContext: ${JSON.stringify(context)}` : ''}`;

  try {
    const endpoint = 'https://fal.run/fal-ai/any-llm';
    const response = await falRequest<{ output?: string }>(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        prompt: userPrompt,
        system_prompt: systemPrompt,
        max_tokens: 2048,
      }),
    });

    const output = response.output || '';
    
    // Parse JSON from the response
    let planData: { steps: OrchestrationStep[]; estimatedCredits: number; estimatedDurationSeconds: number };
    
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      planData = JSON.parse(jsonMatch[0]);
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
async function executeTool(tool: ToolDefinition, input: Record<string, unknown>): Promise<unknown> {
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
    const maxWaitMs = 300_000; // 5 minutes
    const pollIntervalMs = 3_000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
      const status = await checkQueueStatus(jobId, tool.falModel) as { status?: string };

      if (isStatusCompleted(status?.status)) {
        return await getQueueResult(jobId, tool.falModel);
      }

      if (isStatusFailed(status?.status)) {
        throw new Error(`Tool execution failed with status: ${status?.status}`);
      }
    }

    throw new Error(`Tool execution timed out after ${maxWaitMs / 1000}s`);
  }
}

/**
 * Execute a full orchestration plan
 */
export async function executePlan(plan: OrchestrationPlan): Promise<OrchestrationResult> {
  const startTime = Date.now();
  const stepResults: StepResult[] = [];
  const stepOutputs = new Map<string, unknown>();
  let totalCredits = 0;

  logger.info('Orchestrator executing plan', { goal: plan.goal, stepCount: plan.steps.length });

  for (const step of plan.steps) {
    const stepStart = Date.now();
    const tool = toolRegistry.get(step.toolId);

    if (!tool) {
      stepResults.push({
        stepId: step.stepId,
        toolId: step.toolId,
        status: 'skipped',
        error: `Tool not found: ${step.toolId}`,
        durationMs: 0,
      });
      continue;
    }

    try {
      // Resolve input mappings from previous step outputs
      const resolvedInput = resolveInputMappings(step.input, step.inputMappings, stepOutputs);

      logger.info('Orchestrator executing step', { stepId: step.stepId, toolId: step.toolId, description: step.description });

      const result = await executeTool(tool, resolvedInput);
      
      stepOutputs.set(step.stepId, result);
      
      const price = toolRegistry.calculatePrice(step.toolId, resolvedInput);
      totalCredits += price?.credits || 0;

      stepResults.push({
        stepId: step.stepId,
        toolId: step.toolId,
        status: 'completed',
        result,
        durationMs: Date.now() - stepStart,
      });

      logger.info('Orchestrator step completed', { stepId: step.stepId, durationMs: Date.now() - stepStart });
    } catch (error) {
      const err = error as Error;
      logger.error('Orchestrator step failed', { stepId: step.stepId, toolId: step.toolId, error: err.message });

      stepResults.push({
        stepId: step.stepId,
        toolId: step.toolId,
        status: 'failed',
        error: err.message,
        durationMs: Date.now() - stepStart,
      });

      // Continue with remaining steps that don't depend on this one
      // (in a more advanced version, we'd analyze the dependency graph)
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
