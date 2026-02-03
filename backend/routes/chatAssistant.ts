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

CRITICAL RULES:
1. Never say you cannot do something. Always attempt to generate what the user requests.
2. Do not explain limitations or apologize. Just generate.
3. ALWAYS generate exactly 1 image unless user EXPLICITLY asks for multiple (e.g., "make 3 images", "create 4 variations").
4. Default to 1 image - never assume the user wants multiple.

When you understand what to generate, respond with a friendly message followed by JSON:

\`\`\`json
{
  "action": "generate_image" | "generate_video" | "generate_music",
  "params": {
    "prompt": "detailed prompt (REQUIRED)",
    "numImages": 1,
    "imageSize": "square" | "portrait_16_9" | "landscape_16_9" | "portrait_4_3" | "landscape_4_3",
    "duration": "4s" | "6s" | "8s",
    "model": "flux" | "flux-2" | "nano-banana-pro" | "ltx" | "veo",
    "quality": "fast" | "quality",
    "generateAudio": true,
    "musicDuration": 30,
    "genre": "lo-fi" | "electronic" | "orchestral" | "rock" | "jazz",
    "isEdit": false,
    "useMultipleImages": false
  },
  "estimatedCredits": number,
  "description": "brief description"
}
\`\`\`

DEFAULTS (use these unless user specifies otherwise):
- numImages: 1 (ALWAYS 1 unless user explicitly asks for more)
- imageSize: "square" for general, "landscape_16_9" for scenes/landscapes, "portrait_4_3" for people
- duration: "6s" for video
- musicDuration: 30 for music
- generateAudio: true for video

MODEL ROUTING (pick the BEST model for the task):
**Images:**
- "flux" (0.5 cr): Default choice. Fast, versatile, good for most requests.
- "flux-2" (0.65 cr): Use for photorealistic images, images with text, or when user wants highest quality.
- "nano-banana-pro" (0.7 cr): Use ONLY for 360° panoramas or when user explicitly requests it.

**Videos:**
- "ltx" (1 cr/sec): Default. Fast, affordable, good for simple scenes and quick previews.
- "veo" (2.2 cr/sec): Use for cinematic quality, complex scenes, or when user wants premium output.

**Music:**
- Always include genre, instruments, mood, and tempo in prompt for best results.

CREDIT COSTS:
- Images: flux=0.5, flux-2=0.65, nano-banana-pro=0.7 per image
- Videos: ltx=1/sec, veo=2.2/sec (4s=4-8.8 cr, 6s=6-13.2 cr, 8s=8-17.6 cr)
- Music: 15-60s=0.25 cr, 120s=0.5 cr, 180s=0.75 cr

IMAGE EDITING (when user wants to modify a previous image):
Set "isEdit": true when user uses phrases like:
- "add a hat", "put glasses on", "add sunglasses"
- "change the background", "make the sky blue"
- "remove the tree", "make it darker"
- References like "it", "this", "that", "the image"

For edits, write prompt as a modification instruction:
- User: "add a red hat" → prompt: "add a red hat to the person"
- User: "make it sunset" → prompt: "change the background to a beautiful sunset"

MULTI-IMAGE EDITING (when user provides multiple images):
When user attaches multiple images and wants to combine elements:
- Set "isEdit": true AND "useMultipleImages": true
- The FIRST image is the BASE image to edit
- Additional images are REFERENCE images for elements to extract
- Write the prompt to describe what to take from reference images and add to base

Examples:
- User: "[2 images] Add the hat from the second image to the first"
  → prompt: "Add the hat from the reference image to the person in the base image"
- User: "[2 images] Put this outfit on that person"
  → prompt: "Apply the outfit from the reference image to the person in the base image"
- User: "[3 images] Combine elements: use image 1 as base, add the car from image 2 and the sky from image 3"
  → prompt: "Add the car from reference image 1 and the sky background from reference image 2 to the base image"
- User: "Edit my previous image with elements from this new one"
  → Set isEdit: true, useMultipleImages: true, prompt describes what to transfer

When user says things like "edit the previous image with this one", "combine these", "add stuff from this to that":
- The previously generated image becomes the BASE
- The newly attached image becomes the REFERENCE
- Set isEdit: true and useMultipleImages: true

360° PANORAMAS:
- When user mentions "360" or "panorama", use model: "nano-banana-pro"
- Use simple prompt like "360 panorama of [scene]"
- Always use imageSize: "landscape_16_9"

IMPORTANT:
- Always include a friendly message before JSON
- If unclear, ask ONE short question (no JSON)
- Never include numImages > 1 unless user explicitly requested multiple images`;


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

