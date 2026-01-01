import React, { createContext, useContext, useReducer, ReactNode, Dispatch } from 'react';
import type { VisualStyle } from '../types';

// Types
interface ImageDimensions {
  width: number;
  height: number;
}

interface GenerationHistoryItem {
  id: number;
  image: string;
  style: VisualStyle | null;
  timestamp: string;
}

interface CurrentGeneration {
  prompt: string;
  style?: VisualStyle;
  model?: string;
  timestamp?: string;
}

interface PromptOptimizationResult {
  original: string;
  optimized: string;
  reasoning?: string;
}

interface ImageGeneratorState {
  selectedStyle: VisualStyle | null;
  generatedImage: string | null;
  generatedImages: string[];
  isGenerating: boolean;
  error: string | null;
  generationHistory: GenerationHistoryItem[];
  currentGeneration: CurrentGeneration | null;
  guidanceScale: number;
  numInferenceSteps?: number;
  imageSize: string;
  numImages: number;
  enableSafetyChecker: boolean;
  generationMode: string;
  multiImageModel: string | null;
  controlNetType: string | null;
  controlNetImage: string | null;
  controlNetImageDimensions: ImageDimensions | null;
  optimizePrompt: boolean;
  promptOptimizationResult: PromptOptimizationResult | null;
}

type ImageGeneratorAction =
  | { type: 'SELECT_STYLE'; payload: VisualStyle | null }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_GENERATED_IMAGE'; payload: string | string[] }
  | { type: 'SET_CURRENT_GENERATION'; payload: CurrentGeneration | null }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'CLEAR_GENERATION' }
  | { type: 'CLEAR_ALL' }
  | { type: 'SET_GUIDANCE_SCALE'; payload: number }
  | { type: 'SET_INFERENCE_STEPS'; payload: number }
  | { type: 'SET_IMAGE_SIZE'; payload: string }
  | { type: 'SET_NUM_IMAGES'; payload: number }
  | { type: 'SET_SAFETY_CHECKER'; payload: boolean }
  | { type: 'SET_GENERATION_MODE'; payload: string }
  | { type: 'SET_MULTI_IMAGE_MODEL'; payload: string | null }
  | { type: 'SET_CONTROL_NET_TYPE'; payload: string | null }
  | { type: 'SET_CONTROL_NET_IMAGE'; payload: { image: string | null; dimensions: ImageDimensions | null } | string | null }
  | { type: 'SET_OPTIMIZE_PROMPT'; payload: boolean }
  | { type: 'SET_PROMPT_OPTIMIZATION_RESULT'; payload: PromptOptimizationResult | null };

interface ImageGeneratorContextValue extends ImageGeneratorState {
  selectStyle: (style: VisualStyle | null) => void;
  setControlNetImage: (image: string | null, dimensions?: ImageDimensions | null) => void;
  setControlNetType: (type: string | null) => void;
  setGenerating: (isGenerating: boolean) => void;
  setGeneratedImage: (image: string | string[]) => void;
  setError: (error: string | null) => void;
  clearGeneration: () => void;
  clearAll: () => void;
  setGuidanceScale: (scale: number) => void;
  setInferenceSteps: (steps: number) => void;
  setImageSize: (size: string) => void;
  setNumImages: (num: number) => void;
  setSafetyChecker: (enabled: boolean) => void;
  setGenerationMode: (mode: string) => void;
  setMultiImageModel: (model: string | null) => void;
  setCurrentGeneration: (generation: CurrentGeneration | null) => void;
  setOptimizePrompt: (enabled: boolean) => void;
  setPromptOptimizationResult: (result: PromptOptimizationResult | null) => void;
}

const ImageGeneratorContext = createContext<ImageGeneratorContextValue | null>(null);

const initialState: ImageGeneratorState = {
  selectedStyle: null,
  generatedImage: null,
  generatedImages: [],
  isGenerating: false,
  error: null,
  generationHistory: [],
  currentGeneration: null,
  guidanceScale: 7.5,
  imageSize: 'square',
  numImages: 1,
  enableSafetyChecker: false,
  generationMode: 'flux-pro',
  multiImageModel: null,
  controlNetType: null,
  controlNetImage: null,
  controlNetImageDimensions: null,
  optimizePrompt: true,
  promptOptimizationResult: null
};

