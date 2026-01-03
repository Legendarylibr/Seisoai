import React, { useState, useEffect, useRef, memo } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import { WIN95 } from '../utils/buttonStyles';
import logger from '../utils/logger';

const GENERATION_TIMES = { FLUX_PRO: 17.5, FLUX_MULTI: 35, DEFAULT: 17.5 };
const PROGRESS_INTERVAL = 500;
const MAX_PROGRESS = 75;

interface GenerateButtonProps {
  customPrompt?: string;
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

const GenerateButton = memo<GenerateButtonProps>(({ customPrompt = '', onShowTokenPayment }) => {
  const {
    selectedStyle, isGenerating, setGenerating, setGeneratedImage, setError,
    guidanceScale, imageSize, numImages, enableSafetyChecker, generationMode,
    multiImageModel, controlNetImage, controlNetImageDimensions, setCurrentGeneration,
    optimizePrompt, setPromptOptimizationResult
  } = useImageGenerator();
  
  const { isConnected, address, credits, isLoading: walletLoading, isNFTHolder, refreshCredits, setCreditsManually } = useSimpleWallet();
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);

  const [progress, setProgress] = useState<number>(0);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Progress tracking
  useEffect(() => {
    if (!(isGenerating || isLoading) || !generationStartTime) {
      setProgress(0); setTimeRemaining(0); setCurrentStep('');
      return;
    }

    const estimatedTime = generationMode === 'flux-multi' ? GENERATION_TIMES.FLUX_MULTI : GENERATION_TIMES.FLUX_PRO;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - generationStartTime) / 1000;
      const pct = Math.min((elapsed / estimatedTime) * 80, MAX_PROGRESS);
      setProgress(pct);
      setTimeRemaining(Math.max(Math.ceil(estimatedTime - elapsed), 0));
      setCurrentStep(pct < 15 ? 'Initializing...' : pct < 30 ? 'Processing prompt...' : pct < 50 ? 'Generating image...' : pct < 65 ? 'Enhancing details...' : 'Finalizing...');
    }, PROGRESS_INTERVAL);

