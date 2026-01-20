/**
 * Chat Assistant Route
 * Provides a unified conversational interface for all generation capabilities
 * Uses Claude to understand user intent and orchestrate generation actions
 */
import { Router, type Request, type Response } from 'express';
import logger from '../utils/logger';
import { getFalApiKey } from '../services/fal';

// System prompt for the chat assistant - optimized for Claude 3 Haiku
const SYSTEM_PROMPT = `You are a creative AI assistant for SeisoAI. Generate images, videos, and music.

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
    "genre": "lo-fi" | "electronic" | "orchestral"
  },
  "estimatedCredits": number,
  "description": "brief description"
}
\`\`\`

RULES:
- Always include a friendly message before JSON
- If unclear, ask ONE short question (no JSON)
- Defaults: square images, 6s video, 30s music
- For 360 panoramas: use simple prompt like "360 panorama of [scene]" - backend handles formatting
- Credits: Images 0.5-0.7, Videos 1-8.25/sec, Music 0.25/min`;

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
  };
  referenceImage?: string;
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
      
      logger.info('Chat assistant processing message', { 
        messageLength: message.length, 
        historyLength: history.length,
        hasContext: !!context,
        hasCredits: context?.credits !== undefined,
        hasReferenceImage: !!referenceImage
      });

      // Build context info
      let contextInfo = '';
      if (context?.credits !== undefined) {
        contextInfo += `\nUser has ${context.credits} credits available.`;
      }
      if (referenceImage) {
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
      
      // If there's a reference image and an action, inject it into the params
      if (action && referenceImage) {
        if (action.action === 'generate_image') {
          action = {
            ...action,
            params: {
              ...action.params,
              referenceImage
            }
          };
        } else if (action.action === 'generate_video') {
          action = {
            ...action,
            params: {
              ...action.params,
              firstFrameUrl: referenceImage,
              generationMode: 'image-to-video'
            }
          };
        }
      }
      
      logger.info('Chat assistant response parsed', {
        hasAction: !!action,
        actionType: action?.action,
        hasReferenceImage: !!referenceImage,
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
          const numImages = params.numImages || 1;
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
          logger.info('Generating image via chat', { 
            prompt: (params.prompt as string)?.substring(0, 50),
            model: params.model || params.imageModel || 'flux',
            numImages: params.numImages || 1,
            hasReferenceImage: !!params.referenceImage
          });
          // Call the image generation endpoint via internal fetch
          // Map referenceImage to image_url for the generate endpoint
          result = await callInternalEndpoint('/api/generate/image', {
            prompt: params.prompt,
            num_images: params.numImages || 1,
            numImages: params.numImages || 1,
            aspect_ratio: getAspectRatio(params.imageSize as string),
            guidance_scale: 7.5,
            output_format: 'jpeg',
            safety_tolerance: '6',
            prompt_safety_tolerance: '6',
            enhance_prompt: true,
            seed: Math.floor(Math.random() * 2147483647),
            model: params.model || params.imageModel || 'flux',
            // Map referenceImage to image_url for image-to-image generation
            ...(params.referenceImage && { image_url: params.referenceImage }),
            ...fullParams
          }, req);
          break;

        case 'generate_video':
          contentType = 'video';
          // Determine generation mode based on whether we have a first frame
          const hasFirstFrame = !!params.firstFrameUrl;
          const videoMode = hasFirstFrame ? 'image-to-video' : (params.generationMode || 'text-to-video');
          
          logger.info('Generating video via chat', { 
            prompt: (params.prompt as string)?.substring(0, 50),
            model: params.model || params.videoModel || 'ltx',
            duration: params.duration || '6s',
            hasFirstFrame,
            generationMode: videoMode
          });
          // Call the video generation endpoint
          result = await callInternalEndpoint('/api/generate/video', {
            prompt: params.prompt,
            duration: params.duration || '6s',
            model: params.model || params.videoModel || 'ltx',
            quality: params.quality || 'fast',
            generate_audio: params.generateAudio !== false,
            generation_mode: videoMode,
            resolution: '720p',
            aspect_ratio: 'auto',
            first_frame_url: params.firstFrameUrl,
            last_frame_url: params.lastFrameUrl,
            ...fullParams
          }, req);
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
          
          logger.info('Generating music via chat', { 
            prompt: musicPrompt.substring(0, 50),
            duration: params.musicDuration || 30,
            genre: params.genre
          });
          // Call the music generation endpoint
          result = await callInternalEndpoint('/api/generate/music', {
            prompt: musicPrompt.trim(),
            duration: params.musicDuration || 30,
            selectedGenre: params.genre,
            optimizePrompt: true,
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
        images?: string[];
        video?: { url: string } | string;
        video_url?: string;
        audio_file?: { url: string };
        remainingCredits?: number;
        creditsDeducted?: number;
      };

      // Extract URLs based on content type
      let urls: string[] = [];
      if (contentType === 'image' && typedResult.images) {
        urls = typedResult.images;
      } else if (contentType === 'video') {
        const videoUrl = typedResult.video 
          ? (typeof typedResult.video === 'string' ? typedResult.video : typedResult.video.url)
          : typedResult.video_url;
        if (videoUrl) urls = [videoUrl];
      } else if (contentType === 'music' && typedResult.audio_file?.url) {
        urls = [typedResult.audio_file.url];
      }

      const duration = Date.now() - startTime;
      logger.info('Chat assistant generation completed', { 
        duration,
        actionType,
        urlCount: urls.length
      });

      return res.json({
        success: true,
        message: `Generated successfully!`,
        generatedContent: {
          type: contentType,
          urls,
          prompt: params.prompt as string,
          creditsUsed: typedResult.creditsDeducted,
          remainingCredits: typedResult.remainingCredits
        }
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
  
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  const data = await response.json();
  
  if (!response.ok) {
    const errorData = data as { error?: string; message?: string; detail?: string };
    throw new Error(errorData.error || errorData.message || errorData.detail || `Request failed: ${response.status}`);
  }
  
  return data;
}
