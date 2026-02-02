/**
 * Generation routes
 * Image, video, and music generation endpoints
 * 
 * NOTE: Email addresses are encrypted at rest. Uses emailHash for lookups.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { requireAuth } from '../utils/responses';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey, isStatusCompleted, isStatusFailed, normalizeStatus, FAL_STATUS } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
// createEmailHash import removed - SECURITY: Use authenticated user from JWT instead
import type { IUser } from '../models/User';
import { calculateVideoCredits, calculateMusicCredits, calculateUpscaleCredits, calculateVideoToAudioCredits } from '../utils/creditCalculations';
import { applyClawMarkup } from '../middleware/credits';
import { encrypt, isEncryptionConfigured } from '../utils/encryption';
import { withRetry } from '../utils/mongoRetry';

// Types
interface Dependencies {
  authenticateFlexible?: RequestHandler;
  requireCreditsForModel: () => RequestHandler;
  requireCreditsForVideo: () => RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

// ============================================================================
// ASIAN LANGUAGE TO ENGLISH PROMPT TRANSLATION (Japanese, Chinese)
// ============================================================================

/**
 * Detect if text contains Japanese characters (Hiragana, Katakana)
 */
function containsJapaneseKana(text: string): boolean {
  // Hiragana: \u3040-\u309F
  // Katakana: \u30A0-\u30FF
  const japaneseKanaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  return japaneseKanaRegex.test(text);
}

/**
 * Detect if text contains CJK characters (shared by Japanese Kanji and Chinese)
 */
function containsCJK(text: string): boolean {
  // CJK Unified Ideographs: \u4E00-\u9FFF
  // CJK Extension A: \u3400-\u4DBF
  const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF]/;
  return cjkRegex.test(text);
}

/**
 * Detect the source language for translation
 */
function detectAsianLanguage(text: string): 'japanese' | 'chinese' | null {
  if (containsJapaneseKana(text)) {
    return 'japanese'; // Has kana = definitely Japanese
  }
  if (containsCJK(text)) {
    // Has CJK but no kana - could be Chinese or Japanese kanji-only
    // Default to Chinese since kanji-only Japanese is rare in prompts
    return 'chinese';
  }
  return null;
}

interface TranslationResult {
  translatedPrompt: string;
  wasTranslated: boolean;
  sourceLanguage?: 'japanese' | 'chinese';
  error?: string;
}

/**
 * Translate Japanese or Chinese prompt to English for AI generation
 * This happens invisibly - user sees their language, AI gets English
 */
async function translateAsianToEnglish(prompt: string): Promise<TranslationResult> {
  const sourceLanguage = detectAsianLanguage(prompt);
  
  // Skip if no Asian characters detected
  if (!sourceLanguage) {
    return { translatedPrompt: prompt, wasTranslated: false };
  }

  const FAL_API_KEY = getFalApiKey();
  
  if (!FAL_API_KEY) {
    logger.warn('Translation skipped: FAL_API_KEY not configured');
    return { translatedPrompt: prompt, wasTranslated: false, error: 'API key not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const languageName = sourceLanguage === 'japanese' ? 'Japanese' : 'Chinese';
    const translationPrompt = `Translate the following ${languageName} text to English. This is a prompt for AI image/video/music generation, so preserve all descriptive details, style keywords, and artistic directions. Output ONLY the English translation, nothing else.

${languageName} text: ${prompt}

English translation:`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-5-haiku',
        prompt: translationPrompt,
        max_tokens: 500
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('Translation request failed', { status: response.status, language: sourceLanguage });
      return { translatedPrompt: prompt, wasTranslated: false, error: 'Translation request failed' };
    }

    const data = await response.json() as { output?: string; text?: string; response?: string };
    const output = (data.output || data.text || data.response || '').trim();

    if (output && output.length > 0) {
      logger.debug('Prompt translated', { 
        sourceLanguage,
        original: prompt.substring(0, 50),
        translated: output.substring(0, 50)
      });
      return { translatedPrompt: output, wasTranslated: true, sourceLanguage };
    }

    return { translatedPrompt: prompt, wasTranslated: false, error: 'Empty translation response' };

  } catch (error) {
    const err = error as Error;
    logger.error('Translation error', { error: err.message, language: sourceLanguage });
    return { translatedPrompt: prompt, wasTranslated: false, error: err.message };
  }
}

/**
 * Refund credits to a user after a failed generation
 * @param user - The user to refund
 * @param credits - Number of credits to refund
 * @param reason - Reason for the refund (for logging)
 * @returns The updated user document or null if refund failed
 */
async function refundCredits(
  user: IUser,
  credits: number,
  reason: string
): Promise<IUser | null> {
  try {
    // Validate credits is a valid positive number
    if (!Number.isFinite(credits) || credits <= 0) {
      logger.error('Cannot refund invalid credits amount', { credits, reason, userId: user.userId });
      return null;
    }
    
    const User = mongoose.model<IUser>('User');
    const updateQuery = buildUserUpdateQuery(user);
    
    if (!updateQuery) {
      logger.error('Cannot refund credits: no valid user identifier', { userId: user.userId });
      return null;
    }

    const updatedUser = await User.findOneAndUpdate(
      updateQuery,
      {
        $inc: { credits: credits, totalCreditsSpent: -credits }
      },
      { new: true }
    );

    if (updatedUser) {
      logger.info('Credits refunded for failed generation', {
        userId: user.userId || user.email || user.walletAddress,
        creditsRefunded: credits,
        newBalance: updatedUser.credits,
        reason
      });
    }

    return updatedUser;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to refund credits', {
      userId: user.userId,
      credits,
      reason,
      error: err.message
    });
    return null;
  }
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
  hasFreeAccess?: boolean;
}

interface FalImageResponse {
  images?: Array<{ url?: string } | string>;
  image?: { url?: string } | string;
}

// ============================================================================
// MUSIC PROMPT OPTIMIZATION SERVICE
// ============================================================================

/**
 * Music prompt optimization guidelines for CassetteAI
 */
const MUSIC_PROMPT_GUIDELINES = `You are an expert music producer helping optimize prompts for AI music generation.

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

interface MusicOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Optimize a prompt for music generation
 */
export async function optimizePromptForMusic(
  originalPrompt: string,
  selectedGenre: string | null = null
): Promise<MusicOptimizationResult> {
  // Skip optimization for empty prompts
  if (!originalPrompt || originalPrompt.trim() === '') {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  const FAL_API_KEY = getFalApiKey();
  
  // Check if FAL_API_KEY is available
  if (!FAL_API_KEY) {
    logger.warn('Music prompt optimization skipped: FAL_API_KEY not configured');
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'API key not configured' };
  }

  const genreContext = selectedGenre 
    ? `The user has selected the genre "${selectedGenre}". Use this as context but still enhance based on their written prompt.`
    : '';

  try {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const userPrompt = `Enhance this music prompt. Keep it SHORT (under 200 chars): "${originalPrompt}"
${genreContext ? genreContext + '\n' : ''}Add genre, 2-3 instruments, mood. Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        prompt: userPrompt,
        system_prompt: MUSIC_PROMPT_GUIDELINES,
        temperature: 0.6,
        max_tokens: 250
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.warn('Music prompt optimization LLM request failed', { status: response.status, error: errorText });
      return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM request failed' };
    }

    const data = await response.json() as { output?: string; text?: string; response?: string };
    const output = data.output || data.text || data.response || '';

    // Try to parse JSON response
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { optimizedPrompt?: string; reasoning?: string };
        const optimized = parsed.optimizedPrompt || originalPrompt;
        return {
          optimizedPrompt: truncatePrompt(optimized.trim()),
          reasoning: parsed.reasoning || null,
          skipped: false
        };
      }
    } catch {
      if (output && output.length > 10) {
        return {
          optimizedPrompt: truncatePrompt(output.trim()),
          reasoning: 'Enhanced by AI',
          skipped: false
        };
      }
    }

    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse LLM response' };

  } catch (error) {
    const err = error as Error;
    logger.error('Music prompt optimization error', { error: err.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: err.message };
  }
}

// ============================================================================
// END MUSIC PROMPT OPTIMIZATION SERVICE
// ============================================================================

// ============================================================================
// FLUX 2 IMAGE EDITING PROMPT OPTIMIZATION SERVICE
// ============================================================================

/**
 * FLUX 2 image editing prompt optimization guidelines
 * Tailored for precise modifications using natural language descriptions
 */
const FLUX2_EDIT_PROMPT_GUIDELINES = `You are an expert at crafting prompts for FLUX 2 image editing AI.

CRITICAL: Keep prompts SHORT - under 150 characters. Long prompts slow down generation significantly.

Optimal prompt structure:
1. Use action verbs: "Change", "Make", "Replace", "Add", "Remove"
2. Be specific but brief - ONE main edit per prompt
3. Include hex colors only if the user mentioned a specific color

Good examples (note the brevity):
- "Change the shirt to red flannel"
- "Make hair blonde with highlights"
- "Replace background with sunset beach"
- "Add stylish sunglasses"

Bad prompts:
- "Make it look better" (vague)
- Long descriptions with multiple changes

JSON response:
{"optimizedPrompt": "short action-oriented instruction under 150 chars", "reasoning": "brief explanation"}`;

interface ImageEditOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Optimize a prompt for FLUX 2 image editing
 */
export async function optimizePromptForFlux2Edit(
  originalPrompt: string
): Promise<ImageEditOptimizationResult> {
  // Skip optimization for empty prompts
  if (!originalPrompt || originalPrompt.trim() === '') {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  const FAL_API_KEY = getFalApiKey();
  
  if (!FAL_API_KEY) {
    logger.warn('FLUX 2 prompt optimization skipped: FAL_API_KEY not configured');
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'API key not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const userPrompt = `Make this edit instruction SHORT (under 150 chars): "${originalPrompt}"

Use action verb, be specific. Brevity is critical.
Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        prompt: userPrompt,
        system_prompt: FLUX2_EDIT_PROMPT_GUIDELINES,
        temperature: 0.5,
        max_tokens: 200
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.warn('FLUX 2 prompt optimization LLM request failed', { status: response.status, error: errorText });
      return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM request failed' };
    }

    const data = await response.json() as { output?: string; text?: string; response?: string };
    const output = data.output || data.text || data.response || '';

    // Try to parse JSON response
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { optimizedPrompt?: string; reasoning?: string };
        if (parsed.optimizedPrompt && parsed.optimizedPrompt.trim().length > 0) {
          const truncatedPrompt = truncatePrompt(parsed.optimizedPrompt.trim(), 200);
          logger.debug('FLUX 2 prompt optimized', { 
            original: originalPrompt.substring(0, 50),
            optimized: truncatedPrompt.substring(0, 50),
            truncated: truncatedPrompt.length < parsed.optimizedPrompt.trim().length
          });
          return {
            optimizedPrompt: truncatedPrompt,
            reasoning: parsed.reasoning || null,
            skipped: false
          };
        }
      }
    } catch {
      // If JSON parsing fails but we have reasonable output, use it
      if (output && output.length > 10 && output.length < 500) {
        return {
          optimizedPrompt: truncatePrompt(output.trim(), 200),
          reasoning: 'Enhanced for FLUX 2 editing',
          skipped: false
        };
      }
    }

    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse LLM response' };

  } catch (error) {
    const err = error as Error;
    logger.error('FLUX 2 prompt optimization error', { error: err.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: err.message };
  }
}

// ============================================================================
// END FLUX 2 IMAGE EDITING PROMPT OPTIMIZATION SERVICE
// ============================================================================

// ============================================================================
// FLUX (STANDARD) IMAGE EDITING PROMPT OPTIMIZATION SERVICE
// ============================================================================

/**
 * FLUX standard image editing prompt optimization guidelines
 * Optimized for img2img transformations with FLUX schnell/dev
 */
