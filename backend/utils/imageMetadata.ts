/**
 * Image metadata cleaning utility for backend
 * Strips EXIF data, location info, and other metadata from images
 * Uses sharp library if available, otherwise returns original
 */
import logger from './logger';
import type { Sharp } from 'sharp';

// Types
interface StripImageMetadataOptions {
  format?: 'jpeg' | 'png' | 'webp';
  quality?: number;
}

let sharp: typeof Sharp | null = null;

try {
  // Dynamic import for sharp
  const sharpModule = await import('sharp');
  sharp = sharpModule.default as typeof Sharp;
  logger.info('Sharp library loaded - metadata cleaning enabled');
} catch (error) {
  const err = error as Error;
  logger.warn('Sharp library not available - metadata cleaning will be skipped on backend', {
    error: err.message,
    note: 'Install sharp with: npm install sharp'
  });
}

/**
 * Strip metadata from an image buffer
 */
export const stripImageMetadata = async (
  imageBuffer: Buffer, 
  options: StripImageMetadataOptions = {}
): Promise<Buffer> => {
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
    const err = error as Error;
    logger.error('Failed to strip image metadata', { error: err.message });
    // Return original if cleaning fails
    return imageBuffer;
  }
};

/**
 * Strip metadata from an image URL by downloading, cleaning, and optionally re-uploading
 */
export const stripImageMetadataFromUrl = async (
  imageUrl: string, 
  options: StripImageMetadataOptions = {}
): Promise<Buffer> => {
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
    const err = error as Error;
    logger.error('Failed to strip metadata from image URL', {
      error: err.message,
      url: imageUrl?.substring(0, 100)
    });
    throw error;
  }
};

/**
 * Check if metadata cleaning is available
 */
export const isMetadataCleaningAvailable = (): boolean => {
  return sharp !== null;
};

export default {
  stripImageMetadata,
  stripImageMetadataFromUrl,
  isMetadataCleaningAvailable
};

