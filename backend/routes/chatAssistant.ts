/**
 * Chat Assistant Route
 * Provides a unified conversational interface for all generation capabilities
 * Uses Claude to understand user intent and orchestrate generation actions
 */
import { Router, type Request, type Response } from 'express';
import logger from '../utils/logger';
import { getFalApiKey } from '../services/fal';
import { 
  optimizePromptForFlux2T2I, 
  optimizePromptForFlux2Edit,
  optimizePromptForFluxEdit,
  optimizePromptForNanoBananaEdit,
  optimizePromptForMusic 
} from './generate';

// System prompt for the chat assistant - optimized for Claude 3 Haiku
const SYSTEM_PROMPT = `You are a creative AI assistant for SeisoAI. Generate images, videos, and music.

CRITICAL: Never say you cannot do something. Always attempt to generate what the user requests. Do not explain limitations or apologize. Just generate.

When you understand what to generate, respond with a friendly message followed by JSON:

\`\`\`json
{
  "action": "generate_image" | "generate_video" | "generate_music",
  "params": {
    "prompt": "detailed prompt (REQUIRED)",
    "numImages": 1-4,
    "imageSize": "square" | "portrait_16_9" | "landscape_16_9",
    "duration": "4s" | "6s" | "8s",
    "model": "ltx" | "veo" | "flux" | "flux-2" | "nano-banana-pro",
    "quality": "fast" | "quality",
    "generateAudio": true | false,
    "musicDuration": 30,
    "genre": "lo-fi" | "electronic" | "orchestral",
    "isEdit": true | false
  },
  "estimatedCredits": number,
  "description": "brief description"
}
\`\`\`

RULES:
- Always include a friendly message before JSON
- NEVER say "I cannot", "unfortunately", "I don't have", or similar limitation phrases
- If unclear, ask ONE short question (no JSON)
- Defaults: square images, 6s video, 30s music
- For 360 panoramas: use simple prompt like "360 panorama of [scene]" - backend handles formatting
- Credits: Images 0.5-0.7, Videos 1-8.25/sec, Music 0.25/min
- For any request, attempt to generate it - let the system handle what's possible

IMAGE EDITING (VERY IMPORTANT):
When the user wants to EDIT a previously generated image, set "isEdit": true.
Edit requests include phrases like:
- "add a hat", "put glasses on it", "add sunglasses"
- "change the background", "make the sky blue", "change color to red"
- "remove the tree", "take away the person"
- "make it darker", "brighten it", "make it warmer"
- "add more detail", "make it more realistic"
- "change the style", "make it cartoon", "make it anime"
- "edit it", "modify it", "adjust the..."
- References like "it", "this", "that", "the image", "the picture"

For edits, write the prompt as a MODIFICATION instruction describing what to change.
Example: User says "add a red hat" → prompt: "add a red hat to the person"
Example: User says "make the background sunset" → prompt: "change the background to a beautiful sunset"
Example: User says "make it blue" → prompt: "change the color scheme to blue tones"

MODEL-SPECIFIC GUIDANCE:
- FLUX 2: Best for edits! Write detailed prompts with camera angles, lighting, and style descriptors
- FLUX: Keep prompts concise but descriptive, good for edits
- Nano Banana: Best for 360 panoramas and high-quality images
- LTX-2: Fast video generation, good for simple scenes
- Veo 3.1: Cinematic quality, use detailed prompts for best results
- Music: Include genre, instruments, mood, and tempo in prompts`;

// Patterns that indicate an edit request (referencing previous output)
const EDIT_PATTERNS = [
  /\b(add|put|place|insert)\s+(a|an|the|some)?\s*\w+\s*(to|on|in)?\s*(it|this|that|the image|the picture)?/i,
  /\b(change|make|turn|convert)\s+(it|this|that|the)?\s*(background|color|style|sky|hair|eyes|clothes)/i,
  /\b(remove|delete|take away|get rid of)\s+(the|a|an)?\s*\w+/i,
  /\b(make it|make this|make that)\s+(more|less|darker|brighter|warmer|cooler|bigger|smaller)/i,
  /\b(edit|modify|adjust|tweak|fix)\s+(it|this|that|the image|the picture)?/i,
  /\bcan you\s+(add|change|remove|make|edit|modify)/i,
  /\b(now|also|and)\s+(add|change|remove|make)/i,
  /\b(add|put|give)\s+(him|her|them|it)\s+(a|an|some)/i,
  /\bchange\s+(the|its|his|her)\s+\w+\s+to/i,
  /\bmake\s+(the|it|this)\s+\w+\s+(blue|red|green|yellow|purple|orange|pink|black|white|darker|lighter|brighter)/i,
  /\b(instead|rather)\b/i,
  /\bwith\s+(a|an)\s+\w+\s+(instead|now)/i,
];

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  hasGeneration?: boolean;
}

