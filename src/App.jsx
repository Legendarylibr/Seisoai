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
import { Grid, Sparkles, Image, DollarSign } from 'lucide-react';

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
  const { isConnected, credits: walletCredits, isLoading: walletLoading } = useSimpleWallet();
  const { isAuthenticated, credits: emailCredits, isLoading: emailLoading } = useEmailAuth();
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);
  const [currentTab, setCurrentTab] = useState(activeTab);

  // Determine current credits based on auth method
  const isEmailAuth = isAuthenticated && !isConnected;
  const credits = isEmailAuth ? (emailCredits || 0) : (walletCredits || 0);
  const isLoading = walletLoading || emailLoading;

  // Allow users to see UI even without credits - new users get 2 credits
  // Removed redirect to pricing page - users can access all tabs regardless of credit balance
  useEffect(() => {
    if (isLoading) return;
    
    // Only redirect to generate if user has credits and is on pricing page (optional convenience)
    if ((isConnected || isAuthenticated) && credits > 0 && currentTab === 'pricing') {
      // If user has credits and is on pricing page, redirect to generate
      setCurrentTab('generate');
      setActiveTab('generate');
    }
  }, [isLoading, isConnected, isAuthenticated, credits, currentTab, setActiveTab]);

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
      
      <main className="container mx-auto px-4 md:px-6 lg:px-8 py-1 md:py-2">
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

