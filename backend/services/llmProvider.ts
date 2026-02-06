/**
 * Unified LLM Provider Service
 * 
 * Supports the full Claude model lineup via two paths:
 *   1. Direct Anthropic API (primary, when ANTHROPIC_API_KEY is set)
 *   2. fal.ai any-llm proxy (fallback, when only FAL_API_KEY is set)
 * 
 * Auto-detects which path to use based on available env vars.
 * 
 * Supported models:
 *   - claude-opus-4-6     : Most intelligent, best for agentic tasks. $5/$25 per MTok.
 *   - claude-sonnet-4-5   : Best speed/intelligence balance. $3/$15 per MTok.
 *   - claude-haiku-4-5    : Fastest, near-frontier intelligence. $1/$5 per MTok.
 */
import Anthropic from '@anthropic-ai/sdk';
import config from '../config/env';
import logger from '../utils/logger';
import { getFalApiKey } from './fal';

// ============================================================================
// Types
// ============================================================================

export type ClaudeModel = 'claude-opus-4-6' | 'claude-sonnet-4-5' | 'claude-haiku-4-5';

export type LLMProvider = 'anthropic' | 'fal-proxy';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LLMCompletionRequest {
  model?: ClaudeModel;
  systemPrompt?: string;
  messages?: LLMMessage[];
  /** Simple single-turn prompt (convenience — converted to messages internally) */
  prompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Enable extended thinking for complex reasoning (Opus/Sonnet/Haiku) */
  extendedThinking?: boolean;
  /** Budget tokens for extended thinking (default: 10000) */
  thinkingBudget?: number;
  /** Tool definitions for native function calling */
  tools?: LLMToolDefinition[];
  /** Timeout in milliseconds (default: 30000) */
  timeoutMs?: number;
  /** Use case label for logging */
  useCase?: string;
}

export interface LLMCompletionResponse {
  content: string;
  model: string;
  provider: LLMProvider;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Extended thinking trace if enabled */
  thinking?: string;
  /** Tool calls if the model wants to invoke tools */
  toolCalls?: LLMToolCall[];
  /** Stop reason */
  stopReason?: string;
}

// ============================================================================
// Model metadata & credit costs
// ============================================================================

export const MODEL_INFO: Record<ClaudeModel, {
  displayName: string;
  tier: 'fast' | 'balanced' | 'premium';
  credits: number;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
  maxOutput: number;
  contextWindow: number;
  supportsExtendedThinking: boolean;
  supportsAdaptiveThinking: boolean;
  /** Model ID for fal.ai any-llm proxy */
  falProxyId: string;
}> = {
  'claude-opus-4-6': {
    displayName: 'Claude Opus 4.6',
    tier: 'premium',
    credits: 5,
    inputPricePerMTok: 5,
    outputPricePerMTok: 25,
    maxOutput: 128_000,
    contextWindow: 200_000,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: true,
    falProxyId: 'anthropic/claude-opus-4-6',
  },
  'claude-sonnet-4-5': {
    displayName: 'Claude Sonnet 4.5',
    tier: 'balanced',
    credits: 3,
    inputPricePerMTok: 3,
    outputPricePerMTok: 15,
    maxOutput: 64_000,
    contextWindow: 200_000,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: false,
    falProxyId: 'anthropic/claude-sonnet-4-5',
  },
  'claude-haiku-4-5': {
    displayName: 'Claude Haiku 4.5',
    tier: 'fast',
    credits: 1,
    inputPricePerMTok: 1,
    outputPricePerMTok: 5,
    maxOutput: 64_000,
    contextWindow: 200_000,
    supportsExtendedThinking: true,
    supportsAdaptiveThinking: false,
    falProxyId: 'anthropic/claude-haiku-4-5',
  },
};

/** Default model for different use cases */
export const DEFAULT_MODELS: Record<string, ClaudeModel> = {
  /** Internal prompt optimization, translation */
  internal: 'claude-haiku-4-5',
  /** Chat assistant, prompt lab */
  chat: 'claude-sonnet-4-5',
  /** Orchestrator planning */
  planning: 'claude-sonnet-4-5',
  /** Complex agentic tasks */
  agentic: 'claude-sonnet-4-5',
};

// ============================================================================
// Provider detection
// ============================================================================

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic | null {
  if (_anthropicClient) return _anthropicClient;
  
  const apiKey = config.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  
  _anthropicClient = new Anthropic({ apiKey });
  return _anthropicClient;
}

/**
 * Check if a key looks like a real API key vs. a placeholder value
 */
