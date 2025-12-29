import React, { useState, useEffect, useCallback, lazy, Suspense, memo } from 'react';
import { ImageGeneratorProvider, useImageGenerator } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider, useSimpleWallet } from './contexts/SimpleWalletContext';
import { EmailAuthProvider, useEmailAuth } from './contexts/EmailAuthContext';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import MultiImageModelSelector from './components/MultiImageModelSelector';
import PromptOptimizer from './components/PromptOptimizer';
import EmailUserInfo from './components/EmailUserInfo';
import AuthGuard from './components/AuthGuard';
import GenerateButton from './components/GenerateButton';
import { Grid, Sparkles, Film, Music, Wand2, Layers, Pencil } from 'lucide-react';
import logger from './utils/logger.js';
import { API_URL } from './utils/apiConfig.js';
import { WIN95, BTN, PANEL, TITLEBAR, TEXT, INPUT } from './utils/buttonStyles.js';

// PERFORMANCE: Lazy load heavy modals and gallery - not needed on initial render
const TokenPaymentModal = lazy(() => import('./components/TokenPaymentModal'));
const StripePaymentModal = lazy(() => import('./components/StripePaymentModal'));
const PaymentSuccessModal = lazy(() => import('./components/PaymentSuccessModal'));
const ImageGallery = lazy(() => import('./components/ImageGallery'));
const VideoGenerator = lazy(() => import('./components/VideoGenerator'));
const MusicGenerator = lazy(() => import('./components/MusicGenerator'));

// Windows 95 style button component
const Win95Button = memo(function Win95Button({ children, onClick, disabled, active, className = '', style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 text-[11px] font-bold transition-none select-none ${className}`}
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
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        ...style
      }}
    >
      {children}
    </button>
  );
});

// Windows 95 style panel (sunken)
const Win95Panel = memo(function Win95Panel({ children, className = '', sunken = true, style = {} }) {
  return (
    <div
      className={className}
      style={{
        background: sunken ? WIN95.inputBg : WIN95.bg,
        boxShadow: sunken
          ? `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
        ...style
      }}
    >
      {children}
    </div>
  );
});

