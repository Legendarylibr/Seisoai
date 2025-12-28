import React, { useState, useEffect, useCallback } from 'react';
import { ImageGeneratorProvider, useImageGenerator } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider, useSimpleWallet } from './contexts/SimpleWalletContext';
import { EmailAuthProvider, useEmailAuth } from './contexts/EmailAuthContext';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import MultiImageModelSelector from './components/MultiImageModelSelector';
import TokenPaymentModal from './components/TokenPaymentModal';
import StripePaymentModal from './components/StripePaymentModal';
import PaymentSuccessModal from './components/PaymentSuccessModal';
import EmailUserInfo from './components/EmailUserInfo';
import AuthGuard from './components/AuthGuard';
import ImageGallery from './components/ImageGallery';
import GenerateButton from './components/GenerateButton';
import { Grid, Sparkles, Image, ChevronDown, ChevronUp } from 'lucide-react';
import logger from './utils/logger.js';
import { API_URL } from './utils/apiConfig.js';

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
    <div className="min-h-screen animated-bg" style={{ position: 'relative', zIndex: 0 }}>
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
      
      <main className="container mx-auto px-3 md:px-6 lg:px-4 py-1.5 md:py-2 lg:py-1.5">
        <div className="fade-in">
          <AppContent 
            activeTab={currentTab} 
            onShowTokenPayment={handleShowTokenPayment}
            onShowStripePayment={handleShowStripePayment}
          />
        </div>
      </main>
      
      <TokenPaymentModal 
        isOpen={showTokenPaymentModal} 
        onClose={() => {
          setShowTokenPaymentModal(false);
        }} 
      />
      
      <StripePaymentModal 
        isOpen={showStripePaymentModal} 
        onClose={() => setShowStripePaymentModal(false)} 
      />

      {/* Subscription Success Modal */}
      {subscriptionSuccess && (
        <PaymentSuccessModal
          isOpen={!!subscriptionSuccess}
          onClose={() => setSubscriptionSuccess(null)}
          planName={subscriptionSuccess.planName}
          planPrice={subscriptionSuccess.planPrice}
          sessionId={subscriptionSuccess.sessionId}
        />
      )}
    </div>
  );
}

function AppContent({ activeTab, onShowTokenPayment, onShowStripePayment }) {
  // Allow UI access without authentication - users can see the interface and try to generate
  // Authentication will be prompted when they try to generate if needed
  // New users get 2 credits when they sign up, so we allow them to see the UI
  return (
    <AuthGuard requireCredits={false}>
      {activeTab === 'generate' && <GenerateTab onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />}
      {activeTab === 'gallery' && <GalleryTab />}
    </AuthGuard>
  );
}