const FLUX_EDIT_PROMPT_GUIDELINES = `You are an expert at crafting prompts for FLUX image-to-image editing.

CRITICAL: Keep prompts SHORT - under 200 characters. Long prompts slow down generation.

Key points:
1. Describe the desired result briefly
2. Include 1-2 style modifiers max
3. Be specific but concise

Good examples (note brevity):
- "Portrait with stylish black sunglasses, same pose, high quality"
- "Same subject, blue background, studio lighting"
- "Same scene with vibrant saturated colors"
- "Same composition in anime style, cel shading"

JSON response:
{"optimizedPrompt": "brief scene description under 200 chars", "reasoning": "brief explanation"}`;

/**
 * Optimize a prompt for FLUX (standard) image editing
 */
export async function optimizePromptForFluxEdit(
  originalPrompt: string,
  originalImagePrompt?: string
): Promise<ImageEditOptimizationResult> {
  if (!originalPrompt || originalPrompt.trim() === '') {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  const FAL_API_KEY = getFalApiKey();
  
  if (!FAL_API_KEY) {
    logger.warn('FLUX edit prompt optimization skipped: FAL_API_KEY not configured');
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'API key not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const contextInfo = originalImagePrompt 
      ? ` Original: "${originalImagePrompt.substring(0, 50)}"`
      : '';

    const userPrompt = `Create SHORT FLUX edit prompt (under 200 chars): "${originalPrompt}"${contextInfo}

Describe result briefly. Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        prompt: userPrompt,
        system_prompt: FLUX_EDIT_PROMPT_GUIDELINES,
        temperature: 0.5,
        max_tokens: 200
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('FLUX edit prompt optimization failed', { status: response.status });
      return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM request failed' };
    }

    const data = await response.json() as { output?: string; text?: string; response?: string };
    const output = data.output || data.text || data.response || '';

    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { optimizedPrompt?: string; reasoning?: string };
        if (parsed.optimizedPrompt && parsed.optimizedPrompt.trim().length > 0) {
          const truncatedPrompt = truncatePrompt(parsed.optimizedPrompt.trim());
          logger.debug('FLUX edit prompt optimized', { 
            original: originalPrompt.substring(0, 50),
            optimized: truncatedPrompt.substring(0, 50),
            truncated: truncatedPrompt.length < parsed.optimizedPrompt.trim().length
          });
          return {
            optimizedPrompt: truncatedPrompt,
            reasoning: parsed.reasoning || null,
            skipped: false
          };
        }
      }
    } catch {
      if (output && output.length > 10 && output.length < 500) {
        return { optimizedPrompt: truncatePrompt(output.trim()), reasoning: 'Enhanced for FLUX editing', skipped: false };
      }
    }

    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse response' };

  } catch (error) {
    const err = error as Error;
    logger.error('FLUX edit prompt optimization error', { error: err.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: err.message };
  }
}

// ============================================================================
// END FLUX (STANDARD) IMAGE EDITING PROMPT OPTIMIZATION SERVICE
// ============================================================================

// ============================================================================
// NANO BANANA IMAGE EDITING PROMPT OPTIMIZATION SERVICE
// ============================================================================

/**
 * Nano Banana Pro image editing prompt optimization guidelines
 * Optimized for high-quality image transformations
 */
const NANO_BANANA_EDIT_PROMPT_GUIDELINES = `You are an expert at crafting prompts for Nano Banana Pro image editing.

CRITICAL: Keep prompts SHORT - under 200 characters. Long prompts slow down generation.

For edits, prompts should:
1. Describe desired result briefly
2. Include 1-2 quality modifiers max
3. Be specific but concise

Good examples (note brevity):
- "Portrait with pearl necklace, same lighting, high detail"
- "Same scene as oil painting, impressionist style"
- "Subject in magical forest, dappled sunlight"
- "Same image with golden hour tones, cinematic"

JSON response:
{"optimizedPrompt": "brief result description under 200 chars", "reasoning": "brief explanation"}`;

/**
 * Optimize a prompt for Nano Banana Pro image editing
 */
export async function optimizePromptForNanoBananaEdit(
  originalPrompt: string,
  originalImagePrompt?: string
): Promise<ImageEditOptimizationResult> {
  if (!originalPrompt || originalPrompt.trim() === '') {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  const FAL_API_KEY = getFalApiKey();
  
  if (!FAL_API_KEY) {
    logger.warn('Nano Banana edit prompt optimization skipped: FAL_API_KEY not configured');
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'API key not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const contextInfo = originalImagePrompt 
      ? ` Original: "${originalImagePrompt.substring(0, 50)}"`
      : '';

    const userPrompt = `Create SHORT Nano Banana edit prompt (under 200 chars): "${originalPrompt}"${contextInfo}

Describe result briefly. Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        prompt: userPrompt,
        system_prompt: NANO_BANANA_EDIT_PROMPT_GUIDELINES,
        temperature: 0.6,
        max_tokens: 250
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn('Nano Banana edit prompt optimization failed', { status: response.status });
      return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM request failed' };
    }

    const data = await response.json() as { output?: string; text?: string; response?: string };
    const output = data.output || data.text || data.response || '';

    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { optimizedPrompt?: string; reasoning?: string };
        if (parsed.optimizedPrompt && parsed.optimizedPrompt.trim().length > 0) {
          const truncatedPrompt = truncatePrompt(parsed.optimizedPrompt.trim());
          logger.debug('Nano Banana edit prompt optimized', { 
            original: originalPrompt.substring(0, 50),
            optimized: truncatedPrompt.substring(0, 50),
            truncated: truncatedPrompt.length < parsed.optimizedPrompt.trim().length
          });
          return {
            optimizedPrompt: truncatedPrompt,
            reasoning: parsed.reasoning || null,
            skipped: false
          };
        }
      }
    } catch {
      if (output && output.length > 10 && output.length < 500) {
        return { optimizedPrompt: truncatePrompt(output.trim()), reasoning: 'Enhanced for Nano Banana', skipped: false };
      }
    }

    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse response' };

  } catch (error) {
    const err = error as Error;
    logger.error('Nano Banana edit prompt optimization error', { error: err.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: err.message };
  }
}

// ============================================================================
// END NANO BANANA IMAGE EDITING PROMPT OPTIMIZATION SERVICE
// ============================================================================

// ============================================================================
// FLUX 2 TEXT-TO-IMAGE PROMPT OPTIMIZATION SERVICE
// ============================================================================

/**
 * Flux 2 text-to-image prompt optimization guidelines
 * Optimized for FLUX.2 [dev] from Black Forest Labs
 */
// Maximum character limit for optimized prompts to keep generation times fast
const MAX_OPTIMIZED_PROMPT_LENGTH = 250;

/**
 * Truncate a prompt to the maximum length, preserving meaning
 * Tries to cut at a comma or space boundary
 */
function truncatePrompt(prompt: string, maxLength: number = MAX_OPTIMIZED_PROMPT_LENGTH): string {
  if (prompt.length <= maxLength) return prompt;
  
  // Try to cut at a comma boundary
  const truncated = prompt.substring(0, maxLength);
  const lastComma = truncated.lastIndexOf(',');
  if (lastComma > maxLength * 0.6) {
    return truncated.substring(0, lastComma).trim();
  }
  
  // Otherwise cut at last space
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.6) {
    return truncated.substring(0, lastSpace).trim();
  }
  
  return truncated.trim();
}

const FLUX2_T2I_PROMPT_GUIDELINES = `You are an expert prompt engineer for FLUX.2, a state-of-the-art text-to-image AI model.

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

interface Flux2T2IOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Optimize a prompt for FLUX 2 text-to-image generation
 */
export async function optimizePromptForFlux2T2I(
  originalPrompt: string
): Promise<Flux2T2IOptimizationResult> {
  // Skip optimization for empty prompts
  if (!originalPrompt || originalPrompt.trim() === '') {
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true };
  }

  const FAL_API_KEY = getFalApiKey();
  
  if (!FAL_API_KEY) {
    logger.warn('FLUX 2 T2I prompt optimization skipped: FAL_API_KEY not configured');
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'API key not configured' };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const userPrompt = `Enhance this FLUX.2 image prompt. Keep it SHORT (under 200 chars): "${originalPrompt}"

