/**
 * Image metadata cleaning utility for backend
 * Strips EXIF data, location info, and other metadata from images
 * Uses sharp library if available, otherwise returns original
 */
import logger from './logger.js';

let sharp = null;
try {
  sharp = await import('sharp').then(m => m.default);
  logger.info('Sharp library loaded - metadata cleaning enabled');
} catch (error) {
  logger.warn('Sharp library not available - metadata cleaning will be skipped on backend', {
    error: error.message,
    note: 'Install sharp with: npm install sharp'
  });
}

/**
 * Strip metadata from an image buffer
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Object} options - Options
 * @param {string} options.format - Output format: 'jpeg', 'png', 'webp' (default: 'jpeg')
 * @param {number} options.quality - JPEG quality 0-100 (default: 90, only for JPEG)
 * @returns {Promise<Buffer>} - Cleaned image buffer (no metadata)
 */
export const stripImageMetadata = async (imageBuffer, options = {}) => {
  if (!sharp) {
    logger.warn('Sharp not available - returning original image without metadata cleaning');
    return imageBuffer;
  }

  const { format = 'jpeg', quality = 90 } = options;

  try {
    // Use sharp to strip all metadata by re-encoding the image
    const cleanedBuffer = await sharp(imageBuffer)
      .removeAlpha() // Remove alpha channel for JPEG
      .toFormat(format, {
        quality: format === 'jpeg' ? quality : undefined,
        mozjpeg: format === 'jpeg', // Use mozjpeg for better compression
        compressionLevel: format === 'png' ? 9 : undefined, // PNG compression
        effort: format === 'webp' ? 6 : undefined // WebP effort
      })
      .toBuffer();

    logger.debug('Image metadata stripped', {
      originalSize: imageBuffer.length,
      cleanedSize: cleanedBuffer.length,
      format
    });

    return cleanedBuffer;
  } catch (error) {
    logger.error('Failed to strip image metadata', { error: error.message });
    // Return original if cleaning fails
    return imageBuffer;
  }
};

/**
 * Strip metadata from an image URL by downloading, cleaning, and optionally re-uploading
 * @param {string} imageUrl - URL of the image
 * @param {Object} options - Options
 * @param {string} options.format - Output format: 'jpeg', 'png', 'webp' (default: 'jpeg')
 * @param {number} options.quality - JPEG quality 0-100 (default: 90)
 * @returns {Promise<Buffer>} - Cleaned image buffer
 */
export const stripImageMetadataFromUrl = async (imageUrl, options = {}) => {
  if (!sharp) {
    logger.warn('Sharp not available - cannot clean image from URL');
    throw new Error('Image metadata cleaning not available - sharp library not installed');
  }

  try {
    // Download image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Strip metadata
    return await stripImageMetadata(imageBuffer, options);
  } catch (error) {
    logger.error('Failed to strip metadata from image URL', {
      error: error.message,
      url: imageUrl?.substring(0, 100)
    });
    throw error;
  }
};

/**
 * Check if metadata cleaning is available
 * @returns {boolean} - True if sharp is available
 */
export const isMetadataCleaningAvailable = () => {
  return sharp !== null;
};

export default {
  stripImageMetadata,
  stripImageMetadataFromUrl,
  isMetadataCleaningAvailable
};

