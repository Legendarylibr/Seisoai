import React, { useState, useEffect, memo, ReactNode, ChangeEvent } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { extractLayers } from '../services/layerExtractionService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Layers, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import { BTN, WIN95, hoverHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger';

interface ActionButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

// Win95 style action button
const ActionButton = memo<ActionButtonProps>(({ children, onClick, disabled, className = '' }) => (
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

ActionButton.displayName = 'ActionButton';

const ImageOutput: React.FC = () => {
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
  
  const [isDownloading, setIsDownloading] = useState<boolean>(false);
  const [isRegenerating, setIsRegenerating] = useState<boolean>(false);
  const [showPromptModal, setShowPromptModal] = useState<boolean>(false);
  const [newPrompt, setNewPrompt] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  // Close modal helper
  const closeModal = () => {
    setShowPromptModal(false);
    setNewPrompt('');
    setError(null);
    setSelectedModel(null);
  };

  // Strip metadata from image
  const stripImageMetadata = (imageUrl: string): Promise<Blob> => new Promise((resolve, reject) => {
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

  const handleDownload = async (imageUrl: string | null = null) => {
    const img = imageUrl || (typeof generatedImage === 'string' ? generatedImage : (Array.isArray(generatedImage) ? generatedImage[0] : null));
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
      logger.error('Download failed', { error: e instanceof Error ? e.message : 'Unknown error' });
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
      logger.error('Regeneration failed', { error: e instanceof Error ? e.message : 'Unknown error' });
      setError(e instanceof Error ? e.message : 'Failed to regenerate');
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
        logger.debug('Save/deduct failed', { error: e instanceof Error ? e.message : 'Unknown error' });
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
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.error('Regeneration with prompt failed', { error: errorMessage });
      setError(errorMessage.includes('credits') ? errorMessage : 'Failed to regenerate. Please try again.');
      setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux');
      setShowPromptModal(true);
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  };

  // Get images to display - MUST be before any hooks that depend on it
  let imagesToDisplay: string[] = [];
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
      <div className="h-full flex flex-col" style={{ background: '#c0c0c0' }}>
      {/* Title bar - Loading */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          Generating...
        </span>
      </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          {/* Win95 hourglass animation */}
          <div className="relative mb-3">
            <div 
              className="w-12 h-12 flex items-center justify-center"
              style={{
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
              }}
            >
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent' }} />
            </div>
          </div>
          <p className="text-[11px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Creating your masterpiece...</p>
          <p className="text-[10px] mt-1" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>This may take a few moments</p>
          {/* Progress dots */}
          <div className="flex gap-1 mt-3">
            {[0, 1, 2].map((i) => (
              <div 
                key={i}
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ 
                  background: '#000080',
                  animationDelay: `${i * 0.2}s`
                }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error state (only if no image)
  if (error && !hasImages) {
    return (
      <div className="h-full flex flex-col" style={{ background: '#c0c0c0' }}>
        {/* Title bar - Error */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ 
            background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
            color: '#ffffff'
          }}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Error
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div 
            className="w-12 h-12 mb-3 flex items-center justify-center"
            style={{
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
            }}
          >
            <X className="w-6 h-6" style={{ color: '#800000' }} />
          </div>
          <p className="text-[11px] font-bold mb-1" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Something went wrong</p>
          <p className="text-[10px] mb-4 text-center max-w-xs" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
          <div className="flex gap-2">
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
      <div className="h-full w-full flex flex-col" style={{ background: '#c0c0c0' }}>
        {/* Title bar - Empty */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ 
            background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
            color: '#ffffff'
          }}
        >
          <ImageIcon className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Output Preview
          </span>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div 
            className="w-16 h-16 mb-3 flex items-center justify-center"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
            }}
          >
            <ImageIcon className="w-8 h-8" style={{ color: WIN95.textDisabled }} />
          </div>
          <p className="text-[11px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your creation awaits</p>
          <p className="text-[10px] mt-1" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Enter a prompt and click Generate</p>
          {/* Decorative dotted line */}
          <div className="w-32 mt-4 border-t border-dashed" style={{ borderColor: WIN95.textDisabled }} />
        </div>
      </div>
    );
  }
  
  const isNewPromptDisabled = isRegenerating || isGenerating || (!isConnected && !isEmailAuth) || !currentGeneration || availableCredits <= 0;

  return (
    <div 
      className="w-full h-full flex flex-col" 
      style={{ 
        minHeight: 0, 
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Title bar - Generated */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <ImageIcon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          Generated Image
        </span>
        {hasMultipleImages && (
          <span className="text-[9px] opacity-80 ml-1">({imagesToDisplay.length} images)</span>
        )}
        <div className="flex-1" />
      </div>
      
      {/* Error banner */}
      {error && hasImages && (
        <div className="p-1 flex items-center justify-between gap-1.5 flex-shrink-0" style={{ 
          background: '#ffcccc',
          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
        }}>
          <div className="flex items-center gap-1 flex-1 px-1">
            <AlertTriangle className="w-3 h-3" style={{ color: '#800000' }} />
            <p className="text-[10px] flex-1" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
          </div>
          <button onClick={() => setError(null)} className="px-1.5 py-0.5 text-[10px]" style={BTN.base} {...hoverHandlers}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Win95 Toolbar */}
      <div className="flex items-center gap-0.5 p-1 flex-shrink-0 flex-wrap" style={{ 
        background: WIN95.bg,
        borderBottom: `1px solid ${WIN95.bgDark}`
      }}>
        <button onClick={() => handleDownload(imagesToDisplay[0])} disabled={isDownloading}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold"
          style={isDownloading ? BTN.disabled : BTN.base}
          {...(isDownloading ? {} : hoverHandlers)}
          title="Save image to disk"
        >
          <span>💾</span>
          <span>{isDownloading ? 'Saving...' : 'Save'}</span>
        </button>
        
        <button onClick={handleRegenerate} disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold"
          style={(isRegenerating || isGenerating || !isConnected || !currentGeneration) ? BTN.disabled : BTN.base}
          {...((isRegenerating || isGenerating || !isConnected || !currentGeneration) ? {} : hoverHandlers)}
          title="Regenerate with same settings"
        >
          <span>🔄</span>
          <span>{isRegenerating ? 'Wait...' : 'Redo'}</span>
        </button>
        
        <button onClick={clearGeneration} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold" style={BTN.base} {...hoverHandlers} title="Clear image">
          <span>🗑️</span>
          <span className="hidden sm:inline">Clear</span>
        </button>

        {/* Separator */}
        <div className="w-px h-5 mx-1" style={{ background: `linear-gradient(180deg, ${WIN95.border.dark} 0%, ${WIN95.border.light} 100%)` }} />
        
        {/* New Prompt Button - Accent */}
        <button
          onClick={() => { setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux'); setShowPromptModal(true); }}
          disabled={isNewPromptDisabled}
          className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold"
          style={isNewPromptDisabled ? BTN.disabled : {
            background: 'linear-gradient(180deg, #1084d0 0%, #000080 100%)',
            color: '#ffffff',
            border: 'none',
            boxShadow: `inset 1px 1px 0 #4090e0, inset -1px -1px 0 #000040, 2px 2px 0 rgba(0,0,0,0.2)`,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
            cursor: 'pointer',
            textShadow: '1px 1px 0 #000040'
          }}
          title="Generate with new prompt"
        >
          <Sparkles className="w-3 h-3" />
          <span>New Prompt</span>
        </button>

        <div className="flex-1" />
        
        {/* Credits indicator */}
        <div 
          className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-[9px]"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
            color: WIN95.textDisabled
          }}
        >
          <span>💰</span>
          <span>{availableCredits} credits</span>
        </div>
      </div>
      
      {/* Image Display - fills all remaining space with fixed container */}
      <div className="flex-1 min-h-0 p-1 overflow-hidden" style={{ background: '#c0c0c0', maxHeight: 'calc(100% - 40px)' }}>
        <div 
          className="w-full h-full overflow-hidden flex items-center justify-center"
          style={{ 
            background: '#ffffff',
            boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #404040'
          }}
        >
          {hasMultipleImages ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 w-full h-full" style={{ maxHeight: '100%' }}>
              {imagesToDisplay.map((url, i) => (
                <div key={i} className="flex items-center justify-center overflow-hidden" style={{ maxHeight: '100%' }}>
                  <img 
                    src={url} 
                    alt={`Generated ${i + 1}`} 
                    className="object-contain"
                    style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
                    decoding="async"
                    fetchpriority={i === 0 ? "high" : "low"}
                    onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                  />
                </div>
              ))}
            </div>
          ) : (
            <img 
              src={imagesToDisplay[0]} 
              alt="Generated" 
              className="object-contain"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
              decoding="async"
              fetchpriority="high"
              onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { setError('Failed to load image'); (e.target as HTMLImageElement).style.display = 'none'; }} 
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
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setNewPrompt(e.target.value); setError(null); }}
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