// Patterns that indicate multi-image editing (combining elements from multiple images)
const MULTI_IMAGE_EDIT_PATTERNS = [
  /\b(from|in)\s+(the\s+)?(second|other|new|this|that)\s+(image|picture|photo)/i,
  /\b(to|on|onto)\s+(the\s+)?(first|previous|base|original)\s+(image|picture|photo)?/i,
  /\b(combine|merge|blend)\s+(these|the|both)\s*(images|pictures|photos)?/i,
  /\b(take|get|use|copy)\s+(the|this|that)?\s*\w+\s+(from|in)\s+(image|picture|photo)\s*\d*/i,
  /\b(add|put)\s+(the|this|that)?\s*\w+\s+from\s+(image|picture|photo|the\s+second|the\s+new)/i,
  /\bedit\s+(the\s+)?previous\s+(image|picture|photo)?\s*(with|using)/i,
  /\buse\s+(this|the\s+new)\s+(image|picture|photo)?\s*(to|for|on)/i,
  /\b(image|picture|photo)\s*[12]\b/i,
  /\b(first|second|third)\s+(image|picture|photo)/i,
  /\bapply\s+(this|the|that)\s+\w+\s+to/i,
  /\btransfer\s+(the|this|that)?\s*\w+/i,
  /\bswap\s+(the|this|that)?\s*\w+/i,
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
  referenceImage?: string;        // Single reference image (backwards compat)
  referenceImages?: string[];     // Multiple reference images for multi-image editing
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

/**
 * Check if a message appears to be a multi-image edit request
 * This is when user wants to combine elements from multiple images
 */
function isMultiImageEditRequest(message: string, numImages: number): boolean {
  if (numImages < 2) return false;
  
  // Check against multi-image edit patterns
  for (const pattern of MULTI_IMAGE_EDIT_PATTERNS) {
    if (pattern.test(message)) {
      return true;
    }
  }
  
  // Additional keyword checks for multi-image scenarios
  const lowerMessage = message.toLowerCase();
  const multiImageKeywords = [
    'from this image', 'from the new image', 'from image 2', 
    'to the first', 'to the previous', 'on the base',
    'combine', 'merge', 'blend', 'swap', 'transfer',
    'use this to', 'apply this', 'copy the'
  ];
  
  for (const keyword of multiImageKeywords) {
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
      const { message, history = [], context, referenceImage, referenceImages } = req.body as ChatRequestBody;

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
      
      // Normalize reference images - support both single and array format
      let allReferenceImages: string[] = [];
      if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
        allReferenceImages = referenceImages;
      } else if (referenceImage) {
        allReferenceImages = [referenceImage];
      }
      
      // Check if this looks like an edit request and we have a previous image
      const hasLastGeneratedImage = !!context?.lastGeneratedImageUrl;
      const hasExplicitReferences = allReferenceImages.length > 0;
      const detectedAsEdit = isEditRequest(message, hasLastGeneratedImage || hasExplicitReferences);
      
      // Check for multi-image edit (combining elements from multiple images)
      // This can happen in two ways:
      // 1. User attaches multiple images
      // 2. User attaches new image(s) and wants to edit a previously generated image
      let isMultiImageEdit = false;
      let effectiveReferenceImages: string[] = [...allReferenceImages];
      let isAutoEdit = false;
      
      // If user has explicit reference images
      if (hasExplicitReferences) {
        // Check if they want to combine with previous image
        if (hasLastGeneratedImage && context?.lastGeneratedImageUrl) {
          const wantsToEditPrevious = isMultiImageEditRequest(message, allReferenceImages.length + 1) ||
            /\b(previous|last|earlier|before|that|the)\s+(image|picture|photo|one)\b/i.test(message) ||
            /\bedit\s+(the\s+)?previous\b/i.test(message) ||
            /\bto\s+(the\s+)?(previous|last|first|base)\b/i.test(message);
          
          if (wantsToEditPrevious) {
            // Previous image becomes the base, attached images become references
            effectiveReferenceImages = [context.lastGeneratedImageUrl, ...allReferenceImages];
            isMultiImageEdit = true;
            isAutoEdit = true;
            logger.info('Multi-image edit: using previous image as base, attached as references', {
              previousImageUrl: context.lastGeneratedImageUrl.substring(0, 50),
              numAttachedImages: allReferenceImages.length
            });
          } else if (allReferenceImages.length > 1) {
            // Multiple attached images - first is base, rest are references
            isMultiImageEdit = true;
            logger.info('Multi-image edit: first attached image as base, others as references', {
              numImages: allReferenceImages.length
            });
          }
        } else if (allReferenceImages.length > 1) {
          // Multiple attached images - first is base, rest are references
          isMultiImageEdit = true;
          logger.info('Multi-image edit: first attached image as base, others as references', {
            numImages: allReferenceImages.length
          });
        }
      } else if (detectedAsEdit && hasLastGeneratedImage && context?.lastGeneratedImageUrl) {
        // No explicit references but edit detected - use last generated image
        effectiveReferenceImages = [context.lastGeneratedImageUrl];
        isAutoEdit = true;
        logger.info('Auto-detected edit request, using last generated image', {
          lastImageUrl: context.lastGeneratedImageUrl.substring(0, 50),
          lastPrompt: context.lastGeneratedPrompt?.substring(0, 50)
        });
      }
      
      // Note: effectiveReferenceImages[0] is the primary/base image for backwards compatibility
      
      logger.info('Chat assistant processing message', { 
        messageLength: message.length, 
        historyLength: history.length,
        hasContext: !!context,
        hasCredits: context?.credits !== undefined,
        hasReferenceImage: !!referenceImage,
        numReferenceImages: allReferenceImages.length,
        hasLastGeneratedImage,
        detectedAsEdit,
        isMultiImageEdit,
        isAutoEdit,
        effectiveNumImages: effectiveReferenceImages.length
      });

      // Build context info
      let contextInfo = '';
      if (context?.credits !== undefined) {
        contextInfo += `\nUser has ${context.credits} credits available.`;
      }
      
      // Add multi-image edit context
      if (isMultiImageEdit && effectiveReferenceImages.length > 1) {
        contextInfo += `\n\nMULTI-IMAGE EDIT MODE: The user wants to combine elements from multiple images.
Number of images available: ${effectiveReferenceImages.length}
- Image 1 (BASE): ${isAutoEdit ? 'Previously generated image' : 'First attached image'}
- Images 2-${effectiveReferenceImages.length} (REFERENCES): ${isAutoEdit ? 'Newly attached images' : 'Additional attached images'}
${context?.lastGeneratedPrompt && isAutoEdit ? `\nOriginal base image prompt was: "${context.lastGeneratedPrompt}"` : ''}

IMPORTANT: 
- Set "isEdit": true AND "useMultipleImages": true in your JSON params
- Write the prompt describing what elements to take FROM the reference images and add TO the base image
- Example: "Add the hat from the reference image to the person in the base image"`;
      } else if (isAutoEdit && context?.lastGeneratedImageUrl) {
        // Single image edit (editing previous image)
        contextInfo += `\n\nEDIT MODE DETECTED: The user is asking to modify a previously generated image.
Previous image URL available: YES (will be auto-attached)
${context.lastGeneratedPrompt ? `Original image prompt was: "${context.lastGeneratedPrompt}"` : ''}

IMPORTANT: Set "isEdit": true in your JSON params. The referenceImage will be automatically attached.
Write the prompt as an EDIT INSTRUCTION describing what to change or add.`;
      } else if (effectiveReferenceImages.length === 1) {
        // Single explicit reference image
        contextInfo += `\n\nIMPORTANT: User has attached a REFERENCE IMAGE to this message. When generating, you should:
- For images: Use this as an image-to-image reference (set referenceImage in params)
- For videos: Use this as the first frame (set firstFrameUrl in params, use image-to-video mode)
Include the reference in your JSON response params.`;
      } else if (effectiveReferenceImages.length > 1) {
        // Multiple explicit reference images without previous image context
        contextInfo += `\n\nIMPORTANT: User has attached ${effectiveReferenceImages.length} REFERENCE IMAGES.
- Image 1: The BASE image to edit
- Images 2-${effectiveReferenceImages.length}: REFERENCE images with elements to extract

Set "isEdit": true AND "useMultipleImages": true in your JSON params.
Write the prompt describing what to take from reference images and add to the base.`;
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
      
      // If there are reference images (explicit or auto-detected) and an action, inject them into the params
      if (action && effectiveReferenceImages.length > 0) {
        if (action.action === 'generate_image') {
          action = {
            ...action,
            params: {
              ...action.params,
              // Primary reference image (base for editing)
              referenceImage: effectiveReferenceImages[0],
              // All reference images for multi-image editing
              referenceImages: effectiveReferenceImages.length > 1 ? effectiveReferenceImages : undefined,
              isEdit: isAutoEdit || isMultiImageEdit || !!action.params.isEdit,
              useMultipleImages: isMultiImageEdit || effectiveReferenceImages.length > 1,
              // Pass original prompt for context-aware optimization
              originalImagePrompt: isAutoEdit ? context?.lastGeneratedPrompt : undefined
            }
          };
        } else if (action.action === 'generate_video') {
          action = {
            ...action,
            params: {
              ...action.params,
              firstFrameUrl: effectiveReferenceImages[0],
              generationMode: 'image-to-video'
            }
          };
        }
      }
      
      logger.info('Chat assistant response parsed', {
        hasAction: !!action,
        actionType: action?.action,
        numReferenceImages: effectiveReferenceImages.length,
        isAutoEdit,
        isMultiImageEdit,
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
          const imagePrompt = params.prompt as string;
          const hasReferenceImage = !!params.referenceImage;
          const hasMultipleImages = Array.isArray(params.referenceImages) && params.referenceImages.length > 1;
          const imageModel = params.model || params.imageModel || 'flux';
          const isFlux2 = imageModel === 'flux-2';
          const is360Request = /\b360\b/i.test(imagePrompt);
          
          // Build image URLs array for multi-image support
          let imageUrls: string[] = [];
          if (hasMultipleImages && params.referenceImages) {
            imageUrls = params.referenceImages as string[];
          } else if (hasReferenceImage && params.referenceImage) {
            imageUrls = [params.referenceImage as string];
          }
          
          // IMPORTANT: Default to 1 image, clamp to valid range (1-4)
          // Only allow multiple images if explicitly requested
          const requestedNumImages = typeof params.numImages === 'number' ? params.numImages : 1;
          const numImagesToGenerate = Math.min(4, Math.max(1, Math.floor(requestedNumImages)));
          
          logger.info('Generating image via chat', { 
            prompt: imagePrompt?.substring(0, 50),
            model: imageModel,
            numImages: numImagesToGenerate,
            requestedNumImages,
            hasReferenceImage,
            hasMultipleImages,
            numReferenceImages: imageUrls.length,
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
            wasOptimized: optimizedPrompt !== imagePrompt,
            numImageUrls: imageUrls.length
          });
          
          // Only pass essential parameters to the API
          // Use clamped numImagesToGenerate (default 1, max 4)
          // Pass image_urls (plural) for multi-image editing support
          result = await callInternalEndpoint('/api/generate/image', {
            prompt: optimizedPrompt,
            num_images: numImagesToGenerate,
            aspect_ratio: getAspectRatio(params.imageSize as string),
            model: imageModel,
            optimizePrompt: isFlux2, // Let endpoint handle optimization if needed
            // Pass multiple images as image_urls array for proper multi-image editing
            ...(imageUrls.length > 0 && { image_urls: imageUrls }),
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
          
          const musicDuration = typeof params.musicDuration === 'number' ? params.musicDuration : 30;
          
          logger.info('Generating music via chat', { 
            prompt: optimizedMusicPrompt.substring(0, 50),
            promptLength: optimizedMusicPrompt.length,
            duration: musicDuration,
            genre: params.genre,
            rawMusicDuration: params.musicDuration,
            paramsKeys: Object.keys(params)
          });
          
          // Only pass essential parameters to the API
          const musicRequestBody = {
            prompt: optimizedMusicPrompt,
            duration: musicDuration,
            selectedGenre: params.genre || null,
            optimizePrompt: false, // Already optimized above
            userId: context.userId,
            walletAddress: context.walletAddress,
            email: context.email
          };
          
          logger.info('Music request body', { 
            hasPrompt: !!musicRequestBody.prompt,
            promptLength: musicRequestBody.prompt?.length,
            duration: musicRequestBody.duration
          });
          
          result = await callInternalEndpoint('/api/generate/music', musicRequestBody, req);
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
      logger.info('Generation result received', {
        contentType,
        hasImages: !!typedResult.images,
        hasVideo: !!typedResult.video,
        hasVideoUrl: !!typedResult.video_url,
        hasAudioFile: !!typedResult.audio_file,
        hasAudioUrl: !!typedResult.audio_url,
        audioFileUrl: typedResult.audio_file?.url?.substring(0, 100),
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
