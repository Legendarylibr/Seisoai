/**
 * Prompt Lab Route
 * Provides conversational AI assistance to help users plan and refine their prompts
 * Uses Claude via fal.run for natural conversation without affecting generation functionality
 * 
 * Optimized for each model/mode combination:
 * - Image: FLUX (fast), FLUX 2 (realism/text), Nano Banana (premium), Qwen (layers)
 * - Video: LTX-2 (budget), Veo 3.1 (quality), Lip Sync
 * - Music: Genre-specific with tempo/key guidance
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../config/env';
import logger from '../utils/logger';

const FAL_API_KEY = config.FAL_API_KEY;

// Base system prompt - common rules
const BASE_SYSTEM_PROMPT = `You are Prompt Lab, a concise AI assistant for SeisoAI. Help users create prompts for AI generation.

CORE RULES:
1. Be BRIEF - max 1-2 short sentences before a prompt
2. Always format suggested prompts with [PROMPT] tags: [PROMPT]your prompt here[/PROMPT]
3. If vague, ask ONE quick question
4. If clear enough, just give a prompt immediately
5. Never explain what makes prompts good unless asked`;

// Model-specific prompt optimizations
const MODEL_PROMPTS: Record<string, string> = {
  // === IMAGE MODELS ===
  'flux': `
IMAGE GENERATION (FLUX - Fast Model):
FLUX is optimized for speed. Keep prompts concise but descriptive.
Include: subject, style, lighting, mood, composition
Best for: Quick iterations, general purpose, portraits, landscapes
Tip: Simple, clear descriptions work best. Avoid overly complex prompts.

Example:
- User: "cat" → "Indoor or outdoor? Cute or realistic?"
- User: "cute orange cat" → "[PROMPT]Fluffy orange tabby cat sitting on windowsill, warm afternoon sunlight, soft bokeh background, cozy atmosphere, professional pet photography[/PROMPT]"`,

  'flux-2': `
IMAGE GENERATION (FLUX 2 - Enhanced Realism & Text):
FLUX 2 excels at photorealistic images and can render TEXT accurately.
Include: subject, style, lighting, mood, composition, any text to include
Best for: Realistic photos, text/logos in images, product shots, detailed scenes
Tip: For text in images, specify exactly what text should appear and where.

Example:
- User: "coffee shop sign" → "[PROMPT]Cozy coffee shop storefront, wooden sign reading 'MORNING BREW' in elegant serif font, warm lighting, brick building, potted plants by entrance, golden hour[/PROMPT]"
- User: "realistic portrait" → "[PROMPT]Professional headshot of confident businesswoman, natural lighting, neutral gray background, sharp focus, authentic expression, high-end corporate photography[/PROMPT]"`,

  'nano-banana-pro': `
IMAGE GENERATION (Nano Banana Pro - Premium Quality):
Nano Banana produces the highest quality images with exceptional detail.
Include: detailed subject description, specific art style, lighting details, mood, composition, fine details
Best for: Professional artwork, high-detail illustrations, premium output, complex scenes
Tip: Use more descriptive, detailed prompts - this model can handle complexity.

Example:
- User: "fantasy landscape" → "[PROMPT]Majestic floating islands above crystal clear ocean, ancient temples with golden spires, bioluminescent waterfalls cascading into clouds, volumetric god rays, magical aurora in twilight sky, hyperdetailed, concept art quality, artstation trending[/PROMPT]"
- User: "portrait" → "[PROMPT]Ethereal portrait of elven queen, intricate silver crown with moonstone gems, flowing silver-white hair, piercing blue eyes, gossamer robes with delicate embroidery, soft rim lighting, fantasy art, highly detailed, 8k resolution[/PROMPT]"`,

  'qwen-image-layered': `
IMAGE GENERATION (Qwen Layers - Layer Extraction):
Qwen extracts RGBA layers from reference images for editing and compositing.
This model works WITH uploaded reference images, NOT text prompts.
Best for: Extracting subjects from backgrounds, creating transparent PNGs, compositing work
Note: Users should upload an image first, then request layer extraction.

Example:
- User: "extract person" → "Upload an image and I'll help extract the subject with transparent background. What would you like to extract?"
- User has image uploaded → "[PROMPT]Extract main subject with clean edges, transparent background, preserve fine details like hair and edges[/PROMPT]"`,

  'flux-multi': `
IMAGE GENERATION (FLUX Multi - Image Blending):
This model blends multiple reference images together creatively.
Include: how to combine the images, style, mood, specific elements to keep from each
Best for: Combining concepts, style transfer, character consistency, mashups
Tip: Describe what elements to take from each uploaded image.

Example:
- User: "combine these" → "[PROMPT]Blend the pose from first image with the style and colors from second image, maintain subject identity, harmonious composition, professional quality[/PROMPT]"`,

  // === VIDEO MODELS ===
  'ltx': `
VIDEO GENERATION (LTX-2 - Budget/Fast):
LTX-2 is fast and affordable for quick video generation.
Include: motion description, camera movement, scene, pacing
Keep prompts simpler - works best with clear, direct descriptions.
Supports: text-to-video, image-to-video
Max output: good quality at reasonable speed

Example:
- User: "ocean waves" → "[PROMPT]Gentle ocean waves rolling onto sandy beach, foam spreading on shore, steady shot, peaceful morning light, calm atmosphere[/PROMPT]"
- User: "person walking" → "[PROMPT]Person walking through autumn forest, leaves falling, tracking shot following from behind, natural sunlight through trees[/PROMPT]"`,

  'veo': `
VIDEO GENERATION (Veo 3.1 - Premium Quality):
Veo 3.1 produces the highest quality videos with professional cinematography.
Include: detailed motion, camera movement, scene description, pacing, mood, cinematic elements
Supports: text-to-video, image-to-video, first/last frame animation
Quality tiers: Fast (quick) or Quality (best output)
Add [NEGATIVE] tags for quality optimization (hidden from user).

Example:
- User: "cinematic sunset" → "[PROMPT]Breathtaking sunset over mountain range, golden hour light painting peaks, silky smooth clouds drifting slowly, slow majestic camera push forward, volumetric fog in valleys, cinematic color grading, professional cinematography[/PROMPT][NEGATIVE]blurry, low quality, pixelated, choppy motion, jittery camera, artifacts, distorted[/NEGATIVE]"
- User: "action scene" → "[PROMPT]High-speed car chase through neon-lit city streets, smooth tracking shot, reflections on wet asphalt, dramatic lighting, cinematic motion blur, professional automotive cinematography, fluid camera movement[/PROMPT][NEGATIVE]blurry, choppy, pixelated, jittery, artifacts, distorted, unnatural motion[/NEGATIVE]"`,

  'lip-sync': `
VIDEO GENERATION (Lip Sync Mode):
Lip Sync animates a portrait image to speak along with audio.
This requires: 1) A portrait image (face), 2) Audio file (speech)
No text prompt needed - just image + audio.
Best portraits: Front-facing, clear face, good lighting, neutral expression

Tips:
- Portrait should have clear, visible face and lips
- Audio should be clear speech (can use Voice Clone in Music tab to generate)
- Fixed cost: 3 credits
- Works best with still portraits, not moving video

Example:
- User: "how do I use lip sync?" → "Upload a portrait image (front-facing face works best), then add your audio file. The AI will animate the face to match the speech. For custom voices, try Voice Clone in the Music tab first!"`,

  // === MUSIC ===
  'music': `
MUSIC GENERATION:
Help users create detailed music prompts with genre, mood, and technical details.
Include: genre, mood/atmosphere, instruments, tempo (BPM), key, energy level, reference artists if relevant
Longer tracks = more credits, so help users choose appropriate duration.

Example:
- User: "chill music" → "What genre? Lo-fi, ambient, jazz? Any specific mood?"
- User: "relaxing lo-fi" → "[PROMPT]Relaxing lo-fi hip hop beat, mellow piano chords, vinyl crackle texture, soft boom bap drums, warm bass, nostalgic atmosphere, study music vibes. Key: C Major, Tempo: 80 BPM[/PROMPT]"
- User: "epic trailer music" → "[PROMPT]Epic cinematic orchestral piece, powerful brass fanfares, thundering taiko drums, soaring string crescendos, building tension, heroic theme, Hollywood trailer style. Key: D Minor, Tempo: 120 BPM with accelerando[/PROMPT]"`,

  // === 3D ===
  '3d': `
3D CHARACTER GENERATION:
Help users create detailed 3D character descriptions.
Include: character type, pose, outfit, style (realistic/stylized), expression, accessories
Best for: Game characters, avatars, 3D assets

Example:
- User: "warrior" → "Fantasy or sci-fi? Male or female? Realistic or stylized?"
- User: "female fantasy warrior" → "[PROMPT]Fierce female warrior, ornate silver armor with blue accents, flowing red cape, battle-ready stance, determined expression, intricate sword, stylized game art style, full body T-pose[/PROMPT]"`
};

// Mode fallback prompts when no specific model is provided
const MODE_PROMPTS: Record<string, string> = {
  'image': MODEL_PROMPTS['flux'],
  'video': MODEL_PROMPTS['veo'],
  'music': MODEL_PROMPTS['music'],
  '3d': MODEL_PROMPTS['3d']
};

/**
 * Get the optimized system prompt based on mode and model
 */
