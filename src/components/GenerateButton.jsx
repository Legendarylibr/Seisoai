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

    // Check if user has credits (use available credits which considers both fields)
    if (availableCredits <= 0) {
      if (onShowTokenPayment) {
        onShowTokenPayment();
      }
      return;
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
        walletAddress: address, // Pass wallet address for safety logging
        isNFTHolder: isNFTHolder || false, // Pass NFT holder status for routing
        referenceImageDimensions: controlNetImageDimensions // Pass dimensions to maintain resolution
      };

      logger.info('Starting image generation');
      const imageUrl = await generateImage(
        selectedStyle || null,
        customPrompt,
        advancedSettings,
        controlNetImage
      );

      // Ensure we have a valid image URL
      if (!imageUrl || typeof imageUrl !== 'string') {
        throw new Error('No image URL returned from generation service');
      }

      logger.info('Image generation completed successfully', { hasImageUrl: !!imageUrl });
      setCurrentStep('Complete!');
      setProgress(100); // Complete the progress bar
      
      // Save generation to backend and deduct credits IMMEDIATELY after image is returned
      // This happens automatically - no manual trigger needed
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
        deductionResult = await addGeneration(userIdentifier, {
          prompt: customPrompt || (selectedStyle ? selectedStyle.prompt : 'No style selected'),
          style: selectedStyle ? selectedStyle.name : 'No Style',
          imageUrl,
          creditsUsed: 1, // 1 credit per generation
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
        setGeneratedImage(imageUrl);
        setIsLoading(false);
        
        // Store current generation details for explain/regenerate functionality
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
          timestamp: new Date().toISOString()
        });
      }, 1000);
    } catch (error) {
      console.error('Generation error:', error);
      setError(error.message || 'Failed to generate image. Please try again.');
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
    if (!isConnected && !isEmailAuth) return 'Connect Wallet or Sign In First';
    if (availableCredits <= 0) return 'Buy Credits to Generate';
    return 'Generate Image';
  };

  const getButtonIcon = () => {
    if (isGenerating) return <div className="w-4 h-4 animate-spin text-lg">⏳</div>;
    if (walletLoading) return <div className="w-4 h-4 animate-pulse text-lg">⏳</div>;
    if (!isConnected && !isEmailAuth) return <div className="w-4 h-4 text-lg">🔗</div>;
    if (availableCredits <= 0) return <div className="w-4 h-4 text-lg">💳</div>;
    return <div className="w-4 h-4 text-lg">✨</div>;
  };

  return (
    <>
      <div className="w-full flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={isDisabled}
          aria-label={isGenerating ? 'Generating image...' : 'Generate AI image'}
          className={`
            w-full flex items-center justify-center gap-2 px-6 py-3 text-base font-semibold rounded-lg
            transition-all duration-300 transform
            ${isDisabled 
              ? 'opacity-50 cursor-not-allowed bg-gray-600 text-gray-400' 
              : (availableCredits <= 0)
                ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-400 hover:to-orange-400 hover:shadow-xl hover:shadow-yellow-500/30 hover:scale-105'
                : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-400 hover:to-pink-400 hover:shadow-xl hover:shadow-purple-500/30 hover:scale-105'
            }
            border border-white/20
          `}
        >
          {getButtonIcon()}
          <span>{getButtonText()}</span>
        </button>
      </div>

      {/* Enhanced Progress Bar with Loading Steps */}
      {(isGenerating || isLoading) && (
        <div className="w-full mt-4 space-y-3">
          {/* Progress Header */}
          <div className="flex justify-between items-center text-sm">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
              <span className="text-gray-300">{currentStep}</span>
            </div>
            <span className="text-gray-400">
              {timeRemaining > 0 ? `${timeRemaining}s remaining` : 'Almost done...'}
            </span>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden relative">
            <div 
              className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              {/* Animated shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
            </div>
            {/* Progress percentage */}
            <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">
              {Math.round(progress)}%
            </div>
          </div>
          
          {/* Loading Steps Indicator */}
          <div className="flex justify-center space-x-2">
            {['Initializing', 'Processing', 'Generating', 'Enhancing', 'Finalizing'].map((step, index) => {
              const stepProgress = (index + 1) * 20;
              const isActive = progress >= stepProgress - 10;
              const isCompleted = progress >= stepProgress;
              
              return (
                <div key={step} className="flex flex-col items-center">
                  <div className={`
                    w-2 h-2 rounded-full transition-all duration-300
                    ${isCompleted ? 'bg-green-400' : isActive ? 'bg-purple-400 animate-pulse' : 'bg-gray-600'}
                  `}></div>
                  <span className={`text-xs mt-1 transition-colors duration-300 ${
                    isCompleted ? 'text-green-400' : isActive ? 'text-purple-400' : 'text-gray-500'
                  }`}>
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
          
          {/* Status Message */}
          <div className="text-xs text-gray-400 text-center">
            {generationMode === 'flux-multi' ? 'Creating multiple images...' : 'Creating your masterpiece...'}
          </div>
        </div>
      )}

      {/* Payment Modal */}
    </>
  );
};

export default GenerateButton;
