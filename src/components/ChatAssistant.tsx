/**
 * ChatAssistant - Full-page GPT-style chat interface for AI generation
 * Provides a conversational way to generate images, videos, and music
 * Optimized for usability with modern UX patterns
 */
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { 
  Send, Sparkles, Image, Film, Music, Download, 
  Play, Pause, Check, X, RefreshCw, Volume2,
  Wand2, Zap, Clock, AlertCircle, Maximize2, User
} from 'lucide-react';
import { WIN95, BTN, PANEL, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { 
  sendChatMessage, 
  executeGeneration, 
  getWelcomeMessage,
  generateMessageId,
  IMAGE_MODELS,
  VIDEO_MODELS,
  type ChatMessage, 
  type PendingAction,
  type ChatContext,
} from '../services/chatAssistantService';
import logger from '../utils/logger';

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

// Lightbox for viewing images fullscreen
const ImageLightbox = memo(function ImageLightbox({ 
  src, 
  onClose 
}: { 
  src: string; 
  onClose: () => void;
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
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get available models based on action type
  const getModels = () => {
    if (!message.pendingAction) return [];
    if (message.pendingAction.type === 'generate_image') return IMAGE_MODELS;
    if (message.pendingAction.type === 'generate_video') return VIDEO_MODELS;
    return [];
  };

  // Handle confirm with selected model
  const handleConfirmWithModel = () => {
    if (!message.pendingAction || !onConfirmAction) return;
    
    const models = getModels();
    const modelToUse = selectedModel || (models.length > 0 ? models[0].id : undefined);
    
    const actionWithModel: PendingAction = {
      ...message.pendingAction,
      params: {
        ...message.pendingAction.params,
        model: modelToUse
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

        <div className={`max-w-[80%] lg:max-w-[70%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
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
            {/* Message content */}
            <div className="px-4 py-3">
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
                  className="mt-4 p-4 rounded-lg"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(102,126,234,0.1) 0%, rgba(118,75,162,0.1) 100%)',
                    border: '1px solid rgba(102,126,234,0.3)'
                  }}
                >
                  {/* Header with icon */}
                  <div className="flex items-center gap-3 mb-3">
                    <div 
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{
                        background: message.pendingAction.type === 'generate_image' ? '#22c55e' :
                                   message.pendingAction.type === 'generate_video' ? '#3b82f6' : '#ec4899'
                      }}
                    >
                      {message.pendingAction.type === 'generate_image' && <Image className="w-5 h-5 text-white" />}
                      {message.pendingAction.type === 'generate_video' && <Film className="w-5 h-5 text-white" />}
                      {message.pendingAction.type === 'generate_music' && <Music className="w-5 h-5 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="text-[12px] font-bold">{message.pendingAction.description}</div>
                      <div className="flex items-center gap-2 text-[10px]" style={{ color: WIN95.textDisabled }}>
                        <Zap className="w-3 h-3" />
                        <span>{message.pendingAction.estimatedCredits} credits</span>
                        <span>•</span>
                        <Clock className="w-3 h-3" />
                        <span>
                          {message.pendingAction.type === 'generate_video' ? '1-3 min' :
                           message.pendingAction.type === 'generate_music' ? '~30 sec' : '~10 sec'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Model Selector - for images and videos */}
                  {getModels().length > 0 && (
                    <div className="mb-4">
                      <div className="text-[10px] font-bold mb-2" style={{ color: WIN95.text }}>
                        Choose Model:
                      </div>
                      <div className="grid gap-2">
                        {getModels().map((model) => (
                          <button
                            key={model.id}
                            onClick={() => setSelectedModel(model.id)}
                            className="flex items-center gap-3 p-3 rounded-lg text-left transition-all"
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
                              className="w-4 h-4 rounded-full flex items-center justify-center"
                              style={{
                                border: `2px solid ${(selectedModel || getModels()[0].id) === model.id ? '#667eea' : WIN95.border.dark}`,
                                background: (selectedModel || getModels()[0].id) === model.id ? '#667eea' : 'transparent'
                              }}
                            >
                              {(selectedModel || getModels()[0].id) === model.id && (
                                <Check className="w-2.5 h-2.5 text-white" />
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-[11px] font-bold" style={{ color: WIN95.text }}>
                                {model.name}
                              </div>
                              <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                                {model.description}
                                {' • '}
                                {'credits' in model ? `${model.credits} credits` : `${(model as { creditsPerSec: number }).creditsPerSec}/sec`}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmWithModel}
                      disabled={isActionLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-[12px] font-bold rounded-lg transition-all"
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
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          Create Now
                        </>
                      )}
                    </button>
                    <button
                      onClick={onCancelAction}
                      disabled={isActionLoading}
                      className="px-4 py-2.5 text-[11px] rounded-lg transition-opacity"
                      style={{ 
                        ...BTN.base, 
                        opacity: isActionLoading ? 0.5 : 1,
                        borderRadius: '8px'
                      }}
                    >
                      Cancel
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
                          <img 
                            src={url} 
                            alt={`Generated ${i + 1}`}
                            className="w-full cursor-pointer transition-transform hover:scale-[1.02]"
                            style={{ 
                              maxHeight: '280px', 
                              objectFit: 'cover',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                            }}
                            onClick={() => setLightboxImage(url)}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setLightboxImage(url)}
                              className="p-2 rounded-lg backdrop-blur-sm transition-colors"
                              style={{ background: 'rgba(255,255,255,0.9)' }}
                              title="View fullscreen"
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
        <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />
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
    <div className="flex gap-2 mb-2">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onSelect(action.prompt)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] rounded-full transition-all hover:scale-105"
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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // Send message handler
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !isConnected) return;

    const userMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    const loadingMessage: ChatMessage = {
      id: generateMessageId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isLoading: true
    };

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
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
        getContext()
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
    <div className="h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #1a3a4a 0%, #0f2027 100%)' }}>
      {/* Main chat window */}
      <div 
        className="flex-1 mx-2 lg:mx-4 mt-2 flex flex-col min-h-0 rounded-lg overflow-hidden"
        style={{
          ...PANEL.window,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
        }}
      >
        {/* Title bar */}
        <div 
          className="flex items-center gap-3 px-4 py-2 flex-shrink-0"
          style={{
            ...WINDOW_TITLE_STYLE,
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
          }}
        >
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="flex-1">
            <span className="text-[13px] font-bold">AI Creative Assistant</span>
            <span className="text-[10px] ml-2 opacity-70">Images • Videos • Music</span>
          </div>
          <div className="flex items-center gap-1">
            {isConnected && (
              <div 
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
                style={{ background: 'rgba(255,255,255,0.15)' }}
              >
                <Zap className="w-3 h-3" />
                {emailContext.credits ?? walletContext.credits ?? 0} credits
              </div>
            )}
            <button
              onClick={handleClearChat}
              className="p-1.5 rounded hover:bg-white/20 transition-colors"
              title="New conversation"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div 
          className="flex-1 overflow-y-auto px-4 py-4 min-h-0"
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

          {/* Suggestions */}
          {suggestions.length > 0 && messages.length <= 1 && (
            <div className="mt-6 mb-4">
              <div className="text-center mb-3 text-[11px]" style={{ color: WIN95.textDisabled }}>
                Try one of these to get started:
              </div>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="px-4 py-2.5 text-[11px] max-w-[220px] text-left rounded-xl transition-all hover:scale-[1.02] hover:shadow-lg"
                    style={{
                      background: WIN95.bg,
                      border: `1px solid ${WIN95.border.dark}`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                    }}
                  >
                    <span className="mr-1.5">💡</span>
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div 
          className="p-4 flex-shrink-0"
          style={{ 
            background: WIN95.bg,
            borderTop: `1px solid ${WIN95.border.dark}`
          }}
        >
          {!isConnected ? (
            <div 
              className="text-center py-6 rounded-lg"
              style={{ 
                background: WIN95.inputBg,
                border: `1px dashed ${WIN95.border.dark}`
              }}
            >
              <Sparkles className="w-8 h-8 mx-auto mb-2" style={{ color: WIN95.textDisabled }} />
              <p className="text-[12px] font-medium mb-1" style={{ color: WIN95.text }}>
                Sign in to start creating
              </p>
              <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>
                Generate images, videos, and music with AI
              </p>
            </div>
          ) : (
            <>
              <QuickActions onSelect={handleQuickAction} />
              
              <div className="flex gap-3 items-end">
                <div 
                  className="flex-1 rounded-xl overflow-hidden"
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
                    placeholder="Describe what you want to create..."
                    disabled={isLoading || isGenerating}
                    rows={1}
                    className="w-full px-4 py-3 text-[13px] resize-none focus:outline-none"
                    style={{
                      background: 'transparent',
                      color: WIN95.text,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                      minHeight: '44px',
                      maxHeight: '120px'
                    }}
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isLoading || isGenerating}
                  className="w-12 h-12 flex items-center justify-center rounded-xl transition-all"
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
                  <Send className="w-5 h-5" />
                </button>
              </div>
              
              {/* Keyboard hints */}
              <div className="flex items-center justify-between mt-2 px-1 text-[9px]" style={{ color: WIN95.textDisabled }}>
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
        </div>
      </div>

      {/* Status bar */}
      <div 
        className="flex items-center mx-2 lg:mx-4 my-2 rounded-lg overflow-hidden flex-shrink-0"
        style={{ 
          ...PANEL.window,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <div 
          className="flex items-center gap-4 px-3 py-1.5 flex-1 text-[10px]"
          style={{ 
            background: 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
            color: '#ffffff'
          }}
        >
          <span className="flex items-center gap-1.5 opacity-90">
            <Image className="w-3.5 h-3.5" /> Images
          </span>
          <span className="flex items-center gap-1.5 opacity-90">
            <Film className="w-3.5 h-3.5" /> Videos
          </span>
          <span className="flex items-center gap-1.5 opacity-90">
            <Music className="w-3.5 h-3.5" /> Music
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
