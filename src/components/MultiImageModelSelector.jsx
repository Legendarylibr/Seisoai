import React from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Sparkles, Zap } from 'lucide-react';

const MultiImageModelSelector = () => {
  const { controlNetImage, multiImageModel, setMultiImageModel } = useImageGenerator();

  // Only show when multiple images (2+) are provided
  const isMultipleImages = Array.isArray(controlNetImage) && controlNetImage.length >= 2;
  
  if (!isMultipleImages) {
    return null;
  }

  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5">
        <span className="text-xs md:text-sm font-semibold text-white">
          Model
        </span>
        <span className="text-xs text-gray-500">(for multi-image editing)</span>
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMultiImageModel('flux-multi')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm ${
            multiImageModel === 'flux-multi'
              ? 'bg-purple-500/20 border-purple-400 text-purple-300'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>FLUX Multi</span>
          <span className="text-xs text-gray-500">(1 credit)</span>
        </button>
        <button
          type="button"
          onClick={() => setMultiImageModel('nano-banana-pro')}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm ${
            multiImageModel === 'nano-banana-pro'
              ? 'bg-purple-500/20 border-purple-400 text-purple-300'
              : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Nano Banana Pro</span>
          <span className="text-xs text-gray-500">(2 credits)</span>
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {multiImageModel === 'nano-banana-pro' 
          ? '✨ Advanced semantic editing with better quality and reasoning'
          : '⚡ Fast multi-image blending and composition'}
      </p>
    </div>
  );
};

export default MultiImageModelSelector;

