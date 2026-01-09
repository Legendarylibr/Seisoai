import React, { useState, useCallback, useRef, useMemo } from 'react';
import { Upload, X, Play, Pause, RotateCcw, CheckCircle, AlertCircle, Loader2, Trash2, ChevronDown, ChevronUp, Brain, Shuffle, Sparkles, Copy } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { generateImage } from '../services/smartImageService';
import { WIN95, BTN, hoverHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger';
import { VARIATION_CATEGORIES, generateBatchVariations, getVariationPreview } from '../utils/variationPrompts';

interface QueueItem {
  id: string;
  imageDataUrl: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  error?: string;
  variationPrompt?: string; // The specific variation prompt used for this item
  appliedVariations?: Record<string, string>; // Track which variations were applied
}

interface GenerationQueueProps {
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

const GenerationQueue: React.FC<GenerationQueueProps> = ({ onShowTokenPayment, onShowStripePayment }) => {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);
  
  // Variation mode state
  const [variationMode, setVariationMode] = useState(false);
  const [enabledCategories, setEnabledCategories] = useState<string[]>(['clothing', 'background']);
  const [variationCount, setVariationCount] = useState(4); // How many variations per image
  const [showVariationSettings, setShowVariationSettings] = useState(false);

  const { isConnected, address, credits, isNFTHolder, refreshCredits, setCreditsManually } = useSimpleWallet();
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
  
  const { setGeneratedImage, setCurrentGeneration, selectedStyle, multiImageModel, optimizePrompt, setOptimizePrompt } = useImageGenerator();

  // Generate variation preview text
  const variationPreview = useMemo(() => {
    if (!variationMode || enabledCategories.length === 0) return null;
    return getVariationPreview(prompt || 'your prompt', enabledCategories);
  }, [variationMode, enabledCategories, prompt]);

  // Toggle a category on/off
  const toggleCategory = useCallback((categoryId: string) => {
    setEnabledCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const processFile = (file: File): Promise<QueueItem[]> => {
      return new Promise((resolve) => {
        if (!file.type.startsWith('image/')) {
          resolve([]);
          return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          
          // If variation mode is enabled, create multiple queue items per image
          if (variationMode && enabledCategories.length > 0 && prompt.trim()) {
            const variations = generateBatchVariations(
              prompt.trim(),
              enabledCategories,
              variationCount
            );
            
            const variationItems: QueueItem[] = variations.map((v, index) => ({
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-v${index}`,
              imageDataUrl: dataUrl,
              fileName: `${file.name} (Variation ${index + 1})`,
              status: 'pending' as const,
              variationPrompt: v.prompt,
              appliedVariations: v.variations
            }));
            
            resolve(variationItems);
          } else {
            // Standard single item per image
            resolve([{
              id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              imageDataUrl: dataUrl,
              fileName: file.name,
              status: 'pending' as const
            }]);
          }
        };
        reader.onerror = () => resolve([]);
        reader.readAsDataURL(file);
      });
    };

    Promise.all(Array.from(files).map(processFile)).then((itemsArrays) => {
      const validItems = itemsArrays.flat();
      setQueue(prev => [...prev, ...validItems]);
    });
  }, [variationMode, enabledCategories, variationCount, prompt]);

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

  // Generate variations from a single queue item
  const generateVariationsFromItem = useCallback((sourceItem: QueueItem) => {
    if (!prompt.trim() || enabledCategories.length === 0) return;
    
    const variations = generateBatchVariations(
      prompt.trim(),
      enabledCategories,
      variationCount
    );
    
    const newItems: QueueItem[] = variations.map((v, index) => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-v${index}`,
      imageDataUrl: sourceItem.imageDataUrl,
      fileName: `${sourceItem.fileName.replace(/\s*\(Variation \d+\)/, '')} (Variation ${index + 1})`,
      status: 'pending' as const,
      variationPrompt: v.prompt,
      appliedVariations: v.variations
    }));
    
    setQueue(prev => [...prev, ...newItems]);
  }, [prompt, enabledCategories, variationCount]);

  // Process the queue
  const processQueue = useCallback(async () => {
    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;
    
    // Check if we have items with variation prompts or a base prompt
    const hasVariationsToProcess = pendingItems.some(item => item.variationPrompt);
    if (!prompt.trim() && !hasVariationsToProcess) {
      return;
    }

    setIsProcessing(true);
    setIsPaused(false);
    abortRef.current = false;

    for (const item of pendingItems) {
      if (abortRef.current || isPaused) break;

      // Check credits (using batch premium pricing)
      if (availableCredits < creditsPerImageWithPremium) {
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
        // Use variation prompt if available, otherwise use base prompt
        const promptToUse = item.variationPrompt || prompt.trim();
        
        const result = await generateImage(
          selectedStyle,
          promptToUse,
          {
            walletAddress: isEmailAuth ? undefined : address,
            userId: isEmailAuth ? emailContext.userId : undefined,
            email: isEmailAuth ? emailContext.email : undefined,
            isNFTHolder: isNFTHolder || false,
            multiImageModel: multiImageModel || 'flux'
          },
          item.imageDataUrl
        );

        const imageUrl = Array.isArray(result) ? result[0] : (result.imageUrl || result.images?.[0]);
        
        // Update credits
        if (result.remainingCredits !== undefined) {
          const validated = Math.max(0, Math.floor(Number(result.remainingCredits) || 0));
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

        // Update the main image display with the latest result
        setGeneratedImage(imageUrl);
        setCurrentGeneration({
          prompt: prompt.trim(),
          style: selectedStyle || undefined,
          timestamp: new Date().toISOString()
        });

        logger.info('Queue item processed successfully', { itemId: item.id });

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
  
  // Check if any pending items have variation prompts (can start without main prompt)
  const hasVariationItems = queue.some(i => i.status === 'pending' && i.variationPrompt);

  const isAuthenticated = isConnected || isEmailAuth;

  // Batch pricing: base cost per image + 15% convenience premium
  const BATCH_PREMIUM = 0.15; // 15% premium for batch convenience
  const baseCreditsPerImage = multiImageModel === 'nano-banana-pro' ? 1.25 : 0.6;
  const creditsPerImageWithPremium = baseCreditsPerImage * (1 + BATCH_PREMIUM);
  const totalBatchCost = pendingCount * creditsPerImageWithPremium;
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
        className="flex items-center justify-between px-2 py-1 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          background: 'linear-gradient(90deg, #000080, #1084d0)',
          color: '#ffffff'
        }}
      >
        <div className="flex items-center gap-2">
          <Upload className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Batch Queue
          </span>
          {queue.length > 0 && (
            <span className="text-[9px] opacity-80">
              ({pendingCount} pending, {completedCount} done{failedCount > 0 ? `, ${failedCount} failed` : ''})
            </span>
          )}
        </div>
        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </div>

      {isExpanded && (
        <div className="p-2 space-y-2">
          {/* Prompt Input */}
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

          {/* Variation Mode Toggle */}
          <div 
            className="p-2"
            style={{
              background: variationMode ? 'linear-gradient(180deg, #2d8a2d 0%, #1a5c1a 100%)' : WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
            }}
          >
            <div className="flex items-center justify-between">
              <label 
                onClick={() => setVariationMode(!variationMode)}
                className="flex items-center gap-2 cursor-pointer select-none"
                style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                title="Create multiple variations from one image"
              >
                <div 
                  className="w-4 h-4 flex items-center justify-center"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }}
                >
                  {variationMode && (
                    <span className="text-[11px] font-bold" style={{ color: '#2d8a2d' }}>✓</span>
                  )}
                </div>
                <Shuffle className="w-3.5 h-3.5" style={{ color: variationMode ? '#ffffff' : WIN95.text }} />
                <span className="text-[11px] font-bold" style={{ color: variationMode ? '#ffffff' : WIN95.text }}>
                  🎲 Variation Mode
                </span>
              </label>
              
              {variationMode && (
                <button
                  onClick={() => setShowVariationSettings(!showVariationSettings)}
                  className="px-2 py-0.5 text-[9px]"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                    color: WIN95.text,
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                  }}
                >
                  {showVariationSettings ? '▲ Hide' : '▼ Settings'}
                </button>
              )}
            </div>
            
            {variationMode && (
              <p className="text-[9px] mt-1" style={{ color: variationMode ? 'rgba(255,255,255,0.8)' : WIN95.textDisabled }}>
                Upload one image → Generate {variationCount} random variations
              </p>
            )}
            
            {/* Variation Settings Panel */}
            {variationMode && showVariationSettings && (
              <div 
                className="mt-2 p-2 space-y-2"
                style={{
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              >
                {/* Variation Count */}
                <div>
                  <label className="text-[9px] font-bold block mb-1" style={{ color: WIN95.text }}>
                    Variations per image:
                  </label>
                  <div className="flex gap-1">
                    {[2, 4, 6, 8].map(count => (
                      <button
                        key={count}
                        onClick={() => setVariationCount(count)}
                        className="px-2 py-0.5 text-[10px]"
                        style={{
                          background: variationCount === count ? '#000080' : WIN95.bg,
                          color: variationCount === count ? '#ffffff' : WIN95.text,
                          boxShadow: variationCount === count 
                            ? `inset 1px 1px 0 #0000a0, inset -1px -1px 0 #000060`
                            : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        }}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="text-[10px] font-bold block mb-1.5" style={{ color: WIN95.text }}>
                    Randomize these elements:
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {VARIATION_CATEGORIES.map(category => (
                      <button
                        key={category.id}
                        onClick={() => toggleCategory(category.id)}
                        className="px-2.5 py-1.5 text-[11px] flex items-center gap-1.5"
                        style={{
                          background: enabledCategories.includes(category.id) ? '#000080' : WIN95.bg,
                          color: enabledCategories.includes(category.id) ? '#ffffff' : WIN95.text,
                          boxShadow: enabledCategories.includes(category.id)
                            ? `inset 1px 1px 0 #0000a0, inset -1px -1px 0 #000060`
                            : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        }}
                        title={category.description}
                      >
                        <span className="text-sm">{category.icon}</span>
                        <span>{category.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                {variationPreview && enabledCategories.length > 0 && (
                  <div 
                    className="p-1.5 text-[8px]"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                      color: WIN95.text,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                  >
                    <span className="font-bold">Preview: </span>
                    {variationPreview}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Drop Zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center p-4 cursor-pointer transition-colors"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              border: '2px dashed #808080',
              minHeight: '80px'
            }}
          >
            <Upload className="w-6 h-6 mb-1" style={{ color: WIN95.textDisabled }} />
            <p className="text-[10px] text-center" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Drop images here or click to browse
            </p>
            <p className="text-[9px]" style={{ color: WIN95.textDisabled }}>
              Multiple files supported
            </p>
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
              className="max-h-40 overflow-y-auto space-y-1"
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
                               item.status === 'failed' ? '#ffcccc' : 
                               item.variationPrompt ? '#e8f4e8' : WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                  }}
                  title={item.variationPrompt ? `Prompt: ${item.variationPrompt}` : undefined}
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
                  
                  {/* File name and variations */}
                  <div className="flex-1 min-w-0">
                    <span 
                      className="text-[10px] truncate block"
                      style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                    >
                      {item.fileName}
                    </span>
                    {item.appliedVariations && Object.keys(item.appliedVariations).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {Object.entries(item.appliedVariations).map(([catId, _variation]) => {
                          const cat = VARIATION_CATEGORIES.find(c => c.id === catId);
                          return cat ? (
                            <span 
                              key={catId}
                              className="text-[9px] px-1.5 py-0.5"
                              style={{
                                background: '#000080',
                                color: '#ffffff',
                                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                              }}
                              title={_variation}
                            >
                              {cat.icon}
                            </span>
                          ) : null;
                        })}
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

                  {/* Duplicate with variations button */}
                  {item.status !== 'processing' && !item.variationPrompt && variationMode && enabledCategories.length > 0 && prompt.trim() && (
                    <button
                      onClick={() => generateVariationsFromItem(item)}
                      className="p-0.5"
                      style={BTN.base}
                      {...hoverHandlers}
                      title={`Create ${variationCount} variations`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
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
                disabled={pendingCount === 0 || (!prompt.trim() && !hasVariationItems) || !isAuthenticated || !hasEnoughCredits}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold"
                style={(pendingCount === 0 || (!prompt.trim() && !hasVariationItems) || !isAuthenticated || !hasEnoughCredits) ? BTN.disabled : {
                  background: 'linear-gradient(180deg, #1084d0 0%, #000080 100%)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: `inset 1px 1px 0 #4090e0, inset -1px -1px 0 #000040`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  cursor: 'pointer'
                }}
              >
                <Play className="w-3 h-3" />
                Start ({pendingCount}) • {totalBatchCost.toFixed(1)} credits
              </button>
            ) : (
              <button
                onClick={togglePause}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold"
                style={BTN.base}
                {...hoverHandlers}
              >
                {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                {isPaused ? 'Resume' : 'Pause'}
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

          {/* Batch pricing info */}
          {pendingCount > 0 && (
            <div 
              className="p-1.5 text-[9px]"
              style={{
                background: variationMode ? 'linear-gradient(90deg, #1a5c1a 0%, #2d8a2d 100%)' : WIN95.bgLight,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                color: variationMode ? '#ffffff' : WIN95.text
              }}
            >
              {variationMode && enabledCategories.length > 0 && (
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span className="font-bold">Variation Mode Active</span>
                  <span className="text-[8px] opacity-80">
                    ({enabledCategories.map(id => VARIATION_CATEGORIES.find(c => c.id === id)?.icon).join('')})
                  </span>
                </div>
              )}
              <span className="font-bold">Batch pricing:</span> {creditsPerImageWithPremium.toFixed(2)} credits/image × {pendingCount} = <span className="font-bold">{totalBatchCost.toFixed(1)} total</span>
              <span className="ml-2 text-[8px]" style={{ color: variationMode ? 'rgba(255,255,255,0.7)' : WIN95.textDisabled }}>(includes 15% convenience fee)</span>
            </div>
          )}

          {/* Processing status */}
          {processingItem && (
            <div 
              className="p-1.5 flex items-center gap-2"
              style={{
                background: '#ffffcc',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              <Loader2 className="w-3 h-3 animate-spin" style={{ color: '#000080' }} />
              <span className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                Processing: {processingItem.fileName}
              </span>
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

