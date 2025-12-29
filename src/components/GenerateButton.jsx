import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import { BTN, TEXT, pressHandlers } from '../utils/buttonStyles';
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
  const buttonText = isGenerating 
    ? (multiImageModel === 'qwen-image-layered' ? 'Extracting Layers...' : 'Generating...')
    : walletLoading ? 'Loading...'
    : (!isConnected && !isEmailAuth) ? 'Sign In to Generate'
    : (multiImageModel === 'qwen-image-layered' ? 'Extract Layers' : 'Generate Image');

  return (
    <>
      <div className="w-full flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={isDisabled}
          aria-label={isGenerating ? 'Generating...' : 'Generate AI image'}
          className="generate-btn w-full flex items-center justify-center gap-2.5 px-5 py-3.5 font-bold rounded-lg relative overflow-hidden group"
          style={{
            ...(isDisabled ? BTN.disabled : BTN.base),
            minHeight: '52px',
            fontFamily: "'IBM Plex Mono', monospace",
            boxShadow: isDisabled ? BTN.disabled.boxShadow : 'inset 2px 2px 0 rgba(255,255,255,1), inset -2px -2px 0 rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.25)'
          }}
          {...(isDisabled ? {} : pressHandlers)}
        >
          {!isDisabled && <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />}
          <span className="relative z-10">{isGenerating || walletLoading ? '⏳' : (!isConnected && !isEmailAuth) ? '🔗' : '✨'}</span>
          <span className="relative z-10 tracking-wide">{buttonText}</span>
        </button>
      </div>

      {(isGenerating || isLoading) && (
        <div className="w-full mt-3 space-y-2.5 glass-card p-3 rounded-lg">
          <div className="flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{background:'linear-gradient(135deg,#00d4ff,#00b8e6)', boxShadow:'0 0 8px rgba(0,212,255,0.6)'}} />
              <span className="font-medium" style={{...TEXT.primary, fontFamily:"'IBM Plex Mono', monospace"}}>{currentStep}</span>
            </div>
            <span className="font-mono text-xs" style={TEXT.secondary}>{timeRemaining > 0 ? `${timeRemaining}s` : '...'}</span>
          </div>
          
          <div className="w-full rounded-sm h-3 overflow-hidden relative" style={{background:'#d0d0d8', border:'2px inset #b8b8c0'}}>
            <div className="h-full transition-all duration-300" style={{width:`${progress}%`, background:'linear-gradient(90deg,#00d4ff,#00b8e6,#00a0cc)'}} />
            <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{color: progress > 50 ? '#fff' : '#000', fontFamily:"'IBM Plex Mono', monospace"}}>{Math.round(progress)}%</div>
          </div>
          
          <div className="flex justify-between px-1">
            {['Init', 'Process', 'Generate', 'Enhance', 'Finish'].map((step, i) => {
              const stepProgress = (i + 1) * 20;
              const isCompleted = progress >= stepProgress;
              const isActive = progress >= stepProgress - 10;
              return (
                <div key={step} className="flex flex-col items-center gap-1">
                  <div className="w-2 h-2 rounded-full transition-all" style={{
                    background: isCompleted || isActive ? 'linear-gradient(135deg,#00d4ff,#00b8e6)' : '#c0c0c8',
                    opacity: isCompleted ? 1 : isActive ? 0.8 : 0.4,
                    transform: isActive && !isCompleted ? 'scale(1.2)' : 'scale(1)'
                  }} />
                  <span className="text-[9px]" style={{color: isCompleted ? '#000' : isActive ? '#1a1a2e' : '#909090', fontFamily:"'IBM Plex Mono', monospace"}}>{step}</span>
                </div>
              );
            })}
          </div>
          
          <div className="text-[10px] text-center" style={{...TEXT.secondary, fontFamily:"'IBM Plex Mono', monospace"}}>
            {generationMode === 'flux-multi' ? '◆ Creating multiple images...' : '◆ Creating your masterpiece...'}
          </div>
        </div>
      )}
    </>
  );
});

export default GenerateButton;
