/**
 * Generation routes
 * Image, video, and music generation endpoints
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  freeImageRateLimiter?: RequestHandler;
  authenticateFlexible?: RequestHandler;
  requireCreditsForModel: () => RequestHandler;
  requireCreditsForVideo: () => RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  creditsRequired?: number;
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

Your goal: Transform a user's simple music description into a detailed, well-structured prompt that will produce better music.

Guidelines:
1. Include specific musical elements:
   - Genre/style (be specific: "lo-fi hip hop" not just "hip hop")
   - Instruments (piano, drums, bass, synth pads, etc.)
   - Mood/atmosphere (relaxing, energetic, melancholic, uplifting)
   - Key signature if appropriate (C Major, A Minor, etc.)
   - Tempo/BPM (slow: 60-90, medium: 100-120, fast: 130+)

2. Keep the user's core intent - just add helpful details
3. Be concise but specific - avoid overly verbose descriptions
4. Use music production terminology naturally

Examples:
- "chill music" → "Relaxing lo-fi hip hop with mellow piano chords, soft drums, vinyl crackle, and warm bass. Tempo: 85 BPM, Key: C Major."
- "rock song" → "Energetic rock anthem with crunchy electric guitars, driving drums, punchy bass, and an anthemic feel. Key: E Major, Tempo: 140 BPM."
- "sad piano" → "Melancholic piano piece with gentle, emotional melodies, soft dynamics, and subtle reverb. Key: D Minor, Tempo: 70 BPM."

JSON only:
{"optimizedPrompt": "enhanced version of the prompt", "reasoning": "what you enhanced and why"}`;

interface MusicOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Optimize a prompt for music generation
 */
