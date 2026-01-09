import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Play, Pause, Download, Volume2, VolumeX, RotateCcw } from 'lucide-react';

// Win95 styling constants
const WIN95 = {
  bg: '#c0c0c0',
  bgLight: '#dfdfdf',
  bgDark: '#808080',
  border: {
    light: '#ffffff',
    dark: '#404040',
    darker: '#000000'
  },
  text: '#000000',
  textDisabled: '#808080',
  highlight: '#000080',
  inputBg: '#ffffff',
  buttonFace: '#c0c0c0'
};

interface StemData {
  vocals?: string | null;
  drums?: string | null;
  bass?: string | null;
  other?: string | null;
}

interface StemMixerProps {
  stems: StemData;
  onClose?: () => void;
}

interface StemState {
  volume: number;
  muted: boolean;
  solo: boolean;
}

const STEM_COLORS: Record<string, string> = {
  vocals: '#EC4899',  // Pink
  drums: '#F59E0B',   // Orange
  bass: '#8B5CF6',    // Purple
  other: '#10B981'    // Green
};

const STEM_ICONS: Record<string, string> = {
  vocals: '🎤',
  drums: '🥁',
  bass: '🎸',
  other: '🎹'
};

// Win95 Button
const Win95Button = memo<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}>(function Win95Button({ children, onClick, disabled, active, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-2 py-1 text-[10px] font-bold transition-none select-none ${className}`}
      style={{
        background: active ? WIN95.bgDark : WIN95.buttonFace,
        color: disabled ? WIN95.textDisabled : WIN95.text,
        border: 'none',
        boxShadow: active 
          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      {children}
    </button>
  );
});

const StemMixer: React.FC<StemMixerProps> = ({ stems, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [stemStates, setStemStates] = useState<Record<string, StemState>>({
    vocals: { volume: 100, muted: false, solo: false },
    drums: { volume: 100, muted: false, solo: false },
    bass: { volume: 100, muted: false, solo: false },
    other: { volume: 100, muted: false, solo: false }
  });
  const [isExporting, setIsExporting] = useState(false);
  
  // Audio context and nodes
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodesRef = useRef<Record<string, GainNode>>({});
  const audioBuffersRef = useRef<Record<string, AudioBuffer>>({});
  const sourceNodesRef = useRef<Record<string, AudioBufferSourceNode>>({});
  const startTimeRef = useRef<number>(0);
  const pauseTimeRef = useRef<number>(0);
  
  // Initialize audio context
  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
  
  // Load audio buffers
  useEffect(() => {
    const loadStem = async (name: string, url: string) => {
      if (!audioContextRef.current || !url) return;
      
      try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
        audioBuffersRef.current[name] = audioBuffer;
        
        // Set duration from first loaded buffer
        if (audioBuffer.duration > duration) {
          setDuration(audioBuffer.duration);
        }
        
        // Create gain node
        const gainNode = audioContextRef.current.createGain();
        gainNode.connect(audioContextRef.current.destination);
        gainNodesRef.current[name] = gainNode;
      } catch (error) {
        console.error(`Failed to load ${name} stem:`, error);
      }
    };
    
    // Load all available stems
    const stemEntries = Object.entries(stems).filter(([_, url]) => url);
    stemEntries.forEach(([name, url]) => {
      if (url) loadStem(name, url);
    });
  }, [stems, duration]);
  
  // Update gain values when stem states change
  useEffect(() => {
    const hasSolo = Object.values(stemStates).some(s => s.solo);
    
    Object.entries(stemStates).forEach(([name, state]) => {
      const gainNode = gainNodesRef.current[name];
      if (gainNode) {
        let volume = state.volume / 100;
        
        // If any track is soloed, mute non-soloed tracks
        if (hasSolo && !state.solo) {
          volume = 0;
        }
        
        // Apply mute
        if (state.muted) {
          volume = 0;
        }
        
        gainNode.gain.setValueAtTime(volume, audioContextRef.current?.currentTime || 0);
      }
    });
  }, [stemStates]);
  
  // Time update interval
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    
    if (isPlaying && audioContextRef.current) {
      interval = setInterval(() => {
        const elapsed = audioContextRef.current!.currentTime - startTimeRef.current + pauseTimeRef.current;
        setCurrentTime(Math.min(elapsed, duration));
        
        if (elapsed >= duration) {
          stopPlayback();
        }
      }, 100);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, duration]);
  
  const startPlayback = useCallback((fromTime: number = 0) => {
    if (!audioContextRef.current) return;
    
    // Stop existing sources
    Object.values(sourceNodesRef.current).forEach(source => {
      try { source.stop(); } catch {}
    });
    sourceNodesRef.current = {};
    
    // Resume context if suspended
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    // Start all stems
    Object.entries(audioBuffersRef.current).forEach(([name, buffer]) => {
      const source = audioContextRef.current!.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNodesRef.current[name]);
      source.start(0, fromTime);
      sourceNodesRef.current[name] = source;
    });
    
    startTimeRef.current = audioContextRef.current.currentTime;
    pauseTimeRef.current = fromTime;
    setIsPlaying(true);
  }, []);
  
  const stopPlayback = useCallback(() => {
    Object.values(sourceNodesRef.current).forEach(source => {
      try { source.stop(); } catch {}
    });
    sourceNodesRef.current = {};
    
    if (audioContextRef.current) {
      pauseTimeRef.current = currentTime;
    }
    setIsPlaying(false);
  }, [currentTime]);
  
  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback(pauseTimeRef.current);
    }
  }, [isPlaying, startPlayback, stopPlayback]);
  
  const resetMix = useCallback(() => {
    setStemStates({
      vocals: { volume: 100, muted: false, solo: false },
      drums: { volume: 100, muted: false, solo: false },
      bass: { volume: 100, muted: false, solo: false },
      other: { volume: 100, muted: false, solo: false }
    });
  }, []);
  
  const handleVolumeChange = useCallback((stemName: string, volume: number) => {
    setStemStates(prev => ({
      ...prev,
      [stemName]: { ...prev[stemName], volume }
    }));
  }, []);
  
  const toggleMute = useCallback((stemName: string) => {
    setStemStates(prev => ({
      ...prev,
      [stemName]: { ...prev[stemName], muted: !prev[stemName].muted }
    }));
  }, []);
  
  const toggleSolo = useCallback((stemName: string) => {
    setStemStates(prev => ({
      ...prev,
      [stemName]: { ...prev[stemName], solo: !prev[stemName].solo }
    }));
  }, []);
  
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    setCurrentTime(time);
    pauseTimeRef.current = time;
    
    if (isPlaying) {
      stopPlayback();
      startPlayback(time);
    }
  }, [isPlaying, startPlayback, stopPlayback]);
  
  // Export mixed audio
  const exportMix = useCallback(async () => {
    if (!audioContextRef.current) return;
    
    setIsExporting(true);
    
    try {
      // Create offline context for rendering
      const sampleRate = audioContextRef.current.sampleRate;
      const channels = 2;
      const offlineContext = new OfflineAudioContext(channels, duration * sampleRate, sampleRate);
      
      const hasSolo = Object.values(stemStates).some(s => s.solo);
      
      // Connect all stems with their volumes
      Object.entries(audioBuffersRef.current).forEach(([name, buffer]) => {
        const source = offlineContext.createBufferSource();
        source.buffer = buffer;
        
        const gainNode = offlineContext.createGain();
        const state = stemStates[name];
        
        let volume = state.volume / 100;
        if (hasSolo && !state.solo) volume = 0;
        if (state.muted) volume = 0;
        
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(offlineContext.destination);
        source.start(0);
      });
      
      // Render audio
      const renderedBuffer = await offlineContext.startRendering();
      
      // Convert to WAV
      const wavBlob = audioBufferToWav(renderedBuffer);
      
      // Download
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `remix-${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export mix. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }, [duration, stemStates]);
  
  // Convert AudioBuffer to WAV blob
  const audioBufferToWav = (buffer: AudioBuffer): Blob => {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const dataLength = buffer.length * blockAlign;
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Audio data
    const channels: Float32Array[] = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        const sample = Math.max(-1, Math.min(1, channels[c][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  };
  
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  const availableStems = Object.entries(stems).filter(([_, url]) => url);
  
  return (
    <div 
      className="p-3 space-y-3"
      style={{
        background: WIN95.bg,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-bold" style={{ color: WIN95.text }}>
          🎛️ Stem Mixer
        </h3>
        <div className="flex gap-1">
          <Win95Button onClick={resetMix}>
            <RotateCcw className="w-3 h-3 inline mr-1" /> Reset
          </Win95Button>
          <Win95Button onClick={exportMix} disabled={isExporting || duration === 0}>
            <Download className="w-3 h-3 inline mr-1" /> {isExporting ? 'Exporting...' : 'Export Mix'}
          </Win95Button>
        </div>
      </div>
      
      {/* Transport */}
      <div 
        className="p-2"
        style={{
          background: WIN95.inputBg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
        }}
      >
        <div className="flex items-center gap-2">
          <Win95Button onClick={togglePlayback} disabled={duration === 0}>
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Win95Button>
          
          <span className="text-[10px] font-mono w-16" style={{ color: WIN95.text }}>
            {formatTime(currentTime)}
          </span>
          
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-2"
            style={{ accentColor: WIN95.highlight }}
          />
          
          <span className="text-[10px] font-mono w-16 text-right" style={{ color: WIN95.text }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>
      
      {/* Stem channels */}
      <div className="space-y-2">
        {availableStems.map(([stemName]) => {
          const state = stemStates[stemName];
          const color = STEM_COLORS[stemName] || '#666';
          const icon = STEM_ICONS[stemName] || '🎵';
          
          return (
            <div 
              key={stemName}
              className="p-2 flex items-center gap-2"
              style={{
                background: WIN95.bgLight,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.dark}`
              }}
            >
              {/* Stem label */}
              <div 
                className="w-16 text-center py-1 rounded text-[10px] font-bold"
                style={{ background: color, color: '#fff' }}
              >
                {icon} {stemName.charAt(0).toUpperCase() + stemName.slice(1)}
              </div>
              
              {/* Mute button */}
              <Win95Button 
                onClick={() => toggleMute(stemName)}
                active={state.muted}
                className="w-6 h-6 flex items-center justify-center p-0"
              >
                {state.muted ? <VolumeX className="w-3 h-3" /> : 'M'}
              </Win95Button>
              
              {/* Solo button */}
              <Win95Button 
                onClick={() => toggleSolo(stemName)}
                active={state.solo}
                className="w-6 h-6 flex items-center justify-center p-0"
                style={state.solo ? { background: '#FFD700', color: '#000' } : {}}
              >
                S
              </Win95Button>
              
              {/* Volume slider */}
              <div className="flex-1 flex items-center gap-2">
                <Volume2 className="w-3 h-3" style={{ color: WIN95.textDisabled }} />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.volume}
                  onChange={(e) => handleVolumeChange(stemName, parseInt(e.target.value))}
                  className="flex-1 h-2"
                  style={{ accentColor: color }}
                />
                <span className="text-[10px] w-8 text-right font-mono" style={{ color: WIN95.text }}>
                  {state.volume}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Tips */}
      <div className="text-[9px] p-2" style={{ background: '#ffffcc', color: '#666' }}>
        💡 <strong>Tips:</strong> Use <strong>M</strong> to mute a track, <strong>S</strong> to solo (hear only that track). 
        Adjust volumes to create your mix, then click Export to download.
      </div>
    </div>
  );
};

export default StemMixer;





