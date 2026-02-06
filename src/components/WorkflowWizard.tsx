import React, { useState, useCallback, useRef, ChangeEvent } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { 
  Sparkles, User, Film, Music, Upload, X, Check, ChevronRight, 
  Download, AlertCircle, RefreshCw, Wand2, Video, Volume2
} from 'lucide-react';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';
import StemMixer from './StemMixer';
import { Win95Button, Win95Panel, WIN95_COLORS as WIN95 } from './ui/Win95';

// Workflow definitions
interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  credits: number;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  totalCredits: number;
  steps: WorkflowStep[];
  color: string;
}

const WORKFLOWS: WorkflowDefinition[] = [
  {
    id: 'ai-influencer',
    name: 'AI Influencer',
    description: 'Create a talking avatar from a portrait',
    icon: <User className="w-5 h-5" />,
    totalCredits: 4,
    color: '#8B5CF6',
    steps: [
      { id: 'portrait', name: 'Upload Portrait', description: 'Upload or generate a face image', icon: <User className="w-4 h-4" />, credits: 0 },
      { id: 'script', name: 'Write Script', description: 'Type what you want them to say', icon: <Wand2 className="w-4 h-4" />, credits: 0 },
      { id: 'voice', name: 'Generate Voice', description: 'AI creates the speech', icon: <Volume2 className="w-4 h-4" />, credits: 1 },
      { id: 'lipsync', name: 'Lip Sync', description: 'Animate the portrait', icon: <Film className="w-4 h-4" />, credits: 3 }
    ]
  },
  {
    id: 'music-video',
    name: 'Music Video',
    description: 'Generate music and matching visuals',
    icon: <Music className="w-5 h-5" />,
    totalCredits: 20,
    color: '#EC4899',
    steps: [
      { id: 'describe', name: 'Describe', description: 'Describe your music and visuals', icon: <Wand2 className="w-4 h-4" />, credits: 0 },
      { id: 'music', name: 'Generate Music', description: 'AI creates the soundtrack', icon: <Music className="w-4 h-4" />, credits: 1 },
      { id: 'video', name: 'Generate Video', description: 'AI creates matching visuals', icon: <Video className="w-4 h-4" />, credits: 18 },
      { id: 'combine', name: 'Combine', description: 'Merge audio and video', icon: <Sparkles className="w-4 h-4" />, credits: 1 }
    ]
  },
  {
    id: 'avatar-creator',
    name: 'Avatar Creator',
    description: 'Create a consistent character',
    icon: <Sparkles className="w-5 h-5" />,
    totalCredits: 3,
    color: '#10B981',
    steps: [
      { id: 'describe', name: 'Describe Character', description: 'Describe your character in detail', icon: <Wand2 className="w-4 h-4" />, credits: 0 },
      { id: 'generate', name: 'Generate Base', description: 'Create the character image', icon: <User className="w-4 h-4" />, credits: 1 },
      { id: 'variations', name: 'Create Poses', description: 'Generate variations', icon: <RefreshCw className="w-4 h-4" />, credits: 2 }
    ]
  },
  {
    id: 'remix-visualizer',
    name: 'Remix & Mix',
    description: 'Extract stems, mix, and export',
    icon: <Music className="w-5 h-5" />,
    totalCredits: 2,
    color: '#F59E0B',
    steps: [
      { id: 'upload', name: 'Upload Song', description: 'Upload audio to remix', icon: <Upload className="w-4 h-4" />, credits: 0 },
      { id: 'separate', name: 'Separate Stems', description: 'Extract vocals, drums, bass, other', icon: <Music className="w-4 h-4" />, credits: 2 },
      { id: 'mix', name: 'Mix & Export', description: 'Adjust levels and export remix', icon: <Volume2 className="w-4 h-4" />, credits: 0 }
    ]
  }
];

