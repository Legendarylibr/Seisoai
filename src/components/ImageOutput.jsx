import React, { useState, useEffect, memo } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { extractLayers } from '../services/layerExtractionService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Layers } from 'lucide-react';
import { BTN, hoverHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger.js';

// Win95 style action button
const ActionButton = memo(({ children, onClick, disabled, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-1 px-3 py-1.5 text-[11px] ${className}`}
    style={disabled ? BTN.disabled : BTN.base}
    {...(disabled ? {} : hoverHandlers)}
  >
    {children}
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

  // Close modal helper
  const closeModal = () => {
    setShowPromptModal(false);
    setNewPrompt('');
    setError(null);
    setSelectedModel(null);
  };

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

  // Get images to display - MUST be before any hooks that depend on it
  let imagesToDisplay = [];
  if (generatedImages?.length > 0) imagesToDisplay = generatedImages;
  else if (generatedImage) imagesToDisplay = Array.isArray(generatedImage) ? generatedImage : [generatedImage];
  const hasMultipleImages = imagesToDisplay.length > 1;
  const hasImages = imagesToDisplay.length > 0;

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

  // Loading state
  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ background: '#c0c0c0' }}>
        <div className="text-center p-4">
          <div className="w-8 h-8 mx-auto mb-2 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent' }} />
          <p className="text-[11px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Creating your masterpiece...</p>
          <p className="text-[10px] mt-0.5" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>This may take a few moments</p>
        </div>
      </div>
    );
  }

  // Error state (only if no image)
  if (error && !hasImages) {
    return (
      <div className="h-full flex flex-col items-center justify-center" style={{ background: '#c0c0c0' }}>
        <div className="text-center p-4 max-w-md">
          <div className="w-10 h-10 mx-auto mb-2 flex items-center justify-center" style={{ color: '#800000' }}>❌</div>
          <p className="text-[11px] font-bold mb-1" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Something went wrong</p>
          <p className="text-[10px] mb-3" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
          <div className="flex gap-2 justify-center">
            <ActionButton onClick={clearGeneration}>Try Again</ActionButton>
            <ActionButton onClick={clearAll}>Start Over</ActionButton>
          </div>
        </div>
      </div>
    );
  }

  // Empty state
  if (!hasImages) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center" style={{ background: '#c0c0c0' }}>
        <div className="w-10 h-10 mb-2 flex items-center justify-center" style={{ color: '#808080' }}>
          <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8">
            <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" fill="currentColor" />
          </svg>
        </div>
        <p className="text-[11px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your creation awaits</p>
        <p className="text-[10px] mt-0.5" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Enter a prompt and click generate</p>
      </div>
    );
  }
  
  const isNewPromptDisabled = isRegenerating || isGenerating || (!isConnected && !isEmailAuth) || !currentGeneration || availableCredits <= 0;

  return (
    <div className="w-full h-full flex flex-col" style={{ minHeight: 0, background: '#c0c0c0' }}>
      {/* Error banner */}
      {error && hasImages && (
        <div className="p-1 flex items-center justify-between gap-1.5 flex-shrink-0" style={{ 
          background: '#ffcccc',
          boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff'
        }}>
          <div className="flex items-center gap-1 flex-1 px-1">
            <span className="text-[10px]">⚠️</span>
            <p className="text-[10px] flex-1" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
          </div>
          <button onClick={() => setError(null)} className="px-1.5 py-0.5 text-[10px]" style={BTN.base} {...hoverHandlers}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Win95 Toolbar */}
      <div className="flex items-center gap-0.5 p-0.5 flex-shrink-0 flex-wrap" style={{ 
        background: '#c0c0c0',
        borderBottom: '1px solid #808080'
      }}>
        {hasMultipleImages && (
          <span className="text-[9px] px-1.5 py-0.5 mr-1" style={{ 
            background: '#ffffff',
            boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff',
            color: '#000',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}>
            {imagesToDisplay.length} images
          </span>
        )}
        
        <button onClick={() => handleDownload(imagesToDisplay[0])} disabled={isDownloading}
          className="flex items-center gap-1 px-2 py-1 text-[10px]"
          style={isDownloading ? BTN.disabled : BTN.base}
          {...(isDownloading ? {} : hoverHandlers)}
        >
          <span>💾</span>
          <span className="hidden sm:inline">{isDownloading ? '...' : 'Save'}</span>
        </button>
        
        <button onClick={handleRegenerate} disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}
          className="flex items-center gap-1 px-2 py-1 text-[10px]"
          style={(isRegenerating || isGenerating || !isConnected || !currentGeneration) ? BTN.disabled : BTN.base}
          {...((isRegenerating || isGenerating || !isConnected || !currentGeneration) ? {} : hoverHandlers)}
        >
          <span>🔄</span>
          <span className="hidden sm:inline">{isRegenerating ? '...' : 'Redo'}</span>
        </button>
        
        <button onClick={clearGeneration} className="flex items-center gap-1 px-2 py-1 text-[10px]" style={BTN.base} {...hoverHandlers}>
          <span>🗑️</span>
        </button>

        <div className="flex-1" />
        
        {/* New Prompt Button */}
        <button
          onClick={() => { setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux'); setShowPromptModal(true); }}
          disabled={isNewPromptDisabled}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold"
          style={isNewPromptDisabled ? BTN.disabled : {
            background: '#000080',
            color: '#ffffff',
            border: 'none',
            boxShadow: 'inset 1px 1px 0 #4040c0, inset -1px -1px 0 #000040, inset 2px 2px 0 #6060e0, inset -2px -2px 0 #000020',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
            cursor: 'pointer'
          }}
        >
          <Sparkles className="w-3 h-3" />
          <span>New Prompt</span>
        </button>
      </div>
      
      {/* Image Display - fills all remaining space */}
      <div className="flex-1 min-h-0 p-1 overflow-hidden" style={{ background: '#c0c0c0' }}>
        <div 
          className="w-full h-full overflow-auto flex items-center justify-center"
          style={{ 
            background: '#ffffff',
            boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #404040'
          }}
        >
          {hasMultipleImages ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 w-full h-full auto-rows-fr">
              {imagesToDisplay.map((url, i) => (
                <div key={i} className="flex items-center justify-center overflow-hidden min-h-0">
                  <img 
                    src={url} 
                    alt={`Generated ${i + 1}`} 
                    className="max-w-full max-h-full object-contain"
                    decoding="async"
                    fetchpriority={i === 0 ? "high" : "low"}
                    onError={(e) => e.target.style.display = 'none'} 
                  />
                </div>
              ))}
            </div>
          ) : (
            <img 
              src={imagesToDisplay[0]} 
              alt="Generated" 
              className="max-w-full max-h-full object-contain"
              decoding="async"
              fetchpriority="high"
              onError={(e) => { setError('Failed to load image'); e.target.style.display = 'none'; }} 
            />
          )}
        </div>
      </div>

      {/* Win95 Prompt Modal */}
      {showPromptModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] p-2 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div 
            className="w-full max-w-md mx-2 sm:mx-4 max-h-[95vh] sm:max-h-[90vh] flex flex-col"
            style={{
              background: '#c0c0c0',
              boxShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #000000, inset 2px 2px 0 #dfdfdf, inset -2px -2px 0 #808080, 4px 4px 0 rgba(0,0,0,0.3)'
            }}
          >
            {/* Title Bar */}
            <div className="flex items-center justify-between px-1 py-0.5" style={{ background: 'linear-gradient(90deg, #000080, #1084d0)' }}>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span className="text-[11px] font-bold text-white" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>New Prompt</span>
              </div>
              <button onClick={closeModal} className="w-4 h-4 flex items-center justify-center text-[10px] font-bold" style={{ ...BTN.base }}>✕</button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ background: '#c0c0c0' }}>
              {error && (
                <div className="p-1.5 flex items-start gap-1.5" style={{ background: '#ffcccc', boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff' }}>
                  <span className="text-[10px]">⚠️</span>
                  <p className="text-[10px] flex-1" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
                </div>
              )}

              {/* Model Selection */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Select Model:</label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: 'flux', name: 'FLUX', desc: '1 credit' },
                    { id: 'nano-banana-pro', name: 'Nano Pro', desc: '2 credits' },
                    { id: 'qwen-image-layered', name: 'Qwen Layers', desc: '1 credit' }
                  ].map((model) => {
                    const isSelected = selectedModel === model.id || (!selectedModel && model.id === (multiImageModel || 'flux'));
                    return (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModel(model.id); setError(null); }}
                        className="flex-1 min-w-[80px] px-2 py-1.5 text-[10px]"
                        style={isSelected ? {
                          background: '#000080', color: '#ffffff', border: 'none',
                          boxShadow: 'inset 1px 1px 0 #000040, inset -1px -1px 0 #4040c0',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        } : BTN.base}
                      >
                        <div className="font-bold">{model.name}</div>
                        <div className="text-[9px] opacity-80">{model.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Prompt input */}
              {selectedModel !== 'qwen-image-layered' && (
                <div>
                  <label className="text-[10px] font-bold block mb-1" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your New Prompt:</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e) => { setNewPrompt(e.target.value); setError(null); }}
                    placeholder="Describe how you want to transform this image..."
                    className="w-full h-20 sm:h-24 p-1.5 resize-none text-[11px] focus:outline-none"
                    style={{ 
                      background: '#ffffff',
                      boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #404040',
                      border: 'none', color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                    autoFocus
                  />
                  <p className="text-[9px] mt-0.5" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Current output becomes reference image</p>
                </div>
              )}

              {selectedModel === 'qwen-image-layered' && (
                <div className="p-2" style={{ background: '#c0c0c0', boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff' }}>
                  <div className="flex items-start gap-2">
                    <Layers className="w-4 h-4" style={{ color: '#008000' }} />
                    <div>
                      <p className="text-[10px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Layer Extraction Mode</p>
                      <p className="text-[9px] mt-0.5" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Extract image into separate RGBA layers.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex gap-2 p-2 justify-end" style={{ background: '#c0c0c0', borderTop: '1px solid #808080' }}>
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={(!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating}
                className="flex items-center gap-1 px-4 py-1.5 text-[11px] font-bold min-w-[100px] justify-center"
                style={((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating) ? BTN.disabled : {
                  background: '#000080', color: '#ffffff', border: 'none',
                  boxShadow: 'inset 1px 1px 0 #4040c0, inset -1px -1px 0 #000040',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif', cursor: 'pointer'
                }}
              >
                {isRegenerating ? 'Wait...' : 'Generate'}
              </button>
              <button onClick={closeModal} className="px-4 py-1.5 text-[11px] min-w-[70px]" style={BTN.base} {...hoverHandlers}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageOutput;
