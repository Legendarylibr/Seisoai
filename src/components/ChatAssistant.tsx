/**
 * ChatAssistant - Terminal-style chat interface for AI generation
 * Styled like a retro hacker terminal with phosphor green text, scanlines,
 * and command-line aesthetics. Full multimodal generation support.
 */
import { useState, useCallback, useRef, useEffect, memo } from 'react';
import { 
  Send, Image, Film, Music, Download, 
  Play, Pause, X, RefreshCw, Volume2,
  Wand2, Zap, Maximize2,
  ImagePlus, LogOut, Terminal, ChevronRight
} from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
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
  CHAT_AI_MODELS,
  calculateMusicCredits,
  calculateVideoCredits,
  type ChatMessage, 
  type PendingAction,
  type ChatContext,
} from '../services/chatAssistantService';
import logger from '../utils/logger';

// Terminal color palette
const TERM = {
  bg: '#0a0e14',
  bgPanel: '#0d1117',
  bgInput: '#161b22',
  bgHover: '#1c2333',
  green: '#00ff41',
  greenDim: '#00cc33',
  greenMuted: '#00aa2a',
  greenDark: 'rgba(0, 255, 65, 0.08)',
  greenBorder: 'rgba(0, 255, 65, 0.15)',
  greenGlow: '0 0 10px rgba(0, 255, 65, 0.3)',
  amber: '#ffb000',
  amberDim: '#cc8800',
  cyan: '#00d4ff',
  cyanDim: '#00a8cc',
  red: '#ff3333',
  redDim: '#cc2222',
  magenta: '#ff00ff',
  white: '#e6edf3',
  whiteDim: '#8b949e',
  border: 'rgba(0, 255, 65, 0.12)',
  font: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "Courier New", monospace',
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ChatAssistantProps {}

// ASCII art banner
const ASCII_BANNER = `  ____  _____ ___ ____   ___       _    ___ 
 / ___|| ____|_ _/ ___| / _ \\     / \\  |_ _|
 \\___ \\|  _|  | |\\___ \\| | | |   / _ \\  | | 
  ___) | |___ | | ___) | |_| |  / ___ \\ | | 
 |____/|_____|___|____/ \\___/  /_/   \\_\\___|`;

// Typing indicator with terminal style
const TermTypingIndicator = memo(function TermTypingIndicator() {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: TERM.cyan, fontFamily: TERM.font, fontSize: 12 }}>
        [PROCESSING]
      </span>
      <div className="flex gap-0.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="w-1.5 h-3 animate-pulse"
            style={{
              background: TERM.green,
              animationDelay: `${i * 0.2}s`,
              animationDuration: '1s',
              boxShadow: TERM.greenGlow,
            }}
          />
        ))}
      </div>
    </div>
  );
});

