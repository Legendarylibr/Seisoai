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
  ImagePlus, LogOut
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

// Props interface - currently empty but kept for future extensibility
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatAssistantProps {}

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

// Lightbox for viewing images fullscreen
const ImageLightbox = memo(function ImageLightbox({ 
  src, 
  onClose,
  onDownload
}: { 
  src: string; 
  onClose: () => void;
  onDownload?: () => void;
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

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
  isActionLoading
}: { 
  message: ChatMessage;
  onConfirmAction?: (action: PendingAction) => void;
  onCancelAction?: () => void;
  onRetry?: () => void;
  isActionLoading?: boolean;
}) {
  const isUser = message.role === 'user';
  const [isPlaying, setIsPlaying] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>('square');
  const [selectedMusicDuration, setSelectedMusicDuration] = useState<number>(30);
  const [selectedVideoDuration, setSelectedVideoDuration] = useState<string>('6s');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get available models based on action type - memoized
  const models = !message.pendingAction ? [] :
    message.pendingAction.type === 'generate_image' ? IMAGE_MODELS :
    message.pendingAction.type === 'generate_video' ? VIDEO_MODELS : [];
  
  const defaultModel = models.length > 0 ? models[0].id : undefined;
  const activeModel = selectedModel || defaultModel;

  // Handle confirm with selected model, aspect ratio, or music duration
  const handleConfirmWithModel = () => {
    if (!message.pendingAction || !onConfirmAction) return;
    
    // Preserve referenceImage and referenceImages from original params if they exist
    const originalParams = message.pendingAction.params || {};
    const preservedReferenceImage = originalParams.referenceImage;
    const preservedReferenceImages = originalParams.referenceImages;
    
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
    
    const actionWithModel: PendingAction = {
      ...message.pendingAction,
      params: {
        ...originalParams,
        model: activeModel,
        // Add aspect ratio for image generation
        ...(message.pendingAction.type === 'generate_image' && { imageSize: selectedAspectRatio }),
        // Preserve referenceImage and referenceImages if they exist
        ...(preservedReferenceImage && { referenceImage: preservedReferenceImage }),
        ...(preservedReferenceImages && { referenceImages: preservedReferenceImages })
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
                (message.content || '').includes('Generating') ? (
                  <GenerationProgress type={
                    (message.content || '').includes('video') ? 'video' :
                    (message.content || '').includes('music') ? 'music' : 'image'
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
                    __html: (message.content || '')
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

                  {/* Model Selector - for images and videos - compact */}
                  {models.length > 0 && (
                    <div className="mb-2">
                      <div className="text-[10px] sm:text-[11px] font-bold mb-1.5" style={{ color: WIN95.text }}>
                        Model:
                      </div>
                      <div className="grid gap-1">
                        {models.map((model) => {
                          const isSelected = activeModel === model.id;
                          return (
                            <button
                              key={model.id}
                              onClick={() => setSelectedModel(model.id)}
                              className="flex items-center gap-2 p-2 rounded text-left transition-all"
                              style={{
                                background: isSelected 
                                  ? 'linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%)'
                                  : WIN95.bgLight,
                                border: isSelected ? '1.5px solid #667eea' : `1px solid ${WIN95.border.dark}`,
                                cursor: 'pointer'
                              }}
                            >
                              <div 
                                className="w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{
                                  border: `1.5px solid ${isSelected ? '#667eea' : WIN95.border.dark}`,
                                  background: isSelected ? '#667eea' : 'transparent'
                                }}
                              >
                                {isSelected && <Check className="w-2 h-2 text-white" />}
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
                          );
                        })}
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
                  {message.pendingAction?.type === 'generate_image' && (
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
              {message.generatedContent && message.generatedContent.type && (
                <div className="mt-5">
                  {/* Success header */}
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="text-[12px] sm:text-[13px] font-bold" style={{ color: '#16a34a' }}>Created successfully!</span>
                  </div>

                  {/* Images */}
                  {message.generatedContent.type === 'image' && message.generatedContent.urls?.length > 0 && (
                    <div className={`grid gap-3 ${message.generatedContent.urls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {message.generatedContent.urls.map((url, i) => (
                        <div key={i} className="relative group rounded-xl overflow-hidden transition-transform hover:scale-[1.02]">
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
                            onClick={() => setLightboxImage(url)}
                          />
                          {/* Hover overlay with action buttons */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl" />
                          <div className="absolute top-3 right-3 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxImage(url);
                              }}
                              className="p-2 rounded-xl backdrop-blur-md transition-all hover:scale-110 active:scale-95"
                              style={{ background: 'rgba(0,0,0,0.7)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                              title="View fullscreen"
                            >
                              <Maximize2 className="w-4 h-4 text-white" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(url, 'image');
                              }}
                              className="p-2 rounded-xl backdrop-blur-md transition-all hover:scale-110 active:scale-95"
                              style={{ background: 'rgba(0,0,0,0.7)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                              title="Download image"
                            >
                              <Download className="w-4 h-4 text-white" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Videos */}
                  {message.generatedContent.type === 'video' && message.generatedContent.urls?.[0] && (
                    <div className="space-y-2">
                      <div className="relative rounded-lg overflow-hidden" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                        <video
                          ref={videoRef}
                          src={message.generatedContent.urls?.[0] || ''}
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
                          onClick={() => handleDownload(message.generatedContent?.urls?.[0] || '', 'video')}
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
                            {message.generatedContent.metadata?.file_name ? (
                              <span> • WAV</span>
                            ) : null}
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
          onClose={() => setLightboxImage(null)}
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
const ChatAssistant = memo<ChatAssistantProps>(function ChatAssistant() {
  const walletContext = useSimpleWallet();
  
  const isConnected = walletContext.isConnected;
  
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
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

  // Handle image upload for reference - supports multiple images
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    
    // Limit to 4 images total
    const remainingSlots = 4 - attachedImages.length;
    if (remainingSlots <= 0) {
      logger.warn('Maximum 4 images allowed');
      return;
    }
    
    const filesToProcess = files.slice(0, remainingSlots);
    
    // Filter to only valid files first
    const validFiles = filesToProcess.filter(file => {
      if (!file.type.startsWith('image/')) {
        logger.warn('Invalid file type for image upload');
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        logger.warn('Image file too large');
        return false;
      }
      return true;
    });
    
    // If no valid files, exit early
    if (validFiles.length === 0) {
      return;
    }
    
    setIsUploadingImage(true);
    
    let loadedCount = 0;
    const newImages: string[] = [];
    
    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          newImages.push(result);
        }
        loadedCount++;
        if (loadedCount === validFiles.length) {
          setAttachedImages(prev => [...prev, ...newImages]);
          setIsUploadingImage(false);
        }
      };
      reader.onerror = () => {
        loadedCount++;
        if (loadedCount === validFiles.length) {
          setAttachedImages(prev => [...prev, ...newImages]);
          setIsUploadingImage(false);
        }
        logger.error('Failed to read image file');
      };
      reader.readAsDataURL(file);
    }
    
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [attachedImages.length]);

  // Remove a specific attached image
  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Send message handler
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !isConnected) return;

    // Build message content - include image reference indicator if attached
    const imageCount = attachedImages.length;
    let messageContent = inputValue.trim();
    if (imageCount === 1) {
      messageContent = `[Image attached] ${messageContent}`;
    } else if (imageCount > 1) {
      messageContent = `[${imageCount} images attached] ${messageContent}`;
    }

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

    // Store the attached images before clearing
    const imagesToSend = [...attachedImages];

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setAttachedImages([]);
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
        imagesToSend.length > 0 ? imagesToSend : undefined
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
  }, [inputValue, isLoading, isConnected, messages, getContext, attachedImages]);

  // Confirm generation action
  const handleConfirmAction = useCallback(async (action: PendingAction) => {
    if (isGenerating) return;
    
    setIsGenerating(true);

    const actionType = action.type || 'content';
    const generatingMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: `Generating your ${actionType.replace('generate_', '')}...`,
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

  // Handle suggestion or quick action click - sets input and focuses
  const handlePromptSelect = useCallback((text: string) => {
    setInputValue(text);
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
                    if (walletContext.disconnectWallet) {
                      walletContext.disconnectWallet();
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
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onConfirmAction={handleConfirmAction}
              onCancelAction={handleCancelAction}
              isActionLoading={isGenerating}
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
                    onClick={() => handlePromptSelect(suggestion)}
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
                <QuickActions onSelect={handlePromptSelect} />
              </div>
              
              {/* Attached images preview - compact on mobile */}
              {attachedImages.length > 0 && (
                <div 
                  className="mb-2 p-1.5 sm:p-2 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)',
                    border: '1px solid rgba(102,126,234,0.3)'
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="flex gap-1.5 flex-wrap flex-shrink-0">
                      {attachedImages.map((img, index) => (
                        <div key={index} className="relative flex-shrink-0">
                          <img 
                            src={img} 
                            alt={`Attached ${index + 1}`}
                            className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-lg"
                            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}
                          />
                          <button
                            onClick={() => handleRemoveImage(index)}
                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                            style={{ 
                              background: '#ef4444',
                              color: '#fff',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                            }}
                          >
                            <X className="w-2 h-2" />
                          </button>
                          {/* Image label for multi-image editing */}
                          {attachedImages.length > 1 && (
                            <div 
                              className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded text-[8px] font-bold"
                              style={{ 
                                background: index === 0 ? '#22c55e' : '#3b82f6',
                                color: '#fff'
                              }}
                            >
                              {index === 0 ? 'Base' : `+${index}`}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] sm:text-[11px] font-medium truncate" style={{ color: WIN95.text }}>
                        📷 {attachedImages.length === 1 ? 'Image attached' : `${attachedImages.length} images attached`}
                      </div>
                      <div className="text-[8px] sm:text-[9px] hidden sm:block" style={{ color: WIN95.textDisabled }}>
                        {attachedImages.length === 1 
                          ? 'The AI will use this for image-to-image or video generation'
                          : 'First image is the base, others are references for elements to add'
                        }
                      </div>
                    </div>
                    {attachedImages.length > 1 && (
                      <button
                        onClick={() => setAttachedImages([])}
                        className="flex-shrink-0 px-2 py-1 text-[9px] rounded"
                        style={{ 
                          background: WIN95.buttonFace,
                          border: `1px solid ${WIN95.border.dark}`,
                          color: WIN95.text
                        }}
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              <div className="flex gap-1.5 items-end">
                {/* Image upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isGenerating || isUploadingImage || attachedImages.length >= 4}
                  className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg transition-all flex-shrink-0 relative"
                  style={{
                    background: attachedImages.length > 0 
                      ? 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
                      : WIN95.bgLight,
                    color: attachedImages.length > 0 ? '#fff' : WIN95.text,
                    border: `1px solid ${WIN95.border.dark}`,
                    cursor: (isLoading || isGenerating || isUploadingImage || attachedImages.length >= 4) ? 'default' : 'pointer',
                    opacity: (isLoading || isGenerating || attachedImages.length >= 4) ? 0.5 : 1
                  }}
                  title={attachedImages.length >= 4 ? 'Maximum 4 images' : attachedImages.length > 0 ? 'Add more images' : 'Attach reference images'}
                >
                  {isUploadingImage ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : attachedImages.length > 0 ? (
                    <>
                      <ImagePlus className="w-4 h-4" />
                      <span 
                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                        style={{ background: '#3b82f6', color: '#fff' }}
                      >
                        {attachedImages.length}
                      </span>
                    </>
                  ) : (
                    <ImagePlus className="w-4 h-4" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
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
                    placeholder={
                      attachedImages.length > 1 
                        ? "e.g. 'Add the hat from image 2 to image 1'" 
                        : attachedImages.length === 1 
                          ? "Describe what to do with this image..." 
                          : "What do you want to create?"
                    }
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