function getOptimizedSystemPrompt(mode?: string, model?: string): string {
  let specificPrompt = '';
  
  // First try to get model-specific prompt
  if (model && MODEL_PROMPTS[model]) {
    specificPrompt = MODEL_PROMPTS[model];
  } else if (mode && MODE_PROMPTS[mode]) {
    // Fall back to mode-specific prompt
    specificPrompt = MODE_PROMPTS[mode];
  } else {
    // Default to image prompt
    specificPrompt = MODEL_PROMPTS['flux'];
  }
  
  return `${BASE_SYSTEM_PROMPT}\n${specificPrompt}`;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PromptLabChatRequest {
  message: string;
  history?: ChatMessage[];
  context?: {
    mode?: 'image' | 'video' | 'music' | '3d';
    currentPrompt?: string;
    selectedModel?: string;
    selectedStyle?: string;
    generationMode?: string; // For video: text-to-video, image-to-video, etc.
  };
}

/**
 * Create prompt lab routes
 */
export default function createPromptLabRoutes(_deps: Record<string, unknown>) {
  const router = Router();

  /**
   * POST /chat
   * Send a message to Claude for prompt planning assistance
   */
  router.post('/chat', async (req: Request, res: Response) => {
    const startTime = Date.now();
    
    try {
      const { message, history = [], context } = req.body as PromptLabChatRequest;

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

      if (!FAL_API_KEY) {
        logger.error('FAL_API_KEY not configured for prompt lab');
        return res.status(500).json({
          success: false,
          error: 'AI service not configured'
        });
      }

      // Build conversation context
      let contextInfo = '';
      if (context?.mode) {
        contextInfo += `\nThe user is currently working on: ${context.mode} generation.`;
      }
      if (context?.selectedModel) {
        contextInfo += `\nSelected model: ${context.selectedModel}`;
      }
      if (context?.generationMode) {
        contextInfo += `\nGeneration mode: ${context.generationMode}`;
      }
      if (context?.selectedStyle) {
        contextInfo += `\nSelected style: ${context.selectedStyle}`;
      }
      if (context?.currentPrompt) {
        contextInfo += `\nTheir current prompt draft is: "${context.currentPrompt}"`;
      }
      
      // Get the optimized system prompt for this mode/model
      const systemPrompt = getOptimizedSystemPrompt(context?.mode, context?.selectedModel);

      // Format conversation history for Claude 3 Haiku - use native message format
      const conversationMessages: Array<{ role: string; content: string }> = [];
      
      // Add history (limit to last 10 messages for context window)
      const recentHistory = history.slice(-10);
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
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch('https://fal.run/fal-ai/any-llm', {
        method: 'POST',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'anthropic/claude-3-haiku',
          prompt: fullPrompt,
          system_prompt: systemPrompt + (contextInfo ? '\n' + contextInfo : ''),
          temperature: 0.7,
          max_tokens: 350
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        logger.error('Prompt Lab LLM request failed', { 
          status: response.status, 
          error: errorText 
        });
        return res.status(500).json({
          success: false,
          error: 'Failed to get AI response'
        });
      }

      const data = await response.json() as { output?: string; text?: string; response?: string };
      const assistantResponse = (data.output || data.text || data.response || '').trim();

      if (!assistantResponse) {
        return res.status(500).json({
          success: false,
          error: 'Empty response from AI'
        });
      }

      const duration = Date.now() - startTime;
      logger.info('Prompt Lab chat completed', { 
        duration,
        messageLength: message.length,
        responseLength: assistantResponse.length,
        historyLength: history.length
      });

      return res.json({
        success: true,
        response: assistantResponse,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      const err = error as Error;
      
      if (err.name === 'AbortError') {
        logger.warn('Prompt Lab request timed out');
        return res.status(504).json({
          success: false,
          error: 'Request timed out'
        });
      }

      logger.error('Prompt Lab chat error', { error: err.message });
      return res.status(500).json({
        success: false,
        error: 'Failed to process request'
      });
    }
  });

  /**
   * GET /suggestions
   * Get starter suggestions based on the current mode and model
   */
  router.get('/suggestions', (req: Request, res: Response) => {
    const mode = (req.query.mode as string) || 'image';
    const model = (req.query.model as string) || '';
    
    // Model-specific suggestions
    const modelSuggestions: Record<string, string[]> = {
      // Image models
      'flux': [
        "Help me create a quick portrait",
        "I want a simple landscape",
        "What's a good prompt for a cute animal?",
        "Create something abstract"
      ],
      'flux-2': [
        "I need an image with text/logo",
        "Help me create a realistic photo",
        "I want a product shot with branding",
        "Create a sign or poster design"
      ],
      'nano-banana-pro': [
        "I want a highly detailed fantasy scene",
        "Help me create premium concept art",
        "I want an intricate portrait",
        "Create something award-worthy"
      ],
      'qwen-image-layered': [
        "How do I extract a subject from an image?",
        "I want to remove the background",
        "Help me create layers for compositing"
      ],
      // Video models
      'ltx': [
        "Help me create a simple animation",
        "I want to animate a still image",
        "What works well for quick videos?",
        "Create a looping animation"
      ],
      'veo': [
        "Help me create a cinematic scene",
        "I want professional video quality",
        "Create an epic slow-motion shot",
        "Help me with complex camera movements"
      ],
      'lip-sync': [
        "How does lip sync work?",
        "What kind of portrait works best?",
        "Tips for better lip sync results"
      ]
    };
    
    // Mode-based fallback suggestions
    const modeSuggestions: Record<string, string[]> = {
      image: [
        "Help me create a portrait",
        "I want a fantasy landscape",
        "What style should I use?",
        "Give me something creative"
      ],
      video: [
        "What kind of video should I make?",
        "How do I describe motion?",
        "I want a cinematic scene",
        "Help me animate an image"
      ],
      music: [
        "What genre should I try?",
        "I want something upbeat and energetic",
        "Help me create a chill ambient track",
        "What tempo and key work together?"
      ],
      '3d': [
        "What makes a good 3D character?",
        "Help me design a unique character",
        "I want something for games",
        "What style should I use?"
      ]
    };

    // Try model-specific first, then fall back to mode
    const suggestions = modelSuggestions[model] || modeSuggestions[mode] || modeSuggestions.image;

    return res.json({
      success: true,
      suggestions
    });
  });

  return router;
}
