import React, { useState, useEffect, memo, useCallback } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { extractLayers } from '../services/layerExtractionService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Zap, Layers } from 'lucide-react';
import { BTN, TEXT, hoverHandlers, pressHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger.js';

// PERFORMANCE: Memoized presentational components
const ActionButton = memo(({ children, onClick, disabled, className = '', ...props }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1.5 text-xs px-3 py-2 md:py-1.5 rounded transition-all hover:scale-105 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    style={{ minHeight: '44px', ...(disabled ? BTN.disabled : BTN.base) }}
    {...(disabled ? {} : hoverHandlers)}
    {...props}
  >
    {children}
  </button>
));

const ModelButton = memo(({ selected, onClick, icon: Icon, name, desc, credits }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex-1 flex flex-col items-center justify-center gap-1 px-2 py-2 rounded transition-all min-w-[80px]"
    style={selected ? BTN.active : BTN.base}
    {...(selected ? {} : hoverHandlers)}
  >
    <Icon className="w-4 h-4" style={{ color: '#000' }} />
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-xs font-bold">{name}</span>
      <span className="text-xs" style={TEXT.secondary}>{desc}</span>
      <span className="text-xs" style={TEXT.secondary}>{credits}</span>
    </div>
  </button>
));

const ImageOutput = () => {
  const { 
    generatedImage, generatedImages, isGenerating, error, clearGeneration, clearAll,
    currentGeneration, setCurrentGeneration, setGenerating, setGeneratedImage, setError,
    selectedStyle, guidanceScale, imageSize, numImages, enableSafetyChecker,
    generationMode, controlNetImage, multiImageModel
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

  // Strip metadata from image
  const stripImageMetadata = (imageUrl) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Blob conversion failed')), 'image/png');
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = imageUrl;
  });

  const handleDownload = async (imageUrl = null) => {
    const img = imageUrl || generatedImage;
    if (!img || isDownloading) return;
    setIsDownloading(true);
    
    try {
      const key = 'seiso_download_index';
      const idx = (parseInt(localStorage.getItem(key) || '0', 10) || 0) + 1;
      localStorage.setItem(key, String(idx));
      const filename = `seiso${idx}.png`;
      
      const blob = await stripImageMetadata(img);
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
  };

  const handleRegenerate = async () => {
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
  };

  const handleRegenerateWithPrompt = async () => {
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
            isNFTHolder: isNFTHolder || false
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
  };

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
  const hasImage = (generatedImages?.length > 0) || generatedImage;
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

  // Get images to display
  let imagesToDisplay = [];
  if (generatedImages?.length > 0) imagesToDisplay = generatedImages;
  else if (generatedImage) imagesToDisplay = Array.isArray(generatedImage) ? generatedImage : [generatedImage];
  const hasMultipleImages = imagesToDisplay.length > 1;

  // PERFORMANCE: Preload images as soon as URLs are available
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

  // Empty state - uniform background with centered content
  if (!imagesToDisplay.length) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center" style={{ background: 'linear-gradient(135deg, #f5f5f8, #e8e8f0)' }}>
        <div className="w-12 h-12 mb-3 flex items-center justify-center" style={{ color: '#a0a0b8' }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-10 h-10">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor" />
          </svg>
        </div>
        <p className="text-xs font-semibold" style={{ color: '#666', fontFamily: "'IBM Plex Mono', monospace" }}>Your creation awaits</p>
        <p className="text-[10px] mt-0.5" style={{ color: '#888', fontFamily: "'IBM Plex Mono', monospace" }}>Enter a prompt and click generate</p>
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
            <span>{isDownloading ? '⏳' : '💾'}</span>
            <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download'}</span>
          </ActionButton>
          <ActionButton onClick={handleRegenerate} disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}>
            <span>{isRegenerating ? '⏳' : '🔄'}</span>
            <span className="hidden sm:inline">{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
          </ActionButton>
          <ActionButton onClick={clearGeneration}>
            <span>🗑️</span>
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
      <div className="glass-card rounded-lg p-2 mt-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-xs font-semibold flex items-center gap-1" style={TEXT.primary}>
            <span>✨</span><span>Quick Actions</span>
          </h4>
          <ActionButton
            onClick={() => { setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux'); setShowPromptModal(true); }}
            disabled={isRegenerating || isGenerating || (!isConnected && !isEmailAuth) || !currentGeneration || availableCredits <= 0}
          >
            <Sparkles className="w-4 h-4" /><span>New Prompt</span>
          </ActionButton>
        </div>
      </div>

      {/* Prompt Modal */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="glass-card rounded-2xl p-6 max-w-md w-full mx-4 my-8 max-h-[95vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg"><Sparkles className="w-5 h-5 text-purple-600" /></div>
                <h3 className="text-xl font-semibold text-black">New Prompt Regeneration</h3>
              </div>
              <button onClick={() => { setShowPromptModal(false); setNewPrompt(''); setError(null); setSelectedModel(null); }} className="p-2 rounded-lg hover:bg-gray-200"><X className="w-5 h-5 text-gray-600" /></button>
            </div>
            
            <p className="text-gray-700 text-sm mb-4">
              {selectedModel === 'qwen-image-layered' ? 'Extract RGBA layers from the current image.' : 'Enter a new prompt. Current output becomes the reference.'}
            </p>
            
            {error && <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-lg"><p className="text-red-700 text-sm">{error}</p></div>}
            
            {/* Model Selection */}
            <div className="mb-4 p-3 rounded-lg flex-shrink-0" style={{ ...BTN.base, background: 'linear-gradient(to bottom, #fff, #f5f5f5)' }}>
              <label className="block text-xs font-semibold mb-2" style={TEXT.primary}>Select Model</label>
              <div className="flex gap-2 flex-wrap">
                <ModelButton selected={selectedModel === 'flux' || (!selectedModel && (!multiImageModel || multiImageModel === 'flux'))} onClick={() => { setSelectedModel('flux'); setError(null); }} icon={Zap} name="FLUX" desc="Generate or edit" credits="1 credit" />
                <ModelButton selected={selectedModel === 'nano-banana-pro' || (!selectedModel && multiImageModel === 'nano-banana-pro')} onClick={() => { setSelectedModel('nano-banana-pro'); setError(null); }} icon={Sparkles} name="Nano Banana Pro" desc="Edit" credits="2 credits" />
                <ModelButton selected={selectedModel === 'qwen-image-layered'} onClick={() => { setSelectedModel('qwen-image-layered'); setError(null); }} icon={Layers} name="Qwen" desc="Extract by layer" credits="1 credit" />
              </div>
            </div>
            
            {/* Prompt input */}
            {selectedModel !== 'qwen-image-layered' && (
              <div className="flex-1 overflow-y-auto min-h-0">
                <textarea
                  value={newPrompt}
                  onChange={(e) => { setNewPrompt(e.target.value); setError(null); }}
                  placeholder="Enter your new prompt..."
                  className="w-full h-32 px-4 py-3 resize-none"
                  style={{ background: '#fff', border: '2px inset #c0c0c0', color: '#000' }}
                />
              </div>
            )}
            
            <div className="flex gap-3 mt-6 flex-shrink-0">
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={(!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating}
                className="flex-1 py-3 rounded"
                style={((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating) ? BTN.disabled : BTN.base}
                {...pressHandlers}
              >
                {isRegenerating ? 'Generating...' : selectedModel === 'qwen-image-layered' ? 'Extract Layers' : 'Generate with New Prompt'}
              </button>
              <button onClick={() => { setShowPromptModal(false); setNewPrompt(''); setError(null); setSelectedModel(null); }} className="px-5 py-3 rounded" style={BTN.base} {...hoverHandlers}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageOutput;
