// Veo 3 Video Generation Service
// Uses Google's Veo 3 model via fal.ai API

const FAL_API_KEY = import.meta.env.VITE_FAL_API_KEY;

if (!FAL_API_KEY || FAL_API_KEY === 'your_fal_api_key_here') {
  console.error('VITE_FAL_API_KEY environment variable is required');
}

/**
 * Convert image to base64 data URI
 */
const imageToDataURI = async (imageUrl) => {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    throw new Error(`Failed to convert image: ${error.message}`);
  }
};

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

    const input = {
      prompt: prompt,
      aspect_ratio: options.aspectRatio || '16:9',
      duration: options.duration || '8s',
      enhance_prompt: options.enhancePrompt !== false,
      resolution: options.resolution || '720p',
      generate_audio: options.generateAudio !== false,
      auto_fix: options.autoFix !== false,
    };

    // Add image if provided
    if (image) {
      // Convert image to data URI if it's not already
      let imageData = image;
      if (!image.startsWith('data:') && !image.startsWith('http')) {
        // Assume it's already a base64 or data URI
        imageData = image;
      } else if (!image.startsWith('data:')) {
        // Convert URL to data URI
        console.log('📸 Converting image to data URI...');
        imageData = await imageToDataURI(image);
      }
      
      input.image_url = imageData;
      console.log('✅ Image added to request');
    }

    // Add negative prompt if provided
    if (options.negativePrompt) {
      input.negative_prompt = options.negativePrompt;
    }

    // Add seed if provided
    if (options.seed) {
      input.seed = options.seed;
    }

    console.log('🎬 Generating video with Veo 3:', { prompt, hasImage: !!input.image_url, aspect_ratio: input.aspect_ratio, duration: input.duration });

    const response = await fetch('https://queue.fal.run/fal-ai/veo3', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${FAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ input })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || errorData.message || `HTTP error! status: ${response.status}`);
    }

    const { request_id } = await response.json();
    console.log('📝 Request ID:', request_id);

    // Poll for completion
    let attempts = 0;
    const maxAttempts = 120; // 2 minutes max (60 * 2)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
      
      const statusResponse = await fetch(`https://queue.fal.run/fal-ai/veo3/requests/${request_id}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Key ${FAL_API_KEY}`,
        }
      });

      const status = await statusResponse.json();
      console.log('📊 Status:', status.status);

      if (status.status === 'COMPLETED') {
        // Get the result
        const resultResponse = await fetch(`https://queue.fal.run/fal-ai/veo3/requests/${request_id}/result`, {
          method: 'GET',
          headers: {
            'Authorization': `Key ${FAL_API_KEY}`,
          }
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

