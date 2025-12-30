import React, { useState, useEffect, useRef, memo } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import { WIN95 } from '../utils/buttonStyles';
import logger from '../utils/logger.js';

const GENERATION_TIMES = { FLUX_PRO: 17.5, FLUX_MULTI: 35, DEFAULT: 17.5 };
const PROGRESS_INTERVAL = 500;
const MAX_PROGRESS = 75;

const GenerateButton = memo(({ customPrompt = '', onShowTokenPayment }) => {
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

  const [progress, setProgress] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [generationStartTime, setGenerationStartTime] = useState(null);
  const [currentStep, setCurrentStep] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef(null);

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

    const creditsToDeduct = multiImageModel === 'nano-banana-pro' ? 2 : 1;
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
      } catch (e) { logger.warn('Failed to refresh credits', { error: e.message }); }

      setError(null);
      setCurrentStep('Complete!');
      setProgress(100);
      
      // Save to gallery (non-blocking)
      const promptForDisplay = trimmedPrompt || (selectedStyle?.prompt || 'No prompt');
      addGeneration(isEmailAuth ? emailContext.userId : address, {
        prompt: promptForDisplay,
        style: selectedStyle?.name || 'No Style',
        imageUrl: imageUrls[0],
        creditsUsed: multiImageModel === 'nano-banana-pro' ? 2 : 1,
        userId: isEmailAuth ? emailContext.userId : undefined,
        email: isEmailAuth ? emailContext.email : undefined
      }).catch(e => logger.debug('Gallery save failed', { error: e.message }));
      
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
      } catch (e) { logger.warn('Credit refresh failed', { error: e.message }); }
      
      if (error.message?.includes('Insufficient credits') && onShowTokenPayment) {
        setError('You\'ve used your credits! Please purchase more.');
        onShowTokenPayment();
      } else {
        setError(error.message?.replace(/password|secret|key|token|api[_-]?key/gi, '[REDACTED]').substring(0, 200) || 'Failed to generate image');
      }
      setProgress(0);
      setCurrentStep('Error occurred');
    } finally {
      setIsLoading(false);
      setGenerating(false);
      setGenerationStartTime(null);
    }
  };

  useEffect(() => () => timeoutRef.current && clearTimeout(timeoutRef.current), []);

  const isDisabled = isGenerating || walletLoading || (!isConnected && !isEmailAuth);
  const creditsNeeded = multiImageModel === 'nano-banana-pro' ? 2 : 1;
  const isLayerExtract = multiImageModel === 'qwen-image-layered';
  
  // Determine button text
  const getButtonText = () => {
    if (isGenerating) return isLayerExtract ? '⏳ Extracting...' : '⏳ Generating...';
    if (walletLoading) return '⏳ Loading...';
    if (!isConnected && !isEmailAuth) return '🔗 Sign In';
    if (isLayerExtract) return '▶ Generate';
    return '▶ Generate';
  };

  return (
    <div className="w-full space-y-1">
      {/* Generate Section - matching Music/Video style */}
      <div className="flex flex-col gap-1">
        <button
          onClick={handleGenerate}
          disabled={isDisabled}
          aria-label={isGenerating ? 'Generating...' : 'Generate AI image'}
          className="w-full py-2 text-[11px] font-bold transition-none"
          style={{
            background: isDisabled ? WIN95.buttonFace : '#2d8a2d',
            color: isDisabled ? WIN95.textDisabled : '#ffffff',
            border: 'none',
            boxShadow: isDisabled
              ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
              : `inset 1px 1px 0 #4db84d, inset -1px -1px 0 #1a5c1a, inset 2px 2px 0 #3da83d, inset -2px -2px 0 #206b20`,
            cursor: isDisabled ? 'default' : 'pointer',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          {getButtonText()}
        </button>
        <div className="text-[9px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {creditsNeeded} {creditsNeeded === 1 ? 'credit' : 'credits'} per generation
        </div>
      </div>

      {/* Progress Section */}
      {(isGenerating || isLoading) && (
        <div 
          className="p-1.5"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
          }}
        >
          {/* Status */}
          <div className="flex justify-between items-center text-[9px] mb-1" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            <div className="flex items-center gap-1">
              <div 
                className="w-2 h-2 rounded-full animate-pulse" 
                style={{ background: '#008000' }} 
              />
              <span style={{ color: WIN95.text }}>{currentStep}</span>
            </div>
            <span className="font-mono" style={{ color: WIN95.textDisabled }}>
              {timeRemaining > 0 ? `${timeRemaining}s` : '...'}
            </span>
          </div>
          
          {/* Progress bar - Win95 style */}
          <div 
            className="w-full h-4 overflow-hidden"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
            }}
          >
            <div 
              className="h-full transition-all duration-300"
              style={{ 
                width: `${progress}%`,
                background: 'repeating-linear-gradient(90deg, #000080 0px, #000080 8px, #0000a0 8px, #0000a0 16px)'
              }} 
            />
          </div>
          
          {/* Steps */}
          <div className="flex justify-between px-1 mt-1">
            {['Init', 'Process', 'Generate', 'Enhance', 'Finish'].map((step, i) => {
              const stepProgress = (i + 1) * 20;
              const isCompleted = progress >= stepProgress;
              const isActive = progress >= stepProgress - 10;
              return (
                <div key={step} className="flex flex-col items-center gap-0.5">
                  <div 
                    className="w-2 h-2 transition-all"
                    style={{
                      background: isCompleted ? '#008000' : isActive ? '#808000' : WIN95.bgDark,
                      border: `1px solid ${WIN95.border.darker}`
                    }} 
                  />
                  <span 
                    className="text-[7px]" 
                    style={{ 
                      color: isCompleted ? WIN95.text : WIN95.textDisabled,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

export default GenerateButton;
