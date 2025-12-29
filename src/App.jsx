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
import { Grid, Sparkles, ChevronDown } from 'lucide-react';
import logger from './utils/logger.js';
import { API_URL } from './utils/apiConfig.js';

// PERFORMANCE: Lazy load heavy modals and gallery - not needed on initial render
const TokenPaymentModal = lazy(() => import('./components/TokenPaymentModal'));
const StripePaymentModal = lazy(() => import('./components/StripePaymentModal'));
const PaymentSuccessModal = lazy(() => import('./components/PaymentSuccessModal'));
const ImageGallery = lazy(() => import('./components/ImageGallery'));

function App() {
  const [activeTab, setActiveTab] = useState('generate');

  const tabs = [
    { id: 'generate', name: 'Generate', icon: Sparkles },
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
    <div className="min-h-screen lg:h-screen animated-bg flex flex-col p-2 lg:p-0" style={{ position: 'relative', zIndex: 0 }}>
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
      
      <main className="flex-1 px-2 py-1 lg:px-0 lg:py-0 overflow-auto lg:overflow-hidden">
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
        {activeTab === 'generate' && <GenerateTab onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
      </AuthGuard>
    </div>
  );
}

// PERFORMANCE: Memoized collapsible component
const CollapsibleHowToUse = memo(function CollapsibleHowToUse() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-none p-1" style={{ background: 'linear-gradient(135deg, #f8fafc, #e2e8f0)', border: '1px solid #cbd5e1', borderTop: 'none' }}>
      <button onClick={() => setIsExpanded(!isExpanded)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3" style={{ color: '#000' }} />
          <span className="text-[10px] font-bold" style={{ color: '#000' }}>How to Use</span>
        </div>
        <ChevronDown className="w-3 h-3" style={{ color: '#000', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
      </button>
      {isExpanded && (
        <div className="mt-1 space-y-1 text-[9px] leading-relaxed" style={{ color: '#1a1a1a' }}>
          {[
            { num: '1', label: 'Text to Image:', desc: 'Type a description, choose a style, and click Generate.' },
            { num: '2', label: 'Reference Edit:', desc: 'Upload 1 image, describe changes, and click Generate.' },
            { num: '3', label: 'Image Blend:', desc: 'Upload 2+ images with FLUX or Nano Banana Pro.' },
            { num: '4', label: 'Layer Extract:', desc: 'Upload image, select Qwen, click "Extract Layers".' }
          ].map((item) => (
            <div key={item.num} className="flex items-start gap-1">
              <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center rounded text-[8px] font-bold" style={{ 
                background: '#e2e8f0',
                border: '1px solid #cbd5e1',
                color: '#000'
              }}>{item.num}</span>
              <span><strong>{item.label}</strong> {item.desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

const GenerateTab = memo(function GenerateTab({ onShowTokenPayment, onShowStripePayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const emailContext = useEmailAuth();
  const { controlNetImage, multiImageModel } = useImageGenerator();
  
  const hasReferenceImages = !!controlNetImage;
  const isQwenSelected = multiImageModel === 'qwen-image-layered';
  const isEmailAuth = emailContext.isAuthenticated;

  return (
    <div className="fade-in h-full flex flex-col">
      {/* User Info - Email or Wallet */}
      <div className="flex-shrink-0 glass-card rounded-t p-0.5">
        {isEmailAuth ? (
          <EmailUserInfo onShowStripePayment={onShowStripePayment} />
        ) : (
          <SimpleWalletConnect />
        )}
      </div>

      {/* Main Content - Constrained height with bottom space on desktop, scrollable on mobile */}
      <div className="flex-1 min-h-0 flex flex-col pb-4 lg:pb-3">
        {/* Main Generation Area - Two Columns on desktop (60/40 split), stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-0" style={{ maxHeight: 'none' }}>
          {/* Left Column: Input Section */}
          <div className="flex flex-col" style={{ animationDelay: '100ms' }}>
            {/* Content area */}
            <div className="lg:overflow-x-visible">
            {/* How to Use - Collapsible and Compact */}
            <CollapsibleHowToUse />
            
            {/* When reference image exists, show it first */}
            {hasReferenceImages && (
              <div key="reference-image-section-active" className="note-amber rounded-none p-1" style={{ borderTop: 'none' }}>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold" style={{ color: '#92400e' }}>🖼️ Reference</span>
                </div>
                <div className="h-[55px] overflow-hidden rounded mt-0.5" style={{ background: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(217,119,6,0.3)' }}>
                  <ReferenceImageInput />
                </div>
              </div>
            )}

            {/* Prompt Input */}
            {!isQwenSelected && (
              <div key={hasReferenceImages ? 'prompt-below-image' : 'prompt-primary'} className="note-teal rounded-none p-1" style={{ borderTop: 'none' }}>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold" style={{ color: '#00695c' }}>{hasReferenceImages ? '✏️ Changes' : '✨ Prompt'}</span>
                </div>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={hasReferenceImages ? "Describe changes..." : "Describe your image..."}
                  className="w-full p-1 rounded resize-none text-[10px] win95-input mt-0.5"
                  rows={3}
                />
              </div>
            )}

            {/* Reference Image Input - Only shown when NO reference image */}
            {!hasReferenceImages && (
              <div key="reference-image-section-empty" className="note-amber rounded-none p-1" style={{ borderTop: 'none' }}>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold" style={{ color: '#92400e' }}>🖼️ Reference (optional)</span>
                </div>
                <div className="h-[50px] overflow-hidden rounded mt-0.5" style={{ background: 'rgba(255,255,255,0.5)', border: '1px dashed rgba(217,119,6,0.3)' }}>
                  <ReferenceImageInput />
                </div>
              </div>
            )}

            {/* Model Selection */}
            {(!hasReferenceImages && !isQwenSelected) || hasReferenceImages ? (
              <div className="glass-card rounded-none p-1" style={{ borderTop: 'none' }}>
                <MultiImageModelSelector customPrompt={customPrompt} />
              </div>
            ) : null}

            {/* AI Prompt Reasoning Toggle */}
            <div className="glass-card rounded-none p-1" style={{ borderTop: 'none' }}>
              <PromptOptimizer />
            </div>

            {/* Style Selection */}
            {!isQwenSelected && (
              <div className="note-slate rounded-none p-1 relative lg:overflow-visible" style={{ borderTop: 'none' }}>
                <StyleSelector openUpward={true} />
              </div>
            )}
            
            {/* Generate Button - Moved up, between style and bottom */}
            <div className="flex-shrink-0 rounded-none lg:rounded-b p-1 mt-1 lg:mt-0" style={{ 
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)',
              border: '2px solid #10b981',
              borderTop: 'none'
            }}>
              <GenerateButton 
                customPrompt={customPrompt}
                onShowTokenPayment={onShowTokenPayment}
              />
            </div>
            </div>
          </div>

          {/* Right Column: Output Section - Aligned with generate button */}
          <div className="flex flex-col mt-2 lg:mt-0">
            <div className="note-blue rounded-none p-1 flex flex-col flex-1" style={{ borderLeft: 'none' }}>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] font-bold" style={{ color: '#1e40af' }}>🎨 Output</span>
              </div>
              <div className="flex flex-col overflow-hidden mt-0.5 flex-1" style={{ background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '2px', minHeight: '180px' }}>
                <ImageOutput />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// PERFORMANCE: Memoized gallery tab with lazy loading
const GalleryTab = memo(() => (
  <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" /></div>}>
    <div className="h-full overflow-auto"><ImageGallery /></div>
  </Suspense>
));

export default App;
