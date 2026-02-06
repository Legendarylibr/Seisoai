/**
 * Unified Prompt Optimization Service
 * 
 * Consolidates all model-specific prompt optimization into a single
 * generic engine with thin wrappers for each model type.
 * Previously this was 5 copy-pasted functions (~580 lines).
 */
import logger from '../utils/logger';
import llmProvider, { DEFAULT_MODELS } from './llmProvider';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

const MAX_PROMPT_LENGTH = 250;

export interface PromptOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Truncate a prompt to max length, preserving meaning.
 * Tries to cut at a comma or space boundary.
 */
function truncatePrompt(prompt: string, maxLength = MAX_PROMPT_LENGTH): string {
  if (prompt.length <= maxLength) return prompt;
  const truncated = prompt.substring(0, maxLength);
  const lastComma = truncated.lastIndexOf(',');
  if (lastComma > maxLength * 0.6) return truncated.substring(0, lastComma).trim();
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) return truncated.substring(0, lastSpace).trim();
  return truncated.trim();
}

// ============================================================================
// GENERIC OPTIMIZER
// ============================================================================

/**
 * Generic prompt optimizer.
 * All model-specific optimizers delegate to this single implementation.
 */
async function optimizePrompt(
  originalPrompt: string,
  guidelines: string,
  contextPrompt: string,
  useCase: string,
  opts: { temperature?: number; maxTokens?: number; maxLength?: number } = {}
): Promise<PromptOptimizationResult> {
  if (!originalPrompt?.trim()) {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  if (!llmProvider.isLLMConfigured()) {
    logger.warn(`${useCase} skipped: No LLM provider configured`);
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM not configured' };
  }

  try {
    const llmResponse = await llmProvider.complete({
      model: DEFAULT_MODELS.internal,
      systemPrompt: guidelines,
      prompt: contextPrompt,
      temperature: opts.temperature ?? 0.6,
      maxTokens: opts.maxTokens ?? 250,
      timeoutMs: 8000,
      useCase,
    });

    const output = llmResponse.content;

    try {
      const parsed = llmProvider.extractJSON<{ optimizedPrompt?: string; reasoning?: string }>(output);
      if (parsed?.optimizedPrompt?.trim()) {
        const truncated = truncatePrompt(parsed.optimizedPrompt.trim(), opts.maxLength);
        logger.debug(`${useCase}: prompt optimized`, {
          original: originalPrompt.substring(0, 50),
          optimized: truncated.substring(0, 50),
        });
        return { optimizedPrompt: truncated, reasoning: parsed.reasoning || null, skipped: false };
      }
    } catch {
      // JSON parse failed — use raw output if it looks reasonable
      if (output && output.length > 10 && output.length < 500) {
        return {
          optimizedPrompt: truncatePrompt(output.trim(), opts.maxLength),
          reasoning: 'Enhanced by AI',
          skipped: false,
        };
      }
    }

    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse LLM response' };
  } catch (error) {
    const err = error as Error;
    logger.error(`${useCase} error`, { error: err.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: err.message };
  }
}

// ============================================================================
// MODEL-SPECIFIC GUIDELINES
// ============================================================================

const MUSIC_GUIDELINES = `You are an expert music producer helping optimize prompts for AI music generation.

CRITICAL: Keep prompts SHORT - under 200 characters. Long prompts slow down generation.

Include only essential elements:
- Genre/style (specific: "lo-fi hip hop" not "hip hop")
- 2-3 instruments max
- Mood word
- Optional: tempo or key (not both)

Examples (note brevity):
- "chill music" → "Relaxing lo-fi hip hop, mellow piano, soft drums, warm bass, 85 BPM"
- "rock song" → "Energetic rock, crunchy guitars, driving drums, punchy bass, 140 BPM"
- "sad piano" → "Melancholic piano piece, gentle melodies, soft reverb, D Minor"

JSON only:
{"optimizedPrompt": "enhanced version under 200 chars", "reasoning": "brief explanation"}`;

const FLUX2_EDIT_GUIDELINES = `You are an expert at crafting prompts for FLUX 2 image editing AI.

CRITICAL: Keep prompts SHORT - under 150 characters. Long prompts slow down generation significantly.

Optimal prompt structure:
1. Use action verbs: "Change", "Make", "Replace", "Add", "Remove", "Transfer", "Apply"
2. Be specific but brief - ONE main edit per prompt
3. Include hex colors only if the user mentioned a specific color

SINGLE IMAGE EDIT examples:
- "Change the shirt to red flannel"
- "Make hair blonde with highlights"
- "Replace background with sunset beach"

MULTI-IMAGE EDIT examples (when combining elements from multiple images):
- "Transfer the hat from reference to subject's head"
- "Apply outfit from second image to person"
- "Composite: keep subject, use reference background"
- "Blend reference accessory onto subject naturally"

For multi-image: focus on WHAT to transfer and WHERE to place it.

JSON response:
{"optimizedPrompt": "short action-oriented instruction under 150 chars", "reasoning": "brief explanation"}`;

const FLUX_EDIT_GUIDELINES = `You are an expert at crafting prompts for FLUX image-to-image editing.

CRITICAL: Keep prompts SHORT - under 200 characters. Long prompts slow down generation.

SINGLE IMAGE EDIT:
1. Describe the desired result briefly
2. Include 1-2 style modifiers max
3. Be specific but concise

Examples:
- "Portrait with stylish black sunglasses, same pose, high quality"
- "Same subject, blue background, studio lighting"

MULTI-IMAGE EDIT (combining elements from multiple images):
1. Describe what element to transfer from reference image
2. Specify where to place it on the base image
3. Include blending/style instructions

Multi-image examples:
- "Subject wearing the outfit from reference image, natural fit, same pose"
- "Base image with background replaced by reference scene, seamless blend"
- "Transfer the hairstyle from reference to subject, matching lighting"
- "Combine: subject from base, accessories from reference, cohesive style"

JSON response:
{"optimizedPrompt": "brief scene description under 200 chars", "reasoning": "brief explanation"}`;

const NANO_BANANA_EDIT_GUIDELINES = `You are an expert at crafting prompts for Nano Banana Pro image editing.

CRITICAL: Keep prompts SHORT - under 200 characters. Long prompts slow down generation.

SINGLE IMAGE EDIT:
1. Describe desired result briefly
2. Include 1-2 quality modifiers max
3. Be specific but concise

Single image examples:
- "Portrait with pearl necklace, same lighting, high detail"
- "Same scene as oil painting, impressionist style"
- "Subject in magical forest, dappled sunlight"

MULTI-IMAGE EDIT (combining elements from multiple images):
1. Describe what element to transfer from reference
2. Specify placement and integration
3. Include style/blending instructions

Multi-image examples:
- "Subject wearing reference outfit, natural fit, cohesive lighting"
- "Base scene with reference object added, seamless integration"
- "Transfer hairstyle from reference to subject, same style"
- "Combine: subject from base with background from reference"

JSON response:
{"optimizedPrompt": "brief result description under 200 chars", "reasoning": "brief explanation"}`;

const FLUX2_T2I_GUIDELINES = `You are an expert prompt engineer for FLUX.2, a state-of-the-art text-to-image AI model.

CRITICAL: Keep prompts SHORT - under 200 characters. Long prompts slow down generation significantly.

Your goal: Transform a user's image description into a concise, effective prompt.

Guidelines:
1. Add 2-3 key visual elements max:
   - Camera angle OR lighting (not both unless essential)
   - One style descriptor (photorealistic, cinematic, etc.)
   - One mood/atmosphere word

2. Keep the user's core intent - enhance, don't change the subject
3. BREVITY IS KEY - shorter prompts generate faster with similar quality
4. Skip unnecessary adjectives and redundant details

Examples (note the brevity):
- "a cat" → "Fluffy tabby cat, striking green eyes, soft natural light, photorealistic"
- "futuristic city" → "Cyberpunk cityscape at night, neon lights, rain-slicked streets, cinematic"
- "woman portrait" → "Professional headshot, confident expression, studio lighting, sharp focus"

JSON only:
{"optimizedPrompt": "enhanced version under 200 chars", "reasoning": "brief explanation"}`;

// ============================================================================
// EXPORTED WRAPPER FUNCTIONS
// ============================================================================

/** Optimize a prompt for music generation (CassetteAI) */
export async function optimizePromptForMusic(
  originalPrompt: string,
  selectedGenre: string | null = null
): Promise<PromptOptimizationResult> {
  const genreCtx = selectedGenre
    ? `The user has selected the genre "${selectedGenre}". Use this as context but still enhance based on their written prompt.\n`
    : '';
  return optimizePrompt(
    originalPrompt, MUSIC_GUIDELINES,
    `Enhance this music prompt. Keep it SHORT (under 200 chars): "${originalPrompt}"\n${genreCtx}Add genre, 2-3 instruments, mood. Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`,
    'music-prompt-optimization'
  );
}

/** Optimize a prompt for FLUX 2 image editing */
export async function optimizePromptForFlux2Edit(
  originalPrompt: string,
  options?: { hasMultipleImages?: boolean; numImages?: number }
): Promise<PromptOptimizationResult> {
  const multiCtx = options?.hasMultipleImages
    ? `\n\nThis is a MULTI-IMAGE EDIT with ${options.numImages || 2} images. First image is BASE, others are REFERENCE for elements to transfer.`
    : '';
  return optimizePrompt(
    originalPrompt, FLUX2_EDIT_GUIDELINES,
    `Make this edit instruction SHORT (under 150 chars): "${originalPrompt}"${multiCtx}\n\nUse action verb, be specific. ${options?.hasMultipleImages ? 'Focus on what to TRANSFER from reference to base.' : ''} Brevity is critical.\nReturn JSON: {"optimizedPrompt": "...", "reasoning": "..."}`,
    'flux2-edit-prompt-optimization',
    { temperature: 0.5, maxTokens: 200, maxLength: 200 }
  );
}

/** Optimize a prompt for FLUX (standard) image editing */
export async function optimizePromptForFluxEdit(
  originalPrompt: string,
  originalImagePrompt?: string,
  options?: { hasMultipleImages?: boolean; numImages?: number }
): Promise<PromptOptimizationResult> {
  const ctxInfo = originalImagePrompt ? ` Original: "${originalImagePrompt.substring(0, 50)}"` : '';
  const multiCtx = options?.hasMultipleImages
    ? `\n\nThis is a MULTI-IMAGE EDIT with ${options.numImages || 2} images. First image is BASE, others are REFERENCE for elements to transfer.`
    : '';
  return optimizePrompt(
    originalPrompt, FLUX_EDIT_GUIDELINES,
    `Create SHORT FLUX edit prompt (under 200 chars): "${originalPrompt}"${ctxInfo}${multiCtx}\n\n${options?.hasMultipleImages ? 'Describe what to transfer from reference to base, with blending instructions.' : 'Describe result briefly.'} Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`,
    'flux-edit-prompt-optimization',
    { temperature: 0.5, maxTokens: 200 }
  );
}

/** Optimize a prompt for Nano Banana Pro image editing */
export async function optimizePromptForNanoBananaEdit(
  originalPrompt: string,
  originalImagePrompt?: string,
  options?: { hasMultipleImages?: boolean; numImages?: number }
): Promise<PromptOptimizationResult> {
  const ctxInfo = originalImagePrompt ? ` Original: "${originalImagePrompt.substring(0, 50)}"` : '';
  const multiCtx = options?.hasMultipleImages
    ? `\n\nThis is a MULTI-IMAGE EDIT with ${options.numImages || 2} images. First image is BASE, others are REFERENCE for elements to transfer.`
    : '';
  return optimizePrompt(
    originalPrompt, NANO_BANANA_EDIT_GUIDELINES,
    `Create SHORT Nano Banana edit prompt (under 200 chars): "${originalPrompt}"${ctxInfo}${multiCtx}\n\n${options?.hasMultipleImages ? 'Describe what to transfer from reference to base, with integration instructions.' : 'Describe result briefly.'} Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`,
    'nano-banana-edit-prompt-optimization'
  );
}

/** Optimize a prompt for FLUX 2 text-to-image generation */
export async function optimizePromptForFlux2T2I(
  originalPrompt: string
): Promise<PromptOptimizationResult> {
  return optimizePrompt(
    originalPrompt, FLUX2_T2I_GUIDELINES,
    `Enhance this FLUX.2 image prompt. Keep it SHORT (under 200 chars): "${originalPrompt}"\n\nAdd 2-3 key elements max. Brevity is critical for fast generation.\nReturn JSON: {"optimizedPrompt": "...", "reasoning": "..."}`,
    'flux2-t2i-prompt-optimization',
    { maxTokens: 300 }
  );
}
