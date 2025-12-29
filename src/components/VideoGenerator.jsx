import React, { useState, useRef, useCallback, memo } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateVideo } from '../services/videoService';
import { addGeneration } from '../services/galleryService';
import { Film, Upload, Play, X, Clock, Monitor, Volume2, VolumeX, Sparkles, Download, AlertCircle, ChevronDown, Square, Zap, Image, Layers } from 'lucide-react';
import logger from '../utils/logger.js';
import { WIN95 } from '../utils/buttonStyles.js';

// Generation mode options - all Veo 3.1 variants
const GENERATION_MODES = [
  { 
    value: 'text-to-video', 
    label: 'Text to Video', 
    icon: '✍️',
    description: 'Generate video from text prompt only',
    requiresFirstFrame: false,
    requiresLastFrame: false,
    endpoint: 'fal-ai/veo3.1/fast/text-to-video'
  },
  { 
    value: 'image-to-video', 
    label: 'Image to Video', 
    icon: '🖼️',
    description: 'Animate a single image',
    requiresFirstFrame: true,
    requiresLastFrame: false,
    endpoint: 'fal-ai/veo3.1/fast/image-to-video'
  },
  { 
    value: 'first-last-frame', 
    label: 'First/Last Frame', 
    icon: '🎞️',
    description: 'Animate between two frames',
    requiresFirstFrame: true,
    requiresLastFrame: true,
    endpoint: 'fal-ai/veo3.1/fast/first-last-frame-to-video'
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

// Windows 95 style group box
const Win95GroupBox = memo(function Win95GroupBox({ title, children, className = '' }) {
  return (
    <div className={`relative ${className}`} style={{ padding: '12px 8px 8px 8px' }}>
      <div 
        className="absolute inset-0"
        style={{
          border: `1px solid ${WIN95.bgDark}`,
          borderTopColor: WIN95.border.light,
          borderLeftColor: WIN95.border.light,
          margin: '6px 0 0 0'
        }}
      />
      <div 
        className="absolute inset-0"
        style={{
          border: `1px solid ${WIN95.border.light}`,
          borderTopColor: WIN95.bgDark,
          borderLeftColor: WIN95.bgDark,
          margin: '7px 1px 1px 1px'
        }}
      />
      <span 
        className="absolute text-[11px] font-bold px-1"
        style={{ 
          top: 0, 
          left: 8, 
          background: WIN95.bg,
          color: WIN95.text,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        {title}
      </span>
      <div className="relative">{children}</div>
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
      <div className="flex items-center gap-1 mb-1">
        <span className="text-[10px]">{icon}</span>
        <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{label}</span>
      </div>
      
      {!frameUrl ? (
        <div 
          onClick={handleClick}
          className="flex-1 flex flex-col items-center justify-center cursor-pointer"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`,
            minHeight: '80px'
          }}
        >
          <Upload className="w-5 h-5 mb-1" style={{ color: WIN95.textDisabled }} />
          <span className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Click to upload</span>
          <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>Max 8MB</span>
        </div>
      ) : (
        <div 
          className="flex-1 relative overflow-hidden group"
          style={{ 
            minHeight: '80px',
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
          }}
        >
          <img 
            src={frameUrl} 
            alt={label}
            className="w-full h-full object-cover cursor-pointer"
            onClick={() => setPreviewImage(frameUrl)}
          />
          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Win95Button onClick={handleClick}>
              <Upload className="w-3 h-3" />
            </Win95Button>
            <Win95Button onClick={onRemove}>
              <X className="w-3 h-3" />
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
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
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
        className="w-full flex items-center justify-between px-2 py-1.5"
        style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
      >
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4" style={{ color: WIN95.text }} />
          <span className="text-[11px] font-bold" style={{ color: WIN95.text }}>Video Generation Guide</span>
          <span className="text-[8px] px-1.5 py-0.5" style={{ background: '#800080', color: '#fff' }}>Veo 3.1 AI</span>
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
      <div className="flex-1 min-h-0 p-2 flex flex-col lg:flex-row gap-2">
        {/* Left panel - Controls */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Generation Mode & Quality */}
          <Win95GroupBox title="Generation Mode" className="flex-shrink-0">
            <div className="grid grid-cols-2 gap-2">
              {/* Mode Selector */}
              <div>
                <label className="text-[9px] font-bold flex items-center gap-1 mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Layers className="w-3 h-3" /> Mode
                </label>
                <Win95Panel sunken className="px-1 py-0.5">
                  <select 
                    value={generationMode}
                    onChange={(e) => setGenerationMode(e.target.value)}
                    className="w-full text-[10px] bg-transparent focus:outline-none"
                    style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                  >
                    {GENERATION_MODES.map(mode => (
                      <option key={mode.value} value={mode.value}>{mode.icon} {mode.label}</option>
                    ))}
                  </select>
                </Win95Panel>
                <div className="text-[8px] mt-0.5" style={{ color: WIN95.textDisabled }}>
                  {currentMode.description}
                </div>
              </div>
              
              {/* Quality Selector */}
              <div>
                <label className="text-[9px] font-bold flex items-center gap-1 mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Zap className="w-3 h-3" /> Quality
                </label>
                <div className="flex gap-0.5">
                  {QUALITY_OPTIONS.map((opt) => (
                    <Win95Button
                      key={opt.value}
                      onClick={() => setQuality(opt.value)}
                      active={quality === opt.value}
                      className="flex-1"
                    >
                      {opt.label}
                    </Win95Button>
                  ))}
                </div>
                <div className="text-[8px] mt-0.5" style={{ color: WIN95.textDisabled }}>
                  {QUALITY_OPTIONS.find(q => q.value === quality)?.description}
                </div>
              </div>
            </div>
          </Win95GroupBox>

          {/* Frame Uploads - conditional based on mode */}
          {(currentMode.requiresFirstFrame || currentMode.requiresLastFrame) && (
            <Win95GroupBox title={currentMode.requiresLastFrame ? "Animation Frames" : "Reference Image"} className="flex-shrink-0">
              <div className={`grid ${currentMode.requiresLastFrame ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                {currentMode.requiresFirstFrame && (
                  <FrameUpload 
                    label={currentMode.requiresLastFrame ? "First Frame (Start)" : "Source Image"}
                    icon={currentMode.requiresLastFrame ? "🎬" : "🖼️"}
                    frameUrl={firstFrameUrl}
                    onUpload={setFirstFrameUrl}
                    onRemove={() => setFirstFrameUrl(null)}
                  />
                )}
                {currentMode.requiresLastFrame && (
                  <FrameUpload 
                    label="Last Frame (End)"
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
          <Win95GroupBox title="Motion Description" className="flex-1 flex flex-col">
            <Win95Panel sunken className="flex-1 p-0">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe how the scene should animate between frames. Include action, camera movement, and mood..."
                className="w-full h-full p-2 resize-none text-[11px] focus:outline-none"
                style={{ 
                  background: 'transparent',
                  color: WIN95.text,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  minHeight: '60px'
                }}
              />
            </Win95Panel>
          </Win95GroupBox>

          {/* Video Settings */}
          <Win95GroupBox title="Video Settings" className="flex-shrink-0">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {/* Duration */}
              <div>
                <label className="text-[9px] font-bold flex items-center gap-1 mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Clock className="w-3 h-3" /> Duration
                </label>
                <div className="flex gap-0.5">
                  {DURATION_OPTIONS.map((opt) => (
                    <Win95Button
                      key={opt.value}
                      onClick={() => setDuration(opt.value)}
                      active={duration === opt.value}
                      className="flex-1"
                    >
                      {opt.label}
                    </Win95Button>
                  ))}
                </div>
              </div>
              
              {/* Resolution */}
              <div>
                <label className="text-[9px] font-bold flex items-center gap-1 mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <Monitor className="w-3 h-3" /> Resolution
                </label>
                <Win95Panel sunken className="px-1 py-0.5">
                  <select 
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="w-full text-[10px] bg-transparent focus:outline-none"
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
                <label className="text-[9px] font-bold mb-1 block" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Aspect Ratio
                </label>
                <Win95Panel sunken className="px-1 py-0.5">
                  <select 
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value)}
                    className="w-full text-[10px] bg-transparent focus:outline-none"
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
                <label className="text-[9px] font-bold flex items-center gap-1 mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  {generateAudio ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />} Audio
                </label>
                <Win95Button
                  onClick={() => setGenerateAudio(!generateAudio)}
                  active={generateAudio}
                  className="w-full"
                >
                  {generateAudio ? '🔊 On' : '🔇 Off'}
                </Win95Button>
              </div>
            </div>
          </Win95GroupBox>

          {/* Generate Section */}
          <Win95GroupBox title="Generate" className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="flex-1 py-2 text-[11px] font-bold"
                style={{
                  background: WIN95.buttonFace,
                  color: !canGenerate ? WIN95.textDisabled : WIN95.text,
                  boxShadow: !canGenerate
                    ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
                    : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                  cursor: !canGenerate ? 'default' : 'pointer',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  border: 'none'
                }}
              >
                {isGenerating ? '⏳ Generating...' : '▶ Generate Video'}
              </button>
              <div className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                <div>Cost: {calculateVideoCredits(duration, generateAudio, quality)} credits</div>
                <div style={{ color: WIN95.textDisabled }}>${calculateVideoCost(duration, generateAudio, quality)}</div>
              </div>
            </div>
            {!canGenerate && !isGenerating && (
              <div className="mt-1 text-[10px]" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                {currentMode.requiresFirstFrame && !firstFrameUrl && '⬆️ Upload first frame  '}
                {currentMode.requiresLastFrame && !lastFrameUrl && '⬆️ Upload last frame  '}
                {prompt.trim().length === 0 && '✏️ Add a prompt'}
              </div>
            )}
          </Win95GroupBox>
        </div>
        
        {/* Right panel - Output */}
        <div className="flex-1 flex flex-col gap-2">
          {/* Video Output */}
          <Win95GroupBox title="Video Output" className="flex-1 flex flex-col">
            <Win95Panel sunken className="flex-1 flex items-center justify-center overflow-hidden" style={{ minHeight: '200px' }}>
              {isGenerating && progress ? (
                <div className="text-center p-4">
                  <div className="w-10 h-10 mx-auto mb-2 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
                  </div>
                  <p className="text-[11px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>{progress}</p>
                  <p className="text-[9px] mt-1" style={{ color: WIN95.textDisabled }}>Video generation takes 1-3 minutes</p>
                </div>
              ) : error ? (
                <div className="text-center p-4 max-w-sm">
                  <AlertCircle className="w-10 h-10 mx-auto mb-2" style={{ color: '#800000' }} />
                  <p className="text-[11px] font-bold mb-1" style={{ color: '#800000', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Generation Failed</p>
                  <p className="text-[10px]" style={{ color: WIN95.text }}>{error}</p>
                  <Win95Button onClick={() => setError(null)} className="mt-2">
                    Dismiss
                  </Win95Button>
                </div>
              ) : generatedVideoUrl ? (
                <div className="w-full h-full flex flex-col">
                  <video 
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="flex-1 w-full object-contain"
                    style={{ maxHeight: 'calc(100% - 40px)' }}
                  />
                  <div className="flex justify-center gap-2 p-2" style={{ background: WIN95.bg }}>
                    <Win95Button onClick={handleDownload}>
                      <Download className="w-3.5 h-3.5 mr-1" />
                      Download
                    </Win95Button>
                    <Win95Button onClick={() => setGeneratedVideoUrl(null)}>
                      New Video
                    </Win95Button>
                  </div>
                </div>
              ) : (
                <div className="text-center p-4">
                  <Film className="w-12 h-12 mx-auto mb-2" style={{ color: WIN95.textDisabled }} />
                  <p className="text-[11px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Your video will appear here</p>
                  <p className="text-[9px] mt-1" style={{ color: WIN95.textDisabled }}>Upload frames and describe the motion</p>
                </div>
              )}
            </Win95Panel>
          </Win95GroupBox>

          {/* Status Display */}
          <Win95GroupBox title="Status" className="flex-shrink-0">
            <Win95Panel sunken className="p-2">
              <div className="text-[11px] font-mono" style={{ color: WIN95.text, fontFamily: 'Fixedsys, "Courier New", monospace' }}>
                {isGenerating && progress ? (
                  <span style={{ color: '#808000' }}>{progress}</span>
                ) : error ? (
                  <span style={{ color: '#800000' }}>Error: {error}</span>
                ) : generatedVideoUrl ? (
                  <span style={{ color: '#008000' }}>✓ Video ready - {duration}</span>
                ) : (
                  <span style={{ color: WIN95.textDisabled }}>Ready</span>
                )}
              </div>
            </Win95Panel>
          </Win95GroupBox>
        </div>
      </div>
      
      {/* Status bar */}
      <div 
        className="flex items-center px-2 py-0.5 text-[10px]"
        style={{ 
          background: WIN95.bg,
          borderTop: `1px solid ${WIN95.border.light}`,
          color: WIN95.text,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <Win95Panel sunken className="flex-1 px-2 py-0.5">
          {isGenerating ? 'Processing...' : generatedVideoUrl ? 'Video ready' : 'Ready'}
        </Win95Panel>
        <Win95Panel sunken className="px-2 py-0.5 ml-1">
          {currentMode.icon} {currentMode.label}
        </Win95Panel>
        <Win95Panel sunken className="px-2 py-0.5 ml-1">
          {quality === 'fast' ? '⚡' : '✨'} {duration} | {resolution}
        </Win95Panel>
        <Win95Panel sunken className="px-2 py-0.5 ml-1">
          {generateAudio ? '🔊' : '🔇'}
        </Win95Panel>
      </div>
    </div>
  );
});

export default VideoGenerator;
