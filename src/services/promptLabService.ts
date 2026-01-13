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
}

export interface PromptLabContext {
  mode?: 'image' | 'video' | 'music' | '3d';
  currentPrompt?: string;
  selectedStyle?: string;
  selectedModel?: string;
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

    return {
      success: true,
      response: data.response,
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
 * Get starter suggestions for a mode
 */
export async function getPromptLabSuggestions(mode: string): Promise<string[]> {
  try {
    const response = await fetch(`${API_URL}/api/prompt-lab/suggestions?mode=${mode}`, {
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
 * Looks for patterns like "Try this prompt: ..." or quoted suggestions
 */
function parseActionFromResponse(response: string): PromptLabAction | undefined {
  // Look for explicit prompt suggestions
  const promptPatterns = [
    /(?:try|use|here's a prompt|suggested prompt)[:\s]+["']([^"']+)["']/i,
    /(?:try|use)[:\s]+[""]([^""]+)[""]/i,
    /^["']([^"']{20,})["']$/m
  ];

  for (const pattern of promptPatterns) {
    const match = response.match(pattern);
    if (match && match[1] && match[1].length > 10) {
      return {
        type: 'suggest_prompt',
        value: match[1].trim(),
        label: 'Use this prompt'
      };
    }
  }

  return undefined;
}

export default {
  sendPromptLabMessage,
  getPromptLabSuggestions
};
