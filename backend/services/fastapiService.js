// FastAPI/ComfyUI Service for NFT holders
// This service handles image generation using your local ComfyUI model

const axios = require('axios');

class FastAPIService {
  constructor() {
    this.baseURL = process.env.FASTAPI_URL || 'http://localhost:8000';
    this.enabled = process.env.FASTAPI_ENABLED === 'true';
  }

  /**
   * Check if FastAPI service is available
   */
  async isAvailable() {
    if (!this.enabled) return false;
    
    try {
      const response = await axios.get(`${this.baseURL}/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      console.warn('FastAPI service not available:', error.message);
      return false;
    }
  }

  /**
   * Generate image using FastAPI/ComfyUI
   */
  async generateImage(prompt, options = {}) {
    if (!this.enabled) {
      throw new Error('FastAPI service is disabled');
    }

    try {
      const payload = {
        prompt: prompt,
        negative_prompt: options.negativePrompt || '',
        width: options.width || 512,
        height: options.height || 512,
        steps: options.steps || 20,
        cfg_scale: options.cfgScale || 7.5,
        seed: options.seed || -1,
        batch_size: options.batchSize || 1,
        ...options
      };

      console.log('Sending request to FastAPI:', payload);

      const response = await axios.post(`${this.baseURL}/generate`, payload, {
        timeout: 300000, // 5 minutes timeout for generation
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        images: response.data.images || [],
        metadata: {
          model: 'local-comfyui',
          prompt: prompt,
          options: payload,
          generationTime: response.data.generation_time || 0
        }
      };

    } catch (error) {
      console.error('FastAPI generation error:', error);
      throw new Error(`FastAPI generation failed: ${error.message}`);
    }
  }

  /**
   * Get available models from FastAPI
   */
  async getAvailableModels() {
    if (!this.enabled) return [];

    try {
      const response = await axios.get(`${this.baseURL}/models`, { timeout: 10000 });
      return response.data.models || [];
    } catch (error) {
      console.warn('Could not fetch models from FastAPI:', error.message);
      return [];
    }
  }

  /**
   * Get generation status
   */
  async getGenerationStatus(taskId) {
    if (!this.enabled) return null;

    try {
      const response = await axios.get(`${this.baseURL}/status/${taskId}`, { timeout: 5000 });
      return response.data;
    } catch (error) {
      console.warn('Could not fetch generation status:', error.message);
      return null;
    }
  }
}

module.exports = FastAPIService;
