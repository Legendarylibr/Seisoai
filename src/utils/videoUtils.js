/**
 * Get video duration from a video URL
 * @param {string} videoUrl - URL of the video
 * @returns {Promise<number>} - Duration in seconds
 */
export const getVideoDuration = (videoUrl) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    
    video.onerror = (error) => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('Failed to load video metadata: ' + error.message));
    };
    
    video.src = videoUrl;
  });
};

/**
 * Calculate credits for video generation based on duration
 * @param {number} durationInSeconds - Video duration in seconds
 * @returns {number} - Credits to charge (2 credits per second, minimum 2 credits)
 */
export const calculateVideoCredits = (durationInSeconds) => {
  if (!durationInSeconds || durationInSeconds <= 0) {
    return 2; // Minimum 2 credits if duration is unknown or invalid
  }
  
  const credits = Math.ceil(durationInSeconds * 2); // 2 credits per second, round up
  return Math.max(credits, 2); // Minimum 2 credits
};

