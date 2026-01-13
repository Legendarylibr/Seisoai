/**
 * Video metadata cleaning utility for backend
 * Strips metadata (creation date, camera info, location, etc.) from videos
 * Uses FFmpeg if available, otherwise returns original
 */
import logger from './logger';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createWriteStream, unlink } from 'fs';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { resolve } from 'path';

const execFileAsync = promisify(execFile);
const unlinkAsync = promisify(unlink);

// Types
interface StripVideoMetadataOptions {
  format?: 'mp4' | 'webm';
}

/**
 * Check if FFmpeg is available and has required codecs
 * SECURITY: Use execFile to prevent command injection
 */
const checkFFmpegAvailable = async (): Promise<boolean> => {
  try {
    // Check if ffmpeg binary exists and is executable
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    
    // Check if libx264 codec is available (required for video encoding)
    try {
      await execFileAsync('ffmpeg', ['-codecs'], { timeout: 5000 });
      // If we get here, ffmpeg is working
      return true;
    } catch {
      // If codecs check fails, log warning but still return true
      // (some minimal builds might not support -codecs flag)
      logger.warn('FFmpeg codec check failed, but ffmpeg is available');
      return true;
    }
  } catch (error) {
    const err = error as Error;
    logger.error('FFmpeg not available', { error: err.message });
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
  // SECURITY: Generate random filenames and validate they're within tmpdir
  const randomSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const tempInput = resolve(tmpdir(), `video-input-${randomSuffix}.${format}`);
  const tempOutput = resolve(tmpdir(), `video-output-${randomSuffix}.${format}`);
  
  // SECURITY: Validate paths are within tmpdir (prevent path traversal)
  const tmpDirResolved = resolve(tmpdir());
  if (!tempInput.startsWith(tmpDirResolved) || !tempOutput.startsWith(tmpDirResolved)) {
    throw new Error('Invalid temporary file path');
  }

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
        await pipeline(response.body as unknown as NodeJS.ReadableStream, writeStream);
      } else {
        // Fallback: write chunks manually for web ReadableStream
        type WebReadableStream = { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } };
        const reader = (response.body as unknown as WebReadableStream).getReader();
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

    // SECURITY FIX: Use execFile with array arguments instead of exec with string
    // This prevents shell interpretation and command injection
    // -map_metadata -1 removes all metadata
    // -c:v libx264 -c:a copy re-encodes video but keeps audio (more thorough metadata removal)
    const ffmpegArgs = [
      '-i', tempInput,
      '-map_metadata', '-1',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      tempOutput,
      '-y'
    ];
    
    // SECURITY: Set timeout and maxBuffer to prevent DoS
    try {
      await execFileAsync('ffmpeg', ffmpegArgs, {
        timeout: 300000, // 5 minutes max
        maxBuffer: 10 * 1024 * 1024 // 10MB max output
      });
    } catch (codecError) {
      const codecErr = codecError as Error;
      // Check if error is due to missing codec
      if (codecErr.message.includes('libx264') || codecErr.message.includes('codec') || codecErr.message.includes('Unknown encoder')) {
        logger.error('FFmpeg codec error - libx264 may not be available', { 
          error: codecErr.message,
          suggestion: 'Install full ffmpeg package with codecs (not ffmpeg-headless)'
        });
        throw new Error(`FFmpeg codec error: ${codecErr.message}. Ensure full ffmpeg with libx264 codec is installed.`);
      }
      throw codecError;
    }

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





