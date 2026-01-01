import React, { useState, useCallback, memo, ReactNode } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateMusic, calculateMusicCredits, calculateMusicCost } from '../services/musicService';
import { Music, Play, Pause, Download, AlertCircle, ChevronDown, Disc3, Square, Brain } from 'lucide-react';
import logger from '../utils/logger';

// Windows 95 style constants
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
  highlightText: '#ffffff',
  inputBg: '#ffffff',
  buttonFace: '#c0c0c0'
};

// Duration presets
const DURATION_PRESETS = [
  { value: 15, label: '15s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 120, label: '2m' },
  { value: 180, label: '3m' }
];

// Genre/style suggestions - expanded list with categories
const STYLE_SUGGESTIONS = [
  // Electronic
  { label: 'Lo-fi Hip Hop', category: 'Electronic', prompt: 'Relaxing lo-fi hip hop beat with mellow piano, vinyl crackle, soft drums, and warm bass. Perfect for studying or chilling. Key: C Major, Tempo: 85 BPM.' },
  { label: 'EDM', category: 'Electronic', prompt: 'High-energy EDM track with massive synth leads, punchy kicks, driving bass, and an explosive drop. Key: A Minor, Tempo: 128 BPM.' },
  { label: 'Synthwave', category: 'Electronic', prompt: 'Retro synthwave track with pulsing arpeggios, lush pads, driving bass, and 80s-inspired drums. Neon vibes. Key: E Minor, Tempo: 118 BPM.' },
  { label: 'House', category: 'Electronic', prompt: 'Groovy house music with four-on-the-floor beat, funky bassline, smooth synth stabs, and uplifting piano chords. Key: G Minor, Tempo: 124 BPM.' },
  { label: 'Techno', category: 'Electronic', prompt: 'Dark, driving techno with relentless kick drums, hypnotic synth patterns, industrial textures, and atmospheric pads. Key: A Minor, Tempo: 130 BPM.' },
  { label: 'Drum & Bass', category: 'Electronic', prompt: 'Energetic drum and bass with fast breakbeats, deep rolling basslines, chopped vocals, and atmospheric synth leads. Key: D Minor, Tempo: 174 BPM.' },
  { label: 'Dubstep', category: 'Electronic', prompt: 'Heavy dubstep with massive wobble bass, aggressive synths, dramatic builds, and crushing drops. Key: F Minor, Tempo: 140 BPM.' },
  { label: 'Trance', category: 'Electronic', prompt: 'Uplifting trance with soaring melodies, euphoric synth leads, rolling basslines, and epic breakdowns. Key: A Minor, Tempo: 138 BPM.' },
  { label: 'Chillwave', category: 'Electronic', prompt: 'Dreamy chillwave with hazy synths, reverb-drenched vocals, slow tempo beats, and nostalgic 80s vibes. Key: E Major, Tempo: 95 BPM.' },
  
  // Orchestral & Cinematic
  { label: 'Cinematic Epic', category: 'Cinematic', prompt: 'Epic cinematic orchestral piece with powerful brass, soaring strings, thundering percussion, and dramatic crescendos. Perfect for movie trailers.' },
  { label: 'Cinematic Emotional', category: 'Cinematic', prompt: 'Emotional cinematic score with gentle piano, sweeping strings, subtle woodwinds, and heartfelt melodies. Perfect for drama scenes.' },
  { label: 'Cinematic Action', category: 'Cinematic', prompt: 'Intense action soundtrack with pounding percussion, aggressive brass, fast string ostinatos, and explosive hits. Key: D Minor, Tempo: 160 BPM.' },
  { label: 'Cinematic Horror', category: 'Cinematic', prompt: 'Dark horror soundtrack with dissonant strings, eerie textures, unsettling drones, and sudden stingers. Tension and dread.' },
  { label: 'Classical', category: 'Cinematic', prompt: 'Beautiful classical composition with elegant piano, refined strings, gentle woodwinds, and sophisticated harmonies. Key: C Major, Tempo: 100 BPM.' },
  
  // Rock & Alternative
  { label: 'Rock', category: 'Rock', prompt: 'Powerful rock anthem with crunchy electric guitars, driving drums, punchy bass, and an anthemic chorus feel. Key: E Major, Tempo: 140 BPM.' },
  { label: 'Indie Rock', category: 'Rock', prompt: 'Upbeat indie rock with jangly guitars, steady drums, catchy melodies, and warm, organic production. Key: G Major, Tempo: 120 BPM.' },
  { label: 'Metal', category: 'Rock', prompt: 'Heavy metal with distorted guitars, double bass drums, aggressive riffs, and powerful energy. Key: E Minor, Tempo: 160 BPM.' },
  { label: 'Punk Rock', category: 'Rock', prompt: 'Fast punk rock with distorted power chords, simple driving drums, raw energy, and rebellious attitude. Key: A Major, Tempo: 180 BPM.' },
  { label: 'Grunge', category: 'Rock', prompt: 'Grungy alternative rock with fuzzy guitars, heavy drums, melancholic melodies, and raw emotional intensity. Key: D Minor, Tempo: 110 BPM.' },
  
  // Jazz & Blues
  { label: 'Smooth Jazz', category: 'Jazz', prompt: 'Smooth jazz cafe music with walking bass, brushed drums, warm piano chords, and tasteful saxophone improvisations. Tempo: 120 BPM.' },
  { label: 'Jazz Fusion', category: 'Jazz', prompt: 'Complex jazz fusion with intricate guitar work, synth layers, dynamic drums, and virtuosic solos. Key: D Dorian, Tempo: 115 BPM.' },
  { label: 'Bebop', category: 'Jazz', prompt: 'Classic bebop jazz with fast tempos, complex harmonies, virtuosic saxophone, and swinging rhythm section. Tempo: 200 BPM.' },
  { label: 'Blues', category: 'Jazz', prompt: 'Soulful blues with expressive electric guitar, shuffle rhythm, Hammond organ, and heartfelt emotion. Key: A Minor, Tempo: 80 BPM.' },
  { label: 'Bossa Nova', category: 'Jazz', prompt: 'Elegant bossa nova with nylon guitar, soft percussion, gentle bass, and romantic Brazilian feel. Key: C Major, Tempo: 120 BPM.' },
  
  // Pop & R&B
  { label: 'Pop', category: 'Pop', prompt: 'Catchy pop song with bright synths, punchy drums, memorable hooks, and polished production. Key: C Major, Tempo: 118 BPM.' },
  { label: 'R&B', category: 'Pop', prompt: 'Smooth R&B with silky vocals, groovy bass, soft pads, and sensual atmosphere. Key: Eb Major, Tempo: 90 BPM.' },
  { label: 'Soul', category: 'Pop', prompt: 'Classic soul music with powerful vocals, warm horns, groovy bass, and emotional depth. Key: G Major, Tempo: 95 BPM.' },
  { label: 'Disco', category: 'Pop', prompt: 'Funky disco with four-on-the-floor beat, funky guitar, lush strings, and groovy bassline. Key: F Major, Tempo: 120 BPM.' },
  { label: 'Funk', category: 'Pop', prompt: 'Groovy funk with slap bass, wah guitar, tight drums, and irresistible groove. Key: E Minor, Tempo: 105 BPM.' },
  
  // Hip Hop & Urban
  { label: 'Hip Hop', category: 'Hip Hop', prompt: 'Hard-hitting hip hop beat with punchy 808s, crisp snares, atmospheric samples, and head-nodding groove. Key: G Minor, Tempo: 90 BPM.' },
  { label: 'Trap', category: 'Hip Hop', prompt: 'Dark trap beat with rolling hi-hats, heavy 808 bass, atmospheric synths, and aggressive energy. Key: C Minor, Tempo: 140 BPM.' },
  { label: 'Boom Bap', category: 'Hip Hop', prompt: 'Classic boom bap with crisp drums, jazzy samples, dusty textures, and old school hip hop feel. Key: D Minor, Tempo: 95 BPM.' },
  { label: 'UK Drill', category: 'Hip Hop', prompt: 'Dark UK drill beat with sliding 808s, aggressive hi-hats, sinister melodies, and hard-hitting drums. Key: G Minor, Tempo: 142 BPM.' },
  
  // Acoustic & Folk
  { label: 'Folk', category: 'Acoustic', prompt: 'Warm acoustic folk song with fingerpicked guitar, gentle harmonica, soft percussion, and a nostalgic feel. Key: G Major, Tempo: 110 BPM.' },
  { label: 'Country', category: 'Acoustic', prompt: 'Country music with acoustic guitar, pedal steel, fiddle, and storytelling vibe. Key: D Major, Tempo: 100 BPM.' },
  { label: 'Acoustic Pop', category: 'Acoustic', prompt: 'Light acoustic pop with strummed guitar, soft drums, gentle bass, and warm vocals. Key: C Major, Tempo: 105 BPM.' },
  { label: 'Singer-Songwriter', category: 'Acoustic', prompt: 'Intimate singer-songwriter with fingerstyle guitar, subtle piano, and emotional, personal feel. Key: A Major, Tempo: 90 BPM.' },
  
  // World & Cultural
  { label: 'Reggae', category: 'World', prompt: 'Chill reggae with offbeat guitar, deep bass, one-drop rhythm, and laid-back island vibes. Key: G Major, Tempo: 75 BPM.' },
  { label: 'Latin', category: 'World', prompt: 'Energetic Latin music with salsa rhythms, brass section, piano montunos, and infectious groove. Key: A Minor, Tempo: 180 BPM.' },
  { label: 'Afrobeat', category: 'World', prompt: 'Groovy afrobeat with polyrhythmic drums, funky guitar, brass stabs, and hypnotic energy. Key: E Minor, Tempo: 115 BPM.' },
  { label: 'Celtic', category: 'World', prompt: 'Traditional Celtic music with fiddle, tin whistle, acoustic guitar, and Irish folk feel. Key: D Major, Tempo: 130 BPM.' },
  { label: 'Middle Eastern', category: 'World', prompt: 'Evocative Middle Eastern music with oud, darbuka percussion, quarter-tone melodies, and exotic atmosphere.' },
  { label: 'Asian Fusion', category: 'World', prompt: 'Modern Asian fusion with traditional instruments, electronic elements, cinematic strings, and east-meets-west feel.' },
  
  // Ambient & Experimental
  { label: 'Ambient', category: 'Ambient', prompt: 'Ethereal ambient soundscape with shimmering pads, gentle textures, subtle field recordings, and peaceful atmosphere.' },
  { label: 'Dark Ambient', category: 'Ambient', prompt: 'Atmospheric dark ambient with deep drones, unsettling textures, sparse sounds, and immersive darkness.' },
  { label: 'Nature Sounds', category: 'Ambient', prompt: 'Calming nature soundscape with forest ambience, gentle rain, bird songs, and peaceful atmosphere for relaxation.' },
  { label: 'Meditation', category: 'Ambient', prompt: 'Peaceful meditation music with singing bowls, soft drones, gentle bells, and serene atmosphere for mindfulness.' },
  { label: 'Space Music', category: 'Ambient', prompt: 'Cosmic space music with vast synthesizer pads, otherworldly textures, and expansive, interstellar atmosphere.' }
];

// Get unique categories from styles
const GENRE_CATEGORIES = [...new Set(STYLE_SUGGESTIONS.map(s => s.category))];

// Windows 95 style button component
interface Win95ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}

