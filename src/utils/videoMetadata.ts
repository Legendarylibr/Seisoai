/**
 * Video metadata utilities for frontend
 * Note: Browser-based video metadata stripping is limited.
 * For thorough metadata removal, videos should be processed on the backend using FFmpeg.
 */

import logger from './logger';

interface StripVideoOptions {
  format?: 'mp4' | 'webm';
}

/**
 * Strip metadata from a video by re-encoding (limited browser support)
 * This uses MediaRecorder API which may not preserve all video quality
 * For production use, prefer backend processing with FFmpeg
 */
export const stripVideoMetadata = async (
  videoUrl: string, 
  options: StripVideoOptions = {}
): Promise<Blob> => {
  const { format = 'webm' } = options;
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      try {
        // Create canvas to capture video frames
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        
        // Use MediaRecorder to re-encode video (this removes some metadata)
        // Note: This is a simplified approach and may not remove all metadata
        // For thorough metadata removal, use backend FFmpeg processing
        const stream = canvas.captureStream(30); // 30 FPS
        const mimeType = format === 'webm' ? 'video/webm;codecs=vp9' : 'video/mp4';
        
        // Check if the mimeType is supported
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          reject(new Error(`MimeType ${mimeType} is not supported`));
          return;
        }
        
        const mediaRecorder = new MediaRecorder(stream, { mimeType });
        
        const chunks: Blob[] = [];
        
        mediaRecorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
          resolve(blob);
        };
        
        mediaRecorder.onerror = () => {
          logger.error('MediaRecorder error');
          reject(new Error('Failed to process video'));
        };
        
        // Draw video frame to canvas and start recording
        const drawFrame = (): void => {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          if (!video.ended) {
            requestAnimationFrame(drawFrame);
          } else {
            mediaRecorder.stop();
          }
        };
        
        mediaRecorder.start();
        video.play();
        drawFrame();
        
        // Stop after video ends
        video.onended = () => {
          mediaRecorder.stop();
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Video metadata stripping error', { error: errorMessage });
        reject(error);
      }
    };
    
    video.onerror = () => {
      logger.error('Failed to load video for metadata stripping', { videoUrl: videoUrl?.substring(0, 100) });
      reject(new Error('Failed to load video'));
    };
    
    video.src = videoUrl;
  });
};

/**
 * Note about video metadata cleaning:
 * Browser-based video metadata removal is limited and may not remove all metadata.
 * For production use, videos should be processed on the backend using FFmpeg
 * (see backend/utils/videoMetadata.js).
 * 
 * Videos from AI generation services (like fal.ai) typically have minimal metadata,
 * but for user-uploaded videos, backend processing is recommended.
 */
export const VIDEO_METADATA_CLEANING_NOTE = 
  'Browser-based video metadata cleaning is limited. For thorough metadata removal, ' +
  'use backend FFmpeg processing (backend/utils/videoMetadata.js).';

export default {
  stripVideoMetadata,
  VIDEO_METADATA_CLEANING_NOTE
};



