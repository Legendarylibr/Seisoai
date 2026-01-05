/**
 * Image optimization utility to reduce payload size for API requests
 * Resizes and compresses images before sending to reduce transfer time
 */
import logger from './logger';

interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png';
}

interface StripMetadataOptions {
  format?: 'jpeg' | 'png';
  quality?: number;
}

/**
 * Optimize an image data URI by resizing and compressing
 */
export const optimizeImage = async (
  dataUri: string, 
  options: OptimizeImageOptions = {}
): Promise<string> => {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 0.85,
    format = 'jpeg'
  } = options;

  return new Promise((resolve) => {
    const img = new Image();
    
    img.onload = () => {
      try {
        // Calculate new dimensions while maintaining aspect ratio
        let width = img.width;
        let height = img.height;
        
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
        if (!ctx) {
          resolve(dataUri);
          return;
        }
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Image optimization error:', { error: errorMessage });
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
 */
export const optimizeImages = async (
  images: string[] | string, 
  options: OptimizeImageOptions = {}
): Promise<string[] | string> => {
  if (Array.isArray(images)) {
    return Promise.all(images.map(img => optimizeImage(img, options)));
  }
  return optimizeImage(images, options);
};

/**
 * Get estimated size of a data URI in bytes
 */
export const getDataUriSize = (dataUri: string): number => {
  if (!dataUri) return 0;
  // Base64 encoding increases size by ~33%, but data URIs have overhead
  // Rough estimate: base64 length * 0.75
  return Math.round(dataUri.length * 0.75);
};

/**
 * Check if image needs optimization (larger than threshold)
 */
export const needsOptimization = (dataUri: string, thresholdKB: number = 500): boolean => {
  const sizeKB = getDataUriSize(dataUri) / 1024;
  return sizeKB > thresholdKB;
};

/**
 * Strip metadata from an image by redrawing it on canvas
 * This removes all EXIF data, location info, and other metadata
 */
export function stripImageMetadata(
  imageUrl: string, 
  options: StripMetadataOptions = {}
): Promise<Blob> {
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
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
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
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Metadata stripping error', { error: errorMessage });
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
 */
export const stripImageMetadataToDataUri = async (
  imageUrl: string, 
  options: StripMetadataOptions = {}
): Promise<string> => {
  const blob = await stripImageMetadata(imageUrl, options);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Strip metadata from multiple images
 */
export const stripImagesMetadata = async (
  imageUrls: string[] | string, 
  options: StripMetadataOptions = {}
): Promise<Blob[] | Blob> => {
  if (Array.isArray(imageUrls)) {
    return Promise.all(imageUrls.map(url => stripImageMetadata(url, options)));
  }
  return stripImageMetadata(imageUrls, options);
};

/**
 * Strip metadata from multiple images and return as data URIs
 */
export const stripImagesMetadataToDataUri = async (
  imageUrls: string[] | string, 
  options: StripMetadataOptions = {}
): Promise<string[] | string> => {
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