    return () => clearInterval(interval);
  }, [isGenerating, isLoading, generationStartTime, generationMode]);

  const handleGenerate = async () => {
    if (isGenerating || isLoading) return;
    
    const isAuthenticated = isConnected || isEmailAuth;
    const hasIdentifier = isEmailAuth ? emailContext.userId : address;
    
    if (!isAuthenticated || !hasIdentifier) {
      setError('Please connect your wallet or sign in with email to generate images. New users get 2 credits!');
      return;
    }

    // 20% above cost pricing: Flux Pro = 0.6, Flux 2/Qwen = 0.3, Nano Banana = 1.25 (50% off loss leader)
    const getCreditsForModel = (model: string | undefined): number => {
      if (model === 'flux-2' || model === 'qwen-image-layered') return 0.3;
      if (model === 'nano-banana-pro') return 1.25;
      return 0.6; // flux, flux-multi
    };
    const creditsToDeduct = getCreditsForModel(multiImageModel);
    const currentCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
    const newCredits = Math.max(0, currentCredits - creditsToDeduct);
    
    // Optimistic update
    if (isEmailAuth && emailContext.setCreditsManually) emailContext.setCreditsManually(newCredits);
    else if (setCreditsManually) setCreditsManually(newCredits);

    try {
      setIsLoading(true);
      setGenerating(true);
      setError(null);
      setGenerationStartTime(Date.now());

      const advancedSettings = {
        guidanceScale, imageSize, numImages, enableSafetyChecker, generationMode, multiImageModel,
        walletAddress: isEmailAuth ? undefined : address,
        userId: isEmailAuth ? emailContext.userId : undefined,
        email: isEmailAuth ? emailContext.email : undefined,
        isNFTHolder: isNFTHolder || false,
        referenceImageDimensions: controlNetImageDimensions,
        optimizePrompt
      };

      const trimmedPrompt = (customPrompt || '').trim();
      const imageResult = await generateImage(selectedStyle || null, trimmedPrompt, advancedSettings, controlNetImage);

      if (!imageResult?.images?.length) throw new Error('Invalid response from generation service');
      
      const imageUrls = imageResult.images;
      
      // PERFORMANCE: Preload images immediately for faster display
      imageUrls.forEach((url, i) => {
        const img = new Image();
        img.decoding = 'async';
        img.fetchPriority = i === 0 ? 'high' : 'low';
        img.src = url;
      });
      
      if (imageResult.promptOptimization) setPromptOptimizationResult(imageResult.promptOptimization);
      else setPromptOptimizationResult(null);
      
      // Update credits from response
      if (imageResult.remainingCredits !== undefined) {
        const validatedCredits = Math.max(0, Math.floor(Number(imageResult.remainingCredits) || 0));
        if (isEmailAuth && emailContext.setCreditsManually) emailContext.setCreditsManually(validatedCredits);
        else if (setCreditsManually) setCreditsManually(validatedCredits);
      }
      
      // Refresh credits from backend
      try {
        if (isEmailAuth && emailContext.refreshCredits) await emailContext.refreshCredits();
        else if (refreshCredits && address) await refreshCredits();
      } catch (e) { 
        logger.warn('Failed to refresh credits', { error: e instanceof Error ? e.message : 'Unknown error' }); 
      }

      setError(null);
      setCurrentStep('Complete!');
      setProgress(100);
      
      // Save to gallery (non-blocking)
      const promptForDisplay = trimmedPrompt || (selectedStyle?.prompt || 'No prompt');
      addGeneration(isEmailAuth ? emailContext.userId : address || '', {
        prompt: promptForDisplay,
        style: selectedStyle?.name || 'No Style',
        imageUrl: imageUrls[0],
        creditsUsed: getCreditsForModel(multiImageModel),
        userId: isEmailAuth ? emailContext.userId : undefined,
        email: isEmailAuth ? emailContext.email : undefined
      }).catch(e => logger.debug('Gallery save failed', { error: e instanceof Error ? e.message : 'Unknown error' }));
      
      requestAnimationFrame(() => {
        setGeneratedImage(imageUrls.length > 1 ? imageUrls : imageUrls[0]);
        setIsLoading(false);
        setCurrentGeneration({
          image: imageUrls[0], prompt: promptForDisplay, style: selectedStyle,
          referenceImage: controlNetImage, guidanceScale, imageSize, numImages,
          enableSafetyChecker, generationMode, multiImageModel, timestamp: new Date().toISOString()
        });
      });
    } catch (error) {
      // Refresh credits on error
      try {
        if (isEmailAuth && emailContext.refreshCredits) await emailContext.refreshCredits();
        else if (refreshCredits && address) await refreshCredits();
      } catch (e) { 
        logger.warn('Credit refresh failed', { error: e instanceof Error ? e.message : 'Unknown error' }); 
      }
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Insufficient credits') && onShowTokenPayment) {
        setError('You\'ve used your credits! Please purchase more.');
        onShowTokenPayment();
      } else {
        setError(errorMessage.replace(/password|secret|key|token|api[_-]?key/gi, '[REDACTED]').substring(0, 200) || 'Failed to generate image');
      }
      setProgress(0);
      setCurrentStep('Error occurred');
    } finally {
      setIsLoading(false);
      setGenerating(false);
      setGenerationStartTime(null);
    }
  };

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const isDisabled = isGenerating || walletLoading || (!isConnected && !isEmailAuth);
  // 20% above cost pricing
  const getCreditsNeeded = (model: string | undefined): number => {
    if (model === 'flux-2' || model === 'qwen-image-layered') return 0.3;
    if (model === 'nano-banana-pro') return 1.25;
    return 0.6;
  };
  const creditsNeeded = getCreditsNeeded(multiImageModel);
  const isLayerExtract = multiImageModel === 'qwen-image-layered';
  
  // Determine button text
  const getButtonText = (): string => {
    if (isGenerating) return isLayerExtract ? '⏳ Extracting...' : '⏳ Generating...';
    if (walletLoading) return '⏳ Loading...';
    if (!isConnected && !isEmailAuth) return '🔗 Sign In';
    if (isLayerExtract) return '▶ Generate';
    return '▶ Generate';
  };

  return (
    <div 
      className="w-full"
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
        <span className="text-[10px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {isGenerating ? '⏳ Generating...' : '🎨 Generate'}
        </span>
        <div className="flex-1" />
        <span className="text-[9px] opacity-80">{creditsNeeded} cr</span>
      </div>
      
      {/* Generate button */}
      <div className="p-2">
        <button
          onClick={handleGenerate}
          disabled={isDisabled}
          aria-label={isGenerating ? 'Generating...' : 'Generate AI image'}
          className="w-full py-2.5 text-[12px] font-bold transition-none"
          style={{
            background: isDisabled 
              ? WIN95.buttonFace 
              : 'linear-gradient(180deg, #3d9a3d 0%, #2d8a2d 50%, #1d7a1d 100%)',
            color: isDisabled ? WIN95.textDisabled : '#ffffff',
            border: 'none',
            boxShadow: isDisabled
              ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
              : `inset 1px 1px 0 #5dba5d, inset -1px -1px 0 #0d4a0d, inset 2px 2px 0 #4daa4d, inset -2px -2px 0 #1d6a1d, 2px 2px 0 rgba(0,0,0,0.2)`,
            cursor: isDisabled ? 'default' : 'pointer',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
            textShadow: isDisabled ? 'none' : '1px 1px 0 rgba(0,0,0,0.3)'
          }}
        >
          {getButtonText()}
        </button>
      </div>

      {/* Progress Section */}
      {(isGenerating || isLoading) && (
        <div className="px-2 pb-2">
          <div 
            className="p-2"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
            }}
          >
            {/* Status */}
            <div className="flex justify-between items-center text-[10px] mb-1.5" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent' }} />
                <span className="font-bold" style={{ color: WIN95.text }}>{currentStep}</span>
              </div>
              <span 
                className="font-mono px-1.5 py-0.5" 
                style={{ 
                  color: WIN95.text, 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              >
                {timeRemaining > 0 ? `${timeRemaining}s` : '...'}
              </span>
            </div>
            
            {/* Progress bar - Win95 style with animated stripes */}
            <div 
              className="w-full h-5 overflow-hidden mb-2"
              style={{
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              <div 
                className="h-full transition-all duration-300"
                style={{ 
                  width: `${progress}%`,
                  background: `repeating-linear-gradient(
                    -45deg,
                    #000080 0px,
                    #000080 10px,
                    #1084d0 10px,
                    #1084d0 20px
                  )`,
                  backgroundSize: '28px 100%',
                  animation: 'win95-progress-move 0.5s linear infinite'
                }} 
              />
            </div>
            
            {/* Steps indicator */}
            <div className="flex justify-between">
              {['Init', 'Process', 'Generate', 'Enhance', 'Done'].map((step, i) => {
                const stepProgress = (i + 1) * 20;
                const isCompleted = progress >= stepProgress;
                const isActive = progress >= stepProgress - 10 && progress < stepProgress;
                return (
                  <div key={step} className="flex flex-col items-center gap-0.5">
                    <div 
                      className="w-3 h-3 flex items-center justify-center text-[8px] font-bold"
                      style={{
                        background: isCompleted ? '#008000' : isActive ? '#808000' : WIN95.bg,
                        color: isCompleted || isActive ? '#ffffff' : WIN95.textDisabled,
                        boxShadow: `inset 1px 1px 0 ${isCompleted ? '#00a000' : WIN95.border.light}, inset -1px -1px 0 ${isCompleted ? '#004000' : WIN95.border.darker}`
                      }} 
                    >
                      {isCompleted ? '✓' : i + 1}
                    </div>
                    <span 
                      className="text-[8px]" 
                      style={{ 
                        color: isCompleted ? '#008000' : isActive ? '#808000' : WIN95.textDisabled,
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        fontWeight: isActive ? 'bold' : 'normal'
                      }}
                    >
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

GenerateButton.displayName = 'GenerateButton';

export default GenerateButton;

