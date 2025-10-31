/**
 * Image optimization utility to reduce payload size for API requests
 * Resizes and compresses images before sending to reduce transfer time
 */

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
        
        console.log(`🖼️ Image optimized: ${(originalSize / 1024).toFixed(1)}KB → ${(optimizedSize / 1024).toFixed(1)}KB (${reduction}% reduction)`);
        
        resolve(optimizedDataUri);
      } catch (error) {
        console.error('Image optimization error:', error);
        // Fallback to original if optimization fails
        resolve(dataUri);
      }
    };

    img.onerror = () => {
      console.error('Failed to load image for optimization');
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

