/**
 * FAL.ai service
 * Handles AI image/video generation via FAL.ai API
 */
import logger from '../utils/logger.js';
import config from '../config/env.js';

const FAL_API_KEY = config.FAL_API_KEY;

/**
 * Check if FAL is configured
 */
export function isFalConfigured() {
  return !!FAL_API_KEY;
}

/**
 * Get FAL API key
 */
export function getFalApiKey() {
  return FAL_API_KEY;
}

/**
 * Make a FAL API request
 */
export async function falRequest(endpoint, options = {}) {
  if (!FAL_API_KEY) {
    throw new Error('FAL API not configured');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FAL API error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Submit a FAL queue request
 */
export async function submitToQueue(model, input) {
  const endpoint = `https://queue.fal.run/${model}`;
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`FAL queue error: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Check queue status
 */
export async function checkQueueStatus(requestId) {
  const endpoint = `https://queue.fal.run/requests/${requestId}/status`;
  
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Status check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get queue result
 */
export async function getQueueResult(requestId) {
  const endpoint = `https://queue.fal.run/requests/${requestId}`;
  
  const response = await fetch(endpoint, {
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error(`Result fetch failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Upload file to FAL storage
 */
export async function uploadToFal(buffer, mimeType, filename) {
  const boundary = `----formdata-${Date.now()}`;
  const CRLF = '\r\n';
  
  let formDataBody = '';
  formDataBody += `--${boundary}${CRLF}`;
  formDataBody += `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`;
  formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
  
  const formDataBuffer = Buffer.concat([
    Buffer.from(formDataBody, 'utf8'),
    buffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
  ]);
  
  const response = await fetch('https://fal.ai/files', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_API_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: formDataBuffer
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.url || data.file?.url;
}

export default {
  isFalConfigured,
  getFalApiKey,
  falRequest,
  submitToQueue,
  checkQueueStatus,
  getQueueResult,
  uploadToFal
};