const Win95Button = memo<Win95ButtonProps>(function Win95Button({ children, onClick, disabled, active, className = '' }) {
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
interface Win95PanelProps {
  children: ReactNode;
  className?: string;
  sunken?: boolean;
}

const Win95Panel = memo<Win95PanelProps>(function Win95Panel({ children, className = '', sunken = true }) {
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

// Windows 95 style group box - with blue title bar matching other components
interface Win95GroupBoxProps {
  title: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

const Win95GroupBox = memo<Win95GroupBoxProps>(function Win95GroupBox({ title, children, className = '', icon }) {
  return (
    <div 
      className={`flex flex-col ${className}`}
      style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Blue title bar - matching other components */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        {icon}
        <span className="text-[10px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {title}
        </span>
      </div>
      {/* Content */}
      <div className="relative flex-1 p-2">
        {children}
      </div>
    </div>
  );
});

// Waveform display component
interface WaveformDisplayProps {
  isPlaying: boolean;
  isGenerating: boolean;
}

const WaveformDisplay = memo<WaveformDisplayProps>(function WaveformDisplay({ isPlaying, isGenerating }) {
  return (
    <div 
      className="w-full h-16 lg:h-20 flex items-center justify-center gap-0.5 overflow-hidden"
      style={{ background: '#000080' }}
    >
      {Array.from({ length: 48 }).map((_, i) => {
        const height = isPlaying || isGenerating 
          ? Math.sin(i * 0.3 + Date.now() * 0.01) * 30 + 35
          : 20;
        return (
          <div
            key={i}
            className="w-1"
            style={{
              height: `${height}%`,
              background: isPlaying ? '#00ff00' : isGenerating ? '#ffff00' : '#008000',
              transition: isPlaying || isGenerating ? 'none' : 'height 0.3s'
            }}
          />
        );
      })}
    </div>
  );
});

// Animated waveform with interval
const AnimatedWaveform = memo<WaveformDisplayProps>(function AnimatedWaveform({ isPlaying, isGenerating }) {
  const [, setTick] = useState<number>(0);
  
  React.useEffect(() => {
    if (isPlaying || isGenerating) {
      const interval = setInterval(() => setTick(t => t + 1), 100);
      return () => clearInterval(interval);
    }
  }, [isPlaying, isGenerating]);
  
  return <WaveformDisplay isPlaying={isPlaying} isGenerating={isGenerating} />;
});

// Genre dropdown - Win95 style
interface Win95GenreDropdownProps {
  selectedGenre: string | null;
  onSelect: (style: { label: string; prompt: string; category: string }) => void;
}

const Win95GenreDropdown = memo<Win95GenreDropdownProps>(function Win95GenreDropdown({ selectedGenre, onSelect }) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  
  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2 py-1 text-left text-[11px]"
        style={{
          background: WIN95.inputBg,
          color: WIN95.text,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <span>{selectedGenre || '(Select a genre)'}</span>
        <ChevronDown className="w-3 h-3" style={{ color: WIN95.text }} />
      </button>
      
      {isOpen && (
        <div 
          className="absolute top-full left-0 right-0 mt-0 z-50 max-h-48 overflow-y-auto"
          style={{
            background: WIN95.inputBg,
            border: `1px solid ${WIN95.border.darker}`,
            boxShadow: `2px 2px 0 ${WIN95.border.darker}`
          }}
        >
          {GENRE_CATEGORIES.map((category) => (
            <div key={category}>
              <div 
                className="px-2 py-1 text-[10px] font-bold"
                style={{ 
                  background: WIN95.bg,
                  color: WIN95.text,
                  borderBottom: `1px solid ${WIN95.bgDark}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                {category}
              </div>
              {STYLE_SUGGESTIONS.filter(s => s.category === category).map((style) => (
                <button
                  key={style.label}
                  onClick={() => {
                    onSelect(style);
                    setIsOpen(false);
                  }}
                  className="w-full px-4 py-1 text-left text-[11px] hover:text-white"
                  style={{
                    background: selectedGenre === style.label ? WIN95.highlight : 'transparent',
                    color: selectedGenre === style.label ? WIN95.highlightText : WIN95.text,
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedGenre !== style.label) {
                      e.currentTarget.style.background = WIN95.highlight;
                      e.currentTarget.style.color = WIN95.highlightText;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedGenre !== style.label) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = WIN95.text;
                    }
                  }}
                >
                  {style.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// Transport button (play/pause/stop)
interface TransportButtonProps {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  color?: 'default' | 'green' | 'red';
}

const TransportButton = memo<TransportButtonProps>(function TransportButton({ icon: Icon, label, onClick, active, color = 'default' }) {
  const colors = {
    default: WIN95.buttonFace,
    green: '#00aa00',
    red: '#aa0000'
  };
  
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 px-4 py-2"
      style={{
        background: active ? WIN95.bgDark : WIN95.buttonFace,
        boxShadow: active 
          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      <Icon className="w-5 h-5" style={{ color: active ? colors[color] : WIN95.text }} />
      <span className="text-[9px]" style={{ color: WIN95.text }}>{label}</span>
    </button>
  );
});

// Collapsible How to Use component - Win95 style
const CollapsibleMusicHowToUse = memo(function CollapsibleMusicHowToUse(): React.ReactElement | null {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  return (
    <div style={{ background: WIN95.bg, borderBottom: `1px solid ${WIN95.bgDark}` }}>
      <button 
        onClick={() => setIsExpanded(!isExpanded)} 
        className="w-full flex items-center justify-between px-1 lg:px-2 py-0.5 lg:py-1"
        style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
      >
        <div className="flex items-center gap-1 lg:gap-2">
          <Music className="w-3 h-3 lg:w-4 lg:h-4" style={{ color: WIN95.text }} />
          <span className="text-[9px] lg:text-[10px] font-bold" style={{ color: WIN95.text }}>Guide</span>
          <span className="text-[7px] lg:text-[8px] px-1 py-0.5 rounded" style={{ background: '#008080', color: '#fff' }}>Cassette</span>
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
          {/* Quick Start */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>Quick Start</div>
            <div className="space-y-0.5">
              <div><strong>1.</strong> Select a genre from 50+ options (Lo-fi, EDM, Jazz, Rock, Cinematic...)</div>
              <div><strong>2.</strong> Set duration with fader or presets (15 seconds to 3 minutes)</div>
              <div><strong>3.</strong> Customize the prompt with instruments, tempo, or mood</div>
              <div><strong>4.</strong> Click Generate - ultra-fast: 30s track in ~2 seconds!</div>
              <div><strong>5.</strong> Play directly or download as high-quality WAV file</div>
            </div>
          </div>
          
          {/* Genre Categories */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#008080' }}>Genre Categories</div>
            <div className="grid grid-cols-2 gap-0.5 text-[9px]">
              <div>🎹 Electronic: EDM, House, Techno, D&B</div>
              <div>🎸 Rock: Indie, Metal, Punk, Grunge</div>
              <div>🎷 Jazz: Smooth, Bebop, Blues, Bossa</div>
              <div>🎬 Cinematic: Epic, Emotional, Action</div>
              <div>🎤 Pop: R&B, Soul, Disco, Funk</div>
              <div>🌍 World: Latin, Reggae, Celtic, Afrobeat</div>
            </div>
          </div>
          
          {/* Prompt Tips */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#808000' }}>Prompt Tips</div>
            <div className="space-y-0.5 text-[9px]">
              <div>• <strong>Key & Tempo:</strong> "Key: C Major, Tempo: 120 BPM"</div>
              <div>• <strong>Instruments:</strong> "piano, soft drums, warm bass, ambient pads"</div>
              <div>• <strong>Mood:</strong> "relaxing", "energetic", "melancholic", "uplifting"</div>
              <div>• <strong>Style:</strong> "lo-fi hip hop", "epic orchestral", "80s synthwave"</div>
            </div>
          </div>
          
          {/* Pricing */}
          <div className="pt-1 flex flex-wrap items-center gap-2" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
            <span className="text-[9px] font-bold" style={{ color: '#008000' }}>💰 1 credit = $0.10</span>
            <span className="text-[8px] px-1 py-0.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>⚡ 30s → ~2s</span>
            <span className="text-[8px] px-1 py-0.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>⚡ 3min → ~10s</span>
            <span className="text-[8px] px-1 py-0.5" style={{ background: WIN95.bgLight, border: `1px solid ${WIN95.bgDark}` }}>📁 WAV Export</span>
          </div>
        </div>
      )}
    </div>
  );
});

interface MusicGeneratorProps {
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

const MusicGenerator = memo<MusicGeneratorProps>(function MusicGenerator({ onShowTokenPayment, onShowStripePayment }) {
  const emailContext = useEmailAuth();
  const walletContext = useSimpleWallet();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isConnected = isEmailAuth || walletContext.isConnected;
  
  // State
  const [prompt, setPrompt] = useState<string>('');
  const [duration, setDuration] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [optimizePrompt, setOptimizePrompt] = useState<boolean>(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  const canGenerate = isConnected && prompt.trim().length > 0 && !isGenerating;

  const handleGenerate = useCallback(async () => {
    if (!canGenerate) return;
    
    setIsGenerating(true);
    setError(null);
    setProgress('Initializing...');
    setGeneratedAudioUrl(null);
    setIsPlaying(false);

    try {
      const estimatedTime = duration <= 30 ? '~2s' : duration <= 60 ? '~5s' : '~10s';
      setProgress(optimizePrompt ? `Optimizing & generating... (${estimatedTime})` : `Generating... (${estimatedTime})`);
      
      const result = await generateMusic({
        prompt,
        duration,
        userId: emailContext.userId,
        walletAddress: walletContext.address,
        email: emailContext.email,
        optimizePrompt,
        selectedGenre
      });

      setGeneratedAudioUrl(result.audioUrl);
      setProgress(null);
      
      if (isEmailAuth && emailContext.refreshCredits) {
        emailContext.refreshCredits();
      } else if (walletContext.fetchCredits && walletContext.address) {
        walletContext.fetchCredits(walletContext.address, 3, true);
      }
      
      logger.info('Music generated successfully', { remainingCredits: result.remainingCredits });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setProgress(null);
      logger.error('Music generation failed', { error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setIsGenerating(false);
    }
  }, [canGenerate, prompt, duration, emailContext, walletContext, isEmailAuth, optimizePrompt, selectedGenre]);

  const handleDownload = useCallback(async () => {
    if (!generatedAudioUrl) return;
    
    try {
      const response = await fetch(generatedAudioUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seiso-music-${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      logger.error('Download failed', { error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }, [generatedAudioUrl]);

  const togglePlayPause = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
    }
  }, []);

  const handleStyleClick = useCallback((style: { label: string; prompt: string; category: string }) => {
    // Don't autofill the prompt - just set the genre for context
    // User writes their own prompt which gets optimized for the music model
    setSelectedGenre(style.label);
  }, []);

  return (
    <div className="fade-in h-full flex flex-col" style={{ background: '#1a4a5e' }}>
      {/* Menu bar style how to use */}
      <CollapsibleMusicHowToUse />
      
      {/* Main content */}
      <div className="flex-1 min-h-0 p-1 lg:p-1.5 flex flex-col lg:flex-row gap-1 lg:gap-1.5 overflow-auto lg:overflow-hidden">
        {/* Left panel - Controls */}
        <div className="lg:w-[45%] flex flex-col gap-0.5 lg:gap-1 min-h-0 overflow-auto lg:overflow-hidden">
          {/* Genre Selection */}
          <Win95GroupBox title="Genre" className="flex-shrink-0">
            <Win95GenreDropdown
              selectedGenre={selectedGenre}
              onSelect={handleStyleClick}
            />
          </Win95GroupBox>
          
          {/* Track Prompt */}
          <Win95GroupBox title="Prompt" className="flex-shrink-0">
            <Win95Panel sunken className="p-0">
              <textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                }}
                placeholder={selectedGenre 
                  ? `Describe your ${selectedGenre} track... (instruments, mood, tempo)` 
                  : "Describe your track... (genre, instruments, mood, key, BPM)"}
                className="w-full p-1 resize-none text-[10px] focus:outline-none"
                rows={4}
                style={{ 
                  background: 'transparent',
                  color: WIN95.text,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  minHeight: '70px'
                }}
              />
            </Win95Panel>
            {/* AI Enhance Toggle */}
            <div className="flex justify-between items-center mt-1">
              <span className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                {prompt.length} chars
              </span>
              <label 
                onClick={() => setOptimizePrompt(!optimizePrompt)}
                className="flex items-center gap-1.5 cursor-pointer select-none px-1 py-0.5 hover:bg-[#d0d0d0]"
                style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
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
          </Win95GroupBox>
          
          {/* Duration Control */}
          <Win95GroupBox title="Duration" className="flex-shrink-0">
            <div className="flex items-center gap-1">
              <div className="flex gap-0.5 flex-wrap">
                {DURATION_PRESETS.map((preset) => (
                  <Win95Button
                    key={preset.value}
                    onClick={() => setDuration(preset.value)}
                    active={duration === preset.value}
                    className="text-[9px] px-1.5"
                  >
                    {preset.label}
                  </Win95Button>
                ))}
              </div>
              <span className="text-[10px] font-mono" style={{ color: WIN95.text }}>{duration}s</span>
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
                {calculateMusicCredits(duration)} credits per generation
              </div>
            </div>
            {!canGenerate && !isGenerating && prompt.trim().length === 0 && (
              <div className="mt-1 text-[8px] text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                ↑ Select genre or describe track
              </div>
            )}
          </Win95GroupBox>
        </div>
        
        {/* Right panel - Output */}
        <div className="flex-1 flex flex-col gap-0.5 lg:gap-1 min-h-0">
          {/* Waveform Display */}
          <Win95GroupBox title="Waveform" className="flex-1 flex flex-col min-h-0">
            <Win95Panel sunken className="overflow-hidden flex-1" style={{ minHeight: '60px' }}>
              <AnimatedWaveform isPlaying={isPlaying} isGenerating={isGenerating} />
            </Win95Panel>
          </Win95GroupBox>
          
          {/* Status + Transport combined */}
          <Win95GroupBox title="Controls" className="flex-shrink-0">
            <div className="flex items-center gap-2">
              {/* Status */}
              <div className="flex-1 text-[9px] font-mono px-1" style={{ color: WIN95.text, fontFamily: 'Fixedsys, "Courier New", monospace' }}>
                {isGenerating && progress ? (
                  <span style={{ color: '#808000' }}>{progress}</span>
                ) : error ? (
                  <span style={{ color: '#800000' }}>Error</span>
                ) : generatedAudioUrl ? (
                  <span style={{ color: '#008000' }}>✓ {duration}s</span>
                ) : (
                  <span style={{ color: WIN95.textDisabled }}>Ready</span>
                )}
              </div>
              
              {/* Transport buttons - compact */}
              <div className="flex items-center gap-0.5">
                <Win95Button onClick={togglePlayPause} active={isPlaying} className="px-2">
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                </Win95Button>
                <Win95Button onClick={handleStop} className="px-2">
                  <Square className="w-3 h-3" />
                </Win95Button>
                <Win95Button onClick={handleDownload} className="px-2">
                  <Download className="w-3 h-3" />
                </Win95Button>
                <Win95Button onClick={() => { setGeneratedAudioUrl(null); setIsPlaying(false); setError(null); }} className="text-[9px]">
                  New
                </Win95Button>
              </div>
            </div>
            
            {/* Hidden audio element */}
            {generatedAudioUrl && (
              <audio 
                ref={audioRef}
                src={generatedAudioUrl}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                className="hidden"
              />
            )}
          </Win95GroupBox>
          
          {/* Error display - compact */}
          {error && (
            <div className="flex items-center gap-1 px-1 py-0.5" style={{ background: '#ffe0e0' }}>
              <AlertCircle className="w-3 h-3 flex-shrink-0" style={{ color: '#800000' }} />
              <div className="text-[8px] flex-1" style={{ color: '#800000' }}>{error}</div>
              <Win95Button onClick={() => setError(null)} className="text-[8px] px-1">✕</Win95Button>
            </div>
          )}
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
          {isGenerating ? 'Processing...' : generatedAudioUrl ? 'Ready' : 'Ready'}
        </Win95Panel>
        <Win95Panel sunken className="px-1 lg:px-2 py-0.5 ml-1">
          {duration}s
        </Win95Panel>
        <Win95Panel sunken className="px-1 lg:px-2 py-0.5 ml-1 hidden lg:block">
          {selectedGenre || 'No genre'}
        </Win95Panel>
      </div>
    </div>
  );
});

export default MusicGenerator;
