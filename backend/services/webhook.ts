/**
 * Webhook Delivery Service
 * Delivers async generation results to external agents via webhook callbacks
 * Supports HMAC signature verification, retries, and delivery tracking
 */
import crypto from 'crypto';
import logger from '../utils/logger';

// Types
export interface WebhookPayload {
  /** Event type (e.g., 'generation.completed', 'generation.failed') */
  event: string;
  /** Unique event ID for idempotency */
  eventId: string;
  /** When the event occurred */
  timestamp: string;
  /** The tool/model that generated the result */
  toolId?: string;
  /** The original request ID */
  requestId: string;
  /** The generation result data */
  data: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  attempt: number;
  deliveredAt?: string;
}

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Create HMAC signature for webhook payload
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver a webhook with retries
 */
export async function deliverWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string
): Promise<WebhookDeliveryResult> {
  const payloadStr = JSON.stringify(payload);
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'SeisoAI-Webhook/1.0',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Event-Id': payload.eventId,
        'X-Webhook-Timestamp': payload.timestamp,
      };

      // Add HMAC signature if secret is provided
      if (secret) {
        const timestamp = payload.timestamp;
        const signaturePayload = `${timestamp}.${payloadStr}`;
        const signature = signPayload(signaturePayload, secret);
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: payloadStr,
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.ok) {
        logger.info('Webhook delivered successfully', {
          url: url.substring(0, 50) + '...',
          event: payload.event,
          requestId: payload.requestId,
          attempt,
          statusCode: response.status,
        });

        return {
          success: true,
          statusCode: response.status,
          attempt,
          deliveredAt: new Date().toISOString(),
        };
      }

      // Non-retryable status codes
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        logger.warn('Webhook delivery rejected (client error)', {
          url: url.substring(0, 50) + '...',
          event: payload.event,
          statusCode: response.status,
          attempt,
        });

        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
          attempt,
        };
      }

      // Retryable error - wait and retry
      logger.warn('Webhook delivery failed (retrying)', {
        url: url.substring(0, 50) + '...',
        event: payload.event,
        statusCode: response.status,
        attempt,
        nextRetryIn: RETRY_DELAYS[attempt - 1],
      });

    } catch (error) {
      const err = error as Error;
      logger.warn('Webhook delivery error (retrying)', {
        url: url.substring(0, 50) + '...',
        event: payload.event,
        attempt,
        error: err.message,
      });
    }

    // Wait before retrying (unless this was the last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }
  }

  logger.error('Webhook delivery failed after all retries', {
    url: url.substring(0, 50) + '...',
    event: payload.event,
    requestId: payload.requestId,
    maxRetries: MAX_RETRIES,
  });

  return {
    success: false,
    error: 'All retry attempts exhausted',
    attempt: MAX_RETRIES,
  };
}

/**
 * Fire-and-forget webhook delivery for generation results
 * Called after a generation completes or fails
 */
export function sendGenerationWebhook(
  webhookUrl: string,
  webhookSecret: string | undefined,
  event: 'generation.completed' | 'generation.failed',
  requestId: string,
  data: Record<string, unknown>,
  toolId?: string
): void {
  const payload: WebhookPayload = {
    event,
    eventId: `evt_${crypto.randomBytes(16).toString('hex')}`,
    timestamp: new Date().toISOString(),
    toolId,
    requestId,
    data,
  };

  // Fire-and-forget - don't block the response
  deliverWebhook(webhookUrl, payload, webhookSecret).catch(err => {
    logger.error('Webhook delivery fire-and-forget failed', {
      error: (err as Error).message,
      requestId,
    });
  });
}

/**
 * Verify an incoming webhook signature (for agents receiving our webhooks)
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: string,
  maxAge = 300 // 5 minutes
): boolean {
  // Check timestamp freshness
  const eventTime = new Date(timestamp).getTime();
  const now = Date.now();
  if (Math.abs(now - eventTime) > maxAge * 1000) {
    return false;
  }

  // Verify signature
  const signaturePayload = `${timestamp}.${payload}`;
  const expectedSignature = `sha256=${signPayload(signaturePayload, secret)}`;
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export default {
  deliverWebhook,
  sendGenerationWebhook,
  verifyWebhookSignature,
};
