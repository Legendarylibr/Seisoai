/**
 * Video metadata cleaning utility for backend
 * Strips metadata (creation date, camera info, location, etc.) from videos
 * Uses FFmpeg if available, otherwise returns original
 */
import logger from './logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, unlink } from 'fs';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);
const unlinkAsync = promisify(unlink);

// Types
interface StripVideoMetadataOptions {
  format?: 'mp4' | 'webm';
}

/**
 * Check if FFmpeg is available
 */
const checkFFmpegAvailable = async (): Promise<boolean> => {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
};

let ffmpegAvailable: boolean | null = null;

/**
 * Strip metadata from a video buffer or URL
 */
export const stripVideoMetadata = async (
  videoInput: string | Buffer, 
  options: StripVideoMetadataOptions = {}
): Promise<Buffer> => {
  // Check FFmpeg availability on first call
  if (ffmpegAvailable === null) {
    ffmpegAvailable = await checkFFmpegAvailable();
    if (!ffmpegAvailable) {
      logger.warn('FFmpeg not available - video metadata cleaning will be skipped', {
        note: 'Install FFmpeg to enable video metadata cleaning'
      });
    } else {
      logger.info('FFmpeg available - video metadata cleaning enabled');
    }
  }

  if (!ffmpegAvailable) {
    logger.warn('FFmpeg not available - returning original video without metadata cleaning');
    // If input is a buffer, return it as-is
    if (Buffer.isBuffer(videoInput)) {
      return videoInput;
    }
    // If input is a URL, download and return as-is
    const response = await fetch(videoInput);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  const { format = 'mp4' } = options;
  const tempInput = join(tmpdir(), `video-input-${Date.now()}-${Math.random().toString(36).substring(7)}.${format}`);
  const tempOutput = join(tmpdir(), `video-output-${Date.now()}-${Math.random().toString(36).substring(7)}.${format}`);

  try {
    // Download video if URL, or write buffer to temp file
    if (typeof videoInput === 'string') {
      const response = await fetch(videoInput);
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
      }
      // Download video to temp file
      const writeStream = createWriteStream(tempInput);
      // Convert ReadableStream to Node stream if needed
      if (response.body && typeof (response.body as { pipe?: unknown }).pipe === 'function') {
        await pipeline(response.body as NodeJS.ReadableStream, writeStream);
      } else {
        // Fallback: write chunks manually
        const reader = (response.body as ReadableStream<Uint8Array>).getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          writeStream.write(value);
        }
        writeStream.end();
        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
        });
      }
    } else {
      // Write buffer to temp file
      const writeStream = createWriteStream(tempInput);
      writeStream.write(videoInput);
      writeStream.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }

    // Use FFmpeg to strip metadata by re-encoding without metadata
    // -map_metadata -1 removes all metadata
    // -c copy copies streams without re-encoding (faster, but may preserve some metadata)
    // -c:v libx264 -c:a copy re-encodes video but keeps audio (more thorough metadata removal)
    const ffmpegCommand = `ffmpeg -i "${tempInput}" -map_metadata -1 -c:v libx264 -preset fast -crf 23 -c:a copy -movflags +faststart "${tempOutput}" -y`;
    
    await execAsync(ffmpegCommand);

    // Read cleaned video
    const fs = await import('fs/promises');
    const cleanedBuffer = await fs.readFile(tempOutput);

    logger.debug('Video metadata stripped', {
      originalSize: typeof videoInput === 'string' ? 'unknown' : videoInput.length,
      cleanedSize: cleanedBuffer.length,
      format
    });

    // Clean up temp files
    try {
      await unlinkAsync(tempInput);
      await unlinkAsync(tempOutput);
    } catch (cleanupError) {
      const err = cleanupError as Error;
      logger.warn('Failed to cleanup temp files', { error: err.message });
    }

    return cleanedBuffer;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to strip video metadata', { error: err.message });
    
    // Clean up temp files on error
    try {
      await unlinkAsync(tempInput).catch(() => {});
      await unlinkAsync(tempOutput).catch(() => {});
    } catch {
      // Ignore cleanup errors
    }

    // If FFmpeg processing fails, return original
    if (Buffer.isBuffer(videoInput)) {
      return videoInput;
    }
    const response = await fetch(videoInput);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
};

/**
 * Strip metadata from a video URL and return cleaned video buffer
 */
export const stripVideoMetadataFromUrl = async (
  videoUrl: string, 
  options: StripVideoMetadataOptions = {}
): Promise<Buffer> => {
  return await stripVideoMetadata(videoUrl, options);
};

/**
 * Check if video metadata cleaning is available
 */
export const isVideoMetadataCleaningAvailable = async (): Promise<boolean> => {
  if (ffmpegAvailable === null) {
    ffmpegAvailable = await checkFFmpegAvailable();
  }
  return ffmpegAvailable;
};