function isRealApiKey(key: string | undefined): boolean {
  if (!key) return false;
  const lower = key.toLowerCase().trim();
  // Reject common placeholder patterns
  if (lower.includes('your_') || lower.includes('_here') || lower.includes('changeme') ||
      lower === 'placeholder' || lower === 'change_me' || lower === 'xxx' ||
      lower.startsWith('sk_test_xxx') || lower === 'none' || lower === 'todo') {
    return false;
  }
  // Real API keys are usually at least 20 characters
  if (key.trim().length < 10) return false;
  return true;
}

function detectProvider(): LLMProvider {
  if (isRealApiKey(config.ANTHROPIC_API_KEY)) return 'anthropic';
  if (isRealApiKey(config.FAL_API_KEY)) return 'fal-proxy';
  throw new Error('No LLM provider configured. Set ANTHROPIC_API_KEY or FAL_API_KEY with a valid key (not a placeholder).');
}

/**
 * Check if the LLM provider is configured with a real (non-placeholder) API key
 */
export function isLLMConfigured(): boolean {
  return isRealApiKey(config.ANTHROPIC_API_KEY) || isRealApiKey(config.FAL_API_KEY);
}

/**
 * Get the active provider name
 */
export function getActiveProvider(): LLMProvider {
  return detectProvider();
}

/**
 * Get available models
 */
export function getAvailableModels(): Array<{
  id: ClaudeModel;
  displayName: string;
  tier: string;
  credits: number;
}> {
  return Object.entries(MODEL_INFO).map(([id, info]) => ({
    id: id as ClaudeModel,
    displayName: info.displayName,
    tier: info.tier,
    credits: info.credits,
  }));
}

// ============================================================================
// Direct Anthropic API path
// ============================================================================

async function completeViaAnthropic(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
  const client = getAnthropicClient();
  if (!client) throw new Error('Anthropic API key not configured');

  const model = req.model || DEFAULT_MODELS.chat;
  const modelInfo = MODEL_INFO[model];
  const maxTokens = req.maxTokens || 1024;

  // Build messages array
  let messages: Anthropic.MessageParam[];
  if (req.messages && req.messages.length > 0) {
    messages = req.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  } else if (req.prompt) {
    messages = [{ role: 'user', content: req.prompt }];
  } else {
    throw new Error('Either messages or prompt is required');
  }

  // Build request params
  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    messages,
  };

  // System prompt
  if (req.systemPrompt) {
    params.system = req.systemPrompt;
  }

  // Temperature (not compatible with extended thinking)
  if (req.temperature !== undefined && !req.extendedThinking) {
    params.temperature = req.temperature;
  }

  // Extended thinking
  if (req.extendedThinking && modelInfo.supportsExtendedThinking) {
    params.thinking = {
      type: 'enabled',
      budget_tokens: req.thinkingBudget || 10000,
    };
    // Extended thinking requires higher max_tokens
    params.max_tokens = Math.max(maxTokens, 16000);
  }

  // Tools (native function calling)
  if (req.tools && req.tools.length > 0) {
    params.tools = req.tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.input_schema as Anthropic.Tool.InputSchema,
    }));
  }

  // Execute with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs || 30000);

  try {
    const response = await client.messages.create(params, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Extract content
    let textContent = '';
    let thinkingContent = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'thinking') {
        thinkingContent += block.thinking;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      content: textContent,
      model,
      provider: 'anthropic',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      thinking: thinkingContent || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason: response.stop_reason || undefined,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error as Error;
    
    if (err.name === 'AbortError') {
      throw new Error(`Anthropic API request timed out after ${(req.timeoutMs || 30000) / 1000}s`);
    }
    
    logger.error('Anthropic API call failed', {
      model,
      useCase: req.useCase,
      error: err.message,
    });
    throw err;
  }
}

// ============================================================================
// fal.ai proxy path (fallback)
// ============================================================================

