/**
 * Shared file upload utilities for fal.ai
 * Consolidates duplicate video/image upload logic
 */
import logger from './logger';

// Maximum file sizes
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// Types
interface MagicValidationResult {
  valid: boolean;
  detectedType?: string;
}

interface UploadOptions {
  dataUri: string;
  type: 'video' | 'image';
  apiKey: string;
  ip?: string;
}

interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Validate file magic bytes to prevent malicious file uploads
 */
function validateMagicBytes(buffer: Buffer, type: 'video' | 'image'): MagicValidationResult {
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
 */
export async function uploadToFal({ dataUri, type, apiKey, ip }: UploadOptions): Promise<UploadResult> {
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
  let mimeType: string;
  let extension: string;
  
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
  
  try {
    // Step 1: Initiate upload to get presigned URL
    const initiateResponse = await fetch('https://rest.fal.run/storage/upload/initiate', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        file_name: `${type}.${extension}`,
        content_type: mimeType
      })
    });

    if (!initiateResponse.ok) {
      const errorText = await initiateResponse.text();
      logger.error(`Failed to initiate ${type} upload to fal.ai`, { 
        status: initiateResponse.status, 
        error: errorText.substring(0, 200) 
      });
      return { 
        success: false, 
        error: `Failed to initiate ${type} upload: ${errorText.substring(0, 200)}` 
      };
    }

    const initiateData = await initiateResponse.json() as { 
      upload_url?: string; 
      file_url?: string;
    };

    if (!initiateData.upload_url || !initiateData.file_url) {
      logger.error(`No upload URL in fal.ai initiate response`, { initiateData });
      return { success: false, error: `No upload URL returned from fal.ai` };
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
      const errorText = await uploadResponse.text();
      logger.error(`Failed to upload ${type} to presigned URL`, { 
        status: uploadResponse.status, 
        error: errorText.substring(0, 200) 
      });
      return { 
        success: false, 
        error: `Failed to upload ${type}: ${errorText.substring(0, 200)}` 
      };
    }

    logger.info(`${type} uploaded to fal.ai`, { url: initiateData.file_url });
    return { success: true, url: initiateData.file_url };
    
  } catch (error) {
    const err = error as Error;
    logger.error(`${type} upload error`, { error: err.message });
    return { success: false, error: `Failed to upload ${type}` };
  }
}

/**
 * Validate fal.ai/fal.media URL (prevents SSRF attacks)
 */
export function isValidFalUrl(url: unknown): boolean {
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

