import { useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Sparkles, Zap, Layers, Wand2, Cpu, type LucideIcon } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';
import logger from '../utils/logger';

// Model configuration for cleaner code
interface ModelConfig {
  id: string;
  name: string;
  icon: LucideIcon;
  credits: number;
  tagline: string;
  description: string;
}

const MODEL_CONFIG: Record<string, ModelConfig> = {
  flux: {
    id: 'flux',
    name: 'FLUX',
    icon: Zap,
    credits: 0.6,
    tagline: 'Fast',
    description: 'Quick generation'
  },
  'flux-multi': {
    id: 'flux-multi',
    name: 'FLUX',
    icon: Zap,
    credits: 0.6,
    tagline: 'Fast',
    description: 'Multi-image blending'
  },
  'flux-2': {
    id: 'flux-2',
    name: 'FLUX 2',
    icon: Wand2,
    credits: 0.3,
    tagline: 'Cheap',
    description: 'Enhanced realism & text'
  },
  'nano-banana-pro': {
    id: 'nano-banana-pro',
    name: 'Nano Banana',
    icon: Sparkles,
    credits: 1.25,
    tagline: '50% OFF',
    description: 'Premium quality'
  },
  'qwen-image-layered': {
    id: 'qwen-image-layered',
    name: 'Qwen',
    icon: Layers,
    credits: 0.3,
    tagline: 'Layers',
    description: 'Extract RGBA layers'
  }
};

interface MultiImageModelSelectorProps {
  customPrompt?: string;
}

const MultiImageModelSelector: React.FC<MultiImageModelSelectorProps> = () => {
  const { controlNetImage, multiImageModel, setMultiImageModel } = useImageGenerator();

  const getImageCount = (): number => {
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
  const getAvailableModels = (): string[] => {
    if (!hasImages) {
      // Text-to-image: FLUX, FLUX 2, and Banana
      return ['flux', 'flux-2', 'nano-banana-pro'];
    } else if (isMultipleImages) {
      // With 2+ images: FLUX, FLUX 2 (edit), Banana, Qwen
      return [fluxModelId, 'flux-2', 'nano-banana-pro', 'qwen-image-layered'];
    } else {
      // With 1 image: FLUX, FLUX 2 (edit), Banana, and Qwen
      return [fluxModelId, 'flux-2', 'nano-banana-pro', 'qwen-image-layered'];
    }
  };

  const availableModels = getAvailableModels();
  const currentModel = multiImageModel || availableModels[0];

  // Button component for consistency - Win95 style
  interface ModelButtonProps {
    modelId: string;
  }

  const ModelButton: React.FC<ModelButtonProps> = ({ modelId }) => {
    const config = MODEL_CONFIG[modelId];
    if (!config) return null;
    
    const isSelected = currentModel === modelId;
    const Icon = config.icon;

    return (
      <button
        type="button"
        onClick={() => {
          logger.debug(`Selected ${config.name} model`, { modelId });
          setMultiImageModel(modelId);
        }}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 min-w-[70px]"
        style={isSelected ? {
          background: WIN95.highlight,
          color: WIN95.highlightText,
          border: 'none',
          boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        } : {
          background: WIN95.buttonFace,
          color: WIN95.text,
          border: 'none',
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = '#d4d4d4';
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = WIN95.buttonFace;
          }
        }}
      >
        <div className="flex items-center gap-1">
          <Icon className="w-3 h-3" />
          <span className="text-[10px] font-bold">{config.name}</span>
        </div>
        <span className="text-[9px]" style={{ opacity: 0.8 }}>{config.tagline}</span>
        <span className="text-[8px]" style={{ opacity: 0.7 }}>
          {config.credits} cr
        </span>
      </button>
    );
  };

  return (
    <div 
      style={{ 
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Title bar */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <Cpu className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          AI Model
        </span>
        {hasImages && (
          <span className="text-[9px] opacity-80 ml-1">({imageCount} img)</span>
        )}
      </div>
      
      {/* Model buttons */}
      <div className="flex gap-1 p-2">
        {availableModels.map(modelId => (
          <ModelButton key={modelId} modelId={modelId} />
        ))}
      </div>
    </div>
  );
};

export default MultiImageModelSelector;