async function completeViaFalProxy(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
  const FAL_API_KEY = getFalApiKey();
  if (!FAL_API_KEY) throw new Error('FAL API key not configured');

  const model = req.model || DEFAULT_MODELS.chat;
  const modelInfo = MODEL_INFO[model];

  // Build prompt for fal.ai any-llm (uses simpler prompt/system_prompt format)
  let prompt: string;
  if (req.messages && req.messages.length > 0) {
    // Concatenate messages into a single prompt for the proxy
    prompt = req.messages.map(m => 
      m.role === 'user' ? `Human: ${m.content}` : `Assistant: ${m.content}`
    ).join('\n\n');
  } else if (req.prompt) {
    prompt = req.prompt;
  } else {
    throw new Error('Either messages or prompt is required');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs || 30000);

  try {
    const response = await fetch('https://fal.run/fal-ai/any-llm', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelInfo.falProxyId,
        prompt,
        system_prompt: req.systemPrompt || undefined,
        max_tokens: req.maxTokens || 1024,
        temperature: req.temperature,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`fal.ai proxy error: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as {
      output?: string;
      text?: string;
      response?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const content = (data.output || data.text || data.response || '').trim();

    return {
      content,
      model,
      provider: 'fal-proxy',
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      stopReason: 'end_turn',
    };
  } catch (error) {
    clearTimeout(timeoutId);
    const err = error as Error;

    if (err.name === 'AbortError') {
      throw new Error(`fal.ai proxy request timed out after ${(req.timeoutMs || 30000) / 1000}s`);
    }

    logger.error('fal.ai proxy call failed', {
      model,
      useCase: req.useCase,
      error: err.message,
    });
    throw err;
  }
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Send a completion request to the best available Claude model.
 * Auto-selects provider (direct Anthropic API or fal.ai proxy).
 * 
 * @example
 * // Simple single-turn
 * const res = await llm.complete({
 *   prompt: 'Translate this to English: こんにちは',
 *   model: 'claude-haiku-4-5',
 *   useCase: 'translation',
 * });
 * 
 * @example
 * // Multi-turn chat
 * const res = await llm.complete({
 *   model: 'claude-sonnet-4-5',
 *   systemPrompt: 'You are a helpful assistant.',
 *   messages: [
 *     { role: 'user', content: 'Hello!' },
 *     { role: 'assistant', content: 'Hi there!' },
 *     { role: 'user', content: 'What can you do?' },
 *   ],
 * });
 * 
 * @example
 * // With native tool calling (Anthropic direct only)
 * const res = await llm.complete({
 *   model: 'claude-sonnet-4-5',
 *   systemPrompt: 'You can generate images.',
 *   messages: [{ role: 'user', content: 'Generate a sunset photo' }],
 *   tools: [{
 *     name: 'generate_image',
 *     description: 'Generate an image from a prompt',
 *     input_schema: { type: 'object', properties: { prompt: { type: 'string' } }, required: ['prompt'] },
 *   }],
 * });
 */
export async function complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
  const provider = detectProvider();
  const model = req.model || DEFAULT_MODELS.chat;
  const useCase = req.useCase || 'unknown';

  logger.debug('LLM request', { provider, model, useCase });

  // Tools and extended thinking require direct Anthropic API
  const needsDirectApi = (req.tools && req.tools.length > 0) || req.extendedThinking;
  
  if (needsDirectApi && provider !== 'anthropic') {
    logger.warn('Request requires direct Anthropic API but only fal.ai proxy is available. Tools and extended thinking will be unavailable.', {
      useCase,
      hasTools: !!(req.tools && req.tools.length > 0),
      extendedThinking: !!req.extendedThinking,
    });
    // Fall through to proxy — it won't have tools/thinking but will still return text
  }

  let response: LLMCompletionResponse;

  if (provider === 'anthropic') {
    response = await completeViaAnthropic(req);
  } else {
    response = await completeViaFalProxy(req);
  }

  logger.debug('LLM response', {
    provider: response.provider,
    model: response.model,
    useCase,
    inputTokens: response.usage.inputTokens,
    outputTokens: response.usage.outputTokens,
    hasToolCalls: !!(response.toolCalls && response.toolCalls.length > 0),
    hasThinking: !!response.thinking,
  });

  return response;
}

/**
 * Extract JSON from an LLM response string.
 * Tries multiple strategies: direct parse, code block extraction, regex.
 */
export function extractJSON<T = unknown>(text: string): T | null {
  // Strategy 1: Direct JSON parse
  try {
    return JSON.parse(text) as T;
  } catch { /* continue */ }

  // Strategy 2: Extract from markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]) as T;
    } catch { /* continue */ }
  }

  // Strategy 3: Find first complete JSON object
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch { /* continue */ }
  }

  // Strategy 4: Find first complete JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      return JSON.parse(arrayMatch[0]) as T;
    } catch { /* continue */ }
  }

  return null;
}

/**
 * Validate that a model ID is a valid Claude model
 */
export function isValidModel(model: string): model is ClaudeModel {
  return model in MODEL_INFO;
}

/**
 * Get credits cost for a given model
 */
export function getModelCredits(model: ClaudeModel): number {
  return MODEL_INFO[model]?.credits || 1;
}

// ============================================================================
// Export
// ============================================================================

const llmProvider = {
  complete,
  extractJSON,
  isLLMConfigured,
  isValidModel,
  getActiveProvider,
  getAvailableModels,
  getModelCredits,
  MODEL_INFO,
  DEFAULT_MODELS,
};

export default llmProvider;
