/**
 * ChatAssistant - Full-page GPT-style chat interface for AI generation
 * Provides a conversational way to generate images, videos, and music
 * Optimized for usability with modern UX patterns
 */
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { 
  Send, Sparkles, Image, Film, Music, Download, 
  Play, Pause, Check, X, RefreshCw, Volume2,
  Wand2, Zap, Clock, AlertCircle, Maximize2, User,
  Upload, ImagePlus, LogOut
} from 'lucide-react';
import { WIN95, BTN, PANEL, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import AuthPrompt from './AuthPrompt';
import { 
  sendChatMessage, 
  executeGeneration, 
  getWelcomeMessage,
  generateMessageId,
  IMAGE_MODELS,
  VIDEO_MODELS,
  ASPECT_RATIOS,
  type ChatMessage, 
  type PendingAction,
  type ChatContext,
} from '../services/chatAssistantService';
import logger from '../utils/logger';
import Panorama360Viewer from './Panorama360Viewer';

interface ChatAssistantProps {
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

// Animated typing indicator
const TypingIndicator = memo(function TypingIndicator() {
  return (
    <div className="flex items-center gap-1 px-2 py-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              animationDelay: `${i * 0.15}s`,
              animationDuration: '0.6s'
            }}
          />
        ))}
      </div>
      <span className="text-[10px] ml-1" style={{ color: WIN95.textDisabled }}>
        AI is thinking...
      </span>
    </div>
  );
});

// Generation progress indicator
const GenerationProgress = memo(function GenerationProgress({ type }: { type: string }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('Starting...');
  
  useEffect(() => {
    const phases = type === 'video' 
      ? ['Initializing...', 'Processing frames...', 'Rendering...', 'Almost done...']
      : type === 'music'
      ? ['Composing...', 'Arranging...', 'Mixing...', 'Finalizing...']
      : ['Imagining...', 'Creating...', 'Enhancing...', 'Finishing...'];
    
    let current = 0;
    const interval = setInterval(() => {
      current += Math.random() * 15 + 5;
      if (current > 95) current = 95;
      setProgress(current);
      setPhase(phases[Math.min(Math.floor(current / 25), phases.length - 1)]);
    }, 800);
    
    return () => clearInterval(interval);
  }, [type]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 relative">
          <div 
            className="absolute inset-0 rounded-full animate-spin"
            style={{ 
              border: '2px solid transparent',
              borderTopColor: '#667eea',
              borderRightColor: '#764ba2'
            }} 
          />
        </div>
        <span className="text-[11px] font-medium">{phase}</span>
      </div>
      <div 
        className="h-2 rounded-full overflow-hidden"
        style={{ background: WIN95.bgDark }}
      >
        <div 
          className="h-full transition-all duration-500 ease-out"
          style={{ 
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
          }}
        />
      </div>
      <p className="text-[9px]" style={{ color: WIN95.textDisabled }}>
        {type === 'video' ? 'Videos typically take 1-3 minutes' : 
         type === 'music' ? 'Music generation takes about 30 seconds' :
         'Images are ready in seconds'}
      </p>
    </div>
  );
});

