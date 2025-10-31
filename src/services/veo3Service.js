// Veo 3 Fast Image-to-Video Service
// Uses Google's Veo 3 Fast model via fal.ai API for image-to-video generation

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  console.error('VITE_FAL_API_KEY environment variable is required');
}

/**
 * Convert image to data URI or ensure it's a valid URL
 */
const prepareImageUrl = (image) => {
  if (!image) return null;
  
  // If already a URL or data URI, return as is
  if (typeof image === 'string' && (image.startsWith('http') || image.startsWith('data:'))) {
    return image;
  }
  
  // Otherwise assume it's base64 and return as data URI
  return image;
};

/**
 * Generate video using Veo 3 Fast Image-to-Video
 * @param {Object} params - { prompt, image (required), options }
 * @returns {Promise<string>} - URL of generated video
 */
export const generateVideo = async ({ prompt, image = null, options = {} }) => {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL API key not configured. Please set VITE_FAL_API_KEY in your .env file.');
    }

    if (!image) {
      throw new Error('Image input is required for Veo 3 Fast Image-to-Video API');
    }

    const imageUrl = prepareImageUrl(image);

    const input = {
      prompt: prompt,
      image_url: imageUrl, // Required for image-to-video
      aspect_ratio: options.aspectRatio || 'auto',
      duration: '8s', // Fixed duration for this model
      resolution: options.resolution || '720p',
      generate_audio: options.generateAudio !== false
    };

    console.log('🎬 Generating video with Veo 3 Fast Image-to-Video:', { prompt, hasImage: !!input.image_url, aspect_ratio: input.aspect_ratio, duration: input.duration });

    // Submit via backend proxy to avoid CORS
    // Use VITE_API_URL for consistency with other services
    const backendBase = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const response = await fetch(`${backendBase}/api/veo3/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch (e) {
        errorMessage = await response.text();
      }
      throw new Error(errorMessage);
    }

    const { request_id } = await response.json();
    console.log('📝 Request ID:', request_id);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`${backendBase}/api/veo3/status/${request_id}`, {
        method: 'GET'
      });

      const status = await statusResponse.json();
      console.log('📊 Status:', status.status);

      if (status.status === 'COMPLETED') {
        // Get the result
        const resultResponse = await fetch(`${backendBase}/api/veo3/result/${request_id}`, {
          method: 'GET'
        });

        const result = await resultResponse.json();
        
        if (result.video && result.video.url) {
          console.log('✅ Video generated successfully:', result.video.url);
          return result.video.url;
        } else {
          throw new Error('No video URL in response');
        }
      } else if (status.status === 'FAILED') {
        throw new Error(status.error || 'Video generation failed');
      }
      
      attempts++;
    }

    throw new Error('Video generation timeout');
  } catch (error) {
    console.error('Veo 3 video generation error:', error);
    throw new Error(`Failed to generate video: ${error.message}`);
  }
};

/**
 * Get video generation options for Veo 3 Fast Image-to-Video
 */
export const getVideoOptions = () => {
  return {
    aspectRatio: [
      { value: 'auto', label: 'Auto (Match Image)' },
      { value: '16:9', label: '16:9 (Landscape)' },
      { value: '9:16', label: '9:16 (Portrait)' },
      { value: '1:1', label: '1:1 (Square)' }
    ],
    duration: [
      { value: '8s', label: '8 seconds' }
      // Note: Veo 3 Fast Image-to-Video only supports 8s duration
    ],
    resolution: [
      { value: '720p', label: '720p HD' },
      { value: '1080p', label: '1080p Full HD' }
    ]
  };
};