// Primary styled button variant
const PrimaryButton: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}> = ({ children, onClick, disabled, className = '' }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-3 py-1.5 text-[11px] font-bold transition-none select-none ${className}`}
    style={{
      background: '#2d8a2d',
      color: '#ffffff',
      border: 'none',
      boxShadow: `inset 1px 1px 0 #4db84d, inset -1px -1px 0 #1a5c1a, inset 2px 2px 0 #3da83d, inset -2px -2px 0 #206b20`,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.7 : 1,
      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
    }}
  >
    {children}
  </button>
);

interface WorkflowWizardProps {
  onClose?: () => void;
}

const WorkflowWizard: React.FC<WorkflowWizardProps> = ({ onClose }) => {
  const walletContext = useSimpleWallet();
  
  const isConnected = walletContext.isConnected;
  
  // State
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDefinition | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setStepResults] = useState<Record<string, unknown>>({});
  
  // AI Influencer specific state
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [scriptText, setScriptText] = useState('');
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null);
  
  // Music Video specific state
  const [musicPrompt, setMusicPrompt] = useState('');
  const [visualPrompt, setVisualPrompt] = useState('');
  const [generatedMusicUrl, setGeneratedMusicUrl] = useState<string | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  
  // Avatar Creator specific state
  const [characterDescription, setCharacterDescription] = useState('');
  const [baseCharacterUrl, setBaseCharacterUrl] = useState<string | null>(null);
  const [variationUrls, setVariationUrls] = useState<string[]>([]);
  
  // Remix Visualizer specific state
  const [remixSourceUrl, setRemixSourceUrl] = useState<string | null>(null);
  const [stems, setStems] = useState<Record<string, string> | null>(null);
  
  // File upload refs
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  
  // Upload helper
  const uploadFile = async (dataUri: string, type: 'image' | 'audio'): Promise<string> => {
    const endpoint = type === 'audio' ? '/api/audio/upload' : '/api/wan-animate/upload-image';
    const bodyKey = type === 'audio' ? 'audioDataUri' : 'imageDataUri';
    
    const csrfToken = await ensureCSRFToken();
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      },
      credentials: 'include',
      body: JSON.stringify({ [bodyKey]: dataUri })
    });
    
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Upload failed');
    return data.url;
  };
  
  // Handle file uploads
  const handlePortraitUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUri = event.target?.result as string;
        const url = await uploadFile(dataUri, 'image');
        setPortraitUrl(url);
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError((err as Error).message);
      setIsProcessing(false);
    }
  }, []);
  
  const handleAudioUpload = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('audio/')) {
      setError('Please select a valid audio file');
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUri = event.target?.result as string;
        const url = await uploadFile(dataUri, 'audio');
        setRemixSourceUrl(url);
        setIsProcessing(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError((err as Error).message);
      setIsProcessing(false);
    }
  }, []);
  
  // Process current step
  const processStep = useCallback(async () => {
    if (!selectedWorkflow || !isConnected) return;
    
    setIsProcessing(true);
    setError(null);
    
    const step = selectedWorkflow.steps[currentStep];
    
    try {
      // Get CSRF token for all API calls
      const csrfToken = await ensureCSRFToken();
      const csrfHeaders = {
        'Content-Type': 'application/json',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken }),
      };
      
      // AI Influencer workflow
      if (selectedWorkflow.id === 'ai-influencer') {
        if (step.id === 'voice') {
          // Generate voice from script
          const response = await fetch(`${API_URL}/api/audio/voice-clone`, {
            method: 'POST',
            headers: csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({
              text: scriptText,
              language: 'en',
              walletAddress: walletContext.address
            })
          });
          
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.error || 'Voice generation failed');
          
          setVoiceAudioUrl(data.audio_url);
          setCurrentStep(prev => prev + 1);
        } else if (step.id === 'lipsync') {
          // Generate lip sync video
          const response = await fetch(`${API_URL}/api/audio/lip-sync`, {
            method: 'POST',
            headers: csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({
              image_url: portraitUrl,
              audio_url: voiceAudioUrl,
              expression_scale: 1.0,
              walletAddress: walletContext.address
            })
          });
          
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.error || 'Lip sync failed');
          
          setFinalVideoUrl(data.video_url);
          setCurrentStep(prev => prev + 1);
        } else {
          // Just advance for non-API steps
          setCurrentStep(prev => prev + 1);
        }
      }
      
      // Music Video workflow
      else if (selectedWorkflow.id === 'music-video') {
        if (step.id === 'music') {
          // Generate music
          const response = await fetch(`${API_URL}/api/generate/music`, {
            method: 'POST',
            headers: csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({
              prompt: musicPrompt,
              duration: 30,
              walletAddress: walletContext.address
            })
          });
          
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.error || 'Music generation failed');
          
          setGeneratedMusicUrl(data.audio_file?.url);
          setCurrentStep(prev => prev + 1);
        } else if (step.id === 'video') {
          // Generate video
          const response = await fetch(`${API_URL}/api/generate/video`, {
            method: 'POST',
            headers: csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({
              prompt: visualPrompt || musicPrompt,
              duration: '8s',
              generation_mode: 'text-to-video',
              quality: 'fast',
              generate_audio: false,
              walletAddress: walletContext.address
            })
          });
          
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.error || 'Video generation failed');
          
          setGeneratedVideoUrl(data.video?.url);
          setCurrentStep(prev => prev + 1);
        } else {
          setCurrentStep(prev => prev + 1);
        }
      }
      
      // Avatar Creator workflow
      else if (selectedWorkflow.id === 'avatar-creator') {
        if (step.id === 'generate') {
          // Generate base character
          const response = await fetch(`${API_URL}/api/generate/image`, {
            method: 'POST',
            headers: csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({
              prompt: `portrait of ${characterDescription}, centered, high quality, detailed face`,
              aspect_ratio: '1:1',
              walletAddress: walletContext.address
            })
          });
          
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Image generation failed');
          
          setBaseCharacterUrl(data.images?.[0]);
          setCurrentStep(prev => prev + 1);
        } else if (step.id === 'variations') {
          // Generate variations using the base image
          const variations: string[] = [];
          const poses = ['smiling', 'serious expression', 'looking to the side'];
          
          for (const pose of poses) {
            const response = await fetch(`${API_URL}/api/generate/image`, {
              method: 'POST',
              headers: csrfHeaders,
              credentials: 'include',
              body: JSON.stringify({
                prompt: `${characterDescription}, ${pose}, same person, consistent appearance`,
                image_url: baseCharacterUrl,
                model: 'flux-2',
                walletAddress: walletContext.address
              })
            });
            
            const data = await response.json();
            if (response.ok && data.images?.[0]) {
              variations.push(data.images[0]);
            }
          }
          
          setVariationUrls(variations);
          setCurrentStep(prev => prev + 1);
        } else {
          setCurrentStep(prev => prev + 1);
        }
      }
      
      // Remix Visualizer workflow
      else if (selectedWorkflow.id === 'remix-visualizer') {
        if (step.id === 'separate') {
          // Separate stems
          const response = await fetch(`${API_URL}/api/audio/separate`, {
            method: 'POST',
            headers: csrfHeaders,
            credentials: 'include',
            body: JSON.stringify({
              audio_url: remixSourceUrl,
              walletAddress: walletContext.address
            })
          });
          
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.error || 'Stem separation failed');
          
          setStems(data.stems);
          setCurrentStep(prev => prev + 1);
        } else {
          setCurrentStep(prev => prev + 1);
        }
      }
      
      // Refresh credits
      if (walletContext.fetchCredits && walletContext.address) {
        walletContext.fetchCredits(walletContext.address, 3, true);
      }
      
    } catch (err) {
      setError((err as Error).message);
      logger.error('Workflow step failed', { workflow: selectedWorkflow.id, step: step.id, error: (err as Error).message });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedWorkflow, currentStep, isConnected, scriptText, portraitUrl, voiceAudioUrl, musicPrompt, visualPrompt, characterDescription, baseCharacterUrl, remixSourceUrl, walletContext]);
  
  // Check if current step can proceed
  const canProceed = useCallback(() => {
    if (!selectedWorkflow) return false;
    const step = selectedWorkflow.steps[currentStep];
    
    if (selectedWorkflow.id === 'ai-influencer') {
      if (step.id === 'portrait') return !!portraitUrl;
      if (step.id === 'script') return scriptText.trim().length > 0;
      if (step.id === 'voice') return !!voiceAudioUrl;
      if (step.id === 'lipsync') return !!finalVideoUrl;
    }
    
    if (selectedWorkflow.id === 'music-video') {
      if (step.id === 'describe') return musicPrompt.trim().length > 0;
      if (step.id === 'music') return !!generatedMusicUrl;
      if (step.id === 'video') return !!generatedVideoUrl;
    }
    
    if (selectedWorkflow.id === 'avatar-creator') {
      if (step.id === 'describe') return characterDescription.trim().length > 0;
      if (step.id === 'generate') return !!baseCharacterUrl;
      if (step.id === 'variations') return variationUrls.length > 0;
    }
    
    if (selectedWorkflow.id === 'remix-visualizer') {
      if (step.id === 'upload') return !!remixSourceUrl;
      if (step.id === 'separate') return !!stems;
      if (step.id === 'mix') return !!stems; // Mix step is always ready if stems exist
    }
    
    return true;
  }, [selectedWorkflow, currentStep, portraitUrl, scriptText, voiceAudioUrl, finalVideoUrl, musicPrompt, generatedMusicUrl, generatedVideoUrl, characterDescription, baseCharacterUrl, variationUrls, remixSourceUrl, stems]);
  
  // Reset workflow
  const resetWorkflow = useCallback(() => {
    setSelectedWorkflow(null);
    setCurrentStep(0);
    setError(null);
    setStepResults({});
    setPortraitUrl(null);
    setScriptText('');
    setVoiceAudioUrl(null);
    setFinalVideoUrl(null);
    setMusicPrompt('');
    setVisualPrompt('');
    setGeneratedMusicUrl(null);
    setGeneratedVideoUrl(null);
    setCharacterDescription('');
    setBaseCharacterUrl(null);
    setVariationUrls([]);
    setRemixSourceUrl(null);
    setStems(null);
  }, []);
  
  // Render workflow selection
  const renderWorkflowSelection = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
      {WORKFLOWS.map(workflow => (
        <button
          key={workflow.id}
          onClick={() => setSelectedWorkflow(workflow)}
          className="p-4 text-left transition-all hover:scale-[1.02]"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <div className="flex items-start gap-3">
            <div 
              className="p-2 rounded"
              style={{ background: workflow.color, color: '#fff' }}
            >
              {workflow.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-[12px] font-bold" style={{ color: WIN95.text }}>
                {workflow.name}
              </h3>
              <p className="text-[10px] mt-0.5" style={{ color: WIN95.textDisabled }}>
                {workflow.description}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[9px] px-1.5 py-0.5" style={{ background: WIN95.bgDark, color: WIN95.text }}>
                  {workflow.steps.length} steps
                </span>
                <span className="text-[9px] px-1.5 py-0.5" style={{ background: '#008080', color: '#fff' }}>
                  ~{workflow.totalCredits} credits
                </span>
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
  
  // Render step content based on workflow and step
  const renderStepContent = () => {
    if (!selectedWorkflow) return null;
    const step = selectedWorkflow.steps[currentStep];
    
    // AI Influencer steps
    if (selectedWorkflow.id === 'ai-influencer') {
      if (step.id === 'portrait') {
        return (
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: WIN95.text }}>
              Upload a portrait photo or generate one. The face should be clearly visible and front-facing.
            </p>
            {!portraitUrl ? (
              <div 
                onClick={() => portraitInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 p-6 cursor-pointer"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
                }}
              >
                <Upload className="w-8 h-8" style={{ color: WIN95.textDisabled }} />
                <span className="text-[11px]" style={{ color: WIN95.text }}>Click to upload portrait</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <img src={portraitUrl} alt="Portrait" className="w-24 h-24 object-cover" style={{ boxShadow: `2px 2px 0 ${WIN95.border.darker}` }} />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px]" style={{ color: '#008000' }}>✓ Portrait uploaded</span>
                  <Win95Button onClick={() => setPortraitUrl(null)}>
                    <X className="w-3 h-3 inline mr-1" /> Remove
                  </Win95Button>
                </div>
              </div>
            )}
            <input ref={portraitInputRef} type="file" accept="image/*" onChange={handlePortraitUpload} className="hidden" />
          </div>
        );
      }
      
      if (step.id === 'script') {
        return (
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: WIN95.text }}>
              Write what you want your avatar to say. Keep it under 500 characters for best results.
            </p>
            <Win95Panel sunken className="p-0">
              <textarea
                value={scriptText}
                onChange={(e) => setScriptText(e.target.value)}
                placeholder="Hello! I'm your AI avatar. I can say anything you want..."
                className="w-full p-2 resize-none text-[11px] focus:outline-none"
                rows={4}
                style={{ background: 'transparent', color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
              />
            </Win95Panel>
            <div className="text-[9px] text-right" style={{ color: WIN95.textDisabled }}>
              {scriptText.length}/500 characters
            </div>
          </div>
        );
      }
      
      if (step.id === 'voice') {
        return (
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: WIN95.text }}>
              AI will generate speech from your script. This costs 1 credit.
            </p>
            {voiceAudioUrl && (
              <div className="p-2" style={{ background: WIN95.inputBg }}>
                <audio controls src={voiceAudioUrl} className="w-full h-8" />
              </div>
            )}
          </div>
        );
      }
      
      if (step.id === 'lipsync') {
        return (
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: WIN95.text }}>
              AI will animate your portrait to speak with the generated voice. This costs 3 credits.
            </p>
            {finalVideoUrl && (
              <div className="p-2" style={{ background: WIN95.inputBg }}>
                <video controls src={finalVideoUrl} className="w-full max-h-48" autoPlay loop />
              </div>
            )}
          </div>
        );
      }
    }
    
    // Music Video steps
    if (selectedWorkflow.id === 'music-video') {
      if (step.id === 'describe') {
        return (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text }}>Music Description:</label>
              <Win95Panel sunken className="p-0">
                <textarea
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Upbeat electronic music with synth pads and driving drums..."
                  className="w-full p-2 resize-none text-[11px] focus:outline-none"
                  rows={2}
                  style={{ background: 'transparent', color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                />
              </Win95Panel>
            </div>
            <div>
              <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text }}>Visual Description (optional):</label>
              <Win95Panel sunken className="p-0">
                <textarea
                  value={visualPrompt}
                  onChange={(e) => setVisualPrompt(e.target.value)}
                  placeholder="Abstract colorful visuals, flowing shapes, neon lights..."
                  className="w-full p-2 resize-none text-[11px] focus:outline-none"
                  rows={2}
                  style={{ background: 'transparent', color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
                />
              </Win95Panel>
            </div>
          </div>
        );
      }
      
      if (step.id === 'music' && generatedMusicUrl) {
        return (
          <div className="p-2" style={{ background: WIN95.inputBg }}>
            <audio controls src={generatedMusicUrl} className="w-full h-8" />
          </div>
        );
      }
      
      if (step.id === 'video' && generatedVideoUrl) {
        return (
          <div className="p-2" style={{ background: WIN95.inputBg }}>
            <video controls src={generatedVideoUrl} className="w-full max-h-48" />
          </div>
        );
      }
    }
    
    // Avatar Creator steps
    if (selectedWorkflow.id === 'avatar-creator') {
      if (step.id === 'describe') {
        return (
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: WIN95.text }}>
              Describe your character in detail. Be specific about appearance, style, and personality.
            </p>
            <Win95Panel sunken className="p-0">
              <textarea
                value={characterDescription}
                onChange={(e) => setCharacterDescription(e.target.value)}
                placeholder="A young woman with short blue hair, cyberpunk style, neon makeup, confident expression..."
                className="w-full p-2 resize-none text-[11px] focus:outline-none"
                rows={3}
                style={{ background: 'transparent', color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
              />
            </Win95Panel>
          </div>
        );
      }
      
      if (step.id === 'generate' && baseCharacterUrl) {
        return (
          <div className="flex justify-center">
            <img src={baseCharacterUrl} alt="Base character" className="max-h-48 object-contain" style={{ boxShadow: `2px 2px 0 ${WIN95.border.darker}` }} />
          </div>
        );
      }
      
      if (step.id === 'variations' && variationUrls.length > 0) {
        return (
          <div className="grid grid-cols-3 gap-2">
            {variationUrls.map((url, i) => (
              <img key={i} src={url} alt={`Variation ${i + 1}`} className="w-full aspect-square object-cover" style={{ boxShadow: `2px 2px 0 ${WIN95.border.darker}` }} />
            ))}
          </div>
        );
      }
    }
    
    // Remix Visualizer steps
    if (selectedWorkflow.id === 'remix-visualizer') {
      if (step.id === 'upload') {
        return (
          <div className="space-y-3">
            <p className="text-[10px]" style={{ color: WIN95.text }}>
              Upload a song to extract stems (vocals, drums, bass, other).
            </p>
            {!remixSourceUrl ? (
              <div 
                onClick={() => audioInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 p-6 cursor-pointer"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
                }}
              >
                <Music className="w-8 h-8" style={{ color: WIN95.textDisabled }} />
                <span className="text-[11px]" style={{ color: WIN95.text }}>Click to upload audio</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-2" style={{ background: WIN95.inputBg }}>
                <Music className="w-6 h-6" style={{ color: '#008080' }} />
                <span className="text-[10px] flex-1" style={{ color: WIN95.text }}>Audio uploaded</span>
                <Win95Button onClick={() => setRemixSourceUrl(null)}>
                  <X className="w-3 h-3" />
                </Win95Button>
              </div>
            )}
            <input ref={audioInputRef} type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
          </div>
        );
      }
      
      if (step.id === 'separate' && stems) {
        return (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(stems).map(([name, url]) => url && (
              <div key={name} className="p-2" style={{ background: WIN95.inputBg }}>
                <div className="text-[10px] font-bold mb-1 capitalize" style={{ color: WIN95.text }}>
                  {name === 'vocals' ? '🎤' : name === 'drums' ? '🥁' : name === 'bass' ? '🎸' : '🎹'} {name}
                </div>
                <audio controls src={url} className="w-full h-6" style={{ filter: 'sepia(0.3)' }} />
              </div>
            ))}
          </div>
        );
      }
      
      if (step.id === 'mix' && stems) {
        return (
          <StemMixer 
            stems={{
              vocals: stems.vocals,
              drums: stems.drums,
              bass: stems.bass,
              other: stems.other
            }} 
          />
        );
      }
    }
    
    return (
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>
        {step.description}
      </p>
    );
  };
  
  // Render active workflow
  const renderActiveWorkflow = () => {
    if (!selectedWorkflow) return null;
    
    const isComplete = currentStep >= selectedWorkflow.steps.length;
    const currentStepData = selectedWorkflow.steps[currentStep];
    
    return (
      <div className="flex flex-col h-full">
        {/* Progress steps */}
        <div className="flex items-center gap-1 p-2 overflow-x-auto" style={{ background: WIN95.bgLight }}>
          {selectedWorkflow.steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div 
                className="flex items-center gap-1 px-2 py-1 whitespace-nowrap"
                style={{
                  background: index === currentStep ? WIN95.highlight : index < currentStep ? '#008000' : WIN95.bg,
                  color: index <= currentStep ? '#fff' : WIN95.text,
                  boxShadow: index === currentStep 
                    ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                    : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                {index < currentStep ? <Check className="w-3 h-3" /> : step.icon}
                <span className="text-[9px] font-bold">{step.name}</span>
              </div>
              {index < selectedWorkflow.steps.length - 1 && (
                <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: WIN95.textDisabled }} />
              )}
            </React.Fragment>
          ))}
        </div>
        
        {/* Step content */}
        <div className="flex-1 p-4 overflow-auto">
          {isComplete ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full" style={{ background: '#008000' }}>
                <Check className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-[14px] font-bold" style={{ color: WIN95.text }}>Workflow Complete!</h3>
              
              {/* Show final outputs */}
              {selectedWorkflow.id === 'ai-influencer' && finalVideoUrl && (
                <div className="max-w-sm mx-auto">
                  <video controls src={finalVideoUrl} className="w-full" autoPlay loop />
                  <Win95Button 
                    onClick={() => {
                      const a = document.createElement('a');
                      a.href = finalVideoUrl;
                      a.download = `ai-influencer-${Date.now()}.mp4`;
                      a.click();
                    }}
                    className="w-full mt-2"
                  >
                    <Download className="w-3 h-3 inline mr-1" /> Download Video
                  </Win95Button>
                </div>
              )}
              
              <div className="flex justify-center gap-2 mt-4">
                <Win95Button onClick={resetWorkflow}>
                  Start New Workflow
                </Win95Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h3 className="text-[12px] font-bold" style={{ color: WIN95.text }}>
                  Step {currentStep + 1}: {currentStepData.name}
                </h3>
                {currentStepData.credits > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 ml-2" style={{ background: '#008080', color: '#fff' }}>
                    {currentStepData.credits} credit{currentStepData.credits !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              {renderStepContent()}
              
              {error && (
                <div className="flex items-center gap-2 p-2" style={{ background: '#ffe0e0' }}>
                  <AlertCircle className="w-4 h-4" style={{ color: '#800000' }} />
                  <span className="text-[10px]" style={{ color: '#800000' }}>{error}</span>
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Actions */}
        {!isComplete && (
          <div className="flex items-center justify-between gap-2 p-3" style={{ background: WIN95.bg, borderTop: `1px solid ${WIN95.bgDark}` }}>
            <Win95Button onClick={resetWorkflow}>
              ← Back
            </Win95Button>
            
            <div className="flex gap-2">
              {currentStepData.credits > 0 ? (
                <PrimaryButton
                  onClick={processStep}
                  disabled={!canProceed() || isProcessing || !isConnected}
                >
                  {isProcessing ? '⏳ Processing...' : `Generate (${currentStepData.credits} cr)`}
                </PrimaryButton>
              ) : (
                <PrimaryButton
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  disabled={!canProceed()}
                >
                  Next →
                </PrimaryButton>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };
  
  return (
    <div 
      className="h-full flex flex-col"
      style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`
      }}
    >
      {/* Title bar */}
      <div 
        className="flex items-center gap-2 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <Wand2 className="w-4 h-4" />
        <span className="text-[11px] font-bold flex-1" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {selectedWorkflow ? selectedWorkflow.name : 'AI Workflows'}
        </span>
        {onClose && (
          <button onClick={onClose} className="px-1 hover:bg-white/20">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        {selectedWorkflow ? renderActiveWorkflow() : renderWorkflowSelection()}
      </div>
    </div>
  );
};

export default WorkflowWizard;