// Terminal-style generation progress
const TermGenerationProgress = memo(function TermGenerationProgress({ type }: { type: string }) {
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('INIT');
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    const phases = type === 'video'
      ? ['INIT', 'FRAMES', 'RENDER', 'ENCODE', 'DONE']
      : type === 'music'
      ? ['INIT', 'COMPOSE', 'MIX', 'MASTER', 'DONE']
      : ['INIT', 'DREAM', 'REFINE', 'ENHANCE', 'DONE'];

    const logMessages = type === 'video'
      ? ['Allocating GPU...', 'Processing frames...', 'Rendering pipeline active...', 'Encoding output...']
      : type === 'music'
      ? ['Loading audio engine...', 'Composing melody...', 'Mixing tracks...', 'Mastering output...']
      : ['Loading model weights...', 'Generating latents...', 'Denoising pass...', 'Enhancing details...'];

    let current = 0;
    let logIndex = 0;
    const interval = setInterval(() => {
      current += Math.random() * 12 + 4;
      if (current > 95) current = 95;
      setProgress(current);
      const phaseIdx = Math.min(Math.floor(current / 20), phases.length - 1);
      setPhase(phases[phaseIdx]);
      
      if (logIndex < logMessages.length && current > (logIndex + 1) * 20) {
        setLogs(prev => [...prev, logMessages[logIndex]]);
        logIndex++;
      }
    }, 700);

    return () => clearInterval(interval);
  }, [type]);

  return (
    <div style={{ fontFamily: TERM.font, fontSize: 11 }}>
      {logs.map((log, i) => (
        <div key={i} style={{ color: TERM.whiteDim }}>
          <span style={{ color: TERM.greenDim }}>  &gt;</span> {log}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-1">
        <span style={{ color: TERM.amber }}>[{phase}]</span>
        <div className="flex-1 h-1.5 rounded-sm overflow-hidden" style={{ background: 'rgba(0,255,65,0.1)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              background: TERM.green,
              boxShadow: TERM.greenGlow,
            }}
          />
        </div>
        <span style={{ color: TERM.greenDim }}>{Math.round(progress)}%</span>
      </div>
      <div style={{ color: TERM.whiteDim, fontSize: 10, marginTop: 4 }}>
        <span style={{ color: TERM.greenDim }}>  ETA:</span>{' '}
        {type === 'video' ? '~60-180s' : type === 'music' ? '~10-30s' : '~5-15s'}
      </div>
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
      style={{ background: 'rgba(0,0,0,0.95)' }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 transition-colors"
        style={{ color: TERM.whiteDim }}
      >
        <X className="w-6 h-6" />
      </button>
      {onDownload && (
        <button
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          className="absolute top-4 right-16 p-2 transition-colors"
          style={{ color: TERM.whiteDim }}
          title="Download"
        >
          <Download className="w-6 h-6" />
        </button>
      )}
      <img
        src={src}
        alt="Fullscreen preview"
        className="max-w-[95vw] max-h-[95vh] object-contain"
        style={{ boxShadow: '0 0 60px rgba(0,255,65,0.2)', border: `1px solid ${TERM.greenBorder}` }}
        onClick={(e) => e.stopPropagation()}
        onError={() => onClose()}
      />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2" style={{ color: TERM.whiteDim, fontFamily: TERM.font, fontSize: 10 }}>
        ESC to close | Click outside to dismiss
      </div>
    </div>
  );
});

// Terminal-style message line
const TermMessage = memo(function TermMessage({
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

  const models = !message.pendingAction ? [] :
    message.pendingAction.type === 'generate_image' ? IMAGE_MODELS :
    message.pendingAction.type === 'generate_video' ? VIDEO_MODELS : [];

  const defaultModel = models.length > 0 ? models[0].id : undefined;
  const activeModel = selectedModel || defaultModel;

  const handleConfirmWithModel = () => {
    if (!message.pendingAction || !onConfirmAction) return;
    const originalParams = message.pendingAction.params || {};
    const preservedReferenceImage = originalParams.referenceImage;
    const preservedReferenceImages = originalParams.referenceImages;

    if (message.pendingAction.type === 'generate_music') {
      onConfirmAction({
        ...message.pendingAction,
        params: { ...originalParams, musicDuration: selectedMusicDuration },
        estimatedCredits: calculateMusicCredits(selectedMusicDuration)
      });
      return;
    }

    if (message.pendingAction.type === 'generate_video') {
      const videoModel = selectedModel || VIDEO_MODELS[0].id;
      onConfirmAction({
        ...message.pendingAction,
        params: { ...originalParams, model: videoModel, duration: selectedVideoDuration },
        estimatedCredits: calculateVideoCredits(selectedVideoDuration, videoModel)
      });
      return;
    }

    onConfirmAction({
      ...message.pendingAction,
      params: {
        ...originalParams,
        model: activeModel,
        ...(message.pendingAction.type === 'generate_image' && { imageSize: selectedAspectRatio }),
        ...(preservedReferenceImage && { referenceImage: preservedReferenceImage }),
        ...(preservedReferenceImages && { referenceImages: preservedReferenceImages })
      }
    });
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

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  return (
    <>
      <div
        className="mb-1"
        style={{
          fontFamily: TERM.font,
          fontSize: 12,
          lineHeight: '1.7',
          animation: 'termFadeIn 0.2s ease-out forwards',
        }}
      >
        {/* Timestamp + Prompt line */}
        <div className="flex items-start gap-0">
          <span style={{ color: TERM.whiteDim, fontSize: 10, minWidth: 64, flexShrink: 0 }}>
            {formatTime(message.timestamp)}
          </span>
          {isUser ? (
            <span style={{ color: TERM.cyan, flexShrink: 0 }}>user@seiso:~$&nbsp;</span>
          ) : (
            <span style={{ color: TERM.green, flexShrink: 0 }}>[SEISO]&gt;&nbsp;</span>
          )}
          
          {/* Message content */}
          <div className="flex-1 min-w-0" style={{ color: isUser ? TERM.white : TERM.green }}>
            {message.isLoading ? (
              (message.content || '').includes('Generating') ? (
                <TermGenerationProgress type={
                  (message.content || '').includes('video') ? 'video' :
                  (message.content || '').includes('music') ? 'music' : 'image'
                } />
              ) : (
                <TermTypingIndicator />
              )
            ) : message.error ? (
              <div>
                <div style={{ color: TERM.red }}>
                  <span style={{ color: TERM.redDim }}>[ERROR]</span> {message.error}
                </div>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="flex items-center gap-1.5 mt-1 px-3 py-1 transition-all"
                    style={{
                      background: 'rgba(255,51,51,0.1)',
                      border: `1px solid ${TERM.redDim}`,
                      color: TERM.red,
                      fontFamily: TERM.font,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    <RefreshCw className="w-3 h-3" /> retry
                  </button>
                )}
              </div>
            ) : (
              <span
                style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                dangerouslySetInnerHTML={{
                  __html: (message.content || '')
                    .replace(/\*\*(.*?)\*\*/g, '<span style="color: #ffb000; font-weight: bold;">$1</span>')
                    .replace(/•/g, '<span style="color: #00ff41;">></span>')
                    .replace(/\n/g, '<br>')
                }}
              />
            )}
          </div>
        </div>

        {/* Pending action - terminal-style action card */}
        {message.pendingAction && !message.generatedContent && !message.isLoading && (
          <div
            className="ml-16 mt-2 p-3"
            style={{
              background: 'rgba(0, 255, 65, 0.04)',
              border: `1px solid ${TERM.greenBorder}`,
              borderLeft: `3px solid ${TERM.green}`,
            }}
          >
            {/* Action header */}
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: TERM.amber, fontSize: 11 }}>[ACTION_REQUIRED]</span>
              <span style={{ color: TERM.white, fontSize: 11 }}>{message.pendingAction.description}</span>
            </div>

            {/* Cost + time info */}
            <div className="flex items-center gap-3 mb-2" style={{ fontSize: 10, color: TERM.whiteDim }}>
              <span>
                <span style={{ color: TERM.greenDim }}>cost:</span>{' '}
                {message.pendingAction.type === 'generate_music'
                  ? calculateMusicCredits(selectedMusicDuration)
                  : message.pendingAction.type === 'generate_video'
                  ? calculateVideoCredits(selectedVideoDuration, selectedModel || VIDEO_MODELS[0].id)
                  : message.pendingAction.estimatedCredits} cr
              </span>
              <span>
                <span style={{ color: TERM.greenDim }}>eta:</span>{' '}
                {message.pendingAction.type === 'generate_video' ? '60-180s' :
                 message.pendingAction.type === 'generate_music' ? '10-30s' : '5-15s'}
              </span>
            </div>

            {/* Model selector */}
            {models.length > 0 && (
              <div className="mb-2">
                <div style={{ color: TERM.greenDim, fontSize: 10, marginBottom: 4 }}>select model:</div>
                <div className="flex flex-wrap gap-1">
                  {models.map((model) => {
                    const isSelected = activeModel === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => setSelectedModel(model.id)}
                        className="px-2 py-1 transition-all"
                        style={{
                          background: isSelected ? 'rgba(0,255,65,0.15)' : 'transparent',
                          border: `1px solid ${isSelected ? TERM.green : TERM.border}`,
                          color: isSelected ? TERM.green : TERM.whiteDim,
                          fontFamily: TERM.font,
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? '> ' : '  '}{model.name}{' '}
                        <span style={{ color: TERM.whiteDim }}>
                          {'credits' in model ? `${model.credits}cr` : `${(model as { creditsPerSec: number }).creditsPerSec}/s`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Video Duration selector */}
            {message.pendingAction?.type === 'generate_video' && (
              <div className="mb-2">
                <div style={{ color: TERM.greenDim, fontSize: 10, marginBottom: 4 }}>duration:</div>
                <div className="flex flex-wrap gap-1">
                  {VIDEO_DURATIONS.map((dur) => {
                    const credits = calculateVideoCredits(dur.value, selectedModel || VIDEO_MODELS[0].id);
                    const isSelected = selectedVideoDuration === dur.value;
                    return (
                      <button
                        key={dur.value}
                        onClick={() => setSelectedVideoDuration(dur.value)}
                        className="px-2 py-1 transition-all"
                        style={{
                          background: isSelected ? 'rgba(0,212,255,0.15)' : 'transparent',
                          border: `1px solid ${isSelected ? TERM.cyan : TERM.border}`,
                          color: isSelected ? TERM.cyan : TERM.whiteDim,
                          fontFamily: TERM.font,
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? '> ' : '  '}{dur.label} ({credits}cr)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Aspect Ratio for images */}
            {message.pendingAction?.type === 'generate_image' && (
              <div className="mb-2">
                <div style={{ color: TERM.greenDim, fontSize: 10, marginBottom: 4 }}>aspect_ratio:</div>
                <div className="flex flex-wrap gap-1">
                  {ASPECT_RATIOS.map((ratio) => {
                    const isSelected = selectedAspectRatio === ratio.id;
                    return (
                      <button
                        key={ratio.id}
                        onClick={() => setSelectedAspectRatio(ratio.id)}
                        className="px-2 py-1 transition-all"
                        style={{
                          background: isSelected ? 'rgba(0,255,65,0.15)' : 'transparent',
                          border: `1px solid ${isSelected ? TERM.green : TERM.border}`,
                          color: isSelected ? TERM.green : TERM.whiteDim,
                          fontFamily: TERM.font,
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? '> ' : '  '}{ratio.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Music Duration */}
            {message.pendingAction?.type === 'generate_music' && (
              <div className="mb-2">
                <div style={{ color: TERM.greenDim, fontSize: 10, marginBottom: 4 }}>duration:</div>
                <div className="flex flex-wrap gap-1">
                  {MUSIC_DURATIONS.map((dur) => {
                    const isSelected = selectedMusicDuration === dur.value;
                    return (
                      <button
                        key={dur.value}
                        onClick={() => setSelectedMusicDuration(dur.value)}
                        className="px-2 py-1 transition-all"
                        style={{
                          background: isSelected ? 'rgba(255,0,255,0.15)' : 'transparent',
                          border: `1px solid ${isSelected ? TERM.magenta : TERM.border}`,
                          color: isSelected ? TERM.magenta : TERM.whiteDim,
                          fontFamily: TERM.font,
                          fontSize: 10,
                          cursor: 'pointer',
                        }}
                      >
                        {isSelected ? '> ' : '  '}{dur.label} ({dur.credits}cr)
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Execute / Cancel buttons */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleConfirmWithModel}
                disabled={isActionLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 transition-all"
                style={{
                  background: isActionLoading ? 'rgba(0,255,65,0.05)' : 'rgba(0,255,65,0.15)',
                  border: `1px solid ${isActionLoading ? TERM.greenBorder : TERM.green}`,
                  color: isActionLoading ? TERM.greenDim : TERM.green,
                  fontFamily: TERM.font,
                  fontSize: 11,
                  cursor: isActionLoading ? 'wait' : 'pointer',
                  boxShadow: isActionLoading ? 'none' : TERM.greenGlow,
                }}
              >
                {isActionLoading ? (
                  <>
                    <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    executing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    execute
                  </>
                )}
              </button>
              <button
                onClick={onCancelAction}
                disabled={isActionLoading}
                className="flex items-center gap-1 px-3 py-1.5 transition-all"
                style={{
                  background: 'transparent',
                  border: `1px solid ${TERM.border}`,
                  color: TERM.whiteDim,
                  fontFamily: TERM.font,
                  fontSize: 11,
                  cursor: isActionLoading ? 'default' : 'pointer',
                  opacity: isActionLoading ? 0.5 : 1,
                }}
              >
                <X className="w-3 h-3" /> cancel
              </button>
            </div>
          </div>
        )}

        {/* Generated content display */}
        {message.generatedContent && message.generatedContent.type && (
          <div className="ml-16 mt-2">
            {/* Success header */}
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: TERM.green, fontSize: 11 }}>[COMPLETE]</span>
              <span style={{ color: TERM.greenDim, fontSize: 10 }}>
                generation successful
              </span>
            </div>

            {/* Images */}
            {message.generatedContent.type === 'image' && message.generatedContent.urls?.filter(u => typeof u === 'string' && u.length > 0).length > 0 && (
              <div className={`grid gap-2 ${message.generatedContent.urls.filter(u => typeof u === 'string' && u.length > 0).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {message.generatedContent.urls.filter(u => typeof u === 'string' && u.length > 0).map((url, i) => (
                  <div key={i} className="relative group overflow-hidden" style={{
                    border: `1px solid ${TERM.greenBorder}`,
                    background: TERM.bgPanel,
                  }}>
                    <img
                      src={url}
                      alt={`Generated ${i + 1}`}
                      className="w-full cursor-pointer transition-all duration-300"
                      style={{ maxHeight: '300px', objectFit: 'cover' }}
                      onClick={() => setLightboxImage(url)}
                      onError={(e) => {
                        try { (e.target as HTMLImageElement).style.display = 'none'; } catch { /* safe */ }
                      }}
                    />
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setLightboxImage(url); }}
                        className="p-1.5 transition-all"
                        style={{ background: 'rgba(0,0,0,0.8)', border: `1px solid ${TERM.greenBorder}`, cursor: 'pointer' }}
                      >
                        <Maximize2 className="w-3.5 h-3.5" style={{ color: TERM.green }} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDownload(url, 'image'); }}
                        className="p-1.5 transition-all"
                        style={{ background: 'rgba(0,0,0,0.8)', border: `1px solid ${TERM.greenBorder}`, cursor: 'pointer' }}
                      >
                        <Download className="w-3.5 h-3.5" style={{ color: TERM.green }} />
                      </button>
                    </div>
                    {/* File label */}
                    <div className="px-2 py-1" style={{ background: TERM.bgPanel, borderTop: `1px solid ${TERM.greenBorder}` }}>
                      <span style={{ color: TERM.greenDim, fontSize: 9, fontFamily: TERM.font }}>
                        output_{i + 1}.png | {new Date().toISOString().split('T')[0]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Videos */}
            {message.generatedContent.type === 'video' && message.generatedContent.urls?.[0] && typeof message.generatedContent.urls[0] === 'string' && (
              <div>
                <div className="overflow-hidden" style={{
                  border: `1px solid ${TERM.greenBorder}`,
                  background: TERM.bgPanel,
                }}>
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
                    onError={() => { /* safe */ }}
                  />
                </div>
                <div className="flex gap-1.5 mt-1.5">
                  <button
                    onClick={() => {
                      if (videoRef.current) {
                        isPlaying ? videoRef.current.pause() : videoRef.current.play();
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${TERM.border}`,
                      color: TERM.cyan,
                      fontFamily: TERM.font,
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                    {isPlaying ? 'pause' : 'play'}
                  </button>
                  <button
                    onClick={() => handleDownload(message.generatedContent?.urls?.[0] || '', 'video')}
                    className="flex items-center gap-1 px-2 py-1"
                    style={{
                      background: 'transparent',
                      border: `1px solid ${TERM.border}`,
                      color: TERM.green,
                      fontFamily: TERM.font,
                      fontSize: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <Download className="w-3 h-3" /> save
                  </button>
                </div>
              </div>
            )}

            {/* Music - no URL error */}
            {message.generatedContent.type === 'music' && !message.generatedContent.urls?.[0] && (
              <div style={{ color: TERM.red, fontSize: 11 }}>
                <span style={{ color: TERM.redDim }}>[ERROR]</span> Music generated but no audio URL returned. Retry.
              </div>
            )}
            {/* Music player */}
            {message.generatedContent.type === 'music' && message.generatedContent.urls?.[0] && (
              <div className="p-3" style={{
                background: 'rgba(255,0,255,0.04)',
                border: `1px solid rgba(255,0,255,0.15)`,
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <Volume2 className="w-4 h-4" style={{ color: TERM.magenta }} />
                  <span style={{ color: TERM.magenta, fontSize: 11 }}>audio_track.wav</span>
                </div>

                {/* Waveform */}
                <div className="w-full h-8 mb-2 flex items-center gap-px overflow-hidden"
                  style={{ background: 'rgba(0,0,0,0.4)' }}
                >
                  {Array.from({ length: 50 }).map((_, i) => {
                    const height = Math.sin(i * 0.35) * 30 + 40;
                    return (
                      <div key={i} className="flex-1" style={{
                        height: `${height}%`,
                        background: TERM.green,
                        opacity: 0.6,
                      }} />
                    );
                  })}
                </div>

                <audio
                  src={message.generatedContent.urls?.[0] || ''}
                  controls
                  className="w-full h-8"
                  style={{ filter: 'hue-rotate(120deg) saturate(2)' }}
                />
                <button
                  onClick={() => handleDownload(message.generatedContent?.urls?.[0] || '', 'music')}
                  className="flex items-center gap-1 mt-2 px-2 py-1"
                  style={{
                    background: 'transparent',
                    border: `1px solid rgba(255,0,255,0.3)`,
                    color: TERM.magenta,
                    fontFamily: TERM.font,
                    fontSize: 10,
                    cursor: 'pointer',
                  }}
                >
                  <Download className="w-3 h-3" /> download .wav
                </button>
              </div>
            )}

            {/* Credits used */}
            {message.generatedContent.creditsUsed !== undefined && (
              <div className="mt-2" style={{ color: TERM.whiteDim, fontSize: 10 }}>
                <span style={{ color: TERM.greenDim }}>  credits_used:</span> {message.generatedContent.creditsUsed}
                <span style={{ color: TERM.greenDim }}> | remaining:</span> {message.generatedContent.remainingCredits}
              </div>
            )}
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

      {/* Animations */}
      <style>{`
        @keyframes termFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
});

// Quick action chips - terminal style
const TermQuickActions = memo(function TermQuickActions({ onSelect }: { onSelect: (text: string) => void }) {
  const actions = [
    { icon: <Image className="w-3 h-3" />, label: 'image', prompt: 'Create an image of ', color: TERM.green },
    { icon: <Film className="w-3 h-3" />, label: 'video', prompt: 'Generate a video of ', color: TERM.cyan },
    { icon: <Music className="w-3 h-3" />, label: 'music', prompt: 'Make a ', color: TERM.magenta },
  ];

  return (
    <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 scrollbar-none">
      {actions.map((action, i) => (
        <button
          key={i}
          onClick={() => onSelect(action.prompt)}
          className="flex items-center gap-1.5 px-2.5 py-1 transition-all flex-shrink-0"
          style={{
            background: 'transparent',
            border: `1px solid ${action.color}40`,
            color: action.color,
            fontFamily: TERM.font,
            fontSize: 10,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${action.color}15`;
            e.currentTarget.style.borderColor = action.color;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = `${action.color}40`;
          }}
        >
          {action.icon}
          <span>/{action.label}</span>
        </button>
      ))}
    </div>
  );
});


// Main ChatAssistant component
const ChatAssistant = memo<ChatAssistantProps>(function ChatAssistant() {
  const walletContext = useSimpleWallet();
  const isConnected = walletContext.isConnected;
  const { preferences } = useUserPreferences();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [attachedImages, setAttachedImages] = useState<string[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [autonomousMode, setAutonomousMode] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [messages]);

  // Load welcome message on mount — terminal style
  useEffect(() => {
    getWelcomeMessage().then(({ suggestions: sug }) => {
      setMessages([{
        id: generateMessageId(),
        role: 'assistant',
        content: `System initialized. Multimodal generation engine online.\n\nAvailable commands:\n> **/image** — Generate images (Flux Pro, Flux 2, Nano Banana)\n> **/video** — Text-to-video, image-to-video\n> **/music** — Generate tracks & sound effects\n\nType a natural language prompt to begin. Attach reference images for editing.`,
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

  // Handle image upload
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 4 - attachedImages.length;
    if (remainingSlots <= 0) return;

    const filesToProcess = files.slice(0, remainingSlots);
    const validFiles = filesToProcess.filter(file => {
      if (!file.type.startsWith('image/')) return false;
      if (file.size > 10 * 1024 * 1024) return false;
      return true;
    });

    if (validFiles.length === 0) return;

    setIsUploadingImage(true);
    let loadedCount = 0;
    const newImages: string[] = [];

    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') newImages.push(result);
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

    e.target.value = '';
  }, [attachedImages.length]);

  const handleRemoveImage = useCallback((index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Send message
  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading || !isConnected) return;

    const imageCount = attachedImages.length;
    let messageContent = inputValue.trim();
    if (imageCount === 1) messageContent = `[ref:image_attached] ${messageContent}`;
    else if (imageCount > 1) messageContent = `[ref:${imageCount}_images] ${messageContent}`;

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

    const imagesToSend = [...attachedImages];

    setMessages(prev => [...prev, userMessage, loadingMessage]);
    setInputValue('');
    setAttachedImages([]);
    setIsLoading(true);
    setSuggestions([]);

    try {
      const response = await sendChatMessage(
        userMessage.content,
        messages,
        getContext(),
        imagesToSend.length > 0 ? imagesToSend : undefined,
        preferences.chatModel || 'claude-sonnet-4-5'
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

  // Confirm generation
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

  // Cancel
  const handleCancelAction = useCallback(() => {
    setMessages(prev => [...prev, {
      id: generateMessageId(),
      role: 'assistant',
      content: 'Action cancelled. Awaiting next command.',
      timestamp: new Date().toISOString()
    }]);
  }, []);

  // Select suggestion / quick action
  const handlePromptSelect = useCallback((text: string) => {
    setInputValue(text);
    inputRef.current?.focus();
  }, []);

  // Clear chat
  const handleClearChat = useCallback(() => {
    setMessages([{
      id: generateMessageId(),
      role: 'assistant',
      content: 'Session cleared. Ready for new commands.',
      timestamp: new Date().toISOString()
    }]);
    setSuggestions([]);
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="h-full flex flex-col relative overflow-hidden" style={{
      background: TERM.bg,
      minHeight: 0,
      flex: '1 1 0%',
    }}>
      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
      }} />

      {/* CRT vignette */}
      <div className="absolute inset-0 pointer-events-none z-10" style={{
        background: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.4) 100%)',
      }} />

      {/* Auth overlay */}
      {!isConnected && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center"
          style={{
            background: 'rgba(10, 14, 20, 0.85)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div className="w-full h-full overflow-auto">
            <AuthPrompt />
          </div>
        </div>
      )}

      {/* Terminal title bar */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 flex-shrink-0 z-20"
        style={{
          background: '#1c2333',
          borderBottom: `1px solid ${TERM.border}`,
        }}
      >
        {/* Window controls */}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
          <div className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
        </div>

        <div className="flex-1 flex items-center justify-center gap-2" style={{ fontFamily: TERM.font }}>
          <Terminal className="w-3.5 h-3.5" style={{ color: TERM.green }} />
          <span style={{ color: TERM.whiteDim, fontSize: 11 }}>seiso@agent ~ /chat</span>
          <span style={{ 
            color: TERM.amber, 
            fontSize: 9, 
            padding: '1px 6px', 
            background: 'rgba(255,176,0,0.1)', 
            borderRadius: 3,
            border: `1px solid rgba(255,176,0,0.2)`
          }}>
            {CHAT_AI_MODELS.find(m => m.id === (preferences.chatModel || 'claude-sonnet-4-5'))?.name || 'Sonnet 4.5'}
          </span>
          <button
            onClick={() => setAutonomousMode(prev => !prev)}
            title={autonomousMode ? 'Autonomous mode: ON (tools execute automatically)' : 'Autonomous mode: OFF (confirm before tools run)'}
            style={{ 
              color: autonomousMode ? TERM.green : TERM.whiteDim,
              fontSize: 9, 
              padding: '1px 6px', 
              background: autonomousMode ? 'rgba(0,255,65,0.1)' : 'rgba(255,255,255,0.05)',
              borderRadius: 3,
              border: `1px solid ${autonomousMode ? 'rgba(0,255,65,0.3)' : 'rgba(255,255,255,0.1)'}`,
              cursor: 'pointer',
            }}
          >
            {autonomousMode ? 'AUTO' : 'MANUAL'}
          </button>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isConnected && (
            <>
              <div className="flex items-center gap-1 px-2 py-0.5" style={{
                background: 'rgba(0,255,65,0.08)',
                border: `1px solid ${TERM.greenBorder}`,
                fontFamily: TERM.font,
                fontSize: 10,
                color: TERM.green,
              }}>
                <Zap className="w-2.5 h-2.5" />
                {walletContext.credits ?? 0} cr
              </div>
              <button
                onClick={handleClearChat}
                className="p-1 transition-colors"
                style={{ color: TERM.whiteDim, cursor: 'pointer', background: 'none', border: 'none' }}
                title="Clear session"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { if (walletContext.disconnectWallet) walletContext.disconnectWallet(); }}
                className="p-1 transition-colors"
                style={{ color: TERM.whiteDim, cursor: 'pointer', background: 'none', border: 'none' }}
                title="Disconnect"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Terminal content area */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 min-h-0 z-20"
        style={{
          background: TERM.bg,
          filter: !isConnected ? 'blur(3px)' : 'none',
          opacity: !isConnected ? 0.6 : 1,
          transition: 'filter 0.3s, opacity 0.3s',
        }}
      >
        {/* ASCII banner */}
        {messages.length <= 1 && (
          <div className="mb-4">
            <pre style={{
              color: TERM.green,
              fontFamily: TERM.font,
              fontSize: 10,
              lineHeight: 1.2,
              textShadow: TERM.greenGlow,
              whiteSpace: 'pre',
              overflow: 'hidden',
            }}>
              {ASCII_BANNER}
            </pre>
            <div className="mt-1 flex items-center gap-2" style={{ fontFamily: TERM.font, fontSize: 10 }}>
              <span style={{ color: TERM.greenDim }}>v2.0.0</span>
              <span style={{ color: TERM.border }}>|</span>
              <span style={{ color: TERM.whiteDim }}>multimodal generation engine</span>
              <span style={{ color: TERM.border }}>|</span>
              <span style={{ color: TERM.amber }}>x402 payment protocol</span>
            </div>
            <div style={{ borderBottom: `1px solid ${TERM.border}`, margin: '8px 0' }} />
          </div>
        )}

        {/* Messages */}
        {messages.map((msg) => (
          <TermMessage
            key={msg.id}
            message={msg}
            onConfirmAction={handleConfirmAction}
            onCancelAction={handleCancelAction}
            isActionLoading={isGenerating}
          />
        ))}
        <div ref={messagesEndRef} />

        {/* Suggestions */}
        {suggestions.length > 0 && messages.length <= 1 && (
          <div className="mt-4 mb-2">
            <div style={{ color: TERM.whiteDim, fontFamily: TERM.font, fontSize: 10, marginBottom: 6 }}>
              suggested commands:
            </div>
            <div className="flex flex-col gap-1">
              {suggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => handlePromptSelect(suggestion)}
                  className="flex items-center gap-2 text-left px-2 py-1 transition-all"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    fontFamily: TERM.font,
                    fontSize: 11,
                    color: TERM.greenDim,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = TERM.green;
                    e.currentTarget.style.background = TERM.greenDark;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = TERM.greenDim;
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{suggestion}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="flex-shrink-0 z-20"
        style={{
          background: TERM.bgPanel,
          borderTop: `1px solid ${TERM.border}`,
          filter: !isConnected ? 'blur(3px)' : 'none',
          opacity: !isConnected ? 0.6 : 1,
        }}
      >
        {isConnected && (
          <div className="px-3 py-2">
            {/* Quick actions */}
            <TermQuickActions onSelect={handlePromptSelect} />

            {/* Attached images */}
            {attachedImages.length > 0 && (
              <div className="mb-2 px-2 py-1.5" style={{
                background: 'rgba(0,212,255,0.05)',
                border: `1px solid rgba(0,212,255,0.2)`,
              }}>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {attachedImages.map((img, index) => (
                      <div key={index} className="relative flex-shrink-0">
                        <img
                          src={img}
                          alt={`Ref ${index + 1}`}
                          className="w-10 h-10 object-cover"
                          style={{ border: `1px solid ${TERM.greenBorder}` }}
                          onError={(e) => {
                            try { (e.target as HTMLImageElement).style.display = 'none'; } catch { /* safe */ }
                          }}
                        />
                        <button
                          onClick={() => handleRemoveImage(index)}
                          className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center"
                          style={{ background: TERM.red, color: '#fff', border: 'none', cursor: 'pointer', fontSize: 8 }}
                        >
                          <X className="w-2 h-2" />
                        </button>
                        {attachedImages.length > 1 && (
                          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1"
                            style={{
                              background: index === 0 ? TERM.green : TERM.cyan,
                              color: '#000',
                              fontSize: 7,
                              fontFamily: TERM.font,
                              fontWeight: 'bold',
                            }}>
                            {index === 0 ? 'BASE' : `+${index}`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <span style={{ color: TERM.cyanDim, fontFamily: TERM.font, fontSize: 10 }}>
                    {attachedImages.length} ref{attachedImages.length > 1 ? 's' : ''} loaded
                  </span>
                  {attachedImages.length > 1 && (
                    <button
                      onClick={() => setAttachedImages([])}
                      className="ml-auto px-1.5 py-0.5"
                      style={{
                        background: 'transparent',
                        border: `1px solid ${TERM.border}`,
                        color: TERM.whiteDim,
                        fontFamily: TERM.font,
                        fontSize: 9,
                        cursor: 'pointer',
                      }}
                    >
                      clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Input row */}
            <div className="flex items-center gap-1.5">
              {/* Image upload */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isGenerating || isUploadingImage || attachedImages.length >= 4}
                className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: attachedImages.length > 0 ? 'rgba(0,255,65,0.15)' : 'transparent',
                  border: `1px solid ${attachedImages.length > 0 ? TERM.green : TERM.border}`,
                  color: attachedImages.length > 0 ? TERM.green : TERM.whiteDim,
                  cursor: (isLoading || isGenerating || attachedImages.length >= 4) ? 'default' : 'pointer',
                  opacity: (isLoading || isGenerating || attachedImages.length >= 4) ? 0.4 : 1,
                }}
                title={attachedImages.length >= 4 ? 'Max 4 images' : 'Attach reference images'}
              >
                {isUploadingImage ? (
                  <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" />
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

              {/* Prompt prefix */}
              <span style={{ color: TERM.green, fontFamily: TERM.font, fontSize: 12, flexShrink: 0 }}>
                $
              </span>

              {/* Text input */}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  attachedImages.length > 1
                    ? "describe edits for attached images..."
                    : attachedImages.length === 1
                    ? "describe what to do with this image..."
                    : "enter prompt or command..."
                }
                disabled={isLoading || isGenerating}
                className="flex-1 min-w-0 py-1.5 focus:outline-none"
                style={{
                  background: 'transparent',
                  color: TERM.white,
                  fontFamily: TERM.font,
                  fontSize: 13,
                  border: 'none',
                  caretColor: TERM.green,
                }}
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || isGenerating}
                className="w-8 h-8 flex items-center justify-center flex-shrink-0 transition-all"
                style={{
                  background: (!inputValue.trim() || isLoading || isGenerating) ? 'transparent' : 'rgba(0,255,65,0.15)',
                  border: `1px solid ${(!inputValue.trim() || isLoading || isGenerating) ? TERM.border : TERM.green}`,
                  color: (!inputValue.trim() || isLoading || isGenerating) ? TERM.whiteDim : TERM.green,
                  cursor: (!inputValue.trim() || isLoading || isGenerating) ? 'default' : 'pointer',
                  boxShadow: (!inputValue.trim() || isLoading || isGenerating) ? 'none' : TERM.greenGlow,
                }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Not connected placeholder */}
        {!isConnected && (
          <div className="px-4 py-3 text-center" style={{ fontFamily: TERM.font, fontSize: 11, color: TERM.whiteDim }}>
            <Terminal className="w-5 h-5 mx-auto mb-1" style={{ color: TERM.greenDim }} />
            <span style={{ color: TERM.amber }}>[AUTH_REQUIRED]</span> Connect wallet to access terminal
          </div>
        )}
      </div>

      {/* Status bar */}
      <div
        className="flex items-center gap-3 px-3 py-0.5 flex-shrink-0 z-20"
        style={{
          background: '#161b22',
          borderTop: `1px solid ${TERM.border}`,
          fontFamily: TERM.font,
          fontSize: 9,
          color: TERM.whiteDim,
          filter: !isConnected ? 'blur(2px)' : 'none',
        }}
      >
        <span className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{
            background: isConnected ? TERM.green : TERM.red,
            boxShadow: isConnected ? '0 0 4px rgba(0,255,65,0.5)' : '0 0 4px rgba(255,51,51,0.5)',
          }} />
          {isConnected ? 'connected' : 'offline'}
        </span>
        <span style={{ color: TERM.border }}>|</span>
        <span className="flex items-center gap-1">
          <Image className="w-2.5 h-2.5" /> img
        </span>
        <span className="flex items-center gap-1">
          <Film className="w-2.5 h-2.5" /> vid
        </span>
        <span className="flex items-center gap-1">
          <Music className="w-2.5 h-2.5" /> aud
        </span>
        <span className="flex-1" />
        <span style={{ color: isGenerating ? TERM.amber : isLoading ? TERM.cyan : TERM.greenDim }}>
          {isGenerating ? '[GENERATING...]' : isLoading ? '[PROCESSING...]' : '[READY]'}
        </span>
      </div>

      {/* Blinking cursor animation */}
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
});

export default ChatAssistant;