interface GenerationAction {
  action: 'generate_image' | 'generate_video' | 'generate_music';
  params: Record<string, unknown>;
  estimatedCredits: number;
  description: string;
}

interface ChatRequestBody {
  message: string;
  history?: ChatMessage[];
  context?: {
    userId?: string;
    walletAddress?: string;
    email?: string;
    credits?: number;
    // Last generated image for edit context
    lastGeneratedImageUrl?: string;
    lastGeneratedPrompt?: string;
  };
  referenceImage?: string;
}

/**
 * Check if a message appears to be an edit request
 */
function isEditRequest(message: string, hasLastGeneratedImage: boolean): boolean {
  if (!hasLastGeneratedImage) return false;
  
  const lowerMessage = message.toLowerCase();
  
  // Check against edit patterns
  for (const pattern of EDIT_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }
  
  // Additional simple keyword checks
  const editKeywords = ['add', 'change', 'remove', 'edit', 'modify', 'adjust', 'make it', 'make the', 'put', 'give it', 'give him', 'give her'];
  for (const keyword of editKeywords) {
    if (lowerMessage.includes(keyword)) {
      return true;
    }
  }
  
  return false;
}

interface GenerateRequestBody {
  action: GenerationAction;
  context: {
    userId?: string;
    walletAddress?: string;
    email?: string;
  };
}

/**
 * Parse JSON action from Claude's response
 */
