import React, { useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Sparkles, Zap } from 'lucide-react';
import logger from '../utils/logger.js';

const MultiImageModelSelector = () => {
  const { controlNetImage, multiImageModel, setMultiImageModel } = useImageGenerator();

  // Check if we have multiple images (2+)
  // Handle both array format and single image format
  const getImageCount = () => {
    if (!controlNetImage) return 0;
    if (Array.isArray(controlNetImage)) {
      return controlNetImage.length;
    }
    return 1; // Single image (string)
  };

  const imageCount = getImageCount();
  const isMultipleImages = imageCount >= 2;

  // Set default model when multiple images are first detected
  useEffect(() => {
    if (isMultipleImages && !multiImageModel) {
      logger.debug('Setting default multi-image model to flux-multi');
      setMultiImageModel('flux-multi');
    }
  }, [isMultipleImages, multiImageModel, setMultiImageModel]);

  // Log for debugging
  useEffect(() => {
    if (controlNetImage) {
      logger.debug('MultiImageModelSelector - Image state', {
        isArray: Array.isArray(controlNetImage),
        imageCount,
        isMultipleImages,
        multiImageModel
      });
    }
  }, [controlNetImage, imageCount, isMultipleImages, multiImageModel]);

  // Only show when multiple images (2+) are provided
  if (!isMultipleImages) {
    return null;
  }

  return (
    <div className="space-y-2 p-3 bg-white/5 rounded-lg border border-white/10">
      <label className="flex items-center gap-1.5">
        <span className="text-xs md:text-sm font-semibold text-white">
          Model Selection
        </span>
        <span className="text-xs text-purple-400 font-medium">
          ({imageCount} images)
        </span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            logger.debug('Selected FLUX Multi model');
            setMultiImageModel('flux-multi');
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all ${
            multiImageModel === 'flux-multi'
              ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-lg shadow-purple-500/20'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
          }`}
        >
          <Zap className="w-5 h-5" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-medium">FLUX Multi</span>
            <span className="text-xs text-gray-400">1 credit</span>
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            logger.debug('Selected Nano Banana Pro model');
            setMultiImageModel('nano-banana-pro');
          }}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all ${
            multiImageModel === 'nano-banana-pro'
              ? 'bg-purple-500/20 border-purple-400 text-purple-300 shadow-lg shadow-purple-500/20'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20'
          }`}
        >
          <Sparkles className="w-5 h-5" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-sm font-medium">Nano Banana Pro</span>
            <span className="text-xs text-gray-400">2 credits</span>
          </div>
        </button>
      </div>
      <div className="pt-1 border-t border-white/10">
        <p className="text-xs text-gray-400">
          {multiImageModel === 'nano-banana-pro' 
            ? '✨ Advanced semantic editing with better quality and reasoning'
            : '⚡ Fast multi-image blending and composition'}
        </p>
      </div>
    </div>
  );
};

export default MultiImageModelSelector;