// Collapsible How to Use Component
function CollapsibleHowToUse() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-lg lg:rounded-tl-xl lg:rounded-tr-none p-1 lg:p-1.5 rounded-b-none relative overflow-hidden transition-all duration-300" style={{ 
      background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 50%, #e2e8f0 100%)',
      border: '2px outset #cbd5e1',
      borderBottom: 'none',
      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.9), inset -2px 0 0 rgba(0, 0, 0, 0.1), 0 3px 8px rgba(0, 0, 0, 0.1)'
    }}>
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 6px)'
      }}></div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2 relative z-10 group"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded flex-shrink-0 transition-all duration-200 group-hover:scale-110" style={{ 
            background: 'linear-gradient(135deg, #f8f8f8, #e8e8e8, #d8d8d8)',
            border: '2px outset #f0f0f0',
            boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.15)'
          }}>
            <Sparkles className="w-3.5 h-3.5" style={{ color: '#000000' }} />
          </div>
          <h3 className="text-xs font-bold tracking-wide" style={{ 
            color: '#000000', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.9)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>How to Use</h3>
        </div>
        <div className="p-0.5 rounded transition-transform duration-200" style={{
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
        }}>
          <ChevronDown className="w-4 h-4" style={{ color: '#000000' }} />
        </div>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[500px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}`}>
        <div className="space-y-1.5 text-xs leading-relaxed relative z-10" style={{ color: '#000000' }}>
          {[
            { num: '1', label: 'Text to Image:', desc: 'Type a description, choose a style, and click Generate.' },
            { num: '2', label: 'Reference Edit:', desc: 'Upload 1 image, describe changes, and click Generate.' },
            { num: '3', label: 'Image Blend:', desc: 'Upload 2+ images with FLUX or Nano Banana Pro.' },
            { num: '4', label: 'Layer Extract:', desc: 'Upload image, select Qwen, click "Extract Layers".' }
          ].map((item, index) => (
            <div key={item.num} className="flex items-start gap-2 p-1 rounded transition-colors hover:bg-white/30" style={{ animationDelay: `${index * 50}ms` }}>
              <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded text-[10px] font-bold" style={{ 
                background: 'linear-gradient(135deg, #f0f0f0, #d8d8d8)',
                border: '1px solid #c0c0c0',
                color: '#000000'
              }}>{item.num}</span>
              <span style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.7)' }}>
                <strong style={{ color: '#000000' }}>{item.label}</strong> {item.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function GenerateTab({ onShowTokenPayment, onShowStripePayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const emailContext = useEmailAuth();
  const { controlNetImage, multiImageModel } = useImageGenerator();
  
  const hasReferenceImages = !!controlNetImage;
  const isQwenSelected = multiImageModel === 'qwen-image-layered';
  const isEmailAuth = emailContext.isAuthenticated;

  return (
    <div className="fade-in">
      {/* Top Row - Header and User Info - Compact */}
      <div className="mb-0.5 lg:mb-1">
          {/* Compact Header with Neon Effect */}
          <div className="text-center py-1 lg:py-1.5 mb-0.5 lg:mb-1 relative">
            {/* Decorative pixel corners */}
            <div className="absolute top-0 left-0 w-3 h-3 opacity-60" style={{
              background: 'linear-gradient(90deg, #00b8a9 33%, transparent 33%), linear-gradient(180deg, #00b8a9 33%, transparent 33%)',
              backgroundSize: '3px 3px'
            }}></div>
            <div className="absolute top-0 right-0 w-3 h-3 opacity-60" style={{
              background: 'linear-gradient(270deg, #f59e0b 33%, transparent 33%), linear-gradient(180deg, #f59e0b 33%, transparent 33%)',
              backgroundSize: '3px 3px'
            }}></div>
            <h1 className="hero-title text-xl md:text-2xl lg:text-xl font-bold mb-0.5" style={{ 
              fontFamily: "'VT323', monospace",
              letterSpacing: '0.08em'
            }}>SEISO AI</h1>
            <p className="text-[10px] md:text-xs lg:text-[10px] tracking-wide" style={{ 
              color: '#ffffff', 
              textShadow: '0 0 8px rgba(0, 184, 169, 0.6), 2px 2px 0 rgba(0, 0, 0, 0.8), 1px 1px 2px rgba(0, 0, 0, 0.9)',
              fontFamily: "'IBM Plex Mono', monospace"
            }}>Generate • Edit • Extract Layers</p>
          </div>

        {/* User Info - Email or Wallet */}
        <div className="glass-card rounded-lg p-0.5 lg:p-1 mb-0.5 lg:mb-1 slide-up">
          {isEmailAuth ? (
            <EmailUserInfo onShowStripePayment={onShowStripePayment} />
          ) : (
            <SimpleWalletConnect />
          )}
        </div>

      </div>

      {/* Main Content - Improved User Flow Layout */}
      <div>
        {/* Main Generation Area - Balanced Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-1 lg:gap-1 lg:items-stretch">
          {/* Left Column: Input Section - Optimized Flow */}
          <div className="slide-up flex flex-col" style={{ animationDelay: '100ms' }}>
            {/* How to Use - Collapsible and Compact */}
            <CollapsibleHowToUse />
            
            {/* When reference image exists, show it first (shifted up) */}
            {hasReferenceImages && (
              <div 
                key="reference-image-section-active"
                className="note-amber rounded-lg lg:rounded-tl-xl lg:rounded-tr-none p-2 lg:p-2.5 rounded-b-none animate-slide-up"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg icon-box-amber">
                    <Image className="w-4 h-4" style={{ color: '#d97706' }} />
                  </div>
                  <div>
                    <h2 className="section-title text-sm md:text-base" style={{ color: '#92400e' }}>
                      🖼️ Reference Image
                    </h2>
                    <p className="text-[10px] leading-tight" style={{ color: '#b45309' }}>
                      <strong>1:</strong> edit • <strong>2+:</strong> blend
                    </p>
                  </div>
                </div>
                <div className="h-[160px] md:h-[190px] lg:h-[150px] overflow-hidden rounded-lg" style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '2px dashed rgba(217, 119, 6, 0.3)'
                }}>
                  <ReferenceImageInput />
                </div>
              </div>
            )}

            {/* Prompt Input - Primary when no reference, Secondary (below) when reference exists */}
            {!isQwenSelected && (
              <div 
                key={hasReferenceImages ? 'prompt-below-image' : 'prompt-primary'}
                className={`note-teal rounded-lg p-2 lg:p-2.5 transition-all duration-300 ${
                  hasReferenceImages 
                    ? 'rounded-t-none animate-slide-down' 
                    : 'lg:rounded-tl-xl lg:rounded-tr-none rounded-b-none'
                }`} 
                style={hasReferenceImages ? { borderTop: 'none', marginTop: '-2px' } : {}}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg icon-box-teal">
                    <Sparkles className="w-4 h-4" style={{ color: '#009688' }} />
                  </div>
                  <div>
                    <h2 className="section-title text-sm md:text-base" style={{ color: '#00695c' }}>
                      {hasReferenceImages ? '✏️ Describe Changes' : '✨ Prompt'}
                    </h2>
                    {hasReferenceImages && (
                      <p className="text-[10px] leading-tight" style={{ color: '#00897b', fontStyle: 'italic' }}>Optional - describe what to change</p>
                    )}
                  </div>
                </div>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={
                    hasReferenceImages 
                      ? "e.g., 'make it more vibrant', 'add sunset colors'..." 
                      : "Describe your image... e.g., 'a futuristic city at sunset with neon lights'"
                  }
                  className="w-full p-2 lg:p-2.5 rounded-lg resize-none text-sm transition-all duration-300 win95-input"
                  rows={3}
                />
                {!hasReferenceImages && (
                  <p className="text-[10px] mt-1.5 leading-tight" style={{ color: '#00695c' }}>
                    💡 Be specific with colors, mood, and style for best results
                  </p>
                )}
              </div>
            )}

            {/* Reference Image Input - Only shown here when NO reference image (upload prompt) */}
            {!hasReferenceImages && (
              <div 
                key="reference-image-section-empty"
                className="note-amber rounded-lg p-2 lg:p-2.5 rounded-t-none" 
                style={{ borderTop: 'none', marginTop: '-2px' }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 rounded-lg icon-box-amber">
                    <Image className="w-4 h-4" style={{ color: '#d97706' }} />
                  </div>
                  <div>
                    <h2 className="section-title text-sm md:text-base" style={{ color: '#92400e' }}>
                      🖼️ Reference Image
                    </h2>
                    <p className="text-[10px] leading-tight" style={{ color: '#b45309' }}>
                      <strong>0:</strong> generate new • <strong>1:</strong> edit • <strong>2+:</strong> blend
                    </p>
                  </div>
                </div>
                <div className="h-[160px] md:h-[190px] lg:h-[150px] overflow-hidden rounded-lg" style={{
                  background: 'rgba(255, 255, 255, 0.5)',
                  border: '2px dashed rgba(217, 119, 6, 0.3)'
                }}>
                  <ReferenceImageInput />
                </div>
              </div>
            )}

            {/* Model Selection */}
            {(!hasReferenceImages && !isQwenSelected) || hasReferenceImages ? (
              <div 
                className="glass-card rounded-lg p-2 lg:p-2.5 rounded-t-none" 
                style={{ borderTop: 'none', marginTop: '-2px' }}
              >
                <MultiImageModelSelector customPrompt={customPrompt} />
              </div>
            ) : null}

            {/* Style Selection */}
            {!isQwenSelected && (
              <div 
                className="note-slate rounded-lg p-2 lg:p-2.5 rounded-t-none" 
                style={{ borderTop: 'none', marginTop: '-2px' }}
              >
                <StyleSelector />
              </div>
            )}

            {/* Generate Button */}
            <div className="rounded-lg lg:rounded-bl-xl p-2 lg:p-2.5 rounded-t-none" style={{ 
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 50%, #a7f3d0 100%)',
              border: '2px solid #10b981',
              borderTop: 'none',
              marginTop: '-2px',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.9), 0 4px 12px rgba(16, 185, 129, 0.2)'
            }}>
              <GenerateButton 
                customPrompt={customPrompt}
                onShowTokenPayment={onShowTokenPayment}
              />
            </div>
          </div>

          {/* Right Column: Output Section */}
          <div className="slide-up flex flex-col" style={{ animationDelay: '200ms' }}>
            <div className="note-blue rounded-lg lg:rounded-tr-xl lg:rounded-tl-none lg:rounded-br-xl p-2 lg:p-2.5 flex flex-col h-full lg:h-full">
              <div className="flex items-center gap-2 mb-2 flex-shrink-0">
                <div className="p-1.5 rounded-lg icon-box-blue">
                  <Sparkles className="w-4 h-4" style={{ color: '#2563eb' }} />
                </div>
                <h2 className="section-title text-sm md:text-base" style={{ color: '#1e40af' }}>
                  🎨 Generated Image
                </h2>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden min-h-[200px] lg:min-h-0 rounded-lg" style={{ 
                minHeight: '200px',
                background: 'rgba(255, 255, 255, 0.6)',
                border: '2px solid rgba(59, 130, 246, 0.25)'
              }}>
                <ImageOutput />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GalleryTab() {
  return <ImageGallery />;
}

export default App;
