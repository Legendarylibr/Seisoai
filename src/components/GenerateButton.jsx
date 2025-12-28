import React, { useState, useEffect, useRef } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import logger from '../utils/logger.js';

// Constants for generation timing
const GENERATION_TIMES = {
  FLUX_PRO: 17.5,
  FLUX_MULTI: 35,
  DEFAULT: 17.5
};

// Constants for progress tracking
const PROGRESS_CONFIG = {
  INTERVAL_MS: 200, // Reduced from 100ms to 200ms for better performance
  COMPLETION_DELAY_MS: 0, // Removed artificial delay - show image immediately
  MAX_PROGRESS_PERCENT: 75,
  PROGRESS_MULTIPLIER: 80
};

// Helper function to sanitize error messages
const sanitizeError = (error) => {
  const message = error?.message || 'An unknown error occurred';
  // Remove potential sensitive information and limit length
  return message
    .replace(/password|secret|key|token|api[_-]?key/gi, '[REDACTED]')
    .substring(0, 200);
};

// Helper function to get prompt for display
const getPromptForDisplay = (trimmedPrompt, selectedStyle) => {
  return trimmedPrompt.length > 0 
    ? trimmedPrompt 
    : (selectedStyle ? selectedStyle.prompt : 'No prompt');
};

const GenerateButton = ({ customPrompt = '', onShowTokenPayment }) => {
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
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);

  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [generationStartTime, setGenerationStartTime] = useState(null);
  const [currentStep, setCurrentStep] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef(null);

  // Progress tracking effect with loading steps
  useEffect(() => {
    let interval = null;
    
    if ((isGenerating || isLoading) && generationStartTime) {
      // Get estimated generation time based on mode - moved inside effect to fix dependency
      const getEstimatedTime = () => {
        switch (generationMode) {
          case 'flux-pro':
            return GENERATION_TIMES.FLUX_PRO;
          case 'flux-multi':
            return GENERATION_TIMES.FLUX_MULTI;
          default:
            return GENERATION_TIMES.DEFAULT;
        }
      };
      
      const estimatedTime = getEstimatedTime();
      
      interval = setInterval(() => {
        const elapsed = (Date.now() - generationStartTime) / 1000;
        // More conservative progress - slower progression
        const progressPercent = Math.min(
          (elapsed / estimatedTime) * PROGRESS_CONFIG.PROGRESS_MULTIPLIER, 
          PROGRESS_CONFIG.MAX_PROGRESS_PERCENT
        );
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
        } else if (progressPercent < PROGRESS_CONFIG.MAX_PROGRESS_PERCENT) {
          setCurrentStep('Finalizing...');
        } else {
          setCurrentStep('Almost complete...');
        }
      }, PROGRESS_CONFIG.INTERVAL_MS);
    } else {
      setProgress(0);
      setTimeRemaining(0);
      setCurrentStep('');
    }
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
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
    
    // For email users, use userId
    // For wallet users, use address
    const hasIdentifier = isEmailAuth 
      ? emailContext.userId 
      : address;
    
    // Require authentication to generate (but UI is accessible without auth)
    if (!isAuthenticated || !hasIdentifier) {
      if (isEmailAuth) {
        setError('Please sign in with your email account to generate images. New users get 2 credits!');
      } else {
        setError('Please connect your wallet or sign in with email to generate images. New users get 2 credits!');
      }
      return;
    }

    // Calculate credits that will be deducted
    const creditsToDeduct = multiImageModel === 'nano-banana-pro' ? 2 : 1;
    
    // Optimistically update UI for instant feedback
    const currentCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
    const newCredits = Math.max(0, currentCredits - creditsToDeduct);
    
    if (isEmailAuth && emailContext.setCreditsManually) {
      emailContext.setCreditsManually(newCredits);
    } else if (!isEmailAuth && setCreditsManually) {
      setCreditsManually(newCredits);
    }

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
      
      // Trim and validate prompt - only send if user actually entered something
      // Empty or whitespace-only prompts should be treated as empty
      const trimmedPrompt = customPrompt && typeof customPrompt === 'string' 
        ? customPrompt.trim() 
        : '';
      
      const imageResult = await generateImage(
        selectedStyle || null,
        trimmedPrompt,
        advancedSettings,
        controlNetImage
      );

      // Extract images and credits from response (always returns object with images array)
      if (!imageResult || typeof imageResult !== 'object' || !Array.isArray(imageResult.images)) {
        throw new Error('Invalid response format from generation service');
      }
      
      const imageUrls = imageResult.images;
      const imageUrl = imageUrls[0];
      
      // Update credits from response immediately (backend already returns remainingCredits)
      if (imageResult.remainingCredits !== undefined) {
        if (isEmailAuth && emailContext.setCreditsManually) {
          emailContext.setCreditsManually(imageResult.remainingCredits);
        } else if (!isEmailAuth && setCreditsManually) {
          setCreditsManually(imageResult.remainingCredits);
        }
      }

      setError(null);
      setCurrentStep('Complete!');
      setProgress(100);
      
      // Save generation to history (non-blocking - fire and forget)
      const userIdentifier = isEmailAuth 
        ? emailContext.userId 
        : address;
      const creditsUsed = multiImageModel === 'nano-banana-pro' ? 2 : 1;
      
      // Don't await - let it run in background
      addGeneration(userIdentifier, {
        prompt: getPromptForDisplay(trimmedPrompt, selectedStyle),
        style: selectedStyle ? selectedStyle.name : 'No Style',
        imageUrl,
        creditsUsed,
        userId: isEmailAuth ? emailContext.userId : undefined,
        email: isEmailAuth ? emailContext.email : undefined
      }).catch(error => {
        // Silently fail - image was already generated successfully
        logger.debug('Failed to save generation to history', { error: error.message });
      });
      
      // Show image immediately (no artificial delay)
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      // Use requestAnimationFrame for immediate UI update
      requestAnimationFrame(() => {
        setGeneratedImage(imageUrls.length > 1 ? imageUrls : imageUrl);
        setIsLoading(false);
        
        setCurrentGeneration({
          image: imageUrl,
          prompt: getPromptForDisplay(trimmedPrompt, selectedStyle),
          style: selectedStyle,
          referenceImage: controlNetImage,
          guidanceScale,
          imageSize,
          numImages,
          enableSafetyChecker,
          generationMode,
          multiImageModel,
          timestamp: new Date().toISOString()
        });
      });
      } catch (error) {
        const errorMessage = error.message || 'Failed to generate image. Please try again.';
      
        // Refresh credits after error
        try {
          if (isEmailAuth && emailContext.refreshCredits) {
            await emailContext.refreshCredits();
          } else if (!isEmailAuth && refreshCredits && address) {
            await refreshCredits();
          }
        } catch (refreshError) {
          // Ignore refresh errors
        }
      
        // Show payment modal if insufficient credits
        if (errorMessage.includes('Insufficient credits') && isAuthenticated && onShowTokenPayment) {
          setError('You\'ve used your credits! Please purchase more credits to generate more.');
          onShowTokenPayment();
        } else {
          setError(sanitizeError(error));
        }
      
        setProgress(0);
        setCurrentStep('Error occurred');
      } finally {
        setIsLoading(false);
        setGenerating(false);
        setGenerationStartTime(null);
      }
    };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const isDisabled = isGenerating || walletLoading || (!isConnected && !isEmailAuth);
  
  // Button text and icon
  const buttonText = isGenerating 
    ? (multiImageModel === 'qwen-image-layered' ? 'Extracting Layers...' : 'Generating...')
    : walletLoading 
    ? 'Loading...'
    : (!isConnected && !isEmailAuth)
    ? 'Sign In to Generate'
    : (multiImageModel === 'qwen-image-layered' ? 'Extract Layers' : 'Generate Image');
  
  const buttonIcon = isGenerating || walletLoading 
    ? <span className="text-xs" style={{ color: '#000000' }}>⏳</span>
    : (!isConnected && !isEmailAuth)
    ? <span className="text-xs" style={{ color: '#000000' }}>🔗</span>
    : <span className="text-xs" style={{ color: '#000000' }}>✨</span>;

  // Button styles
  const disabledButtonStyles = {
    background: 'linear-gradient(to bottom, #c8c8c8, #b0b0b0)',
    border: '2px inset #b8b8b8',
    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)',
    color: '#666666',
    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.5)',
    cursor: 'not-allowed'
  };

  const enabledButtonStyles = {
    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
    border: '2px outset #f0f0f0',
    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)',
    color: '#000000',
    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
  };

  return (
    <>
      <div className="w-full flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={isDisabled}
          aria-label={isGenerating ? 'Generating image...' : 'Generate AI image'}
          aria-busy={isGenerating || isLoading}
          aria-live="polite"
          role="button"
          className="w-full flex items-center justify-center gap-2 px-4 py-3 md:py-2 text-xs font-bold rounded-lg transition-all duration-200 touch-manipulation"
          style={isDisabled ? { ...disabledButtonStyles, minHeight: '48px' } : {
            ...enabledButtonStyles,
            minHeight: '48px',
            fontSize: '14px',
            fontWeight: 'bold',
            boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)'
          }}
          onMouseEnter={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
              e.currentTarget.style.transform = 'translateY(-2px) scale(1.02)';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 6px 12px rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDisabled) {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.transform = 'translateY(0) scale(1)';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)';
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
            if (!isDisabled) {
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 3px 6px rgba(0, 0, 0, 0.3)';
            }
          }}
        >
          {buttonIcon}
          <span>{buttonText}</span>
        </button>
      </div>

      {/* Enhanced Progress Bar with Loading Steps */}
      {(isGenerating || isLoading) && (
        <div className="w-full mt-2 space-y-2">
          {/* Progress Header */}
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ 
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
          <div className="flex justify-center gap-2">
            {['Init', 'Process', 'Generate', 'Enhance', 'Finish'].map((step, index) => {
              const stepProgress = (index + 1) * 20;
              const isActive = progress >= stepProgress - 10;
              const isCompleted = progress >= stepProgress;
              
              return (
                <div key={step} className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full transition-all duration-300" style={{
                    background: isCompleted ? '#000000' : isActive ? '#000000' : '#c0c0c0',
                    boxShadow: (isCompleted || isActive) ? '0 0 2px rgba(255, 255, 255, 0.8)' : 'none',
                    opacity: isCompleted ? 1 : isActive ? 0.7 : 0.4
                  }}></div>
                  <span className="text-xs mt-1 transition-colors duration-300" style={{
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
    </>
  );
};

export default GenerateButton;
