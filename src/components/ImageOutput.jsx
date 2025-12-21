import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Zap } from 'lucide-react';
import logger from '../utils/logger.js';

const ImageOutput = () => {
  const { 
    generatedImage, 
    generatedImages,
    isGenerating, 
    error, 
    clearGeneration, 
    clearAll,
    currentGeneration,
    setCurrentGeneration,
    setGenerating,
    setGeneratedImage,
    setError,
    selectedStyle,
    guidanceScale,
    imageSize,
    numImages,
    enableSafetyChecker,
    generationMode,
    controlNetImage,
    multiImageModel
  } = useImageGenerator();

  const { 
    isConnected, 
    address, 
    credits, 
    isNFTHolder,
    refreshCredits,
    setCreditsManually
  } = useSimpleWallet();
  
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(null); // Model selected in modal

  const handleDownload = async (imageUrl = null) => {
    const imageToDownload = imageUrl || generatedImage;
    if (!imageToDownload || isDownloading) return;
    
    setIsDownloading(true);
    
    try {
      const getNextSeisoFilename = () => {
        try {
          const key = 'seiso_download_index';
          const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          const next = current + 1;
          localStorage.setItem(key, String(next));
          return `seiso${next}.png`;
        } catch (_) {
          return `seiso${Date.now()}.png`;
        }
      };
      const filename = getNextSeisoFilename();

      // Fetch the image as a blob to handle CORS issues
      const response = await fetch(imageToDownload);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Detect iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        // iOS Safari requires opening in new tab for download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        // Add to DOM temporarily (required for iOS)
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Trigger download
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(clickEvent);
        
        // Cleanup after a delay for iOS
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
      } else {
        // Standard download for other browsers
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      logger.error('Download failed:', { error: error.message });
      // Fallback to opening image in new tab for iOS
      const link = document.createElement('a');
      link.href = imageToDownload;
      try {
        const key = 'seiso_download_index';
        const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));
        link.download = `seiso${next}.png`;
      } catch (_) {
        link.download = `seiso${Date.now()}.png`;
      }
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloading(false);
    }
  };


  const handleRegenerate = async () => {
    // Prevent multiple simultaneous requests
    if (!currentGeneration || isRegenerating || isGenerating || !isConnected) {
      if (isRegenerating || isGenerating) {
        logger.warn('Generation already in progress, ignoring duplicate request');
      }
      return;
    }
    
    setIsRegenerating(true);
    setError(null);
    
    try {
      setGenerating(true);
      
      // Use the same parameters as the current generation
      const advancedSettings = {
        guidanceScale: currentGeneration.guidanceScale || guidanceScale,
        imageSize: currentGeneration.imageSize || imageSize,
        numImages: currentGeneration.numImages || numImages,
        enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
        generationMode: currentGeneration.generationMode || generationMode,
        walletAddress: isEmailAuth ? undefined : address, // Pass wallet address for wallet users
        userId: isEmailAuth ? emailContext.userId : undefined, // Pass userId for email users
        email: isEmailAuth ? emailContext.email : undefined, // Pass email for email users
        isNFTHolder: isNFTHolder || false
      };
      
      const result = await generateImage(
        currentGeneration.style,
        currentGeneration.prompt || '',
        advancedSettings,
        currentGeneration.referenceImage
      );
      
      // Handle both single image (string) and multiple images (array)
      const isArray = Array.isArray(result);
      const imageUrl = isArray ? result[0] : result;
      setGeneratedImage(result);
      
      // Update current generation with new details
      setCurrentGeneration({
        ...currentGeneration,
        image: imageUrl, // Use first image for backward compatibility
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      logger.error('Regeneration failed:', { error: error.message });
      setError(error.message || 'Failed to regenerate image. Please try again.');
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  };
  
  // Use credits from email auth if available, otherwise wallet
  const availableCredits = isEmailAuth ? (emailContext.credits || 0) : (credits || 0);

  const handleRegenerateWithPrompt = async () => {
    // Prevent multiple simultaneous requests
    if (isRegenerating || isGenerating) {
      logger.warn('Generation already in progress, ignoring duplicate request');
      return;
    }
    
    // Validate prompt first
    const trimmedPrompt = newPrompt.trim();
    if (!trimmedPrompt) {
      setError('Please enter a new prompt');
      return;
    }

    if (trimmedPrompt.length < 3) {
      setError('Prompt must be at least 3 characters long');
      return;
    }

    if (trimmedPrompt.length > 1000) {
      setError('Prompt must be less than 1000 characters');
      return;
    }
    
    // Check if authenticated (email or wallet)
    const isAuthenticated = isConnected || isEmailAuth;
    
    // For email users, we can use userId or linked wallet address
    // For wallet users, we need the address
    const hasIdentifier = isEmailAuth 
      ? (emailContext.userId || emailContext.linkedWalletAddress) 
      : address;
    
    if (!isAuthenticated || !hasIdentifier) {
      if (isEmailAuth) {
        setError('Please sign in with your email account');
      } else {
        setError('Please connect your wallet first');
      }
      return;
    }

    // Check if user has credits based on selected model
    const modelForValidation = selectedModel || multiImageModel || currentGeneration.multiImageModel || 'flux';
    const requiredCredits = modelForValidation === 'nano-banana-pro' ? 2 : 1;
    
    if (availableCredits < requiredCredits) {
      setError(`Insufficient credits. ${modelForValidation === 'nano-banana-pro' ? 'Nano Banana Pro requires 2 credits.' : 'FLUX requires 1 credit.'} You have ${availableCredits} credit${availableCredits !== 1 ? 's' : ''}.`);
      return;
    }

    if (!currentGeneration) {
      setError('No generation found. Please generate an image first.');
      return;
    }
    
    // Ensure we have a reference image
    const referenceImageForGeneration = currentGeneration.referenceImage || 
                                        currentGeneration.image || 
                                        generatedImage;
    
    if (!referenceImageForGeneration) {
      setError('No reference image available. Please generate an image first.');
      return;
    }
    
    setIsRegenerating(true);
    setError(null);
    setShowPromptModal(false);
    
    try {
      setGenerating(true);
      
      const advancedSettings = {
        guidanceScale: currentGeneration.guidanceScale || guidanceScale,
        imageSize: currentGeneration.imageSize || imageSize,
        numImages: currentGeneration.numImages || numImages,
        enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
        generationMode: currentGeneration.generationMode || generationMode,
        multiImageModel: selectedModel || multiImageModel || currentGeneration.multiImageModel, // Use selected model from modal
        walletAddress: isEmailAuth ? undefined : address, // Pass wallet address for wallet users
        userId: isEmailAuth ? emailContext.userId : undefined, // Pass userId for email users
        email: isEmailAuth ? emailContext.email : undefined, // Pass email for email users
        isNFTHolder: isNFTHolder || false,
        referenceImageDimensions: currentGeneration.referenceImageDimensions
      };
      
      logger.debug('Regenerating with new prompt', {
        newPrompt: trimmedPrompt,
        multiImageModel: advancedSettings.multiImageModel,
        hasReferenceImage: !!referenceImageForGeneration
      });
      
      logger.info('Starting regeneration with new prompt');
      
      const result = await generateImage(
        currentGeneration.style,
        trimmedPrompt,
        advancedSettings,
        referenceImageForGeneration // Use current output as reference image
      );
      
      // Handle both single image (string) and multiple images (array)
      const isArray = Array.isArray(result);
      const imageUrl = isArray ? result[0] : result;
      
      // Ensure we have a valid image URL or array
      if (!result || (typeof result !== 'string' && !Array.isArray(result))) {
        throw new Error('No image URL returned from generation service');
      }

      logger.info('Regeneration with new prompt completed successfully', { 
        hasImageUrl: !!imageUrl,
        isMultiple: isArray,
        imageCount: isArray ? result.length : 1
      });
      
      // Save generation to backend and deduct credits IMMEDIATELY after image is returned
      // Use wallet address if available, otherwise use userId for email users
      const userIdentifier = isEmailAuth 
        ? (emailContext.linkedWalletAddress || emailContext.userId) 
        : address;
      
      logger.debug('Saving generation and deducting credits', { 
        userIdentifier, 
        isEmailAuth, 
        currentCredits: availableCredits 
      });
      
      let deductionResult = null;
      try {
        // Handle both single image (string) and multiple images (array)
        const imageUrlForSave = isArray ? result[0] : result;
        
        // Calculate credits based on selected model
        const modelForCredits = selectedModel || multiImageModel || currentGeneration.multiImageModel || 'flux';
        const creditsUsed = modelForCredits === 'nano-banana-pro' ? 2 : 1; // 2 credits for Nano Banana Pro, 1 for Flux
        
        deductionResult = await addGeneration(userIdentifier, {
          prompt: trimmedPrompt,
          style: currentGeneration.style ? currentGeneration.style.name : 'No Style',
          imageUrl: imageUrlForSave, // Use first image if array, or the single image
          creditsUsed: creditsUsed, // Use calculated credits based on model
          userId: isEmailAuth ? emailContext.userId : undefined, // Include userId for email users
          email: isEmailAuth ? emailContext.email : undefined // Include email for email users
        });
        
        logger.debug('Credits calculated for regeneration', {
          selectedModel: modelForCredits,
          creditsUsed,
          remainingCredits: deductionResult.remainingCredits
        });
        logger.info('Generation saved and credits deducted', {
          success: deductionResult.success,
          remainingCredits: deductionResult.remainingCredits,
          userIdentifier,
          isEmailAuth
        });
        
        // Update UI immediately with the remaining credits from the response
        if (deductionResult.remainingCredits !== undefined) {
          if (!isEmailAuth && setCreditsManually) {
            // For wallet users, update credits directly
            setCreditsManually(deductionResult.remainingCredits);
            logger.debug('Updated wallet user credits', { remainingCredits: deductionResult.remainingCredits });
          }
        }
        
        // Force immediate credit refresh to ensure UI is in sync with backend
        logger.debug('Refreshing credits from backend');
        if (isEmailAuth && emailContext.refreshCredits) {
          // For email users, refresh from backend (will update credits automatically)
          await emailContext.refreshCredits();
          logger.debug('Email user credits refreshed from backend', { remainingCredits: deductionResult.remainingCredits });
        } else if (!isEmailAuth && refreshCredits && address) {
          // For wallet users, refresh from backend
          await refreshCredits();
          logger.debug('Wallet user credits refreshed from backend', { remainingCredits: deductionResult.remainingCredits });
        } else {
          logger.warn('Cannot refresh credits - missing refreshCredits function or address', { 
            isEmailAuth, 
            hasRefreshCredits: !!emailContext.refreshCredits || !!refreshCredits,
            hasAddress: !!address 
          });
        }
      } catch (error) {
        logger.error('Error saving generation', { error: error.message, userIdentifier, isEmailAuth });
        setError(`Image generated but failed to save to history. Credits not deducted. Error: ${error.message}`);
        // Still show the image even if saving failed
      }
      
      // Handle both single image (string) and multiple images (array)
      setGeneratedImage(result);
      
      // Update current generation with new details
      const resultImageUrl = isArray ? result[0] : result;
      // Use the NEW result as the reference image for next generation
      const newReferenceImage = isArray ? result[0] : result;
      setCurrentGeneration({
        ...currentGeneration,
        image: resultImageUrl, // Use first image for backward compatibility
        prompt: trimmedPrompt,
        referenceImage: newReferenceImage, // New output becomes reference for next generation
        multiImageModel: selectedModel || multiImageModel || currentGeneration.multiImageModel, // Preserve model selection
        timestamp: new Date().toISOString()
      });
      
      setNewPrompt(''); // Clear the prompt
      
    } catch (error) {
      logger.error('Regeneration with prompt failed:', { error: error.message, stack: error.stack });
      // Provide user-friendly error messages
      let errorMessage = 'Failed to regenerate image. Please try again.';
      if (error.message) {
        const lowerMessage = error.message.toLowerCase();
        if (lowerMessage.includes('invalid') || lowerMessage.includes('input')) {
          errorMessage = 'Invalid prompt. Please check your input and try again.';
        } else if (lowerMessage.includes('credits') || lowerMessage.includes('insufficient')) {
          errorMessage = 'Insufficient credits. Please purchase more credits to continue.';
        } else if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }
      setError(errorMessage);
      // Reopen modal to show error and reinitialize selected model
      const currentModel = multiImageModel || currentGeneration?.multiImageModel || 'flux';
      setSelectedModel(currentModel);
      setShowPromptModal(true);
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  };


  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="glass-card p-8 rounded-2xl text-center slide-up">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="animate-spin w-full h-full border-4 border-purple-500/30 border-t-purple-500 rounded-full"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
            </div>
          </div>
          <p className="text-xl text-white mb-2 font-semibold">Creating your masterpiece...</p>
          <p className="text-sm text-gray-400">This may take a few moments</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="glass-card p-8 rounded-2xl text-center max-w-md slide-up">
          <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-red-500/20 rounded-full">
            <div className="text-4xl">❌</div>
          </div>
          <h4 className="text-xl font-semibold text-red-400 mb-3">Something went wrong</h4>
          <p className="text-gray-300 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={clearGeneration}
              className="btn-secondary px-5 py-2.5"
            >
              Try Again
            </button>
            <button
              onClick={clearAll}
              className="btn-secondary px-5 py-2.5"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get all images to display (use generatedImages array if available, otherwise fallback to single generatedImage)
  const imagesToDisplay = (generatedImages && generatedImages.length > 0) ? generatedImages : (generatedImage ? [generatedImage] : []);
  const hasMultipleImages = imagesToDisplay.length > 1;

  if (imagesToDisplay.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="glass-card p-12 rounded-2xl text-center max-w-md slide-up">
          <div className="w-28 h-28 mx-auto mb-6 opacity-60">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-gray-400">
              <path
                d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                fill="currentColor"
              />
            </svg>
          </div>
          <p className="text-lg text-gray-300 mb-2 font-medium">Your generated image will appear here</p>
          <p className="text-sm text-gray-500">Select a style and click generate to create your image</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-end mb-2 flex-wrap gap-1.5">
        <div className="flex gap-1.5 flex-wrap">
          {hasMultipleImages && (
            <div className="text-xs text-gray-400 px-2 py-1.5 flex items-center gap-1">
              <span>{imagesToDisplay.length} images</span>
            </div>
          )}
          <button
            onClick={() => handleDownload(imagesToDisplay[0])}
            disabled={isDownloading}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs px-2.5 py-1.5 hover:scale-105 transition-all duration-300"
          >
            <span className="text-sm">{isDownloading ? '⏳' : '💾'}</span>
            <span className="hidden sm:inline text-xs">{isDownloading ? 'Downloading...' : 'Download'}</span>
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}
            className="btn-secondary flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs px-2.5 py-1.5 hover:scale-105 transition-all duration-300"
          >
            <span className="text-sm">{isRegenerating ? '⏳' : '🔄'}</span>
            <span className="hidden sm:inline text-xs">{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
          </button>
          <button
            onClick={clearGeneration}
            className="btn-secondary flex items-center gap-1.5 text-xs px-2.5 py-1.5 hover:scale-105 transition-all duration-300"
          >
            <span className="text-sm">🗑️</span>
            <span className="hidden sm:inline text-xs">Clear</span>
          </button>
        </div>
      </div>
      
      {/* Display images in grid for multiple, single image for one */}
      {hasMultipleImages ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          {imagesToDisplay.map((imageUrl, index) => (
            <div key={index} className="glass-card rounded-xl overflow-hidden p-1.5">
              <img
                src={imageUrl}
                alt={`Generated AI image ${index + 1}`}
                className="w-full h-auto max-h-[200px] xs:max-h-[250px] sm:max-h-[300px] md:max-h-[350px] lg:max-h-[400px] object-contain rounded-lg"
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto',
                  display: 'block',
                  margin: '0 auto'
                }}
                loading="lazy"
                onError={(e) => {
                  logger.error('Image failed to load:', { imageUrl });
                  e.target.style.display = 'none';
                }}
                onLoad={() => {
                  logger.debug(`Generated image ${index + 1} loaded successfully`);
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="glass-card rounded-xl overflow-hidden mb-3 p-1.5">
          <img
            src={imagesToDisplay[0]}
            alt="Generated AI image"
            className="w-full h-auto max-h-[200px] xs:max-h-[250px] sm:max-h-[300px] md:max-h-[400px] lg:max-h-[500px] xl:max-h-[600px] object-contain rounded-lg"
            style={{ 
              maxWidth: '100%', 
              height: 'auto',
              display: 'block',
              margin: '0 auto'
            }}
            loading="lazy"
            onError={(e) => {
              logger.error('Image failed to load:', { imageUrl: imagesToDisplay[0] });
              setError('Failed to load image. Please try regenerating.');
              e.target.style.display = 'none';
            }}
            onLoad={() => {
              logger.debug('Generated image loaded successfully');
            }}
          />
        </div>
      )}

      {/* Quick Actions */}
      <div className="glass-card rounded-lg p-2 mb-2">
        <h4 className="text-xs font-semibold text-white mb-1.5 flex items-center gap-1">
          <span className="text-sm">✨</span>
          Quick Actions
        </h4>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => {
              // Initialize selected model to current model when opening modal
              const currentModel = multiImageModel || currentGeneration?.multiImageModel || 'flux';
              setSelectedModel(currentModel);
              setShowPromptModal(true);
            }}
            disabled={isRegenerating || isGenerating || (!isConnected && !isEmailAuth) || !currentGeneration || availableCredits <= 0}
            className="btn-primary flex items-center gap-1.5 text-xs px-2.5 py-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            title={availableCredits <= 0 ? 'Insufficient credits' : 'Regenerate with new prompt'}
          >
            <Sparkles className="w-3 h-3" />
            <span className="text-xs">New Prompt</span>
          </button>
        </div>
      </div>

      {/* Prompt Modal for New Prompt Regeneration */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-2xl p-6 md:p-8 max-w-md w-full mx-4 slide-up">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="text-xl font-semibold text-black">New Prompt Regeneration</h3>
              </div>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setNewPrompt('');
                  setError(null);
                  setSelectedModel(null);
                }}
                className="p-2 rounded-lg hover:bg-gray-200 transition-all duration-300 hover:scale-110"
              >
                <X className="w-5 h-5 text-gray-600 hover:text-black" />
              </button>
            </div>
            <p className="text-gray-700 text-sm mb-4">
              Enter a new prompt to regenerate the image. The current output will be used as the reference image.
            </p>
            {error && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}
            
            {/* Model Selection */}
            <div className="mb-4 p-3 rounded-lg" style={{ 
              background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
              border: '2px outset #e8e8e8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)'
            }}>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                Select Model
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const fluxModel = 'flux'; // Single image regeneration uses flux
                    setSelectedModel(fluxModel);
                    setError(null); // Clear any previous errors
                    logger.debug('Selected FLUX model for regeneration', { fluxModel });
                  }}
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all"
                  style={(selectedModel === 'flux' || selectedModel === 'flux-multi' || (!selectedModel && (multiImageModel === 'flux' || multiImageModel === 'flux-multi' || !multiImageModel))) ? {
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
                    const isSelected = selectedModel === 'flux' || selectedModel === 'flux-multi' || (!selectedModel && (multiImageModel === 'flux' || multiImageModel === 'flux-multi' || !multiImageModel));
                    if (!isSelected) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const isSelected = selectedModel === 'flux' || selectedModel === 'flux-multi' || (!selectedModel && (multiImageModel === 'flux' || multiImageModel === 'flux-multi' || !multiImageModel));
                    if (!isSelected) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                    }
                  }}
                >
                  <Zap className="w-4 h-4" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold">FLUX</span>
                    <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>1 credit</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModel('nano-banana-pro');
                    setError(null); // Clear any previous errors
                    logger.debug('Selected Nano Banana Pro model for regeneration');
                  }}
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all"
                  style={selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro') ? {
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
                    const isSelected = selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro');
                    if (!isSelected) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const isSelected = selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro');
                    if (!isSelected) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                    }
                  }}
                >
                  <Sparkles className="w-4 h-4" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="text-xs font-bold">Nano Banana Pro</span>
                    <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>2 credits</span>
                  </div>
                </button>
              </div>
              <div className="pt-2 mt-2 border-t" style={{ borderColor: '#d0d0d0' }}>
                <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                  {(selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro'))
                    ? '✨ Advanced semantic editing with better quality and reasoning'
                    : '⚡ Fast image editing and generation'}
                </p>
              </div>
            </div>
            
            <textarea
              value={newPrompt}
              onChange={(e) => {
                setNewPrompt(e.target.value);
                setError(null);
              }}
              placeholder="Enter your new prompt here..."
              className="w-full h-32 px-4 py-3 bg-white border-2 border-gray-300 rounded-xl text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-none transition-all duration-300"
            />
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={!newPrompt.trim() || isRegenerating || isGenerating}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegenerating ? 'Generating...' : 'Generate with New Prompt'}
              </button>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setNewPrompt('');
                  setError(null);
                  setSelectedModel(null);
                }}
                className="btn-secondary px-5"
                style={{ color: '#000000', border: '2px outset #e0e0e0', background: 'linear-gradient(to bottom, #f0f0f0 0%, #e0e0e0 50%, #d0d0d0 100%)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default ImageOutput;
