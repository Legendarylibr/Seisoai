/**
 * Client-side FFmpeg utility for audio extraction
 * Uses FFmpeg.wasm to extract audio from video files in the browser
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import logger from './logger';

// Singleton FFmpeg instance
let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;
let loadError: Error | null = null;

// Queue to handle multiple load requests
const loadPromises: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

/**
 * Get or initialize the FFmpeg instance
 */
export async function getFFmpeg(): Promise<FFmpeg> {
  // If already loaded, return the instance
  if (ffmpeg && isLoaded) {
    return ffmpeg;
  }

  // If we previously failed to load, throw the cached error
  if (loadError) {
    throw loadError;
  }

  // If currently loading, wait for it
  if (isLoading) {
    return new Promise((resolve, reject) => {
      loadPromises.push({
        resolve: () => resolve(ffmpeg!),
        reject
      });
    });
  }

  isLoading = true;
  logger.info('FFmpeg: Starting initialization...');

  // First, verify SharedArrayBuffer is available
  if (typeof SharedArrayBuffer === 'undefined') {
    const err = new Error(
      'FFmpeg requires SharedArrayBuffer which is not available. ' +
      'This is usually caused by missing Cross-Origin-Embedder-Policy headers. ' +
      'Please ensure the server sends COEP: credentialless or COEP: require-corp headers.'
    );
    loadError = err;
    isLoading = false;
    logger.error('FFmpeg: SharedArrayBuffer not available', { error: err.message });
    throw err;
  }

  logger.debug('FFmpeg: SharedArrayBuffer is available');

  try {
    ffmpeg = new FFmpeg();

    // Set up logging to debug FFmpeg issues
    ffmpeg.on('log', ({ message }) => {
      logger.debug('FFmpeg log:', { message });
    });

    ffmpeg.on('progress', ({ progress, time }) => {
      logger.debug('FFmpeg progress:', { progress: Math.round(progress * 100), time });
    });

    // Load FFmpeg with CORS-enabled URLs from unpkg CDN
    // Version matches @ffmpeg/ffmpeg package version (0.12.15)
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const fallbackURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    let primaryError: Error | null = null;
    
    logger.info('FFmpeg: Loading from primary CDN (unpkg)...');
    
    // Try primary CDN first (unpkg)
    try {
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      logger.debug('FFmpeg: Blob URLs created, loading core...');
      
      await ffmpeg.load({
        coreURL,
        wasmURL,
      });
      logger.info('FFmpeg: Loaded successfully from unpkg CDN');
    } catch (cdnError) {
      primaryError = cdnError instanceof Error ? cdnError : new Error(String(cdnError));
      logger.warn('FFmpeg: Primary CDN (unpkg) failed, trying fallback (jsDelivr)', { error: primaryError.message });
      
      // If primary CDN fails, try jsDelivr as fallback
      try {
        const coreURL = await toBlobURL(`${fallbackURL}/ffmpeg-core.js`, 'text/javascript');
        const wasmURL = await toBlobURL(`${fallbackURL}/ffmpeg-core.wasm`, 'application/wasm');
        
        await ffmpeg.load({
          coreURL,
          wasmURL,
        });
        logger.info('FFmpeg: Loaded successfully from fallback CDN (jsDelivr)');
      } catch (fallbackError) {
        const fallbackErr = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
        const combinedError = new Error(
          `Failed to load FFmpeg from both CDNs. ` +
          `Primary (unpkg): ${primaryError.message}. ` +
          `Fallback (jsDelivr): ${fallbackErr.message}. ` +
          `This may be due to network issues, CORS/COEP restrictions, or CDN unavailability.`
        );
        logger.error('FFmpeg: Failed to load from both CDNs', { 
          primaryError: primaryError.message, 
          fallbackError: fallbackErr.message 
        });
        throw combinedError;
      }
    }

    isLoaded = true;
    isLoading = false;

    // Resolve any waiting promises
    loadPromises.forEach(p => p.resolve());
    loadPromises.length = 0;

    return ffmpeg;
  } catch (error) {
    isLoading = false;
    const err = error instanceof Error 
      ? new Error(`Failed to load FFmpeg: ${error.message}`)
      : new Error('Failed to load FFmpeg: Unknown error');
    
    // Cache the error so we don't retry repeatedly
    loadError = err;
    
    logger.error('FFmpeg: Initialization failed', { error: err.message });
    
    // Reject any waiting promises
    loadPromises.forEach(p => p.reject(err));
    loadPromises.length = 0;
    
    throw err;
  }
}

/**
 * Check if FFmpeg is available and can be loaded
 */
export function isFFmpegSupported(): boolean {
  // Check for SharedArrayBuffer support (required by FFmpeg.wasm)
  // SharedArrayBuffer requires cross-origin isolation (COOP + COEP headers)
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  
  if (!hasSharedArrayBuffer) {
    logger.warn('FFmpeg: SharedArrayBuffer not available - cross-origin isolation may not be enabled');
  }
  
  return hasSharedArrayBuffer;
}

/**
 * Get detailed FFmpeg support status
 */