Add 2-3 key elements max. Brevity is critical for fast generation.
Return JSON: {"optimizedPrompt": "...", "reasoning": "..."}`;

    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3-haiku',
        prompt: userPrompt,
        system_prompt: FLUX2_T2I_PROMPT_GUIDELINES,
        temperature: 0.6,
        max_tokens: 300
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.warn('FLUX 2 T2I prompt optimization LLM request failed', { status: response.status, error: errorText });
      return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'LLM request failed' };
    }

    const data = await response.json() as { output?: string; text?: string; response?: string };
    const output = data.output || data.text || data.response || '';

    // Try to parse JSON response
    try {
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { optimizedPrompt?: string; reasoning?: string };
        if (parsed.optimizedPrompt && parsed.optimizedPrompt.trim().length > 0) {
          const truncatedPrompt = truncatePrompt(parsed.optimizedPrompt.trim());
          logger.debug('FLUX 2 T2I prompt optimized', { 
            original: originalPrompt.substring(0, 50),
            optimized: truncatedPrompt.substring(0, 50),
            truncated: truncatedPrompt.length < parsed.optimizedPrompt.trim().length
          });
          return {
            optimizedPrompt: truncatedPrompt,
            reasoning: parsed.reasoning || null,
            skipped: false
          };
        }
      }
    } catch {
      // If JSON parsing fails but we have reasonable output, use it
      if (output && output.length > 10 && output.length < 500) {
        return {
          optimizedPrompt: truncatePrompt(output.trim()),
          reasoning: 'Enhanced for FLUX 2 text-to-image',
          skipped: false
        };
      }
    }

    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: 'Failed to parse LLM response' };

  } catch (error) {
    const err = error as Error;
    logger.error('FLUX 2 T2I prompt optimization error', { error: err.message });
    return { optimizedPrompt: originalPrompt, reasoning: null, skipped: true, error: err.message };
  }
}

// ============================================================================
// END FLUX 2 TEXT-TO-IMAGE PROMPT OPTIMIZATION SERVICE
// ============================================================================

// ============================================================================
// 360 PANORAMA PROMPT BUILDER FOR NANO BANANA PRO
// ============================================================================

/**
 * Build a comprehensive 360 panorama JSON prompt for Nano Banana Pro
 * Dynamically constructs the JSON structure based on the user's scene description
 * Triggered when user includes "360" in their prompt
 * @param userPrompt - The user's full prompt including "360"
 * @returns A detailed JSON prompt structure for 360 equirectangular panorama generation
 */
function build360PanoramaPrompt(userPrompt: string): string {
  // Extract scene description by removing "360" keyword and cleaning up
  const sceneDescription = userPrompt
    .replace(/\b360\s*(degree|°|view|panorama|panoramic)?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Optimized concise JSON structure - only essential fields for Nano Banana Pro
  const panoramaPrompt = {
    type: "360 equirectangular panorama",
    scene: sceneDescription,
    style: "Professional panoramic photography, seamless 360° coverage",
    constraints: {
      avoid: ["logos", "watermarks", "UI elements", "text overlays", "visible seams"]
    }
  };

  return JSON.stringify(panoramaPrompt);
}

/**
 * Check if prompt requests 360 panorama generation
 */
function is360PanoramaRequest(prompt: string): boolean {
  return /\b360\b/i.test(prompt);
}

// ============================================================================
// END 360 PANORAMA PROMPT BUILDER
// ============================================================================

export function createGenerationRoutes(deps: Dependencies) {
  const router = Router();
  const { 
    authenticateFlexible,
    requireCreditsForModel,
    requireCreditsForVideo,
    requireCredits
  } = deps;

  const flexibleAuth = authenticateFlexible || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Generate image
   * POST /api/generate/image
   */
  router.post('/image', requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured'
        });
        return;
      }

      const creditsRequired = req.creditsRequired || 1;
      const hasFreeAccess = req.hasFreeAccess || false;
      
      // Deduct credits atomically (skip for free access users)
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account required'
        });
        return;
      }

      // Skip credit deduction for NFT/Token holders with free access
      let remainingCredits = user.credits || 0;
      let actualCreditsDeducted = 0;
      
      if (!hasFreeAccess) {
        const updateResult = await User.findOneAndUpdate(
          {
            ...updateQuery,
            credits: { $gte: creditsRequired }
          },
          {
            $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
          },
          { new: true }
        );

        if (!updateResult) {
          res.status(402).json({
            success: false,
            error: 'Insufficient credits'
          });
          return;
        }
        remainingCredits = updateResult.credits;
        actualCreditsDeducted = creditsRequired;
      } else {
        logger.info('Free generation - no credits deducted', {
          userId: user.userId || user.walletAddress,
          creditsWouldHaveCost: creditsRequired
        });
      }

      // Extract request parameters
      // Support both numImages (camelCase) and num_images (snake_case) for compatibility
      const {
        prompt,
        guidanceScale = 7.5,
        numImages: numImagesParam,
        num_images: numImagesSnake,
        image_url,
        image_urls,
        aspect_ratio,
        seed,
        model,
        optimizePrompt = false,
        enhancePrompt = true // Default to true, but can be disabled for batch variations
      } = req.body as {
        prompt?: string;
        guidanceScale?: number;
        numImages?: number;
        num_images?: number;
        image_url?: string;
        image_urls?: string[];
        aspect_ratio?: string;
        seed?: number;
        model?: string;
        optimizePrompt?: boolean;
        enhancePrompt?: boolean;
      };
      
      // Use either naming convention, defaulting to 1
      const numImages = numImagesParam || numImagesSnake || 1;

      // Prompt is required for text-to-image, optional for image-to-image
      const hasImages = image_url || (image_urls && Array.isArray(image_urls) && image_urls.length > 0);
      let trimmedPrompt = (prompt && typeof prompt === 'string') ? prompt.trim() : '';
      
      if (!hasImages && !trimmedPrompt) {
        res.status(400).json({
          success: false,
          error: 'prompt is required for text-to-image generation'
        });
        return;
      }

      // Translate Japanese/Chinese prompts to English for better AI results
      // This is invisible to the user - they see their language, AI gets English
      if (trimmedPrompt) {
        try {
          const translationResult = await translateAsianToEnglish(trimmedPrompt);
          if (translationResult.wasTranslated) {
            logger.info('Prompt translated for generation', {
              sourceLanguage: translationResult.sourceLanguage,
              originalLength: trimmedPrompt.length,
              translatedLength: translationResult.translatedPrompt.length
            });
            trimmedPrompt = translationResult.translatedPrompt;
          }
        } catch (err) {
          logger.warn('Translation failed, using original prompt', { error: (err as Error).message });
        }
      }

      // Determine image inputs first for optimization decision
      const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
      const isSingleImage = image_url || (image_urls && image_urls.length === 1);
      const isFlux2Model = model === 'flux-2';
      
      // Apply FLUX 2 prompt optimization if requested
      // For image-to-image with no prompt, use a generic edit prompt
      let finalPrompt = trimmedPrompt || (hasImages ? 'enhance and refine the image' : '');
      let promptOptimizationResult: ImageEditOptimizationResult | Flux2T2IOptimizationResult | null = null;
      
      if (optimizePrompt && isFlux2Model && trimmedPrompt) {
        try {
          if (hasImages) {
            // Use edit-specific optimization for image editing
            promptOptimizationResult = await optimizePromptForFlux2Edit(trimmedPrompt);
            
            if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
              finalPrompt = promptOptimizationResult.optimizedPrompt;
              logger.debug('FLUX 2 prompt optimized for editing', { 
                original: trimmedPrompt.substring(0, 50),
                optimized: finalPrompt.substring(0, 50)
              });
            }
          } else {
            // Use text-to-image optimization for generation
            promptOptimizationResult = await optimizePromptForFlux2T2I(trimmedPrompt);
            
            if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
              finalPrompt = promptOptimizationResult.optimizedPrompt;
              logger.debug('FLUX 2 prompt optimized for text-to-image', { 
                original: trimmedPrompt.substring(0, 50),
                optimized: finalPrompt.substring(0, 50)
              });
            }
          }
        } catch (err) {
          logger.warn('FLUX 2 prompt optimization failed, using original prompt', { error: (err as Error).message });
        }
      }

      // Check if 360 panorama is requested - forces Nano Banana Pro regardless of model selection
      const is360Request = is360PanoramaRequest(finalPrompt);
      
      // Determine endpoint based on image inputs and model selection
      // 360 panorama requests automatically use Nano Banana Pro
      const isNanoBananaPro = model === 'nano-banana-pro' || is360Request;
      const isFlux2 = isFlux2Model && !is360Request; // Disable FLUX 2 if 360 request
      const isControlNet = model === 'controlnet-canny' && !is360Request; // Disable ControlNet if 360 request
      
      if (is360Request && model !== 'nano-banana-pro') {
        logger.info('360 panorama detected - switching to Nano Banana Pro', {
          originalModel: model,
          prompt: finalPrompt.substring(0, 100)
        });
      }

      let endpoint: string;
      if (isControlNet && hasImages) {
        // ControlNet Canny - uses edge detection to preserve structure
        endpoint = 'https://fal.run/fal-ai/flux-control-lora-canny';
      } else if (isNanoBananaPro) {
        endpoint = hasImages 
          ? 'https://fal.run/fal-ai/nano-banana-pro/edit'
          : 'https://fal.run/fal-ai/nano-banana-pro';
      } else if (isFlux2 && hasImages) {
        // FLUX 2 Edit - precise image editing with natural language
        endpoint = 'https://fal.run/fal-ai/flux-2/edit';
      } else if (isFlux2 && !hasImages) {
        // FLUX 2 Text-to-Image - enhanced realism and crisper text
        endpoint = 'https://fal.run/fal-ai/flux-2';
      } else if (isMultipleImages) {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max/multi';
      } else if (isSingleImage) {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/max';
      } else {
        endpoint = 'https://fal.run/fal-ai/flux-pro/kontext/text-to-image';
      }

      // Build request body based on model
      let requestBody: Record<string, unknown>;
      
      if (isControlNet && hasImages) {
        // ControlNet Canny - preserves edges/structure from control image
        // Using control_lora_image_url as per FAL API docs
        const controlImageUrl = image_url || (image_urls && image_urls[0]);
        
        logger.info('ControlNet generation', { 
          hasControlImage: !!controlImageUrl,
          imageLength: controlImageUrl?.length || 0 
        });
        
        requestBody = {
          prompt: finalPrompt,
          control_lora_image_url: controlImageUrl, // Correct parameter name for flux-control-lora-canny
          num_images: 1,
          guidance_scale: guidanceScale || 6.0, // Higher for better prompt adherence
          num_inference_steps: 28,
          output_format: 'jpeg',
          enable_safety_checker: false
        };
        
        if (seed !== undefined) {
          requestBody.seed = seed;
        }
      } else if (isNanoBananaPro) {
        // Use 360 panorama JSON prompt if 360 was detected (is360Request already set above)
        const nanoBananaPrompt = is360Request 
          ? build360PanoramaPrompt(finalPrompt)
          : finalPrompt;
        
        requestBody = {
          prompt: nanoBananaPrompt,
          resolution: '1K'
        };
        if (isMultipleImages) {
          requestBody.image_urls = image_urls;
        } else if (isSingleImage) {
          const singleImageUrl = image_url || (image_urls && image_urls[0]);
          requestBody.image_urls = [singleImageUrl];
        }
        // For 360 panoramas, use 16:9 landscape (closest supported ratio to 2:1 equirectangular)
        if (is360Request) {
          requestBody.aspect_ratio = '16:9';
        } else if (aspect_ratio) {
          requestBody.aspect_ratio = aspect_ratio;
        }
        // Support batch output from single source or text-to-image
        if (numImages && numImages > 1) {
          requestBody.num_images = numImages;
        }
      } else if (isFlux2 && hasImages) {
        // FLUX 2 Edit API format - precise image editing
        // Build image_urls array from available image inputs
        const imageUrlsArray: string[] = [];
        if (image_urls && Array.isArray(image_urls)) {
          imageUrlsArray.push(...image_urls);
        } else if (image_url) {
          imageUrlsArray.push(image_url);
        }
        
        requestBody = {
          prompt: finalPrompt, // Use optimized prompt if available
          image_urls: imageUrlsArray,
          guidance_scale: 2.5, // FLUX 2 default
          num_inference_steps: 28, // FLUX 2 default
          num_images: numImages,
          output_format: 'png',
          enable_safety_checker: false, // Disabled for user flexibility
          acceleration: 'regular'
        };
        
        if (seed !== undefined) {
          requestBody.seed = seed;
        }
      } else if (isFlux2 && !hasImages) {
        // FLUX 2 Text-to-Image API format
        // Based on https://fal.ai/models/fal-ai/flux-2/api
        requestBody = {
          prompt: finalPrompt, // Use optimized prompt if available
          guidance_scale: 2.5, // FLUX 2 default
          num_inference_steps: 28, // FLUX 2 default
          num_images: numImages,
          output_format: 'png',
          enable_safety_checker: false, // Disabled for user flexibility
          acceleration: 'regular'
        };
        
        // Add image size/aspect ratio
        if (aspect_ratio) {
          // Convert aspect ratio to image_size format
          const aspectToSize: Record<string, string> = {
            '1:1': 'square',
            '4:3': 'landscape_4_3',
            '16:9': 'landscape_16_9',
            '3:4': 'portrait_4_3',
            '9:16': 'portrait_16_9'
          };
          requestBody.image_size = aspectToSize[aspect_ratio] || 'landscape_4_3';
        } else {
          requestBody.image_size = 'landscape_4_3';
        }
        
        if (seed !== undefined) {
          requestBody.seed = seed;
        }
      } else {
        // FLUX Kontext API format
        requestBody = {
          prompt: finalPrompt,
          guidance_scale: guidanceScale,
          num_images: numImages,
          output_format: 'jpeg',
          safety_tolerance: '6',
          prompt_safety_tolerance: '6',
          enhance_prompt: enhancePrompt, // Can be disabled for batch variations with custom prompts
          seed: seed ?? Math.floor(Math.random() * 2147483647)
        };

        if (isMultipleImages) {
          requestBody.image_urls = image_urls;
        } else if (isSingleImage) {
          requestBody.image_url = image_url || (image_urls && image_urls[0]);
        }

        if (aspect_ratio) {
          requestBody.aspect_ratio = aspect_ratio;
        }
      }

      logger.debug('Calling FAL API', { endpoint, model: model || 'flux' });

      // Make FAL API call
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('FAL API error', { status: response.status, error: errorText });
        // Refund credits on API failure
        await refundCredits(user, creditsRequired, `FAL API error: ${response.status}`);
        res.status(500).json({
          success: false,
          error: `Image generation failed: ${response.status}`,
          creditsRefunded: creditsRequired
        });
        return;
      }

      const result = await response.json() as FalImageResponse;

      // Extract image URLs from response
      const images: string[] = [];
      if (result.images && Array.isArray(result.images)) {
        for (const img of result.images) {
          if (typeof img === 'string') {
            images.push(img);
          } else if (img && typeof img === 'object' && img.url) {
            images.push(img.url);
          }
        }
      } else if (result.image) {
        if (typeof result.image === 'string') {
          images.push(result.image);
        } else if (result.image.url) {
          images.push(result.image.url);
        }
      }

      // Build response with optional prompt optimization info
      const responseData: Record<string, unknown> = {
        success: true,
        images,
        remainingCredits,
        creditsDeducted: actualCreditsDeducted,
        freeAccess: hasFreeAccess
      };
      
      // Include prompt optimization details if optimization was performed for FLUX 2
      if (promptOptimizationResult && !promptOptimizationResult.skipped) {
        responseData.promptOptimization = {
          originalPrompt: trimmedPrompt,
          optimizedPrompt: promptOptimizationResult.optimizedPrompt,
          reasoning: promptOptimizationResult.reasoning
        };
      }
      
      res.json(responseData);
    } catch (error) {
      const err = error as Error;
      logger.error('Image generation error:', { error: err.message });
      // Refund credits on unexpected error
      const user = req.user;
      const creditsRequired = req.creditsRequired || 1;
      if (user) {
        await refundCredits(user, creditsRequired, `Image generation error: ${err.message}`);
      }
      res.status(500).json({
        success: false,
        error: err.message,
        creditsRefunded: user ? creditsRequired : 0
      });
    }
  });

  /**
   * FLUX 2 Image Editing with Streaming
   * POST /api/generate/image-stream
   * Uses Server-Sent Events for real-time progress updates
   */
  router.post('/image-stream', requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    
    const sendEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const user = req.user;
      if (!user) {
        sendEvent('error', { error: 'User authentication required' });
        res.end();
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        sendEvent('error', { error: 'AI service not configured' });
        res.end();
        return;
      }

      const creditsRequired = req.creditsRequired || 1;
      const hasFreeAccess = req.hasFreeAccess || false;
      
      // Deduct credits atomically (skip for free access users)
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        sendEvent('error', { error: 'User account required' });
        res.end();
        return;
      }

      // Skip credit deduction for NFT/Token holders with free access
      let remainingCredits = user.credits || 0;
      let actualCreditsDeducted = 0;
      
      if (!hasFreeAccess) {
        const updateResult = await User.findOneAndUpdate(
          {
            ...updateQuery,
            credits: { $gte: creditsRequired }
          },
          {
            $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
          },
          { new: true }
        );

        if (!updateResult) {
          sendEvent('error', { error: 'Insufficient credits' });
          res.end();
          return;
        }
        remainingCredits = updateResult.credits;
        actualCreditsDeducted = creditsRequired;
        sendEvent('credits', { 
          creditsDeducted: creditsRequired, 
          remainingCredits 
        });
      } else {
        logger.info('Free generation (streaming) - no credits deducted', {
          userId: user.userId || user.walletAddress,
          creditsWouldHaveCost: creditsRequired
        });
        sendEvent('credits', { 
          creditsDeducted: 0, 
          remainingCredits,
          freeAccess: true 
        });
      }

      // Extract request parameters
      const {
        prompt,
        image_url,
        image_urls,
        seed,
        numImages = 1,
        aspect_ratio,
        optimizePrompt = false
      } = req.body as {
        prompt?: string;
        image_url?: string;
        image_urls?: string[];
        seed?: number;
        numImages?: number;
        aspect_ratio?: string;
        optimizePrompt?: boolean;
      };

      // Build image_urls array
      const imageUrlsArray: string[] = [];
      if (image_urls && Array.isArray(image_urls)) {
        imageUrlsArray.push(...image_urls);
      } else if (image_url) {
        imageUrlsArray.push(image_url);
      }

      const hasImages = imageUrlsArray.length > 0;
      const isTextToImage = !hasImages;
      
      // Prompt is required for text-to-image, optional for image-to-image (variation mode)
      const trimmedPrompt = (prompt && typeof prompt === 'string') ? prompt.trim() : '';
      if (isTextToImage && !trimmedPrompt) {
        sendEvent('error', { error: 'prompt is required for text-to-image generation' });
        res.end();
        return;
      }

      // Apply FLUX 2 prompt optimization if requested
      // For image-to-image with no prompt, use a default variation prompt that preserves pose/position
      let finalPrompt = trimmedPrompt || (hasImages ? 'create variations of all features except pose and position' : '');
      let streamPromptOptimization: ImageEditOptimizationResult | Flux2T2IOptimizationResult | null = null;
      
      if (optimizePrompt && trimmedPrompt) {
        sendEvent('status', { 
          message: isTextToImage ? 'Optimizing prompt for FLUX 2 generation...' : 'Optimizing prompt for FLUX 2 editing...', 
          progress: 5 
        });
        try {
          if (isTextToImage) {
            // Use text-to-image optimization
            streamPromptOptimization = await optimizePromptForFlux2T2I(trimmedPrompt);
          } else {
            // Use edit-specific optimization
            streamPromptOptimization = await optimizePromptForFlux2Edit(trimmedPrompt);
          }
          
          if (streamPromptOptimization && !streamPromptOptimization.skipped && streamPromptOptimization.optimizedPrompt) {
            finalPrompt = streamPromptOptimization.optimizedPrompt;
            sendEvent('promptOptimized', {
              originalPrompt: trimmedPrompt,
              optimizedPrompt: finalPrompt,
              reasoning: streamPromptOptimization.reasoning
            });
          }
        } catch (err) {
          logger.warn('FLUX 2 streaming prompt optimization failed', { error: (err as Error).message });
        }
      }

      sendEvent('status', { 
        message: isTextToImage ? 'Starting FLUX 2 generation...' : 'Starting FLUX 2 image editing...', 
        progress: 10 
      });

      // Build request body based on mode
      let requestBody: Record<string, unknown>;
      let queueEndpoint: string;

      if (isTextToImage) {
        // FLUX 2 Text-to-Image
        queueEndpoint = 'https://queue.fal.run/fal-ai/flux-2';
        
        // Convert aspect ratio to image_size format
        const aspectToSize: Record<string, string> = {
          '1:1': 'square',
          '4:3': 'landscape_4_3',
          '16:9': 'landscape_16_9',
          '3:4': 'portrait_4_3',
          '9:16': 'portrait_16_9'
        };
        
        requestBody = {
          prompt: finalPrompt, // Use optimized prompt if available
          guidance_scale: 2.5,
          num_inference_steps: 28,
          num_images: numImages,
          image_size: aspect_ratio ? (aspectToSize[aspect_ratio] || 'landscape_4_3') : 'landscape_4_3',
          output_format: 'png',
          enable_safety_checker: false,
          acceleration: 'regular',
          ...(seed !== undefined && { seed })
        };
      } else {
        // FLUX 2 Image Editing
        queueEndpoint = 'https://queue.fal.run/fal-ai/flux-2/edit';
        
        requestBody = {
          prompt: finalPrompt, // Use optimized prompt if available
          image_urls: imageUrlsArray,
          guidance_scale: 2.5,
          num_inference_steps: 28,
          num_images: numImages,
          output_format: 'png',
          enable_safety_checker: false,
          acceleration: 'regular',
          ...(seed !== undefined && { seed })
        };
      }

      logger.debug('FLUX 2 streaming request', { 
        endpoint: queueEndpoint, 
        mode: isTextToImage ? 'text-to-image' : 'edit',
        imageCount: imageUrlsArray.length 
      });
      
      // Submit to queue
      const submitResponse = await fetch(queueEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        logger.error('FLUX 2 queue submit error', { status: submitResponse.status, error: errorText });
        // Refund credits on queue submit failure (only if credits were actually deducted)
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, `FLUX 2 queue submit error: ${submitResponse.status}`);
        }
        sendEvent('error', { error: `Failed to start generation: ${submitResponse.status}`, creditsRefunded: actualCreditsDeducted });
        res.end();
        return;
      }

      const queueData = await submitResponse.json() as { request_id: string };
      const requestId = queueData.request_id;
      
      // Determine the model path for polling based on mode
      const modelPath = isTextToImage ? 'fal-ai/flux-2' : 'fal-ai/flux-2/edit';

      sendEvent('status', { message: 'Processing...', progress: 10, requestId });

      // Poll for status
      let completed = false;
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max with 1s intervals
      
      while (!completed && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;

        const statusResponse = await fetch(
          `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
          {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          }
        );

        if (!statusResponse.ok) {
          continue;
        }

        const statusData = await statusResponse.json() as { 
          status: string; 
          logs?: Array<{ message: string }>; 
          queue_position?: number 
        };
        
        const streamStatus = normalizeStatus(statusData.status);
        if (streamStatus === FAL_STATUS.IN_QUEUE) {
          const queuePos = statusData.queue_position ?? 0;
          sendEvent('status', { 
            message: `In queue (position: ${queuePos})...`, 
            progress: 15,
            queuePosition: queuePos
          });
        } else if (streamStatus === FAL_STATUS.IN_PROGRESS) {
          // Send progress based on attempts
          const progress = Math.min(20 + (attempts * 2), 90);
          sendEvent('status', { 
            message: 'Generating...', 
            progress,
            logs: statusData.logs?.map(l => l.message) 
          });
        } else if (isStatusCompleted(streamStatus)) {
          completed = true;
          sendEvent('status', { message: 'Finalizing...', progress: 95 });
        } else if (isStatusFailed(streamStatus)) {
          // Refund credits on generation failure (only if credits were actually deducted)
          if (actualCreditsDeducted > 0) {
            await refundCredits(user, actualCreditsDeducted, 'FLUX 2 streaming generation failed');
          }
          sendEvent('error', { error: 'Generation failed', creditsRefunded: actualCreditsDeducted });
          res.end();
          return;
        }
      }

      if (!completed) {
        // Refund credits on timeout (only if credits were actually deducted)
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, 'FLUX 2 streaming generation timed out');
        }
        sendEvent('error', { error: 'Generation timed out', creditsRefunded: actualCreditsDeducted });
        res.end();
        return;
      }

      // Fetch result
      const resultResponse = await fetch(
        `https://queue.fal.run/${modelPath}/requests/${requestId}`,
        {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        }
      );

      if (!resultResponse.ok) {
        // Refund credits if result fetch fails (only if credits were actually deducted)
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, 'Failed to fetch FLUX 2 streaming result');
        }
        sendEvent('error', { error: 'Failed to fetch result', creditsRefunded: actualCreditsDeducted });
        res.end();
        return;
      }

      const result = await resultResponse.json() as FalImageResponse;

      // Extract image URLs
      const images: string[] = [];
      if (result.images && Array.isArray(result.images)) {
        for (const img of result.images) {
          if (typeof img === 'string') {
            images.push(img);
          } else if (img && typeof img === 'object' && img.url) {
            images.push(img.url);
          }
        }
      }

      sendEvent('complete', {
        success: true,
        images,
        remainingCredits,
        creditsDeducted: hasFreeAccess ? 0 : creditsRequired,
        freeAccess: hasFreeAccess
      });
      
      res.end();
    } catch (error) {
      const err = error as Error;
      logger.error('FLUX 2 streaming error:', { error: err.message });
      // Refund credits on unexpected error (only if not a free access user)
      const user = req.user;
      const creditsRequired = req.creditsRequired || 1;
      const hasFreeAccess = req.hasFreeAccess || false;
      // Only refund if credits were actually deducted (non-free users)
      if (user && !hasFreeAccess) {
        await refundCredits(user, creditsRequired, `FLUX 2 streaming error: ${err.message}`);
      }
      const creditsRefunded = (user && !hasFreeAccess) ? creditsRequired : 0;
      sendEvent('error', { error: err.message, creditsRefunded });
      res.end();
    }
  });

  /**
   * Generate video - Veo 3.1 (multiple modes supported)
   * POST /api/generate/video
   * Modes: text-to-video, image-to-video, first-last-frame
   */
  router.post('/video', requireCreditsForVideo(), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured'
        });
        return;
      }

      // Extract video generation parameters
      const {
        prompt,
        first_frame_url,
        last_frame_url,
        aspect_ratio = 'auto',
        duration = '8s',
        resolution = '720p',
        generate_audio = true,
        generation_mode = 'first-last-frame',
        quality = 'fast',
        model = 'veo'
      } = req.body as {
        prompt?: string;
        first_frame_url?: string;
        last_frame_url?: string;
        aspect_ratio?: string;
        duration?: string;
        resolution?: string;
        generate_audio?: boolean;
        generation_mode?: string;
        quality?: string;
        model?: string;
      };

      // Generation mode configurations for Veo 3.1
      const VIDEO_GENERATION_MODES: Record<string, { requiresFirstFrame: boolean; requiresLastFrame: boolean; endpoint: string }> = {
        'text-to-video': {
          requiresFirstFrame: false,
          requiresLastFrame: false,
          endpoint: ''
        },
        'image-to-video': {
          requiresFirstFrame: true,
          requiresLastFrame: false,
          endpoint: 'image-to-video'
        },
        'first-last-frame': {
          requiresFirstFrame: true,
          requiresLastFrame: true,
          endpoint: 'first-last-frame-to-video'
        }
      };

      const modeConfig = VIDEO_GENERATION_MODES[generation_mode] || VIDEO_GENERATION_MODES['first-last-frame'];

      // Validate model parameter
      const validModels = ['veo', 'ltx'];
      if (!validModels.includes(model)) {
        res.status(400).json({ success: false, error: 'model must be veo (quality) or ltx (cheap)' });
        return;
      }

      // LTX-2 doesn't support first-last-frame mode
      if (model === 'ltx' && generation_mode === 'first-last-frame') {
        res.status(400).json({ success: false, error: 'LTX-2 model only supports text-to-video and image-to-video modes' });
        return;
      }

      // Calculate credits based on duration, audio, quality, and model using shared utility (20% markup for Claw clients)
      const creditsToDeduct = applyClawMarkup(req, calculateVideoCredits(duration, generate_audio, quality, model));

      // Deduct credits atomically
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account required'
        });
        return;
      }

      const updateResult = await User.findOneAndUpdate(
        {
          ...updateQuery,
          credits: { $gte: creditsToDeduct }
        },
        {
          $inc: { credits: -creditsToDeduct, totalCreditsSpent: creditsToDeduct }
        },
        { new: true }
      );

      if (!updateResult) {
        const currentUser = await User.findOne(updateQuery);
        const currentCredits = currentUser?.credits || 0;
        res.status(402).json({
          success: false,
          error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsToDeduct}.`
        });
        return;
      }

      // Validate required inputs
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({ success: false, error: 'prompt is required and must be a non-empty string' });
        return;
      }

      // Translate Japanese/Chinese prompts to English for better AI results
      let videoPrompt = prompt.trim();
      try {
        const translationResult = await translateAsianToEnglish(videoPrompt);
        if (translationResult.wasTranslated) {
          logger.info('Video prompt translated', {
            sourceLanguage: translationResult.sourceLanguage,
            originalLength: videoPrompt.length,
            translatedLength: translationResult.translatedPrompt.length
          });
          videoPrompt = translationResult.translatedPrompt;
        }
      } catch (err) {
        logger.warn('Translation failed for video, using original', { error: (err as Error).message });
      }

      if (modeConfig.requiresFirstFrame && !first_frame_url) {
        res.status(400).json({ success: false, error: 'first_frame_url is required for this mode' });
        return;
      }

      if (modeConfig.requiresLastFrame && !last_frame_url) {
        res.status(400).json({ success: false, error: 'last_frame_url is required for this mode' });
        return;
      }

      // Validate aspect_ratio, duration, resolution, quality
      const validAspectRatios = ['auto', '16:9', '9:16'];
      if (!validAspectRatios.includes(aspect_ratio)) {
        res.status(400).json({ success: false, error: 'aspect_ratio must be auto, 16:9, or 9:16' });
        return;
      }

      // Validate duration based on model
      const validVeoDurations = ['4s', '6s', '8s'];
      if (model === 'veo' && !validVeoDurations.includes(duration)) {
        res.status(400).json({ success: false, error: 'duration must be 4s, 6s, or 8s for Veo model' });
        return;
      }
      // LTX-2 accepts duration in seconds (we'll convert '4s' format to number)
      const ltxDurationSeconds = parseInt(duration.replace('s', '')) || 5;
      if (model === 'ltx' && (ltxDurationSeconds < 1 || ltxDurationSeconds > 10)) {
        res.status(400).json({ success: false, error: 'duration must be between 1-10 seconds for LTX model' });
        return;
      }

      const validResolutions = ['720p', '1080p'];
      if (!validResolutions.includes(resolution)) {
        res.status(400).json({ success: false, error: 'resolution must be 720p or 1080p' });
        return;
      }

      const validQualities = ['fast', 'quality'];
      if (!validQualities.includes(quality)) {
        res.status(400).json({ success: false, error: 'quality must be fast or quality' });
        return;
      }

      // Build request body based on model
      const apiAspectRatio = aspect_ratio === 'auto' ? '16:9' : aspect_ratio;
      let requestBody: Record<string, unknown>;
      let endpoint: string;
      let modelPath: string;

      if (model === 'ltx') {
        // LTX-2 19B model - cheaper option
        // Convert aspect ratio to video_size format for LTX-2
        const ltxVideoSizeMap: Record<string, string> = {
          '16:9': 'landscape_16_9',
          '9:16': 'portrait_16_9',
          '1:1': 'square',
          '4:3': 'landscape_4_3',
          '3:4': 'portrait_4_3'
        };
        const ltxVideoSize = ltxVideoSizeMap[apiAspectRatio] || 'landscape_16_9';

        // Convert duration to num_frames (25 fps)
        const numFrames = Math.min(121, Math.max(25, ltxDurationSeconds * 25));

        requestBody = {
          prompt: videoPrompt,
          video_size: ltxVideoSize,
          num_frames: numFrames,
          generate_audio,
          guidance_scale: 10, // High for strong prompt adherence
          num_inference_steps: 50 // More steps for better quality (default was 40)
        };

        // LTX-2 endpoints
        if (generation_mode === 'image-to-video' && first_frame_url) {
          requestBody.image_url = first_frame_url;
          requestBody.strength = 0.4; // Prompt-driven: 40% image, 60% prompt influence
          endpoint = 'https://queue.fal.run/fal-ai/ltx-2-19b/image-to-video';
          modelPath = 'fal-ai/ltx-2-19b/image-to-video';
        } else {
          endpoint = 'https://queue.fal.run/fal-ai/ltx-2-19b/text-to-video';
          modelPath = 'fal-ai/ltx-2-19b/text-to-video';
        }
      } else {
        // Veo 3.1 model - quality option (existing)
        requestBody = {
          prompt: videoPrompt,
          aspect_ratio: apiAspectRatio,
          duration,
          resolution,
          generate_audio
        };

        // Add frame URLs based on mode for Veo
        if (modeConfig.requiresFirstFrame && first_frame_url) {
          if (generation_mode === 'image-to-video') {
            requestBody.image_url = first_frame_url;
          } else {
            requestBody.first_frame_url = first_frame_url;
          }
        }
        if (modeConfig.requiresLastFrame && last_frame_url) {
          requestBody.last_frame_url = last_frame_url;
        }

        // Veo 3.1 endpoints
        if (generation_mode === 'text-to-video') {
          endpoint = 'https://queue.fal.run/fal-ai/veo3.1';
          modelPath = 'fal-ai/veo3.1';
        } else {
          endpoint = `https://queue.fal.run/fal-ai/veo3.1/fast/${modeConfig.endpoint}`;
          modelPath = `fal-ai/veo3.1/fast/${modeConfig.endpoint}`;
        }
      }

      logger.info('Video generation request', {
        model: model === 'ltx' ? 'ltx-2-19b' : 'veo3.1',
        mode: generation_mode,
        quality,
        duration,
        resolution,
        aspect_ratio: apiAspectRatio,
        promptLength: prompt.length,
        hasFirstFrame: !!first_frame_url,
        hasLastFrame: !!last_frame_url,
        userId: user.userId
      });

      // Submit to FAL queue
      const submitResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!submitResponse.ok) {
        let errorMessage = `HTTP error! status: ${submitResponse.status}`;
        try {
          const errorData = await submitResponse.json() as { detail?: string | unknown[]; error?: string };
          logger.error('Veo 3.1 API submit error', { errorData });
          if (errorData.detail) {
            errorMessage = Array.isArray(errorData.detail)
              ? errorData.detail.map(err => typeof err === 'object' && err !== null ? (err as { msg?: string }).msg || JSON.stringify(err) : String(err)).join('; ')
              : String(errorData.detail);
          } else if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          logger.error('Failed to parse Veo 3.1 error response');
        }
        // Refund credits on video submit failure
        await refundCredits(user, creditsToDeduct, `Veo 3.1 submit error: ${submitResponse.status}`);
        res.status(submitResponse.status).json({ success: false, error: errorMessage, creditsRefunded: creditsToDeduct });
        return;
      }

      const submitData = await submitResponse.json() as {
        request_id?: string;
        requestId?: string;
        id?: string;
        status_url?: string;
        response_url?: string;
        video?: { url?: string; content_type?: string; file_name?: string; file_size?: number } | string;
        data?: { video?: { url?: string } | string };
        output?: { video?: { url?: string }; url?: string };
        url?: string;
        video_url?: string;
      };

      // Log FULL submit response for debugging
      logger.info('Video submit response FULL', { 
        submitDataKeys: Object.keys(submitData),
        submitData: JSON.stringify(submitData).substring(0, 500),
        hasStatusUrl: !!submitData.status_url,
        hasResponseUrl: !!submitData.response_url
      });

      const requestId = submitData.request_id || submitData.requestId || submitData.id;
      const providedStatusUrl = submitData.status_url;
      const providedResponseUrl = submitData.response_url;

      if (!requestId) {
        logger.error('No request_id in submit response', { submitData: JSON.stringify(submitData).substring(0, 500) });
        res.status(500).json({ success: false, error: 'Failed to submit video generation request.' });
        return;
      }

      logger.info('Video generation submitted', { requestId, endpoint, modelPath, hasProvidedStatusUrl: !!providedStatusUrl });

      // Log polling endpoints for debugging
      logger.debug('Polling endpoints will be', { 
        statusEndpoint: providedStatusUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
        resultEndpoint: providedResponseUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}`
      });

      // Check if already completed synchronously
      let syncVideoUrl: string | null = null;
      let syncVideoMeta: { content_type?: string; file_name?: string; file_size?: number } | null = null;

      if (submitData.video && typeof submitData.video === 'object' && submitData.video.url) {
        syncVideoUrl = submitData.video.url;
        syncVideoMeta = submitData.video;
      } else if (submitData.video && typeof submitData.video === 'string') {
        syncVideoUrl = submitData.video;
      } else if (submitData.data?.video && typeof submitData.data.video === 'object' && submitData.data.video.url) {
        syncVideoUrl = submitData.data.video.url;
      } else if (submitData.data?.video && typeof submitData.data.video === 'string') {
        syncVideoUrl = submitData.data.video;
      } else if (submitData.output?.video && typeof submitData.output.video === 'object' && submitData.output.video.url) {
        syncVideoUrl = submitData.output.video.url;
      } else if (submitData.url) {
        syncVideoUrl = submitData.url;
      } else if (submitData.video_url) {
        syncVideoUrl = submitData.video_url;
      } else if (submitData.output?.url) {
        syncVideoUrl = submitData.output.url;
      }

      if (syncVideoUrl) {
        logger.info('Video completed synchronously', { requestId });
        res.json({
          success: true,
          video: {
            url: syncVideoUrl,
            content_type: syncVideoMeta?.content_type || 'video/mp4',
            file_name: syncVideoMeta?.file_name || `video-${requestId}.mp4`,
            file_size: syncVideoMeta?.file_size
          },
          remainingCredits: updateResult.credits,
          creditsDeducted: creditsToDeduct
        });
        return;
      }

      // Poll for completion
      const statusEndpoint = providedStatusUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}/status`;
      const resultEndpoint = providedResponseUrl || `https://queue.fal.run/${modelPath}/requests/${requestId}`;

      const maxWaitTime = 10 * 60 * 1000; // 10 minutes (Veo 3.1 can take longer for quality/longer durations)
      const pollInterval = 3000; // Poll every 3 seconds to reduce load
      const startTime = Date.now();
      let firstCheck = true;

      while (Date.now() - startTime < maxWaitTime) {
        if (!firstCheck) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        firstCheck = false;

        const statusResponse = await fetch(statusEndpoint, {
          headers: { 'Authorization': `Key ${FAL_API_KEY}` }
        });

        if (!statusResponse.ok) {
          let errorBody = '';
          try {
            errorBody = await statusResponse.text();
          } catch { /* ignore */ }
          logger.warn('Video status check failed', { 
            status: statusResponse.status, 
            statusText: statusResponse.statusText,
            statusEndpoint,
            errorBody: errorBody.substring(0, 300)
          });
          continue;
        }

        const statusData = await statusResponse.json() as {
          status?: string;
          video?: { url?: string; content_type?: string; file_name?: string; file_size?: number };
          data?: { video?: { url?: string } };
          output?: { video?: { url?: string } };
          response?: { video?: { url?: string } };
          result?: { video?: { url?: string } };
          payload?: { video?: { url?: string } };
          response_url?: string;
        };

        const normalizedStatus = (statusData.status || '').toUpperCase();

        logger.info('Video polling status', { 
          requestId, 
          status: statusData.status,
          normalizedStatus,
          pollCount: Math.round((Date.now() - startTime) / pollInterval),
          elapsed: Math.round((Date.now() - startTime) / 1000) + 's',
          hasVideo: !!(statusData.video || statusData.data?.video || statusData.response?.video || statusData.result?.video),
          responseKeys: Object.keys(statusData),
          fullResponse: JSON.stringify(statusData).substring(0, 500)
        });

        // Check if status response contains video
        let statusVideoUrl: string | null = null;
        let statusVideoMeta: { content_type?: string; file_name?: string; file_size?: number } | null = null;

        if (statusData.video?.url) {
          statusVideoUrl = statusData.video.url;
          statusVideoMeta = statusData.video;
        } else if (statusData.data?.video?.url) {
          statusVideoUrl = statusData.data.video.url;
        } else if (statusData.output?.video?.url) {
          statusVideoUrl = statusData.output.video.url;
        } else if (statusData.response?.video?.url) {
          statusVideoUrl = statusData.response.video.url;
        } else if (statusData.result?.video?.url) {
          statusVideoUrl = statusData.result.video.url;
        } else if (statusData.payload?.video?.url) {
          statusVideoUrl = statusData.payload.video.url;
        }

        if (statusVideoUrl) {
          logger.info('Video found in status response', { requestId });
          res.json({
            success: true,
            video: {
              url: statusVideoUrl,
              content_type: statusVideoMeta?.content_type || 'video/mp4',
              file_name: statusVideoMeta?.file_name || `video-${requestId}.mp4`,
              file_size: statusVideoMeta?.file_size
            },
            remainingCredits: updateResult.credits,
            creditsDeducted: creditsToDeduct
          });
          return;
        }

        // Check for completed status
        if (isStatusCompleted(normalizedStatus)) {
          const fetchUrl = statusData.response_url || resultEndpoint;
          logger.info('Fetching video result', { requestId, fetchUrl, hasResponseUrl: !!statusData.response_url });
          
          const resultResponse = await fetch(fetchUrl, {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          });

          if (!resultResponse.ok) {
            let errorDetails = '';
            try {
              const errorBody = await resultResponse.text();
              errorDetails = errorBody.substring(0, 500);
            } catch { /* ignore */ }
            logger.error('Failed to fetch video result', { 
              requestId,
              status: resultResponse.status, 
              statusText: resultResponse.statusText,
              fetchUrl,
              errorDetails
            });
            // Refund credits on fetch result failure
            await refundCredits(user, creditsToDeduct, `Failed to fetch video result: ${resultResponse.status}`);
            res.status(500).json({ success: false, error: `Failed to fetch video result (${resultResponse.status})`, creditsRefunded: creditsToDeduct });
            return;
          }

          const resultData = await resultResponse.json() as {
            video?: { url?: string; content_type?: string; file_name?: string; file_size?: number } | string;
            data?: { video?: { url?: string } | string };
            output?: { video?: { url?: string }; url?: string };
            response?: { video?: { url?: string } };
            result?: { video?: { url?: string } | string };
            payload?: { video?: { url?: string } };
            url?: string;
            video_url?: string;
          };

          // Log full response for debugging
          logger.info('Video result response FULL', { 
            requestId,
            fullResponse: JSON.stringify(resultData).substring(0, 1000),
            hasVideo: !!resultData.video,
            hasDataVideo: !!(resultData.data?.video),
            responseKeys: Object.keys(resultData)
          });

          // Extract video URL from result
          let videoUrl: string | null = null;
          let videoMeta: { content_type?: string; file_name?: string; file_size?: number } | null = null;

          if (resultData.video && typeof resultData.video === 'object' && resultData.video.url) {
            videoUrl = resultData.video.url;
            videoMeta = resultData.video;
          } else if (resultData.data?.video && typeof resultData.data.video === 'object' && resultData.data.video.url) {
            videoUrl = resultData.data.video.url;
          } else if (resultData.output?.video && typeof resultData.output.video === 'object' && resultData.output.video.url) {
            videoUrl = resultData.output.video.url;
          } else if (resultData.response?.video?.url) {
            videoUrl = resultData.response.video.url;
          } else if (resultData.result?.video && typeof resultData.result.video === 'object' && resultData.result.video.url) {
            videoUrl = resultData.result.video.url;
          } else if (resultData.payload?.video?.url) {
            videoUrl = resultData.payload.video.url;
          } else if (resultData.data?.video && typeof resultData.data.video === 'string') {
            videoUrl = resultData.data.video;
          } else if (resultData.video && typeof resultData.video === 'string') {
            videoUrl = resultData.video;
          } else if (resultData.result?.video && typeof resultData.result.video === 'string') {
            videoUrl = resultData.result.video;
          } else if (resultData.url) {
            videoUrl = resultData.url;
          } else if (resultData.video_url) {
            videoUrl = resultData.video_url;
          } else if (resultData.output?.url) {
            videoUrl = resultData.output.url;
          }

          if (videoUrl) {
            logger.info('Video generation completed - RETURNING', { requestId, videoUrl: videoUrl.substring(0, 100) });
            res.json({
              success: true,
              video: {
                url: videoUrl,
                content_type: videoMeta?.content_type || 'video/mp4',
                file_name: videoMeta?.file_name || `video-${requestId}.mp4`,
                file_size: videoMeta?.file_size
              },
              remainingCredits: updateResult.credits,
              creditsDeducted: creditsToDeduct
            });
            return;
          }

          logger.error('No video URL in result - all extraction attempts failed', { 
            requestId,
            resultData: JSON.stringify(resultData).substring(0, 1000),
            checkedPaths: ['video.url', 'data.video.url', 'output.video.url', 'response.video.url', 'result.video.url', 'payload.video.url', 'url', 'video_url', 'output.url']
          });
          // Refund credits when video URL not found
          await refundCredits(user, creditsToDeduct, 'Video completed but no URL found');
          res.status(500).json({ success: false, error: 'Video generation completed but no video URL found', creditsRefunded: creditsToDeduct });
          return;
        }

        // Check for failed status
        if (isStatusFailed(normalizedStatus)) {
          logger.error('Video generation failed', { requestId, status: normalizedStatus });
          // Refund credits on generation failure
          await refundCredits(user, creditsToDeduct, `Video generation failed: ${normalizedStatus}`);
          res.status(500).json({ success: false, error: 'Video generation failed', creditsRefunded: creditsToDeduct });
          return;
        }
      }

      // Timeout
      logger.error('Video generation timeout', { requestId, elapsed: maxWaitTime / 1000 + 's' });
      // Refund credits on timeout
      await refundCredits(user, creditsToDeduct, 'Video generation timed out');
      res.status(504).json({ success: false, error: 'Video generation timed out. Please try again.', creditsRefunded: creditsToDeduct });
    } catch (error) {
      const err = error as Error;
      logger.error('Video generation error:', { error: err.message });
      // Refund credits on unexpected error
      const user = req.user;
      // Calculate credits for refund using shared utility
      const { duration = '8s', generate_audio = true, quality = 'fast', model = 'veo' } = req.body as {
        duration?: string;
        generate_audio?: boolean;
        quality?: string;
        model?: string;
      };
      const creditsToRefund = applyClawMarkup(req, calculateVideoCredits(duration, generate_audio, quality, model));
      if (user) {
        await refundCredits(user, creditsToRefund, `Video generation error: ${err.message}`);
      }
      res.status(500).json({
        success: false,
        error: err.message,
        creditsRefunded: user ? creditsToRefund : 0
      });
    }
  });

  /**
   * Generate music
   * POST /api/generate/music
   */
  router.post('/music', requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      // Parse request body first to calculate credits based on duration
      const { prompt, duration = 30, optimizePrompt = false, selectedGenre = null } = req.body as {
        prompt?: string;
        duration?: number;
        optimizePrompt?: boolean;
        selectedGenre?: string | null;
      };
      
      // Clamp duration between 10 and 180 seconds
      const clampedDuration = Math.max(10, Math.min(180, duration));

      // Calculate credits based on duration using shared utility
      const creditsRequired = applyClawMarkup(req, calculateMusicCredits(clampedDuration));
      const hasFreeAccess = req.hasFreeAccess || false;
      
      // Deduct credits (skip for free access users)
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account required'
        });
        return;
      }

      // Skip credit deduction for NFT/Token holders with free access
      let remainingCredits = user.credits || 0;
      let actualCreditsDeducted = 0;
      
      if (!hasFreeAccess) {
        const updateResult = await User.findOneAndUpdate(
          {
            ...updateQuery,
            credits: { $gte: creditsRequired }
          },
          {
            $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
          },
          { new: true }
        );

        if (!updateResult) {
          const currentUser = await User.findOne(updateQuery);
          const currentCredits = currentUser?.credits || 0;
          res.status(402).json({
            success: false,
            error: `Insufficient credits. You have ${currentCredits} credit${currentCredits !== 1 ? 's' : ''} but need ${creditsRequired}.`
          });
          return;
        }
        remainingCredits = updateResult.credits;
        actualCreditsDeducted = creditsRequired;
      } else {
        logger.info('Free music generation - no credits deducted', {
          userId: user.userId || user.walletAddress,
          creditsWouldHaveCost: creditsRequired
        });
      }

      // Submit to FAL - CassetteAI Music Generator
      // Documentation: https://fal.ai/models/cassetteai/music-generator/api

      // Check FAL API key is configured
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        logger.error('Music generation failed: FAL_API_KEY not configured');
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }

      // Validate prompt
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      // Translate Japanese/Chinese prompts to English for better AI results
      let musicPrompt = prompt.trim();
      try {
        const translationResult = await translateAsianToEnglish(musicPrompt);
        if (translationResult.wasTranslated) {
          logger.info('Music prompt translated', {
            sourceLanguage: translationResult.sourceLanguage,
            originalLength: musicPrompt.length,
            translatedLength: translationResult.translatedPrompt.length
          });
          musicPrompt = translationResult.translatedPrompt;
        }
      } catch (err) {
        logger.warn('Translation failed for music, using original', { error: (err as Error).message });
      }

      // Optimize prompt if enabled (off by default)
      let finalPrompt = musicPrompt;
      let promptOptimizationResult: MusicOptimizationResult | null = null;

      if (optimizePrompt) {
        try {
          promptOptimizationResult = await optimizePromptForMusic(musicPrompt, selectedGenre);

          if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
            finalPrompt = promptOptimizationResult.optimizedPrompt;
            logger.debug('Music prompt optimized', { 
              original: musicPrompt.substring(0, 50),
              optimized: finalPrompt.substring(0, 50),
              selectedGenre
            });
          } else {
            logger.debug('Music prompt optimization skipped or returned no result, using original prompt');
          }
        } catch (optError) {
          const err = optError as Error;
          logger.warn('Music prompt optimization failed, using original prompt', { error: err.message });
          promptOptimizationResult = null;
        }
      }
      
      const musicModel = 'CassetteAI/music-generator';
      const result = await submitToQueue<{ request_id?: string }>(musicModel, {
        prompt: finalPrompt,
        duration: clampedDuration
      });

      const requestId = result.request_id;
      if (!requestId) {
        res.status(500).json({ success: false, error: 'Failed to submit music generation request' });
        return;
      }

      logger.info('Music generation submitted', { requestId });

      // Poll for completion (music generation is fast: 30s in ~2s, 3min in ~10s)
      const maxWaitTime = 60 * 1000; // 1 minute max wait (should be much faster)
      const pollInterval = 500; // Poll every 500ms for faster response
      const startTime = Date.now();
      let pollCount = 0;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 5;

      while (Date.now() - startTime < maxWaitTime) {
        // First poll happens immediately, then wait between polls
        if (pollCount > 0) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
        pollCount++;

        try {
          const statusData = await checkQueueStatus<{ status?: string; response?: { audio_file?: { url?: string } } }>(requestId, musicModel);
          consecutiveErrors = 0; // Reset on successful poll

          // Normalize status to uppercase for comparison
          const normalizedStatus = (statusData.status || '').toUpperCase();

          logger.debug('Music polling status', { 
            requestId, 
            status: statusData.status,
            normalizedStatus,
            pollCount,
            elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
          });

          if (isStatusCompleted(normalizedStatus)) {
            // Fetch the result
            const resultData = await getQueueResult<{ audio_file?: { url?: string; content_type?: string; file_name?: string; file_size?: number } }>(requestId, musicModel);

            if (resultData.audio_file && resultData.audio_file.url) {
              logger.info('Music generation completed', {
                requestId,
                audioUrl: resultData.audio_file.url.substring(0, 50) + '...',
                wasOptimized: promptOptimizationResult && !promptOptimizationResult.skipped,
                totalPolls: pollCount,
                elapsedMs: Date.now() - startTime
              });

              // Build response
              const responseData: Record<string, unknown> = {
                success: true,
                audio_file: resultData.audio_file,
                remainingCredits,
                creditsDeducted: actualCreditsDeducted,
                freeAccess: hasFreeAccess
              };

              // Add prompt optimization details if optimization was performed
              if (promptOptimizationResult && !promptOptimizationResult.skipped) {
                responseData.promptOptimization = {
                  originalPrompt: prompt.trim(),
                  optimizedPrompt: promptOptimizationResult.optimizedPrompt,
                  reasoning: promptOptimizationResult.reasoning
                };
              }

              res.json(responseData);
              return;
            } else {
              logger.error('Music completed but no audio in response', { requestId, resultData: JSON.stringify(resultData).substring(0, 500) });
              // Refund credits when no audio in response (only if credits were actually deducted)
              if (actualCreditsDeducted > 0) {
                await refundCredits(user, actualCreditsDeducted, 'Music completed but no audio in response');
              }
              res.status(500).json({ success: false, error: 'No audio in response', creditsRefunded: actualCreditsDeducted });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            logger.error('Music generation failed', { requestId, statusData });
            // Refund credits on music generation failure (only if credits were actually deducted)
            if (actualCreditsDeducted > 0) {
              await refundCredits(user, actualCreditsDeducted, `Music generation failed: ${normalizedStatus}`);
            }
            res.status(500).json({ success: false, error: 'Music generation failed', creditsRefunded: actualCreditsDeducted });
            return;
          }

          // Still in progress (IN_QUEUE, IN_PROGRESS, etc.), continue polling
        } catch (pollError) {
          consecutiveErrors++;
          const pollErr = pollError as Error;
          logger.warn('Music polling error', { 
            error: pollErr.message, 
            requestId, 
            pollCount,
            consecutiveErrors
          });

          // If too many consecutive errors, abort
          if (consecutiveErrors >= maxConsecutiveErrors) {
            logger.error('Music generation aborted due to repeated polling errors', { 
              requestId, 
              consecutiveErrors,
              lastError: pollErr.message 
            });
            // Refund credits on repeated polling errors (only if credits were actually deducted)
            if (actualCreditsDeducted > 0) {
              await refundCredits(user, actualCreditsDeducted, 'Music generation polling errors');
            }
            res.status(500).json({ success: false, error: 'Music generation failed - polling errors', creditsRefunded: actualCreditsDeducted });
            return;
          }
        }
      }

      // Timeout reached
      logger.warn('Music generation timed out', { requestId, pollCount, elapsedMs: Date.now() - startTime });
      // Refund credits on timeout (only if credits were actually deducted)
      if (actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, 'Music generation timed out');
      }
      res.status(504).json({ success: false, error: 'Music generation timed out. Please try again.', creditsRefunded: actualCreditsDeducted });
    } catch (error) {
      const err = error as Error;
      logger.error('Music generation error:', { error: err.message });
      // Refund credits on unexpected error (only if not a free access user)
      const user = req.user;
      const hasFreeAccess = req.hasFreeAccess || false;
      // Calculate credits for refund using shared utility
      const { duration = 30 } = req.body as { duration?: number };
      const clampedDuration = Math.max(10, Math.min(180, duration));
      const creditsToRefund = hasFreeAccess ? 0 : applyClawMarkup(req, calculateMusicCredits(clampedDuration));
      if (user && creditsToRefund > 0) {
        await refundCredits(user, creditsToRefund, `Music generation error: ${err.message}`);
      }
      res.status(500).json({
        success: false,
        error: err.message,
        creditsRefunded: creditsToRefund
      });
    }
  });

  /**
   * Check generation status
   * GET /api/generate/status/:requestId
   * SECURITY FIX: Now requires authentication to prevent information disclosure
   */
  router.get('/status/:requestId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Require authentication
      if (!requireAuth(req, res)) return;

      const { requestId } = req.params;
      
      // SECURITY: Validate requestId format to prevent injection
      if (!requestId || !/^[a-zA-Z0-9._-]+$/.test(requestId) || requestId.length > 200) {
        res.status(400).json({
          success: false,
          error: 'Invalid request ID format'
        });
        return;
      }

      const status = await checkQueueStatus<{ status?: string; [key: string]: unknown }>(requestId);
      
      res.json({
        success: true,
        status: status.status,
        ...status
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Status check error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to check status'
      });
    }
  });

  /**
   * Get generation result
   * GET /api/generate/result/:requestId
   * SECURITY FIX: Now requires authentication to prevent information disclosure
   */
  router.get('/result/:requestId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Require authentication
      if (!requireAuth(req, res)) return;

      const { requestId } = req.params;
      
      // SECURITY: Validate requestId format to prevent injection
      if (!requestId || !/^[a-zA-Z0-9._-]+$/.test(requestId) || requestId.length > 200) {
        res.status(400).json({
          success: false,
          error: 'Invalid request ID format'
        });
        return;
      }

      const result = await getQueueResult<Record<string, unknown>>(requestId);
      
      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Result fetch error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch result'
      });
    }
  });

  /**
   * Upscale image
   * POST /api/generate/upscale
   * Uses fal.ai creative-upscaler for 2x/4x upscaling
   */
  router.post('/upscale', requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured'
        });
        return;
      }

      const { image_url, scale = 2 } = req.body as {
        image_url?: string;
        scale?: number;
      };

      if (!image_url) {
        res.status(400).json({
          success: false,
          error: 'image_url is required'
        });
        return;
      }

      // Validate scale (2 or 4)
      const validScale = scale === 4 ? 4 : 2;
      
      // Credits based on scale using shared utility
      const creditsRequired = applyClawMarkup(req, calculateUpscaleCredits(validScale));
      const hasFreeAccess = req.hasFreeAccess || false;

      // Deduct credits atomically (skip for free access users)
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account required'
        });
        return;
      }

      // Skip credit deduction for NFT/Token holders with free access
      let remainingCredits = user.credits || 0;
      let actualCreditsDeducted = 0;
      
      if (!hasFreeAccess) {
        const updateResult = await User.findOneAndUpdate(
          {
            ...updateQuery,
            credits: { $gte: creditsRequired }
          },
          {
            $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
          },
          { new: true }
        );

        if (!updateResult) {
          res.status(402).json({
            success: false,
            error: 'Insufficient credits'
          });
          return;
        }
        remainingCredits = updateResult.credits;
        actualCreditsDeducted = creditsRequired;
      } else {
        logger.info('Free upscale - no credits deducted', {
          userId: user.userId || user.walletAddress,
          creditsWouldHaveCost: creditsRequired
        });
      }

      logger.info('Upscale request', { 
        scale: validScale, 
        userId: user.userId,
        creditsRequired,
        freeAccess: hasFreeAccess
      });

      // Use fal.ai creative-upscaler
      // API: https://fal.ai/models/fal-ai/creative-upscaler/api
      const endpoint = 'https://fal.run/fal-ai/creative-upscaler';
      
      const requestBody = {
        image_url,
        scale: validScale,
        creativity: 0.3, // Low creativity to preserve original
        detail: 1.0,
        shape_preservation: 0.75,
        prompt_suffix: '' // No additional styling
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Upscale API error', { status: response.status, error: errorText });
        // Refund credits on API failure (only if credits were actually deducted)
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, `Upscale API error: ${response.status}`);
        }
        res.status(500).json({
          success: false,
          error: `Upscale failed: ${response.status}`,
          creditsRefunded: actualCreditsDeducted
        });
        return;
      }

      const result = await response.json() as { image?: { url?: string }; images?: Array<{ url?: string }> };

      // Extract upscaled image URL
      let upscaledUrl: string | null = null;
      if (result.image?.url) {
        upscaledUrl = result.image.url;
      } else if (result.images?.[0]?.url) {
        upscaledUrl = result.images[0].url;
      }

      if (!upscaledUrl) {
        // Refund credits if no image returned (only if credits were actually deducted)
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, 'No upscaled image returned');
        }
        res.status(500).json({
          success: false,
          error: 'No upscaled image returned',
          creditsRefunded: actualCreditsDeducted
        });
        return;
      }

      logger.info('Upscale completed', { 
        scale: validScale, 
        userId: user.userId 
      });

      res.json({
        success: true,
        image_url: upscaledUrl,
        scale: validScale,
        remainingCredits,
        creditsDeducted: actualCreditsDeducted,
        freeAccess: hasFreeAccess
      });

    } catch (error) {
      const err = error as Error;
      logger.error('Upscale error:', { error: err.message });
      // Refund credits on unexpected error (only if not a free access user)
      const user = req.user;
      const hasFreeAccess = req.hasFreeAccess || false;
      const { scale = 2 } = req.body as { scale?: number };
      const creditsToRefund = hasFreeAccess ? 0 : applyClawMarkup(req, calculateUpscaleCredits(scale === 4 ? 4 : 2));
      if (user && creditsToRefund > 0) {
        await refundCredits(user, creditsToRefund, `Upscale error: ${err.message}`);
      }
      res.status(500).json({
        success: false,
        error: err.message,
        creditsRefunded: creditsToRefund
      });
    }
  });

  /**
   * Generate audio from video (MMAudio V2)
   * POST /api/generate/video-to-audio
   * Uses fal.ai MMAudio V2 for synchronized audio generation
   */
  router.post('/video-to-audio', requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User authentication required'
        });
        return;
      }

      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({
          success: false,
          error: 'AI service not configured'
        });
        return;
      }

      const { 
        video_url, 
        prompt = '',
        negative_prompt = '',
        num_steps = 25,
        cfg_strength = 4.5,
        duration = 8
      } = req.body as {
        video_url?: string;
        prompt?: string;
        negative_prompt?: string;
        num_steps?: number;
        cfg_strength?: number;
        duration?: number;
      };

      if (!video_url) {
        res.status(400).json({
          success: false,
          error: 'video_url is required'
        });
        return;
      }

      // Credits for video-to-audio generation using shared utility
      const creditsRequired = applyClawMarkup(req, calculateVideoToAudioCredits());
      const hasFreeAccess = req.hasFreeAccess || false;

      // Deduct credits atomically (skip for free access users)
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account required'
        });
        return;
      }

      // Skip credit deduction for NFT/Token holders with free access
      let remainingCredits = user.credits || 0;
      let actualCreditsDeducted = 0;
      
      if (!hasFreeAccess) {
        const updateResult = await User.findOneAndUpdate(
          {
            ...updateQuery,
            credits: { $gte: creditsRequired }
          },
          {
            $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired }
          },
          { new: true }
        );

        if (!updateResult) {
          res.status(402).json({
            success: false,
            error: 'Insufficient credits'
          });
          return;
        }
        remainingCredits = updateResult.credits;
        actualCreditsDeducted = creditsRequired;
      } else {
        logger.info('Free video-to-audio - no credits deducted', {
          userId: user.userId || user.walletAddress,
          creditsWouldHaveCost: creditsRequired
        });
      }

      logger.info('Video-to-audio request', { 
        userId: user.userId,
        hasPrompt: !!prompt,
        duration,
        creditsRequired,
        freeAccess: hasFreeAccess
      });

      // Submit to MMAudio V2 queue
      // API: https://fal.ai/models/fal-ai/mmaudio-v2/api
      const queueEndpoint = 'https://queue.fal.run/fal-ai/mmaudio-v2';
      
      const requestBody: Record<string, unknown> = {
        video_url,
        num_steps: Math.min(50, Math.max(10, num_steps)),
        cfg_strength: Math.min(10, Math.max(1, cfg_strength)),
        duration: Math.min(30, Math.max(1, duration))
      };

      // Add optional prompts
      if (prompt && prompt.trim()) {
        requestBody.prompt = prompt.trim();
      }
      if (negative_prompt && negative_prompt.trim()) {
        requestBody.negative_prompt = negative_prompt.trim();
      }

      const submitResponse = await fetch(queueEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        logger.error('MMAudio V2 submit error', { status: submitResponse.status, error: errorText });
        // Refund credits on submit failure (only if credits were actually deducted)
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, `MMAudio submit error: ${submitResponse.status}`);
        }
        res.status(500).json({
          success: false,
          error: `Failed to start audio generation: ${submitResponse.status}`,
          creditsRefunded: actualCreditsDeducted
        });
        return;
      }

      const submitData = await submitResponse.json() as { request_id?: string };
      const requestId = submitData.request_id;

      if (!requestId) {
        logger.error('No request_id from MMAudio', { submitData });
        if (actualCreditsDeducted > 0) {
          await refundCredits(user, actualCreditsDeducted, 'No request_id from MMAudio');
        }
        res.status(500).json({
          success: false,
          error: 'Failed to submit audio generation request',
          creditsRefunded: actualCreditsDeducted
        });
        return;
      }

      logger.info('MMAudio V2 submitted', { requestId });

      // Poll for completion
      const modelPath = 'fal-ai/mmaudio-v2';
      const maxWaitTime = 3 * 60 * 1000; // 3 minutes max
      const pollInterval = 2000; // Poll every 2 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await fetch(
          `https://queue.fal.run/${modelPath}/requests/${requestId}/status`,
          {
            headers: { 'Authorization': `Key ${FAL_API_KEY}` }
          }
        );

        if (!statusResponse.ok) {
          continue;
        }

        const statusData = await statusResponse.json() as { 
          status?: string;
          audio?: { url?: string; content_type?: string; file_name?: string; file_size?: number };
        };
        
        const normalizedStatus = (statusData.status || '').toUpperCase();

        logger.debug('MMAudio polling', { 
          requestId, 
          status: normalizedStatus,
          elapsed: Math.round((Date.now() - startTime) / 1000) + 's'
        });

        // Check if audio in status response
        if (statusData.audio?.url) {
          logger.info('MMAudio completed (from status)', { requestId });
          res.json({
            success: true,
            audio: statusData.audio,
            remainingCredits,
            creditsDeducted: actualCreditsDeducted,
            freeAccess: hasFreeAccess
          });
          return;
        }

        if (isStatusCompleted(normalizedStatus)) {
          // Fetch the result
          const resultResponse = await fetch(
            `https://queue.fal.run/${modelPath}/requests/${requestId}`,
            {
              headers: { 'Authorization': `Key ${FAL_API_KEY}` }
            }
          );

          if (!resultResponse.ok) {
            if (actualCreditsDeducted > 0) {
              await refundCredits(user, actualCreditsDeducted, 'Failed to fetch MMAudio result');
            }
            res.status(500).json({
              success: false,
              error: 'Failed to fetch audio result',
              creditsRefunded: actualCreditsDeducted
            });
            return;
          }

          const resultData = await resultResponse.json() as {
            audio?: { url?: string; content_type?: string; file_name?: string; file_size?: number };
            audio_url?: string;
            url?: string;
          };

          // Extract audio URL
          let audioUrl: string | null = null;
          let audioMeta: { content_type?: string; file_name?: string; file_size?: number } | null = null;

          if (resultData.audio?.url) {
            audioUrl = resultData.audio.url;
            audioMeta = resultData.audio;
          } else if (resultData.audio_url) {
            audioUrl = resultData.audio_url;
          } else if (resultData.url) {
            audioUrl = resultData.url;
          }

          if (audioUrl) {
            logger.info('MMAudio V2 completed', { requestId, audioUrl: audioUrl.substring(0, 50) });
            res.json({
              success: true,
              audio: {
                url: audioUrl,
                content_type: audioMeta?.content_type || 'audio/wav',
                file_name: audioMeta?.file_name || `audio-${requestId}.wav`,
                file_size: audioMeta?.file_size
              },
              remainingCredits,
              creditsDeducted: actualCreditsDeducted,
              freeAccess: hasFreeAccess
            });
            return;
          }

          logger.error('No audio URL in MMAudio result', { resultData: JSON.stringify(resultData).substring(0, 500) });
          if (actualCreditsDeducted > 0) {
            await refundCredits(user, actualCreditsDeducted, 'No audio in MMAudio result');
          }
          res.status(500).json({
            success: false,
            error: 'Audio generation completed but no audio URL found',
            creditsRefunded: actualCreditsDeducted
          });
          return;
        }

        if (isStatusFailed(normalizedStatus)) {
          logger.error('MMAudio generation failed', { requestId, status: normalizedStatus });
          if (actualCreditsDeducted > 0) {
            await refundCredits(user, actualCreditsDeducted, `MMAudio failed: ${normalizedStatus}`);
          }
          res.status(500).json({
            success: false,
            error: 'Audio generation failed',
            creditsRefunded: actualCreditsDeducted
          });
          return;
        }
      }

      // Timeout
      logger.error('MMAudio generation timeout', { requestId });
      if (actualCreditsDeducted > 0) {
        await refundCredits(user, actualCreditsDeducted, 'MMAudio timeout');
      }
      res.status(504).json({
        success: false,
        error: 'Audio generation timed out. Please try again.',
        creditsRefunded: actualCreditsDeducted
      });

    } catch (error) {
      const err = error as Error;
      logger.error('Video-to-audio error:', { error: err.message });
      const user = req.user;
      const hasFreeAccess = req.hasFreeAccess || false;
      const creditsToRefund = hasFreeAccess ? 0 : applyClawMarkup(req, calculateVideoToAudioCredits());
      if (user && creditsToRefund > 0) {
        await refundCredits(user, creditsToRefund, `Video-to-audio error: ${err.message}`);
      }
      res.status(500).json({
        success: false,
        error: err.message,
        creditsRefunded: creditsToRefund
      });
    }
  });

  /**
   * Add generation to history
   * POST /api/generations/add
   * SECURITY: Requires JWT authentication
   */
  router.post('/add', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      // SECURITY: Require JWT authentication, not body-based
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required. Please sign in with a valid token.'
        });
        return;
      }

      logger.debug('Generation add request received', {
        authenticatedUserId: user.userId,
        authenticatedEmail: user.email,
        authenticatedWallet: user.walletAddress,
        hasImageUrl: !!req.body?.imageUrl,
        hasVideoUrl: !!req.body?.videoUrl
      });

      const { prompt, style, imageUrl, videoUrl, requestId, status, creditsUsed } = req.body as {
        prompt?: string;
        style?: string;
        imageUrl?: string;
        videoUrl?: string;
        requestId?: string;
        status?: string;
        creditsUsed?: number;
      };

      if (!imageUrl && !videoUrl) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: imageUrl or videoUrl is required'
        });
        return;
      }

      if (!user.walletAddress && !user.email) {
        res.status(400).json({
          success: false,
          error: 'User account must have wallet address or email'
        });
        return;
      }

      // Credits are already deducted in generation endpoints
      const creditsUsedForHistory = creditsUsed || 1;

      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account must have wallet address, userId, or email'
        });
        return;
      }

      // Deduplication: Check if this requestId already exists in history
      // This prevents duplicate entries when client retries on network errors
      if (requestId) {
        const existingUser = await User.findOne({
          ...updateQuery,
          'generationHistory.requestId': requestId
        }).select('_id').lean();
        
        if (existingUser) {
          logger.debug('Generation already tracked (dedup)', { requestId });
          res.json({
            success: true,
            generationId: `existing_${requestId}`,
            deduplicated: true,
            credits: user.credits,
            totalCreditsEarned: user.totalCreditsEarned,
            totalCreditsSpent: user.totalCreditsSpent
          });
          return;
        }
      }

      // Create generation record
      // Encrypt prompt if encryption is configured (findOneAndUpdate bypasses pre-save hooks)
      let encryptedPrompt = prompt || 'No prompt';
      if (encryptedPrompt && isEncryptionConfigured()) {
        // Check if already encrypted (shouldn't be, but be safe)
        const isEncrypted = encryptedPrompt.includes(':') && encryptedPrompt.split(':').length === 3;
        if (!isEncrypted) {
          encryptedPrompt = encrypt(encryptedPrompt);
        }
      }
      
      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const generationItem = {
        id: generationId,
        prompt: encryptedPrompt,
        style: style || 'No Style',
        ...(imageUrl && { imageUrl }),
        ...(videoUrl && { videoUrl }),
        ...(requestId && { requestId }),
        ...(status && { status }),
        creditsUsed: creditsUsedForHistory,
        timestamp: new Date()
      };

      // Add to generationHistory for internal tracking (not shown to users)
      // Gallery is populated separately via frontend localStorage
      // Use retry logic to handle concurrent write conflicts (Plan executor errors)
      await withRetry(
        () => User.findOneAndUpdate(
          updateQuery,
          {
            $push: {
              generationHistory: {
                $each: [generationItem],
                $slice: -10 // Keep last 10 for tracking
              }
            }
          }
        ),
        { operation: 'Add generation to history', maxRetries: 3 }
      );

      logger.info('Generation tracked', {
        userId: user.userId,
        generationId,
        hasImage: !!imageUrl,
        hasVideo: !!videoUrl
      });

      res.json({
        success: true,
        generationId,
        credits: user.credits,
        totalCreditsEarned: user.totalCreditsEarned,
        totalCreditsSpent: user.totalCreditsSpent
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Add generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to add generation'
      });
    }
  });

  /**
   * Update a generation (e.g., when video completes)
   * PUT /api/generations/update/:generationId
   * SECURITY FIX: Requires JWT authentication and verifies ownership
   */
  router.put('/update/:generationId', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Require JWT authentication
      if (!requireAuth(req, res)) return;

      const { generationId } = req.params;
      const { 
        videoUrl,
        imageUrl,
        status
      } = req.body as {
        videoUrl?: string;
        imageUrl?: string;
        status?: string;
      };

      if (!generationId) {
        res.status(400).json({
          success: false,
          error: 'generationId is required'
        });
        return;
      }

      // SECURITY: Use authenticated user, not body parameters
      const user = req.user;
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);

      if (!updateQuery) {
        res.status(400).json({
          success: false,
          error: 'User account not properly configured'
        });
        return;
      }

      // Fetch user to verify ownership
      const userWithHistory = await User.findOne(updateQuery).select('generationHistory');
      
      if (!userWithHistory) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // SECURITY: Verify the generation belongs to this user
      const existingGen = userWithHistory.generationHistory?.find(gen => gen.id === generationId);
      if (!existingGen) {
        logger.warn('SECURITY: Blocked generation update attempt for non-owned generation', {
          requestedGenerationId: generationId,
          authenticatedUserId: user.userId,
          path: req.path,
          ip: req.ip
        });
        res.status(404).json({
          success: false,
          error: 'Generation not found or does not belong to you'
        });
        return;
      }

      // Build update object for generationHistory (internal tracking)
      const updateFields: Record<string, string> = {};
      if (videoUrl) updateFields['generationHistory.$.videoUrl'] = videoUrl;
      if (imageUrl) updateFields['generationHistory.$.imageUrl'] = imageUrl;
      if (status) updateFields['generationHistory.$.status'] = status;

      // Update generation in history
      await User.updateOne(
        { ...updateQuery, 'generationHistory.id': generationId },
        { $set: updateFields }
      );

      logger.info('Generation updated', { 
        generationId, 
        userId: user.userId,
        status, 
        hasVideoUrl: !!videoUrl, 
        hasImageUrl: !!imageUrl 
      });

      res.json({
        success: true,
        message: 'Generation updated successfully'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error updating generation:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to update generation' });
    }
  });

  return router;
}

export default createGenerationRoutes;

