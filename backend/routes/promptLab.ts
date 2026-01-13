/**
 * Prompt Lab Route
 * Provides conversational AI assistance to help users plan and refine their prompts
 * Uses Claude via fal.run for natural conversation without affecting generation functionality
 */
import { Router, type Request, type Response } from 'express';
import { config } from '../config/env';
import logger from '../utils/logger';

const FAL_API_KEY = config.FAL_API_KEY;

// System prompt for Claude to act as a helpful prompt planning assistant
const PROMPT_LAB_SYSTEM_PROMPT = `You are Prompt Lab, a friendly AI assistant embedded in SeisoAI - a creative AI platform for generating images, videos, and music. You help users plan and refine their prompts.

Your role is to:
1. Help users brainstorm and develop their creative ideas
2. Suggest specific, detailed prompts that work well with AI generators
3. Ask clarifying questions to understand their vision
4. When you have a good understanding, offer a concrete prompt suggestion
5. Explain what makes prompts effective when helpful

How to format prompt suggestions:
- When suggesting a prompt, wrap it in quotes like: "your suggested prompt here"
- Make prompts specific with details like style, lighting, mood, composition
- For images: include subject, setting, style, lighting, camera angle
- For video: include motion, transitions, pacing
- For music: include genre, instruments, tempo, mood

Guidelines:
- Keep responses concise (2-4 sentences, with a prompt suggestion when appropriate)
- Be encouraging and creative
- If their idea is vague, ask ONE clarifying question
- If you understand what they want, give them a ready-to-use prompt
- Don't discuss pricing, credits, or technical issues - focus on creative help

Example good responses:
- User: "I want a sunset" → "What kind of mood are you going for - peaceful and calm, or dramatic and intense?"
- User: "peaceful sunset on a beach" → "Here's a prompt: \\"Golden hour sunset over a serene tropical beach, gentle waves lapping at the shore, palm trees silhouetted against orange and pink sky, soft warm lighting, peaceful atmosphere, cinematic composition\\""

Be a creative collaborator - help them make something amazing!`;

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
      if (context?.currentPrompt) {
        contextInfo += `\nTheir current prompt draft is: "${context.currentPrompt}"`;
      }

      // Format conversation history for Claude
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

      // Build the full prompt for the API
      const fullPrompt = conversationMessages
        .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
        .join('\n\n') + '\n\nAssistant:';

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
          system_prompt: PROMPT_LAB_SYSTEM_PROMPT + contextInfo,
          temperature: 0.7,
          max_tokens: 500
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
   * Get starter suggestions based on the current mode
   */
  router.get('/suggestions', (req: Request, res: Response) => {
    const mode = (req.query.mode as string) || 'image';
    
    const suggestions: Record<string, string[]> = {
      image: [
        "I want to create a portrait but I'm not sure about the style",
        "Help me describe a fantasy landscape",
        "What makes a good prompt for realistic photos?",
        "I want to create something unique - any ideas?"
      ],
      video: [
        "What kind of video should I make?",
        "How do I describe motion in my prompt?",
        "I want to create a cinematic scene",
        "Help me plan a video with interesting transitions"
      ],
      music: [
        "What genre should I try?",
        "How do I describe the mood I want?",
        "I want something upbeat and energetic",
        "Help me create a chill ambient track"
      ],
      '3d': [
        "What makes a good 3D character?",
        "Help me design a unique character",
        "I want to create something for games",
        "What style should my character have?"
      ]
    };

    return res.json({
      success: true,
      suggestions: suggestions[mode] || suggestions.image
    });
  });

  return router;
}
