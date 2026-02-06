/**
 * FAL.ai service
 * Handles AI image/video generation via FAL.ai API
 * Includes timeout and retry logic for resilience
 */
import logger from '../utils/logger';
import config from '../config/env';

const FAL_API_KEY = config.FAL_API_KEY;

// Timeout and retry configuration
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds for most requests
const QUEUE_SUBMIT_TIMEOUT_MS = 15_000; // 15 seconds for queue submissions
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1_000;

/**
 * Create an AbortSignal with a timeout
 */
function createTimeoutSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

/**
 * Sleep for a specified duration (for retry backoff)
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine if an error is retryable (transient network/server errors)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Timeout errors
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return true;
    // Network errors
    if (error.message.includes('fetch failed') || error.message.includes('ECONNRESET')) return true;
  }
  return false;
}

/**
 * Determine if an HTTP status is retryable
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Check if FAL is configured
 */
export function isFalConfigured(): boolean {
  return !!FAL_API_KEY;
}

/**
 * Get FAL API key
 */
export function getFalApiKey(): string | undefined {
  return FAL_API_KEY;
}

/**
 * Make a FAL API request with timeout and retry
 */
export async function falRequest<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  if (!FAL_API_KEY) {
    throw new Error('FAL API not configured');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint, {
        ...options,
        signal: createTimeoutSignal(DEFAULT_TIMEOUT_MS),
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      if (!response.ok) {
        const error = await response.text();
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          logger.warn('FAL API retryable error, retrying', { endpoint, status: response.status, attempt });
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        logger.error('FAL API request failed', { endpoint, status: response.status, error: error.substring(0, 500) });
        throw new Error(`FAL API error: ${response.status} - ${error}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error as Error;
      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        logger.warn('FAL API transient error, retrying', { endpoint, error: lastError.message, attempt });
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('FAL API request failed after retries');
}

/**
 * Submit a FAL queue request with timeout and retry
 */
export async function submitToQueue<T = unknown>(model: string, input: Record<string, unknown>): Promise<T> {
  if (!FAL_API_KEY) {
    logger.error('FAL queue submission failed: API key not configured', { model });
    throw new Error('FAL API not configured');
  }

  const endpoint = `https://queue.fal.run/${model}`;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        signal: createTimeoutSignal(QUEUE_SUBMIT_TIMEOUT_MS),
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        const error = await response.text();
        if (isRetryableStatus(response.status) && attempt < MAX_RETRIES) {
          logger.warn('FAL queue submission retryable error', { model, status: response.status, attempt });
          await sleep(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        logger.error('FAL queue submission failed', { model, status: response.status, error: error.substring(0, 500) });
        throw new Error(`FAL queue error: ${response.status} - ${error}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error as Error;
      if (isRetryableError(error) && attempt < MAX_RETRIES) {
        logger.warn('FAL queue submission transient error', { model, error: lastError.message, attempt });
        await sleep(RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error('FAL queue submission failed after retries');
}

/**
 * Check queue status
 * @param requestId - The request ID returned from submitToQueue
 * @param model - Optional model path (e.g., 'CassetteAI/music-generator'). If not provided, uses generic endpoint.
 */
export async function checkQueueStatus<T = unknown>(requestId: string, model?: string): Promise<T> {
  if (!FAL_API_KEY) {
    logger.error('FAL queue status check failed: API key not configured', { requestId, model });
    throw new Error('FAL API not configured');
  }

  // Use model-specific endpoint if model is provided
  const endpoint = model 
    ? `https://queue.fal.run/${model}/requests/${requestId}/status`
    : `https://queue.fal.run/requests/${requestId}/status`;
  
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`
    }
  });

  if (!response.ok) {
    let errorBody = '';
    try {
      errorBody = await response.text();
    } catch { /* ignore */ }
    logger.error('FAL queue status check failed', { requestId, model, status: response.status, error: errorBody.substring(0, 500) });
    throw new Error(`Status check failed: ${response.status} ${response.statusText}${errorBody ? ` - ${errorBody.substring(0, 200)}` : ''}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Get queue result
 * @param requestId - The request ID returned from submitToQueue
 * @param model - Optional model path (e.g., 'CassetteAI/music-generator'). If not provided, uses generic endpoint.
 */
export async function getQueueResult<T = unknown>(requestId: string, model?: string): Promise<T> {
  // Use model-specific endpoint if model is provided
  const endpoint = model
    ? `https://queue.fal.run/${model}/requests/${requestId}`
    : `https://queue.fal.run/requests/${requestId}`;
  
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`
    }
  });

  if (!response.ok) {
    logger.error('FAL queue result fetch failed', { requestId, model, status: response.status });
    throw new Error(`Result fetch failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Upload file to FAL storage using presigned URL approach
 */
/**
 * FAL Queue Status Constants
 * These are the possible status values returned by FAL's queue API
 */
export const FAL_STATUS = {
  // In-progress statuses
  IN_QUEUE: 'IN_QUEUE',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING: 'PENDING',
  
  // Completion statuses (FAL may return any of these depending on the model)
  COMPLETED: 'COMPLETED',
  OK: 'OK',
  SUCCESS: 'SUCCESS',
  SUCCEEDED: 'SUCCEEDED',
  DONE: 'DONE',
  
  // Failure statuses
  FAILED: 'FAILED',
  ERROR: 'ERROR',
  CANCELLED: 'CANCELLED'
} as const;

/**
 * Check if a status indicates completion
 * @param status - The status string from FAL (will be normalized to uppercase)
 */
export function isStatusCompleted(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === FAL_STATUS.COMPLETED ||
         normalized === FAL_STATUS.OK ||
         normalized === FAL_STATUS.SUCCESS ||
         normalized === FAL_STATUS.SUCCEEDED ||
         normalized === FAL_STATUS.DONE;
}

/**
 * Check if a status indicates failure
 * @param status - The status string from FAL (will be normalized to uppercase)
 */
export function isStatusFailed(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === FAL_STATUS.FAILED ||
         normalized === FAL_STATUS.ERROR ||
         normalized === FAL_STATUS.CANCELLED;
}

/**
 * Check if a status indicates the request is still processing
 * @param status - The status string from FAL (will be normalized to uppercase)
 */
export function isStatusProcessing(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.toUpperCase();
  return normalized === FAL_STATUS.IN_QUEUE ||
         normalized === FAL_STATUS.IN_PROGRESS ||
         normalized === FAL_STATUS.PENDING;
}

/**
 * Normalize a FAL status to uppercase
 * @param status - The raw status string
 */
export function normalizeStatus(status: string | undefined): string {
  return (status || '').toUpperCase();
}

/**
 * Upload file to FAL storage using presigned URL approach
 */
export async function uploadToFal(buffer: Buffer, mimeType: string, filename: string): Promise<string> {
  if (!FAL_API_KEY) {
    throw new Error('FAL API not configured');
  }

  // Step 1: Initiate upload to get presigned URL
  const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      file_name: filename,
      content_type: mimeType
    })
  });

  if (!initiateResponse.ok) {
    const error = await initiateResponse.text();
    logger.error('FAL upload initiation failed', { filename, status: initiateResponse.status, error: error.substring(0, 500) });
    throw new Error(`Upload initiate failed: ${initiateResponse.status} - ${error}`);
  }

  const initiateData = await initiateResponse.json() as { 
    upload_url?: string; 
    file_url?: string;
  };

  if (!initiateData.upload_url || !initiateData.file_url) {
    throw new Error('No upload URL returned from FAL');
  }

  // Step 2: Upload file to presigned URL
  const uploadResponse = await fetch(initiateData.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType
    },
    body: buffer
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    logger.error('FAL file upload failed', { filename, status: uploadResponse.status, error: error.substring(0, 500) });
    throw new Error(`File upload failed: ${uploadResponse.status} - ${error}`);
  }

  logger.info('File uploaded to FAL storage', { filename, url: initiateData.file_url });
  return initiateData.file_url;
}

export default {
  isFalConfigured,
  getFalApiKey,
  falRequest,
  submitToQueue,
  checkQueueStatus,
  getQueueResult,
  uploadToFal,
  FAL_STATUS,
  isStatusCompleted,
  isStatusFailed,
  isStatusProcessing,
  normalizeStatus
};

