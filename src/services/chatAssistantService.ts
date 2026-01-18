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
  // Image params
  style?: string;
  numImages?: number;
  imageSize?: string;
  referenceImage?: string;
  // Video params
  duration?: string;
  quality?: string;
  model?: string;
  generateAudio?: boolean;
  generationMode?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  // Music params
  musicDuration?: number;
  genre?: string;
}

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
  context: ChatContext
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
        context
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to get response');
    }

    return {
      success: true,
      message: data.response,
      action: data.action,
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
    
    const response = await fetch(`${API_URL}/api/chat-assistant/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({
        action,
        context
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Generation failed');
    }

    return {
      success: true,
      message: data.message,
      generatedContent: data.generatedContent
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