function GenerateTab({ onShowTokenPayment, onShowStripePayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  const { controlNetImage, multiImageModel } = useImageGenerator();
  
  // Determine if user has reference images
  const hasReferenceImages = !!controlNetImage;
  
  // Hide prompt and style when Qwen is selected (layer extraction doesn't need them)
  const isQwenSelected = multiImageModel === 'qwen-image-layered';
  
  // Use email auth if available, otherwise wallet
  const isEmailAuth = emailContext.isAuthenticated;
  const credits = isEmailAuth ? (emailContext.credits || 0) : (walletContext.credits || 0);

  return (
    <div className="fade-in">
      {/* Top Row - Header and User Info */}
      <div className="mb-0">
          {/* Compact Header */}
          <div className="text-center py-0 mb-0.5">
            <h1 className="text-2xl md:text-3xl font-bold mb-0" style={{ 
              color: '#ffffff', 
              textShadow: '4px 4px 0 rgba(0, 0, 0, 0.8), 3px 3px 0 rgba(0, 0, 0, 0.8), 2px 2px 0 rgba(0, 0, 0, 0.8), 1px 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.5)'
            }}>Seiso AI</h1>
            <p className="text-xs md:text-sm" style={{ 
              color: '#ffffff', 
              textShadow: '3px 3px 0 rgba(0, 0, 0, 0.8), 2px 2px 0 rgba(0, 0, 0, 0.8), 1px 1px 2px rgba(0, 0, 0, 0.9), 0 0 4px rgba(0, 0, 0, 0.5)'
            }}>Generate, edit, and extract images by layer</p>
          </div>

        {/* User Info - Email or Wallet */}
        <div className="glass-card rounded-lg rounded-b-none p-1 md:p-1.5 mb-0 slide-up">
          {isEmailAuth ? (
            <EmailUserInfo onShowStripePayment={onShowStripePayment} />
          ) : (
            <SimpleWalletConnect />
          )}
        </div>

      </div>

      {/* Main Content - Compact Layout */}
      <div>
        {/* Main Generation Area */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Input Image Section */}
          <div className="slide-up" style={{ animationDelay: '100ms' }}>
            {/* How to Use - Above Reference Image */}
            <div className="rounded-none lg:rounded-tl-xl lg:rounded-tr-none p-2 rounded-b-none" style={{ 
              background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
              border: '2px outset #ffffbb',
              borderBottom: 'none',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px 0 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)'
            }}>
              <div className="flex items-start gap-2">
                <div className="p-1 rounded flex-shrink-0" style={{ 
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}>
                  <Sparkles className="w-3 h-3" style={{ color: '#000000' }} />
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold mb-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>How to Use</h3>
                  <div className="space-y-0.5 text-xs leading-tight" style={{ color: '#000000' }}>
                    <div className="flex items-start gap-1">
                      <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>1.</span>
                      <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>Text to Image:</strong> Type a description, choose a style (optional), and click Generate.</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>2.</span>
                      <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>With Reference Image:</strong> Upload 1 image, add a prompt describing changes, and click Generate.</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>3.</span>
                      <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>Multiple Reference Images:</strong> Upload 2+ images, select FLUX or Nano Banana Pro, and click Generate to blend them.</span>
                    </div>
                    <div className="flex items-start gap-1">
                      <span className="font-bold flex-shrink-0" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>4.</span>
                      <span style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}><strong>Layer Extract:</strong> Upload an image, select Qwen model, and click "Extract Layers" to separate into individual layers.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="glass-card rounded-none p-1 md:p-1.5 rounded-t-none" style={{
              borderTop: 'none',
              boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <div className="flex items-center gap-1 mb-0.5">
                <div className="p-0.5 rounded" style={{ 
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}>
                  <Image className="w-3 h-3 md:w-3.5 md:h-3.5" style={{ color: '#000000' }} />
                </div>
                <div>
                  <h2 className="text-[10px] md:text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Reference Image</h2>
                  <p className="text-[9px] leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                    <span style={{ color: '#000000', fontWeight: 'bold' }}>0:</span> new • <span style={{ color: '#000000', fontWeight: 'bold' }}>1:</span> edit • <span style={{ color: '#000000', fontWeight: 'bold' }}>2+:</span> blend
                  </p>
                </div>
              </div>
              <div className="min-h-[90px] md:min-h-[110px]">
                <ReferenceImageInput />
              </div>
              
              {/* Multi-Image Model Selection */}
              <div className="mt-0.5">
                <MultiImageModelSelector customPrompt={customPrompt} />
              </div>
            </div>

            {/* Prompt and Style Combined - Hidden when Qwen is selected */}
            {!isQwenSelected && (
              <div className="rounded-none lg:rounded-bl-xl p-1 md:p-1.5 space-y-1 rounded-t-none" style={{ 
                background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
                border: '2px outset #ffffbb',
                borderTop: 'none',
                boxShadow: 'inset 2px 0 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)'
              }}>
                {/* Custom Prompt */}
                <div>
                  <label className="flex items-center gap-0.5 mb-0.5">
                    <span className="text-[10px] font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                      {hasReferenceImages ? 'Describe Changes' : 'Prompt'}
                    </span>
                    {hasReferenceImages && (
                      <span className="text-[10px]" style={{ color: '#666666', fontStyle: 'italic' }}>(optional)</span>
                    )}
                  </label>
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
                    className="w-full p-2 rounded resize-none text-xs transition-all duration-300"
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
                    rows={4}
                  />
                  {!hasReferenceImages && (
                    <p className="text-[10px] mt-0.5 leading-tight" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                      {multiImageModel === 'nano-banana-pro' 
                        ? '✨ Nano Banana Pro supports text-to-image generation - describe what you want to create!'
                        : '💡 Tip: Be specific with colors, mood, style'}
                    </p>
                  )}
                </div>

                {/* Style Selection */}
                <div>
                  <StyleSelector />
                </div>
              </div>
            )}

            {/* Generate Button - Mobile */}
            <div className="lg:hidden">
              <div className="glass-card rounded-none p-1.5">
                <GenerateButton 
                  customPrompt={customPrompt}
                  onShowTokenPayment={onShowTokenPayment}
                />
              </div>
            </div>
          </div>

          {/* Generated Image Output */}
          <div className="slide-up space-y-0" style={{ animationDelay: '200ms' }}>
            <div className="glass-card rounded-none lg:rounded-tr-xl lg:rounded-tl-none p-1.5 md:p-2 rounded-b-none" style={{
              borderBottom: 'none',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px 0 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <div className="flex items-center gap-1.5 mb-1">
                <div className="p-0.5 rounded" style={{ 
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}>
                  <Sparkles className="w-3 h-3 md:w-3.5 md:h-3.5" style={{ color: '#000000', filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))' }} />
                </div>
                <h2 className="text-xs md:text-sm font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Generated Image</h2>
              </div>
              <div className="min-h-[40px] md:min-h-[60px]">
                <ImageOutput />
              </div>
            </div>
            
            {/* Generate Button - Desktop (separate, right below Generated Image) */}
            <div className="hidden lg:block">
              <div className="rounded-none lg:rounded-br-xl lg:rounded-bl-none p-2 rounded-t-none" style={{ 
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
