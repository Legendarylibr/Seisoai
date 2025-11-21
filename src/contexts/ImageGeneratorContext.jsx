import React, { createContext, useContext, useReducer } from 'react';

const ImageGeneratorContext = createContext();

const initialState = {
  selectedStyle: null,
  generatedImage: null,
  generatedImages: [], // Array for multiple images
  isGenerating: false,
  error: null,
  generationHistory: [],
  // Current generation details for explain/regenerate
  currentGeneration: null,
  // Advanced settings
  guidanceScale: 7.5,
  imageSize: 'square',
  numImages: 1,
  enableSafetyChecker: false,
  // Generation mode
  generationMode: 'flux-pro', // 'flux-pro', 'flux-multi', 'fast-sdxl'
  // Model selection for image editing (single or multi)
  multiImageModel: null, // 'flux', 'flux-multi', or 'nano-banana-pro' (null = default/auto)
  // ControlNet settings
  controlNetType: null,
  controlNetImage: null,
  controlNetImageDimensions: null, // Store reference image dimensions
  // Batch processing
  batchPrompts: [],
  batchResults: [],
  isBatchProcessing: false
};

const imageGeneratorReducer = (state, action) => {
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
    
    case 'SET_GENERATED_IMAGE':
      // Handle both single image (string) and multiple images (array)
      const isArray = Array.isArray(action.payload);
      const images = isArray ? action.payload : [action.payload];
      
      return {
        ...state,
        generatedImage: isArray ? action.payload[0] : action.payload, // First image for backward compatibility
        generatedImages: images, // All images
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
      return {
        ...state,
        guidanceScale: action.payload
      };
    
    case 'SET_INFERENCE_STEPS':
      return {
        ...state,
        numInferenceSteps: action.payload
      };
    
    case 'SET_IMAGE_SIZE':
      return {
        ...state,
        imageSize: action.payload
      };
    
    
    case 'SET_NUM_IMAGES':
      return {
        ...state,
        numImages: action.payload
      };
    
    case 'SET_SAFETY_CHECKER':
      return {
        ...state,
        enableSafetyChecker: action.payload
      };
    
    case 'SET_GENERATION_MODE':
      return {
        ...state,
        generationMode: action.payload
      };
    
    case 'SET_MULTI_IMAGE_MODEL':
      return {
        ...state,
        multiImageModel: action.payload
      };
    
    case 'SET_BATCH_PROMPTS':
      return {
        ...state,
        batchPrompts: action.payload
      };
    
    case 'SET_BATCH_PROCESSING':
      return {
        ...state,
        isBatchProcessing: action.payload
      };
    
    case 'ADD_BATCH_RESULT':
      return {
        ...state,
        batchResults: [...state.batchResults, action.payload]
      };
    
    case 'CLEAR_BATCH_RESULTS':
      return {
        ...state,
        batchResults: [],
        batchPrompts: []
      };
    
    case 'SET_CONTROL_NET_TYPE':
      return {
        ...state,
        controlNetType: action.payload
      };
    
    case 'SET_CONTROL_NET_IMAGE':
      return {
        ...state,
        controlNetImage: action.payload?.image || action.payload,
        controlNetImageDimensions: action.payload?.dimensions || null
      };
    
    default:
      return state;
  }
};

export const ImageGeneratorProvider = ({ children }) => {
  const [state, dispatch] = useReducer(imageGeneratorReducer, initialState);

  const selectStyle = (style) => {
    dispatch({ type: 'SELECT_STYLE', payload: style });
  };


  const setGenerating = (isGenerating) => {
    dispatch({ type: 'SET_GENERATING', payload: isGenerating });
  };

  const setGeneratedImage = (image) => {
    dispatch({ type: 'SET_GENERATED_IMAGE', payload: image });
  };

  const setError = (error) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  };

  const clearGeneration = () => {
    dispatch({ type: 'CLEAR_GENERATION' });
  };

  const clearAll = () => {
    dispatch({ type: 'CLEAR_ALL' });
  };

  const setGuidanceScale = (scale) => {
    dispatch({ type: 'SET_GUIDANCE_SCALE', payload: scale });
  };

  const setInferenceSteps = (steps) => {
    dispatch({ type: 'SET_INFERENCE_STEPS', payload: steps });
  };

  const setImageSize = (size) => {
    dispatch({ type: 'SET_IMAGE_SIZE', payload: size });
  };

  const setNumImages = (num) => {
    dispatch({ type: 'SET_NUM_IMAGES', payload: num });
  };

  const setSafetyChecker = (enabled) => {
    dispatch({ type: 'SET_SAFETY_CHECKER', payload: enabled });
  };

  const setGenerationMode = (mode) => {
    dispatch({ type: 'SET_GENERATION_MODE', payload: mode });
  };

  const setMultiImageModel = (model) => {
    dispatch({ type: 'SET_MULTI_IMAGE_MODEL', payload: model });
  };

  const setBatchPrompts = (prompts) => {
    dispatch({ type: 'SET_BATCH_PROMPTS', payload: prompts });
  };

  const setBatchProcessing = (processing) => {
    dispatch({ type: 'SET_BATCH_PROCESSING', payload: processing });
  };

  const addBatchResult = (result) => {
    dispatch({ type: 'ADD_BATCH_RESULT', payload: result });
  };

  const clearBatchResults = () => {
    dispatch({ type: 'CLEAR_BATCH_RESULTS' });
  };

  const setControlNetType = (type) => {
    dispatch({ type: 'SET_CONTROL_NET_TYPE', payload: type });
  };

  const setControlNetImage = (image, dimensions = null) => {
    dispatch({ type: 'SET_CONTROL_NET_IMAGE', payload: { image, dimensions } });
  };

  const setCurrentGeneration = (generation) => {
    dispatch({ type: 'SET_CURRENT_GENERATION', payload: generation });
  };

  const value = {
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
    setBatchPrompts,
    setBatchProcessing,
    addBatchResult,
    clearBatchResults,
    setCurrentGeneration
  };

  return (
    <ImageGeneratorContext.Provider value={value}>
      {children}
    </ImageGeneratorContext.Provider>
  );
};

export const useImageGenerator = () => {
  const context = useContext(ImageGeneratorContext);
  if (!context) {
    throw new Error('useImageGenerator must be used within an ImageGeneratorProvider');
  }
  return context;
};
