import React, { useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Sparkles, Zap, Layers } from 'lucide-react';
import logger from '../utils/logger.js';

// Model configuration for cleaner code
const MODEL_CONFIG = {
  flux: {
    id: 'flux',
    name: 'FLUX',
    icon: Zap,
    credits: 1,
    tagline: 'Fast',
    description: 'Quick generation'
  },
  'flux-multi': {
    id: 'flux-multi',
    name: 'FLUX',
    icon: Zap,
    credits: 1,
    tagline: 'Fast',
    description: 'Multi-image blending'
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Banana',
    icon: Sparkles,
    credits: 2,
    tagline: 'Quality',
    description: 'Better quality'
  },
  'qwen-image-layered': {
    id: 'qwen-image-layered',
    name: 'Qwen',
    icon: Layers,
    credits: 1,
    tagline: 'Layers',
    description: 'Extract RGBA layers'
  }
};

const MultiImageModelSelector = ({ customPrompt = '' }) => {
  const { controlNetImage, multiImageModel, setMultiImageModel } = useImageGenerator();

  const getImageCount = () => {
    if (!controlNetImage) return 0;
    if (Array.isArray(controlNetImage)) {
      return controlNetImage.length;
    }
    return 1;
  };

  const imageCount = getImageCount();
  const hasImages = imageCount >= 1;
  const isMultipleImages = imageCount >= 2;

  // Set default model when images are first detected
  useEffect(() => {
    if (hasImages && !multiImageModel) {
      const defaultModel = isMultipleImages ? 'flux-multi' : 'flux';
      logger.debug('Setting default model', { defaultModel, imageCount });
      setMultiImageModel(defaultModel);
    }
  }, [hasImages, isMultipleImages, multiImageModel, setMultiImageModel, imageCount]);

  useEffect(() => {
    if (controlNetImage) {
      logger.debug('ModelSelector - Image state', {
        isArray: Array.isArray(controlNetImage),
        imageCount,
        isMultipleImages,
        multiImageModel
      });
    }
  }, [controlNetImage, imageCount, isMultipleImages, multiImageModel]);

  // Determine which flux model to use
  const fluxModelId = isMultipleImages ? 'flux-multi' : 'flux';
  
  // Get available models based on context
  const getAvailableModels = () => {
    if (!hasImages) {
      // Text-to-image: FLUX and Banana only
      return ['flux', 'nano-banana-pro'];
    } else {
      // With images: FLUX, Banana, and Qwen
      return [fluxModelId, 'nano-banana-pro', 'qwen-image-layered'];
    }
  };

  const availableModels = getAvailableModels();
  const currentModel = multiImageModel || availableModels[0];

  // Button component for consistency
  const ModelButton = ({ modelId }) => {
    const config = MODEL_CONFIG[modelId];
    const isSelected = currentModel === modelId;
    const Icon = config.icon;

    return (
      <button
        type="button"
        onClick={() => {
          logger.debug(`Selected ${config.name} model`, { modelId });
          setMultiImageModel(modelId);
        }}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded transition-all min-w-[70px]"
        style={isSelected ? {
          background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
          border: '2px inset #c0c0c0',
          boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5), 0 1px 2px rgba(0, 0, 0, 0.2)',
          color: '#000000',
          textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
        } : {
          background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
          border: '2px outset #f0f0f0',
          boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
          color: '#000000',
          textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
            e.currentTarget.style.border = '2px outset #f8f8f8';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
            e.currentTarget.style.border = '2px outset #f0f0f0';
          }
        }}
      >
        <div className="flex items-center gap-1">
          <Icon className="w-3 h-3" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
          <span className="text-[11px] font-bold">{config.name}</span>
        </div>
        <span className="text-[9px] font-medium" style={{ color: '#444' }}>{config.tagline}</span>
        <span className="text-[9px]" style={{ color: '#666' }}>
          {config.credits} {config.credits === 1 ? 'credit' : 'credits'}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-1.5 p-2 rounded" style={{ 
      background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
      border: '2px outset #e8e8e8',
      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 4px 8px rgba(0, 0, 0, 0.2)'
    }}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
          Model
        </span>
        {hasImages && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ 
            background: '#e0e0e0',
            color: '#444',
            border: '1px solid #ccc'
          }}>
            {imageCount} {imageCount === 1 ? 'image' : 'images'}
          </span>
        )}
      </div>
      
      <div className="flex gap-1.5">
        {availableModels.map(modelId => (
          <ModelButton key={modelId} modelId={modelId} />
        ))}
      </div>
    </div>
  );
};

export default MultiImageModelSelector;
