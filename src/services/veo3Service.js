// Veo 3 Video Generation Service
// Uses Google's Veo 3 model via fal.ai API

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  console.error('VITE_FAL_API_KEY environment variable is required');
}

/**
 * Generate video using Veo 3
 * @param {Object} params - { prompt, image (optional), options }
 * @returns {Promise<string>} - URL of generated video
 */
export const generateVideo = async ({ prompt, image = null, options = {} }) => {
  try {
    if (!FAL_API_KEY) {
      throw new Error('FAL API key not configured. Please set VITE_FAL_API_KEY in your .env file.');
    }

    const requestBody = {
      prompt: prompt,
      aspect_ratio: options.aspectRatio || '16:9',
      duration: options.duration || '8s',
      enhance_prompt: options.enhancePrompt !== false,
      resolution: options.resolution || '720p',
      generate_audio: options.generateAudio !== false,
      auto_fix: options.autoFix !== false,
    };

    // Add negative prompt if provided
    if (options.negativePrompt) {
      requestBody.negative_prompt = options.negativePrompt;
    }

    // Add seed if provided
    if (options.seed) {
      requestBody.seed = options.seed;
    }

    console.log('🎬 Generating video with Veo 3:', requestBody);

    const response = await fetch('https://fal.run/fal-ai/veo3', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || errorData.message || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.video && data.video.url) {
      console.log('✅ Video generated successfully:', data.video.url);
      return data.video.url;
    } else {
      throw new Error('No video URL in response');
    }
  } catch (error) {
    console.error('Veo 3 video generation error:', error);
    throw new Error(`Failed to generate video: ${error.message}`);
  }
};

/**
 * Get video generation options
 */
export const getVideoOptions = () => {
  return {
    aspectRatio: [
      { value: '16:9', label: '16:9 (Landscape)' },
      { value: '9:16', label: '9:16 (Portrait)' },
      { value: '1:1', label: '1:1 (Square)' }
    ],
    duration: [
      { value: '4s', label: '4 seconds' },
      { value: '6s', label: '6 seconds' },
      { value: '8s', label: '8 seconds' }
    ],
    resolution: [
      { value: '720p', label: '720p HD' },
      { value: '1080p', label: '1080p Full HD' }
    ]
  };
};