export function getFFmpegSupportStatus(): { 
  supported: boolean; 
  reason?: string;
  isLoaded: boolean;
  hasError: boolean;
  errorMessage?: string;
} {
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  
  if (!hasSharedArrayBuffer) {
    return {
      supported: false,
      reason: 'SharedArrayBuffer not available. Server must send Cross-Origin-Embedder-Policy header.',
      isLoaded: false,
      hasError: false
    };
  }
  
  if (loadError) {
    return {
      supported: true,
      isLoaded: false,
      hasError: true,
      errorMessage: loadError.message
    };
  }
  
  return {
    supported: true,
    isLoaded,
    hasError: false
  };
}

/**
 * Reset FFmpeg error state to allow retry
 */
export function resetFFmpegError(): void {
  loadError = null;
  ffmpeg = null;
  isLoaded = false;
  isLoading = false;
  logger.info('FFmpeg: Error state reset, ready for retry');
}

/**
 * Extract audio from a video file
 * @param videoFile - The video file or Blob to extract audio from
 * @param outputFormat - The output audio format ('mp3', 'wav', 'aac', 'm4a')
 * @returns A Blob containing the extracted audio
 */
export async function extractAudioFromVideo(
  videoFile: File | Blob,
  outputFormat: 'mp3' | 'wav' | 'aac' | 'm4a' = 'mp3'
): Promise<Blob> {
  logger.info('FFmpeg: Starting audio extraction', { 
    fileSize: videoFile.size,
    fileType: videoFile.type,
    outputFormat 
  });

  const ff = await getFFmpeg();
  
  // Generate unique filenames to avoid conflicts
  const timestamp = Date.now();
  const inputFileName = `input_${timestamp}.mp4`;
  const outputFileName = `output_${timestamp}.${outputFormat}`;
  
  try {
    // Write the video file to FFmpeg's virtual filesystem
    logger.debug('FFmpeg: Reading video file...');
    const videoData = await fetchFile(videoFile);
    logger.debug('FFmpeg: Writing to virtual filesystem...', { dataSize: videoData.length });
    await ff.writeFile(inputFileName, videoData);
    
    // Build the FFmpeg command based on output format
    let audioCodec: string;
    switch (outputFormat) {
      case 'wav':
        audioCodec = 'pcm_s16le';
        break;
      case 'aac':
      case 'm4a':
        audioCodec = 'aac';
        break;
      case 'mp3':
      default:
        audioCodec = 'libmp3lame';
        break;
    }
    
    const ffmpegArgs = [
      '-i', inputFileName,
      '-vn',                    // No video
      '-acodec', audioCodec,    // Audio codec
      '-ar', '44100',           // Sample rate
      '-ac', '2',               // Stereo
      '-b:a', '192k',           // Bitrate (for compressed formats)
      outputFileName
    ];
    
    logger.info('FFmpeg: Executing extraction...', { codec: audioCodec });
    
    // Extract audio: -vn removes video stream, -acodec sets audio codec
    await ff.exec(ffmpegArgs);
    
    logger.debug('FFmpeg: Reading output file...');
    
    // Read the output file
    const data = await ff.readFile(outputFileName);
    
    if (!data || (data as Uint8Array).length === 0) {
      throw new Error('FFmpeg produced empty output - video may not contain audio track');
    }
    
    logger.info('FFmpeg: Audio extraction successful', { outputSize: (data as Uint8Array).length });
    
    // Clean up files from virtual filesystem
    try {
      await ff.deleteFile(inputFileName);
      await ff.deleteFile(outputFileName);
    } catch {
      // Ignore cleanup errors
    }
    
    // Convert to Blob
    const mimeTypes: Record<string, string> = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      aac: 'audio/aac',
      m4a: 'audio/mp4'
    };
    
    // FileData from FFmpeg can be Uint8Array or string
    // We need to handle both cases and convert to a format Blob accepts
    let blobData: BlobPart;
    if (typeof data === 'string') {
      blobData = data;
    } else {
      // data is Uint8Array - copy to a new ArrayBuffer to avoid SharedArrayBuffer issues
      const buffer = new ArrayBuffer(data.length);
      const view = new Uint8Array(buffer);
      view.set(data);
      blobData = buffer;
    }
    
    return new Blob([blobData], { type: mimeTypes[outputFormat] || 'audio/mpeg' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('FFmpeg: Audio extraction failed', { error: errorMessage });
    
    // Clean up on error
    try {
      await ff.deleteFile(inputFileName);
      await ff.deleteFile(outputFileName);
    } catch {
      // Ignore cleanup errors
    }
    
    throw error instanceof Error 
      ? error 
      : new Error(`Failed to extract audio from video: ${errorMessage}`);
  }
}

/**
 * Convert a data URI to a Blob
 */
export function dataURItoBlob(dataURI: string): Blob {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  
  return new Blob([ab], { type: mimeString });
}

/**
 * Extract audio from a video data URI
 * This is a convenience wrapper for the MusicGenerator component
 */
export async function extractAudioFromDataURI(
  videoDataURI: string,
  outputFormat: 'mp3' | 'wav' = 'mp3'
): Promise<{ blob: Blob; dataUri: string }> {
  const videoBlob = dataURItoBlob(videoDataURI);
  const audioBlob = await extractAudioFromVideo(videoBlob, outputFormat);
  
  // Convert to data URI for consistency with existing code
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({
        blob: audioBlob,
        dataUri: reader.result as string
      });
    };
    reader.onerror = () => reject(new Error('Failed to convert audio blob to data URI'));
    reader.readAsDataURL(audioBlob);
  });
}


