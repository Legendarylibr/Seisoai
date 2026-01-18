/**
 * VideoGenerator - Video generation component
 * 
 * TODO: This file is 1200+ lines and should be split into:
 * - VideoGenerator.tsx (main component, ~400 lines)
 * - hooks/useVideoGeneration.ts (generation logic hook)
 * - components/video/VideoPreview.tsx (video player/preview)
 * - components/video/FrameUploader.tsx (first/last frame upload)
 * - components/video/GenerationModeSelector.tsx (mode selection)
 * - components/video/VideoControls.tsx (playback controls)
 */
import React, { useState, useRef, useCallback, memo, useEffect, ReactNode, ChangeEvent } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateVideo } from '../services/videoService';
import { addGeneration } from '../services/galleryService';
import { Film, Upload, Play, X, Clock, Monitor, Volume2, VolumeX, Sparkles, AlertCircle, ChevronDown, Zap, Image, Layers } from 'lucide-react';
import logger from '../utils/logger';
import { Win95Button, Win95Panel, Win95GroupBox, WIN95_COLORS as WIN95 } from './ui/Win95';

// Generation mode options - Veo 3.1 variants + Lip Sync
// Note: Actual endpoint construction is handled by the backend
const GENERATION_MODES = [
  { 
    value: 'text-to-video', 
    label: 'Text to Video', 
    icon: '✍️',
    description: 'Generate video from text prompt only',
    requiresFirstFrame: false,
    requiresLastFrame: false,
    requiresAudio: false
  },
  { 
    value: 'image-to-video', 
    label: 'Image to Video', 
    icon: '🖼️',
    description: 'Animate a single image',
    requiresFirstFrame: true,
    requiresLastFrame: false,
    requiresAudio: false
  },
  { 
    value: 'first-last-frame', 
    label: 'First/Last Frame', 
    icon: '🎞️',
    description: 'Animate between two frames',
    requiresFirstFrame: true,
    requiresLastFrame: true,
    requiresAudio: false
  },
  { 
    value: 'lip-sync', 
    label: 'Lip Sync', 
    icon: '🗣️',
    description: 'Make portrait speak from audio',
    requiresFirstFrame: true,
    requiresLastFrame: false,
    requiresAudio: true,
    fixedCredits: 3
  }
];

// Model options - LTX-2 (budget) vs Veo 3.1 (quality)
const MODEL_OPTIONS = [
  {
    value: 'ltx',
    label: 'LTX-2 ⚡',
    description: 'Fast & affordable',
    // LTX-2 pricing: 1 credit/s base, 1.25 credits/s with audio
    creditsPerSecNoAudio: 1.0,
    creditsPerSecWithAudio: 1.25,
    supportedModes: ['text-to-video', 'image-to-video']
  },
  {
    value: 'veo',
    label: 'Veo 3.1 ✨',
    description: 'Premium quality',
    // Veo 3.1 fast pricing: $0.20/sec no audio, $0.40/sec with audio
    pricePerSecNoAudio: 0.22,
    pricePerSecWithAudio: 0.44,
    supportedModes: ['text-to-video', 'image-to-video', 'first-last-frame']
  }
];

// Quality tier options (only for Veo model)
const QUALITY_OPTIONS = [
  { 
    value: 'fast', 
    label: 'Fast ⚡', 
    description: 'Faster generation',
    // FAL pricing: $0.20/sec no audio, $0.40/sec with audio
    // Our pricing: +10% upcharge
    pricePerSecNoAudio: 0.22,
    pricePerSecWithAudio: 0.44
  },
  { 
    value: 'quality', 
    label: 'Quality ✨', 
    description: 'Higher quality output',
    // FAL pricing: $0.50/sec no audio, $0.75/sec with audio
    // Our pricing: +10% upcharge
    pricePerSecNoAudio: 0.55,
    pricePerSecWithAudio: 0.825
  }
];

// Duration options
const DURATION_OPTIONS = [
  { value: '4s', label: '4s', icon: '⚡' },
  { value: '6s', label: '6s', icon: '🎬' },
  { value: '8s', label: '8s', icon: '🎥' }
];

// Resolution options
const RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p HD' },
  { value: '1080p', label: '1080p Full HD' }
];

// Aspect ratio options
const ASPECT_RATIO_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' }
];

/**
 * Calculate video generation credits based on duration, audio, quality, and model
 * 1 credit = $0.10
 */
