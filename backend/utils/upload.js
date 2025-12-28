/**
 * Shared file upload utilities for fal.ai
 * Consolidates duplicate video/image upload logic
 */
import logger from './logger.js';

// Maximum file sizes
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Upload a file to fal.ai storage
 * @param {Object} options - Upload options
 * @param {string} options.dataUri - Data URI of the file
 * @param {string} options.type - 'video' or 'image'
 * @param {string} options.apiKey - FAL API key
 * @param {string} options.ip - Client IP for logging
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadToFal({ dataUri, type, apiKey, ip }) {
  if (!apiKey) {
    return { success: false, error: 'AI service not configured' };
  }

  if (!dataUri || !dataUri.startsWith('data:')) {
    return { success: false, error: `Invalid ${type} data URI` };
  }

  const maxSize = type === 'video' ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
  
  // Check data URI size
  if (dataUri.length > maxSize) {
    logger.warn(`${type} data URI too large`, { size: dataUri.length, maxSize, ip });
    return { 
      success: false, 
      error: `${type} file too large. Maximum size is ${maxSize / (1024 * 1024)}MB.` 
    };
  }

  // Convert data URI to buffer
  const base64Data = dataUri.split(',')[1];
  if (!base64Data) {
    return { success: false, error: `Invalid ${type} data URI format` };
  }
  
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Additional size check after decoding
  if (buffer.length > maxSize) {
    logger.warn(`Decoded ${type} buffer too large`, { bufferSize: buffer.length, maxSize, ip });
    return { 
      success: false, 
      error: `${type} file too large after decoding. Maximum size is ${maxSize / (1024 * 1024)}MB.` 
    };
  }
  
  // Determine MIME type and extension
  const mimeMatch = dataUri.match(/data:([^;]+)/);
  let mimeType, extension;
  
  if (type === 'video') {
    mimeType = mimeMatch ? mimeMatch[1] : 'video/mp4';
    extension = mimeType.includes('quicktime') ? 'mov' : 'mp4';
  } else {
    mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    extension = mimeType.includes('png') ? 'png' : 'jpg';
  }
  
  // Create multipart/form-data
  const boundary = `----formdata-${Date.now()}`;
  const CRLF = '\r\n';
  
  let formDataBody = '';
  formDataBody += `--${boundary}${CRLF}`;
  formDataBody += `Content-Disposition: form-data; name="file"; filename="${type}.${extension}"${CRLF}`;
  formDataBody += `Content-Type: ${mimeType}${CRLF}${CRLF}`;
  
  const formDataBuffer = Buffer.concat([
    Buffer.from(formDataBody, 'utf8'),
    buffer,
    Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8')
  ]);
  
  try {
    const uploadResponse = await fetch('https://fal.ai/files', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formDataBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error(`Failed to upload ${type} to fal.ai`, { 
        status: uploadResponse.status, 
        error: errorText.substring(0, 200) 
      });
      return { 
        success: false, 
        error: `Failed to upload ${type}: ${errorText.substring(0, 200)}` 
      };
    }

    const uploadData = await uploadResponse.json();
    const fileUrl = uploadData.url || uploadData.file?.url;
    
    if (!fileUrl) {
      logger.error(`No ${type} URL in fal.ai upload response`, { uploadData });
      return { success: false, error: `No ${type} URL returned from upload` };
    }

    logger.info(`${type} uploaded to fal.ai`, { url: fileUrl });
    return { success: true, url: fileUrl };
    
  } catch (error) {
    logger.error(`${type} upload error`, { error: error.message });
    return { success: false, error: `Failed to upload ${type}` };
  }
}

/**
 * Validate fal.ai/fal.media URL (prevents SSRF attacks)
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
export function isValidFalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  // Allow data URIs (for uploaded files)
  if (url.startsWith('data:')) return true;
  
  // Allow fal.ai and fal.media domains
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    return hostname === 'fal.ai' || 
           hostname === 'fal.media' ||
           hostname.endsWith('.fal.ai') ||
           hostname.endsWith('.fal.media');
  } catch {
    return false;
  }
}

export default { uploadToFal, isValidFalUrl };
