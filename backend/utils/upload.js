/**
 * Shared file upload utilities for fal.ai
 * Consolidates duplicate video/image upload logic
 */
import logger from './logger.js';

// Maximum file sizes
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Magic bytes for file type validation (security: prevents malicious file disguise)
const MAGIC_BYTES = {
  // Images
  jpeg: [0xFF, 0xD8, 0xFF],
  png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
  gif: [0x47, 0x49, 0x46, 0x38],
  webp: [0x52, 0x49, 0x46, 0x46], // RIFF header (followed by WEBP at offset 8)
  // Videos
  mp4: [0x00, 0x00, 0x00], // ftyp box (variable, but starts with size)
  mov: [0x00, 0x00, 0x00], // Same as MP4 (ftyp/moov)
};

/**
 * Validate file magic bytes to prevent malicious file uploads
 * @param {Buffer} buffer - File buffer
 * @param {string} type - 'video' or 'image'
 * @returns {{valid: boolean, detectedType?: string}}
 */
function validateMagicBytes(buffer, type) {
  if (!buffer || buffer.length < 12) {
    return { valid: false };
  }

  if (type === 'image') {
    // Check JPEG
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return { valid: true, detectedType: 'jpeg' };
    }
    // Check PNG
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return { valid: true, detectedType: 'png' };
    }
    // Check GIF
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return { valid: true, detectedType: 'gif' };
    }
    // Check WebP (RIFF....WEBP)
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return { valid: true, detectedType: 'webp' };
    }
    return { valid: false };
  }

  if (type === 'video') {
    // Check for ftyp box (MP4/MOV/M4V) - look for 'ftyp' at offset 4
    if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
      return { valid: true, detectedType: 'mp4' };
    }
    // Check for moov box at start (some MOV files)
    if (buffer[4] === 0x6D && buffer[5] === 0x6F && buffer[6] === 0x6F && buffer[7] === 0x76) {
      return { valid: true, detectedType: 'mov' };
    }
    // Check for wide box (another MP4 variant)
    if (buffer[4] === 0x77 && buffer[5] === 0x69 && buffer[6] === 0x64 && buffer[7] === 0x65) {
      return { valid: true, detectedType: 'mp4' };
    }
    return { valid: false };
  }

  return { valid: false };
}

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

  // SECURITY: Validate magic bytes to prevent malicious file uploads
  const magicValidation = validateMagicBytes(buffer, type);
  if (!magicValidation.valid) {
    logger.warn(`Invalid ${type} magic bytes - potential malicious file`, { 
      ip,
      firstBytes: buffer.slice(0, 12).toString('hex')
    });
    return { 
      success: false, 
      error: `Invalid ${type} file format. File does not match expected ${type} format.` 
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
    // Use detected type for more accurate extension
    if (magicValidation.detectedType === 'png') {
      extension = 'png';
    } else if (magicValidation.detectedType === 'gif') {
      extension = 'gif';
    } else if (magicValidation.detectedType === 'webp') {
      extension = 'webp';
    } else {
      extension = 'jpg';
    }
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
