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
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import AuthPrompt from './AuthPrompt';
import { 
  sendChatMessage, 
  executeGeneration, 
  getWelcomeMessage,
  generateMessageId,
  IMAGE_MODELS,
  VIDEO_MODELS,
  VIDEO_DURATIONS,
  ASPECT_RATIOS,
  MUSIC_DURATIONS,
  calculateMusicCredits,
  calculateVideoCredits,
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
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full animate-bounce"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              animationDelay: `${i * 0.15}s`,
              animationDuration: '0.7s',
              boxShadow: '0 2px 4px rgba(102, 126, 234, 0.3)'
            }}
          />
        ))}
      </div>
      <span className="text-[11px] sm:text-[12px] ml-1 font-medium" style={{ color: WIN95.textDisabled }}>
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
          startFullscreen={true}
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
      {onDownload && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          className="absolute top-4 right-16 p-2 text-white/70 hover:text-white transition-colors"
          title="Download image"
        >
          <Download className="w-6 h-6" />
        </button>
      )}
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
  const [selectedMusicDuration, setSelectedMusicDuration] = useState<number>(30);
  const [selectedVideoDuration, setSelectedVideoDuration] = useState<string>('6s');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Check if this is a 360 panorama request (for pending action)
  const is360Request = message.pendingAction?.params?.prompt 
    ? /\b360\b/i.test(message.pendingAction.params.prompt)
    : false;
    
  // Check if generated content was from a 360 request
  // Check multiple sources: message content, original prompt, or model used
  const is360Generated = (() => {
    // Check message content
    if (message.content && /\b360\b/i.test(message.content)) return true;
    // Check if generatedContent has metadata
    if (message.generatedContent?.model === 'nano-banana-pro') return true;
    if (message.generatedContent?.is360) return true;
    // Check original prompt in generated content
    if (message.generatedContent?.prompt && /\b360\b/i.test(message.generatedContent.prompt)) return true;
    return false;
  })();

  // Get available models based on action type
  // Skip model selection for 360 requests - always uses nano-banana-pro
  const getModels = () => {
    if (!message.pendingAction) return [];
    if (is360Request) return []; // 360 requests always use nano-banana-pro, no selection needed
    if (message.pendingAction.type === 'generate_image') return IMAGE_MODELS;
    if (message.pendingAction.type === 'generate_video') return VIDEO_MODELS;
    return [];
  };

  // Handle confirm with selected model, aspect ratio, or music duration
  const handleConfirmWithModel = () => {
    if (!message.pendingAction || !onConfirmAction) return;
    
    // Preserve referenceImage from original params if it exists
    const originalParams = message.pendingAction.params || {};
    const preservedReferenceImage = originalParams.referenceImage;
    
    // For 360 requests, always use nano-banana-pro with 16:9 landscape
    if (is360Request) {
      const actionWith360Model: PendingAction = {
        ...message.pendingAction,
        params: {
          ...originalParams,
          model: 'nano-banana-pro',
          imageSize: 'landscape_16_9',
          ...(preservedReferenceImage && { referenceImage: preservedReferenceImage })
        }
      };
      onConfirmAction(actionWith360Model);
      return;
    }
    
    // For music, include the selected duration
    if (message.pendingAction.type === 'generate_music') {
      const actionWithDuration: PendingAction = {
        ...message.pendingAction,
        params: {
          ...originalParams,
          musicDuration: selectedMusicDuration
        },
        estimatedCredits: calculateMusicCredits(selectedMusicDuration)
      };
      onConfirmAction(actionWithDuration);
      return;
    }
    
    // For video, include duration and calculate credits based on model
    if (message.pendingAction.type === 'generate_video') {
      const videoModel = selectedModel || VIDEO_MODELS[0].id;
      const actionWithVideo: PendingAction = {
        ...message.pendingAction,
        params: {
          ...originalParams,
          model: videoModel,
          duration: selectedVideoDuration
        },
        estimatedCredits: calculateVideoCredits(selectedVideoDuration, videoModel)
      };
      onConfirmAction(actionWithVideo);
      return;
    }
    
    const models = getModels();
    const modelToUse = selectedModel || (models.length > 0 ? models[0].id : undefined);
    
    const actionWithModel: PendingAction = {
      ...message.pendingAction,
      params: {
        ...originalParams,
        model: modelToUse,
        // Add aspect ratio for image generation
        ...(message.pendingAction.type === 'generate_image' && { imageSize: selectedAspectRatio }),
        // Preserve referenceImage if it exists
        ...(preservedReferenceImage && { referenceImage: preservedReferenceImage })
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
      a.download = `seiso-${type}-${Date.now()}.${type === 'music' ? 'wav' : type === 'video' ? 'mp4' : 'png'}`;
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
        className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-2`}
        style={{ 
          animation: 'fadeSlideIn 0.3s ease-out forwards'
        }}
      >
        {/* Avatar for assistant - hidden on mobile for more space */}
        {!isUser && (
          <div 
            className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center mr-2 flex-shrink-0"
            style={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        )}

        <div className={`max-w-[90%] sm:max-w-[85%] lg:max-w-[80%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`} style={{ minWidth: 0 }}>
          {/* Message bubble */}
          <div
            className="overflow-hidden"
            style={{
              background: isUser 
                ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                : WIN95.bg,
              color: isUser ? '#fff' : WIN95.text,
              boxShadow: isUser 
                ? '0 2px 8px rgba(102, 126, 234, 0.25)'
                : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
              maxWidth: '100%',
              border: isUser ? 'none' : `1px solid ${WIN95.border.dark}`
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
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 text-[13px] sm:text-[14px]" style={{ color: '#ef4444' }}>
                    <AlertCircle className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
                    <span className="font-medium">{message.error}</span>
                  </div>
                  {onRetry && (
                    <button
                      onClick={onRetry}
                      className="flex items-center gap-2 px-4 py-2 text-[11px] sm:text-[12px] font-medium rounded-lg transition-all hover:scale-105 active:scale-95"
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        color: '#fff',
                        boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
                      }}
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Try again
                    </button>
                  )}
                </div>
              ) : (
                <div 
                  className="text-[13px] sm:text-[14px] leading-relaxed break-words"
                  style={{ 
                    overflowWrap: 'break-word', 
                    wordBreak: 'break-word',
                    lineHeight: '1.6'
                  }}
                  dangerouslySetInnerHTML={{ 
                    __html: message.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>')
                      .replace(/•/g, '<span style="color: ' + (isUser ? '#fff' : '#667eea') + '; font-weight: 600;">•</span>')
                      .replace(/\n/g, '<br>')
                  }}
                />
              )}

              {/* Pending action confirmation - redesigned card with model selector */}
              {message.pendingAction && !message.generatedContent && !message.isLoading && (
                <div 
                  className="mt-2 p-2 sm:p-2.5 rounded-lg"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(102,126,234,0.12) 0%, rgba(118,75,162,0.12) 100%)',
                    border: '1.5px solid rgba(102,126,234,0.35)',
                    boxShadow: '0 2px 8px rgba(102, 126, 234, 0.15), inset 0 1px 0 rgba(255,255,255,0.1)'
                  }}
                >
                  {/* Header with icon - compact */}
                  <div className="flex items-center gap-2 mb-2">
                    <div 
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{
                        background: message.pendingAction.type === 'generate_image' 
                          ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' :
                          message.pendingAction.type === 'generate_video' 
                          ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                          : 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                      }}
                    >
                      {message.pendingAction.type === 'generate_image' && <Image className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />}
                      {message.pendingAction.type === 'generate_video' && <Film className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />}
                      {message.pendingAction.type === 'generate_music' && <Music className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] sm:text-[12px] font-bold truncate">{message.pendingAction.description}</div>
                      <div className="flex items-center gap-1 text-[9px] sm:text-[10px] flex-wrap" style={{ color: WIN95.textDisabled }}>
                        <span className="flex items-center gap-0.5">
                          <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          {message.pendingAction.type === 'generate_music' 
                            ? calculateMusicCredits(selectedMusicDuration) 
                            : message.pendingAction.type === 'generate_video'
                            ? calculateVideoCredits(selectedVideoDuration, selectedModel || VIDEO_MODELS[0].id)
                            : message.pendingAction.estimatedCredits} cr
                        </span>
                        <span className="hidden sm:inline">•</span>
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                          {message.pendingAction.type === 'generate_video' ? '1-3m' :
                           message.pendingAction.type === 'generate_music' ? '~2-10s' : '~10s'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 360 Panorama indicator - no model selection needed */}
                  {is360Request && message.pendingAction?.type === 'generate_image' && (
                    <div 
                      className="mb-2 p-2 rounded-lg flex items-center gap-2"
                      style={{
                        background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.18) 0%, rgba(22, 163, 74, 0.18) 100%)',
                        border: '1px solid rgba(34, 197, 94, 0.4)',
                        boxShadow: '0 1px 4px rgba(34, 197, 94, 0.15)'
                      }}
                    >
                      <div className="text-base">🌐</div>
                      <div>
                        <div className="text-[10px] sm:text-[11px] font-bold" style={{ color: '#16a34a' }}>
                          360° Panorama Mode
                        </div>
                        <div className="text-[9px] sm:text-[10px]" style={{ color: WIN95.textDisabled }}>
                          Using Nano Banana Pro
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Model Selector - for images and videos - compact */}
                  {getModels().length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] sm:text-[11px] font-bold mb-1.5" style={{ color: WIN95.text }}>
                        Model:
                      </div>
                      <div className="grid gap-1">
                        {getModels().map((model) => (
                          <button
                            key={model.id}
                            onClick={() => setSelectedModel(model.id)}
                            className="flex items-center gap-2 p-2 rounded text-left transition-all"
                            style={{
                              background: (selectedModel || getModels()[0].id) === model.id 
                                ? 'linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)'
                                : WIN95.bgLight,
                              border: (selectedModel || getModels()[0].id) === model.id 
                                ? '1.5px solid #667eea'
                                : `1px solid ${WIN95.border.dark}`,
                              cursor: 'pointer'
                            }}
                          >
                            <div 
                              className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{
                                border: `1.5px solid ${(selectedModel || getModels()[0].id) === model.id ? '#667eea' : WIN95.border.dark}`,
                                background: (selectedModel || getModels()[0].id) === model.id ? '#667eea' : 'transparent'
                              }}
                            >
                              {(selectedModel || getModels()[0].id) === model.id && (
                                <Check className="w-2 h-2 text-white" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] sm:text-[11px] font-bold truncate" style={{ color: WIN95.text }}>
                                {model.name}
                              </div>
                              <div className="text-[9px] sm:text-[10px] truncate" style={{ color: WIN95.textDisabled }}>
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

                  {/* Duration Selector - for video */}
                  {message.pendingAction?.type === 'generate_video' && (
                    <div className="mb-2">
                      <div className="text-[10px] sm:text-[11px] font-bold mb-1.5" style={{ color: WIN95.text }}>
                        Duration:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {VIDEO_DURATIONS.map((dur) => {
                          const videoModel = selectedModel || VIDEO_MODELS[0].id;
                          const credits = calculateVideoCredits(dur.value, videoModel);
                          return (
                            <button
                              key={dur.value}
                              onClick={() => setSelectedVideoDuration(dur.value)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-all"
                              style={{
                                background: selectedVideoDuration === dur.value 
                                  ? 'linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(37,99,235,0.2) 100%)'
                                  : WIN95.bgLight,
                                border: selectedVideoDuration === dur.value 
                                  ? '1.5px solid #3b82f6'
                                  : `1px solid ${WIN95.border.dark}`,
                                cursor: 'pointer'
                              }}
                            >
                              <span className="text-[10px]">{dur.icon}</span>
                              <span className="text-[10px] sm:text-[11px] font-bold" style={{ color: WIN95.text }}>
                                {dur.label}
                              </span>
                              <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                                {credits} cr
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Aspect Ratio Selector - for images only */}
                  {message.pendingAction?.type === 'generate_image' && !is360Request && (
                    <div className="mb-2">
                      <div className="text-[10px] sm:text-[11px] font-bold mb-1.5" style={{ color: WIN95.text }}>
                        Aspect Ratio:
                      </div>
                      <div className="grid grid-cols-6 gap-1">
                        {ASPECT_RATIOS.map((ratio) => (
                          <button
                            key={ratio.id}
                            onClick={() => setSelectedAspectRatio(ratio.id)}
                            className="flex flex-col items-center p-1.5 rounded transition-all"
                            style={{
                              background: selectedAspectRatio === ratio.id 
                                ? 'linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)'
                                : WIN95.bgLight,
                              border: selectedAspectRatio === ratio.id 
                                ? '1.5px solid #667eea'
                                : `1px solid ${WIN95.border.dark}`,
                              cursor: 'pointer'
                            }}
                          >
                            <span className="text-sm sm:text-base">{ratio.icon}</span>
                            <span className="text-[9px] sm:text-[10px] font-bold" style={{ color: WIN95.text }}>
                              {ratio.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Duration Selector - for music only */}
                  {message.pendingAction?.type === 'generate_music' && (
                    <div className="mb-2">
                      <div className="text-[10px] sm:text-[11px] font-bold mb-1.5" style={{ color: WIN95.text }}>
                        Duration:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {MUSIC_DURATIONS.map((dur) => (
                          <button
                            key={dur.value}
                            onClick={() => setSelectedMusicDuration(dur.value)}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-all"
                            style={{
                              background: selectedMusicDuration === dur.value 
                                ? 'linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(168,85,247,0.2) 100%)'
                                : WIN95.bgLight,
                              border: selectedMusicDuration === dur.value 
                                ? '1.5px solid #ec4899'
                                : `1px solid ${WIN95.border.dark}`,
                              cursor: 'pointer'
                            }}
                          >
                            <span className="text-[10px] sm:text-[11px] font-bold" style={{ color: WIN95.text }}>
                              {dur.label}
                            </span>
                            <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                              {dur.credits} cr
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-1.5 text-[9px]" style={{ color: WIN95.textDisabled }}>
                        Selected: {selectedMusicDuration}s • {calculateMusicCredits(selectedMusicDuration)} credits
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons - compact */}
                  <div className="flex gap-2 mt-2.5">
                    <button
                      onClick={handleConfirmWithModel}
                      disabled={isActionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-[11px] sm:text-[12px] font-bold rounded-lg transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:active:scale-100"
                      style={{
                        background: isActionLoading 
                          ? WIN95.buttonFace 
                          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                        color: isActionLoading ? WIN95.textDisabled : '#fff',
                        boxShadow: isActionLoading ? 'none' : '0 2px 8px rgba(34, 197, 94, 0.35)',
                        cursor: isActionLoading ? 'wait' : 'pointer'
                      }}
                    >
                      {isActionLoading ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span>Create</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={onCancelAction}
                      disabled={isActionLoading}
                      className="px-3 py-2 text-[10px] sm:text-[11px] rounded-lg transition-all hover:scale-105 active:scale-95"
                      style={{ 
                        ...BTN.base, 
                        opacity: isActionLoading ? 0.5 : 1
                      }}
                      title="Cancel"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Generated content display */}
              {message.generatedContent && (
                <div className="mt-5">
                  {/* Success header */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[12px] sm:text-[13px] font-bold" style={{ color: '#16a34a' }}>Created successfully!</span>
                  </div>

                  {/* Images */}
                  {message.generatedContent.type === 'image' && (
                    <div className={`grid gap-3 ${message.generatedContent.urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {message.generatedContent.urls.map((url, i) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden transition-transform hover:scale-[1.02]">
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
                            className="w-full cursor-pointer transition-all duration-300"
                            style={{ 
                              maxHeight: '300px', 
                              objectFit: 'cover',
                              boxShadow: '0 6px 20px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)',
                              borderRadius: '12px'
                            }}
                            onClick={() => {
                              setLightboxImage(url);
                              setLightboxIs360(is360Generated);
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                          <div className="absolute bottom-3 right-3 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxImage(url);
                                setLightboxIs360(is360Generated);
                              }}
                              className="p-2.5 rounded-xl backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95"
                              style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                              title={is360Generated ? "View 360° panorama" : "View fullscreen"}
                            >
                              <Maximize2 className="w-4.5 h-4.5 text-gray-700" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(url, 'image');
                              }}
                              className="p-2.5 rounded-xl backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 hover:scale-110 active:scale-95"
                              style={{ background: 'rgba(255,255,255,0.95)', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                              title="Download image"
                            >
                              <Download className="w-4.5 h-4.5 text-gray-700" />
                            </button>
                          </div>
                          {/* Always visible download button in corner */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(url, 'image');
                            }}
                            className="absolute top-3 right-3 p-2 rounded-xl backdrop-blur-md transition-all hover:scale-110 active:scale-95"
                            style={{ background: 'rgba(0,0,0,0.7)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                            title="Download image"
                          >
                            <Download className="w-4 h-4 text-white" />
                          </button>
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
                  {message.generatedContent.type === 'music' && !message.generatedContent.urls?.[0] && (
                    <div 
                      className="p-3 rounded-lg"
                      style={{ 
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid rgba(239, 68, 68, 0.3)'
                      }}
                    >
                      <div className="flex items-center gap-2 text-[12px]" style={{ color: '#ef4444' }}>
                        <AlertCircle className="w-4 h-4" />
                        <span>Music generated but no audio URL returned. Please try again.</span>
                      </div>
                    </div>
                  )}
                  {message.generatedContent.type === 'music' && message.generatedContent.urls?.[0] && (
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
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-bold">Your Track</div>
                          <div className="text-[10px]" style={{ color: WIN95.textDisabled }}>
                            AI Generated Music
                            {message.generatedContent.metadata?.file_name && (
                              <span> • WAV</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Waveform visualization */}
                      <div 
                        className="w-full h-12 mb-3 flex items-center justify-center gap-0.5 overflow-hidden rounded"
                        style={{ background: '#000080' }}
                      >
                        {Array.from({ length: 40 }).map((_, i) => {
                          const height = Math.sin(i * 0.4) * 25 + 35;
                          return (
                            <div
                              key={i}
                              className="w-1"
                              style={{
                                height: `${height}%`,
                                background: '#00ff00',
                                transition: 'height 0.3s'
                              }}
                            />
                          );
                        })}
                      </div>
                      
                      <audio
                        src={message.generatedContent.urls?.[0] || ''}
                        controls
                        className="w-full h-10 rounded"
                        style={{ 
                          borderRadius: '6px',
                          background: WIN95.bgDark
                        }}
                      />
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleDownload(message.generatedContent?.urls?.[0] || '', 'music')}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-lg"
                          style={BTN.base}
                        >
                          <Download className="w-3.5 h-3.5" /> Download WAV
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Credits info */}
                  {message.generatedContent.creditsUsed !== undefined && (
                    <div className="flex items-center gap-2.5 mt-4 px-3 py-2 rounded-lg text-[11px] sm:text-[12px]" style={{ 
                      background: 'rgba(102, 126, 234, 0.08)',
                      color: WIN95.textDisabled 
                    }}>
                      <Zap className="w-3.5 h-3.5" style={{ color: '#667eea' }} />
                      <span className="font-medium">{message.generatedContent.creditsUsed} credits used</span>
                      <span>•</span>
                      <span>{message.generatedContent.remainingCredits} remaining</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Timestamp - only show on hover/desktop */}
          <div className="hidden sm:block mt-1 px-1 text-[9px] opacity-50" style={{ color: WIN95.textDisabled }}>
            {formatTime(message.timestamp)}
          </div>
        </div>

        {/* Avatar for user - hidden on mobile for more space */}
        {isUser && (
          <div 
            className="hidden sm:flex w-8 h-8 rounded-full items-center justify-center ml-2 flex-shrink-0"
            style={{ 
              background: 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)',
              boxShadow: '0 2px 8px rgba(74, 144, 226, 0.3)'
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
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes messagePulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
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
  const walletContext = useSimpleWallet();
  
  const isConnected = walletContext.isConnected;
  
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
    walletAddress: walletContext.address || undefined,
    credits: walletContext.credits
  }), [walletContext]);

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
  }, [inputValue, isLoading, isConnected, messages, getContext, attachedImage]);

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
      if (walletContext.fetchCredits && walletContext.address) {
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
  }, [isGenerating, getContext, walletContext]);

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
    <div className="h-full flex flex-col relative overflow-hidden" style={{ 
      background: 'linear-gradient(135deg, #1a3a4a 0%, #0f2027 100%)',
      backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(102, 126, 234, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(118, 75, 162, 0.1) 0%, transparent 50%)',
      minHeight: 0,
      flex: '1 1 0%'
    }}>
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
      
      {/* Main chat window - minimal margins for max content */}
      <div 
        className="flex-1 mx-0.5 sm:mx-2 lg:mx-3 mt-0.5 sm:mt-1 flex flex-col min-h-0 rounded-lg sm:rounded-xl overflow-hidden"
        style={{
          ...PANEL.window,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          filter: !isConnected ? 'blur(2px)' : 'none',
          opacity: !isConnected ? 0.75 : 1,
          transition: 'filter 0.3s ease, opacity 0.3s ease',
          border: `1px solid ${WIN95.border.dark}`,
          flex: '1 1 0%'
        }}
      >
        {/* Title bar - compact */}
        <div 
          className="flex items-center gap-2 px-2 sm:px-3 py-1.5 flex-shrink-0"
          style={{
            ...WINDOW_TITLE_STYLE,
            background: 'linear-gradient(90deg, #0d4a5e 0%, #1a7a8a 100%)'
          }}
        >
          <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-90" />
          <div className="flex-1 min-w-0">
            <span className="text-[11px] sm:text-[12px] font-bold">AI Assistant</span>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
            {isConnected && (
              <>
                <div 
                  className="flex items-center gap-0.5 sm:gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[9px] sm:text-[10px]"
                  style={{ background: 'rgba(255,255,255,0.15)' }}
                >
                  <Zap className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                  <span>{walletContext.credits ?? 0}</span>
                </div>
                <button
                  onClick={handleClearChat}
                  className="p-1 sm:p-1.5 rounded hover:bg-white/20 transition-colors"
                  title="New conversation"
                >
                  <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={() => {
                    if (walletContext.disconnect) {
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
          className="flex-1 overflow-y-auto px-3 py-2 sm:px-4 sm:py-3 min-h-0"
          style={{ 
            background: WIN95.inputBg,
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(102, 126, 234, 0.03) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(118, 75, 162, 0.03) 0%, transparent 50%)'
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

          {/* Suggestions - compact */}
          {suggestions.length > 0 && messages.length <= 1 && (
            <div className="mt-3 sm:mt-4 mb-2">
              <div className="text-center mb-2 text-[10px] sm:text-[11px]" style={{ color: WIN95.textDisabled }}>
                Try one of these:
              </div>
              <div className="flex flex-wrap gap-1.5 justify-center">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-3 py-1.5 text-[10px] sm:text-[11px] max-w-[200px] text-left rounded-lg truncate"
                    style={{
                      background: WIN95.bg,
                      border: `1px solid ${WIN95.border.dark}`,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input area - compact on mobile */}
        <div 
          className="p-2 sm:p-3 flex-shrink-0"
          style={{ 
            background: WIN95.bg,
            borderTop: `1px solid ${WIN95.border.dark}`
          }}
        >
          {isConnected && (
            <>
              {/* Quick actions - hidden on mobile */}
              <div className="hidden sm:block">
                <QuickActions onSelect={handleQuickAction} />
              </div>
              
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
              
              <div className="flex gap-1.5 items-end">
                {/* Image upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isGenerating || isUploadingImage}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg transition-all flex-shrink-0"
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
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : attachedImage ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <ImagePlus className="w-4 h-4" />
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
                  className="flex-1 rounded-lg overflow-hidden min-w-0"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 0 1px 3px rgba(0,0,0,0.1)`,
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
                    className="w-full px-3 py-2 text-base sm:text-[14px] resize-none focus:outline-none"
                    style={{
                      background: 'transparent',
                      color: WIN95.text,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                      minHeight: '36px',
                      maxHeight: '80px',
                      lineHeight: '1.4',
                      fontSize: 'max(16px, 1rem)' // Prevent iOS zoom on focus
                    }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading || isGenerating}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg transition-all flex-shrink-0"
                  style={{
                    background: (!inputValue.trim() || isLoading || isGenerating) 
                      ? WIN95.buttonFace 
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: (!inputValue.trim() || isLoading || isGenerating) 
                      ? WIN95.textDisabled 
                      : '#fff',
                    boxShadow: (!inputValue.trim() || isLoading || isGenerating)
                      ? 'none'
                      : '0 2px 8px rgba(102, 126, 234, 0.3)',
                    cursor: (!inputValue.trim() || isLoading || isGenerating) ? 'default' : 'pointer',
                    border: (!inputValue.trim() || isLoading || isGenerating) ? `1px solid ${WIN95.border.dark}` : 'none'
                  }}
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
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

      {/* Status bar - hidden on mobile, minimal on desktop */}
      <div 
        className="hidden sm:flex items-center mx-2 lg:mx-4 my-0.5 sm:my-1 rounded-lg overflow-hidden flex-shrink-0"
        style={{ 
          ...PANEL.window,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
          filter: !isConnected ? 'blur(2px)' : 'none',
          opacity: !isConnected ? 0.75 : 1
        }}
      >
        <div 
          className="flex items-center gap-3 px-3 py-1 flex-1 text-[9px]"
          style={{ 
            background: 'linear-gradient(90deg, #0d4a5e 0%, #1a7a8a 100%)',
            color: '#ffffff'
          }}
        >
          <span className="flex items-center gap-1 opacity-90">
            <Image className="w-3 h-3" /> Images
          </span>
          <span className="flex items-center gap-1 opacity-90">
            <Film className="w-3 h-3" /> Videos
          </span>
          <span className="flex items-center gap-1 opacity-90">
            <Music className="w-3 h-3" /> Music
          </span>
          <span className="flex-1" />
          <span className="opacity-80">
            {isGenerating ? '⏳ Creating...' : isLoading ? '💭 Thinking...' : '✨ Ready'}
          </span>
        </div>
      </div>
    </div>
  );
});

export default ChatAssistant;