function parseActionFromResponse(response: string): GenerationAction | null {
  // Look for JSON code block
  const jsonMatch = response.match(/```json\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1].trim());
      if (parsed.action && parsed.params && parsed.estimatedCredits !== undefined) {
        return parsed as GenerationAction;
      }
    } catch (e) {
      logger.debug('Failed to parse JSON from response', { error: (e as Error).message });
    }
  }
  
  // Also try to find raw JSON object
  const rawJsonMatch = response.match(/\{[\s\S]*"action"[\s\S]*"params"[\s\S]*\}/);
  if (rawJsonMatch) {
    try {
      const parsed = JSON.parse(rawJsonMatch[0]);
      if (parsed.action && parsed.params) {
        return parsed as GenerationAction;
      }
    } catch {
      // Ignore parse errors for raw JSON attempt
    }
  }
  
  return null;
}

/**
 * Clean Claude's response by removing JSON blocks for display
 */
function cleanResponseForDisplay(response: string): string {
  let cleaned = response
    // Remove JSON code blocks (with or without language tag)
    .replace(/```json\s*[\s\S]*?```/gi, '')
    .replace(/```\s*\{[\s\S]*?\}\s*```/g, '')
    // Remove standalone JSON objects
    .replace(/\{\s*"action"[\s\S]*?"params"[\s\S]*?\}/g, '')
    // Remove any remaining JSON-like structures
    .replace(/\{\s*[\s\S]*?"action"[\s\S]*?\}/g, '')
    // Clean up extra whitespace and newlines
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .trim();
  
  return cleaned;
}

/**
 * Create chat assistant routes
 */
export default function createChatAssistantRoutes(_deps: Record<string, unknown>) {
  const router = Router();

  /**
   * POST /message
   * Send a message to the chat assistant
   */
  router.post('/message', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { message, history = [], context, referenceImage } = req.body as ChatRequestBody;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      if (message.length > 2000) {
        return res.status(400).json({
          success: false,
          error: 'Message too long (max 2000 characters)'
        });
      }

      const FAL_API_KEY = getFalApiKey();
      
      if (!FAL_API_KEY) {
        logger.error('FAL_API_KEY not configured for chat assistant');
        return res.status(503).json({
          success: false,
          error: 'AI service temporarily unavailable. Please try again later.'
        });
      }
      
      // Check if this looks like an edit request and we have a previous image
      const hasLastGeneratedImage = !!context?.lastGeneratedImageUrl;
      const detectedAsEdit = isEditRequest(message, hasLastGeneratedImage);
      
      // Auto-attach the last generated image if this is an edit request and no explicit reference
      let effectiveReferenceImage = referenceImage;
      let isAutoEdit = false;
      
      if (detectedAsEdit && !referenceImage && context?.lastGeneratedImageUrl) {
        effectiveReferenceImage = context.lastGeneratedImageUrl;
        isAutoEdit = true;
        logger.info('Auto-detected edit request, using last generated image', {
          lastImageUrl: context.lastGeneratedImageUrl.substring(0, 50),
          lastPrompt: context.lastGeneratedPrompt?.substring(0, 50)
        });
      }
      
      logger.info('Chat assistant processing message', { 
        messageLength: message.length, 
        historyLength: history.length,
        hasContext: !!context,
        hasCredits: context?.credits !== undefined,
        hasReferenceImage: !!referenceImage,
        hasLastGeneratedImage,
        detectedAsEdit,
        isAutoEdit
      });

      // Build context info
      let contextInfo = '';
      if (context?.credits !== undefined) {
        contextInfo += `\nUser has ${context.credits} credits available.`;
      }
      
      // Add edit context if auto-detected
      if (isAutoEdit && context?.lastGeneratedImageUrl) {
        contextInfo += `\n\nEDIT MODE DETECTED: The user is asking to modify a previously generated image.
Previous image URL available: YES (will be auto-attached)
${context.lastGeneratedPrompt ? `Original image prompt was: "${context.lastGeneratedPrompt}"` : ''}

IMPORTANT: Set "isEdit": true in your JSON params. The referenceImage will be automatically attached.
Write the prompt as an EDIT INSTRUCTION describing what to change or add.`;
      } else if (referenceImage) {
        contextInfo += `\n\nIMPORTANT: User has attached a REFERENCE IMAGE to this message. When generating, you should:
- For images: Use this as an image-to-image reference (set referenceImage in params)
- For videos: Use this as the first frame (set firstFrameUrl in params, use image-to-video mode)
Include the reference in your JSON response params.`;
      }

      // Format conversation for Claude 3 Haiku - use native message format
      const conversationMessages: Array<{ role: string; content: string }> = [];
      
      // Add recent history (last 15 messages)
      const recentHistory = history.slice(-15);
      for (const msg of recentHistory) {
        conversationMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
      
      // Add current message
      conversationMessages.push({
        role: 'user',
        content: message
      });

      // Build prompt - Claude 3 Haiku works better with direct message format
      const fullPrompt = conversationMessages
        .map(m => m.content)
        .join('\n\n');

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      logger.debug('Making FAL LLM request', {
        promptLength: fullPrompt.length,
        systemPromptLength: (SYSTEM_PROMPT + contextInfo).length
      });

      const response = await fetch('https://fal.run/fal-ai/any-llm', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          prompt: fullPrompt,
          system_prompt: SYSTEM_PROMPT + (contextInfo ? '\n' + contextInfo : ''),
          temperature: 0.7,
          max_tokens: 1000
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error('Chat assistant LLM request failed', { 
          status: response.status, 
          error: errorText.substring(0, 500)
        });
        return res.status(500).json({
          success: false,
          error: `AI service error (${response.status}). Please try again.`
        });
      }

      let data: Record<string, unknown>;
      try {
        data = await response.json() as Record<string, unknown>;
      } catch (parseErr) {
        logger.error('Failed to parse LLM response', { error: (parseErr as Error).message });
        return res.status(500).json({
          success: false,
          error: 'Invalid response from AI service'
        });
      }
      
      logger.info('LLM response received', { 
        hasOutput: !!data.output, 
        hasText: !!data.text,
        hasResponse: !!data.response,
        dataKeys: Object.keys(data)
      });
      
      const assistantResponse = ((data.output || data.text || data.response || '') as string).trim();

      if (!assistantResponse) {
        logger.warn('Empty LLM response', { data: JSON.stringify(data).substring(0, 500) });
        return res.status(500).json({
          success: false,
          error: 'Empty response from AI'
        });
      }

      // Parse for action JSON
      let action = parseActionFromResponse(assistantResponse);
      
      // If there's a reference image (explicit or auto-detected) and an action, inject it into the params
      if (action && effectiveReferenceImage) {
        if (action.action === 'generate_image') {
          action = {
            ...action,
            params: {
              ...action.params,
              referenceImage: effectiveReferenceImage,
              isEdit: isAutoEdit || !!action.params.isEdit,
              // Pass original prompt for context-aware optimization
              originalImagePrompt: isAutoEdit ? context?.lastGeneratedPrompt : undefined
            }
          };
        } else if (action.action === 'generate_video') {
          action = {
            ...action,
            params: {
              ...action.params,
              firstFrameUrl: effectiveReferenceImage,
              generationMode: 'image-to-video'
            }
          };
        }
      }
      
      logger.info('Chat assistant response parsed', {
        hasAction: !!action,
        actionType: action?.action,
        hasReferenceImage: !!effectiveReferenceImage,
        isAutoEdit,
        responsePreview: assistantResponse.substring(0, 200)
      });
      
      // Clean response for display (remove JSON)
      let cleanedResponse = cleanResponseForDisplay(assistantResponse);
      
      // If we have an action but the cleaned response is empty or just whitespace,
      // use a friendly message based on the action type and model
      if (action && (!cleanedResponse || cleanedResponse.length < 10)) {
        const actionType = action.action;
        const params = action.params;
        
        if (actionType === 'generate_image') {
          const numImages = typeof params.numImages === 'number' ? params.numImages : 1;
          const model = params.model || params.imageModel || 'FLUX';
          const modelName = model === 'flux' ? 'FLUX' : model === 'flux-2' ? 'FLUX 2' : model === 'nano-banana-pro' ? 'Nano Banana' : 'FLUX';
          const is360 = /\b360\b/i.test(params.prompt as string || '');
          
          if (is360) {
            cleanedResponse = `I'll create a 360° panoramic image for you using ${modelName}!`;
          } else {
            cleanedResponse = `I'll create ${numImages} image${numImages > 1 ? 's' : ''} for you using ${modelName}!`;
          }
        } else if (actionType === 'generate_video') {
          const duration = params.duration || '6s';
          const model = params.model || params.videoModel || 'ltx';
          const modelName = model === 'ltx' ? 'LTX-2' : 'Veo 3.1';
          const quality = params.quality || 'fast';
          const qualityText = quality === 'quality' ? 'premium quality' : 'fast';
          const audioText = params.generateAudio !== false ? ' with audio' : '';
          
          cleanedResponse = `I'll generate a ${duration} ${qualityText} video for you using ${modelName}${audioText}!`;
        } else if (actionType === 'generate_music') {
          const duration = params.musicDuration || 30;
          const genre = params.genre || 'music';
          const genreText = genre === 'lo-fi' ? 'lo-fi hip hop' : genre === 'electronic' ? 'electronic' : genre === 'orchestral' ? 'orchestral' : genre;
          
          cleanedResponse = `I'll create a ${duration}-second ${genreText} track for you!`;
        } else {
          cleanedResponse = action.description || 'Ready to generate!';
        }
      }
      
      // If still no response, use the original (shouldn't happen, but fallback)
      if (!cleanedResponse || cleanedResponse.length === 0) {
        cleanedResponse = assistantResponse;
      }

      const duration = Date.now() - startTime;
      logger.info('Chat assistant message completed', { 
        duration,
        messageLength: message.length,
        responseLength: assistantResponse.length,
        hasAction: !!action
      });

      return res.json({
        success: true,
        response: cleanedResponse,
        action: action || undefined,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const err = error as Error;
      
      if (err.name === 'AbortError') {
        logger.warn('Chat assistant request timed out');
        return res.status(504).json({
          success: false,
          error: 'Request timed out'
        });
      }

      logger.error('Chat assistant error', { error: err.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to process request'
      });
    }
  });

  /**
   * POST /generate
   * Execute a confirmed generation action
   */
  router.post('/generate', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { action, context } = req.body as GenerateRequestBody;

      if (!action || !action.action || !action.params) {
        return res.status(400).json({
          success: false,
          error: 'Invalid action'
        });
      }

      if (!context?.userId && !context?.walletAddress && !context?.email) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
      }

      const { action: actionType, params } = action;
      
      // Add user context to params
      const fullParams = {
        ...params,
        userId: context.userId,
        walletAddress: context.walletAddress,
        email: context.email
      };

      let result: unknown;
      let contentType: 'image' | 'video' | 'music';

      switch (actionType) {
        case 'generate_image':
          contentType = 'image';
          const imageModel = params.model || params.imageModel || 'flux';
          const imagePrompt = params.prompt as string;
          const hasReferenceImage = !!params.referenceImage;
          const isFlux2 = imageModel === 'flux-2';
          const is360Request = /\b360\b/i.test(imagePrompt);
          
          logger.info('Generating image via chat', { 
            prompt: imagePrompt?.substring(0, 50),
            model: imageModel,
            numImages: params.numImages || 1,
            hasReferenceImage,
            isFlux2,
            is360Request
          });
          
          // Optimize prompt per model before API call
          let optimizedPrompt = imagePrompt;
          const isEdit = hasReferenceImage || params.isEdit;
          const originalImagePrompt = params.originalImagePrompt as string | undefined;
          
          // Model-specific prompt optimization
          if (imagePrompt && imagePrompt.trim()) {
            try {
              if (isEdit) {
                // Image editing - use model-specific optimizer
                if (imageModel === 'flux-2') {
                  const result = await optimizePromptForFlux2Edit(imagePrompt);
                  if (!result.skipped && result.optimizedPrompt) {
                    optimizedPrompt = result.optimizedPrompt;
                    logger.debug('FLUX 2 edit prompt optimized', {
                      original: imagePrompt.substring(0, 50),
                      optimized: optimizedPrompt.substring(0, 50)
                    });
                  }
                } else if (imageModel === 'nano-banana-pro') {
                  const result = await optimizePromptForNanoBananaEdit(imagePrompt, originalImagePrompt);
                  if (!result.skipped && result.optimizedPrompt) {
                    optimizedPrompt = result.optimizedPrompt;
                    logger.debug('Nano Banana edit prompt optimized', {
                      original: imagePrompt.substring(0, 50),
                      optimized: optimizedPrompt.substring(0, 50)
                    });
                  }
                } else {
                  // FLUX standard
                  const result = await optimizePromptForFluxEdit(imagePrompt, originalImagePrompt);
                  if (!result.skipped && result.optimizedPrompt) {
                    optimizedPrompt = result.optimizedPrompt;
                    logger.debug('FLUX edit prompt optimized', {
                      original: imagePrompt.substring(0, 50),
                      optimized: optimizedPrompt.substring(0, 50)
                    });
                  }
                }
              } else if (isFlux2) {
                // Text-to-image with FLUX 2
                const result = await optimizePromptForFlux2T2I(imagePrompt);
                if (!result.skipped && result.optimizedPrompt) {
                  optimizedPrompt = result.optimizedPrompt;
                  logger.debug('FLUX 2 T2I prompt optimized', {
                    original: imagePrompt.substring(0, 50),
                    optimized: optimizedPrompt.substring(0, 50)
                  });
                }
              }
            } catch (err) {
              logger.warn('Prompt optimization failed in chat, using original', { error: (err as Error).message });
            }
          }
          
          logger.info('Image prompt optimization complete', {
            model: imageModel,
            isEdit,
            originalLength: imagePrompt.length,
            optimizedLength: optimizedPrompt.length,
            wasOptimized: optimizedPrompt !== imagePrompt
          });
          
          // Only pass essential parameters to the API
          result = await callInternalEndpoint('/api/generate/image', {
            prompt: optimizedPrompt,
            num_images: params.numImages || 1,
            aspect_ratio: getAspectRatio(params.imageSize as string),
            model: imageModel,
            optimizePrompt: isFlux2, // Let endpoint handle optimization if needed
            ...(hasReferenceImage && { image_url: params.referenceImage }),
            ...fullParams
          }, req);
          break;

        case 'generate_video':
          contentType = 'video';
          // Determine generation mode based on whether we have a first frame
          const hasFirstFrame = !!params.firstFrameUrl;
          const videoMode = hasFirstFrame ? 'image-to-video' : (params.generationMode || 'text-to-video');
          const videoModel = params.model || params.videoModel || 'ltx';
          const videoPrompt = params.prompt as string;
          
          logger.info('Generating video via chat', { 
            prompt: videoPrompt?.substring(0, 50),
            model: videoModel,
            duration: params.duration || '6s',
            hasFirstFrame,
            generationMode: videoMode
          });
          
          // Only pass essential parameters to the API
          const videoRequestBody: Record<string, unknown> = {
            prompt: videoPrompt,
            duration: params.duration || '6s',
            model: videoModel,
            quality: params.quality || 'fast',
            generate_audio: params.generateAudio !== false,
            generation_mode: videoMode,
            ...fullParams
          };
          
          if (hasFirstFrame && params.firstFrameUrl) {
            videoRequestBody.first_frame_url = params.firstFrameUrl;
          }
          if (params.lastFrameUrl) {
            videoRequestBody.last_frame_url = params.lastFrameUrl;
          }
          
          result = await callInternalEndpoint('/api/generate/video', videoRequestBody, req);
          break;

        case 'generate_music':
          contentType = 'music';
          
          // Validate and ensure prompt is present
          let musicPrompt = params.prompt as string;
          if (!musicPrompt || typeof musicPrompt !== 'string' || musicPrompt.trim().length === 0) {
            // Fallback to description if prompt is missing
            musicPrompt = action.description || 'Lo-fi hip hop beat';
            logger.warn('Music prompt missing, using fallback', { 
              fallbackPrompt: musicPrompt.substring(0, 50),
              hasDescription: !!action.description
            });
          }
          
          // Optimize music prompt before API call
          let optimizedMusicPrompt = musicPrompt.trim();
          try {
            const optimizationResult = await optimizePromptForMusic(optimizedMusicPrompt, params.genre as string || null);
            if (!optimizationResult.skipped && optimizationResult.optimizedPrompt) {
              optimizedMusicPrompt = optimizationResult.optimizedPrompt;
              logger.debug('Music prompt optimized in chat', {
                original: musicPrompt.substring(0, 50),
                optimized: optimizedMusicPrompt.substring(0, 50)
              });
            }
          } catch (err) {
            logger.warn('Music prompt optimization failed in chat, using original', { error: (err as Error).message });
          }
          
          logger.info('Generating music via chat', { 
            prompt: optimizedMusicPrompt.substring(0, 50),
            duration: params.musicDuration || 30,
            genre: params.genre
          });
          
          // Only pass essential parameters to the API
          result = await callInternalEndpoint('/api/generate/music', {
            prompt: optimizedMusicPrompt,
            duration: params.musicDuration || 30,
            selectedGenre: params.genre,
            optimizePrompt: false, // Already optimized above
            ...fullParams
          }, req);
          break;

        default:
          return res.status(400).json({
            success: false,
            error: 'Unknown action type'
          });
      }

      const typedResult = result as {
        success?: boolean;
        images?: string[];
        video?: { url: string; content_type?: string; file_name?: string; file_size?: number } | string;
        video_url?: string;
        audio_file?: { url: string; content_type?: string; file_name?: string; file_size?: number };
        audio_url?: string;
        remainingCredits?: number;
        creditsDeducted?: number;
        error?: string;
      };

      // Log the result for debugging
      logger.debug('Generation result received', {
        contentType,
        hasImages: !!typedResult.images,
        hasVideo: !!typedResult.video,
        hasVideoUrl: !!typedResult.video_url,
        hasAudioFile: !!typedResult.audio_file,
        hasAudioUrl: !!typedResult.audio_url,
        success: typedResult.success,
        resultKeys: Object.keys(typedResult)
      });

      // Extract URLs based on content type
      let urls: string[] = [];
      if (contentType === 'image' && typedResult.images) {
        urls = typedResult.images;
      } else if (contentType === 'video') {
        // Handle both { url: string } object and string formats
        let videoUrl: string | undefined;
        if (typedResult.video) {
          if (typeof typedResult.video === 'string') {
            videoUrl = typedResult.video;
          } else if (typedResult.video.url) {
            videoUrl = typedResult.video.url;
          }
        } else if (typedResult.video_url) {
          videoUrl = typedResult.video_url;
        }
        if (videoUrl) {
          urls = [videoUrl];
          logger.info('Video URL extracted', { videoUrl: videoUrl.substring(0, 100) });
        } else {
          logger.warn('No video URL found in result', { resultKeys: Object.keys(typedResult) });
        }
      } else if (contentType === 'music') {
        // Handle both { url: string } object and string formats
        let audioUrl: string | undefined;
        if (typedResult.audio_file?.url) {
          audioUrl = typedResult.audio_file.url;
        } else if (typedResult.audio_url) {
          audioUrl = typedResult.audio_url;
        }
        if (audioUrl) {
          urls = [audioUrl];
          logger.info('Audio URL extracted', { audioUrl: audioUrl.substring(0, 100) });
        } else {
          logger.warn('No audio URL found in result', { resultKeys: Object.keys(typedResult) });
        }
      }

      // Check if we got URLs
      if (urls.length === 0) {
        logger.error('No URLs extracted from generation result', {
          contentType,
          typedResult: JSON.stringify(typedResult).substring(0, 500)
        });
        return res.status(500).json({
          success: false,
          error: `Generation completed but no ${contentType} URL was returned`
        });
      }

      const elapsedTime = Date.now() - startTime;
      logger.info('Chat assistant generation completed', { 
        duration: elapsedTime,
        actionType,
        urlCount: urls.length,
        creditsUsed: typedResult.creditsDeducted,
        remainingCredits: typedResult.remainingCredits
      });

      // Build response with all relevant metadata
      const generatedContent: Record<string, unknown> = {
        type: contentType,
        urls,
        prompt: params.prompt as string,
        creditsUsed: typedResult.creditsDeducted,
        remainingCredits: typedResult.remainingCredits
      };

      // Add video-specific metadata
      if (contentType === 'video' && typedResult.video && typeof typedResult.video === 'object') {
        generatedContent.metadata = {
          content_type: typedResult.video.content_type,
          file_name: typedResult.video.file_name,
          file_size: typedResult.video.file_size
        };
      }

      // Add music-specific metadata  
      if (contentType === 'music' && typedResult.audio_file) {
        generatedContent.metadata = {
          content_type: typedResult.audio_file.content_type,
          file_name: typedResult.audio_file.file_name,
          file_size: typedResult.audio_file.file_size
        };
      }

      return res.json({
        success: true,
        message: `Generated successfully!`,
        generatedContent
      });

    } catch (error) {
      const err = error as Error;
      logger.error('Chat assistant generation error', { error: err.message });
      return res.status(500).json({
        success: false,
        error: err.message || 'Generation failed'
      });
    }
  });

  return router;
}

