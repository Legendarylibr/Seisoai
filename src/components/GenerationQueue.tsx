import React, { useState, useCallback, useRef } from 'react';
import { Upload, X, Play, Pause, RotateCcw, CheckCircle, AlertCircle, Loader2, Trash2, ChevronDown, ChevronUp, Brain } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { generateImage } from '../services/smartImageService';
import { WIN95, BTN, hoverHandlers } from '../utils/buttonStyles';
import logger from '../utils/logger';

interface QueueItem {
  id: string;
  imageDataUrl: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  error?: string;
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

  const { isConnected, address, credits, isNFTHolder, refreshCredits, setCreditsManually } = useSimpleWallet();
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  const availableCredits = isEmailAuth ? (emailContext.credits ?? 0) : (credits ?? 0);
  
  const { setGeneratedImage, setCurrentGeneration, selectedStyle, multiImageModel, optimizePrompt, setOptimizePrompt } = useImageGenerator();

  // Handle file selection
  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files) return;

    const newItems: QueueItem[] = [];
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
            status: 'pending'
          });
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    };

    Promise.all(Array.from(files).map(processFile)).then((items) => {
      const validItems = items.filter((item): item is QueueItem => item !== null);
      setQueue(prev => [...prev, ...validItems]);
    });
  }, []);

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
    if (!prompt.trim()) {
      return;
    }

    const pendingItems = queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

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
        const result = await generateImage(
          selectedStyle,
          prompt.trim(),
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
                               item.status === 'failed' ? '#ffcccc' : WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                  }}
                >
                  {/* Thumbnail */}
                  <img 
                    src={item.resultUrl || item.imageDataUrl} 
                    alt={item.fileName}
                    className="w-8 h-8 object-cover"
                    style={{ 
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  />
                  
                  {/* File name */}
                  <span 
                    className="flex-1 text-[10px] truncate"
                    style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                  >
                    {item.fileName}
                  </span>

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
                disabled={pendingCount === 0 || !prompt.trim() || !isAuthenticated || !hasEnoughCredits}
                className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold"
                style={(pendingCount === 0 || !prompt.trim() || !isAuthenticated || !hasEnoughCredits) ? BTN.disabled : {
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
                background: WIN95.bgLight,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                color: WIN95.text
              }}
            >
              <span className="font-bold">Batch pricing:</span> {creditsPerImageWithPremium.toFixed(2)} credits/image × {pendingCount} = <span className="font-bold">{totalBatchCost.toFixed(1)} total</span>
              <span className="ml-2 text-[8px]" style={{ color: WIN95.textDisabled }}>(includes 15% convenience fee)</span>
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

