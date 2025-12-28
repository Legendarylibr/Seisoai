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
import EmailUserInfo from './components/EmailUserInfo';
import AuthGuard from './components/AuthGuard';
import ImageGallery from './components/ImageGallery';
import PricingPage from './components/PricingPage';
import GenerateButton from './components/GenerateButton';
import { Grid, Sparkles, Image, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('generate');

  const tabs = [
    { id: 'generate', name: 'Generate', icon: Sparkles },
    { id: 'gallery', name: 'Gallery', icon: Grid },
    { id: 'pricing', name: 'Pricing', icon: DollarSign }
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
  const { isAuthenticated } = useEmailAuth();
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);
  const [currentTab, setCurrentTab] = useState(activeTab);

  // Redirect to generate if user has credits and is on pricing page
  useEffect(() => {
    if ((isConnected || isAuthenticated) && currentTab === 'pricing') {
      setCurrentTab('generate');
      setActiveTab('generate');
    }
  }, [isConnected, isAuthenticated, currentTab, setActiveTab]);

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
    </div>
  );
}

function AppContent({ activeTab, onShowTokenPayment, onShowStripePayment }) {

  // Pricing page is accessible without auth (but checkout requires auth)
  if (activeTab === 'pricing') {
    return <PricingPage />;
  }

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
    <div className="rounded-lg lg:rounded-tl-xl lg:rounded-tr-none p-0.5 lg:p-1 rounded-b-none" style={{ 
      background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
      border: '2px outset #ffffbb',
      borderBottom: 'none',
      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px 0 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)'
    }}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between gap-2"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-1.5">
          <div className="p-0.5 rounded flex-shrink-0" style={{ 
            background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
            border: '2px outset #f0f0f0',
            boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
          }}>
            <Sparkles className="w-3 h-3" style={{ color: '#000000' }} />
          </div>
          <h3 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>How to Use</h3>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-3 h-3" style={{ color: '#000000' }} />
        ) : (
          <ChevronDown className="w-3 h-3" style={{ color: '#000000' }} />
        )}
      </button>
      {isExpanded && (
        <div className="mt-1.5 space-y-0.5 text-xs leading-tight" style={{ color: '#000000' }}>
          <div className="flex items-start gap-1.5">
            <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>1.</span>
            <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>Text to Image:</strong> Type a description, choose a style (optional), and click Generate.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>2.</span>
            <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>With Reference Image:</strong> Upload 1 image, add a prompt describing changes, and click Generate.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>3.</span>
            <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>Multiple Reference Images:</strong> Upload 2+ images, select FLUX or Nano Banana Pro, and click Generate to blend them.</span>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>4.</span>
            <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>Layer Extract:</strong> Upload an image, select Qwen model, and click "Extract Layers" to separate into individual layers.</span>
          </div>
        </div>
      )}
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
          {/* Compact Header */}
          <div className="text-center py-0.5 lg:py-0.5 mb-0.5 lg:mb-1">
            <h1 className="text-base md:text-lg lg:text-base font-bold mb-0" style={{ 
              color: '#ffffff', 
              textShadow: '4px 4px 0 rgba(0, 0, 0, 0.8), 3px 3px 0 rgba(0, 0, 0, 0.8), 2px 2px 0 rgba(0, 0, 0, 0.8), 1px 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.5)'
            }}>Seiso AI</h1>
            <p className="text-[9px] md:text-[10px] lg:text-[9px]" style={{ 
              color: '#ffffff', 
              textShadow: '3px 3px 0 rgba(0, 0, 0, 0.8), 2px 2px 0 rgba(0, 0, 0, 0.8), 1px 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.5)'
            }}>Generate, edit, and extract images by layer</p>
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
            
            {/* Primary Input: Prompt First (Most Important) */}
            {!isQwenSelected && (
              <div className="glass-card rounded-lg lg:rounded-tl-xl lg:rounded-tr-none p-0.5 lg:p-1 rounded-b-none" style={{
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}>
                <div className="flex items-center gap-0.5 lg:gap-1 mb-0.5 lg:mb-1">
                  <div className="p-0.5 rounded" style={{ 
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}>
                    <Sparkles className="w-3.5 h-3.5" style={{ color: '#000000' }} />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                      {hasReferenceImages ? 'Describe Changes' : 'Prompt'}
                    </h2>
                    {hasReferenceImages && (
                      <p className="text-[10px] leading-tight" style={{ color: '#666666', fontStyle: 'italic' }}>Optional - describe what to change</p>
                    )}
                  </div>
                </div>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={
                    hasReferenceImages 
                      ? "e.g., 'make it more vibrant', 'add sunset colors'..." 
                      : multiImageModel === 'nano-banana-pro'
                      ? "✨ Text-to-Image: e.g., 'a futuristic city at night', 'a serene mountain landscape'..."
                      : "e.g., 'a futuristic city at night', 'a serene mountain landscape'..."
                  }
                  className="w-full p-0.5 lg:p-1 rounded resize-none text-xs transition-all duration-300"
                  style={{
                    background: '#ffffff',
                    border: '2px inset #c0c0c0',
                    color: '#000000',
                    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.15), inset -1px -1px 0 rgba(255, 255, 255, 0.5)'
                  }}
                  onFocus={(e) => {
                    e.target.style.border = '2px inset #808080';
                    e.target.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.3)';
                    e.target.style.background = '#fffffe';
                  }}
                  onBlur={(e) => {
                    e.target.style.border = '2px inset #c0c0c0';
                    e.target.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.15), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                    e.target.style.background = '#ffffff';
                  }}
                  rows={2}
                />
                {!hasReferenceImages && (
                  <p className="text-[9px] mt-0.5 leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                    {multiImageModel === 'nano-banana-pro' 
                      ? '✨ Nano Banana Pro supports text-to-image generation - describe what you want to create!'
                      : '💡 Tip: Be specific with colors, mood, style'}
                  </p>
                )}
              </div>
            )}

            {/* Secondary Input: Reference Image */}
            <div className="glass-card rounded-lg p-0.5 lg:p-1 rounded-t-none" style={{
              borderTop: 'none',
              boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <div className="flex items-center gap-0.5 lg:gap-1 mb-0.5 lg:mb-1">
                <div className="p-0.5 rounded" style={{ 
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}>
                  <Image className="w-3.5 h-3.5" style={{ color: '#000000' }} />
                </div>
                <div>
                  <h2 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Reference Image</h2>
                  <p className="text-[10px] leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                    <span style={{ color: '#000000', fontWeight: 'bold' }}>0:</span> new • <span style={{ color: '#000000', fontWeight: 'bold' }}>1:</span> edit • <span style={{ color: '#000000', fontWeight: 'bold' }}>2+:</span> blend
                  </p>
                </div>
              </div>
              <div className="h-[150px] md:h-[180px] lg:h-[140px] overflow-hidden">
                <ReferenceImageInput />
              </div>
            </div>

            {/* Model Selection - Show for text-to-image or when images are uploaded */}
            {!hasReferenceImages && !isQwenSelected && (
              <div className="glass-card rounded-lg p-0.5 lg:p-1 rounded-t-none" style={{
                borderTop: 'none',
                boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}>
                <MultiImageModelSelector customPrompt={customPrompt} />
              </div>
            )}
            {hasReferenceImages && (
              <div className="glass-card rounded-lg p-0.5 lg:p-1 rounded-t-none" style={{
                borderTop: 'none',
                boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}>
                <MultiImageModelSelector customPrompt={customPrompt} />
              </div>
            )}

            {/* Optional: Style Selection - Compact, After Model Selection */}
            {!isQwenSelected && (
              <div className="rounded-lg p-0.5 lg:p-1 rounded-t-none" style={{ 
                background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
                border: '2px outset #ffffbb',
                borderTop: 'none',
                boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)'
              }}>
                <StyleSelector />
              </div>
            )}

            {/* Generate Button - Prominent, Always Visible */}
            <div className="rounded-lg lg:rounded-bl-xl p-0.5 lg:p-1 rounded-t-none" style={{ 
              background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
              border: '2px outset #ffffbb',
              borderTop: 'none',
              boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)'
            }}>
              <GenerateButton 
                customPrompt={customPrompt}
                onShowTokenPayment={onShowTokenPayment}
              />
            </div>
          </div>

          {/* Right Column: Output Section - Matched Height */}
          <div className="slide-up flex flex-col" style={{ animationDelay: '200ms' }}>
            <div className="glass-card rounded-lg lg:rounded-tr-xl lg:rounded-tl-none lg:rounded-br-xl p-0.5 lg:p-1 flex flex-col h-full lg:h-full" style={{
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <div className="flex items-center gap-0.5 lg:gap-1 mb-0.5 lg:mb-1 flex-shrink-0">
                <div className="p-0.5 rounded" style={{ 
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}>
                  <Sparkles className="w-3.5 h-3.5" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
                </div>
                <h2 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Generated Image</h2>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden min-h-[200px] lg:min-h-0" style={{ minHeight: '200px' }}>
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
