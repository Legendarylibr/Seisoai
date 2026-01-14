/**
 * Prompt Lab Service
 * Handles communication with Claude for prompt planning assistance
 * Does NOT access any user files - only works with in-app context
 */

import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  action?: PromptLabAction;
}

export interface PromptLabAction {
  type: 'suggest_prompt' | 'suggest_style' | 'suggest_mode' | 'tip';
  value?: string;
  label?: string;
  negativePrompt?: string; // Hidden from user, used for quality enhancement
}

export interface PromptLabContext {
  mode?: 'image' | 'video' | 'music' | '3d';
  currentPrompt?: string;
  selectedStyle?: string;
  selectedModel?: string;
  generationMode?: string; // For video: text-to-video, image-to-video, lip-sync, etc.
}

export interface PromptLabResponse {
  success: boolean;
  response?: string;
  action?: PromptLabAction;
  timestamp?: string;
  error?: string;
}

/**
 * Send a message to Claude for prompt planning help
 */
export async function sendPromptLabMessage(
  message: string,
  history: ChatMessage[] = [],
  context?: PromptLabContext
): Promise<PromptLabResponse> {
  try {
    const csrfToken = await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/prompt-lab/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: JSON.stringify({
        message,
        history: history.map(m => ({ role: m.role, content: m.content })),
        context
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to get response');
    }

    // Parse any suggested prompts from the response
    const action = parseActionFromResponse(data.response);
    
    // Clean the response to hide [NEGATIVE] tags from user display
    const cleanedResponse = cleanResponseForDisplay(data.response);

    return {
      success: true,
      response: cleanedResponse,
      action,
      timestamp: data.timestamp
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Prompt Lab message failed', { error: err.message });
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Get starter suggestions for a mode and model
 */
export async function getPromptLabSuggestions(mode: string, model?: string): Promise<string[]> {
  try {
    const params = new URLSearchParams({ mode });
    if (model) params.append('model', model);
    
    const response = await fetch(`${API_URL}/api/prompt-lab/suggestions?${params.toString()}`, {
      credentials: 'include'
    });
    
    const data = await response.json();
    return data.suggestions || [];
  } catch {
    return [
      "Help me come up with an idea",
      "What makes a good prompt?",
      "I have a vague idea, can you help?",
      "Suggest something creative"
    ];
  }
}

/**
 * Parse any actionable suggestions from Claude's response
 * Looks for [PROMPT]...[/PROMPT] tags or quoted prompts
 * Also extracts [NEGATIVE]...[/NEGATIVE] tags for quality enhancement (hidden from user)
 */
function parseActionFromResponse(response: string): PromptLabAction | undefined {
  // Primary: Look for [PROMPT]...[/PROMPT] tags (most reliable)
  const tagMatch = response.match(/\[PROMPT\]([\s\S]*?)\[\/PROMPT\]/i);
  if (tagMatch && tagMatch[1] && tagMatch[1].trim().length > 5) {
    // Also extract negative prompt if present (for video quality)
    const negativeMatch = response.match(/\[NEGATIVE\]([\s\S]*?)\[\/NEGATIVE\]/i);
    const negativePrompt = negativeMatch && negativeMatch[1] ? negativeMatch[1].trim() : undefined;
    
    return {
      type: 'suggest_prompt',
      value: tagMatch[1].trim(),
      label: 'Use Prompt',
      negativePrompt // Hidden from display, used internally for video generation
    };
  }

  // Fallback: Look for quoted prompts
  const promptPatterns = [
    /(?:try|use|here's a prompt|suggested prompt|prompt)[:\s]+["']([^"']+)["']/i,
    /(?:try|use|here's)[:\s]+[""]([^""]+)[""]/i,
    /^["']([^"']{20,})["']$/m
  ];

  for (const pattern of promptPatterns) {
    const match = response.match(pattern);
    if (match && match[1] && match[1].length > 10) {
      return {
        type: 'suggest_prompt',
        value: match[1].trim(),
        label: 'Use Prompt'
      };
    }
  }

  return undefined;
}

/**
 * Clean response text by removing [NEGATIVE] tags (user should never see these)
 */
export function cleanResponseForDisplay(response: string): string {
  return response.replace(/\[NEGATIVE\][\s\S]*?\[\/NEGATIVE\]/gi, '').trim();
}

export default {
  sendPromptLabMessage,
  getPromptLabSuggestions,
  cleanResponseForDisplay
};
