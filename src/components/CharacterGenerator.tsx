import React, { useState, useRef, useCallback, memo, ReactNode, ChangeEvent, useEffect } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generate3dModel } from '../services/model3dService';
import { addGeneration } from '../services/galleryService';
import { API_URL } from '../utils/apiConfig';
import { optimizeImage } from '../utils/imageOptimizer';
import { 
  Box, Upload, Play, X, Download, AlertCircle, ChevronDown, 
  Sparkles, Image, Wand2, RotateCcw, Eye, Layers, Settings,
  ArrowRight, Check, Loader2, Clock
} from 'lucide-react';
import logger from '../utils/logger';
import { WIN95 } from '../utils/buttonStyles';

// Import model-viewer for 3D rendering
import '@google/model-viewer';

// Session storage key for 3D generations
const SESSION_3D_GALLERY_KEY = 'seiso_3d_session_gallery';

// Interface for session gallery items
interface Session3dItem {
  id: string;
  timestamp: number;
  sourceImageUrl: string;
  thumbnailUrl: string;
  glbUrl: string;
  objUrl?: string;
  fbxUrl?: string;
  generateType: string;
  prompt?: string;
}

// Load session gallery from storage
const loadSessionGallery = (): Session3dItem[] => {
  try {
    const stored = sessionStorage.getItem(SESSION_3D_GALLERY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Save session gallery to storage
const saveSessionGallery = (items: Session3dItem[]) => {
  try {
    sessionStorage.setItem(SESSION_3D_GALLERY_KEY, JSON.stringify(items));
  } catch (e) {
    logger.debug('Failed to save session gallery', { error: (e as Error).message });
  }
};

// Step definitions for the workflow
type WorkflowStep = 'create' | 'preview' | 'generate3d' | 'result';

// Generation type options for 3D
const GENERATE_TYPE_OPTIONS = [
  { 
    value: 'Normal', 
    label: '✨ Full Quality', 
    description: 'HD textures + PBR materials',
    details: 'Best for: Renders, 3D printing, high-quality assets',
    credits: 3
  },
  { 
    value: 'LowPoly', 
    label: '🎮 Game Ready', 
    description: 'Optimized mesh + textures',
    details: 'Best for: Games, VR/AR, real-time apps',
    credits: 3
  },
  { 
    value: 'Geometry', 
    label: '⚪ Shape Only', 
    description: 'Clean mesh, no textures',
    details: 'Best for: Sculpting, custom texturing, CAD',
    credits: 2
  }
];

// Face count presets
const FACE_COUNT_OPTIONS = [
  { value: 100000, label: 'Low (100k)', description: 'Fast, good for web' },
  { value: 300000, label: 'Medium (300k)', description: 'Balanced quality' },
  { value: 500000, label: 'High (500k)', description: 'Detailed model' },
  { value: 1000000, label: 'Ultra (1M)', description: 'Maximum detail' }
];

// Windows 95 style button component
interface Win95ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  primary?: boolean;
}

const Win95Button = memo<Win95ButtonProps>(function Win95Button({ children, onClick, disabled, active, className = '', primary }) {
  const bgColor = primary ? '#2d8a2d' : (active ? WIN95.bgDark : WIN95.buttonFace);
  const textColor = primary ? '#ffffff' : (disabled ? WIN95.textDisabled : (active ? WIN95.highlightText : WIN95.text));
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-[11px] font-bold transition-none select-none ${className}`}
      style={{
        background: bgColor,
        color: textColor,
        border: 'none',
        boxShadow: primary 
          ? `inset 1px 1px 0 #4db84d, inset -1px -1px 0 #1a5c1a, inset 2px 2px 0 #3da83d, inset -2px -2px 0 #206b20`
          : active 
            ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
            : disabled
              ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
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

// Windows 95 style group box with blue title bar
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
      <div className="relative flex-1 p-2">
        {children}
      </div>
    </div>
  );
});

// Collapsible How to Use component
const CollapsibleHowToUse = memo(function CollapsibleHowToUse(): React.ReactElement {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  return (
    <div 
      style={{ 
        background: WIN95.bg,
        margin: '8px 8px 0 8px',
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
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
          <Box className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">3D Character Guide</span>
        </div>
        <ChevronDown 
          className="w-3.5 h-3.5 transition-transform" 
          style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} 
        />
      </button>
      {isExpanded && (
        <div className="p-2 text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {/* Workflow Steps */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>🎯 Workflow</div>
            <div className="space-y-0.5 text-[9px]">
              <div><strong>Step 1:</strong> Generate or upload a character image</div>
              <div><strong>Step 2:</strong> Preview and refine with AI edits</div>
              <div><strong>Step 3:</strong> Convert to 3D model</div>
            </div>
          </div>
          
          {/* Tips */}
          <div className="p-1.5 mb-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>💡 Tips for Best Results</div>
            <div className="space-y-0.5 text-[9px]">
              <div>• Use clear, front-facing character images</div>
              <div>• Single subject works best for 3D</div>
              <div>• Avoid complex backgrounds</div>
              <div>• Higher face count = more detail</div>
            </div>
          </div>
          
          {/* Pricing */}
          <div className="p-1.5" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            <div className="text-[9px] font-bold mb-1" style={{ color: '#000080' }}>💰 Credits</div>
            <div className="flex flex-wrap gap-1">
              <span className="text-[8px] px-1.5 py-0.5" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>🖼️ Image Gen: 1 credit</span>
              <span className="text-[8px] px-1.5 py-0.5" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>📦 3D Model: 3 credits</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// Step indicator component
interface StepIndicatorProps {
  currentStep: WorkflowStep;
  hasImage: boolean;
  has3dModel: boolean;
}

const StepIndicator = memo<StepIndicatorProps>(function StepIndicator({ currentStep, hasImage, has3dModel }) {
  const steps = [
    { id: 'create', label: '1. Create', icon: '🎨' },
    { id: 'preview', label: '2. Preview', icon: '👁️' },
    { id: 'generate3d', label: '3. Convert', icon: '📦' },
    { id: 'result', label: '4. Result', icon: '✅' }
  ];

  const getStepStatus = (stepId: string): 'active' | 'completed' | 'pending' => {
    const stepOrder = ['create', 'preview', 'generate3d', 'result'];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);
    
    if (stepId === currentStep) return 'active';
    if (stepIndex < currentIndex) return 'completed';
    return 'pending';
  };

  return (
    <div className="flex items-center justify-center gap-1 p-1.5" style={{ background: WIN95.bg }}>
      {steps.map((step, index) => {
        const status = getStepStatus(step.id);
        return (
          <React.Fragment key={step.id}>
            <div 
              className="flex items-center gap-1 px-2 py-1"
              style={{
                background: status === 'active' ? '#000080' : (status === 'completed' ? '#2d8a2d' : WIN95.bg),
                color: status === 'active' || status === 'completed' ? '#ffffff' : WIN95.textDisabled,
                boxShadow: status === 'active' 
                  ? `inset 1px 1px 0 #0000a0, inset -1px -1px 0 #000060`
                  : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <span className="text-[9px]">{step.icon}</span>
              <span className="text-[8px] font-bold hidden sm:inline">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="w-3 h-3" style={{ color: WIN95.textDisabled }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
});

interface CharacterGeneratorProps {
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

const CharacterGenerator = memo<CharacterGeneratorProps>(function CharacterGenerator({ onShowTokenPayment, onShowStripePayment }) {
  const emailContext = useEmailAuth();
  const walletContext = useSimpleWallet();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isConnected = isEmailAuth || walletContext.isConnected;
  
  // Workflow state
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('create');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [model3dResult, setModel3dResult] = useState<{
    model_glb?: { url: string };
    thumbnail?: { url: string };
    model_urls?: { glb?: { url: string }; obj?: { url: string }; fbx?: { url: string } };
  } | null>(null);
  
  // Image generation state
  const [prompt, setPrompt] = useState<string>('');
  const [editPrompt, setEditPrompt] = useState<string>('');
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [isUploadedImage, setIsUploadedImage] = useState<boolean>(false); // Track if image was uploaded
  
  // 3D generation state
  const [generateType, setGenerateType] = useState<'Normal' | 'LowPoly' | 'Geometry'>('Normal');
  const [faceCount, setFaceCount] = useState<number>(500000);
  const [enablePbr, setEnablePbr] = useState<boolean>(true);
  const [isGenerating3d, setIsGenerating3d] = useState<boolean>(false);
  
  // General state
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Session gallery for 3D generations
  const [sessionGallery, setSessionGallery] = useState<Session3dItem[]>([]);
  
  // Load session gallery on mount
  useEffect(() => {
    setSessionGallery(loadSessionGallery());
  }, []);

  // Start/stop timer
  const startTimer = useCallback(() => {
    setElapsedTime(0);
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Format elapsed time
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}:${secs.toString().padStart(2, '0')}`;
    return `${secs}s`;
  };

  // Handle file upload
  const handleFileUpload = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file');
      return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setError('Image too large. Maximum size is 10MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setImageUrl(event.target?.result as string);
      setIsUploadedImage(true); // Mark as uploaded image
      setCurrentStep('preview');
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  // Generate image with Nano Banana Pro
  const handleGenerateImage = useCallback(async () => {
    if (!prompt.trim() || !isConnected) return;
    
    setIsGeneratingImage(true);
    setError(null);
    startTimer();

    try {
      const response = await fetch(`${API_URL}/api/generate/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          model: 'nano-banana-pro',
          aspect_ratio: '1:1', // Square works best for 3D
          num_images: 1,
          walletAddress: walletContext.address,
          userId: emailContext.userId,
          email: emailContext.email
        })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Image generation failed');
      }

      const generatedUrl = data.images?.[0] || data.imageUrl;
      if (generatedUrl) {
        setImageUrl(generatedUrl);
        setIsUploadedImage(false); // Mark as generated (already optimized)
        setCurrentStep('preview');
        
        // Refresh credits
        if (isEmailAuth && emailContext.refreshCredits) {
          emailContext.refreshCredits();
        } else if (walletContext.fetchCredits && walletContext.address) {
          walletContext.fetchCredits(walletContext.address, 3, true);
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      logger.error('Image generation failed', { error: error.message });
    } finally {
      setIsGeneratingImage(false);
      stopTimer();
    }
  }, [prompt, isConnected, walletContext, emailContext, isEmailAuth, startTimer, stopTimer]);

  // Edit image with Nano Banana Pro
  const handleEditImage = useCallback(async () => {
    if (!editPrompt.trim() || !imageUrl || !isConnected) return;
    
    setIsEditing(true);
    setError(null);
    startTimer();

    try {
      const response = await fetch(`${API_URL}/api/generate/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editPrompt.trim(),
          model: 'nano-banana-pro',
          image_urls: [imageUrl],
          num_images: 1,
          walletAddress: walletContext.address,
          userId: emailContext.userId,
          email: emailContext.email
        })
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Image editing failed');
      }

      const editedUrl = data.images?.[0] || data.imageUrl;
      if (editedUrl) {
        setImageUrl(editedUrl);
        setEditPrompt('');
        setIsUploadedImage(false); // AI-edited image no longer needs optimization
        
        // Refresh credits
        if (isEmailAuth && emailContext.refreshCredits) {
          emailContext.refreshCredits();
        } else if (walletContext.fetchCredits && walletContext.address) {
          walletContext.fetchCredits(walletContext.address, 3, true);
        }
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      logger.error('Image editing failed', { error: error.message });
    } finally {
      setIsEditing(false);
      stopTimer();
    }
  }, [editPrompt, imageUrl, isConnected, walletContext, emailContext, isEmailAuth, startTimer, stopTimer]);

  // Optimize image for 3D generation using AI (fast optimized version)
  const optimizeImageFor3d = useCallback(async (inputImageUrl: string): Promise<string> => {
    // If already a URL (not data URI), it's already optimized/uploaded - return as-is
    if (!inputImageUrl.startsWith('data:')) {
      logger.info('Image already optimized (URL), skipping optimization');
      return inputImageUrl;
    }

    logger.info('Optimizing image for 3D generation (AI-based, fast mode)');
    
    // Pre-optimize large images: resize to max 1024x1024 before AI processing
    // This reduces upload time and AI processing time significantly
    let preprocessedUrl = inputImageUrl;
    if (inputImageUrl.length > 500000) { // If larger than ~500KB, pre-resize
      logger.info('Pre-resizing large image for faster processing');
      const resizedDataUri = await optimizeImage(inputImageUrl, {
        maxWidth: 1024,
        maxHeight: 1024,
        quality: 0.9,
        format: 'jpeg'
      });
      preprocessedUrl = resizedDataUri;
    }
    
    // Fast AI optimization: use nano-banana-pro with speed optimizations
    // - 1K resolution (faster than higher res) - backend already uses this
    // - Sync endpoint (no queue wait) - already using fal.run
    // - Single image output
    // - Pre-resized input for faster processing
    const optimizationPrompt = 'Clean isolated character on plain white background, centered, front-facing view, clear details, high contrast, suitable for 3D model conversion, no complex background, single subject';
    
    const response = await fetch(`${API_URL}/api/generate/image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: optimizationPrompt,
        model: 'nano-banana-pro',
        image_urls: [preprocessedUrl],
        num_images: 1,
        aspect_ratio: '1:1',
        walletAddress: walletContext.address,
        userId: emailContext.userId,
        email: emailContext.email
      })
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to optimize image for 3D');
    }

    const optimizedUrl = data.images?.[0] || data.imageUrl;
    if (!optimizedUrl) {
      throw new Error('No optimized image returned');
    }

    logger.info('Image optimized for 3D generation');
    return optimizedUrl;
  }, [walletContext.address, emailContext.userId, emailContext.email]);

  // Generate 3D model
  const handleGenerate3d = useCallback(async () => {
    if (!imageUrl || !isConnected) return;
    
    setError(null);
    setCurrentStep('generate3d');
    startTimer();

    let finalImageUrl = imageUrl;

    try {
      // Optimize image before sending to 3D model (fal-ai/hunyuan3d-v3/image-to-3d)
      // Uses AI-based optimization with speed optimizations (1K resolution, sync endpoint)
      setIsOptimizing(true);
      logger.info('Optimizing image for 3D conversion before sending to hunyuan3d-v3/image-to-3d');
      
      try {
        finalImageUrl = await optimizeImageFor3d(imageUrl);
        setImageUrl(finalImageUrl); // Update with optimized image
        setIsUploadedImage(false); // Mark as processed
        
        // Refresh credits after optimization
        if (isEmailAuth && emailContext.refreshCredits) {
          emailContext.refreshCredits();
        } else if (walletContext.fetchCredits && walletContext.address) {
          walletContext.fetchCredits(walletContext.address, 3, true);
        }
      } finally {
        setIsOptimizing(false);
      }
      
      setIsGenerating3d(true);
      
      const result = await generate3dModel({
        input_image_url: finalImageUrl,
        enable_pbr: enablePbr && generateType !== 'Geometry',
        face_count: faceCount,
        generate_type: generateType,
        polygon_type: 'triangle',
        walletAddress: walletContext.address,
        userId: emailContext.userId,
        email: emailContext.email
      });

      logger.info('3D generation result received', {
        success: result.success,
        hasModelGlb: !!result.model_glb?.url,
        hasModelUrlsGlb: !!result.model_urls?.glb?.url,
        hasThumbnail: !!result.thumbnail?.url,
        error: result.error,
        generationId: (result as { generationId?: string }).generationId,
        requestId: (result as { requestId?: string }).requestId
      });

      // Handle 202 Accepted - generation is still processing asynchronously
      if (!result.success && (result as { generationId?: string; requestId?: string }).generationId) {
        const asyncResult = result as { generationId?: string; requestId?: string; message?: string };
        logger.info('3D generation accepted for async processing', {
          generationId: asyncResult.generationId,
          requestId: asyncResult.requestId
        });
        setError('3D generation is taking longer than expected. It will appear in your gallery when complete. You can continue using the app while it processes.');
        setCurrentStep('preview');
        // Refresh credits since they were already deducted
        if (isEmailAuth && emailContext.refreshCredits) {
          emailContext.refreshCredits();
        } else if (walletContext.fetchCredits && walletContext.address) {
          walletContext.fetchCredits(walletContext.address, 3, true);
        }
        return;
      }

      // Check for model URL - treat as success if model exists even if success flag is missing
      const hasModelUrl = result.model_glb?.url || result.model_urls?.glb?.url;
      if (hasModelUrl) {
        // Ensure success is set for downstream code
        const successResult = { ...result, success: true };
        setModel3dResult(successResult);
        setCurrentStep('result');
        
        // Refresh credits
        if (isEmailAuth && emailContext.refreshCredits) {
          emailContext.refreshCredits();
        } else if (walletContext.fetchCredits && walletContext.address) {
          walletContext.fetchCredits(walletContext.address, 3, true);
        }

        // Save to main gallery with 3D model URLs (expires after 1 day)
        const identifier = isEmailAuth ? emailContext.userId : walletContext.address;
        const glbUrl = result.model_glb?.url || result.model_urls?.glb?.url;
        if (identifier && glbUrl) {
          addGeneration(identifier, {
            prompt: prompt || 'Character 3D Model',
            style: `3D ${generateType}`,
            imageUrl: result.thumbnail?.url || finalImageUrl,
            creditsUsed: generateType === 'Geometry' ? 2 : 3,
            userId: isEmailAuth ? emailContext.userId : undefined,
            email: isEmailAuth ? emailContext.email : undefined,
            // 3D model data - saved to gallery for 1 day
            modelType: '3d',
            glbUrl: glbUrl,
            objUrl: result.model_urls?.obj?.url,
            fbxUrl: result.model_urls?.fbx?.url,
            thumbnailUrl: result.thumbnail?.url
          }).then(() => {
            logger.info('3D model saved to gallery (expires in 24h)', { 
              hasGlb: !!glbUrl,
              hasObj: !!result.model_urls?.obj?.url 
            });
          }).catch(e => logger.debug('Gallery save failed', { error: e.message }));
        }
        
        // Save to session gallery for persistence during session
        if (glbUrl) {
          const newSessionItem: Session3dItem = {
            id: `3d-${Date.now()}`,
            timestamp: Date.now(),
            sourceImageUrl: finalImageUrl,
            thumbnailUrl: result.thumbnail?.url || finalImageUrl,
            glbUrl,
            objUrl: result.model_urls?.obj?.url,
            fbxUrl: result.model_urls?.fbx?.url,
            generateType,
            prompt: prompt || undefined
          };
          const updatedGallery = [newSessionItem, ...sessionGallery].slice(0, 10); // Keep last 10
          setSessionGallery(updatedGallery);
          saveSessionGallery(updatedGallery);
        }
      } else {
        logger.error('3D generation returned but no model URL found', { result });
        throw new Error(result.error || '3D generation completed but no model URL was returned. Please try again.');
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message);
      setCurrentStep('preview');
      logger.error('3D generation failed', { error: error.message, stack: error.stack });
    } finally {
      setIsGenerating3d(false);
      stopTimer();
    }
  }, [imageUrl, isConnected, enablePbr, faceCount, generateType, prompt, walletContext, emailContext, isEmailAuth, startTimer, stopTimer, sessionGallery, isUploadedImage, optimizeImageFor3d]);

  // Download 3D model
  const handleDownload = useCallback(async (url: string, format: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `character-model-${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      logger.error('Download failed', { error: (err as Error).message });
    }
  }, []);

  // Reset workflow
  const handleReset = useCallback(() => {
    setCurrentStep('create');
    setImageUrl(null);
    setModel3dResult(null);
    setPrompt('');
    setEditPrompt('');
    setError(null);
    setIsUploadedImage(false);
  }, []);

  // Load a previous generation from session gallery
  const loadFromSessionGallery = useCallback((item: Session3dItem) => {
    setImageUrl(item.sourceImageUrl);
    setModel3dResult({
      model_glb: { url: item.glbUrl },
      thumbnail: { url: item.thumbnailUrl },
      model_urls: {
        glb: { url: item.glbUrl },
        obj: item.objUrl ? { url: item.objUrl } : undefined,
        fbx: item.fbxUrl ? { url: item.fbxUrl } : undefined
      }
    });
    setCurrentStep('result');
    setError(null);
  }, []);

  // Remove item from session gallery
  const removeFromSessionGallery = useCallback((id: string) => {
    const updatedGallery = sessionGallery.filter(item => item.id !== id);
    setSessionGallery(updatedGallery);
    saveSessionGallery(updatedGallery);
  }, [sessionGallery]);

  return (
    <div className="fade-in h-full flex flex-col" style={{ background: '#1a4a5e' }}>
      {/* How to Use Guide */}
      <CollapsibleHowToUse />
      
      {/* Step Indicator */}
      <div className="mx-2 mt-2">
        <StepIndicator 
          currentStep={currentStep} 
          hasImage={!!imageUrl} 
          has3dModel={!!model3dResult} 
        />
      </div>
      
      {/* Main content */}
      <div className="flex-1 min-h-0 p-2 flex flex-col lg:flex-row gap-2 overflow-auto lg:overflow-hidden">
        {/* Left panel - Controls */}
        <div className="lg:w-[45%] flex flex-col gap-2 min-h-0 overflow-auto lg:overflow-hidden">
          {/* Step 1: Create Image */}
          {currentStep === 'create' && (
            <>
              <Win95GroupBox title="Generate Character" className="flex-shrink-0" icon={<Sparkles className="w-3.5 h-3.5" />}>
                <div className="space-y-2">
                  <Win95Panel sunken className="p-0">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="Describe your character: anime girl with blue hair, cyberpunk warrior, cute cat mascot..."
                      className="w-full p-1.5 resize-none text-[10px] focus:outline-none"
                      rows={3}
                      style={{ 
                        background: 'transparent',
                        color: WIN95.text,
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                      }}
                    />
                  </Win95Panel>
                  
                  <Win95Button 
                    onClick={handleGenerateImage}
                    disabled={!prompt.trim() || !isConnected || isGeneratingImage}
                    primary
                    className="w-full py-2"
                  >
                    {isGeneratingImage ? (
                      <>⏳ Generating... ({formatTime(elapsedTime)})</>
                    ) : (
                      <>🎨 Generate Image (1 credit)</>
                    )}
                  </Win95Button>
                </div>
              </Win95GroupBox>

              <Win95GroupBox title="Or Upload Image" className="flex-shrink-0" icon={<Upload className="w-3.5 h-3.5" />}>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center p-4 cursor-pointer"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
                  }}
                >
                  <Upload className="w-8 h-8 mb-2" style={{ color: WIN95.textDisabled }} />
                  <span className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    Click to upload an image
                  </span>
                  <span className="text-[8px] mt-1" style={{ color: WIN95.textDisabled }}>
                    PNG, JPG, WebP (max 10MB)
                  </span>
                </div>
                <input 
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </Win95GroupBox>
            </>
          )}

          {/* Step 2: Preview & Edit */}
          {currentStep === 'preview' && imageUrl && (
            <>
              <Win95GroupBox title="3D Settings" className="flex-shrink-0" icon={<Settings className="w-3.5 h-3.5" />}>
                <div className="space-y-2">
                  {/* Generate Type */}
                  <div>
                    <label className="text-[9px] font-bold mb-1.5 block" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      📦 Output Type
                    </label>
                    <div className="space-y-1">
                      {GENERATE_TYPE_OPTIONS.map((opt) => (
                        <div
                          key={opt.value}
                          onClick={() => setGenerateType(opt.value as 'Normal' | 'LowPoly' | 'Geometry')}
                          className="cursor-pointer p-1.5 flex items-start gap-2"
                          style={{
                            background: generateType === opt.value ? '#000080' : WIN95.inputBg,
                            color: generateType === opt.value ? '#ffffff' : WIN95.text,
                            boxShadow: generateType === opt.value 
                              ? `inset 1px 1px 0 #0000a0, inset -1px -1px 0 #000060`
                              : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                          }}
                        >
                          <div 
                            className="w-3 h-3 mt-0.5 flex-shrink-0 flex items-center justify-center"
                            style={{
                              background: generateType === opt.value ? '#ffffff' : WIN95.bg,
                              border: `1px solid ${generateType === opt.value ? '#ffffff' : WIN95.border.darker}`
                            }}
                          >
                            {generateType === opt.value && (
                              <div className="w-1.5 h-1.5" style={{ background: '#000080' }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold">{opt.label}</span>
                              <span 
                                className="text-[8px] px-1 py-0.5"
                                style={{ 
                                  background: generateType === opt.value ? 'rgba(255,255,255,0.2)' : WIN95.bg,
                                  color: generateType === opt.value ? '#ffffff' : WIN95.textDisabled
                                }}
                              >
                                {opt.credits} credits
                              </span>
                            </div>
                            <div className="text-[8px] opacity-80">{opt.description}</div>
                            <div 
                              className="text-[7px] mt-0.5"
                              style={{ 
                                color: generateType === opt.value ? 'rgba(255,255,255,0.7)' : WIN95.textDisabled 
                              }}
                            >
                              {opt.details}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Face Count */}
                  <div>
                    <label className="text-[9px] font-bold mb-1 block" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      Detail Level
                    </label>
                    <div className="grid grid-cols-2 gap-1">
                      {FACE_COUNT_OPTIONS.map((opt) => (
                        <Win95Button
                          key={opt.value}
                          onClick={() => setFaceCount(opt.value)}
                          active={faceCount === opt.value}
                          className="text-[8px] py-1"
                        >
                          {opt.label}
                        </Win95Button>
                      ))}
                    </div>
                  </div>

                  {/* PBR Toggle */}
                  {generateType !== 'Geometry' && (
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={enablePbr}
                        onChange={(e) => setEnablePbr(e.target.checked)}
                        className="w-3 h-3"
                      />
                      <span className="text-[9px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                        Enable PBR Materials (better lighting)
                      </span>
                    </div>
                  )}
                </div>
              </Win95GroupBox>

              <Win95GroupBox title="Actions" className="flex-shrink-0" icon={<Play className="w-3.5 h-3.5" />}>
                <div className="space-y-2">
                  {/* Selected type summary */}
                  <div 
                    className="p-1.5 text-center"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                  >
                    <span className="text-[9px]" style={{ color: WIN95.text }}>
                      Selected: <strong>{GENERATE_TYPE_OPTIONS.find(o => o.value === generateType)?.label}</strong>
                    </span>
                  </div>
                  
                  {/* Info about optimization for uploaded images */}
                  {isUploadedImage && (
                    <div 
                      className="p-1.5"
                      style={{
                        background: '#ffffcc',
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                      }}
                    >
                      <p className="text-[8px]" style={{ color: '#666600' }}>
                        💡 Your image will be automatically optimized for best 3D results (+1 credit)
                      </p>
                    </div>
                  )}
                  
                  <Win95Button 
                    onClick={handleGenerate3d}
                    disabled={!imageUrl || isGenerating3d || isOptimizing}
                    primary
                    className="w-full py-2"
                  >
                    {isUploadedImage ? (
                      <>📦 Optimize & Convert to 3D ({(GENERATE_TYPE_OPTIONS.find(o => o.value === generateType)?.credits || 3) + 1} credits)</>
                    ) : (
                      <>📦 Convert to 3D Model ({GENERATE_TYPE_OPTIONS.find(o => o.value === generateType)?.credits} credits)</>
                    )}
                  </Win95Button>
                  
                  <div className="flex gap-1">
                    <Win95Button 
                      onClick={() => setCurrentStep('create')}
                      className="flex-1 py-1"
                    >
                      ← Back
                    </Win95Button>
                    <Win95Button 
                      onClick={handleReset}
                      className="flex-1 py-1"
                    >
                      🔄 Start Over
                    </Win95Button>
                  </div>
                </div>
              </Win95GroupBox>
            </>
          )}

          {/* Step 3: Generating 3D */}
          {currentStep === 'generate3d' && (
            <Win95GroupBox 
              title={isOptimizing ? "Optimizing Image" : "Generating 3D Model"} 
              className="flex-1" 
              icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />}
            >
              <div className="flex flex-col items-center justify-center h-full py-8">
                <div 
                  className="w-16 h-16 mb-4 flex items-center justify-center"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                  }}
                >
                  <div className="w-10 h-10 border-3 border-t-transparent rounded-full animate-spin" style={{ borderColor: isOptimizing ? '#2d8a2d' : '#000080', borderTopColor: 'transparent', borderWidth: '3px' }} />
                </div>
                
                <div 
                  className="px-4 py-2 mb-3"
                  style={{
                    background: isOptimizing ? '#2d8a2d' : '#000080',
                    color: '#00ff00',
                    fontFamily: 'Consolas, monospace',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  ⏱️ {formatTime(elapsedTime)}
                </div>
                
                {isOptimizing ? (
                  <>
                    <p className="text-[11px] font-bold text-center" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      🎨 Step 1/2: Optimizing image for 3D...
                    </p>
                    <p className="text-[9px] mt-1 text-center" style={{ color: WIN95.textDisabled }}>
                      Preparing your image for best 3D results
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] font-bold text-center" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      📦 {isUploadedImage ? 'Step 2/2:' : ''} Converting to 3D model...
                    </p>
                    <p className="text-[9px] mt-1 text-center" style={{ color: WIN95.textDisabled }}>
                      This typically takes 1-3 minutes
                    </p>
                  </>
                )}
              </div>
            </Win95GroupBox>
          )}

          {/* Step 4: Result */}
          {currentStep === 'result' && model3dResult && (
            <>
              <Win95GroupBox title="Download 3D Model" className="flex-shrink-0" icon={<Download className="w-3.5 h-3.5" />}>
                <div className="space-y-2">
                  {model3dResult.model_glb?.url && (
                    <Win95Button 
                      onClick={() => handleDownload(model3dResult.model_glb!.url, 'glb')}
                      primary
                      className="w-full py-2"
                    >
                      💾 Download GLB (Universal)
                    </Win95Button>
                  )}
                  
                  {model3dResult.model_urls?.obj?.url && (
                    <Win95Button 
                      onClick={() => handleDownload(model3dResult.model_urls!.obj!.url, 'obj')}
                      className="w-full py-1.5"
                    >
                      📄 Download OBJ
                    </Win95Button>
                  )}
                  
                  {model3dResult.model_urls?.fbx?.url && (
                    <Win95Button 
                      onClick={() => handleDownload(model3dResult.model_urls!.fbx!.url, 'fbx')}
                      className="w-full py-1.5"
                    >
                      🎬 Download FBX
                    </Win95Button>
                  )}
                </div>
              </Win95GroupBox>

              <Win95GroupBox title="What's Next?" className="flex-shrink-0" icon={<Sparkles className="w-3.5 h-3.5" />}>
                <div className="space-y-1.5 text-[9px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <p>Your 3D model is ready! You can:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Import into Blender, Unity, or Unreal</li>
                    <li>Use for game development</li>
                    <li>3D print your character</li>
                    <li>Use in VR/AR applications</li>
                  </ul>
                </div>
                
                <Win95Button 
                  onClick={handleReset}
                  className="w-full py-1.5 mt-2"
                >
                  🎨 Create Another Character
                </Win95Button>
              </Win95GroupBox>
            </>
          )}
          
          {/* Session Gallery - shows previous 3D generations from this session */}
          {sessionGallery.length > 0 && (
            <Win95GroupBox title={`Session History (${sessionGallery.length})`} className="flex-shrink-0" icon={<Clock className="w-3.5 h-3.5" />}>
              <div className="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto">
                {sessionGallery.map((item) => (
                  <div 
                    key={item.id}
                    className="relative group cursor-pointer"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    <img 
                      src={item.thumbnailUrl} 
                      alt="3D Model"
                      className="w-full h-16 object-cover"
                      onClick={() => loadFromSessionGallery(item)}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromSessionGallery(item.id);
                      }}
                      className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{
                        background: '#c0c0c0',
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                        fontSize: '10px',
                        color: WIN95.text
                      }}
                    >
                      ×
                    </button>
                    <div 
                      className="absolute bottom-0 left-0 right-0 text-center py-0.5 text-[7px] opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ 
                        background: 'rgba(0,0,128,0.9)', 
                        color: '#fff',
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                      }}
                    >
                      {item.generateType}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[8px] mt-1 text-center" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                Click to view • Saved for this session
              </p>
            </Win95GroupBox>
          )}
        </div>
        
        {/* Right panel - Preview */}
        <div 
          className="flex-1 flex flex-col min-h-0"
          style={{ 
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
          }}
        >
          {/* Title bar */}
          <div 
            className="flex items-center gap-1.5 px-2 py-1 flex-shrink-0"
            style={{ 
              background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
              color: '#ffffff'
            }}
          >
            {currentStep === 'result' ? (
              <Box className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              {currentStep === 'result' ? '3D Model Preview' : 'Image Preview'}
            </span>
          </div>

          {/* Error banner */}
          {error && (
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

          {/* Edit with AI - shown above preview when in preview step */}
          {currentStep === 'preview' && imageUrl && (
            <div 
              className="flex-shrink-0 p-1.5 mx-1 mt-1"
              style={{ 
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Wand2 className="w-3.5 h-3.5" style={{ color: '#000080' }} />
                <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  ✨ Edit with AI (Optional)
                </span>
              </div>
              <div className="flex gap-1.5">
                <Win95Panel sunken className="flex-1 p-0">
                  <input
                    type="text"
                    value={editPrompt}
                    onChange={(e) => setEditPrompt(e.target.value)}
                    placeholder="Describe changes: add armor, change hair to red..."
                    className="w-full px-1.5 py-1 text-[10px] focus:outline-none"
                    style={{ 
                      background: 'transparent',
                      color: WIN95.text,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && editPrompt.trim() && !isEditing) {
                        handleEditImage();
                      }
                    }}
                  />
                </Win95Panel>
                <Win95Button 
                  onClick={handleEditImage}
                  disabled={!editPrompt.trim() || isEditing}
                  className="px-3 py-1 whitespace-nowrap"
                >
                  {isEditing ? (
                    <>⏳ {formatTime(elapsedTime)}</>
                  ) : (
                    <>Apply (1 cr)</>
                  )}
                </Win95Button>
              </div>
              <p className="text-[8px] mt-1" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                💡 Try: "add wings", "make it anime style", "change background to space"
              </p>
            </div>
          )}

          {/* Preview area */}
          <div className="flex-1 min-h-0 p-1 overflow-hidden" style={{ background: '#c0c0c0' }}>
            <div 
              className="w-full h-full overflow-hidden flex items-center justify-center"
              style={{ 
                background: '#ffffff',
                boxShadow: 'inset 1px 1px 0 #808080, inset -1px -1px 0 #ffffff, inset 2px 2px 0 #404040'
              }}
            >
              {currentStep === 'result' && model3dResult ? (
                <div className="w-full h-full flex flex-col">
                  {/* Interactive 3D Model Viewer */}
                  {(model3dResult.model_glb?.url || model3dResult.model_urls?.glb?.url) ? (
                    <div className="flex-1 relative min-h-[300px]">
                      <model-viewer
                        src={model3dResult.model_glb?.url || model3dResult.model_urls?.glb?.url}
                        alt="3D Character Model"
                        poster={model3dResult.thumbnail?.url}
                        auto-rotate=""
                        camera-controls=""
                        shadow-intensity={1}
                        exposure={0.95}
                        style={{
                          width: '100%',
                          height: '100%',
                          minHeight: '300px',
                          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
                          borderRadius: '0'
                        }}
                      />
                      {/* Overlay instructions */}
                      <div 
                        className="absolute bottom-2 left-2 right-2 text-center py-1 px-2"
                        style={{
                          background: 'rgba(0, 0, 128, 0.85)',
                          color: '#ffffff',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                          fontSize: '9px',
                          boxShadow: `inset 1px 1px 0 rgba(255,255,255,0.2), inset -1px -1px 0 rgba(0,0,0,0.3)`
                        }}
                      >
                        🖱️ Drag to rotate • Scroll to zoom • ✅ Auto-rotating
                      </div>
                    </div>
                  ) : model3dResult.thumbnail?.url ? (
                    <div className="flex-1 flex items-center justify-center p-4">
                      <img 
                        src={model3dResult.thumbnail.url} 
                        alt="3D Model Preview"
                        className="max-w-full max-h-[400px] object-contain"
                        style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <div 
                        className="w-32 h-32 flex items-center justify-center"
                        style={{
                          background: WIN95.inputBg,
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                        }}
                      >
                        <Box className="w-16 h-16" style={{ color: '#000080' }} />
                      </div>
                    </div>
                  )}
                  <div className="text-center p-2 flex-shrink-0" style={{ background: WIN95.bg }}>
                    <p className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      ✅ 3D model generated successfully!
                    </p>
                  </div>
                </div>
              ) : imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="Character Preview"
                  className="max-w-full max-h-full object-contain"
                  style={{ boxShadow: '2px 2px 0 rgba(0,0,0,0.2)' }}
                />
              ) : (
                <div className="text-center p-4">
                  <div 
                    className="w-20 h-20 mb-4 mx-auto flex items-center justify-center"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
                    }}
                  >
                    <Box className="w-10 h-10" style={{ color: WIN95.textDisabled }} />
                  </div>
                  <p className="text-[11px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    Create Your 3D Character
                  </p>
                  <p className="text-[10px] mt-1" style={{ color: WIN95.textDisabled }}>
                    Generate or upload an image to get started
                  </p>
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
            {isGeneratingImage ? '⏳ Generating image...' :
             isEditing ? '⏳ Editing image...' :
             isOptimizing ? '🎨 Optimizing for 3D...' :
             isGenerating3d ? '⏳ Converting to 3D...' :
             error ? '❌ Error' :
             currentStep === 'result' ? '✅ 3D model ready!' :
             imageUrl ? '👁️ Ready to convert' :
             '🎨 Ready to create'}
          </span>
        </div>
      </div>
    </div>
  );
});

export default CharacterGenerator;

