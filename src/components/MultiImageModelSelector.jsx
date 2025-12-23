import React, { useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Sparkles, Zap, Layers } from 'lucide-react';
import logger from '../utils/logger.js';

const MultiImageModelSelector = () => {
  const { controlNetImage, multiImageModel, setMultiImageModel } = useImageGenerator();

  // Check if we have images (1+)
  // Handle both array format and single image format
  const getImageCount = () => {
    if (!controlNetImage) return 0;
    if (Array.isArray(controlNetImage)) {
      return controlNetImage.length;
    }
    return 1; // Single image (string)
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

  // Log for debugging
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

  // Determine model labels and current selection based on image count
  const getModelLabels = () => {
    if (isMultipleImages) {
      return {
        flux: 'FLUX Multi',
        fluxDesc: '⚡ Fast multi-image blending and composition',
        currentFluxModel: 'flux-multi'
      };
    } else {
      return {
        flux: 'FLUX',
        fluxDesc: '⚡ Fast image editing and generation',
        currentFluxModel: 'flux'
      };
    }
  };

  const labels = getModelLabels();
  const isFluxSelected = multiImageModel === labels.currentFluxModel || (!multiImageModel && labels.currentFluxModel);
  
  // When no images, show FLUX and nano-banana-pro for prompt-only generation
  if (!hasImages) {
    const isFluxSelectedForTextToImage = multiImageModel === 'flux' || !multiImageModel;
    const isNanoBananaProSelected = multiImageModel === 'nano-banana-pro';
    
    return (
      <div className="space-y-1 p-1.5 rounded" style={{ 
        background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
        border: '2px outset #e8e8e8',
        boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 4px 8px rgba(0, 0, 0, 0.2)'
      }}>
        <label className="flex items-center gap-1">
          <span className="text-[10px] font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
            Model Selection
          </span>
          <span className="text-[10px] font-medium" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
            (prompt only)
          </span>
        </label>
        <div className="flex gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => {
              logger.debug('Selected FLUX model for text-to-image');
              setMultiImageModel('flux');
            }}
            className="flex-1 flex flex-row items-center justify-center gap-1 px-1.5 py-1 rounded transition-all min-w-[60px]"
            style={isFluxSelectedForTextToImage ? {
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
              if (!isFluxSelectedForTextToImage) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
              }
            }}
            onMouseLeave={(e) => {
              if (!isFluxSelectedForTextToImage) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
              }
            }}
          >
            <Zap className="w-3 h-3" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
            <div className="flex flex-col items-center gap-0">
              <span className="text-[10px] font-bold leading-tight">FLUX</span>
              <span className="text-[9px] leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>1 credit</span>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              logger.debug('Selected Nano Banana Pro model');
              setMultiImageModel('nano-banana-pro');
            }}
            className="flex-1 flex flex-row items-center justify-center gap-1 px-1.5 py-1 rounded transition-all min-w-[60px]"
            style={isNanoBananaProSelected ? {
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
              if (!isNanoBananaProSelected) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
              }
            }}
            onMouseLeave={(e) => {
              if (!isNanoBananaProSelected) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
              }
            }}
          >
            <Sparkles className="w-3 h-3" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
            <div className="flex flex-col items-center gap-0">
              <span className="text-[10px] font-bold leading-tight">Nano Banana</span>
              <span className="text-[9px] leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>2 credits</span>
            </div>
          </button>
        </div>
        <div className="pt-0.5 border-t" style={{ borderColor: '#d0d0d0' }}>
          <p className="text-[10px] leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
            {isNanoBananaProSelected
              ? '✨ Advanced text-to-image with better quality'
              : isFluxSelectedForTextToImage
              ? '⚡ Fast text-to-image generation'
              : '⚡ Select FLUX or Nano Banana Pro'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 p-2 rounded" style={{ 
      background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
      border: '2px outset #e8e8e8',
      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 4px 8px rgba(0, 0, 0, 0.2)'
    }}>
      <label className="flex items-center gap-1.5">
        <span className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
          Model Selection
        </span>
        <span className="text-xs font-medium" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
          ({imageCount} {imageCount === 1 ? 'image' : 'images'})
        </span>
      </label>
      <div className="flex gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => {
            logger.debug('Selected FLUX model', { fluxModel: labels.currentFluxModel });
            setMultiImageModel(labels.currentFluxModel);
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
          style={isFluxSelected ? {
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
            if (!isFluxSelected) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
            }
          }}
          onMouseLeave={(e) => {
            if (!isFluxSelected) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
            }
          }}
        >
          <Zap className="w-4 h-4" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-bold">{labels.flux}</span>
            <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Generate or edit</span>
            <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>1 credit</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            logger.debug('Selected Nano Banana Pro model');
            setMultiImageModel('nano-banana-pro');
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
          style={multiImageModel === 'nano-banana-pro' ? {
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
            if (multiImageModel !== 'nano-banana-pro') {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
            }
          }}
          onMouseLeave={(e) => {
            if (multiImageModel !== 'nano-banana-pro') {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
            }
          }}
        >
          <Sparkles className="w-4 h-4" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-bold">Nano Banana Pro</span>
            <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Generate or edit</span>
            <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>2 credits</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            logger.debug('Selected Qwen Image Layered model');
            setMultiImageModel('qwen-image-layered');
          }}
          className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
          style={multiImageModel === 'qwen-image-layered' ? {
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
            if (multiImageModel !== 'qwen-image-layered') {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
            }
          }}
          onMouseLeave={(e) => {
            if (multiImageModel !== 'qwen-image-layered') {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
            }
          }}
        >
          <Layers className="w-4 h-4" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-xs font-bold">Qwen</span>
            <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Extract by layer</span>
            <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>1 credit</span>
          </div>
        </button>
      </div>
      <div className="pt-1 border-t" style={{ borderColor: '#d0d0d0' }}>
        <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
          {multiImageModel === 'qwen-image-layered'
            ? '🎨 Extract by layer - Extract RGBA layers from the image (returns multiple layers)'
            : multiImageModel === 'nano-banana-pro' 
            ? '✨ Generate or edit - Advanced semantic generation and editing with better quality and reasoning'
            : `⚡ Generate and edit - ${labels.fluxDesc}`}
        </p>
      </div>
    </div>
  );
};

export default MultiImageModelSelector;

