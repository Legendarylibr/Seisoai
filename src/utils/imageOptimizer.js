/**
 * Image optimization utility to reduce payload size for API requests
 * Resizes and compresses images before sending to reduce transfer time
 */
import logger from './logger.js';

/**
 * Optimize an image data URI by resizing and compressing
 * @param {string} dataUri - Base64 data URI of the image
 * @param {Object} options - Optimization options
 * @param {number} options.maxWidth - Maximum width (default: 2048)
 * @param {number} options.maxHeight - Maximum height (default: 2048)
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.85)
 * @param {string} options.format - Output format: 'jpeg' or 'png' (default: 'jpeg')
 * @returns {Promise<string>} - Optimized data URI
 */
export const optimizeImage = async (dataUri, options = {}) => {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 0.85,
    format = 'jpeg'
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // Create canvas for resizing/compression
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Convert to optimized format
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const outputQuality = format === 'png' ? undefined : quality;
        
        const optimizedDataUri = canvas.toDataURL(mimeType, outputQuality);
        
        // Log size reduction for debugging
        const originalSize = dataUri.length;
        const optimizedSize = optimizedDataUri.length;
        const reduction = ((1 - optimizedSize / originalSize) * 100).toFixed(1);
        
        logger.debug('Image optimized', { 
          originalSizeKB: (originalSize / 1024).toFixed(1), 
          optimizedSizeKB: (optimizedSize / 1024).toFixed(1), 
          reduction: `${reduction}%` 
        });
        
        resolve(optimizedDataUri);
      } catch (error) {
        logger.error('Image optimization error:', { error: error.message });
        // Fallback to original if optimization fails
        resolve(dataUri);
      }
    };

    img.onerror = () => {
      logger.error('Failed to load image for optimization');
      // Fallback to original if loading fails
      resolve(dataUri);
    };

    img.src = dataUri;
  });
};

/**
 * Optimize multiple images
 * @param {string[]|string} images - Single data URI or array of data URIs
 * @param {Object} options - Optimization options
 * @returns {Promise<string[]|string>} - Optimized image(s)
 */
export const optimizeImages = async (images, options = {}) => {
  if (Array.isArray(images)) {
    return Promise.all(images.map(img => optimizeImage(img, options)));
  }
  return optimizeImage(images, options);
};

/**
 * Get estimated size of a data URI in bytes
 * @param {string} dataUri - Base64 data URI
 * @returns {number} - Estimated size in bytes
 */
export const getDataUriSize = (dataUri) => {
  if (!dataUri) return 0;
  // Base64 encoding increases size by ~33%, but data URIs have overhead
  // Rough estimate: base64 length * 0.75
  return Math.round(dataUri.length * 0.75);
};

/**
 * Check if image needs optimization (larger than threshold)
 * @param {string} dataUri - Base64 data URI
 * @param {number} thresholdKB - Size threshold in KB (default: 500KB)
 * @returns {boolean} - True if optimization is recommended
 */
export const needsOptimization = (dataUri, thresholdKB = 500) => {
  const sizeKB = getDataUriSize(dataUri) / 1024;
  return sizeKB > thresholdKB;
};

/**
 * Strip metadata from an image by redrawing it on canvas
 * This removes all EXIF data, location info, and other metadata
 * @param {string} imageUrl - URL or data URI of the image
 * @param {Object} options - Options for metadata stripping
 * @param {string} options.format - Output format: 'png' or 'jpeg' (default: 'png')
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.92, only for JPEG)
 * @returns {Promise<Blob>} - Blob with cleaned image (no metadata)
 */
export function stripImageMetadata(imageUrl, options = {}) {
  const { format = 'png', quality = 0.92 } = options;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        
        // Draw image to canvas - this strips all metadata
        ctx.drawImage(img, 0, 0);
        
        // Convert to blob with specified format
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const outputQuality = format === 'jpeg' ? quality : undefined;
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image to blob'));
            }
          },
          mimeType,
          outputQuality
        );
      } catch (error) {
        logger.error('Metadata stripping error', { error: error.message });
        reject(error);
      }
    };
    
    img.onerror = () => {
      logger.error('Failed to load image for metadata stripping', { imageUrl: imageUrl?.substring(0, 100) });
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Strip metadata from an image and return as data URI
 * @param {string} imageUrl - URL or data URI of the image
 * @param {Object} options - Options for metadata stripping
 * @param {string} options.format - Output format: 'png' or 'jpeg' (default: 'png')
 * @param {number} options.quality - JPEG quality 0-1 (default: 0.92, only for JPEG)
 * @returns {Promise<string>} - Data URI with cleaned image (no metadata)
 */
export const stripImageMetadataToDataUri = async (imageUrl, options = {}) => {
  const blob = await stripImageMetadata(imageUrl, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Strip metadata from multiple images
 * @param {string[]|string} imageUrls - Single URL or array of URLs
 * @param {Object} options - Options for metadata stripping
 * @returns {Promise<Blob[]|Blob>} - Cleaned image blob(s)
 */
export const stripImagesMetadata = async (imageUrls, options = {}) => {
  if (Array.isArray(imageUrls)) {
    return Promise.all(imageUrls.map(url => stripImageMetadata(url, options)));
  }
  return stripImageMetadata(imageUrls, options);
};

/**
 * Strip metadata from multiple images and return as data URIs
 * @param {string[]|string} imageUrls - Single URL or array of URLs
 * @param {Object} options - Options for metadata stripping
 * @returns {Promise<string[]|string>} - Cleaned image data URI(s)
 */
export const stripImagesMetadataToDataUri = async (imageUrls, options = {}) => {
  if (Array.isArray(imageUrls)) {
    return Promise.all(imageUrls.map(url => stripImageMetadataToDataUri(url, options)));
  }
  return stripImageMetadataToDataUri(imageUrls, options);
};

// Default export for better module resolution
export default {
  optimizeImage,
  optimizeImages,
  getDataUriSize,
  needsOptimization,
  stripImageMetadata,
  stripImageMetadataToDataUri,
  stripImagesMetadata,
  stripImagesMetadataToDataUri
};

