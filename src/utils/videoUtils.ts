/**
 * Get video duration from a video URL
 */
export const getVideoDuration = (videoUrl: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata'));
    };
    
    video.src = videoUrl;
  });
};

/**
 * Calculate credits for video generation based on duration
 * @returns Credits to charge (2 credits per second, minimum 2 credits)
 */
export const calculateVideoCredits = (durationInSeconds: number): number => {
  if (!durationInSeconds || durationInSeconds <= 0) {
    return 2; // Minimum 2 credits if duration is unknown or invalid
  }
  
  const credits = Math.ceil(durationInSeconds * 2); // 2 credits per second, round up
  return Math.max(credits, 2); // Minimum 2 credits
};




