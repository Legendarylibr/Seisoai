/**
 * Chat Assistant Service
 * Provides a unified chat interface for all generation capabilities
 * Uses Claude to understand user intent and trigger appropriate generation actions
 */

import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  // Generation results attached to messages
  generatedContent?: GeneratedContent;
  // Pending action for user confirmation
  pendingAction?: PendingAction;
  isLoading?: boolean;
  error?: string;
}

export interface GeneratedContent {
  type: 'image' | 'video' | 'music';
  urls: string[];
  prompt?: string;
  model?: string;
  is360?: boolean;
  creditsUsed?: number;
  remainingCredits?: number;
  metadata?: Record<string, unknown>;
}

export interface PendingAction {
  type: 'generate_image' | 'generate_video' | 'generate_music';
  params: GenerationParams;
  estimatedCredits: number;
  description: string;
}

export interface GenerationParams {
  prompt: string;
  // Common
  model?: string;
  // Image params
  style?: string;
  numImages?: number;
  imageSize?: string;
  referenceImage?: string;
  imageModel?: string; // flux, flux-2, nano-banana-pro
  // Video params
  duration?: string;
  quality?: string;
  videoModel?: string; // ltx, veo
  generateAudio?: boolean;
  generationMode?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  // Music params
  musicDuration?: number;
  genre?: string;
}

// Model options for each generation type
export const IMAGE_MODELS = [
  { id: 'flux', name: 'FLUX', description: 'Fast & versatile', credits: 0.5 },
  { id: 'flux-2', name: 'FLUX 2', description: 'Photorealistic + text', credits: 0.65 },
  { id: 'nano-banana-pro', name: 'Nano Banana', description: 'Highest quality', credits: 0.7 }
];

export const VIDEO_MODELS = [
  { id: 'ltx', name: 'LTX-2', description: 'Fast & affordable', creditsPerSec: 1.0 },
  { id: 'veo', name: 'Veo 3.1', description: 'Cinematic quality', creditsPerSec: 2.2 }
];

export const MUSIC_GENRES = [
  { id: 'lo-fi', name: 'Lo-Fi', description: 'Chill beats' },
  { id: 'electronic', name: 'Electronic', description: 'EDM & synths' },
  { id: 'orchestral', name: 'Orchestral', description: 'Epic & cinematic' },
  { id: 'rock', name: 'Rock', description: 'Guitar-driven' },
  { id: 'jazz', name: 'Jazz', description: 'Smooth & improvisational' }
];

// Aspect ratio options for image generation
export const ASPECT_RATIOS = [
  { id: 'square', name: '1:1', icon: '⬜', description: 'Square' },
  { id: 'landscape_16_9', name: '16:9', icon: '🖥️', description: 'Widescreen' },
  { id: 'landscape_4_3', name: '4:3', icon: '📺', description: 'Standard' },
  { id: 'portrait_16_9', name: '9:16', icon: '📱', description: 'Vertical' },
  { id: 'portrait_4_3', name: '3:4', icon: '📷', description: 'Portrait' },
  { id: 'ultra_wide', name: '21:9', icon: '🎬', description: 'Ultrawide' }
];

export interface ChatResponse {
  success: boolean;
  message?: string;
  action?: PendingAction;
  generatedContent?: GeneratedContent;
  error?: string;
}

export interface ChatContext {
  userId?: string;
  walletAddress?: string;
  email?: string;
  credits?: number;
}

/**
 * Send a message to the chat assistant
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[] = [],
  context: ChatContext,
  referenceImage?: string
): Promise<ChatResponse> {
  try {
    const csrfToken = await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/chat-assistant/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({
        message,
        history: history.slice(-20).map(m => ({ 
          role: m.role, 
          content: m.content,
          hasGeneration: !!m.generatedContent
        })),
        context,
        referenceImage
      })
    });

    const data = await response.json();
    
    // Debug logging
    console.log('[ChatAssistant] API Response:', {
      success: data.success,
      hasResponse: !!data.response,
      hasAction: !!data.action,
      actionType: data.action?.action,
      error: data.error
    });
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to get response');
    }

    // Map backend action format to frontend PendingAction format
    // Backend uses 'action' field, frontend uses 'type' field
    let mappedAction: PendingAction | undefined;
    if (data.action) {
      mappedAction = {
        type: data.action.action, // Map 'action' to 'type'
        params: data.action.params,
        estimatedCredits: data.action.estimatedCredits,
        description: data.action.description
      };
      console.log('[ChatAssistant] Mapped action:', mappedAction);
    }

    return {
      success: true,
      message: data.response,
      action: mappedAction,
      generatedContent: data.generatedContent
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Chat assistant message failed', { error: err.message });
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Execute a confirmed generation action
 */
export async function executeGeneration(
  action: PendingAction,
  context: ChatContext
): Promise<ChatResponse> {
  try {
    const csrfToken = await ensureCSRFToken();
    
    // Map frontend 'type' field back to backend 'action' field
    const backendAction = {
      action: action.type,  // Backend expects 'action', frontend uses 'type'
      params: action.params,
      estimatedCredits: action.estimatedCredits,
      description: action.description
    };
    
    const response = await fetch(`${API_URL}/api/chat-assistant/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({
        action: backendAction,
        context
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Generation failed');
    }

    // Add is360 flag if this was a 360 panorama generation
    const is360 = action.params.model === 'nano-banana-pro' || 
                  (action.params.prompt && /\b360\b/i.test(action.params.prompt));
    
    const generatedContent = data.generatedContent ? {
      ...data.generatedContent,
      model: action.params.model,
      prompt: action.params.prompt,
      is360
    } : undefined;

    return {
      success: true,
      message: data.message,
      generatedContent
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Chat assistant generation failed', { error: err.message });
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get welcome message and suggestions
 */
export async function getWelcomeMessage(): Promise<{ message: string; suggestions: string[] }> {
  return {
    message: `Hi! I'm your AI creative assistant. I can help you generate:\n\n• **Images** - Describe any image and I'll create it\n• **Videos** - Text-to-video, animate images, or lip-sync\n• **Music** - Generate tracks in any genre and style\n\nJust tell me what you want to create!`,
    suggestions: [
      "Create an image of a sunset over mountains",
      "Generate a 6-second video of ocean waves",
      "Make a chill lo-fi beat for studying",
      "Help me animate this image I'll upload"
    ]
  };
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default {
  sendChatMessage,
  executeGeneration,
  getWelcomeMessage,
  generateMessageId
};