const calculateVideoCredits = (duration: string, generateAudio: boolean, quality: string = 'fast', model: string = 'veo'): number => {
  const seconds = parseInt(duration) || 8;
  
  // LTX-2 model - budget pricing with good margin
  if (model === 'ltx') {
    // 1 credit/s base, 1.25 credits/s with audio
    const creditsPerSec = generateAudio ? 1.25 : 1.0;
    // Minimum 3 credits
    return Math.max(3, Math.ceil(seconds * creditsPerSec));
  }
  
  // Veo model - use quality tier pricing
  const qualityConfig = QUALITY_OPTIONS.find(q => q.value === quality) || QUALITY_OPTIONS[0];
  const pricePerSec = generateAudio ? qualityConfig.pricePerSecWithAudio : qualityConfig.pricePerSecNoAudio;
  // Convert dollars to credits (1 credit = $0.10)
  const creditsPerSecond = pricePerSec / 0.10;
  return Math.ceil(seconds * creditsPerSecond);
};



// Frame upload component - Win95 style
interface FrameUploadProps {
  label: string;
  frameUrl: string | null;
  onUpload: (url: string) => void;
  onRemove: () => void;
  icon: ReactNode;
}

const FrameUpload = memo<FrameUploadProps>(({ label, frameUrl, onUpload, onRemove, icon }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }
    
    if (file.size > 8 * 1024 * 1024) {
      alert('Image too large. Maximum size is 8MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result === 'string') {
        onUpload(result);
      }
    };
    reader.readAsDataURL(file);
  }, [onUpload]);

  const handleClick = () => fileInputRef.current?.click();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-0.5 mb-0.5">
        <span className="text-[9px]">{icon}</span>
        <span className="text-[9px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{label}</span>
      </div>
      
      {!frameUrl ? (
        <div 
          onClick={handleClick}
          className="flex-1 flex flex-col items-center justify-center cursor-pointer"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`,
            minHeight: '50px'
          }}
        >
          <Upload className="w-4 h-4" style={{ color: WIN95.textDisabled }} />
          <span className="text-[8px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Upload</span>
        </div>
      ) : (
        <div 
          className="flex-1 relative overflow-hidden group"
          style={{ 
            minHeight: '50px',
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
          }}
        >
          <img 
            src={frameUrl} 
            alt={label}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setPreviewImage(frameUrl)}
          />
          <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Win95Button onClick={handleClick} className="px-1 py-0.5">
              <Upload className="w-2.5 h-2.5" />
            </Win95Button>
            <Win95Button onClick={onRemove} className="px-1 py-0.5">
              <X className="w-2.5 h-2.5" />
            </Win95Button>
          </div>
        </div>
      )}
      
      <input 
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Enlarged preview modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImage} 
              alt="Enlarged preview" 
              className="max-w-full max-h-[85vh] object-contain"
              style={{ boxShadow: `4px 4px 0 ${WIN95.border.darker}` }}
            />
            <Win95Button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-2 -right-2"
            >
              <X className="w-4 h-4" />
            </Win95Button>
          </div>
        </div>
      )}
    </div>
  );
});

// Collapsible How to Use component - Win95 style with blue title bar
const CollapsibleVideoHowToUse = memo(function CollapsibleVideoHowToUse(): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  return (
    <div 
      style={{ 
        background: WIN95.bg,
        margin: '8px 8px 0 8px',
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Blue title bar */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)} 
        className="w-full flex items-center justify-between px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff',
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <div className="flex items-center gap-1.5">
          <Film className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">Video Guide</span>
        </div>
        <ChevronDown 
          className="w-3.5 h-3.5 transition-transform" 
          style={{ 
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' 
          }} 
        />
      </button>
      {isExpanded && (
        <div className="p-2 text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {/* Generation Modes */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>Generation Modes</div>
            <div className="space-y-0.5 text-[9px]">
              <div><strong>✍️ Text to Video:</strong> Generate video from prompt only</div>
              <div><strong>🖼️ Image to Video:</strong> Animate a single source image</div>
              <div><strong>🎞️ First/Last Frame:</strong> Animate between two frames</div>
            </div>
          </div>
          
          {/* Quality Tiers */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>Quality Tiers</div>
            <div className="grid grid-cols-2 gap-0.5 text-[9px]">
              <div>⚡ <strong>Fast:</strong> Quick generation</div>
              <div>✨ <strong>Quality:</strong> Higher fidelity</div>
              <div>🔊 AI Audio: Sound effects</div>
              <div>📺 720p / 1080p resolution</div>
            </div>
          </div>
          
          {/* Prompt Tips */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>Prompt Tips</div>
            <div className="space-y-0.5 text-[9px]">
              <div>• Camera: "slowly pans left", "zooms in dramatically"</div>
              <div>• Action: "waves crash", "leaves fall gently"</div>
              <div>• Style: "cinematic", "slow motion", "timelapse"</div>
              <div>• Mood: "peaceful", "tense", "joyful"</div>
            </div>
          </div>
          
          {/* Pricing */}
          <div className="p-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>💰 Pricing (per second)</div>
            <div className="flex flex-wrap gap-1">
              <span className="text-[8px] px-1.5 py-0.5" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>⚡ Fast: 🔇 $0.22 | 🔊 $0.44</span>
              <span className="text-[8px] px-1.5 py-0.5" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>✨ Quality: 🔇 $0.55 | 🔊 $0.83</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

interface VideoGeneratorProps {
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
  onModelChange?: (model: string) => void;
  onGenerationModeChange?: (mode: string) => void;
}

const VideoGenerator = memo<VideoGeneratorProps>(function VideoGenerator({ 
  onShowTokenPayment: _onShowTokenPayment, 
  onShowStripePayment: _onShowStripePayment,
  onModelChange,
  onGenerationModeChange 
}) {
  const emailContext = useEmailAuth();
  const walletContext = useSimpleWallet();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isConnected = isEmailAuth || walletContext.isConnected;
  
  // State
  const [generationMode, setGenerationMode] = useState<string>('text-to-video');
  const [model, setModel] = useState<string>('ltx');
  const [quality, setQuality] = useState<string>('fast');
  const [firstFrameUrl, setFirstFrameUrl] = useState<string | null>(null);
  const [lastFrameUrl, setLastFrameUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); // For lip sync
  const [prompt, setPrompt] = useState<string>('');
  const [duration, setDuration] = useState<string>('8s');
  const [resolution, setResolution] = useState<string>('720p');
  const [aspectRatio, setAspectRatio] = useState<string>('auto');
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState<boolean>(false);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isUploadingAudio, setIsUploadingAudio] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Notify parent when model changes (for PromptLab optimization)
  useEffect(() => {
    onModelChange?.(model);
  }, [model, onModelChange]);

  // Notify parent when generation mode changes (for PromptLab optimization)
  useEffect(() => {
    onGenerationModeChange?.(generationMode);
  }, [generationMode, onGenerationModeChange]);

  // Timer for elapsed time during generation
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (isGenerating) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      
      intervalId = setInterval(() => {
        if (startTimeRef.current) {
          setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
        }
      }, 1000);
    } else {
      startTimeRef.current = null;
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isGenerating]);

  // Get progress message based on elapsed time
  const getProgressMessage = useCallback((elapsed: number): string => {
    if (elapsed < 10) return 'Submitting to AI...';
    if (elapsed < 30) return 'AI is processing your request...';
    if (elapsed < 60) return 'Generating frames...';
    if (elapsed < 120) return 'Rendering video...';
    if (elapsed < 180) return 'Almost there, adding final touches...';
    if (elapsed < 300) return 'Taking a bit longer than usual...';
    return 'Still processing, please wait...';
  }, []);

  // Format elapsed time
  const formatElapsedTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  }, []);

  // Auto-play video when URL changes and video is ready
  useEffect(() => {
    if (generatedVideoUrl && videoRef.current) {
      setVideoReady(false);
      setError(null);
      const video = videoRef.current;
      
      // Force load and play when video is ready
      const handleCanPlay = () => {
        setVideoReady(true);
        // Start muted for autoplay compatibility, then unmute
        video.muted = true;
        video.play().then(() => {
          // Autoplay succeeded, try to unmute
          video.muted = false;
        }).catch((e: Error) => {
          // Autoplay blocked even muted, just show controls
          logger.debug('Autoplay blocked', { error: e.message });
          setVideoReady(true);
        });
      };
      
      const handleError = (e: Event) => {
        const target = e.target as HTMLVideoElement;
        logger.error('Video load error', { error: target?.error?.message, src: generatedVideoUrl?.substring(0, 50) });
        setVideoReady(true);
      };
      
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('error', handleError);
      
      // Set source and load
      video.src = generatedVideoUrl;
      video.load();
      
      return () => {
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('error', handleError);
      };
    }
  }, [generatedVideoUrl]);

  // Get current mode configuration
  const currentMode = GENERATION_MODES.find(m => m.value === generationMode) || GENERATION_MODES[2];
  const isLipSyncMode = generationMode === 'lip-sync';
  
  // Determine if we can generate based on mode requirements
  const hasRequiredInputs = () => {
    if (currentMode.requiresFirstFrame && !firstFrameUrl) return false;
    if (currentMode.requiresLastFrame && !lastFrameUrl) return false;
    if (currentMode.requiresAudio && !audioUrl) return false;
    return true;
  };

  // For lip sync, prompt is optional (we can just animate to audio)
  const canGenerate = isConnected && hasRequiredInputs() && (isLipSyncMode || prompt.trim().length > 0) && !isGenerating;
  
  // Handle audio file upload for lip sync
  const handleAudioUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
      setError('Please select a valid audio file (MP3, WAV, M4A, etc.)');
      return;
    }
    
    if (file.size > 25 * 1024 * 1024) {
      setError('Audio file too large. Maximum size is 25MB.');
      return;
    }
    
    setIsUploadingAudio(true);
    setError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUri = event.target?.result as string;
        
        // Upload to backend
        const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/audio/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioDataUri: dataUri })
        });
        
        const data = await response.json();
        if (data.success && data.url) {
          setAudioUrl(data.url);
          logger.info('Audio uploaded successfully');
        } else {
          setError(data.error || 'Failed to upload audio');
        }
        setIsUploadingAudio(false);
      };
      reader.onerror = () => {
        setError('Failed to read audio file');
        setIsUploadingAudio(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError((err as Error).message);
      setIsUploadingAudio(false);
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    
    setIsGenerating(true);
    setError(null);
    setGeneratedVideoUrl(null);

    try {
      let result;
      
      // Handle lip sync mode separately
      if (isLipSyncMode && firstFrameUrl && audioUrl) {
        const apiUrl = import.meta.env.VITE_API_URL || '';
        const response = await fetch(`${apiUrl}/api/audio/lip-sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: firstFrameUrl,
            audio_url: audioUrl,
            expression_scale: 1.0,
            walletAddress: walletContext.address,
            userId: emailContext.userId,
            email: emailContext.email
          })
        });
        
        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Lip sync generation failed');
        }
        
        result = {
          videoUrl: data.video_url,
          remainingCredits: data.remainingCredits,
          creditsDeducted: data.creditsDeducted || 3
        };
      } else {
        // Standard video generation
        result = await generateVideo({
          prompt,
          firstFrameUrl: currentMode.requiresFirstFrame ? firstFrameUrl ?? undefined : undefined,
          lastFrameUrl: currentMode.requiresLastFrame ? lastFrameUrl ?? undefined : undefined,
          aspectRatio: aspectRatio as '16:9' | '9:16' | 'auto',
          duration: duration as '4s' | '6s' | '8s',
          resolution: resolution as '720p' | '1080p',
          generateAudio,
          generationMode: generationMode as 'text-to-video' | 'image-to-video' | 'first-last-frame',
          quality: quality as 'fast' | 'quality',
          model: model as 'veo' | 'ltx',
          userId: emailContext.userId ?? undefined,
          walletAddress: walletContext.address ?? undefined,
          email: emailContext.email ?? undefined
        });
      }

      setGeneratedVideoUrl(result.videoUrl);
      
      // Refresh credits
      if (isEmailAuth && emailContext.refreshCredits) {
        emailContext.refreshCredits();
      } else if (walletContext.fetchCredits && walletContext.address) {
        walletContext.fetchCredits(walletContext.address, 3, true);
      }
      
      // Save to gallery (non-blocking)
      const creditsUsed = result.creditsDeducted || (isLipSyncMode ? 3 : calculateVideoCredits(duration, generateAudio, quality, model));
      const identifier = isEmailAuth ? emailContext.userId : walletContext.address;
      if (identifier) {
        addGeneration(identifier, {
          prompt: prompt.trim() || (isLipSyncMode ? 'Lip Sync' : 'Video generation'),
          style: `${currentMode.label}${isLipSyncMode ? '' : ` - ${quality === 'quality' ? 'Quality' : 'Fast'}`}`,
          videoUrl: result.videoUrl,
          creditsUsed: creditsUsed,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined
        }).catch(e => logger.debug('Gallery save failed', { error: e.message }));
      }
      
      logger.info('Video generated successfully', { 
        remainingCredits: result.remainingCredits,
        mode: generationMode
      });
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      logger.error('Video generation failed', { error: error.message });
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, prompt, firstFrameUrl, lastFrameUrl, audioUrl, aspectRatio, duration, resolution, generateAudio, generationMode, quality, model, currentMode, emailContext, walletContext, isEmailAuth, isLipSyncMode]);

  const handleDownload = useCallback(async () => {
    if (!generatedVideoUrl) return;
    
    try {
      const response = await fetch(generatedVideoUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seiso-video-${Date.now()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      const error = err as Error;
      logger.error('Download failed', { error: error.message });
    }
  }, [generatedVideoUrl]);

  return (
    <div className="fade-in h-full flex flex-col" style={{ background: WIN95.bg }}>
      {/* How to Use Guide */}
      <CollapsibleVideoHowToUse />
      
      {/* Main content */}
      <div className="flex-1 min-h-0 p-2 lg:p-2 flex flex-col lg:flex-row gap-2 lg:gap-3 overflow-auto lg:overflow-hidden">
        {/* Left panel - Controls */}
        <div className="lg:w-[45%] flex flex-col gap-2 min-h-0 overflow-auto lg:overflow-hidden">
          {/* Model & Mode Selection */}
          <Win95GroupBox title="Model & Mode" className="flex-shrink-0" icon={<Layers className="w-3.5 h-3.5" />}>
            <div className="flex flex-col gap-1.5">
              {/* Model Selector - LTX-2 (cheap) vs Veo (quality) */}
              <div>
                <label className="text-[8px] font-bold flex items-center gap-1 mb-0.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Zap className="w-2.5 h-2.5" /> Model
                </label>
                <div className="flex gap-0.5">
                  {MODEL_OPTIONS.map((opt) => (
                    <Win95Button
                      key={opt.value}
                      onClick={() => {
                        setModel(opt.value);
                        // If switching to LTX and current mode not supported, switch to text-to-video
                        if (opt.value === 'ltx' && !opt.supportedModes.includes(generationMode)) {
                          setGenerationMode('text-to-video');
                        }
                      }}
                      active={model === opt.value}
                      className="flex-1 text-[9px]"
                    >
                      {opt.label}
                    </Win95Button>
                  ))}
                </div>
                <div className="text-[7px] mt-0.5 text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  {model === 'ltx' ? '💰 Budget-friendly, fast generation' : '✨ Premium quality, all modes'}
                </div>
              </div>

              <div className="flex gap-2 items-start">
                {/* Mode Selector */}
                <div className="flex-1">
                  <label className="text-[8px] font-bold flex items-center gap-1 mb-0.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    <Layers className="w-2.5 h-2.5" /> Mode
                  </label>
                  <Win95Panel sunken className="px-1 py-0.5">
                    <select 
                      value={generationMode}
                      onChange={(e) => {
                        const newMode = e.target.value;
                        setGenerationMode(newMode);
                        // If selecting a mode not supported by LTX, switch to Veo
                        const ltxModel = MODEL_OPTIONS.find(m => m.value === 'ltx')!;
                        if (model === 'ltx' && !ltxModel.supportedModes.includes(newMode)) {
                          setModel('veo');
                        }
                      }}
                      className="w-full text-[9px] bg-transparent focus:outline-none"
                      style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                    >
                      {GENERATION_MODES.map(mode => {
                        const ltxModel = MODEL_OPTIONS.find(m => m.value === 'ltx')!;
                        const isDisabledForLtx = model === 'ltx' && !ltxModel.supportedModes.includes(mode.value);
                        return (
                          <option 
                            key={mode.value} 
                            value={mode.value}
                            disabled={isDisabledForLtx}
                          >
                            {mode.icon} {mode.label} {isDisabledForLtx ? '(Veo only)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </Win95Panel>
                </div>
                
                {/* Quality Selector - only for Veo model, hide for lip sync */}
                {model === 'veo' && generationMode !== 'text-to-video' && !isLipSyncMode && (
                  <div className="flex-1">
                    <label className="text-[8px] font-bold flex items-center gap-1 mb-0.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      <Zap className="w-2.5 h-2.5" /> Quality
                    </label>
                    <div className="flex gap-0.5">
                      {QUALITY_OPTIONS.map((opt) => (
                        <Win95Button
                          key={opt.value}
                          onClick={() => setQuality(opt.value)}
                          active={quality === opt.value}
                          className="flex-1 text-[9px]"
                        >
                          {opt.label}
                        </Win95Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Win95GroupBox>

          {/* Frame Uploads - conditional based on mode */}
          {(currentMode.requiresFirstFrame || currentMode.requiresLastFrame) && (
            <Win95GroupBox title={isLipSyncMode ? "Portrait" : currentMode.requiresLastFrame ? "Frames" : "Reference"} className="flex-shrink-0" icon={<Image className="w-3.5 h-3.5" />}>
              <div className={`grid ${currentMode.requiresLastFrame ? 'grid-cols-2' : 'grid-cols-1'} gap-1`}>
                {currentMode.requiresFirstFrame && (
                  <FrameUpload 
                    label={isLipSyncMode ? "Face" : currentMode.requiresLastFrame ? "Start" : "Source"}
                    icon={isLipSyncMode ? "👤" : currentMode.requiresLastFrame ? "🎬" : "🖼️"}
                    frameUrl={firstFrameUrl}
                    onUpload={setFirstFrameUrl}
                    onRemove={() => setFirstFrameUrl(null)}
                  />
                )}
                {currentMode.requiresLastFrame && (
                  <FrameUpload 
                    label="End"
                    icon="🏁"
                    frameUrl={lastFrameUrl}
                    onUpload={setLastFrameUrl}
                    onRemove={() => setLastFrameUrl(null)}
                  />
                )}
              </div>
            </Win95GroupBox>
          )}

          {/* Audio Upload - for lip sync mode */}
          {isLipSyncMode && (
            <Win95GroupBox title="Audio" className="flex-shrink-0" icon={<Volume2 className="w-3.5 h-3.5" />}>
              <div className="flex flex-col gap-1">
                {!audioUrl ? (
                  <div 
                    onClick={() => audioInputRef.current?.click()}
                    className="flex items-center justify-center gap-2 p-2 cursor-pointer"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
                    }}
                  >
                    {isUploadingAudio ? (
                      <>
                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent' }} />
                        <span className="text-[9px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" style={{ color: WIN95.textDisabled }} />
                        <span className="text-[9px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Upload Audio (MP3, WAV, M4A)</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div 
                    className="flex items-center justify-between p-1.5"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px]">🎵</span>
                      <span className="text-[9px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Audio ready</span>
                    </div>
                    <div className="flex gap-0.5">
                      <Win95Button onClick={() => audioInputRef.current?.click()} className="px-1.5 py-0.5 text-[9px]">
                        Replace
                      </Win95Button>
                      <Win95Button onClick={() => setAudioUrl(null)} className="px-1.5 py-0.5 text-[9px]">
                        <X className="w-3 h-3" />
                      </Win95Button>
                    </div>
                  </div>
                )}
                <input 
                  ref={audioInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
                <p className="text-[8px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Tip: Use Voice Clone in Music tab to generate speech from text
                </p>
              </div>
            </Win95GroupBox>
          )}

          {/* Motion Description - optional for lip sync */}
          {!isLipSyncMode && (
            <Win95GroupBox title="Motion Prompt" className="flex-shrink-0" icon={<Sparkles className="w-3.5 h-3.5" />}>
              <Win95Panel sunken className="p-0">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe animation: action, camera, mood..."
                  className="w-full p-1 resize-none text-[10px] focus:outline-none"
                  rows={1}
                  style={{ 
                    background: 'transparent',
                    color: WIN95.text,
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                    minHeight: '22px'
                  }}
                />
              </Win95Panel>
            </Win95GroupBox>
          )}

          {/* Video Settings - compact grid (hide for lip sync) */}
          {!isLipSyncMode && (
          <Win95GroupBox title="Settings" className="flex-shrink-0" icon={<Monitor className="w-3.5 h-3.5" />}>
            <div className="grid grid-cols-4 gap-1">
              {/* Duration */}
              <div>
                <label className="text-[7px] lg:text-[8px] font-bold flex items-center gap-0.5 mb-0.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Clock className="w-2.5 h-2.5" /> Dur
                </label>
                <div className="flex flex-col gap-0.5">
                  {DURATION_OPTIONS.map((opt) => (
                    <Win95Button
                      key={opt.value}
                      onClick={() => setDuration(opt.value)}
                      active={duration === opt.value}
                      className="text-[8px] py-0.5"
                    >
                      {opt.label}
                    </Win95Button>
                  ))}
                </div>
              </div>
              
              {/* Resolution */}
              <div>
                <label className="text-[7px] lg:text-[8px] font-bold flex items-center gap-0.5 mb-0.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Monitor className="w-2.5 h-2.5" /> Res
                </label>
                <Win95Panel sunken className="px-0.5 py-0.5">
                  <select 
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full text-[8px] bg-transparent focus:outline-none"
                    style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                  >
                    {RESOLUTION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Win95Panel>
              </div>
              
              {/* Aspect Ratio */}
              <div>
                <label className="text-[7px] lg:text-[8px] font-bold mb-0.5 block" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Ratio
                </label>
                <Win95Panel sunken className="px-0.5 py-0.5">
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full text-[8px] bg-transparent focus:outline-none"
                    style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                  >
                    {ASPECT_RATIO_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </Win95Panel>
              </div>
              
              {/* Audio Toggle */}
              <div>
                <label className="text-[7px] lg:text-[8px] font-bold flex items-center gap-0.5 mb-0.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  {generateAudio ? <Volume2 className="w-2.5 h-2.5" /> : <VolumeX className="w-2.5 h-2.5" />} Audio
                </label>
                <Win95Button
                  onClick={() => setGenerateAudio(!generateAudio)}
                  active={generateAudio}
                  className="w-full text-[8px]"
                >
                  {generateAudio ? '🔊' : '🔇'}
                </Win95Button>
              </div>
            </div>
          </Win95GroupBox>
          )}

          {/* Generate Section */}
          <Win95GroupBox title="Generate" className="flex-shrink-0" icon={<Play className="w-3.5 h-3.5" />}>
            <div className="flex flex-col gap-1">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full py-2 text-[11px] font-bold"
                style={{
                  background: '#2d8a2d',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: `inset 1px 1px 0 #4db84d, inset -1px -1px 0 #1a5c1a, inset 2px 2px 0 #3da83d, inset -2px -2px 0 #206b20`,
                  cursor: !canGenerate ? 'default' : 'pointer',
                  opacity: !canGenerate ? 0.7 : 1,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                {isGenerating ? '⏳ Generating...' : isLipSyncMode ? '🗣️ Generate Lip Sync' : '▶ Generate'}
              </button>
              <div className="text-[9px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                {isLipSyncMode ? '3' : calculateVideoCredits(duration, generateAudio, quality, model)} credits • {model === 'ltx' ? 'LTX-2' : 'Veo 3.1'}
              </div>
            </div>
            {!canGenerate && !isGenerating && (
              <div className="mt-1 text-[8px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                {currentMode.requiresFirstFrame && !firstFrameUrl && '⬆️ Portrait  '}
                {currentMode.requiresAudio && !audioUrl && '🎵 Audio  '}
                {currentMode.requiresLastFrame && !lastFrameUrl && '⬆️ Last  '}
                {!isLipSyncMode && prompt.trim().length === 0 && '✏️ Prompt'}
              </div>
            )}
          </Win95GroupBox>
        </div>
        
        {/* Right panel - Output */}
        <div 
          className="flex-1 flex flex-col min-h-0"
          style={{ 
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
          }}
        >
          {/* Title bar - matches ImageOutput */}
          <div 
            className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
            style={{ 
              background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
              color: '#ffffff'
            }}
          >
            <Film className="w-3.5 h-3.5" />
            <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              {isGenerating ? 'Generating...' : generatedVideoUrl ? 'Generated Video' : 'Video Output'}
            </span>
            <div className="flex-1" />
          </div>

          {/* Error banner */}
          {error && generatedVideoUrl && (
            <div className="p-1 flex items-center justify-between gap-1.5 flex-shrink-0" style={{ 
              background: '#ffcccc',
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
            }}>
              <div className="flex items-center gap-1 flex-1 px-1">
                <AlertCircle className="w-3 h-3" style={{ color: '#800000' }} />
                <p className="text-[10px] flex-1" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
              </div>
              <Win95Button onClick={() => setError(null)} className="px-1.5 py-0.5 text-[10px]">
                ✕
              </Win95Button>
            </div>
          )}

          {/* Toolbar - matches ImageOutput */}
          {generatedVideoUrl && (
            <div className="flex items-center gap-0.5 p-1 flex-shrink-0 flex-wrap" style={{ 
              background: WIN95.bg,
              borderBottom: `1px solid ${WIN95.bgDark}`
            }}>
              <Win95Button onClick={handleDownload} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold">
                <span>💾</span>
                <span>Save</span>
              </Win95Button>
              
              <Win95Button onClick={() => { setGeneratedVideoUrl(null); setVideoReady(false); setError(null); }} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold">
                <span>🗑️</span>
                <span className="hidden sm:inline">Clear</span>
              </Win95Button>

              <div className="flex-1" />
              
              {/* Duration indicator */}
              <div 
                className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-[9px]"
                style={{
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  color: WIN95.textDisabled
                }}
              >
                <span>🎬</span>
                <span>{duration}</span>
              </div>
            </div>
          )}

          {/* Video Display - matches ImageOutput styling */}
          <div className="flex-1 min-h-0 p-1 overflow-hidden" style={{ background: '#c0c0c0', maxHeight: 'calc(100% - 40px)' }}>
            <div 
              className="w-full h-full overflow-hidden flex items-center justify-center relative"
              style={{ 
                background: '#ffffff',
                boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #404040'
              }}
            >
              {isGenerating ? (
                <div className="text-center p-4">
                  <div 
                    className="w-14 h-14 mb-3 mx-auto flex items-center justify-center"
                    style={{
                      background: WIN95.bg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                    }}
                  >
                    <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent', borderWidth: '3px' }} />
                  </div>
                  
                  {/* Elapsed time display */}
                  <div 
                    className="inline-block px-3 py-1 mb-2"
                    style={{
                      background: '#000080',
                      color: '#00ff00',
                      fontFamily: 'Consolas, "Courier New", monospace',
                      fontSize: '16px',
                      fontWeight: 'bold',
                      letterSpacing: '1px',
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    ⏱️ {formatElapsedTime(elapsedTime)}
                  </div>
                  
                  <p className="text-[11px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    {getProgressMessage(elapsedTime)}
                  </p>
                  
                  {/* Estimated time based on settings */}
                  <p className="text-[9px] mt-1 px-2" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    {quality === 'quality' 
                      ? `Quality mode: typically 3-6 minutes` 
                      : `Fast mode: typically 1-3 minutes`}
                  </p>
                  
                  {/* Progress bar */}
                  <div 
                    className="w-48 h-4 mx-auto mt-3 overflow-hidden"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    <div 
                      className="h-full transition-all duration-1000"
                      style={{
                        width: `${Math.min(95, (elapsedTime / (quality === 'quality' ? 360 : 180)) * 100)}%`,
                        background: 'repeating-linear-gradient(90deg, #000080, #000080 8px, #1084d0 8px, #1084d0 16px)',
                        animation: 'none'
                      }}
                    />
                  </div>
                  
                  {/* Tip based on elapsed time */}
                  {elapsedTime > 120 && (
                    <p className="text-[8px] mt-2 px-4 italic" style={{ color: '#606060', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      💡 Tip: Fast mode with 720p generates quicker
                    </p>
                  )}
                </div>
              ) : error && !generatedVideoUrl ? (
                <div className="text-center p-4 max-w-sm">
                  <div 
                    className="w-12 h-12 mb-3 mx-auto flex items-center justify-center"
                    style={{
                      background: WIN95.bg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                    }}
                  >
                    <AlertCircle className="w-6 h-6" style={{ color: '#800000' }} />
                  </div>
                  <p className="text-[11px] font-bold mb-1" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Something went wrong</p>
                  <p className="text-[10px] mb-4 text-center" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
                  <Win95Button onClick={() => setError(null)}>Try Again</Win95Button>
                </div>
              ) : generatedVideoUrl ? (
                <>
                  {/* Loading indicator while video buffers */}
                  {!videoReady && (
                    <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: '#ffffff' }}>
                      <div className="text-center">
                        <div 
                          className="w-12 h-12 mb-3 mx-auto flex items-center justify-center"
                          style={{
                            background: WIN95.bg,
                            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                          }}
                        >
                          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent' }} />
                        </div>
                        <p className="text-[10px]" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading video...</p>
                      </div>
                    </div>
                  )}
                  <video 
                    key={generatedVideoUrl}
                    ref={videoRef}
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    crossOrigin="anonymous"
                    className="object-contain"
                    style={{ maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', opacity: videoReady ? 1 : 0 }}
                    onLoadedData={() => setVideoReady(true)}
                    onCanPlay={() => setVideoReady(true)}
                    onLoadedMetadata={() => {
                      // Unmute after autoplay starts successfully
                      if (videoRef.current) {
                        videoRef.current.muted = false;
                      }
                    }}
                    onError={(e) => {
                      const videoEl = e.target as HTMLVideoElement;
                      logger.error('Video playback error', { error: videoEl?.error?.message });
                      setError('Failed to load video. Please try downloading instead.');
                      setVideoReady(true);
                    }}
                  />
                </>
              ) : (
                <div className="text-center p-4">
                  <div 
                    className="w-16 h-16 mb-3 mx-auto flex items-center justify-center"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
                    }}
                  >
                    <Film className="w-8 h-8" style={{ color: WIN95.textDisabled }} />
                  </div>
                  <p className="text-[11px] font-bold" style={{ color: '#000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your video awaits</p>
                  <p className="text-[10px] mt-1" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Upload frames and describe the motion</p>
                  {/* Decorative dotted line */}
                  <div className="w-32 mt-4 mx-auto border-t border-dashed" style={{ borderColor: WIN95.textDisabled }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Status bar */}
      <div 
        className="flex items-center mx-2 mb-2 flex-shrink-0"
        style={{ 
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <div 
          className="flex items-center gap-1.5 px-2 py-1 flex-1"
          style={{ 
            background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
            color: '#ffffff'
          }}
        >
          <span className="text-[10px] font-bold">Status:</span>
          <span className="text-[10px] flex-1">
            {isGenerating ? (
              <span>⏳ {getProgressMessage(elapsedTime)}</span>
            ) : error ? (
              <span>❌ Error</span>
            ) : generatedVideoUrl ? (
              <span>✓ Ready</span>
            ) : (
              'Ready to generate'
            )}
          </span>
          {isGenerating && (
            <span 
              className="text-[10px] font-mono px-1.5 py-0.5"
              style={{ 
                background: 'rgba(0,0,0,0.3)',
                color: '#00ff00',
                fontFamily: 'Consolas, monospace'
              }}
            >
              {formatElapsedTime(elapsedTime)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default VideoGenerator;