async function optimizePromptForMusic(
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

    const userPrompt = `User's music prompt: "${originalPrompt}"
${genreContext}

Enhance this prompt with specific musical details (instruments, mood, tempo, key) to help the AI create better music. Keep the same core concept, just add helpful specifics.`;

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
        return {
          optimizedPrompt: parsed.optimizedPrompt || originalPrompt,
          reasoning: parsed.reasoning || null,
          skipped: false
        };
      }
    } catch {
      if (output && output.length > 10) {
        return {
          optimizedPrompt: output.trim(),
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

FLUX 2 Edit specializes in:
- Precise modifications using natural language descriptions
- Color changes (supports hex color codes like #FF5733)
- Object modifications, additions, and removals
- Style transfers and artistic adjustments
- Clothing, hair, and appearance changes
- Background and environment modifications

Optimal prompt structure for FLUX 2:
1. Be DIRECT and SPECIFIC about what to change
2. Use action verbs: "Change", "Make", "Transform", "Replace", "Add", "Remove"
3. Specify colors with hex codes when possible (e.g., "Change shirt to navy blue #1E3A5F")
4. Describe the desired end state clearly
5. Keep focused on ONE main edit per prompt for best results
6. Avoid vague terms - be precise about locations and attributes

Good FLUX 2 prompts:
- "Change the shirt to a red flannel pattern"
- "Make the hair blonde with subtle highlights"
- "Replace the background with a sunset beach scene"
- "Add stylish sunglasses to the person"
- "Transform the casual outfit into a formal black suit"
- "Change eye color to emerald green #50C878"

Bad prompts to avoid:
- "Make it look better" (too vague)
- "Change everything" (unfocused)
- "Something different" (no direction)

JSON response format:
{"optimizedPrompt": "clear, action-oriented edit instruction", "reasoning": "brief explanation of improvements"}`;

interface ImageEditOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Optimize a prompt for FLUX 2 image editing
 */
async function optimizePromptForFlux2Edit(
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

    const userPrompt = `User's image edit request: "${originalPrompt}"

Transform this into an optimal FLUX 2 edit prompt that is:
1. Direct and action-oriented (starts with a verb)
2. Specific about what to change
3. Clear about the desired result
4. Includes color codes if colors are mentioned

Keep the user's intent, just make it clearer and more effective for the AI.`;

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
          logger.debug('FLUX 2 prompt optimized', { 
            original: originalPrompt.substring(0, 50),
            optimized: parsed.optimizedPrompt.substring(0, 50)
          });
          return {
            optimizedPrompt: parsed.optimizedPrompt,
            reasoning: parsed.reasoning || null,
            skipped: false
          };
        }
      }
    } catch {
      // If JSON parsing fails but we have reasonable output, use it
      if (output && output.length > 10 && output.length < 500) {
        return {
          optimizedPrompt: output.trim(),
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
// FLUX 2 TEXT-TO-IMAGE PROMPT OPTIMIZATION SERVICE
// ============================================================================

/**
 * Flux 2 text-to-image prompt optimization guidelines
 * Optimized for FLUX.2 [dev] from Black Forest Labs
 */
const FLUX2_T2I_PROMPT_GUIDELINES = `You are an expert prompt engineer for FLUX.2, a state-of-the-art text-to-image AI model known for enhanced realism and crisp text generation.

Your goal: Transform a user's simple image description into a detailed, well-structured prompt that leverages FLUX.2's strengths.

FLUX.2 Strengths:
- Exceptional photorealism and fine details
- Accurate text rendering in images
- Precise composition and subject placement
- Realistic lighting and shadows
- Natural skin textures and facial features

Guidelines:
1. Include visual elements that FLUX.2 excels at:
   - Camera angle/shot type (close-up, wide shot, Dutch angle, eye-level)
   - Lighting description (dramatic lighting, soft diffused light, golden hour, studio lighting)
   - Style descriptors (photorealistic, cinematic, professional photography)
   - Atmosphere/mood (moody, vibrant, serene, dystopian)
   - Specific details (textures, materials, expressions)

2. Keep the user's core intent - enhance, don't change the subject
3. Be descriptive but concise - avoid overly long prompts
4. Use photography/cinematography terminology naturally
5. For text in images, specify font style and placement

Examples:
- "a cat" → "Close-up portrait of a fluffy tabby cat with striking green eyes, soft natural window light illuminating fur details, shallow depth of field, photorealistic, warm cozy atmosphere"
- "futuristic city" → "Wide establishing shot of a neon-lit cyberpunk cityscape at night, towering skyscrapers with holographic advertisements, rain-slicked streets reflecting colorful lights, cinematic atmosphere, blade runner aesthetic"
- "woman portrait" → "Professional headshot of a woman in her 30s, confident expression, studio lighting with soft fill, sharp focus on eyes, neutral background, commercial photography style"

JSON only:
{"optimizedPrompt": "enhanced version of the prompt", "reasoning": "what you enhanced and why"}`;

interface Flux2T2IOptimizationResult {
  optimizedPrompt: string;
  reasoning: string | null;
  skipped: boolean;
  error?: string;
}

/**
 * Optimize a prompt for FLUX 2 text-to-image generation
 */
async function optimizePromptForFlux2T2I(
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

    const userPrompt = `User's image prompt: "${originalPrompt}"

Enhance this prompt to leverage FLUX.2's strengths in photorealism, lighting, and detail. Keep the same subject and core concept, just add helpful visual specifics that will produce a stunning image.`;

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
          logger.debug('FLUX 2 T2I prompt optimized', { 
            original: originalPrompt.substring(0, 50),
            optimized: parsed.optimizedPrompt.substring(0, 50)
          });
          return {
            optimizedPrompt: parsed.optimizedPrompt,
            reasoning: parsed.reasoning || null,
            skipped: false
          };
        }
      }
    } catch {
      // If JSON parsing fails but we have reasonable output, use it
      if (output && output.length > 10 && output.length < 500) {
        return {
          optimizedPrompt: output.trim(),
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

export function createGenerationRoutes(deps: Dependencies) {
  const router = Router();
  const { 
    freeImageRateLimiter,
    authenticateFlexible,
    requireCreditsForModel,
    requireCreditsForVideo,
    requireCredits
  } = deps;

  const freeImageLimiter = freeImageRateLimiter || ((req: Request, res: Response, next: () => void) => next());
  const flexibleAuth = authenticateFlexible || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Generate image
   * POST /api/generate/image
   */
  router.post('/image', freeImageLimiter, requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
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

      // Extract request parameters
      const {
        prompt,
        guidanceScale = 7.5,
        numImages = 1,
        image_url,
        image_urls,
        aspect_ratio,
        seed,
        model,
        optimizePrompt = false
      } = req.body as {
        prompt?: string;
        guidanceScale?: number;
        numImages?: number;
        image_url?: string;
        image_urls?: string[];
        aspect_ratio?: string;
        seed?: number;
        model?: string;
        optimizePrompt?: boolean;
      };

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({
          success: false,
          error: 'prompt is required and must be a non-empty string'
        });
        return;
      }

      // Determine image inputs first for optimization decision
      const isMultipleImages = image_urls && Array.isArray(image_urls) && image_urls.length >= 2;
      const isSingleImage = image_url || (image_urls && image_urls.length === 1);
      const hasImages = isMultipleImages || isSingleImage;
      const isFlux2Model = model === 'flux-2';
      
      // Apply FLUX 2 prompt optimization if requested
      let finalPrompt = prompt.trim();
      let promptOptimizationResult: ImageEditOptimizationResult | Flux2T2IOptimizationResult | null = null;
      
      if (optimizePrompt && isFlux2Model) {
        try {
          if (hasImages) {
            // Use edit-specific optimization for image editing
            promptOptimizationResult = await optimizePromptForFlux2Edit(prompt.trim());
            
            if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
              finalPrompt = promptOptimizationResult.optimizedPrompt;
              logger.debug('FLUX 2 prompt optimized for editing', { 
                original: prompt.substring(0, 50),
                optimized: finalPrompt.substring(0, 50)
              });
            }
          } else {
            // Use text-to-image optimization for generation
            promptOptimizationResult = await optimizePromptForFlux2T2I(prompt.trim());
            
            if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
              finalPrompt = promptOptimizationResult.optimizedPrompt;
              logger.debug('FLUX 2 prompt optimized for text-to-image', { 
                original: prompt.substring(0, 50),
                optimized: finalPrompt.substring(0, 50)
              });
            }
          }
        } catch (err) {
          logger.warn('FLUX 2 prompt optimization failed, using original prompt', { error: (err as Error).message });
        }
      }

      // Determine endpoint based on image inputs and model selection
      const isNanoBananaPro = model === 'nano-banana-pro';
      const isFlux2 = isFlux2Model;

      let endpoint: string;
      if (isNanoBananaPro) {
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
      
      if (isNanoBananaPro) {
        requestBody = {
          prompt: prompt.trim(),
          resolution: '1K'
        };
        if (isMultipleImages) {
          requestBody.image_urls = image_urls;
        } else if (isSingleImage) {
          const singleImageUrl = image_url || (image_urls && image_urls[0]);
          requestBody.image_urls = [singleImageUrl];
        }
        if (aspect_ratio) {
          requestBody.aspect_ratio = aspect_ratio;
        }
        if (!hasImages && numImages) {
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
          prompt: prompt.trim(),
          guidance_scale: guidanceScale,
          num_images: numImages,
          output_format: 'jpeg',
          safety_tolerance: '6',
          prompt_safety_tolerance: '6',
          enhance_prompt: true,
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
        throw new Error(`FAL API error: ${response.status} - ${errorText}`);
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
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired
      };
      
      // Include prompt optimization details if optimization was performed for FLUX 2
      if (promptOptimizationResult && !promptOptimizationResult.skipped) {
        responseData.promptOptimization = {
          originalPrompt: prompt.trim(),
          optimizedPrompt: promptOptimizationResult.optimizedPrompt,
          reasoning: promptOptimizationResult.reasoning
        };
      }
      
      res.json(responseData);
    } catch (error) {
      const err = error as Error;
      logger.error('Image generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * FLUX 2 Image Editing with Streaming
   * POST /api/generate/image-stream
   * Uses Server-Sent Events for real-time progress updates
   */
  router.post('/image-stream', freeImageLimiter, requireCreditsForModel(), async (req: AuthenticatedRequest, res: Response) => {
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
      
      // Deduct credits atomically
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        sendEvent('error', { error: 'User account required' });
        res.end();
        return;
      }

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

      sendEvent('credits', { 
        creditsDeducted: creditsRequired, 
        remainingCredits: updateResult.credits 
      });

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

      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        sendEvent('error', { error: 'prompt is required and must be a non-empty string' });
        res.end();
        return;
      }

      // Build image_urls array
      const imageUrlsArray: string[] = [];
      if (image_urls && Array.isArray(image_urls)) {
        imageUrlsArray.push(...image_urls);
      } else if (image_url) {
        imageUrlsArray.push(image_url);
      }

      const hasImages = imageUrlsArray.length > 0;
      const isTextToImage = !hasImages;

      // Apply FLUX 2 prompt optimization if requested
      let finalPrompt = prompt.trim();
      let streamPromptOptimization: ImageEditOptimizationResult | Flux2T2IOptimizationResult | null = null;
      
      if (optimizePrompt) {
        sendEvent('status', { 
          message: isTextToImage ? 'Optimizing prompt for FLUX 2 generation...' : 'Optimizing prompt for FLUX 2 editing...', 
          progress: 5 
        });
        try {
          if (isTextToImage) {
            // Use text-to-image optimization
            streamPromptOptimization = await optimizePromptForFlux2T2I(prompt.trim());
          } else {
            // Use edit-specific optimization
            streamPromptOptimization = await optimizePromptForFlux2Edit(prompt.trim());
          }
          
          if (streamPromptOptimization && !streamPromptOptimization.skipped && streamPromptOptimization.optimizedPrompt) {
            finalPrompt = streamPromptOptimization.optimizedPrompt;
            sendEvent('promptOptimized', {
              originalPrompt: prompt.trim(),
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
        sendEvent('error', { error: `Failed to start generation: ${submitResponse.status}` });
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
        
        if (statusData.status === 'IN_QUEUE') {
          const queuePos = statusData.queue_position ?? 0;
          sendEvent('status', { 
            message: `In queue (position: ${queuePos})...`, 
            progress: 15,
            queuePosition: queuePos
          });
        } else if (statusData.status === 'IN_PROGRESS') {
          // Send progress based on attempts
          const progress = Math.min(20 + (attempts * 2), 90);
          sendEvent('status', { 
            message: 'Generating...', 
            progress,
            logs: statusData.logs?.map(l => l.message) 
          });
        } else if (statusData.status === 'COMPLETED') {
          completed = true;
          sendEvent('status', { message: 'Finalizing...', progress: 95 });
        } else if (statusData.status === 'FAILED') {
          sendEvent('error', { error: 'Generation failed' });
          res.end();
          return;
        }
      }

      if (!completed) {
        sendEvent('error', { error: 'Generation timed out' });
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
        sendEvent('error', { error: 'Failed to fetch result' });
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
        remainingCredits: updateResult.credits,
        creditsDeducted: creditsRequired
      });
      
      res.end();
    } catch (error) {
      const err = error as Error;
      logger.error('FLUX 2 streaming error:', { error: err.message });
      sendEvent('error', { error: err.message });
      res.end();
    }
  });

  /**
   * Generate video - Veo 3.1 (multiple modes supported)
   * POST /api/generate/video
   * Modes: text-to-video, image-to-video, first-last-frame
   */
  router.post('/video', freeImageLimiter, requireCreditsForVideo(), async (req: AuthenticatedRequest, res: Response) => {
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
        quality = 'fast'
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

      // Calculate credits based on duration, audio, and quality
      const calculateVideoCredits = (dur: string, hasAudio: boolean, qual: string): number => {
        const durationSeconds = parseInt(dur.replace('s', '')) || 8;
        let pricePerSecond: number;
        if (qual === 'quality') {
          pricePerSecond = hasAudio ? 0.825 : 0.55;
        } else {
          pricePerSecond = hasAudio ? 0.44 : 0.22;
        }
        const totalCost = durationSeconds * pricePerSecond;
        // Convert dollars to credits (1 credit = $0.20)
        return Math.max(2, Math.ceil(totalCost / 0.20));
      };

      const creditsToDeduct = calculateVideoCredits(duration, generate_audio, quality);

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

      const validDurations = ['4s', '6s', '8s'];
      if (!validDurations.includes(duration)) {
        res.status(400).json({ success: false, error: 'duration must be 4s, 6s, or 8s' });
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

      // Build request body for Veo 3.1 API
      const apiAspectRatio = aspect_ratio === 'auto' ? '16:9' : aspect_ratio;
      
      const requestBody: Record<string, unknown> = {
        prompt: prompt.trim(),
        aspect_ratio: apiAspectRatio,
        duration,
        resolution,
        generate_audio
      };

      // Add frame URLs based on mode
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

      logger.info('Video generation request', {
        model: 'veo3.1',
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

      // Build endpoint URL based on mode and quality
      let endpoint: string;
      if (generation_mode === 'text-to-video') {
        endpoint = 'https://queue.fal.run/fal-ai/veo3.1';
      } else {
        endpoint = `https://queue.fal.run/fal-ai/veo3.1/fast/${modeConfig.endpoint}`;
      }

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
        res.status(submitResponse.status).json({ success: false, error: errorMessage });
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

      logger.info('Video generation submitted', { requestId, endpoint, hasProvidedStatusUrl: !!providedStatusUrl });

      // Determine model path for polling
      const modelPath = generation_mode === 'text-to-video' 
        ? 'fal-ai/veo3.1'
        : `fal-ai/veo3.1/fast/${modeConfig.endpoint}`;

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
        if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'OK' || normalizedStatus === 'DONE' || normalizedStatus === 'SUCCESS') {
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
            res.status(500).json({ success: false, error: `Failed to fetch video result (${resultResponse.status})` });
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
          res.status(500).json({ success: false, error: 'Video generation completed but no video URL found' });
          return;
        }

        // Check for failed status
        if (normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR') {
          logger.error('Video generation failed', { requestId, status: normalizedStatus });
          res.status(500).json({ success: false, error: 'Video generation failed' });
          return;
        }
      }

      // Timeout
      logger.error('Video generation timeout', { requestId, elapsed: maxWaitTime / 1000 + 's' });
      res.status(504).json({ success: false, error: 'Video generation timed out. Please try again.' });
    } catch (error) {
      const err = error as Error;
      logger.error('Video generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Generate music
   * POST /api/generate/music
   */
  router.post('/music', freeImageLimiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response) => {
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

      // Calculate credits based on duration: 1 credit per minute (rounded up), minimum 1
      const calculateMusicCredits = (durationSecs: number): number => {
        const minutes = durationSecs / 60;
        return Math.max(1, Math.ceil(minutes));
      };
      const creditsRequired = calculateMusicCredits(clampedDuration);
      
      // Deduct credits
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

      // Submit to FAL - CassetteAI Music Generator
      // Documentation: https://fal.ai/models/cassetteai/music-generator/api

      // Validate prompt
      if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        res.status(400).json({ success: false, error: 'Prompt is required' });
        return;
      }

      // Optimize prompt if enabled (off by default)
      let finalPrompt = prompt.trim();
      let promptOptimizationResult: MusicOptimizationResult | null = null;

      if (optimizePrompt) {
        try {
          promptOptimizationResult = await optimizePromptForMusic(prompt.trim(), selectedGenre);

          if (promptOptimizationResult && !promptOptimizationResult.skipped && promptOptimizationResult.optimizedPrompt) {
            finalPrompt = promptOptimizationResult.optimizedPrompt;
            logger.debug('Music prompt optimized', { 
              original: prompt.substring(0, 50),
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

          if (normalizedStatus === 'COMPLETED') {
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
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
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
              res.status(500).json({ success: false, error: 'No audio in response' });
              return;
            }
          } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'ERROR') {
            logger.error('Music generation failed', { requestId, statusData });
            res.status(500).json({ success: false, error: 'Music generation failed' });
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
            res.status(500).json({ success: false, error: 'Music generation failed - polling errors' });
            return;
          }
        }
      }

      // Timeout reached
      logger.warn('Music generation timed out', { requestId, pollCount, elapsedMs: Date.now() - startTime });
      res.status(504).json({ success: false, error: 'Music generation timed out. Please try again.' });
    } catch (error) {
      const err = error as Error;
      logger.error('Music generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  /**
   * Check generation status
   * GET /api/generate/status/:requestId
   */
  router.get('/status/:requestId', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
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
        error: err.message
      });
    }
  });

  /**
   * Get generation result
   * GET /api/generate/result/:requestId
   */
  router.get('/result/:requestId', async (req: Request, res: Response) => {
    try {
      const { requestId } = req.params;
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
        error: err.message
      });
    }
  });

  /**
   * Add generation to history
   * POST /api/generations/add
   */
  router.post('/add', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
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

      // Create generation record
      const generationId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const generation = {
        id: generationId,
        prompt: prompt || 'No prompt',
        style: style || 'No Style',
        ...(imageUrl && { imageUrl }),
        ...(videoUrl && { videoUrl }),
        ...(requestId && { requestId }),
        ...(status && { status }),
        creditsUsed: creditsUsedForHistory,
        timestamp: new Date()
      };

      // Add to user's generation history
      await User.findOneAndUpdate(
        updateQuery,
        {
          $push: {
            generationHistory: {
              $each: [generation],
              $slice: -100 // Keep last 100 generations
            }
          }
        }
      );

      logger.info('Generation added to history', {
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
   */
  router.put('/update/:generationId', async (req: Request, res: Response) => {
    try {
      const { generationId } = req.params;
      const { 
        walletAddress, 
        userId,
        email,
        videoUrl,
        imageUrl,
        status
      } = req.body as {
        walletAddress?: string;
        userId?: string;
        email?: string;
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

      // Find user
      const User = mongoose.model<IUser>('User');
      let user: IUser | null = null;
      let updateQuery: Record<string, string> | null = null;
      
      if (walletAddress) {
        const isSolanaAddress = !walletAddress.startsWith('0x');
        const normalizedWalletAddress = isSolanaAddress ? walletAddress : walletAddress.toLowerCase();
        updateQuery = { walletAddress: normalizedWalletAddress };
        user = await User.findOne(updateQuery);
      } else if (userId) {
        updateQuery = { userId };
        user = await User.findOne(updateQuery);
      } else if (email) {
        updateQuery = { email: email.toLowerCase() };
        user = await User.findOne(updateQuery);
      } else {
        res.status(400).json({
          success: false,
          error: 'walletAddress, userId, or email is required'
        });
        return;
      }

      if (!user || !updateQuery) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Find the generation in history
      const generation = user.generationHistory?.find(gen => gen.id === generationId);
      if (!generation) {
        res.status(404).json({
          success: false,
          error: 'Generation not found'
        });
        return;
      }

      // Build update object
      const updateFields: Record<string, string> = {};
      if (videoUrl) updateFields['generationHistory.$.videoUrl'] = videoUrl;
      if (imageUrl) updateFields['generationHistory.$.imageUrl'] = imageUrl;
      if (status) updateFields['generationHistory.$.status'] = status;

      // Update generation in history
      await User.updateOne(
        { ...updateQuery, 'generationHistory.id': generationId },
        { $set: updateFields }
      );

      // If completed and has videoUrl/imageUrl, add to gallery
      if ((status === 'completed' || !status) && (videoUrl || imageUrl)) {
        const galleryItem = {
          id: generationId,
          prompt: generation.prompt,
          style: generation.style,
          ...(imageUrl && { imageUrl }),
          ...(videoUrl && { videoUrl }),
          creditsUsed: generation.creditsUsed,
          timestamp: generation.timestamp || new Date()
        };

        // Check if already in gallery
        const inGallery = user.gallery?.some(item => item.id === generationId);
        if (!inGallery) {
          await User.updateOne(
            updateQuery,
            { $push: { gallery: { $each: [galleryItem], $slice: -100 } } }
          );
        } else {
          // Update existing gallery item
          const galleryUpdateFields: Record<string, string> = {};
          if (videoUrl) galleryUpdateFields['gallery.$.videoUrl'] = videoUrl;
          if (imageUrl) galleryUpdateFields['gallery.$.imageUrl'] = imageUrl;
          await User.updateOne(
            { ...updateQuery, 'gallery.id': generationId },
            { $set: galleryUpdateFields }
          );
        }
      }

      logger.info('Generation updated', { generationId, status, hasVideoUrl: !!videoUrl, hasImageUrl: !!imageUrl });

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

