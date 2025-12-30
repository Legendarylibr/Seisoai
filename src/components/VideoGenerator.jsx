import React, { useState, useRef, useCallback, memo, useEffect } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateVideo } from '../services/videoService';
import { addGeneration } from '../services/galleryService';
import { Film, Upload, Play, X, Clock, Monitor, Volume2, VolumeX, Sparkles, Download, AlertCircle, ChevronDown, Square, Zap, Image, Layers } from 'lucide-react';
import logger from '../utils/logger.js';
import { WIN95 } from '../utils/buttonStyles.js';

// Generation mode options - all Veo 3.1 variants
// Note: Actual endpoint construction is handled by the backend
const GENERATION_MODES = [
  { 
    value: 'text-to-video', 
    label: 'Text to Video', 
    icon: '✍️',
    description: 'Generate video from text prompt only',
    requiresFirstFrame: false,
    requiresLastFrame: false
  },
  { 
    value: 'image-to-video', 
    label: 'Image to Video', 
    icon: '🖼️',
    description: 'Animate a single image',
    requiresFirstFrame: true,
    requiresLastFrame: false
  },
  { 
    value: 'first-last-frame', 
    label: 'First/Last Frame', 
    icon: '🎞️',
    description: 'Animate between two frames',
    requiresFirstFrame: true,
    requiresLastFrame: true
  }
];

// Quality tier options
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
 * Calculate video generation credits based on duration, audio, and quality
 * Pricing based on FAL rates with 10% upcharge
 * 1 credit = $0.10
 */
const calculateVideoCredits = (duration, generateAudio, quality = 'fast') => {
  const seconds = parseInt(duration) || 8;
  const qualityConfig = QUALITY_OPTIONS.find(q => q.value === quality) || QUALITY_OPTIONS[0];
  const pricePerSec = generateAudio ? qualityConfig.pricePerSecWithAudio : qualityConfig.pricePerSecNoAudio;
  // Convert dollars to credits (1 credit = $0.10)
  const creditsPerSecond = pricePerSec / 0.10;
  return Math.ceil(seconds * creditsPerSecond);
};

/**
 * Calculate cost in dollars based on duration, audio, and quality
 */
const calculateVideoCost = (duration, generateAudio, quality = 'fast') => {
  const seconds = parseInt(duration) || 8;
  const qualityConfig = QUALITY_OPTIONS.find(q => q.value === quality) || QUALITY_OPTIONS[0];
  const pricePerSec = generateAudio ? qualityConfig.pricePerSecWithAudio : qualityConfig.pricePerSecNoAudio;
  return (seconds * pricePerSec).toFixed(2);
};

// Windows 95 style button component
const Win95Button = memo(function Win95Button({ children, onClick, disabled, active, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-[11px] font-bold transition-none select-none ${className}`}
      style={{
        background: active ? WIN95.bgDark : WIN95.buttonFace,
        color: disabled ? WIN95.textDisabled : (active ? WIN95.highlightText : WIN95.text),
        border: 'none',
        boxShadow: active 
          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
          : disabled
            ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
            : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      {children}
    </button>
  );
});

// Windows 95 style panel (sunken)
const Win95Panel = memo(function Win95Panel({ children, className = '', sunken = true }) {
  return (
    <div
      className={className}
      style={{
        background: sunken ? WIN95.inputBg : WIN95.bg,
        boxShadow: sunken
          ? `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
      }}
    >
      {children}
    </div>
  );
});

// Windows 95 style group box - clean version with title above content
const Win95GroupBox = memo(function Win95GroupBox({ title, children, className = '' }) {
  return (
    <div className={`flex flex-col ${className}`}>
      {/* Title - clearly above the box */}
      <div 
        className="text-[10px] lg:text-[9px] font-bold px-1 pb-0.5"
        style={{ 
          color: WIN95.text,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        {title}
      </div>
      {/* Content box with border */}
      <div 
        className="relative flex-1"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
          padding: '4px'
        }}
      >
        {children}
      </div>
    </div>
  );
});

