import React, { useState, useEffect, memo, ReactNode, ChangeEvent } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { generateImage } from '../services/smartImageService';
import { extractLayers } from '../services/layerExtractionService';
import { addGeneration } from '../services/galleryService';
import { X, Sparkles, Layers, Image as ImageIcon, AlertTriangle, Brain, ZoomIn } from 'lucide-react';
import SocialShareButtons from './SocialShareButtons';
import { BTN, WIN95, hoverHandlers } from '../utils/buttonStyles';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
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
    selectedStyle: _selectedStyle, guidanceScale, imageSize, numImages, enableSafetyChecker,
    generationMode, controlNetImage: _controlNetImage, multiImageModel
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
  const [optimizePromptEnabled, setOptimizePromptEnabled] = useState<boolean>(false);
  const [isUpscaling, setIsUpscaling] = useState<boolean>(false);
  const [showUpscaleMenu, setShowUpscaleMenu] = useState<boolean>(false);

  // Close modal helper
  const closeModal = () => {
    setShowPromptModal(false);
    setNewPrompt('');
    setError(null);
    setSelectedModel(null);
    setOptimizePromptEnabled(true); // Reset to default
  };

  // Handle upscale
  const handleUpscale = async (scale: 2 | 4) => {
    const img = imagesToDisplay[0];
    if (!img || isUpscaling) return;
    
    const isAuthenticated = isConnected || isEmailAuth;
    if (!isAuthenticated) {
      setError('Please sign in to upscale images');
      return;
    }

    const requiredCredits = scale === 4 ? 1.0 : 0.5;
    if (availableCredits < requiredCredits) {
      setError(`Insufficient credits. Need ${requiredCredits}, have ${availableCredits}.`);
      return;
    }

    setIsUpscaling(true);
    setShowUpscaleMenu(false);
    setError(null);

    try {
      // Get CSRF token for secure API call
      const csrfToken = await ensureCSRFToken();
      
      const response = await fetch(`${API_URL}/api/generate/upscale`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
        },
        credentials: 'include',
        body: JSON.stringify({
          image_url: img,
          scale,
          walletAddress: isEmailAuth ? undefined : address,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined
        })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `Upscale failed: ${response.status}`);
      }

      if (data.image_url) {
        setGeneratedImage(data.image_url);
        setCurrentGeneration({
          ...currentGeneration,
          image: data.image_url,
          timestamp: new Date().toISOString()
        });
        
        // Update credits
        if (data.remainingCredits !== undefined) {
          const validated = Math.max(0, Math.floor(Number(data.remainingCredits) || 0));
          if (isEmailAuth && emailContext.setCreditsManually) {
            emailContext.setCreditsManually(validated);
          } else if (setCreditsManually) {
            setCreditsManually(validated);
          }
        }
        
        logger.info('Image upscaled successfully', { scale });
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Upscale failed';
      logger.error('Upscale failed', { error: errorMessage });
      setError(errorMessage);
    } finally {
      setIsUpscaling(false);
    }
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
        canvas.getContext('2d')?.drawImage(img, 0, 0);
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
        currentGeneration.style ?? null,
        currentGeneration.prompt || '',
        {
          guidanceScale: currentGeneration.guidanceScale || guidanceScale,
          imageSize: currentGeneration.imageSize || imageSize,
          numImages: currentGeneration.numImages || numImages,
          enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
          generationMode: currentGeneration.generationMode || generationMode,
          walletAddress: isEmailAuth ? null : address,
          userId: isEmailAuth ? emailContext.userId : null,
          email: isEmailAuth ? emailContext.email : null,
          isNFTHolder: isNFTHolder || false
        },
        currentGeneration.referenceImage ?? null
      );
      
      const imageUrl = Array.isArray(result?.images) ? result.images[0] : (typeof result === 'string' ? result : '');
      setError(null);
      setGeneratedImage(result?.images || imageUrl);
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
    // 20% above cost pricing: Flux Pro = 0.6, Flux 2/Qwen = 0.3, Nano Banana = 1.25
    const getCreditsForModel = (model: string): number => {
      if (model === 'flux-2' || model === 'qwen-image-layered') return 0.3;
      if (model === 'nano-banana-pro') return 1.25;
      return 0.6;
    };
    const requiredCredits = getCreditsForModel(modelForCredits);
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
        const singleRefImage = Array.isArray(refImage) ? refImage[0] : refImage;
        result = await extractLayers(singleRefImage, {
          prompt: trimmedPrompt || undefined,
          num_layers: 4,
          walletAddress: isEmailAuth ? null : address,
          userId: isEmailAuth ? emailContext.userId : null,
          email: isEmailAuth ? emailContext.email : null
        });
      } else {
        result = await generateImage(
          currentGeneration?.style ?? null,
          trimmedPrompt,
          {
            guidanceScale: currentGeneration?.guidanceScale || guidanceScale,
            imageSize: currentGeneration?.imageSize || imageSize,
            numImages: currentGeneration?.numImages || numImages,
            enableSafetyChecker: currentGeneration?.enableSafetyChecker || enableSafetyChecker,
            generationMode: currentGeneration?.generationMode || generationMode,
            multiImageModel: selectedModel || multiImageModel,
            walletAddress: isEmailAuth ? null : address,
            userId: isEmailAuth ? emailContext.userId : null,
            email: isEmailAuth ? emailContext.email : null,
            isNFTHolder: isNFTHolder || false,
            optimizePrompt: optimizePromptEnabled
          },
          refImage ?? null
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
      const userIdentifier = isEmailAuth ? emailContext.userId : (address ?? '');
      // 20% above cost pricing
      const modelUsed = selectedModel || multiImageModel || 'flux';
      const creditsUsed = getCreditsForModel(modelUsed);
      const promptForHistory = trimmedPrompt || (currentGeneration?.style?.prompt || 'No prompt');
      
      try {
        const deductResult = await addGeneration(userIdentifier || '', {
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
        multiImageModel: (selectedModel || multiImageModel) ?? undefined,
        timestamp: new Date().toISOString()
      });
      setNewPrompt('');
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      logger.error('Regeneration with prompt failed', { error: errorMessage });
      setError(errorMessage.includes('credits') ? errorMessage : 'Failed to regenerate. Please try again.');
      setSelectedModel((multiImageModel || currentGeneration?.multiImageModel) ?? 'flux');
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
      <div className="h-full flex flex-col" style={{ background: WIN95.bg }}>
      {/* Title bar - Loading */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: WIN95.activeTitle,
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
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
            </div>
          </div>
          <p className="text-[11px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Creating your masterpiece...</p>
          <p className="text-[10px] mt-1" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>This may take a few moments</p>
          {/* Progress dots */}
          <div className="flex gap-1 mt-3">
            {[0, 1, 2].map((i) => (
              <div 
                key={i}
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ 
                  background: WIN95.highlight,
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
      <div className="h-full flex flex-col" style={{ background: WIN95.bg }}>
        {/* Title bar - Error */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ 
            background: WIN95.activeTitle,
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
            <X className="w-6 h-6" style={{ color: WIN95.errorText }} />
          </div>
          <p className="text-[11px] font-bold mb-1" style={{ color: WIN95.errorText, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Something went wrong</p>
          <p className="text-[10px] mb-4 text-center max-w-xs" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
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
      <div className="h-full w-full flex flex-col" style={{ background: WIN95.bg }}>
        {/* Title bar - Empty */}
        <div 
          className="flex items-center gap-1.5 px-2 py-1"
          style={{ 
            background: WIN95.activeTitle,
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
          <p className="text-[11px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your creation awaits</p>
          <p className="text-[10px] mt-1" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Enter a prompt and click Generate</p>
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
          background: WIN95.activeTitle,
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
          background: WIN95.errorBg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
        }}>
          <div className="flex items-center gap-1 flex-1 px-1">
            <AlertTriangle className="w-3 h-3" style={{ color: WIN95.errorText }} />
            <p className="text-[10px] flex-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
          </div>
          <button onClick={() => setError(null)} className="px-1.5 py-0.5 text-[10px]" style={BTN.base} {...hoverHandlers}>
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Win95 Toolbar */}
      <div className="flex items-center gap-0.5 p-0.5 sm:p-1 flex-shrink-0 flex-wrap" style={{ 
        background: WIN95.bg,
        borderBottom: `1px solid ${WIN95.bgDark}`
      }}>
        <button onClick={() => handleDownload(imagesToDisplay[0])} disabled={isDownloading}
          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold"
          style={isDownloading ? BTN.disabled : BTN.base}
          {...(isDownloading ? {} : hoverHandlers)}
          title="Save image to disk"
        >
          <span>💾</span>
          <span className="hidden xs:inline">{isDownloading ? 'Saving...' : 'Save'}</span>
        </button>
        
        <button onClick={handleRegenerate} disabled={isRegenerating || isGenerating || !isConnected || !currentGeneration}
          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold"
          style={(isRegenerating || isGenerating || !isConnected || !currentGeneration) ? BTN.disabled : BTN.base}
          {...((isRegenerating || isGenerating || !isConnected || !currentGeneration) ? {} : hoverHandlers)}
          title="Regenerate with same settings"
        >
          <span>🔄</span>
          <span className="hidden xs:inline">{isRegenerating ? 'Wait...' : 'Redo'}</span>
        </button>
        
        <button onClick={clearGeneration} className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold" style={BTN.base} {...hoverHandlers} title="Clear image">
          <span>🗑️</span>
          <span className="hidden sm:inline">Clear</span>
        </button>

        {/* Upscale Button with Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowUpscaleMenu(!showUpscaleMenu)}
            disabled={isUpscaling || !hasImages || availableCredits < 0.5}
            className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold"
            style={(isUpscaling || !hasImages || availableCredits < 0.5) ? BTN.disabled : BTN.base}
            {...((isUpscaling || !hasImages || availableCredits < 0.5) ? {} : hoverHandlers)}
            title="Upscale image"
          >
            {isUpscaling ? (
              <>
                <span className="animate-spin">⏳</span>
                <span className="hidden xs:inline">Upscaling...</span>
              </>
            ) : (
              <>
                <ZoomIn className="w-3 h-3" />
                <span className="hidden sm:inline">Upscale</span>
              </>
            )}
          </button>
          
          {showUpscaleMenu && !isUpscaling && (
            <div 
              className="absolute top-full left-0 mt-0.5 z-50"
              style={{
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 2px 2px 0 rgba(0,0,0,0.2)`
              }}
            >
              <button
                onClick={() => handleUpscale(2)}
                className="w-full px-4 py-1.5 text-[10px] text-left hover:bg-[#000080] hover:text-white"
                style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif', color: WIN95.text }}
              >
                2x Upscale (0.5 credits)
              </button>
              <button
                onClick={() => handleUpscale(4)}
                disabled={availableCredits < 1.0}
                className="w-full px-4 py-1.5 text-[10px] text-left hover:bg-[#000080] hover:text-white disabled:opacity-50"
                style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif', color: WIN95.text }}
              >
                4x Upscale (1.0 credits)
              </button>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-5 mx-1" style={{ background: `linear-gradient(180deg, ${WIN95.border.dark} 0%, ${WIN95.border.light} 100%)` }} />
        
        {/* New Prompt Button - Accent */}
        <button
          onClick={() => { setSelectedModel(multiImageModel || currentGeneration?.multiImageModel || 'flux'); setShowPromptModal(true); }}
          disabled={isNewPromptDisabled}
          className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-0.5 sm:py-1 text-[9px] sm:text-[10px] font-bold"
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
          <span className="hidden xs:inline">New Prompt</span>
          <span className="xs:hidden">New</span>
        </button>

        {/* Share Button */}
        {hasImages && (
          <SocialShareButtons
            content={{
              imageUrl: imagesToDisplay[0],
              prompt: currentGeneration?.prompt,
              id: currentGeneration?.image?.split('/').pop()?.split('?')[0]
            }}
            onCreditsEarned={() => {
              // Refresh credits after earning
              if (isEmailAuth && emailContext.refreshCredits) {
                emailContext.refreshCredits();
              } else if (refreshCredits && address) {
                refreshCredits();
              }
            }}
            compact={true}
          />
        )}

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
      <div className="flex-1 min-h-0 p-0.5 sm:p-1 overflow-hidden" style={{ background: WIN95.bg }}>
        <div 
          className="w-full h-full overflow-hidden flex items-center justify-center relative"
          style={{ 
            background: WIN95.windowContentBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
          }}
        >
          {/* Regeneration loading overlay */}
          {isRegenerating && (
            <div 
              className="absolute inset-0 flex flex-col items-center justify-center z-10"
              style={{ background: WIN95.panelBg, opacity: 0.95 }}
            >
              <div className="relative mb-3">
                <div 
                  className="w-12 h-12 flex items-center justify-center"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                  }}
                >
                  <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
                </div>
              </div>
              <p className="text-[11px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Regenerating...</p>
              <p className="text-[10px] mt-1" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Please wait</p>
              {/* Progress dots */}
              <div className="flex gap-1 mt-3">
                {[0, 1, 2].map((i) => (
                  <div 
                    key={i}
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ 
                      background: WIN95.highlight,
                      animationDelay: `${i * 0.2}s`
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {hasMultipleImages ? (
            <div 
              className="w-full h-full overflow-y-auto p-1" 
              style={{ maxHeight: '100%' }}
            >
              {/* Collage header for batch results */}
              {imagesToDisplay.length > 6 && (
                <div 
                  className="mb-1 px-2 py-1 flex items-center justify-between"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }}
                >
                  <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    Batch Result: {imagesToDisplay.length} images
                  </span>
                  <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                    Click to download individual images
                  </span>
                </div>
              )}
              <div 
                className="grid gap-1"
                style={{ 
                  // Dynamic grid columns based on image count for optimal collage display
                  gridTemplateColumns: imagesToDisplay.length <= 2 
                    ? 'repeat(2, 1fr)' 
                    : imagesToDisplay.length <= 4 
                      ? 'repeat(2, 1fr)' 
                      : imagesToDisplay.length <= 9
                        ? 'repeat(3, 1fr)'
                        : imagesToDisplay.length <= 16
                          ? 'repeat(4, 1fr)'
                          : imagesToDisplay.length <= 36
                            ? 'repeat(6, 1fr)'
                            : imagesToDisplay.length <= 64
                              ? 'repeat(8, 1fr)'
                              : 'repeat(10, 1fr)' // For up to 100 images
                }}
              >
                {imagesToDisplay.map((url, i) => (
                  <div 
                    key={i} 
                    className="relative aspect-square overflow-hidden cursor-pointer group"
                    onClick={() => handleDownload(url)}
                    title={`Image ${i + 1} - Click to download`}
                    style={{ 
                      boxShadow: `1px 1px 0 ${WIN95.border.darker}`,
                      minWidth: imagesToDisplay.length > 16 ? '40px' : '60px',
                      minHeight: imagesToDisplay.length > 16 ? '40px' : '60px'
                    }}
                  >
                    <img 
                      src={url} 
                      alt={`Generated ${i + 1}`} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      decoding="async"
                      loading={i < 20 ? "eager" : "lazy"}
                      fetchPriority={i === 0 ? "high" : "low"}
                      onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
                    />
                    {/* Hover overlay with image number */}
                    <div 
                      className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: 'rgba(0,0,128,0.7)' }}
                    >
                      <span className="text-[10px] font-bold text-white" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                        #{i + 1}
                      </span>
                    </div>
                    {/* Small index badge for large collections */}
                    {imagesToDisplay.length > 9 && (
                      <div 
                        className="absolute bottom-0 right-0 px-1 text-[7px] font-bold"
                        style={{
                          background: 'rgba(0,0,0,0.6)',
                          color: '#fff'
                        }}
                      >
                        {i + 1}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <img 
              src={imagesToDisplay[0]} 
              alt="Generated" 
              className="object-contain"
              style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto' }}
              decoding="async"
              fetchPriority="high"
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
            className="w-full max-w-md mx-2 sm:mx-4 max-h-[90vh] sm:max-h-[85vh] flex flex-col"
            style={{
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 0 rgba(0,0,0,0.3)`
            }}
          >
            {/* Title Bar */}
            <div className="flex items-center justify-between px-1 py-0.5" style={{ background: WIN95.activeTitle }}>
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-white" />
                <span className="text-[11px] font-bold text-white" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>New Prompt</span>
              </div>
              <button onClick={closeModal} className="w-4 h-4 flex items-center justify-center text-[10px] font-bold" style={{ ...BTN.base }}>✕</button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2" style={{ background: WIN95.bg }}>
              {error && (
                <div className="p-1.5 flex items-start gap-1.5" style={{ background: WIN95.errorBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
                  <span className="text-[10px]">⚠️</span>
                  <p className="text-[10px] flex-1" style={{ color: WIN95.errorText, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
                </div>
              )}

              {/* Model Selection */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Select Model:</label>
                <div className="flex flex-wrap gap-1">
                  {[
                    { id: 'flux', name: 'FLUX', desc: '1 credit' },
                    { id: 'flux-2', name: 'FLUX 2', desc: '1 credit' },
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
                          background: WIN95.highlight, color: WIN95.highlightText, border: 'none',
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
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
                  <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your New Prompt:</label>
                  <textarea
                    value={newPrompt}
                    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setNewPrompt(e.target.value); setError(null); }}
                    placeholder="Describe how you want to transform this image..."
                    className="w-full h-20 sm:h-24 p-1.5 resize-none text-[11px] focus:outline-none"
                    style={{ 
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                      border: 'none', color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                    autoFocus
                  />
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Current output becomes reference image</p>
                    {/* AI Enhance Toggle */}
                    <label 
                      onClick={() => setOptimizePromptEnabled(!optimizePromptEnabled)}
                      className="flex items-center gap-1.5 cursor-pointer select-none px-1 py-0.5"
                      style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                    >
                      <div 
                        className="w-3.5 h-3.5 flex items-center justify-center"
                        style={{
                          background: WIN95.inputBg,
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
                        }}
                      >
                        {optimizePromptEnabled && (
                          <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>✓</span>
                        )}
                      </div>
                      <Brain className="w-3 h-3" style={{ color: optimizePromptEnabled ? WIN95.highlight : WIN95.textDisabled }} />
                      <span className="text-[10px]" style={{ color: WIN95.text }}>AI Enhance</span>
                    </label>
                  </div>
                </div>
              )}

              {selectedModel === 'qwen-image-layered' && (
                <div className="p-2" style={{ background: WIN95.panelBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
                  <div className="flex items-start gap-2">
                    <Layers className="w-4 h-4" style={{ color: WIN95.successText }} />
                    <div>
                      <p className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Layer Extraction Mode</p>
                      <p className="text-[9px] mt-0.5" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Extract image into separate RGBA layers.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="flex gap-2 p-2 justify-end" style={{ background: WIN95.bg, borderTop: `1px solid ${WIN95.border.dark}` }}>
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={(!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating}
                className="flex items-center gap-1 px-4 py-1.5 text-[11px] font-bold min-w-[100px] justify-center"
                style={((!newPrompt.trim() && selectedModel !== 'qwen-image-layered') || isRegenerating || isGenerating) ? BTN.disabled : {
                  background: WIN95.highlight, color: WIN95.highlightText, border: 'none',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
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