/**
 * Convert image size to aspect ratio
 */
function getAspectRatio(imageSize?: string): string {
  const ratioMap: Record<string, string> = {
    'square': '1:1',
    'portrait_16_9': '9:16',
    'portrait_4_3': '3:4',
    'portrait_3_2': '2:3',
    'landscape_16_9': '16:9',
    'landscape_4_3': '4:3',
    'landscape_3_2': '3:2',
    'ultra_wide': '21:9'
  };
  return ratioMap[imageSize || 'square'] || '1:1';
}

/**
 * Call an internal API endpoint
 */
async function callInternalEndpoint(
  path: string, 
  body: Record<string, unknown>,
  originalReq: Request
): Promise<unknown> {
  const baseUrl = `http://localhost:${process.env.PORT || 3001}`;
  
  // Forward all relevant headers for authentication
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  // Forward auth headers
  if (originalReq.headers.authorization) {
    headers['Authorization'] = originalReq.headers.authorization as string;
  }
  if (originalReq.headers['x-csrf-token']) {
    headers['X-CSRF-Token'] = originalReq.headers['x-csrf-token'] as string;
  }
  // Forward cookies for session-based auth
  if (originalReq.headers.cookie) {
    headers['Cookie'] = originalReq.headers.cookie as string;
  }
  
  logger.debug('Calling internal endpoint', { 
    path, 
    bodyKeys: Object.keys(body),
    hasAuth: !!headers['Authorization'],
    hasCookies: !!headers['Cookie']
  });
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch (parseErr) {
    logger.error('Failed to parse internal endpoint response', { 
      path, 
      status: response.status,
      error: (parseErr as Error).message
    });
    throw new Error(`Failed to parse response from ${path}: ${response.status}`);
  }
  
  if (!response.ok) {
    const errorData = data as { error?: string; message?: string; detail?: string; success?: boolean };
    const errorMessage = errorData.error || errorData.message || errorData.detail || `Request failed: ${response.status}`;
    logger.error('Internal endpoint error', { 
      path, 
      status: response.status, 
      error: errorMessage,
      responseData: JSON.stringify(data).substring(0, 300)
    });
    throw new Error(errorMessage);
  }
  
  logger.debug('Internal endpoint success', { 
    path, 
    responseKeys: Object.keys(data as Record<string, unknown>)
  });
  
  return data;
}