// Lightbox for viewing images fullscreen (with 360 panorama support)
const ImageLightbox = memo(function ImageLightbox({ 
  src, 
  onClose,
  is360 = false,
  onDownload
}: { 
  src: string; 
  onClose: () => void;
  is360?: boolean;
  onDownload?: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  // For 360 panoramas, use the interactive viewer
  if (is360) {
    return (
      <div 
        className="fixed inset-0 z-[9999]"
        style={{ background: 'rgba(0,0,0,0.95)' }}
      >
        <Panorama360Viewer 
          src={src} 
          onClose={onClose}
          onDownload={onDownload}
        />
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.9)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white transition-colors"
      >
        <X className="w-6 h-6" />
      </button>
      <img 
        src={src} 
        alt="Fullscreen preview"
        className="max-w-[95vw] max-h-[95vh] object-contain"
        style={{ boxShadow: '0 0 40px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[10px] text-white/50">
        Press ESC or click outside to close
      </div>
    </div>
  );
});

// Message bubble component
const MessageBubble = memo(function MessageBubble({ 
  message, 
  onConfirmAction,
  onCancelAction,
  onRetry,
  isActionLoading,
  isFirst
}: { 
  message: ChatMessage;
  onConfirmAction?: (action: PendingAction) => void;
  onCancelAction?: () => void;
  onRetry?: () => void;
  isActionLoading?: boolean;
  isFirst?: boolean;
}) {
  const isUser = message.role === 'user';
  const [isPlaying, setIsPlaying] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxIs360, setLightboxIs360] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('square');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check if this is a 360 panorama request (for pending action)
  const is360Request = message.pendingAction?.params?.prompt 
    ? /\b360\b/i.test(message.pendingAction.params.prompt)
    : false;
    
  // Check if generated content was from a 360 request (check message content for 360 indicator)
  const is360Generated = message.content ? /\b360\b/i.test(message.content) : false;

  // Get available models based on action type
  // Skip model selection for 360 requests - always uses nano-banana-pro
  const getModels = () => {
    if (!message.pendingAction) return [];
    if (is360Request) return []; // 360 requests always use nano-banana-pro, no selection needed
    if (message.pendingAction.type === 'generate_image') return IMAGE_MODELS;
    if (message.pendingAction.type === 'generate_video') return VIDEO_MODELS;
    return [];
  };

  // Handle confirm with selected model and aspect ratio
  const handleConfirmWithModel = () => {
    if (!message.pendingAction || !onConfirmAction) return;
    
    // For 360 requests, always use nano-banana-pro with 16:9 landscape
    if (is360Request) {
      const actionWith360Model: PendingAction = {
        ...message.pendingAction,
        params: {
          ...message.pendingAction.params,
          model: 'nano-banana-pro',
          imageSize: 'landscape_16_9'
        }
      };
      onConfirmAction(actionWith360Model);
      return;
    }
    
    const models = getModels();
    const modelToUse = selectedModel || (models.length > 0 ? models[0].id : undefined);
    
    const actionWithModel: PendingAction = {
      ...message.pendingAction,
      params: {
        ...message.pendingAction.params,
        model: modelToUse,
        // Add aspect ratio for image generation
        ...(message.pendingAction.type === 'generate_image' && { imageSize: selectedAspectRatio })
      }
    };
    
    onConfirmAction(actionWithModel);
  };

  const handleDownload = async (url: string, type: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `seiso-${type}-${Date.now()}.${type === 'music' ? 'mp3' : type === 'video' ? 'mp4' : 'png'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      logger.error('Download failed', { error: (err as Error).message });
    }
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div 
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4 animate-fadeIn`}
        style={{ 
          animationDelay: isFirst ? '0s' : '0.1s',
          opacity: 0,
          animation: 'fadeSlideIn 0.3s ease forwards'
        }}
      >
        {/* Avatar for assistant */}
        {!isUser && (
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center mr-2 flex-shrink-0"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        )}

        <div className={`max-w-[88%] sm:max-w-[80%] lg:max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Message bubble */}
          <div
            style={{
              background: isUser 
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : WIN95.bg,
              color: isUser ? '#fff' : WIN95.text,
              boxShadow: isUser 
                ? '0 2px 8px rgba(102, 126, 234, 0.3)'
                : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 2px 2px 0 rgba(0,0,0,0.1)`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px'
            }}
          >
            {/* Message content - compact on mobile */}
            <div className="px-3 py-2 sm:px-4 sm:py-3">
              {message.isLoading ? (
                message.content.includes('Generating') ? (
                  <GenerationProgress type={
                    message.content.includes('video') ? 'video' :
                    message.content.includes('music') ? 'music' : 'image'
                  } />
                ) : (
                  <TypingIndicator />
                )
              ) : message.error ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2 text-[12px]" style={{ color: '#ef4444' }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{message.error}</span>
                  </div>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-medium"
                      style={{
                        ...BTN.base,
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff'
                      }}
                    >
                      <RefreshCw className="w-3 h-3" /> Try again
                    </button>
                  )}
                </div>
              ) : (
                <div 
                  className="text-[13px] leading-relaxed"
                  dangerouslySetInnerHTML={{ 
                    __html: message.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/•/g, '<span style="color: #667eea">•</span>')
                      .replace(/\n/g, '<br>')
                  }}
                />
              )}

              {/* Pending action confirmation - redesigned card with model selector */}
              {message.pendingAction && !message.generatedContent && !message.isLoading && (
                <div 
                  className="mt-3 sm:mt-4 p-2.5 sm:p-4 rounded-lg"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)',
                    border: '1px solid rgba(102,126,234,0.3)'
                  }}
                >
                  {/* Header with icon - compact on mobile */}
                  <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <div 
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: message.pendingAction.type === 'generate_image' ? '#22c55e' :
                                   message.pendingAction.type === 'generate_video' ? '#3b82f6' : '#ec4899'
                      }}
                    >
                      {message.pendingAction.type === 'generate_image' && <Image className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                      {message.pendingAction.type === 'generate_video' && <Film className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                      {message.pendingAction.type === 'generate_music' && <Music className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] sm:text-[12px] font-bold truncate">{message.pendingAction.description}</div>
                      <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-[10px] flex-wrap" style={{ color: WIN95.textDisabled }}>
                        <span className="flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          {message.pendingAction.estimatedCredits} cr
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          {message.pendingAction.type === 'generate_video' ? '1-3m' :
                           message.pendingAction.type === 'generate_music' ? '~30s' : '~10s'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 360 Panorama indicator - no model selection needed */}
                  {is360Request && message.pendingAction?.type === 'generate_image' && (
                    <div 
                      className="mb-3 sm:mb-4 p-2 sm:p-3 rounded-lg flex items-center gap-2"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(22, 163, 74, 0.15) 100%)',
                        border: '1px solid rgba(34, 197, 94, 0.3)'
                      }}
                    >
                      <div className="text-lg">🌐</div>
                      <div>
                        <div className="text-[10px] sm:text-[11px] font-bold" style={{ color: '#16a34a' }}>
                          360° Panorama Mode
                        </div>
                        <div className="text-[8px] sm:text-[9px]" style={{ color: WIN95.textDisabled }}>
                          Using Nano Banana Pro for best results
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Model Selector - for images and videos - compact on mobile */}
                  {getModels().length > 0 && (
                    <div className="mb-3 sm:mb-4">
                      <div className="text-[9px] sm:text-[10px] font-bold mb-1.5 sm:mb-2" style={{ color: WIN95.text }}>
                        Choose Model:
                      </div>
                      <div className="grid gap-1.5 sm:gap-2">
                        {getModels().map((model) => (
                          <button
                            key={model.id}
                            onClick={() => setSelectedModel(model.id)}
                            className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg text-left transition-all"
                            style={{
                              background: (selectedModel || getModels()[0].id) === model.id 
                                ? 'linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)'
                                : WIN95.bgLight,
                              border: (selectedModel || getModels()[0].id) === model.id 
                                ? '2px solid #667eea'
                                : `1px solid ${WIN95.border.dark}`,
                              cursor: 'pointer'
                            }}
                          >
                            <div 
                              className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                border: `2px solid ${(selectedModel || getModels()[0].id) === model.id ? '#667eea' : WIN95.border.dark}`,
                                background: (selectedModel || getModels()[0].id) === model.id ? '#667eea' : 'transparent'
                              }}
                            >
                              {(selectedModel || getModels()[0].id) === model.id && (
                                <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] sm:text-[11px] font-bold truncate" style={{ color: WIN95.text }}>
                                {model.name}
                              </div>
                              <div className="text-[8px] sm:text-[9px] truncate" style={{ color: WIN95.textDisabled }}>
                                {model.description}
                                {' • '}
                                {'credits' in model ? `${model.credits} cr` : `${(model as { creditsPerSec: number }).creditsPerSec}/s`}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Aspect Ratio Selector - for images only */}
                  {message.pendingAction?.type === 'generate_image' && !is360Request && (
                    <div className="mb-3 sm:mb-4">
                      <div className="text-[9px] sm:text-[10px] font-bold mb-1.5 sm:mb-2" style={{ color: WIN95.text }}>
                        Aspect Ratio:
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 sm:gap-1.5">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio.id}
                            onClick={() => setSelectedAspectRatio(ratio.id)}
                            className="flex flex-col items-center p-1.5 sm:p-2 rounded-lg transition-all"
                            style={{
                              background: selectedAspectRatio === ratio.id 
                                ? 'linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)'
                                : WIN95.bgLight,
                              border: selectedAspectRatio === ratio.id 
                                ? '2px solid #667eea'
                                : `1px solid ${WIN95.border.dark}`,
                              cursor: 'pointer'
                            }}
                          >
                            <span className="text-sm sm:text-base">{ratio.icon}</span>
                            <span className="text-[8px] sm:text-[9px] font-bold" style={{ color: WIN95.text }}>
                              {ratio.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons - compact on mobile */}
                  <div className="flex gap-1.5 sm:gap-2">
                    <button
                      onClick={handleConfirmWithModel}
                      disabled={isActionLoading}
                      className="flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 text-[11px] sm:text-[12px] font-bold rounded-lg transition-all"
                      style={{
                        background: isActionLoading 
                          ? WIN95.buttonFace 
                          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        color: isActionLoading ? WIN95.textDisabled : '#fff',
                        boxShadow: isActionLoading ? 'none' : '0 2px 8px rgba(34, 197, 94, 0.3)',
                        cursor: isActionLoading ? 'wait' : 'pointer'
                      }}
                    >
                      {isActionLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span className="hidden sm:inline">Generating...</span>
                          <span className="sm:hidden">Wait...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="hidden sm:inline">Create Now</span>
                          <span className="sm:hidden">Create</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={onCancelAction}
                      disabled={isActionLoading}
                      className="px-2.5 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-[11px] rounded-lg transition-opacity"
                      style={{ 
                        ...BTN.base, 
                        opacity: isActionLoading ? 0.5 : 1,
                        borderRadius: '8px'
                      }}
                    >
                      <span className="hidden sm:inline">Cancel</span>
                      <X className="w-3.5 h-3.5 sm:hidden" />
                    </button>
                  </div>
                </div>
              )}

              {/* Generated content display */}
              {message.generatedContent && (
                <div className="mt-4">
                  {/* Success header */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                    <span className="text-[11px] font-medium text-green-600">Created successfully!</span>
                  </div>

                  {/* Images */}
                  {message.generatedContent.type === 'image' && (
                    <div className={`grid gap-2 ${message.generatedContent.urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {message.generatedContent.urls.map((url, i) => (
                        <div key={i} className="relative group rounded-lg overflow-hidden">
                          {/* 360 Panorama badge */}
                          {is360Generated && (
                            <div 
                              className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full"
                              style={{ 
                                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
                              }}
                            >
                              <span className="text-[9px]">🌐</span>
                              <span className="text-[9px] text-white font-bold">360°</span>
                            </div>
                          )}
                          <img 
                            src={url} 
                            alt={`Generated ${i + 1}`}
                            className="w-full cursor-pointer transition-transform hover:scale-[1.02]"
                            style={{ 
                              maxHeight: '280px', 
                              objectFit: 'cover',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                            }}
                            onClick={() => {
                              setLightboxImage(url);
                              setLightboxIs360(is360Generated);
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setLightboxImage(url);
                                setLightboxIs360(is360Generated);
                              }}
                              className="p-2 rounded-lg backdrop-blur-sm transition-colors"
                              style={{ background: 'rgba(255,255,255,0.9)' }}
                              title={is360Generated ? "View 360° panorama" : "View fullscreen"}
                            >
                              <Maximize2 className="w-4 h-4 text-gray-700" />
                            </button>
                            <button
                              onClick={() => handleDownload(url, 'image')}
                              className="p-2 rounded-lg backdrop-blur-sm transition-colors"
                              style={{ background: 'rgba(255,255,255,0.9)' }}
                              title="Download"
                            >
                              <Download className="w-4 h-4 text-gray-700" />
                            </button>
                          </div>
                          {/* 360 interaction hint */}
                          {is360Generated && (
                            <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.7)' }}>
                              <span className="text-[9px] text-white">Click to explore 360°</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Videos */}
                  {message.generatedContent.type === 'video' && message.generatedContent.urls[0] && (
                    <div className="space-y-2">
                      <div className="relative rounded-lg overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                        <video
                          ref={videoRef}
                          src={message.generatedContent.urls[0]}
                          controls
                          loop
                          playsInline
                          className="w-full"
                          style={{ maxHeight: '280px' }}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (videoRef.current) {
                              isPlaying ? videoRef.current.pause() : videoRef.current.play();
                            }
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg"
                          style={BTN.base}
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          {isPlaying ? 'Pause' : 'Play'}
                        </button>
                        <button
                          onClick={() => handleDownload(message.generatedContent!.urls[0], 'video')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg"
                          style={BTN.base}
                        >
                          <Download className="w-3.5 h-3.5" /> Download
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Music */}
                  {message.generatedContent.type === 'music' && message.generatedContent.urls[0] && (
                    <div 
                      className="p-4 rounded-lg"
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(236,72,153,0.1) 0%, rgba(168,85,247,0.1) 100%)',
                        border: '1px solid rgba(236,72,153,0.2)'
                      }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center">
                          <Volume2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-[12px] font-bold">Your Track</div>
                          <div className="text-[10px]" style={{ color: WIN95.textDisabled }}>AI Generated Music</div>
                        </div>
                      </div>
                      <audio
                        src={message.generatedContent.urls[0]}
                        controls
                        className="w-full h-10 rounded"
                      />
                      <button
                        onClick={() => handleDownload(message.generatedContent!.urls[0], 'music')}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] mt-3 rounded-lg"
                        style={BTN.base}
                      >
                        <Download className="w-3.5 h-3.5" /> Download MP3
                      </button>
                    </div>
                  )}

                  {/* Credits info */}
                  {message.generatedContent.creditsUsed !== undefined && (
                    <div className="flex items-center gap-2 mt-3 text-[10px]" style={{ color: WIN95.textDisabled }}>
                      <Zap className="w-3 h-3" />
                      <span>{message.generatedContent.creditsUsed} credits used</span>
                      <span>•</span>
                      <span>{message.generatedContent.remainingCredits} remaining</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <div className="mt-1 px-2 text-[9px]" style={{ color: WIN95.textDisabled }}>
            {formatTime(message.timestamp)}
          </div>
        </div>

        {/* Avatar for user */}
        {isUser && (
          <div 
            className="w-8 h-8 rounded-full flex items-center justify-center ml-2 flex-shrink-0"
            style={{ 
              background: WIN95.highlight,
              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
            }}
          >
            <User className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxImage && (
        <ImageLightbox 
          src={lightboxImage} 
          onClose={() => {
            setLightboxImage(null);
            setLightboxIs360(false);
          }}
          is360={lightboxIs360}
          onDownload={() => handleDownload(lightboxImage, 'image')}
        />
      )}

      {/* CSS for animations */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
});

// Quick action chips
const QuickActions = memo(function QuickActions({ onSelect }: { onSelect: (text: string) => void }) {
  const actions = [
    { icon: '🎨', label: 'Image', prompt: 'Create an image of ' },
    { icon: '🎬', label: 'Video', prompt: 'Generate a video of ' },
    { icon: '🎵', label: 'Music', prompt: 'Make a ' },
  ];

  return (
    <div className="flex gap-1.5 sm:gap-2 mb-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onSelect(action.prompt)}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 text-[10px] rounded-full transition-all hover:scale-105 flex-shrink-0"
          style={{
            background: WIN95.bgLight,
            border: `1px solid ${WIN95.border.dark}`,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <span>{action.icon}</span>
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
});

// Main component
const ChatAssistant = memo<ChatAssistantProps>(function ChatAssistant({
  onShowTokenPayment: _onShowTokenPayment,
  onShowStripePayment: _onShowStripePayment
}) {
  const emailContext = useEmailAuth();
  const walletContext = useSimpleWallet();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isConnected = isEmailAuth || walletContext.isConnected;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputValue]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [messages]);

  // Load welcome message on mount
  useEffect(() => {
    getWelcomeMessage().then(({ message, suggestions: sug }) => {
      setMessages([{
        id: generateMessageId(),
        role: 'assistant',
        content: message,
        timestamp: new Date().toISOString()
      }]);
      setSuggestions(sug);
    });
  }, []);

  // Build context for API calls
  const getContext = useCallback((): ChatContext => ({
    userId: emailContext.userId || undefined,
    walletAddress: walletContext.address || undefined,
    email: emailContext.email || undefined,
    credits: emailContext.credits ?? walletContext.credits
  }), [emailContext, walletContext]);

  // Handle image upload for reference
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      logger.warn('Invalid file type for image upload');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      logger.warn('Image file too large');
      return;
    }
    
    setIsUploadingImage(true);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        setAttachedImage(result);
      }
      setIsUploadingImage(false);
    };
    reader.onerror = () => {
      logger.error('Failed to read image file');
      setIsUploadingImage(false);
    };
    reader.readAsDataURL(file);
    
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, []);

  // Remove attached image
  const handleRemoveImage = useCallback(() => {
    setAttachedImage(null);
  }, []);

  // Send message handler
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !isConnected) return;

    // Build message content - include image reference indicator if attached
    const messageContent = attachedImage 
      ? `[Image attached] ${inputValue.trim()}`
      : inputValue.trim();

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString()
    };

    const loadingMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    // Store the attached image before clearing
    const imageToSend = attachedImage;

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setAttachedImage(null);
    setIsLoading(true);
    setSuggestions([]);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    try {
      const response = await sendChatMessage(
        userMessage.content,
        messages,
        getContext(),
        imageToSend || undefined
      );

      // Debug logging
      console.log('[ChatAssistant] Response received:', {
        message: response.message?.substring(0, 100),
        hasAction: !!response.action,
        actionType: response.action?.type,
        error: response.error
      });

      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id
          ? {
              ...msg,
              content: response.message || '',
              isLoading: false,
              error: response.error,
              pendingAction: response.action
            }
          : msg
      ));
    } catch (err) {
      setMessages(prev => prev.map(msg =>
        msg.id === loadingMessage.id
          ? { ...msg, isLoading: false, error: (err as Error).message }
          : msg
      ));
    }

    setIsLoading(false);
  }, [inputValue, isLoading, isConnected, messages, getContext]);

  // Confirm generation action
  const handleConfirmAction = useCallback(async (action: PendingAction) => {
    if (isGenerating) return;
    
    setIsGenerating(true);

    const generatingMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: `Generating your ${action.type.replace('generate_', '')}...`,
      timestamp: new Date().toISOString(),
      isLoading: true
    };
    
    setMessages(prev => [...prev, generatingMessage]);

    try {
      const response = await executeGeneration(action, getContext());

      setMessages(prev => prev.map(msg =>
        msg.id === generatingMessage.id
          ? {
              ...msg,
              content: '',
              isLoading: false,
              generatedContent: response.generatedContent,
              error: response.error
            }
          : msg
      ));

      // Refresh credits
      if (isEmailAuth && emailContext.refreshCredits) {
        emailContext.refreshCredits();
      } else if (walletContext.fetchCredits && walletContext.address) {
        walletContext.fetchCredits(walletContext.address, 3, true);
      }
    } catch (err) {
      setMessages(prev => prev.map(msg =>
        msg.id === generatingMessage.id
          ? { ...msg, isLoading: false, error: (err as Error).message }
          : msg
      ));
    }

    setIsGenerating(false);
  }, [isGenerating, getContext, isEmailAuth, emailContext, walletContext]);

  // Cancel pending action
  const handleCancelAction = useCallback(() => {
    setMessages(prev => [...prev, {
      id: generateMessageId(),
      role: 'assistant',
      content: 'No problem! What else would you like to create?',
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // Handle suggestion click
  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  }, []);

  // Handle quick action
  const handleQuickAction = useCallback((prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  }, []);

  // Clear chat
  const handleClearChat = useCallback(() => {
    getWelcomeMessage().then(({ message, suggestions: sug }) => {
      setMessages([{
        id: generateMessageId(),
        role: 'assistant',
        content: message,
        timestamp: new Date().toISOString()
      }]);
      setSuggestions(sug);
    });
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="h-full flex flex-col relative" style={{ background: 'linear-gradient(135deg, #1a3a4a 0%, #0f2027 100%)' }}>
      {/* Sign-in overlay when not connected */}
      {!isConnected && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'rgba(15, 32, 39, 0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)'
          }}
        >
          <div className="w-full h-full overflow-auto">
            <AuthPrompt />
          </div>
        </div>
      )}
      
      {/* Main chat window - optimized margins on mobile */}
      <div 
        className="flex-1 mx-1 sm:mx-2 lg:mx-4 mt-1 sm:mt-2 flex flex-col min-h-0 rounded-lg overflow-hidden"
        style={{
          ...PANEL.window,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          filter: !isConnected ? 'blur(2px)' : 'none',
          opacity: !isConnected ? 0.75 : 1,
          transition: 'filter 0.3s ease, opacity 0.3s ease'
        }}
      >
        {/* Title bar - compact on mobile */}
        <div 
          className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-1.5 sm:py-2 flex-shrink-0"
          style={{
            ...WINDOW_TITLE_STYLE,
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
          }}
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] sm:text-[13px] font-bold">AI Assistant</span>
            <span className="text-[9px] sm:text-[10px] ml-1 sm:ml-2 opacity-70 hidden sm:inline">Images • Videos • Music</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
            {isConnected && (
              <>
                <div 
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px]"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span className="hidden xs:inline">{emailContext.credits ?? walletContext.credits ?? 0}</span>
                  <span className="xs:hidden">{emailContext.credits ?? walletContext.credits ?? 0}</span>
                </div>
                <button
                  onClick={handleClearChat}
                  className="p-1 sm:p-1.5 rounded hover:bg-white/20 transition-colors"
                  title="New conversation"
                >
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={async () => {
                    if (isEmailAuth) {
                      await emailContext.signOut();
                    } else if (walletContext.disconnect) {
                      walletContext.disconnect();
                    }
                  }}
                  className="p-1 sm:p-1.5 rounded hover:bg-white/20 transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Messages area - compact on mobile */}
        <div 
          className="flex-1 overflow-y-auto px-2 py-2 sm:px-4 sm:py-4 min-h-0"
          style={{ 
            background: WIN95.inputBg
          }}
        >
          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirmAction={handleConfirmAction}
              onCancelAction={handleCancelAction}
              isActionLoading={isGenerating}
              isFirst={i === 0}
            />
          ))}
          <div ref={messagesEndRef} />

          {/* Suggestions - optimized for mobile */}
          {suggestions.length > 0 && messages.length <= 1 && (
            <div className="mt-4 sm:mt-6 mb-2 sm:mb-4">
              <div className="text-center mb-2 sm:mb-3 text-[10px] sm:text-[11px]" style={{ color: WIN95.textDisabled }}>
                Try one of these:
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5 sm:gap-2 sm:justify-center">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-3 py-2 sm:px-4 sm:py-2.5 text-[10px] sm:text-[11px] sm:max-w-[220px] text-left rounded-lg sm:rounded-xl transition-all hover:scale-[1.02] hover:shadow-lg"
                    style={{
                      background: WIN95.bg,
                      border: `1px solid ${WIN95.border.dark}`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                  >
                    <span className="mr-1">💡</span>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input area - compact on mobile */}
        <div 
          className="p-2 sm:p-4 flex-shrink-0"
          style={{ 
            background: WIN95.bg,
            borderTop: `1px solid ${WIN95.border.dark}`
          }}
        >
          {isConnected && (
            <>
              <QuickActions onSelect={handleQuickAction} />
              
              {/* Attached image preview - compact on mobile */}
              {attachedImage && (
                <div 
                  className="mb-2 p-1.5 sm:p-2 rounded-lg flex items-center gap-2 sm:gap-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)',
                    border: '1px solid rgba(102,126,234,0.3)'
                  }}
                >
                  <div className="relative flex-shrink-0">
                    <img 
                      src={attachedImage} 
                      alt="Attached reference"
                      className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg"
                      style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                    />
                    <button
                      onClick={handleRemoveImage}
                      className="absolute -top-1 -right-1 sm:-top-1.5 sm:-right-1.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center"
                      style={{ 
                        background: '#ef4444',
                        color: '#fff',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                    >
                      <X className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                    </button>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] sm:text-[11px] font-medium truncate" style={{ color: WIN95.text }}>
                      📷 Image attached
                    </div>
                    <div className="text-[8px] sm:text-[9px] hidden sm:block" style={{ color: WIN95.textDisabled }}>
                      The AI will use this for image-to-image or video generation
                    </div>
                  </div>
                </div>
              )}
              
              <div className="flex gap-1.5 sm:gap-2 items-end">
                {/* Image upload button - smaller on mobile */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isGenerating || isUploadingImage}
                  className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-lg sm:rounded-xl transition-all flex-shrink-0"
                  style={{
                    background: attachedImage 
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : WIN95.bgLight,
                    color: attachedImage ? '#fff' : WIN95.text,
                    border: `1px solid ${WIN95.border.dark}`,
                    cursor: (isLoading || isGenerating || isUploadingImage) ? 'default' : 'pointer',
                    opacity: (isLoading || isGenerating) ? 0.5 : 1
                  }}
                  title="Attach reference image"
                >
                  {isUploadingImage ? (
                    <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : attachedImage ? (
                    <Check className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  ) : (
                    <ImagePlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                
                <div 
                  className="flex-1 rounded-lg sm:rounded-xl overflow-hidden min-w-0"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 0 2px 4px rgba(0,0,0,0.1)`,
                    border: `1px solid ${WIN95.border.dark}`
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={attachedImage ? "Describe what to do..." : "What do you want to create?"}
                    disabled={isLoading || isGenerating}
                    rows={1}
                    className="w-full px-3 py-2.5 sm:px-4 sm:py-3 text-[12px] sm:text-[13px] resize-none focus:outline-none"
                    style={{
                      background: 'transparent',
                      color: WIN95.text,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                      minHeight: '36px',
                      maxHeight: '100px'
                    }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading || isGenerating}
                  className="w-9 h-9 sm:w-11 sm:h-11 flex items-center justify-center rounded-lg sm:rounded-xl transition-all flex-shrink-0"
                  style={{
                    background: (!inputValue.trim() || isLoading || isGenerating) 
                      ? WIN95.buttonFace 
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: (!inputValue.trim() || isLoading || isGenerating) 
                      ? WIN95.textDisabled 
                      : '#fff',
                    boxShadow: (!inputValue.trim() || isLoading || isGenerating)
                      ? 'none'
                      : '0 4px 12px rgba(102, 126, 234, 0.4)',
                    cursor: (!inputValue.trim() || isLoading || isGenerating) ? 'default' : 'pointer',
                    transform: (!inputValue.trim() || isLoading || isGenerating) ? 'none' : 'translateY(-1px)'
                  }}
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
              
              {/* Keyboard hints - hidden on mobile */}
              <div className="hidden sm:flex items-center justify-between mt-2 px-1 text-[9px]" style={{ color: WIN95.textDisabled }}>
                <span>
                  <kbd className="px-1 py-0.5 rounded" style={{ background: WIN95.bgLight }}>Enter</kbd> to send
                  <span className="mx-2">•</span>
                  <kbd className="px-1 py-0.5 rounded" style={{ background: WIN95.bgLight }}>Shift+Enter</kbd> new line
                </span>
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Powered by Claude
                </span>
              </div>
            </>
          )}
          
          {/* Placeholder when not connected */}
          {!isConnected && (
            <div 
              className="text-center py-4 rounded-lg"
              style={{ 
                background: WIN95.inputBg,
                border: `1px dashed ${WIN95.border.dark}`
              }}
            >
              <Sparkles className="w-6 h-6 mx-auto mb-1" style={{ color: WIN95.textDisabled }} />
              <p className="text-[11px]" style={{ color: WIN95.textDisabled }}>
                Sign in to start chatting
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Status bar - compact on mobile */}
      <div 
        className="flex items-center mx-2 lg:mx-4 my-1 sm:my-2 rounded-lg overflow-hidden flex-shrink-0"
        style={{ 
          ...PANEL.window,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
          filter: !isConnected ? 'blur(2px)' : 'none',
          opacity: !isConnected ? 0.75 : 1,
          transition: 'filter 0.3s ease, opacity 0.3s ease'
        }}
      >
        <div 
          className="flex items-center gap-2 sm:gap-4 px-2 sm:px-3 py-1 sm:py-1.5 flex-1 text-[9px] sm:text-[10px]"
          style={{ 
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            color: '#ffffff'
          }}
        >
          <span className="flex items-center gap-1 opacity-90">
            <Image className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Images</span>
          </span>
          <span className="flex items-center gap-1 opacity-90">
            <Film className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Videos</span>
          </span>
          <span className="flex items-center gap-1 opacity-90">
            <Music className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Music</span>
          </span>
          <span className="flex-1" />
          <span className="opacity-70">
            {isGenerating ? '⏳ Creating...' : isLoading ? '💭 Thinking...' : '✨ Ready'}
          </span>
        </div>
      </div>
    </div>
  );
});

export default ChatAssistant;