// Windows 95 style group box
const Win95GroupBox = memo(function Win95GroupBox({ title, children, className = '', titleColor = WIN95.text }) {
  return (
    <div className={`relative ${className}`} style={{ padding: '14px 8px 8px 8px' }}>
      <div 
        className="absolute inset-0"
        style={{
          border: `1px solid ${WIN95.bgDark}`,
          borderTopColor: WIN95.border.light,
          borderLeftColor: WIN95.border.light,
          margin: '7px 0 0 0'
        }}
      />
      <div 
        className="absolute inset-0"
        style={{
          border: `1px solid ${WIN95.border.light}`,
          borderTopColor: WIN95.bgDark,
          borderLeftColor: WIN95.bgDark,
          margin: '8px 1px 1px 1px'
        }}
      />
      <span 
        className="absolute text-[11px] font-bold px-1"
        style={{ 
          top: 0, 
          left: 8, 
          background: WIN95.bg,
          color: titleColor,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        {title}
      </span>
      <div className="relative">{children}</div>
    </div>
  );
});

function App() {
  const [activeTab, setActiveTab] = useState('create');

  const tabs = [
    { id: 'create', name: 'Create', icon: Sparkles },
    { id: 'gallery', name: 'Gallery', icon: Grid }
  ];

  return (
    <SimpleWalletProvider>
      <EmailAuthProvider>
        <ImageGeneratorProvider>
          <AppWithCreditsCheck 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            tabs={tabs}
          />
        </ImageGeneratorProvider>
      </EmailAuthProvider>
    </SimpleWalletProvider>
  );
}

function AppWithCreditsCheck({ activeTab, setActiveTab, tabs }) {
  const { isConnected } = useSimpleWallet();
  const { isAuthenticated, userId, refreshCredits } = useEmailAuth();
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);
  const [currentTab, setCurrentTab] = useState(activeTab);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(null);

  // Handle subscription verification from Stripe checkout redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    const cleanupUrl = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (sessionId) {
      const verifySubscription = async () => {
        try {
          const body = { sessionId };
          if (userId) {
            body.userId = userId;
          }

          const headers = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('authToken');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(`${API_URL}/api/subscription/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to verify subscription payment');
          }

          // Show success modal
          setSubscriptionSuccess({
            sessionId,
            planName: data.planName || 'Subscription',
            planPrice: data.planPrice || (data.amount ? `$${data.amount}/month` : 'Activated'),
            credits: data.credits
          });

          // Refresh credits
          if (refreshCredits) {
            setTimeout(() => refreshCredits(), 1000);
          }

          logger.info('Subscription verified successfully', { 
            sessionId, 
            credits: data.credits, 
            planName: data.planName 
          });
        } catch (error) {
          logger.error('Subscription verification failed:', { error: error.message });
          // Still show some feedback even on error
          setSubscriptionSuccess({
            sessionId,
            planName: 'Subscription',
            planPrice: 'Processing...',
            error: error.message
          });
        } finally {
          cleanupUrl();
        }
      };

      verifySubscription();
    } else if (canceled) {
      logger.info('Subscription checkout was canceled');
      cleanupUrl();
    }
  }, [userId, refreshCredits]);

  const handleShowTokenPayment = useCallback(() => {
    setShowTokenPaymentModal(true);
  }, []);

  const handleShowStripePayment = useCallback(() => {
    setShowStripePaymentModal(true);
  }, []);

  return (
    <div className="min-h-screen lg:h-screen flex flex-col" style={{ background: WIN95.bg, position: 'relative', zIndex: 0 }}>
      <Navigation 
        activeTab={currentTab} 
        setActiveTab={(tab) => {
          setCurrentTab(tab);
          setActiveTab(tab);
        }}
        tabs={tabs}
        onShowTokenPayment={handleShowTokenPayment}
        onShowStripePayment={handleShowStripePayment}
      />
      
      <main className="flex-1 px-1 py-1 lg:px-2 lg:py-1 overflow-auto lg:overflow-hidden">
        <div className="fade-in h-full">
          <AppContent 
            activeTab={currentTab} 
            onShowTokenPayment={handleShowTokenPayment}
            onShowStripePayment={handleShowStripePayment}
          />
        </div>
      </main>
      
      {/* PERFORMANCE: Lazy loaded modals with Suspense */}
      <Suspense fallback={null}>
        {showTokenPaymentModal && (
          <TokenPaymentModal 
            isOpen={showTokenPaymentModal} 
            onClose={() => setShowTokenPaymentModal(false)} 
          />
        )}
        
        {showStripePaymentModal && (
          <StripePaymentModal 
            isOpen={showStripePaymentModal} 
            onClose={() => setShowStripePaymentModal(false)} 
          />
        )}

        {subscriptionSuccess && (
          <PaymentSuccessModal
            isOpen={!!subscriptionSuccess}
            onClose={() => setSubscriptionSuccess(null)}
            planName={subscriptionSuccess.planName}
            planPrice={subscriptionSuccess.planPrice}
            sessionId={subscriptionSuccess.sessionId}
          />
        )}
      </Suspense>
    </div>
  );
}

function AppContent({ activeTab, onShowTokenPayment, onShowStripePayment }) {
  return (
    <div className="h-full">
      <AuthGuard requireCredits={false}>
        {activeTab === 'create' && <CreateTab onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
      </AuthGuard>
    </div>
  );
}

// Creation mode definitions
const CREATE_MODES = [
  { id: 'generate', name: 'Generate', icon: Wand2, color: '#008080', description: 'Text to Image' },
  { id: 'edit', name: 'Edit', icon: Pencil, color: '#808000', description: 'Modify images' },
  { id: 'extract', name: 'Extract', icon: Layers, color: '#800080', description: 'Layer separation' },
  { id: 'video', name: 'Video', icon: Film, color: '#000080', description: 'Frame animation' },
  { id: 'music', name: 'Music', icon: Music, color: '#008000', description: 'AI music' }
];

// Mode selector component
const ModeSelector = memo(function ModeSelector({ activeMode, setActiveMode }) {
  return (
    <div className="flex flex-wrap gap-1 p-1" style={{ background: WIN95.bg }}>
      {CREATE_MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = activeMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className="flex items-center gap-1.5 px-2 py-1.5 text-[10px] font-bold transition-none"
            style={{
              background: isActive ? mode.color : WIN95.buttonFace,
              color: isActive ? '#ffffff' : WIN95.text,
              boxShadow: isActive 
                ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              cursor: 'pointer'
            }}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{mode.name}</span>
          </button>
        );
      })}
    </div>
  );
});

// Unified Create Tab with mode selection
const CreateTab = memo(function CreateTab({ onShowTokenPayment, onShowStripePayment }) {
  const [activeMode, setActiveMode] = useState('generate');
  const emailContext = useEmailAuth();
  const isEmailAuth = emailContext.isAuthenticated;
  
  const currentMode = CREATE_MODES.find(m => m.id === activeMode);

  return (
    <div className="fade-in h-full flex flex-col" style={{ background: WIN95.bg }}>
      {/* Title bar */}
      <div 
        className="flex items-center gap-2 px-2 py-1"
        style={{ 
          background: `linear-gradient(90deg, ${currentMode?.color || '#000080'}, #1084d0)`,
          color: '#ffffff',
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        {currentMode && <currentMode.icon className="w-4 h-4" />}
        <span className="text-[11px] font-bold">Seiso Studio v1.0 - {currentMode?.name || 'Create'}</span>
        <span className="text-[9px] ml-auto opacity-80">{currentMode?.description}</span>
      </div>

      {/* Mode Selection Toolbar */}
      <ModeSelector activeMode={activeMode} setActiveMode={setActiveMode} />
      
      {/* User Info - Email or Wallet */}
      <div className="flex-shrink-0 px-2 py-1" style={{ background: WIN95.bg, borderBottom: `1px solid ${WIN95.bgDark}` }}>
        {isEmailAuth ? (
          <EmailUserInfo onShowStripePayment={onShowStripePayment} />
        ) : (
          <SimpleWalletConnect />
        )}
      </div>

      {/* Content based on mode */}
      <div className="flex-1 min-h-0 overflow-auto">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full" style={{ background: WIN95.bg }}>
            <div className="text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading...</div>
          </div>
        }>
          {(activeMode === 'generate' || activeMode === 'edit' || activeMode === 'extract') && (
            <ImageModeContent 
              mode={activeMode} 
              onShowTokenPayment={onShowTokenPayment} 
              onShowStripePayment={onShowStripePayment} 
            />
          )}
          {activeMode === 'video' && (
            <VideoGenerator onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />
          )}
          {activeMode === 'music' && (
            <MusicGenerator onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />
          )}
        </Suspense>
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
          Ready
        </Win95Panel>
        <Win95Panel sunken className="px-2 py-0.5 ml-1">
          Mode: {currentMode?.name}
        </Win95Panel>
      </div>
    </div>
  );
});

// Image mode content (Generate, Edit, Extract)
const ImageModeContent = memo(function ImageModeContent({ mode, onShowTokenPayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const { controlNetImage, multiImageModel, setMultiImageModel } = useImageGenerator();
  
  // Set mode-appropriate model on mode change
  useEffect(() => {
    if (mode === 'extract') {
      setMultiImageModel('qwen-image-layered');
    } else if (mode === 'edit' && !controlNetImage) {
      // For edit mode, user needs to upload a reference image
    } else if (mode === 'generate') {
      // Clear reference if in pure generate mode
      if (multiImageModel === 'qwen-image-layered') {
        setMultiImageModel('flux-schnell');
      }
    }
  }, [mode, setMultiImageModel, controlNetImage, multiImageModel]);

  const hasReferenceImages = !!controlNetImage;
  const isQwenSelected = multiImageModel === 'qwen-image-layered';
  const showPrompt = mode !== 'extract';
  const showReference = mode === 'edit' || mode === 'extract' || hasReferenceImages;
  const showStyle = mode !== 'extract';

  return (
    <div className="h-full p-2 flex flex-col lg:flex-row gap-2">
      {/* Left Column: Input Section */}
      <div className="flex-1 flex flex-col gap-2">
        {/* Mode-specific instructions */}
        <Win95GroupBox title={`📋 ${mode === 'generate' ? 'Text to Image' : mode === 'edit' ? 'Edit Image' : 'Extract Layers'}`} titleColor={mode === 'generate' ? '#008080' : mode === 'edit' ? '#808000' : '#800080'}>
          <div className="text-[10px] p-1" style={{ background: WIN95.bgLight, color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            {mode === 'generate' && '✨ Describe your image in detail. Add style, lighting, mood, and composition for best results.'}
            {mode === 'edit' && '✏️ Upload a reference image, then describe the changes you want to make.'}
            {mode === 'extract' && '📊 Upload an image to extract layers. AI will separate foreground, background, and objects.'}
          </div>
        </Win95GroupBox>

        {/* Reference Image - shown for edit/extract modes or when exists */}
        {showReference && (
          <Win95GroupBox title={mode === 'extract' ? '📤 Upload Image' : '🖼️ Reference Image'} titleColor="#808000">
            <div className="h-[80px] overflow-hidden">
              <ReferenceImageInput />
            </div>
          </Win95GroupBox>
        )}

        {/* Prompt Input - not for extract mode */}
        {showPrompt && (
          <Win95GroupBox title={mode === 'edit' ? '✏️ Describe Changes' : '✨ Prompt'} titleColor="#008080">
            <Win95Panel sunken className="p-0">
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder={mode === 'edit' ? "Describe the changes you want to make..." : "Describe your image in detail..."}
                className="w-full p-2 resize-none text-[11px] focus:outline-none"
                rows={3}
                style={{ 
                  background: 'transparent',
                  color: WIN95.text,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              />
            </Win95Panel>
          </Win95GroupBox>
        )}

        {/* Model Selection - not for extract mode */}
        {mode !== 'extract' && (
          <Win95GroupBox title="🔧 Model" titleColor="#000080">
            <MultiImageModelSelector customPrompt={customPrompt} />
          </Win95GroupBox>
        )}

        {/* AI Prompt Reasoning Toggle - not for extract mode */}
        {mode !== 'extract' && (
          <Win95GroupBox title="🧠 AI Reasoning" titleColor="#800080">
            <PromptOptimizer />
          </Win95GroupBox>
        )}

        {/* Style Selection - not for extract mode */}
        {showStyle && (
          <Win95GroupBox title="🎨 Style" titleColor="#008000">
            <StyleSelector openUpward={true} />
          </Win95GroupBox>
        )}
        
        {/* Generate Button */}
        <Win95GroupBox title="▶ Generate" titleColor="#008000">
          <GenerateButton 
            customPrompt={customPrompt}
            onShowTokenPayment={onShowTokenPayment}
          />
        </Win95GroupBox>
      </div>

      {/* Right Column: Output Section */}
      <div className="flex-1 flex flex-col">
        <Win95GroupBox title="🎨 Output" titleColor="#000080" className="flex-1 flex flex-col">
          <Win95Panel sunken className="flex-1 overflow-hidden" style={{ minHeight: '200px' }}>
            <ImageOutput />
          </Win95Panel>
        </Win95GroupBox>
      </div>
    </div>
  );
});

// PERFORMANCE: Memoized gallery tab with lazy loading
const GalleryTab = memo(() => (
  <Suspense fallback={
    <div className="flex items-center justify-center h-full" style={{ background: WIN95.bg }}>
      <div className="text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading...</div>
    </div>
  }>
    <div className="h-full overflow-auto" style={{ background: WIN95.bg }}><ImageGallery /></div>
  </Suspense>
));


export default App;
