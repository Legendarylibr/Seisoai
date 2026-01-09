/**
 * Client-side FFmpeg utility for audio extraction
 * Uses FFmpeg.wasm to extract audio from video files in the browser
 */

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

// Singleton FFmpeg instance
let ffmpeg: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;

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

  try {
    ffmpeg = new FFmpeg();

    // Load FFmpeg with CORS-enabled URLs from unpkg CDN
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    isLoaded = true;
    isLoading = false;

    // Resolve any waiting promises
    loadPromises.forEach(p => p.resolve());
    loadPromises.length = 0;

    return ffmpeg;
  } catch (error) {
    isLoading = false;
    const err = error instanceof Error ? error : new Error('Failed to load FFmpeg');
    
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
  // SharedArrayBuffer requires cross-origin isolation
  return typeof SharedArrayBuffer !== 'undefined';
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
  const ff = await getFFmpeg();
  
  // Generate unique filenames to avoid conflicts
  const timestamp = Date.now();
  const inputFileName = `input_${timestamp}.mp4`;
  const outputFileName = `output_${timestamp}.${outputFormat}`;
  
  try {
    // Write the video file to FFmpeg's virtual filesystem
    const videoData = await fetchFile(videoFile);
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
    
    // Extract audio: -vn removes video stream, -acodec sets audio codec
    await ff.exec([
      '-i', inputFileName,
      '-vn',                    // No video
      '-acodec', audioCodec,    // Audio codec
      '-ar', '44100',           // Sample rate
      '-ac', '2',               // Stereo
      '-b:a', '192k',           // Bitrate (for compressed formats)
      outputFileName
    ]);
    
    // Read the output file
    const data = await ff.readFile(outputFileName);
    
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
    
    return new Blob([data], { type: mimeTypes[outputFormat] || 'audio/mpeg' });
  } catch (error) {
    // Clean up on error
    try {
      await ff.deleteFile(inputFileName);
      await ff.deleteFile(outputFileName);
    } catch {
      // Ignore cleanup errors
    }
    
    throw error instanceof Error 
      ? error 
      : new Error('Failed to extract audio from video');
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