const imageGeneratorReducer = (state: ImageGeneratorState, action: ImageGeneratorAction): ImageGeneratorState => {
  switch (action.type) {
    case 'SELECT_STYLE':
      return {
        ...state,
        selectedStyle: action.payload,
        error: null
      };
    
    case 'SET_GENERATING':
      return {
        ...state,
        isGenerating: action.payload,
        error: action.payload ? null : state.error
      };
    
    case 'SET_GENERATED_IMAGE': {
      const isArray = Array.isArray(action.payload);
      const images = isArray ? action.payload : [action.payload];
      
      return {
        ...state,
        generatedImage: isArray ? action.payload[0] : action.payload,
        generatedImages: images,
        isGenerating: false,
        error: null,
        generationHistory: [
          ...state.generationHistory,
          ...images.map((image, index) => ({
            id: Date.now() + index,
            image: image,
            style: state.selectedStyle,
            timestamp: new Date().toISOString()
          }))
        ]
      };
    }
    
    case 'SET_CURRENT_GENERATION':
      return {
        ...state,
        currentGeneration: action.payload
      };
    
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isGenerating: false
      };
    
    case 'CLEAR_GENERATION':
      return {
        ...state,
        generatedImage: null,
        generatedImages: [],
        error: null
      };
    
    case 'CLEAR_ALL':
      return {
        ...initialState,
        generationHistory: state.generationHistory
      };
    
    case 'SET_GUIDANCE_SCALE':
      return { ...state, guidanceScale: action.payload };
    
    case 'SET_INFERENCE_STEPS':
      return { ...state, numInferenceSteps: action.payload };
    
    case 'SET_IMAGE_SIZE':
      return { ...state, imageSize: action.payload };
    
    case 'SET_NUM_IMAGES':
      return { ...state, numImages: action.payload };
    
    case 'SET_SAFETY_CHECKER':
      return { ...state, enableSafetyChecker: action.payload };
    
    case 'SET_GENERATION_MODE':
      return { ...state, generationMode: action.payload };
    
    case 'SET_MULTI_IMAGE_MODEL':
      return { ...state, multiImageModel: action.payload };
    
    case 'SET_CONTROL_NET_TYPE':
      return { ...state, controlNetType: action.payload };
    
    case 'SET_CONTROL_NET_IMAGE': {
      const payload = action.payload;
      const imagePayload = payload && typeof payload === 'object' && 'image' in payload 
        ? payload.image 
        : payload as string | null;
      const dimensions = payload && typeof payload === 'object' && 'dimensions' in payload 
        ? payload.dimensions 
        : null;
      return {
        ...state,
        controlNetImage: imagePayload,
        controlNetImageDimensions: dimensions
      };
    }
    
    case 'SET_OPTIMIZE_PROMPT':
      return { ...state, optimizePrompt: action.payload };
    
    case 'SET_PROMPT_OPTIMIZATION_RESULT':
      return { ...state, promptOptimizationResult: action.payload };
    
    default:
      return state;
  }
};

interface ImageGeneratorProviderProps {
  children: ReactNode;
}

export const ImageGeneratorProvider: React.FC<ImageGeneratorProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(imageGeneratorReducer, initialState);

  const selectStyle = (style: VisualStyle | null): void => {
    dispatch({ type: 'SELECT_STYLE', payload: style });
  };

  const setGenerating = (isGenerating: boolean): void => {
    dispatch({ type: 'SET_GENERATING', payload: isGenerating });
  };

  const setGeneratedImage = (image: string | string[]): void => {
    dispatch({ type: 'SET_GENERATED_IMAGE', payload: image });
  };

  const setError = (error: string | null): void => {
    dispatch({ type: 'SET_ERROR', payload: error });
  };

  const clearGeneration = (): void => {
    dispatch({ type: 'CLEAR_GENERATION' });
  };

  const clearAll = (): void => {
    dispatch({ type: 'CLEAR_ALL' });
  };

  const setGuidanceScale = (scale: number): void => {
    dispatch({ type: 'SET_GUIDANCE_SCALE', payload: scale });
  };

  const setInferenceSteps = (steps: number): void => {
    dispatch({ type: 'SET_INFERENCE_STEPS', payload: steps });
  };

  const setImageSize = (size: string): void => {
    dispatch({ type: 'SET_IMAGE_SIZE', payload: size });
  };

  const setNumImages = (num: number): void => {
    dispatch({ type: 'SET_NUM_IMAGES', payload: num });
  };

  const setSafetyChecker = (enabled: boolean): void => {
    dispatch({ type: 'SET_SAFETY_CHECKER', payload: enabled });
  };

  const setGenerationMode = (mode: string): void => {
    dispatch({ type: 'SET_GENERATION_MODE', payload: mode });
  };

  const setMultiImageModel = (model: string | null): void => {
    dispatch({ type: 'SET_MULTI_IMAGE_MODEL', payload: model });
  };

  const setControlNetType = (type: string | null): void => {
    dispatch({ type: 'SET_CONTROL_NET_TYPE', payload: type });
  };

  const setControlNetImage = (image: string | null, dimensions: ImageDimensions | null = null): void => {
    dispatch({ type: 'SET_CONTROL_NET_IMAGE', payload: { image, dimensions } });
  };

  const setCurrentGeneration = (generation: CurrentGeneration | null): void => {
    dispatch({ type: 'SET_CURRENT_GENERATION', payload: generation });
  };

  const setOptimizePrompt = (enabled: boolean): void => {
    dispatch({ type: 'SET_OPTIMIZE_PROMPT', payload: enabled });
  };

  const setPromptOptimizationResult = (result: PromptOptimizationResult | null): void => {
    dispatch({ type: 'SET_PROMPT_OPTIMIZATION_RESULT', payload: result });
  };

  const value: ImageGeneratorContextValue = {
    ...state,
    selectStyle,
    setControlNetImage,
    setControlNetType,
    setGenerating,
    setGeneratedImage,
    setError,
    clearGeneration,
    clearAll,
    setGuidanceScale,
    setInferenceSteps,
    setImageSize,
    setNumImages,
    setSafetyChecker,
    setGenerationMode,
    setMultiImageModel,
    setCurrentGeneration,
    setOptimizePrompt,
    setPromptOptimizationResult
  };

  return (
    <ImageGeneratorContext.Provider value={value}>
      {children}
    </ImageGeneratorContext.Provider>
  );
};

export const useImageGenerator = (): ImageGeneratorContextValue => {
  const context = useContext(ImageGeneratorContext);
  if (!context) {
    throw new Error('useImageGenerator must be used within an ImageGeneratorProvider');
  }
  return context;
};

