import React, { useState, useEffect, memo, useCallback } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { extractLayers } from '../services/layerExtractionService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Zap, Layers, Brain, Wand2, Download, RotateCcw, Trash2 } from 'lucide-react';
import { BTN, TEXT, hoverHandlers, pressHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger.js';
import { stripImageMetadata } from '../utils/imageOptimizer.js';

// PERFORMANCE: Memoized presentational components
const ActionButton = memo(({ children, onClick, disabled, className = '', variant = 'default', ...props }) => {
  const variants = {
    default: BTN.base,
    primary: {
      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      border: '2px solid #047857',
      color: '#fff',
      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
    },
    danger: {
      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
      border: '2px solid #b91c1c',
      color: '#fff',
      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)'
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 text-xs px-3 py-2 md:py-1.5 rounded-lg transition-all hover:scale-105 hover:brightness-110 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${className}`}
      style={{ minHeight: '44px', ...(disabled ? BTN.disabled : variants[variant]) }}
      {...(disabled ? {} : hoverHandlers)}
      {...props}
    >
      {children}
    </button>
  );
});

const ModelButton = memo(({ selected, onClick, icon: Icon, name, desc, credits }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex-1 flex flex-col items-center justify-center gap-1.5 px-3 py-3 rounded-xl transition-all min-w-[90px] hover:scale-[1.02]"
    style={selected ? {
      background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
      border: '2px solid #6d28d9',
      color: '#fff',
      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
    } : {
      background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
      border: '2px solid #cbd5e1',
      color: '#334155',
      boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
    }}
  >
    <Icon className="w-5 h-5" style={{ color: selected ? '#fff' : '#6366f1' }} />
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs font-bold">{name}</span>
      <span className="text-[10px] opacity-80">{desc}</span>
      <span className="text-[10px] font-medium opacity-70">{credits}</span>
    </div>
  </button>
));

const ImageOutput = () => {
  const { 
    generatedImage, generatedImages, isGenerating, error, clearGeneration, clearAll,
    currentGeneration, setCurrentGeneration, setGenerating, setGeneratedImage, setError,
    selectedStyle, guidanceScale, imageSize, numImages, enableSafetyChecker,
    generationMode, controlNetImage, multiImageModel,
    optimizePrompt, setOptimizePrompt
  } = useImageGenerator();

  const { isConnected, address, credits, isNFTHolder, refreshCredits, setCreditsManually } = useSimpleWallet();
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [modalOptimizePrompt, setModalOptimizePrompt] = useState(optimizePrompt);

  // Get images to display - moved BEFORE any conditional returns to avoid hooks ordering issues
  let imagesToDisplay = [];
  if (generatedImages?.length > 0) imagesToDisplay = generatedImages;
  else if (generatedImage) imagesToDisplay = Array.isArray(generatedImage) ? generatedImage : [generatedImage];
  const hasMultipleImages = imagesToDisplay.length > 1;
  const hasImage = imagesToDisplay.length > 0;

  // PERFORMANCE: Preload images as soon as URLs are available - MUST be before conditional returns
  useEffect(() => {
    if (imagesToDisplay.length > 0) {
      imagesToDisplay.forEach((url, i) => {
        if (url && typeof url === 'string') {
          const img = new Image();
          img.decoding = 'async';
          img.fetchPriority = i === 0 ? 'high' : 'low';
          img.src = url;
        }
      });
    }
  }, [generatedImage, generatedImages]);

  // Sync modal optimize prompt with global state
  useEffect(() => {
    setModalOptimizePrompt(optimizePrompt);
  }, [optimizePrompt]);

  // Strip metadata from image using utility function
  const stripImageMetadataLocal = useCallback((imageUrl) => stripImageMetadata(imageUrl, { format: 'png' }), []);

  const handleDownload = useCallback(async (imageUrl = null) => {
    const img = imageUrl || generatedImage;
    if (!img || isDownloading) return;
    setIsDownloading(true);
    
    try {
      const key = 'seiso_download_index';
      const idx = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
      localStorage.setItem(key, String(idx));
      const filename = `seiso${idx}.png`;
      
      const blob = await stripImageMetadataLocal(img);
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      logger.error('Download failed', { error: e.message });
    } finally {
      setIsDownloading(false);
    }
  }, [generatedImage, isDownloading, stripImageMetadataLocal]);

  const handleRegenerate = useCallback(async () => {
    if (!currentGeneration || isRegenerating || isGenerating || !isConnected) return;
    
    setIsRegenerating(true);
    setError(null);
    
    try {
      setGenerating(true);
      const result = await generateImage(
        currentGeneration.style,
        currentGeneration.prompt || '',
        {
          guidanceScale: currentGeneration.guidanceScale || guidanceScale,
          imageSize: currentGeneration.imageSize || imageSize,
          numImages: currentGeneration.numImages || numImages,
          enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
          generationMode: currentGeneration.generationMode || generationMode,
          walletAddress: isEmailAuth ? undefined : address,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined,
          isNFTHolder: isNFTHolder || false
        },
        currentGeneration.referenceImage
      );
      
      const imageUrl = Array.isArray(result) ? result[0] : result;
      setError(null);
      setGeneratedImage(result);
      setCurrentGeneration({ ...currentGeneration, image: imageUrl, timestamp: new Date().toISOString() });
    } catch (e) {
      logger.error('Regeneration failed', { error: e.message });
      setError(e.message || 'Failed to regenerate');
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  }, [currentGeneration, isRegenerating, isGenerating, isConnected, guidanceScale, imageSize, numImages, enableSafetyChecker, generationMode, isEmailAuth, address, emailContext, isNFTHolder, setGenerating, setGeneratedImage, setCurrentGeneration, setError]);

  const handleRegenerateWithPrompt = useCallback(async () => {
    if (isRegenerating || isGenerating) return;
    
    const isQwen = selectedModel === 'qwen-image-layered';
    const trimmedPrompt = newPrompt.trim();
    
    if (!isQwen && (!trimmedPrompt || trimmedPrompt.length < 3)) {
      setError(trimmedPrompt ? 'Prompt must be at least 3 characters' : 'Please enter a prompt');
      return;
    }
    
    const isAuthenticated = isConnected || isEmailAuth;
    if (!isAuthenticated || !(isEmailAuth ? emailContext.userId : address)) {
      setError('Please sign in first');
      return;
    }

    const modelForCredits = selectedModel || multiImageModel || 'flux';
    const requiredCredits = modelForCredits === 'nano-banana-pro' ? 2 : 1;
    if (availableCredits < requiredCredits) {
      setError(`Insufficient credits. Need ${requiredCredits}, have ${availableCredits}.`);
      return;
    }

    const refImage = currentGeneration?.referenceImage || currentGeneration?.image || generatedImage;
    if (!refImage) {
      setError('No reference image available');
      return;
    }
    
    setIsRegenerating(true);
    setError(null);
    setShowPromptModal(false);
    
    // Update global optimize prompt setting
    setOptimizePrompt(modalOptimizePrompt);
    
    try {
      setGenerating(true);
      
      let result;
      if (isQwen) {
        result = await extractLayers(refImage, {
          prompt: trimmedPrompt || undefined,
          num_layers: 4,
          walletAddress: isEmailAuth ? undefined : address,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined
        });
      } else {
        result = await generateImage(
          currentGeneration?.style,
          trimmedPrompt,
          {
            guidanceScale: currentGeneration?.guidanceScale || guidanceScale,
            imageSize: currentGeneration?.imageSize || imageSize,
            numImages: currentGeneration?.numImages || numImages,
            enableSafetyChecker: currentGeneration?.enableSafetyChecker || enableSafetyChecker,
            generationMode: currentGeneration?.generationMode || generationMode,
            multiImageModel: selectedModel || multiImageModel,
            walletAddress: isEmailAuth ? undefined : address,
            userId: isEmailAuth ? emailContext.userId : undefined,
            email: isEmailAuth ? emailContext.email : undefined,
            isNFTHolder: isNFTHolder || false,
            optimizePrompt: modalOptimizePrompt
          },
          refImage
        );
      }
      
      // Extract image URLs
      let imageUrls;
      if (typeof result === 'string') imageUrls = [result];
      else if (Array.isArray(result)) imageUrls = result;
      else if (result?.images) imageUrls = Array.isArray(result.images) ? result.images : [result.images];
      else if (result?.imageUrl) imageUrls = [result.imageUrl];
      else throw new Error('No image returned');
      
      if (!imageUrls?.length || !imageUrls[0]) throw new Error('No image returned');
      
      // Save and deduct credits
      const userIdentifier = isEmailAuth ? emailContext.userId : address;
      const creditsUsed = (selectedModel || multiImageModel) === 'nano-banana-pro' ? 2 : 1;
      const promptForHistory = trimmedPrompt || (currentGeneration?.style?.prompt || 'No prompt');
      
      try {
        const deductResult = await addGeneration(userIdentifier, {
          prompt: promptForHistory,
          style: currentGeneration?.style?.name || 'No Style',
          imageUrl: imageUrls[0],
          creditsUsed,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined
        });
        
        if (deductResult?.remainingCredits !== undefined) {
          const validated = Math.max(0, Math.floor(Number(deductResult.remainingCredits) || 0));
          if (isEmailAuth && emailContext.setCreditsManually) emailContext.setCreditsManually(validated);
          else if (setCreditsManually) setCreditsManually(validated);
        }
        
        if (isEmailAuth && emailContext.refreshCredits) await emailContext.refreshCredits();
        else if (refreshCredits && address) await refreshCredits();
      } catch (e) {
        logger.debug('Save/deduct failed', { error: e.message });
      }
      
      setError(null);
      setGeneratedImage(imageUrls.length > 1 ? imageUrls : imageUrls[0]);
      setCurrentGeneration({
        ...currentGeneration,
        image: imageUrls[0],
        prompt: trimmedPrompt,
        referenceImage: imageUrls[0],
        multiImageModel: selectedModel || multiImageModel,
        timestamp: new Date().toISOString()
      });
      setNewPrompt('');
    } catch (e) {
      logger.error('Regeneration with prompt failed', { error: e.message });
      setError(e.message?.includes('credits') ? e.message : 'Failed to regenerate. Please try again.');
      setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux');
      setShowPromptModal(true);
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  }, [isRegenerating, isGenerating, selectedModel, newPrompt, isConnected, isEmailAuth, emailContext, address, multiImageModel, availableCredits, currentGeneration, generatedImage, modalOptimizePrompt, guidanceScale, imageSize, numImages, enableSafetyChecker, generationMode, isNFTHolder, setOptimizePrompt, setGenerating, setGeneratedImage, setCurrentGeneration, setError, setCreditsManually, refreshCredits]);

  const openRegenerateModal = useCallback(() => {
    setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux');
    setModalOptimizePrompt(optimizePrompt);
    setShowPromptModal(true);
  }, [multiImageModel, currentGeneration, optimizePrompt]);

  const closeModal = useCallback(() => {
    setShowPromptModal(false);
    setNewPrompt('');
    setError(null);
    setSelectedModel(null);
  }, [setError]);

  // Loading state
  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="glass-card p-8 rounded-xl text-center scale-in relative overflow-hidden">
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div className="absolute inset-0 rounded-full" style={{ background: 'conic-gradient(from 0deg, transparent, #00d4ff, transparent)', animation: 'spin 1.5s linear infinite' }} />
            <div className="absolute inset-1 rounded-full" style={{ background: 'linear-gradient(135deg, #f0f0f8, #e8e8f0)' }} />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-7 h-7 animate-pulse" style={{ color: '#00d4ff' }} />
            </div>
          </div>
          <p className="text-sm mb-1.5 font-bold" style={{ ...TEXT.primary, fontFamily: "'IBM Plex Mono', monospace" }}>Creating your masterpiece...</p>
          <p className="text-xs" style={{ ...TEXT.secondary, fontFamily: "'IBM Plex Mono', monospace" }}>This may take a few moments</p>
        </div>
      </div>
    );
  }

  // Error state (only if no image)
  if (error && !hasImage) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-4">
        <div className="glass-card p-6 rounded-lg text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center bg-red-500/20 rounded-full">❌</div>
          <h4 className="text-sm font-semibold mb-2" style={TEXT.primary}>Something went wrong</h4>
          <p className="text-xs mb-4" style={TEXT.secondary}>{error}</p>
          <div className="flex gap-2 justify-center">
            <ActionButton onClick={clearGeneration}>Try Again</ActionButton>
            <ActionButton onClick={clearAll}>Start Over</ActionButton>
          </div>
        </div>
      </div>
    );
  }

  // Empty state - uniform background with centered content
  if (!hasImage) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center" style={{ background: '#c0c0c0' }}>
        <div className="w-12 h-12 mb-3 flex items-center justify-center" style={{ color: '#808080' }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor" />
          </svg>
        </div>
        <p className="text-xs font-semibold text-center" style={{ color: '#000000', fontFamily: "'IBM Plex Mono', monospace" }}>Your creation awaits</p>
        <p className="text-[10px] mt-0.5 text-center" style={{ color: '#404040', fontFamily: "'IBM Plex Mono', monospace" }}>Enter a prompt and click generate</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Error banner */}
      {error && hasImage && (
        <div className="glass-card rounded-lg p-1.5 mb-1 flex items-center justify-between gap-1.5 flex-shrink-0" style={{ background: 'linear-gradient(to bottom, #ffe0e0, #ffd0d0)', border: '2px outset #ffc0c0' }}>
          <div className="flex items-center gap-2 flex-1">
            <span>⚠️</span>
            <p className="text-xs flex-1" style={TEXT.primary}>{error}</p>
          </div>
          <button onClick={() => setError(null)} className="p-1 rounded hover:bg-red-200" style={{ color: '#000' }}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between mb-1 flex-wrap gap-1.5 flex-shrink-0">
        {hasMultipleImages && (
          <div className="text-xs px-2 py-1.5 flex items-center gap-1 rounded" style={{ ...BTN.base }}>{imagesToDisplay.length} images</div>
        )}
        <div className="flex gap-2 flex-wrap ml-auto">
          <ActionButton onClick={() => handleDownload(imagesToDisplay[0])} disabled={isDownloading}>
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{isDownloading ? 'Saving...' : 'Download'}</span>
          </ActionButton>
          <ActionButton onClick={handleRegenerate} disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}>
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">{isRegenerating ? 'Working...' : 'Regenerate'}</span>
          </ActionButton>
          <ActionButton onClick={clearGeneration} variant="danger">
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Clear</span>
          </ActionButton>
        </div>
      </div>
      
      {/* Images */}
      <div className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {hasMultipleImages ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {imagesToDisplay.map((url, i) => (
              <div key={i} className="glass-card rounded-lg overflow-hidden p-1.5">
                <img 
                  src={url} 
                  alt={`Generated ${i + 1}`} 
                  className="w-full h-auto max-h-[200px] object-contain rounded-lg"
                  decoding="async"
                  fetchpriority={i === 0 ? "high" : "low"}
                  onError={(e) => e.target.style.display = 'none'} 
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-lg overflow-hidden p-1.5 h-full flex items-center justify-center">
            <img 
              src={imagesToDisplay[0]} 
              alt="Generated" 
              className="max-w-full max-h-full object-contain rounded-lg"
              decoding="async"
              fetchpriority="high"
              onError={(e) => { setError('Failed to load image'); e.target.style.display = 'none'; }} 
            />
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg p-2.5 mt-2" style={{
        background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 50%, #ede9fe 100%)',
        border: '2px solid #c4b5fd',
        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.15)'
      }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#6d28d9' }}>
            <Wand2 className="w-4 h-4" />
            <span>Transform Output</span>
          </h4>
          <ActionButton
            onClick={openRegenerateModal}
            disabled={isRegenerating || isGenerating || (!isConnected && !isEmailAuth) || !currentGeneration || availableCredits <= 0}
            variant="primary"
          >
            <Sparkles className="w-4 h-4" />
            <span>New Prompt</span>
          </ActionButton>
        </div>
      </div>

      {/* Enhanced Prompt Modal */}
      {showPromptModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.95) 100%)' }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div 
            className="w-full max-w-lg mx-4 my-8 max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #f8fafc 50%, #f1f5f9 100%)',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.8)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.9)'
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-5 pb-4 border-b" style={{ borderColor: '#e2e8f0' }}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl" style={{
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
                }}>
                  <Wand2 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: '#1e1b4b' }}>Regenerate with New Prompt</h3>
                  <p className="text-xs" style={{ color: '#64748b' }}>Transform your image with a new creative direction</p>
                </div>
              </div>
              <button 
                onClick={closeModal} 
                className="p-2 rounded-xl transition-all hover:scale-110"
                style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
              >
                <X className="w-5 h-5" style={{ color: '#64748b' }} />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Error Display */}
              {error && (
                <div className="p-3 rounded-xl flex items-start gap-2" style={{
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                  border: '1px solid #fecaca'
                }}>
                  <span className="text-lg">⚠️</span>
                  <p className="text-sm flex-1" style={{ color: '#991b1b' }}>{error}</p>
                </div>
              )}

              {/* Model Selection */}
              <div className="space-y-2">
                <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#374151' }}>
                  <Zap className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
                  Select Model
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <ModelButton 
                    selected={selectedModel === 'flux' || (!selectedModel && (!multiImageModel || multiImageModel === 'flux'))} 
                    onClick={() => { setSelectedModel('flux'); setError(null); }} 
                    icon={Zap} 
                    name="FLUX" 
                    desc="Generate/Edit" 
                    credits="1 credit" 
                  />
                  <ModelButton 
                    selected={selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro')} 
                    onClick={() => { setSelectedModel('nano-banana-pro'); setError(null); }} 
                    icon={Sparkles} 
                    name="Nano Pro" 
                    desc="High Quality" 
                    credits="2 credits" 
                  />
                  <ModelButton 
                    selected={selectedModel === 'qwen-image-layered'} 
                    onClick={() => { setSelectedModel('qwen-image-layered'); setError(null); }} 
                    icon={Layers} 
                    name="Qwen" 
                    desc="Extract Layers" 
                    credits="1 credit" 
                  />
                </div>
              </div>

              {/* AI Prompt Optimization Toggle */}
              {selectedModel !== 'qwen-image-layered' && (
                <div 
                  className="p-3 rounded-xl space-y-2 cursor-pointer transition-all hover:shadow-md"
                  style={{
                    background: modalOptimizePrompt 
                      ? 'linear-gradient(135deg, #ede9fe 0%, #ddd6fe 100%)'
                      : 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    border: modalOptimizePrompt ? '2px solid #a78bfa' : '2px solid #e2e8f0'
                  }}
                  onClick={() => setModalOptimizePrompt(!modalOptimizePrompt)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4" style={{ color: modalOptimizePrompt ? '#7c3aed' : '#64748b' }} />
                      <span className="text-xs font-bold" style={{ color: modalOptimizePrompt ? '#5b21b6' : '#374151' }}>
                        AI Prompt Enhancement
                      </span>
                      <span 
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{
                          background: modalOptimizePrompt ? '#7c3aed' : '#94a3b8',
                          color: '#fff'
                        }}
                      >
                        {modalOptimizePrompt ? 'ON' : 'OFF'}
                      </span>
                    </div>
                    
                    {/* Toggle Switch */}
                    <div 
                      className="relative w-11 h-6 rounded-full transition-all"
                      style={{
                        background: modalOptimizePrompt 
                          ? 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'
                          : '#cbd5e1',
                        boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)'
                      }}
                    >
                      <div 
                        className="absolute w-5 h-5 rounded-full top-0.5 transition-all duration-200"
                        style={{
                          left: modalOptimizePrompt ? 'calc(100% - 22px)' : '2px',
                          background: '#fff',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed" style={{ color: modalOptimizePrompt ? '#6b21a8' : '#64748b' }}>
                    {modalOptimizePrompt 
                      ? '✨ AI will enhance your prompt with creative details for better results'
                      : '⚡ Your prompt will be used exactly as written'}
                  </p>
                </div>
              )}
              
              {/* Prompt input */}
              {selectedModel !== 'qwen-image-layered' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: '#374151' }}>
                    <Sparkles className="w-3.5 h-3.5" style={{ color: '#8b5cf6' }} />
                    Your New Prompt
                  </label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => { setNewPrompt(e.target.value); setError(null); }}
                    placeholder="Describe how you want to transform this image..."
                    className="w-full h-28 px-4 py-3 rounded-xl resize-none transition-all focus:ring-2 focus:ring-purple-400 focus:outline-none"
                    style={{ 
                      background: '#fff', 
                      border: '2px solid #e2e8f0', 
                      color: '#1e293b',
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}
                    autoFocus
                  />
                  <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                    The current output becomes the reference image for transformation
                  </p>
                </div>
              )}

              {/* Qwen Info */}
              {selectedModel === 'qwen-image-layered' && (
                <div className="p-4 rounded-xl" style={{
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  border: '1px solid #6ee7b7'
                }}>
                  <div className="flex items-start gap-3">
                    <Layers className="w-5 h-5 mt-0.5" style={{ color: '#059669' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#047857' }}>Layer Extraction Mode</p>
                      <p className="text-xs mt-1" style={{ color: '#065f46' }}>
                        This will extract the current image into separate RGBA layers, useful for advanced editing and compositing.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-5 pt-4 border-t flex gap-3" style={{ borderColor: '#e2e8f0', background: '#f8fafc' }}>
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={(!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating}
                className="flex-1 py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
                style={{
                  background: ((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)
                    ? '#e2e8f0'
                    : 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  color: ((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)
                    ? '#94a3b8'
                    : '#fff',
                  border: 'none',
                  boxShadow: ((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating)
                    ? 'none'
                    : '0 4px 14px rgba(139, 92, 246, 0.4)'
                }}
              >
                {isRegenerating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Generating...
                  </>
                ) : selectedModel === 'qwen-image-layered' ? (
                  <>
                    <Layers className="w-4 h-4" />
                    Extract Layers
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate with New Prompt
                  </>
                )}
              </button>
              <button 
                onClick={closeModal} 
                className="px-6 py-3.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02]"
                style={{ 
                  background: '#fff', 
                  border: '2px solid #e2e8f0',
                  color: '#64748b'
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
