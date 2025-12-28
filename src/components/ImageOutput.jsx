import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { extractLayers } from '../services/layerExtractionService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Zap, Layers } from 'lucide-react';
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

  // Helper function to strip metadata from image by converting through canvas
  const stripImageMetadata = (imageUrl) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Convert to blob without metadata
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to convert image to blob'));
            }
          }, 'image/png');
        } catch (error) {
          reject(error);
        }
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = imageUrl;
    });
  };

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

      // Strip metadata by converting through canvas
      const cleanBlob = await stripImageMetadata(imageToDownload);
      
      // Create a blob URL from the clean image
      const blobUrl = window.URL.createObjectURL(cleanBlob);
      
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
      // Fallback: try to strip metadata and download
      try {
        const cleanBlob = await stripImageMetadata(imageToDownload);
        const blobUrl = window.URL.createObjectURL(cleanBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        try {
          const key = 'seiso_download_index';
          const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          const next = current + 1;
          localStorage.setItem(key, String(next));
          link.download = `seiso${next}.png`;
        } catch (_) {
          link.download = `seiso${Date.now()}.png`;
        }
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
      } catch (fallbackError) {
        logger.error('Fallback download failed:', { error: fallbackError.message });
      }
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
      
      // Clear any errors since image was successfully generated
      setError(null);
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
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);

  const handleRegenerateWithPrompt = async () => {
    // Prevent multiple simultaneous requests
    if (isRegenerating || isGenerating) {
      logger.warn('Generation already in progress, ignoring duplicate request');
      return;
    }
    
    // Validate prompt first (skip validation for Qwen - it doesn't need a prompt)
    const isQwenModel = selectedModel === 'qwen-image-layered';
    const trimmedPrompt = newPrompt.trim();
    
    if (!isQwenModel) {
      // Only validate prompt for non-Qwen models
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
    }
    
    // Check if authenticated (email or wallet)
    const isAuthenticated = isConnected || isEmailAuth;
    
    // For email users, we can use userId or linked wallet address
    // For wallet users, we need the address
    const hasIdentifier = isEmailAuth 
      ? emailContext.userId 
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
    const requiredCredits = modelForValidation === 'nano-banana-pro' ? 2 : 1; // Qwen also uses 1 credit
    
    if (availableCredits < requiredCredits) {
      let creditMessage = 'FLUX requires 1 credit.';
      if (modelForValidation === 'nano-banana-pro') {
        creditMessage = 'Nano Banana Pro requires 2 credits.';
      } else if (modelForValidation === 'qwen-image-layered') {
        creditMessage = 'Qwen Layer Extraction requires 1 credit.';
      }
      setError(`Insufficient credits. ${creditMessage} You have ${availableCredits} credit${availableCredits !== 1 ? 's' : ''}.`);
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
      
      // Check if Qwen layer extraction is selected
      const isQwenModel = selectedModel === 'qwen-image-layered';
      let result;
      
      if (isQwenModel) {
        // Use layer extraction service for Qwen
        logger.info('Using Qwen Image Layered for layer extraction');
        const layerResult = await extractLayers(referenceImageForGeneration, {
          prompt: trimmedPrompt || undefined,
          num_layers: 4,
          walletAddress: isEmailAuth ? undefined : address,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined
        });
        
        // Return full result object (has images array, remainingCredits, etc.)
        result = layerResult;
        logger.info('Layer extraction completed', { layerCount: layerResult.images?.length || 0 });
      } else {
        // Use regular image generation for FLUX and Nano Banana Pro
        result = await generateImage(
          currentGeneration.style,
          trimmedPrompt,
          advancedSettings,
          referenceImageForGeneration // Use current output as reference image
        );
      }
      
      // Handle result - can be string, array, or object with images property
      let imageUrls;
      if (typeof result === 'string') {
        imageUrls = [result];
      } else if (Array.isArray(result)) {
        imageUrls = result;
      } else if (result && typeof result === 'object' && result.images) {
        // Handle object response format from generateImage: { images, imageUrl, remainingCredits, creditsDeducted }
        imageUrls = Array.isArray(result.images) ? result.images : [result.images];
      } else if (result && typeof result === 'object' && result.imageUrl) {
        // Fallback to imageUrl property
        imageUrls = [result.imageUrl];
      } else {
        throw new Error('No image URL returned from generation service');
      }
      
      // Ensure we have at least one valid image
      if (!imageUrls || imageUrls.length === 0 || !imageUrls[0]) {
        throw new Error('No image URL returned from generation service');
      }
      
      const isArray = imageUrls.length > 1;
      const imageUrl = imageUrls[0];

      logger.info('Regeneration with new prompt completed successfully', { 
        hasImageUrl: !!imageUrl,
        isMultiple: isArray,
        imageCount: imageUrls.length
      });
      
      // Save generation to backend and deduct credits IMMEDIATELY after image is returned
      // Use wallet address if available, otherwise use userId for email users
      const userIdentifier = isEmailAuth 
        ? emailContext.userId 
        : address;
      
      logger.debug('Saving generation and deducting credits', { 
        userIdentifier, 
        isEmailAuth, 
        currentCredits: availableCredits 
      });
      
      let deductionResult = null;
      try {
        // Use first image URL for saving
        const imageUrlForSave = imageUrls[0];
        
        // Calculate credits based on selected model
        const modelForCredits = selectedModel || multiImageModel || currentGeneration.multiImageModel || 'flux';
        const creditsUsed = modelForCredits === 'nano-banana-pro' ? 2 : 1; // 2 credits for Nano Banana Pro, 1 for Flux and Qwen
        
        // Only save non-empty prompts (or use style prompt as fallback)
        const promptForHistory = trimmedPrompt.length > 0 
          ? trimmedPrompt 
          : (currentGeneration.style ? currentGeneration.style.prompt : 'No prompt');
        
        deductionResult = await addGeneration(userIdentifier, {
          prompt: promptForHistory,
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
        
        // Validate and update credits from response
        const validateCredits = (value) => {
          if (value == null) return undefined;
          const num = Number(value);
          if (isNaN(num)) return undefined;
          return Math.max(0, Math.min(Math.floor(num), Number.MAX_SAFE_INTEGER));
        };
        
        // Update UI immediately with validated credits from the response - NO BLOCKING CONDITIONS
        const validatedCredits = validateCredits(deductionResult.remainingCredits);
        if (validatedCredits !== undefined) {
          // Update immediately if function exists, but always refresh afterward to ensure accuracy
          try {
            if (isEmailAuth && emailContext.setCreditsManually) {
              // For email users, update credits directly
              emailContext.setCreditsManually(validatedCredits);
              logger.debug('Updated email user credits immediately', { remainingCredits: validatedCredits });
            } else if (!isEmailAuth && setCreditsManually) {
              // For wallet users, update credits directly
              setCreditsManually(validatedCredits);
              logger.debug('Updated wallet user credits immediately', { remainingCredits: validatedCredits });
            }
          } catch (updateError) {
            logger.warn('Failed to update credits manually, will refresh from backend', { error: updateError.message });
          }
        }
        
        // Always refresh credits from backend to ensure accuracy (even if we updated from response)
        // This handles edge cases where response might be stale or missing
        logger.debug('Refreshing credits from backend to ensure accuracy');
        let refreshSuccess = false;
        let refreshAttempts = 0;
        const maxRefreshAttempts = 3;
        
        while (!refreshSuccess && refreshAttempts < maxRefreshAttempts) {
          try {
            if (isEmailAuth && emailContext.refreshCredits) {
              // For email users, refresh from backend (will update credits automatically)
              await emailContext.refreshCredits();
              refreshSuccess = true;
              logger.debug('Email user credits refreshed from backend');
            } else if (!isEmailAuth && refreshCredits && address) {
              // For wallet users, refresh from backend
              await refreshCredits();
              refreshSuccess = true;
              logger.debug('Wallet user credits refreshed from backend');
            } else {
              // No refresh function available, exit
              logger.warn('Cannot refresh credits - missing refreshCredits function or address', { 
                isEmailAuth, 
                hasRefreshCredits: !!emailContext.refreshCredits || !!refreshCredits,
                hasAddress: !!address 
              });
              break;
            }
          } catch (refreshError) {
            refreshAttempts++;
            if (refreshAttempts >= maxRefreshAttempts) {
              logger.error('Failed to refresh credits after regeneration (max attempts reached)', { 
                error: refreshError.message 
              });
            } else {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 100 * refreshAttempts));
            }
          }
        }
      } catch (error) {
        logger.error('Error saving generation', { error: error.message, userIdentifier, isEmailAuth });
        // Don't set error if image was successfully generated - just log it
        // The image will still be displayed, and credits will be deducted on next refresh
      }
      
      // Clear any errors since image was successfully generated
      setError(null);
      
      // Set generated image - pass array if multiple, otherwise single URL
      setGeneratedImage(isArray ? imageUrls : imageUrls[0]);
      
      // Update current generation with new details
      const resultImageUrl = imageUrls[0];
      // Use the NEW result as the reference image for next generation
      const newReferenceImage = imageUrls[0];
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
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="glass-card p-8 rounded-xl text-center scale-in relative overflow-hidden">
          {/* Shimmer overlay */}
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"></div>
          
          {/* Animated spinner with glow */}
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full" style={{
              background: 'conic-gradient(from 0deg, transparent, #00d4ff, transparent)',
              animation: 'spin 1.5s linear infinite'
            }}></div>
            <div className="absolute inset-1 rounded-full" style={{
              background: 'linear-gradient(135deg, #f0f0f8, #e8e8f0)',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.1)'
            }}></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-7 h-7 animate-pulse" style={{ color: '#00d4ff', filter: 'drop-shadow(0 0 6px rgba(0, 212, 255, 0.6))' }} />
            </div>
          </div>
          
          <p className="text-sm mb-1.5 font-bold tracking-wide" style={{ 
            color: '#000000', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>Creating your masterpiece...</p>
          <p className="text-xs" style={{ 
            color: '#1a1a2e', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>This may take a few moments</p>
          
          {/* Decorative dots */}
          <div className="flex justify-center gap-1.5 mt-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{
                background: '#00d4ff',
                boxShadow: '0 0 4px rgba(0, 212, 255, 0.6)',
                animation: `pulse 1s ease-in-out ${i * 0.2}s infinite`
              }}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Only show error screen if there's an error AND no generated image
  // If there's a generated image, show it even if there's an error (error might be non-critical)
  const hasGeneratedImage = (generatedImages && generatedImages.length > 0) || generatedImage;
  if (error && !hasGeneratedImage) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="glass-card p-6 rounded-lg text-center max-w-md slide-up">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-red-500/20 rounded-full">
            <div className="text-2xl">❌</div>
          </div>
          <h4 className="text-sm font-semibold mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Something went wrong</h4>
          <p className="text-xs mb-4" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>{error}</p>
          <div className="flex gap-2 justify-center">
            <button
              onClick={clearGeneration}
              className="px-3 py-1.5 rounded text-xs transition-all duration-200"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              Try Again
            </button>
            <button
              onClick={clearAll}
              className="px-3 py-1.5 rounded text-xs transition-all duration-200"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Get all images to display (use generatedImages array if available, otherwise fallback to single generatedImage)
  // Handle both single image (string) and multiple images (array)
  let imagesToDisplay = [];
  if (generatedImages && generatedImages.length > 0) {
    imagesToDisplay = generatedImages;
  } else if (generatedImage) {
    // If generatedImage is already an array, use it directly; otherwise wrap in array
    imagesToDisplay = Array.isArray(generatedImage) ? generatedImage : [generatedImage];
  }
  const hasMultipleImages = imagesToDisplay.length > 1;

  if (imagesToDisplay.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="glass-card p-8 rounded-xl text-center max-w-md slide-up relative overflow-hidden">
          {/* Decorative background pattern */}
          <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
            backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 8px)'
          }}></div>
          
          {/* Stylized image placeholder */}
          <div className="w-24 h-24 mx-auto mb-5 relative">
            <div className="absolute inset-0 rounded-lg" style={{
              background: 'linear-gradient(135deg, #e8e8f0, #d8d8e0)',
              border: '2px dashed #b0b0c0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.6)'
            }}></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-12 h-12" style={{ color: '#a0a0b8' }}>
                <path
                  d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                  fill="currentColor"
                />
              </svg>
            </div>
            {/* Corner accents */}
            <div className="absolute -top-1 -left-1 w-3 h-3" style={{
              borderTop: '2px solid #00b8a9',
              borderLeft: '2px solid #00b8a9',
              opacity: 0.6
            }}></div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3" style={{
              borderBottom: '2px solid #f59e0b',
              borderRight: '2px solid #f59e0b',
              opacity: 0.6
            }}></div>
          </div>
          
          <p className="text-sm mb-2 font-semibold tracking-wide" style={{ 
            color: '#000000', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>Your creation awaits</p>
          <p className="text-xs leading-relaxed" style={{ 
            color: '#1a1a2e', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>Enter a prompt and click generate to bring your imagination to life</p>
          
          {/* Subtle hint */}
          <div className="mt-4 flex items-center justify-center gap-1.5 opacity-60">
            <span className="text-[10px]" style={{ color: '#808090' }}>✨</span>
            <span className="text-[10px]" style={{ color: '#808090', fontFamily: "'IBM Plex Mono', monospace" }}>Tip: Be descriptive for best results</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Show error banner if there's both an error and a generated image */}
      {error && hasGeneratedImage && (
        <div className="glass-card rounded-lg p-1 lg:p-1.5 mb-0.5 lg:mb-1 flex items-center justify-between gap-1 lg:gap-1.5 animate-slide-down flex-shrink-0" style={{
          background: 'linear-gradient(to bottom, #ffe0e0, #ffd0d0)',
          border: '2px outset #ffc0c0',
          boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
        }}>
          <div className="flex items-center gap-2 flex-1">
            <div className="text-sm">⚠️</div>
            <p className="text-xs flex-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 rounded hover:bg-red-200 transition-colors flex-shrink-0"
            style={{ color: '#000000' }}
            aria-label="Dismiss error"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      {/* Action Buttons - Better positioned above image */}
      <div className="flex items-center justify-between mb-0.5 lg:mb-1 flex-wrap gap-1 lg:gap-1.5 flex-shrink-0">
        {hasMultipleImages && (
          <div className="text-xs px-2 py-1.5 flex items-center gap-1 rounded" style={{ 
            background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
            border: '2px outset #e8e8e8',
            color: '#000000',
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
          }}>
            <span>{imagesToDisplay.length} images</span>
          </div>
        )}
        <div className="flex gap-2 flex-wrap ml-auto">
          <button
            onClick={() => handleDownload(imagesToDisplay[0])}
            disabled={isDownloading}
            className="flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs px-3 py-2 md:py-1.5 rounded transition-all duration-200 hover:scale-105 touch-manipulation"
            style={{
              minHeight: '44px',
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}
            onMouseEnter={(e) => {
              if (!isDownloading) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
              }
            }}
            onMouseLeave={(e) => {
              if (!isDownloading) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
              }
            }}
          >
            <span className="text-xs">{isDownloading ? '⏳' : '💾'}</span>
            <span className="hidden sm:inline text-xs">{isDownloading ? 'Downloading...' : 'Download'}</span>
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}
            className="flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed text-xs px-3 py-2 md:py-1.5 rounded transition-all duration-200 hover:scale-105 touch-manipulation"
            style={{
              minHeight: '44px',
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}
            onMouseEnter={(e) => {
              if (!(isRegenerating || isGenerating || !isConnected || !currentGeneration)) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
              }
            }}
            onMouseLeave={(e) => {
              if (!(isRegenerating || isGenerating || !isConnected || !currentGeneration)) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
              }
            }}
          >
            <span className="text-xs">{isRegenerating ? '⏳' : '🔄'}</span>
            <span className="hidden sm:inline text-xs">{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
          </button>
          <button
            onClick={clearGeneration}
            className="flex items-center gap-1.5 text-xs px-3 py-2 md:py-1.5 rounded transition-all duration-200 hover:scale-105 touch-manipulation"
            style={{
              minHeight: '44px',
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
            }}
          >
            <span className="text-xs">🗑️</span>
            <span className="hidden sm:inline text-xs">Clear</span>
          </button>
        </div>
      </div>
      
      {/* Display images in grid for multiple, single image for one - Fixed height container */}
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {hasMultipleImages ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 lg:gap-1.5">
            {imagesToDisplay.map((imageUrl, index) => (
              <div key={index} className="glass-card rounded-lg overflow-hidden p-1 lg:p-1.5">
                <img
                  src={imageUrl}
                  alt={`Generated AI image ${index + 1}`}
                  className="w-full h-auto max-h-[200px] sm:max-h-[220px] lg:max-h-[180px] object-contain rounded-lg"
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
          <div className="glass-card rounded-lg overflow-hidden p-1 lg:p-1.5 h-full flex items-center justify-center">
            <img
              src={imagesToDisplay[0]}
              alt="Generated AI image"
              className="max-w-full max-h-full object-contain rounded-lg"
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                display: 'block'
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
      </div>

      {/* Quick Actions - Better positioned below image */}
      <div className="glass-card rounded-lg p-2 mt-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-semibold flex items-center gap-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
            <span className="text-xs">✨</span>
            <span>Quick Actions</span>
          </h4>
          <button
            onClick={() => {
              // Initialize selected model to current model when opening modal
              const currentModel = multiImageModel || currentGeneration?.multiImageModel || 'flux';
              setSelectedModel(currentModel);
              setShowPromptModal(true);
            }}
            disabled={isRegenerating || isGenerating || (!isConnected && !isEmailAuth) || !currentGeneration || availableCredits <= 0}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
            style={(!isRegenerating && !isGenerating && (isConnected || isEmailAuth) && currentGeneration && availableCredits > 0) ? {
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            } : {
              background: 'linear-gradient(to bottom, #c8c8c8, #b0b0b0)',
              border: '2px inset #b8b8b8',
              boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)',
              color: '#666666',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.5)',
              cursor: 'not-allowed'
            }}
            title={availableCredits <= 0 ? 'Insufficient credits' : 'Regenerate with new prompt'}
            onMouseEnter={(e) => {
              if (!isRegenerating && !isGenerating && (isConnected || isEmailAuth) && currentGeneration && availableCredits > 0) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
              }
            }}
            onMouseLeave={(e) => {
              if (!isRegenerating && !isGenerating && (isConnected || isEmailAuth) && currentGeneration && availableCredits > 0) {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
              }
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-xs">New Prompt</span>
          </button>
        </div>
      </div>

      {/* Prompt Modal for New Prompt Regeneration */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
          <div className="glass-card rounded-2xl p-4 sm:p-6 md:p-8 max-w-md w-full mx-2 sm:mx-4 my-4 sm:my-8 max-h-[95vh] flex flex-col slide-up">
            <div className="flex items-center justify-between mb-4 sm:mb-6 flex-shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="p-1.5 sm:p-2 bg-purple-500/20 rounded-lg">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                </div>
                <h3 className="text-lg sm:text-xl font-semibold text-black">New Prompt Regeneration</h3>
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
            <p className="text-gray-700 text-xs sm:text-sm mb-3 sm:mb-4">
              {selectedModel === 'qwen-image-layered' 
                ? 'Extract RGBA layers from the current image. No prompt needed.'
                : 'Enter a new prompt to regenerate the image. The current output will be used as the reference image.'}
            </p>
            {error && (
              <div className="mb-3 sm:mb-4 p-2 sm:p-3 bg-red-100 border border-red-300 rounded-lg">
                <p className="text-red-700 text-xs sm:text-sm">{error}</p>
              </div>
            )}
            
            {/* Model Selection */}
            <div className="mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg flex-shrink-0" style={{ 
              background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
              border: '2px outset #e8e8e8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)'
            }}>
              <label className="block text-xs font-semibold mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                Select Model
              </label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    const fluxModel = 'flux'; // Single image regeneration uses flux
                    setSelectedModel(fluxModel);
                    setError(null); // Clear any previous errors
                    logger.debug('Selected FLUX model for regeneration', { fluxModel });
                  }}
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
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
                    <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Generate or edit</span>
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
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
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
                    <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Edit</span>
                    <span className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>2 credits</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedModel('qwen-image-layered');
                    setError(null); // Clear any previous errors
                    logger.debug('Selected Qwen Image Layered model for regeneration');
                  }}
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
                  style={selectedModel === 'qwen-image-layered' ? {
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
                    const isSelected = selectedModel === 'qwen-image-layered';
                    if (!isSelected) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    const isSelected = selectedModel === 'qwen-image-layered';
                    if (!isSelected) {
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
              <div className="pt-2 mt-2 border-t" style={{ borderColor: '#d0d0d0' }}>
                <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                  {selectedModel === 'qwen-image-layered'
                    ? '🎨 Extract by layer - Extract RGBA layers from the image (returns multiple layers)'
                    : (selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro'))
                    ? '✨ Edit - Advanced semantic editing with better quality and reasoning'
                    : '⚡ Generate and edit - Fast image editing and generation'}
                </p>
              </div>
            </div>
            
            {/* Prompt input - Hidden when Qwen is selected */}
            {selectedModel !== 'qwen-image-layered' && (
              <div className="flex-1 overflow-y-auto min-h-0">
                <textarea
                  value={newPrompt}
                  onChange={(e) => {
                    setNewPrompt(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your new prompt here..."
                  className="w-full h-24 sm:h-32 px-3 sm:px-4 py-2 sm:py-3 resize-none transition-all duration-300 text-sm sm:text-base"
                  style={{
                    background: '#ffffff',
                    border: '2px inset #c0c0c0',
                    color: '#000000',
                    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.15), inset -1px -1px 0 rgba(255, 255, 255, 0.5)'
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '2px inset #808080';
                    e.target.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.3)';
                    e.target.style.background = '#fffffe';
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '2px inset #c0c0c0';
                    e.target.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.15), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                    e.target.style.background = '#ffffff';
                  }}
                />
              </div>
            )}
            <div className="flex gap-2 sm:gap-3 mt-4 sm:mt-6 flex-shrink-0">
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={(!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating}
                className="flex-1 text-sm sm:text-base py-2 sm:py-3 rounded transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={(!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating ? {
                  background: 'linear-gradient(to bottom, #c8c8c8, #b0b0b0)',
                  border: '2px inset #b8b8b8',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)',
                  color: '#666666',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.5)',
                  cursor: 'not-allowed'
                } : {
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                onMouseEnter={(e) => {
                  if (!((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)) {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                    e.currentTarget.style.border = '2px outset #f8f8f8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)) {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                  }
                }}
                onMouseDown={(e) => {
                  if (!((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)) {
                    e.currentTarget.style.border = '2px inset #d0d0d0';
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)';
                    e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                  }
                }}
                onMouseUp={(e) => {
                  if (!((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)) {
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)';
                  }
                }}
              >
                {isRegenerating ? 'Generating...' : selectedModel === 'qwen-image-layered' ? 'Extract Layers' : 'Generate with New Prompt'}
              </button>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setNewPrompt('');
                  setError(null);
                  setSelectedModel(null);
                }}
                className="px-3 sm:px-5 text-sm sm:text-base py-2 sm:py-3 rounded transition-all duration-200"
                style={{ 
                  color: '#000000', 
                  border: '2px outset #f0f0f0', 
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                  e.currentTarget.style.border = '2px outset #f8f8f8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                  e.currentTarget.style.border = '2px outset #f0f0f0';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.border = '2px inset #c0c0c0';
                  e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.border = '2px outset #f0f0f0';
                  e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                }}
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