// Frame upload component - Win95 style
const FrameUpload = memo(({ label, frameUrl, onUpload, onRemove, icon }) => {
  const fileInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);

  const handleFileChange = useCallback((e) => {
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
      onUpload(event.target.result);
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

// Collapsible How to Use component - Win95 style
const CollapsibleVideoHowToUse = memo(function CollapsibleVideoHowToUse() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ background: WIN95.bg, borderBottom: `1px solid ${WIN95.bgDark}` }}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)} 
        className="w-full flex items-center justify-between px-1 lg:px-2 py-0.5 lg:py-1"
        style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
      >
        <div className="flex items-center gap-1 lg:gap-2">
          <Film className="w-3 h-3 lg:w-4 lg:h-4" style={{ color: WIN95.text }} />
          <span className="text-[9px] lg:text-[10px] font-bold" style={{ color: WIN95.text }}>Guide</span>
          <span className="text-[7px] lg:text-[8px] px-1 py-0.5" style={{ background: '#800080', color: '#fff' }}>Veo 3.1</span>
        </div>
        <ChevronDown 
          className="w-3 h-3 transition-transform" 
          style={{ 
            color: WIN95.text,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' 
          }} 
        />
      </button>
      {isExpanded && (
        <div className="px-2 pb-2 text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {/* Generation Modes */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>Generation Modes</div>
            <div className="space-y-0.5 text-[9px]">
              <div><strong>✍️ Text to Video:</strong> Generate video from prompt only</div>
              <div><strong>🖼️ Image to Video:</strong> Animate a single source image</div>
              <div><strong>🎞️ First/Last Frame:</strong> Animate between two frames</div>
            </div>
          </div>
          
          {/* Quality Tiers */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#800080' }}>Quality Tiers</div>
            <div className="grid grid-cols-2 gap-0.5 text-[9px]">
              <div>⚡ <strong>Fast:</strong> Quick generation</div>
              <div>✨ <strong>Quality:</strong> Higher fidelity</div>
              <div>🔊 AI Audio: Sound effects</div>
              <div>📺 720p / 1080p resolution</div>
            </div>
          </div>
          
          {/* Prompt Tips */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#808000' }}>Prompt Tips</div>
            <div className="space-y-0.5 text-[9px]">
              <div>• Camera: "slowly pans left", "zooms in dramatically"</div>
              <div>• Action: "waves crash", "leaves fall gently"</div>
              <div>• Style: "cinematic", "slow motion", "timelapse"</div>
              <div>• Mood: "peaceful", "tense", "joyful"</div>
            </div>
          </div>
          
          {/* Pricing */}
          <div className="pt-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
            <span className="text-[9px] font-bold" style={{ color: '#008000' }}>💰 Pricing (per second):</span>
            <div className="flex flex-wrap gap-1 mt-1">
              <span className="text-[8px] px-1 py-0.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>⚡ Fast: 🔇 $0.22 | 🔊 $0.44</span>
              <span className="text-[8px] px-1 py-0.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>✨ Quality: 🔇 $0.55 | 🔊 $0.83</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

const VideoGenerator = memo(function VideoGenerator({ onShowTokenPayment, onShowStripePayment }) {
  const emailContext = useEmailAuth();
  const walletContext = useSimpleWallet();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isConnected = isEmailAuth || walletContext.isConnected;
  
  // State
  const [generationMode, setGenerationMode] = useState('first-last-frame');
  const [quality, setQuality] = useState('fast');
  const [firstFrameUrl, setFirstFrameUrl] = useState(null);
  const [lastFrameUrl, setLastFrameUrl] = useState(null);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState('8s');
  const [resolution, setResolution] = useState('720p');
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [generateAudio, setGenerateAudio] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoRef = useRef(null);

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
        }).catch(e => {
          // Autoplay blocked even muted, just show controls
          logger.debug('Autoplay blocked', { error: e.message });
          setVideoReady(true);
        });
      };
      
      const handleError = (e) => {
        logger.error('Video load error', { error: e.target?.error?.message, src: generatedVideoUrl?.substring(0, 50) });
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
  
  // Determine if we can generate based on mode requirements
  const hasRequiredFrames = () => {
    if (currentMode.requiresFirstFrame && !firstFrameUrl) return false;
    if (currentMode.requiresLastFrame && !lastFrameUrl) return false;
    return true;
  };

  const canGenerate = isConnected && hasRequiredFrames() && prompt.trim().length > 0 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    
    setIsGenerating(true);
    setError(null);
    setProgress(currentMode.requiresFirstFrame ? 'Uploading frames...' : 'Preparing video generation...');
    setGeneratedVideoUrl(null);

    try {
      setProgress('Generating video... This may take 1-3 minutes');
      
      const result = await generateVideo({
        prompt,
        firstFrameUrl: currentMode.requiresFirstFrame ? firstFrameUrl : null,
        lastFrameUrl: currentMode.requiresLastFrame ? lastFrameUrl : null,
        aspectRatio,
        duration,
        resolution,
        generateAudio,
        generationMode,
        quality,
        userId: emailContext.userId,
        walletAddress: walletContext.address,
        email: emailContext.email
      });

      setGeneratedVideoUrl(result.videoUrl);
      setProgress(null);
      
      // Refresh credits
      if (isEmailAuth && emailContext.refreshCredits) {
        emailContext.refreshCredits();
      } else if (walletContext.fetchCredits && walletContext.address) {
        walletContext.fetchCredits(walletContext.address, 3, true);
      }
      
      // Save to gallery (non-blocking)
      const creditsUsed = result.creditsDeducted || calculateVideoCredits(duration, generateAudio, quality);
      const identifier = isEmailAuth ? emailContext.userId : walletContext.address;
      if (identifier) {
        addGeneration(identifier, {
          prompt: prompt.trim() || 'Video generation',
          style: `${currentMode.label} - ${quality === 'quality' ? 'Quality' : 'Fast'}`,
          videoUrl: result.videoUrl,
          creditsUsed: creditsUsed,
          userId: isEmailAuth ? emailContext.userId : undefined,
          email: isEmailAuth ? emailContext.email : undefined
        }).catch(e => logger.debug('Gallery save failed', { error: e.message }));
      }
      
      logger.info('Video generated successfully', { 
        remainingCredits: result.remainingCredits 
      });
    } catch (err) {
      setError(err.message);
      setProgress(null);
      logger.error('Video generation failed', { error: err.message });
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, prompt, firstFrameUrl, lastFrameUrl, aspectRatio, duration, resolution, generateAudio, generationMode, quality, currentMode, emailContext, walletContext, isEmailAuth]);

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
      logger.error('Download failed', { error: err.message });
    }
  }, [generatedVideoUrl]);

  return (
    <div className="fade-in h-full flex flex-col" style={{ background: WIN95.bg }}>
      {/* How to Use Guide */}
      <CollapsibleVideoHowToUse />
      
      {/* Main content */}
      <div className="flex-1 min-h-0 p-1 lg:p-1.5 flex flex-col lg:flex-row gap-1 lg:gap-1.5 overflow-auto lg:overflow-hidden">
        {/* Left panel - Controls */}
        <div className="lg:w-[45%] flex flex-col gap-0.5 lg:gap-1 min-h-0 overflow-auto lg:overflow-hidden">
          {/* Generation Mode & Quality - combined row */}
          <Win95GroupBox title="Mode & Quality" className="flex-shrink-0">
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
                      if (newMode === 'text-to-video') {
                        setQuality('quality');
                      }
                    }}
                    className="w-full text-[9px] bg-transparent focus:outline-none"
                    style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                  >
                    {GENERATION_MODES.map(mode => (
                      <option key={mode.value} value={mode.value}>{mode.icon} {mode.label}</option>
                    ))}
                  </select>
                </Win95Panel>
              </div>
              
              {/* Quality Selector */}
              {generationMode !== 'text-to-video' && (
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
          </Win95GroupBox>

          {/* Frame Uploads - conditional based on mode */}
          {(currentMode.requiresFirstFrame || currentMode.requiresLastFrame) && (
            <Win95GroupBox title={currentMode.requiresLastFrame ? "Frames" : "Reference"} className="flex-shrink-0">
              <div className={`grid ${currentMode.requiresLastFrame ? 'grid-cols-2' : 'grid-cols-1'} gap-1`}>
                {currentMode.requiresFirstFrame && (
                  <FrameUpload 
                    label={currentMode.requiresLastFrame ? "Start" : "Source"}
                    icon={currentMode.requiresLastFrame ? "🎬" : "🖼️"}
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

          {/* Motion Description */}
          <Win95GroupBox title="Motion Prompt" className="flex-shrink-0">
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

          {/* Video Settings - compact grid */}
          <Win95GroupBox title="Settings" className="flex-shrink-0">
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

          {/* Generate Section */}
          <Win95GroupBox title="Generate" className="flex-shrink-0">
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
                {isGenerating ? '⏳ Generating...' : '▶ Generate'}
              </button>
              <div className="text-[9px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                {calculateVideoCredits(duration, generateAudio, quality)} credits per generation
              </div>
            </div>
            {!canGenerate && !isGenerating && (
              <div className="mt-1 text-[8px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                {currentMode.requiresFirstFrame && !firstFrameUrl && '⬆️ First  '}
                {currentMode.requiresLastFrame && !lastFrameUrl && '⬆️ Last  '}
                {prompt.trim().length === 0 && '✏️ Prompt'}
              </div>
            )}
          </Win95GroupBox>
        </div>
        
        {/* Right panel - Output */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Video Output */}
          <Win95GroupBox title="Output" className="flex-1 flex flex-col min-h-0">
            <div 
              className="flex-1 flex items-center justify-center overflow-hidden min-h-0 relative"
              style={{ 
                background: WIN95.bg, 
                minHeight: '100px',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              {isGenerating && progress ? (
                <div className="text-center p-4">
                  <div className="w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
                  </div>
                  <p className="text-[11px] font-bold text-center" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{progress}</p>
                  <p className="text-[9px] mt-1 text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Video generation takes 1-3 minutes</p>
                </div>
              ) : error ? (
                <div className="text-center p-4 max-w-sm">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2" style={{ color: '#800000' }} />
                  <p className="text-[11px] font-bold mb-1 text-center" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Generation Failed</p>
                  <p className="text-[10px] text-center" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{error}</p>
                  <Win95Button onClick={() => setError(null)} className="mt-2">
                    Dismiss
                  </Win95Button>
                </div>
              ) : generatedVideoUrl ? (
                <div className="w-full h-full flex flex-col">
                  {/* Loading indicator while video buffers */}
                  {!videoReady && (
                    <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: WIN95.bg }}>
                      <div className="text-center">
                        <div className="w-6 h-6 mx-auto mb-2 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
                        <p className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading video...</p>
                      </div>
                    </div>
                  )}
                  <video 
                    ref={videoRef}
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="auto"
                    crossOrigin="anonymous"
                    className="flex-1 w-full object-contain"
                    style={{ maxHeight: 'calc(100% - 40px)', opacity: videoReady ? 1 : 0, background: WIN95.bg }}
                    onLoadedData={() => setVideoReady(true)}
                    onCanPlay={() => setVideoReady(true)}
                    onLoadedMetadata={() => {
                      // Unmute after autoplay starts successfully
                      if (videoRef.current) {
                        videoRef.current.muted = false;
                      }
                    }}
                    onError={(e) => {
                      logger.error('Video playback error', { error: e.target?.error?.message });
                      setError('Failed to load video. Please try downloading instead.');
                      setVideoReady(true);
                    }}
                  />
                  <div className="flex justify-center gap-2 p-2" style={{ background: WIN95.bg }}>
                    <Win95Button onClick={handleDownload}>
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Win95Button>
                    <Win95Button onClick={() => { setGeneratedVideoUrl(null); setVideoReady(false); }}>
                      New Video
                    </Win95Button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-4">
                  <Film className="w-12 h-12 mx-auto mb-2" style={{ color: WIN95.textDisabled }} />
                  <p className="text-[11px] font-bold text-center" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your video will appear here</p>
                  <p className="text-[9px] mt-1 text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Upload frames and describe the motion</p>
                </div>
              )}
            </div>
          </Win95GroupBox>
        </div>
      </div>
      
      {/* Status bar */}
      <div 
        className="flex items-center px-1 lg:px-2 py-0.5 text-[9px] flex-shrink-0"
        style={{ 
          background: WIN95.bg,
          borderTop: `1px solid ${WIN95.border.light}`,
          color: WIN95.text,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <Win95Panel sunken className="flex-1 px-1 lg:px-2 py-0.5">
          {isGenerating && progress ? (
            <span style={{ color: '#808000' }}>{progress}</span>
          ) : error ? (
            <span style={{ color: '#800000' }}>Error</span>
          ) : generatedVideoUrl ? (
            <span style={{ color: '#008000' }}>✓ Ready</span>
          ) : (
            'Ready'
          )}
        </Win95Panel>
      </div>
    </div>
  );
});

export default VideoGenerator;
