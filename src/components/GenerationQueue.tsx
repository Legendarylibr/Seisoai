import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, Play, Pause, RotateCcw, CheckCircle, AlertCircle, Loader2, Trash2, ChevronDown, ChevronUp, Brain, Sparkles, Image, Zap } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { generateImage, batchVariate } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import { WIN95, BTN, hoverHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger';

interface QueueItem {
  id: string;
  imageDataUrl: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  error?: string;
  numImages?: number; // Number of images to generate for this item (only for single image)
}

interface GenerationQueueProps {
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

// Max images allowed from a single source image
const MAX_VARIATIONS = 100;
// Max source images in queue
const MAX_BATCH_SIZE = 100;

const GenerationQueue: React.FC<GenerationQueueProps> = ({ onShowTokenPayment: _onShowTokenPayment, onShowStripePayment }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const [numImages, setNumImages] = useState<number>(1); // Default number of images to generate per single image
  const [progressCount, setProgressCount] = useState(0); // Track completed images in current batch
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const { isConnected, address, credits, isNFTHolder, refreshCredits, setCreditsManually } = useSimpleWallet();
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
  
  const { setGeneratedImage, setCurrentGeneration, selectedStyle, multiImageModel, optimizePrompt, setOptimizePrompt } = useImageGenerator();

  // Handle file selection - now supports up to 100 images
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    // Check current queue size + new files
    const currentPending = queue.filter(i => i.status === 'pending').length;
    const remainingSlots = MAX_BATCH_SIZE - currentPending;
    
    if (remainingSlots <= 0) {
      alert(`Queue is full! Maximum ${MAX_BATCH_SIZE} images allowed. Clear some items first.`);
      return;
    }

    // Only process up to remaining slots
    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    
    if (files.length > remainingSlots) {
      alert(`Only adding ${remainingSlots} of ${files.length} images. Queue limit is ${MAX_BATCH_SIZE}.`);
    }

    const processFile = (file: File): Promise<QueueItem | null> => {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          resolve({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            imageDataUrl: dataUrl,
            fileName: file.name,
            status: 'pending' as const,
            numImages: numImages // Store numImages for single image items
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };

    Promise.all(filesToProcess.map(processFile)).then((items) => {
      const validItems = items.filter((item): item is QueueItem => item !== null);
      setQueue(prev => [...prev, ...validItems]);
    });
  }, [queue, numImages]);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // Remove item from queue
  const removeItem = useCallback((id: string) => {
    setQueue(prev => prev.filter(item => item.id !== id));
  }, []);

  // Clear completed/failed items
  const clearCompleted = useCallback(() => {
    setQueue(prev => prev.filter(item => item.status === 'pending' || item.status === 'processing'));
  }, []);

  // Clear all items
  const clearAll = useCallback(() => {
    if (isProcessing) {
      abortRef.current = true;
      setIsProcessing(false);
    }
    setQueue([]);
  }, [isProcessing]);

  // Retry failed item
  const retryItem = useCallback((id: string) => {
    setQueue(prev => prev.map(item => 
      item.id === id ? { ...item, status: 'pending' as const, error: undefined } : item
    ));
  }, []);

  // Process the queue
  const processQueue = useCallback(async () => {
    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    setIsProcessing(true);
    setIsPaused(false);
    abortRef.current = false;
    setProgressCount(0);

    // Calculate credits per image (inside function to avoid stale closures)
    const BATCH_PREMIUM = 0.15;
    const baseCreditsPerImage = multiImageModel === 'nano-banana-pro' ? 1.25 : 0.6;
    const creditsPerImageWithPremium = baseCreditsPerImage * (1 + BATCH_PREMIUM);

    for (const item of pendingItems) {
      if (abortRef.current || isPaused) break;

      // Determine if this is single image batch mode (AI variation flow)
      const batchCount = (queue.length === 1 && item.numImages && item.numImages > 1) ? item.numImages : 0;
      const isSingleImageBatch = batchCount > 1;
      const imagesToGenerate = isSingleImageBatch ? batchCount : 1;
      
      // Check credits: image generation cost + analysis cost (0.5) for batch mode
      const analysisCost = isSingleImageBatch ? 0.5 : 0;
      const itemCost = (imagesToGenerate * creditsPerImageWithPremium) + analysisCost;
      
      if (availableCredits < itemCost) {
        setQueue(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'failed' as const, error: 'Insufficient credits' } : i
        ));
        break;
      }

      // Update status to processing
      setQueue(prev => prev.map(i => 
        i.id === item.id ? { ...i, status: 'processing' as const } : i
      ));

      try {
        let imageUrls: string[] = [];
        let lastRemainingCredits: number | undefined;

        if (isSingleImageBatch) {
          // AI-powered batch variation flow
          logger.info('Starting AI batch variation', { numOutputs: imagesToGenerate });
          
          // Step 1: Get AI-generated variation prompts
          const variateResult = await batchVariate(item.imageDataUrl, imagesToGenerate);
          
          if (!variateResult.prompts || variateResult.prompts.length === 0) {
            throw new Error('Failed to generate variation prompts');
          }
          
          logger.info('Got variation prompts', { count: variateResult.prompts.length });
          lastRemainingCredits = variateResult.remainingCredits;
          
          // Step 2: Generate each image with its unique prompt
          for (let i = 0; i < variateResult.prompts.length; i++) {
            if (abortRef.current || isPaused) break;
            
            const variationPrompt = variateResult.prompts[i];
            setProgressCount(i + 1);
            
            try {
              const result = await generateImage(
                selectedStyle,
                variationPrompt,
                {
                  walletAddress: isEmailAuth ? undefined : (address || undefined),
                  userId: isEmailAuth ? (emailContext.userId || undefined) : undefined,
                  email: isEmailAuth ? (emailContext.email || undefined) : undefined,
                  isNFTHolder: isNFTHolder || false,
                  multiImageModel: multiImageModel || 'flux',
                  numImages: 1
                },
                item.imageDataUrl
              );
              
              // Extract image URL
              if (Array.isArray(result)) {
                imageUrls.push(...result);
              } else if (result.images && Array.isArray(result.images)) {
                imageUrls.push(...result.images);
              } else if (result.imageUrl) {
                imageUrls.push(result.imageUrl);
              }
              
              if (result.remainingCredits !== undefined) {
                lastRemainingCredits = result.remainingCredits;
              }

              // Update display after each image
              setGeneratedImage(imageUrls.length > 1 ? [...imageUrls] : imageUrls[0]);
              
              // Small delay between generations
              if (i < variateResult.prompts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
              }
            } catch (genError) {
              logger.warn('Single variation failed, continuing', { index: i, error: (genError as Error).message });
            }
          }
        } else {
          // Standard single image generation (no batch)
          const promptToUse = prompt.trim();
          
          const result = await generateImage(
            selectedStyle,
            promptToUse,
            {
              walletAddress: isEmailAuth ? undefined : (address || undefined),
              userId: isEmailAuth ? (emailContext.userId || undefined) : undefined,
              email: isEmailAuth ? (emailContext.email || undefined) : undefined,
              isNFTHolder: isNFTHolder || false,
              multiImageModel: multiImageModel || 'flux',
              numImages: 1
            },
            item.imageDataUrl
          );

          if (Array.isArray(result)) {
            imageUrls = result;
          } else if (result.images && Array.isArray(result.images)) {
            imageUrls = result.images;
          } else if (result.imageUrl) {
            imageUrls = [result.imageUrl];
          }
          
          lastRemainingCredits = result.remainingCredits;
        }
        
        // Get the first image for the queue item display
        const imageUrl = imageUrls[0] || '';
        
        // Update credits
        if (lastRemainingCredits !== undefined) {
          const validated = Math.max(0, Math.floor(Number(lastRemainingCredits) || 0));
          if (isEmailAuth && emailContext.setCreditsManually) {
            emailContext.setCreditsManually(validated);
          } else if (setCreditsManually) {
            setCreditsManually(validated);
          }
        }

        // Update item status
        setQueue(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'completed' as const, resultUrl: imageUrl } : i
        ));

        // Update the main image display with all results
        setGeneratedImage(imageUrls.length > 1 ? imageUrls : imageUrls[0]);
        setCurrentGeneration({
          prompt: isSingleImageBatch ? 'AI-powered variations' : prompt.trim(),
          style: selectedStyle || undefined,
          timestamp: new Date().toISOString()
        });

        // Save all images to gallery (non-blocking)
        const userIdentifier = isEmailAuth ? (emailContext.userId || '') : (address || '');
        
        imageUrls.forEach((imgUrl) => {
          addGeneration(userIdentifier, {
            prompt: isSingleImageBatch ? 'AI variation' : (prompt.trim() || selectedStyle?.prompt || 'No prompt'),
            style: selectedStyle?.name || 'No Style',
            imageUrl: imgUrl,
            creditsUsed: creditsPerImageWithPremium,
            userId: isEmailAuth ? (emailContext.userId || undefined) : undefined,
            email: isEmailAuth ? (emailContext.email || undefined) : undefined
          }).catch(e => logger.debug('Gallery save failed', { error: e instanceof Error ? e.message : 'Unknown error' }));
        });

        logger.info('Queue item processed successfully', { itemId: item.id, imageCount: imageUrls.length });

      } catch (error) {
        const err = error as Error;
        logger.error('Queue item failed', { itemId: item.id, error: err.message });
        
        setQueue(prev => prev.map(i => 
          i.id === item.id ? { ...i, status: 'failed' as const, error: err.message } : i
        ));
      }

      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsProcessing(false);
    setProgressCount(0);
    
    // Refresh credits after processing
    if (isEmailAuth && emailContext.refreshCredits) {
      await emailContext.refreshCredits();
    } else if (refreshCredits && address) {
      await refreshCredits();
    }
  }, [queue, prompt, selectedStyle, multiImageModel, availableCredits, isEmailAuth, emailContext, address, isNFTHolder, refreshCredits, setCreditsManually, setGeneratedImage, setCurrentGeneration, isPaused]);

  // Pause/Resume
  const togglePause = useCallback(() => {
    if (isPaused) {
      setIsPaused(false);
      processQueue();
    } else {
      setIsPaused(true);
      abortRef.current = true;
    }
  }, [isPaused, processQueue]);

  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const completedCount = queue.filter(i => i.status === 'completed').length;
  const failedCount = queue.filter(i => i.status === 'failed').length;
  const processingItem = queue.find(i => i.status === 'processing');

  const isAuthenticated = isConnected || isEmailAuth;

  // Batch pricing: base cost per image + 15% convenience premium
  const BATCH_PREMIUM = 0.15; // 15% premium for batch convenience
  const baseCreditsPerImage = multiImageModel === 'nano-banana-pro' ? 1.25 : 0.6;
  const creditsPerImageWithPremium = baseCreditsPerImage * (1 + BATCH_PREMIUM);
  
  // Calculate total cost: for single image with numImages > 1, multiply by numImages + analysis cost
  const isSingleImageBatchMode = queue.length === 1 && queue[0]?.numImages && queue[0].numImages > 1;
  const totalImagesToGenerate = isSingleImageBatchMode && queue[0]?.numImages
    ? queue[0].numImages 
    : pendingCount;
  const analysisCost = isSingleImageBatchMode ? 0.5 : 0;
  const totalBatchCost = (totalImagesToGenerate * creditsPerImageWithPremium) + analysisCost;
  const hasEnoughCredits = availableCredits >= totalBatchCost;

  return (
    <div 
      style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          background: 'linear-gradient(90deg, #1a237e, #3f51b5, #5c6bc0)',
          color: '#ffffff'
        }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-5 h-5 flex items-center justify-center"
            style={{
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '2px'
            }}
          >
            <Sparkles className="w-3 h-3" />
          </div>
          <div>
            <span className="text-[11px] font-bold block" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Batch Generator
            </span>
            {queue.length > 0 && (
              <span className="text-[9px] opacity-80">
                {queue.length === 1 && queue[0]?.numImages && queue[0].numImages > 1
                  ? `${queue[0].numImages} output images from 1 source`
                  : `${pendingCount} pending, ${completedCount} done${failedCount > 0 ? `, ${failedCount} failed` : ''}`
                }
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {queue.length === 1 && queue[0]?.numImages && queue[0].numImages > 1 && (
            <span 
              className="px-2 py-0.5 text-[9px] font-bold"
              style={{
                background: 'rgba(255,255,255,0.2)',
                borderRadius: '2px'
              }}
            >
              {queue[0].numImages}x
            </span>
          )}
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {isExpanded && (
        <div className="p-2 space-y-2">
          {/* Prompt Input - Only show for multi-image queue (not single image batch) */}
          {queue.length !== 1 && (
            <div>
              <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                Prompt for all images:
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe how to transform all uploaded images..."
                className="w-full h-16 p-1.5 resize-none text-[11px] focus:outline-none"
                style={{ 
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                  border: 'none',
                  color: WIN95.text,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
                disabled={isProcessing}
              />
              {/* AI Enhance Toggle */}
              <div className="flex justify-between items-center mt-1">
                <span 
                  className="text-[9px] px-1.5 py-0.5"
                  style={{ 
                    color: WIN95.textDisabled, 
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }}
                >
                  {prompt.length} chars
                </span>
                <div className="flex items-center gap-2">
                  <label 
                    onClick={() => setOptimizePrompt(!optimizePrompt)}
                    className="flex items-center gap-1.5 cursor-pointer select-none px-1 py-0.5 hover:bg-[#d0d0d0]"
                    style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                    title="Enhance your prompt with AI for better results"
                  >
                    <div 
                      className="w-3.5 h-3.5 flex items-center justify-center"
                      style={{
                        background: WIN95.inputBg,
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
                      }}
                    >
                      {optimizePrompt && (
                        <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>✓</span>
                      )}
                    </div>
                    <Brain className="w-3 h-3" style={{ color: optimizePrompt ? '#800080' : WIN95.textDisabled }} />
                    <span className="text-[10px]" style={{ color: WIN95.text }}>AI Enhance</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Simple Variation UI - Only show when single image is in queue */}
          {queue.length === 1 && (() => {
            const singleItem = queue[0];
            const currentNumImages = singleItem.numImages || numImages;
            const totalCost = currentNumImages * creditsPerImageWithPremium + 0.5; // +0.5 for AI analysis
            
            return (
              <div 
                className="p-3 space-y-3"
                style={{
                  background: 'linear-gradient(180deg, #f5f5f5 0%, #e8e8e8 100%)',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                }}
              >
                {/* Source image + number input row */}
                <div className="flex items-center gap-3">
                  {/* Source thumbnail */}
                  <div className="relative flex-shrink-0">
                    <img 
                      src={singleItem.imageDataUrl} 
                      alt="Source"
                      className="w-14 h-14 object-cover"
                      style={{ boxShadow: `2px 2px 0 ${WIN95.border.darker}` }}
                    />
                    <button
                      onClick={() => setQueue([])}
                      className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center"
                      style={{ background: '#c00', color: '#fff', fontSize: '10px', lineHeight: 1 }}
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>

                  {/* Arrow */}
                  <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#000080' }} />

                  {/* Number of outputs */}
                  <div className="flex-1">
                    <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      How many variations?
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max={MAX_VARIATIONS}
                        value={currentNumImages}
                        onChange={(e) => {
                          const value = Math.min(MAX_VARIATIONS, Math.max(1, parseInt(e.target.value, 10) || 1));
                          setNumImages(value);
                          setQueue(prev => prev.map(item => 
                            item.id === singleItem.id ? { ...item, numImages: value } : item
                          ));
                        }}
                        className="w-16 px-2 py-1 text-[12px] text-center focus:outline-none"
                        style={{ 
                          background: WIN95.inputBg,
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                          border: 'none',
                          color: WIN95.text,
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        }}
                        disabled={isProcessing}
                      />
                      <span className="text-[10px]" style={{ color: WIN95.textDisabled }}>
                        (1-{MAX_VARIATIONS})
                      </span>
                    </div>
                  </div>

                  {/* Cost display */}
                  <div className="text-right flex-shrink-0">
                    <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>Total cost</div>
                    <div className="text-[12px] font-bold" style={{ color: availableCredits >= totalCost ? '#008000' : '#c00' }}>
                      {totalCost.toFixed(1)} ⭐
                    </div>
                  </div>
                </div>

                {/* Info text */}
                <div 
                  className="p-2 text-[9px]"
                  style={{ 
                    background: '#e3f2fd', 
                    color: '#1565c0',
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }}
                >
                  <strong>AI-powered variations:</strong> Same pose & character, different outfits, hair, backgrounds, and styles
                </div>
              </div>
            );
          })()}

          {/* Enhanced Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="relative flex flex-col items-center justify-center p-5 cursor-pointer transition-all group"
            style={{
              background: `linear-gradient(135deg, ${WIN95.inputBg} 0%, #f5f5f5 50%, ${WIN95.inputBg} 100%)`,
              boxShadow: `inset 2px 2px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              border: '2px dashed #6366f1',
              minHeight: '100px',
              borderRadius: '2px'
            }}
          >
            {/* Decorative corner icons */}
            <div className="absolute top-2 left-2 opacity-20">
              <Image className="w-3 h-3" style={{ color: '#000080' }} />
            </div>
            <div className="absolute top-2 right-2 opacity-20">
              <Image className="w-3 h-3" style={{ color: '#000080' }} />
            </div>
            <div className="absolute bottom-2 left-2 opacity-20">
              <Image className="w-3 h-3" style={{ color: '#000080' }} />
            </div>
            <div className="absolute bottom-2 right-2 opacity-20">
              <Image className="w-3 h-3" style={{ color: '#000080' }} />
            </div>
            
            <div 
              className="w-10 h-10 flex items-center justify-center mb-2"
              style={{
                background: 'linear-gradient(180deg, #e8eaf6 0%, #c5cae9 100%)',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
              }}
            >
              <Upload className="w-5 h-5" style={{ color: '#3f51b5' }} />
            </div>
            <p className="text-[11px] text-center font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Drop image{queue.length === 0 ? '' : 's'} here or click to browse
            </p>
            <p className="text-[9px] mt-1" style={{ color: WIN95.textDisabled }}>
              {queue.length === 0 
                ? 'Upload an image to generate up to 100 output images'
                : `${pendingCount}/${MAX_BATCH_SIZE} in queue`
              }
            </p>
            {queue.length === 0 && (
              <div className="flex gap-2 mt-2">
                <span 
                  className="px-2 py-0.5 text-[8px]"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                    color: WIN95.textDisabled
                  }}
                >
                  JPG
                </span>
                <span 
                  className="px-2 py-0.5 text-[8px]"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                    color: WIN95.textDisabled
                  }}
                >
                  PNG
                </span>
                <span 
                  className="px-2 py-0.5 text-[8px]"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                    color: WIN95.textDisabled
                  }}
                >
                  WEBP
                </span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
          />

          {/* Queue List */}
          {queue.length > 0 && (
            <div 
              className="max-h-48 overflow-y-auto space-y-1"
              style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                padding: '4px'
              }}
            >
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-1"
                  style={{
                    background: item.status === 'processing' ? '#ffffcc' : 
                               item.status === 'completed' ? '#ccffcc' :
                               item.status === 'failed' ? '#ffcccc' : WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                  }}
                >
                  {/* Thumbnail */}
                  <img 
                    src={item.resultUrl || item.imageDataUrl} 
                    alt={item.fileName}
                    className="w-10 h-10 object-cover flex-shrink-0"
                    style={{ 
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  />
                  
                  {/* File name and numImages badge */}
                  <div className="flex-1 min-w-0">
                    <span 
                      className="text-[10px] truncate block"
                      style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                    >
                      {item.fileName}
                    </span>
                    {queue.length === 1 && item.numImages && item.numImages > 1 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span 
                          className="text-[8px] px-1.5 py-0.5 inline-flex items-center gap-0.5"
                          style={{
                            background: 'linear-gradient(180deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#ffffff',
                            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                            boxShadow: '1px 1px 0 rgba(0,0,0,0.3)'
                          }}
                        >
                          <Sparkles className="w-2 h-2" />
                          {item.numImages}x outputs
                        </span>
                        {item.status === 'processing' && progressCount > 0 && (
                          <span 
                            className="text-[8px] px-1 py-0.5"
                            style={{
                              background: '#ffffcc',
                              color: '#000080',
                              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                            }}
                          >
                            {progressCount}/{item.numImages}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Status icon */}
                  {item.status === 'pending' && (
                    <div className="w-4 h-4 rounded-full" style={{ background: WIN95.textDisabled }} />
                  )}
                  {item.status === 'processing' && (
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#000080' }} />
                  )}
                  {item.status === 'completed' && (
                    <CheckCircle className="w-4 h-4" style={{ color: '#008000' }} />
                  )}
                  {item.status === 'failed' && (
                    <div className="flex items-center gap-1">
                      <AlertCircle className="w-4 h-4" style={{ color: '#800000' }} />
                      <button
                        onClick={() => retryItem(item.id)}
                        className="p-0.5"
                        style={BTN.base}
                        {...hoverHandlers}
                        title="Retry"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Remove button */}
                  {item.status !== 'processing' && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="p-0.5"
                      style={BTN.base}
                      {...hoverHandlers}
                      title="Remove"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Start/Pause Button */}
            {!isProcessing ? (
              <button
                onClick={processQueue}
                disabled={pendingCount === 0 || !isAuthenticated || !hasEnoughCredits}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold transition-all"
                style={(pendingCount === 0 || !isAuthenticated || !hasEnoughCredits) ? {
                  ...BTN.disabled,
                  padding: '6px 16px'
                } : {
                  background: 'linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: `inset 1px 1px 0 #81c784, inset -1px -1px 0 #1b5e20, 2px 2px 0 rgba(0,0,0,0.2)`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  cursor: 'pointer'
                }}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Generate {totalImagesToGenerate} image{totalImagesToGenerate !== 1 ? 's' : ''}</span>
                <span 
                  className="ml-1 px-1.5 py-0.5 text-[9px]"
                  style={{
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '2px'
                  }}
                >
                  {totalBatchCost.toFixed(1)} credits
                </span>
              </button>
            ) : (
              <button
                onClick={togglePause}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold"
                style={{
                  background: isPaused 
                    ? 'linear-gradient(180deg, #4caf50 0%, #2e7d32 100%)'
                    : 'linear-gradient(180deg, #ff9800 0%, #f57c00 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: isPaused 
                    ? `inset 1px 1px 0 #81c784, inset -1px -1px 0 #1b5e20`
                    : `inset 1px 1px 0 #ffb74d, inset -1px -1px 0 #e65100`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  cursor: 'pointer'
                }}
              >
                {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                {isPaused ? 'Resume Generation' : 'Pause Generation'}
              </button>
            )}

            {/* Clear buttons */}
            {(completedCount > 0 || failedCount > 0) && (
              <button
                onClick={clearCompleted}
                className="flex items-center gap-1 px-2 py-1 text-[10px]"
                style={BTN.base}
                {...hoverHandlers}
              >
                Clear Done
              </button>
            )}
            
            {queue.length > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 px-2 py-1 text-[10px]"
                style={BTN.base}
                {...hoverHandlers}
              >
                <Trash2 className="w-3 h-3" />
                Clear All
              </button>
            )}

            {/* Credits indicator */}
            <div className="flex-1" />
            <div 
              className="flex items-center gap-1 px-2 py-0.5 text-[9px]"
              style={{
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                color: hasEnoughCredits ? WIN95.textDisabled : '#800000'
              }}
            >
              <span>💰</span>
              <span>{availableCredits.toFixed(1)} credits</span>
            </div>
          </div>

          {/* Batch pricing info - only show for multi-image batches */}
          {pendingCount > 0 && queue.length > 1 && (
            <div 
              className="p-2 flex items-center gap-2"
              style={{
                background: 'linear-gradient(180deg, #fff8e1 0%, #ffecb3 100%)',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <div 
                className="w-5 h-5 flex items-center justify-center flex-shrink-0"
                style={{
                  background: '#ff9800',
                  boxShadow: `1px 1px 0 rgba(0,0,0,0.2)`
                }}
              >
                <span className="text-[10px] font-bold text-white">$</span>
              </div>
              <div className="flex-1">
                <div className="text-[10px]" style={{ color: WIN95.text }}>
                  <span className="font-bold">{creditsPerImageWithPremium.toFixed(2)}</span> credits/image × <span className="font-bold">{totalImagesToGenerate}</span> = <span className="font-bold" style={{ color: '#e65100' }}>{totalBatchCost.toFixed(1)} total</span>
                </div>
                <div className="text-[8px]" style={{ color: WIN95.textDisabled }}>
                  Includes 15% batch processing fee
                </div>
              </div>
            </div>
          )}

          {/* Processing status with progress bar */}
          {processingItem && (
            <div 
              className="p-2 space-y-2"
              style={{
                background: 'linear-gradient(180deg, #fffde7 0%, #fff9c4 100%)',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#000080' }} />
                <div className="flex-1">
                  <span className="text-[10px] font-bold block" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    {queue.length === 1 && processingItem.numImages && processingItem.numImages > 1 
                      ? (progressCount === 0 ? 'Analyzing image with AI...' : `Generating variation ${progressCount}/${processingItem.numImages}`)
                      : `Generating: ${processingItem.fileName}`
                    }
                  </span>
                  {queue.length === 1 && processingItem.numImages && processingItem.numImages > 1 && (
                    <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                      {progressCount === 0 ? 'Creating unique prompts for each variation...' : 'Same pose, different style/outfit/background'}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Progress bar for multi-image generation */}
              {queue.length === 1 && processingItem.numImages && processingItem.numImages > 1 && (
                <div>
                  <div 
                    className="h-4 relative overflow-hidden"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 2px 2px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    {/* Actual progress bar */}
                    <div 
                      className="h-full transition-all duration-300"
                      style={{
                        width: `${(progressCount / processingItem.numImages) * 100}%`,
                        background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
                        minWidth: progressCount > 0 ? '20px' : '0'
                      }}
                    />
                    {/* Overlay text */}
                    <div 
                      className="absolute inset-0 flex items-center justify-center text-[9px] font-bold"
                      style={{ 
                        color: progressCount > 0 ? '#fff' : '#333', 
                        textShadow: progressCount > 0 ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                      }}
                    >
                      {progressCount === 0 
                        ? '🔍 Analyzing image...' 
                        : `${progressCount} of ${processingItem.numImages} complete`
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Insufficient credits warning */}
          {isAuthenticated && pendingCount > 0 && !hasEnoughCredits && (
            <div 
              className="p-1.5 flex items-center justify-between gap-2"
              style={{
                background: '#ffcccc',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              <span className="text-[10px]" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                ⚠️ Need {totalBatchCost.toFixed(1)} credits, have {availableCredits.toFixed(1)}
              </span>
              <div className="flex gap-1">
                {onShowStripePayment && (
                  <button
                    onClick={onShowStripePayment}
                    className="px-2 py-0.5 text-[9px]"
                    style={BTN.base}
                    {...hoverHandlers}
                  >
                    Buy Credits
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GenerationQueue;

