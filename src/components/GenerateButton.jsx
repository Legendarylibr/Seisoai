import React, { useState, useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import logger from '../utils/logger.js';

const GenerateButton = ({ customPrompt = '', onShowTokenPayment }) => {
  // onShowStripePayment prop removed - Stripe disabled
  const {
    selectedStyle,
    isGenerating,
    setGenerating,
    setGeneratedImage,
    setError,
    guidanceScale,
    imageSize,
    numImages,
    enableSafetyChecker,
    generationMode,
    multiImageModel,
    controlNetImage,
    controlNetImageDimensions,
    setCurrentGeneration
  } = useImageGenerator();
  
  // Generate button initialized

  const {
    isConnected,
    address,
    credits,
    isLoading: walletLoading,
    isNFTHolder,
    refreshCredits,
    setCreditsManually
  } = useSimpleWallet();
  
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  
  // Use credits from email auth if available, otherwise wallet
  const availableCredits = isEmailAuth ? (emailContext.credits || 0) : (credits || 0);

  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [generationStartTime, setGenerationStartTime] = useState(null);
  const [currentStep, setCurrentStep] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Get estimated generation time based on mode - more realistic timing
  const getEstimatedTime = () => {
    switch (generationMode) {
      case 'flux-pro':
        return 17.5; // 17.5 seconds for Flux Pro
      case 'flux-multi':
        return 35; // 35 seconds for multiple images
      default:
        return 17.5;
    }
  };

  // Progress tracking effect with loading steps
  useEffect(() => {
    let interval;
    if ((isGenerating || isLoading) && generationStartTime) {
      const estimatedTime = getEstimatedTime();
      
      interval = setInterval(() => {
        const elapsed = (Date.now() - generationStartTime) / 1000;
        // More conservative progress - slower progression
        const progressPercent = Math.min((elapsed / estimatedTime) * 80, 75); // Cap at 75% until complete
        const remaining = Math.max(estimatedTime - elapsed, 0);
        
        // Update progress and time
        setProgress(progressPercent);
        setTimeRemaining(Math.ceil(remaining));
        
        // Update loading step based on progress - more realistic timing
        if (progressPercent < 15) {
          setCurrentStep('Initializing...');
        } else if (progressPercent < 30) {
          setCurrentStep('Processing prompt...');
        } else if (progressPercent < 50) {
          setCurrentStep('Generating image...');
        } else if (progressPercent < 65) {
          setCurrentStep('Enhancing details...');
        } else if (progressPercent < 75) {
          setCurrentStep('Finalizing...');
        } else {
          setCurrentStep('Almost complete...');
        }
      }, 100);
    } else {
      setProgress(0);
      setTimeRemaining(0);
      setCurrentStep('');
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isGenerating, isLoading, generationStartTime, generationMode]);

  const handleGenerate = async () => {
    // Prevent multiple simultaneous requests
    if (isGenerating || isLoading) {
      logger.warn('Generation already in progress, ignoring duplicate request');
      return;
    }
    
    // Check if authenticated (email or wallet)
    const isAuthenticated = isConnected || isEmailAuth;
    
    // For email users, we can use userId or linked wallet address
    // For wallet users, we need the address
    const hasIdentifier = isEmailAuth 
      ? (emailContext.userId || emailContext.linkedWalletAddress) 
      : address;
    
    // Require authentication to generate (but UI is accessible without auth)
    if (!isAuthenticated || !hasIdentifier) {
      if (isEmailAuth) {
        setError('Please sign in with your email account to generate images. New users get 2 free images!');
      } else {
        setError('Please connect your wallet or sign in with email to generate images. New users get 2 free images!');
      }
      return;
    }

    // Allow generation attempt even with 0 credits - backend will check if user is eligible for free image
    // If they're not eligible (already used free image), backend will return an error
    // We'll catch that error and show payment modal

    // Style is optional - can generate with just prompt and reference image

    try {
      setIsLoading(true);
      setGenerating(true);
      setError(null);
      setGenerationStartTime(Date.now());
      setProgress(0);
      setCurrentStep('Starting generation...');

      const advancedSettings = {
        guidanceScale,
        imageSize,
        numImages,
        enableSafetyChecker,
        generationMode,
        multiImageModel, // Pass model selection for multi-image editing
        walletAddress: isEmailAuth ? undefined : address, // Pass wallet address for wallet users
        userId: isEmailAuth ? emailContext.userId : undefined, // Pass userId for email users
        email: isEmailAuth ? emailContext.email : undefined, // Pass email for email users
        isNFTHolder: isNFTHolder || false, // Pass NFT holder status for routing
        referenceImageDimensions: controlNetImageDimensions // Pass dimensions to maintain resolution
      };

      logger.info('Starting image generation');
      const imageResult = await generateImage(
        selectedStyle || null,
        customPrompt,
        advancedSettings,
        controlNetImage
      );

      // Handle both single image (string) and multiple images (array)
      const isArray = Array.isArray(imageResult);
      const imageUrl = isArray ? imageResult[0] : imageResult;
      
      // Ensure we have a valid image URL or array
      if (!imageResult || (typeof imageResult !== 'string' && !Array.isArray(imageResult))) {
        throw new Error('No image URL returned from generation service');
      }

      logger.info('Image generation completed successfully', { 
        hasImageUrl: !!imageUrl,
        isMultiple: isArray,
        imageCount: isArray ? imageResult.length : 1
      });
      setCurrentStep('Complete!');
      setProgress(100); // Complete the progress bar
      
      // Save generation to backend and deduct credits IMMEDIATELY after image is returned
      // This happens automatically - no manual trigger needed
      // Use wallet address if available, otherwise use userId for email users
      const userIdentifier = isEmailAuth 
        ? (emailContext.linkedWalletAddress || emailContext.userId) 
        : address;
      
      // Calculate credits based on model selection
      const hasImages = !!controlNetImage;
      const isMultipleImages = Array.isArray(controlNetImage) && controlNetImage.length >= 2;
      const isNanoBananaPro = hasImages && multiImageModel === 'nano-banana-pro';
      const isQwen = hasImages && multiImageModel === 'qwen-image-layered';
      const creditsUsed = isNanoBananaPro ? 2 : 1; // 2 credits for Nano Banana Pro ($0.20), 1 for others (FLUX and Qwen)
      
      logger.debug('Saving generation and deducting credits', { 
        userIdentifier, 
        isEmailAuth, 
        currentCredits: availableCredits,
        creditsUsed,
        model: isQwen ? 'qwen-image-layered' : (isNanoBananaPro ? 'nano-banana-pro' : 'flux')
      });
      
      let deductionResult = null;
      try {
        deductionResult = await addGeneration(userIdentifier, {
          prompt: customPrompt || (selectedStyle ? selectedStyle.prompt : 'No style selected'),
          style: selectedStyle ? selectedStyle.name : 'No Style',
          imageUrl,
          creditsUsed: creditsUsed, // Dynamic credits based on model
          userId: isEmailAuth ? emailContext.userId : undefined, // Include userId for email users
          email: isEmailAuth ? emailContext.email : undefined // Include email for email users
        });
        logger.info('Generation saved and credits deducted', {
          success: deductionResult.success,
          remainingCredits: deductionResult.remainingCredits,
          address
        });
        
        // Update UI immediately with the remaining credits from the response
        if (deductionResult.remainingCredits !== undefined && setCreditsManually) {
          logger.debug('Updating UI credits', { remainingCredits: deductionResult.remainingCredits });
          setCreditsManually(deductionResult.remainingCredits);
        }
        
        // Force immediate credit refresh to ensure UI is in sync with backend
        logger.debug('Refreshing credits from backend');
        if (refreshCredits && address) {
          await refreshCredits();
          logger.debug('Credits refreshed in UI from backend');
          logger.info('Credits refreshed after generation', { address });
        } else {
          logger.warn('Cannot refresh credits - missing refreshCredits or address');
        }
      } catch (error) {
        logger.error('Error saving generation', { error: error.message, address });
        setError(`Image generated but failed to save to history. Credits not deducted. Error: ${error.message}`);
        // Still show the image even if saving failed
      }
      
      // Wait a moment to show completion, then set the image and stop loading
      setTimeout(() => {
        // Pass the result (array or string) to setGeneratedImage
        setGeneratedImage(imageResult);
        setIsLoading(false);
        
        // Store current generation details for explain/regenerate functionality
        // Use first image for currentGeneration.image (backward compatibility)
        setCurrentGeneration({
          image: imageUrl,
          prompt: customPrompt || (selectedStyle ? selectedStyle.prompt : 'No style selected'),
          style: selectedStyle,
          referenceImage: controlNetImage,
          guidanceScale,
          imageSize,
          numImages,
          enableSafetyChecker,
          generationMode,
          multiImageModel: multiImageModel, // Store model selection for regeneration
          timestamp: new Date().toISOString()
        });
      }, 1000);
    } catch (error) {
      logger.error('Generation error:', { error: error.message, stack: error.stack });
      const errorMessage = error.message || 'Failed to generate image. Please try again.';
      
      // If error is about insufficient credits and user is authenticated, show payment modal
      if (errorMessage.includes('Insufficient credits') && isAuthenticated && onShowTokenPayment) {
        // User has used their free images and needs to pay
        setError('You\'ve used your free images! Please purchase credits to generate more.');
        onShowTokenPayment();
      } else {
        setError(errorMessage);
      }
      
      setProgress(0);
      setCurrentStep('Error occurred');
    } finally {
      setIsLoading(false);
      setGenerating(false);
      setGenerationStartTime(null);
    }
  };

  const isDisabled = isGenerating || walletLoading || (!isConnected && !isEmailAuth);
  
  const getButtonText = () => {
    if (isGenerating) return 'Generating...';
    if (walletLoading) return 'Loading...';
    if (!isConnected && !isEmailAuth) return 'Sign In to Generate (2 Free Images!)';
    if (availableCredits <= 0) return 'Generate (2 Free Images!)';
    return 'Generate Image';
  };

  const getButtonIcon = () => {
    if (isGenerating) return <span className="text-xs" style={{ color: '#000000' }}>⏳</span>;
    if (walletLoading) return <span className="text-xs animate-pulse" style={{ color: '#000000' }}>⏳</span>;
    if (!isConnected && !isEmailAuth) return <span className="text-xs" style={{ color: '#000000' }}>🔗</span>;
    if (availableCredits <= 0) return <span className="text-xs" style={{ color: '#000000' }}>💳</span>;
    return <span className="text-xs" style={{ color: '#000000' }}>✨</span>;
  };

  return (
    <>
      <div className="w-full flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={isDisabled}
          aria-label={isGenerating ? 'Generating image...' : 'Generate AI image'}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded transition-all duration-200"
          style={isDisabled ? {
            background: 'linear-gradient(to bottom, #c8c8c8, #b0b0b0)',
            border: '2px inset #b8b8b8',
            boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)',
            color: '#666666',
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.5)',
            cursor: 'not-allowed'
          } : (availableCredits <= 0) ? {
            background: 'linear-gradient(to bottom, #ffffcc, #ffffaa, #ffff99)',
            border: '2px outset #ffffbb',
            boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.2), 0 3px 6px rgba(0, 0, 0, 0.2)',
            color: '#000000',
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.9)'
          } : {
            background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
            border: '2px outset #f0f0f0',
            boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)',
            color: '#000000',
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
          }}
          onMouseEnter={(e) => {
            if (!isDisabled && availableCredits > 0) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 4px 8px rgba(0, 0, 0, 0.35)';
            } else if (!isDisabled && availableCredits <= 0) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)';
              e.currentTarget.style.border = '2px outset #ffffcc';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled && availableCredits > 0) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)';
            } else if (!isDisabled && availableCredits <= 0) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #ffffcc, #ffffaa, #ffff99)';
              e.currentTarget.style.border = '2px outset #ffffbb';
              e.currentTarget.style.transform = 'translateY(0)';
            }
          }}
          onMouseDown={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.border = '2px inset #d0d0d0';
              e.currentTarget.style.background = 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)';
              e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
            }
          }}
          onMouseUp={(e) => {
            if (!isDisabled && availableCredits > 0) {
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)';
            } else if (!isDisabled && availableCredits <= 0) {
              e.currentTarget.style.border = '2px outset #ffffbb';
              e.currentTarget.style.background = 'linear-gradient(to bottom, #ffffcc, #ffffaa, #ffff99)';
            }
          }}
        >
          {getButtonIcon()}
          <span>{getButtonText()}</span>
        </button>
      </div>

      {/* Enhanced Progress Bar with Loading Steps */}
      {(isGenerating || isLoading) && (
        <div className="w-full mt-3 space-y-2">
          {/* Progress Header */}
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ 
                background: '#000000',
                boxShadow: '0 0 2px rgba(255, 255, 255, 0.8)',
                animation: 'pulse 1.5s ease-in-out infinite'
              }}></div>
              <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{currentStep}</span>
            </div>
            <span style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
              {timeRemaining > 0 ? `${timeRemaining}s remaining` : 'Almost done...'}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full rounded h-2.5 overflow-hidden relative" style={{
            background: '#d0d0d0',
            border: '2px inset #c0c0c0',
            boxShadow: 'inset 2px 2px 0 rgba(0, 0, 0, 0.2)'
          }}>
            <div 
              className="h-full transition-all duration-500 ease-out relative"
              style={{ 
                width: `${progress}%`,
                background: 'linear-gradient(to bottom, #808080, #606060, #505050)',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.3)'
              }}
            >
              {/* Animated shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" style={{
                animation: 'shimmer 2s ease-in-out infinite'
              }}></div>
            </div>
            {/* Progress percentage */}
            <div className="absolute inset-0 flex items-center justify-center text-xs font-bold" style={{ 
              color: '#000000', 
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}>
              {Math.round(progress)}%
            </div>
          </div>
          
          {/* Loading Steps Indicator */}
          <div className="flex justify-center space-x-1.5">
            {['Init', 'Process', 'Generate', 'Enhance', 'Finish'].map((step, index) => {
              const stepProgress = (index + 1) * 20;
              const isActive = progress >= stepProgress - 10;
              const isCompleted = progress >= stepProgress;
              
              return (
                <div key={step} className="flex flex-col items-center">
                  <div className="w-1.5 h-1.5 rounded-full transition-all duration-300" style={{
                    background: isCompleted ? '#000000' : isActive ? '#000000' : '#c0c0c0',
                    boxShadow: (isCompleted || isActive) ? '0 0 2px rgba(255, 255, 255, 0.8)' : 'none',
                    opacity: isCompleted ? 1 : isActive ? 0.7 : 0.4
                  }}></div>
                  <span className="text-xs mt-0.5 transition-colors duration-300" style={{
                    color: isCompleted ? '#000000' : isActive ? '#1a1a1a' : '#808080',
                    textShadow: (isCompleted || isActive) ? '1px 1px 0 rgba(255, 255, 255, 0.6)' : 'none'
                  }}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Status Message */}
          <div className="text-xs text-center" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
            {generationMode === 'flux-multi' ? 'Creating multiple images...' : 'Creating your masterpiece...'}
          </div>
        </div>
      )}

      {/* Payment Modal */}
    </>
  );
};

export default GenerateButton;
