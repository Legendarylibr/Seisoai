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

  // Redirect to pricing if authenticated but has 0 credits (only for email/Stripe users)
  useEffect(() => {
    if (isLoading) return;
    
    // Only redirect email/Stripe users to pricing page
    // Crypto wallet users will see the pay-per-credit modal instead
    if (isAuthenticated && !isConnected && (credits === 0 || credits === null || credits === undefined)) {
      if (currentTab !== 'pricing') {
        setCurrentTab('pricing');
        setActiveTab('pricing');
      }
    } else if ((isConnected || isAuthenticated) && credits > 0 && currentTab === 'pricing') {
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 animated-bg">
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
  // New users get 2 free images (IP-based), so we allow them to see the UI
  // Users with 0 credits can still use free images, so we don't block the UI

  // Show main content - allow UI access even without authentication or credits
  // New users can see the interface and will be prompted to sign up when generating
  // They'll get 2 free images (IP-based) after signing up
  // NFT holders get additional free images (5 total per IP)
  return (
    <>
      <AuthGuard requireCredits={false}>
        {activeTab === 'generate' && <GenerateTab onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
      </AuthGuard>
    </>
  );
}

function GenerateTab({ onShowTokenPayment, onShowStripePayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  const { controlNetImage } = useImageGenerator();
  
  // Determine if user has reference images
  const hasReferenceImages = !!controlNetImage;
  
  // Use email auth if available, otherwise wallet
  const isEmailAuth = emailContext.isAuthenticated;
  const credits = isEmailAuth ? (emailContext.credits || 0) : (walletContext.credits || 0);

  return (
    <div className="fade-in">
      {/* Professional Header */}
      <div className="text-center py-0.5 mb-1">
        <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-0.5">Seiso AI</h1>
        <p className="text-gray-400 text-base md:text-lg">Create and edit stunning AI-generated images</p>
      </div>

      {/* User Info - Email or Wallet */}
      <div className="glass-card rounded-xl rounded-b-none p-2.5 mb-0 slide-up">
        {isEmailAuth ? (
          <EmailUserInfo onShowStripePayment={onShowStripePayment} />
        ) : (
          <SimpleWalletConnect />
        )}
      </div>

      {/* Credits Status Banner - Only for wallet users */}
      {credits <= 0 && !isEmailAuth && (
        <div className="glass-card bg-yellow-500/10 border-yellow-500/30 rounded-t-none rounded-b-none p-2.5 mb-0 animate-pulse">
          <div className="flex items-center gap-2 text-center justify-center">
            <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-yellow-300 text-xs md:text-sm font-medium">
              No credits available - Click "Buy Credits" in the top right to purchase credits
            </span>
          </div>
        </div>
      )}

      {/* Quick Instructions */}
      <div className="glass-card rounded-xl p-4 mb-3 max-w-3xl mx-auto slide-up">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/20 rounded-lg flex-shrink-0">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-2">How to Use</h3>
            <div className="space-y-1.5 text-xs text-gray-300">
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-medium">1.</span>
                <span><strong>Upload images</strong> (optional): No image = generate new • 1 image = edit • 2+ images = blend</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-medium">2.</span>
                <span><strong>Enter a prompt</strong> (optional): Describe what you want to create or change</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-medium">3.</span>
                <span><strong>Choose a style</strong> (optional): Select an artistic style for your image</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-medium">4.</span>
                <span><strong>Click Generate</strong>: Your image will appear on the right</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Improved Layout */}
      <div>

        {/* Main Generation Area - Prioritized */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Input Image Section - Enhanced */}
          <div className="slide-up" style={{ animationDelay: '100ms' }}>
            <div className="glass-card rounded-none lg:rounded-l-xl lg:rounded-tr-none p-2.5 md:p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1 bg-purple-500/20 rounded-lg">
                  <Image className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm md:text-base font-semibold text-white">Reference Image</h2>
                  <p className="text-xs text-gray-400">
                    <span className="text-purple-300">0 images:</span> Generate new • <span className="text-purple-300">1 image:</span> Edit • <span className="text-purple-300">2+ images:</span> Blend
                  </p>
                </div>
              </div>
              <div className="min-h-[120px] md:min-h-[140px]">
                <ReferenceImageInput />
              </div>
              
              {/* Multi-Image Model Selection - Show immediately after images */}
              <div className="mt-2">
                <MultiImageModelSelector />
              </div>
            </div>

            {/* Prompt and Style Combined */}
            <div className="glass-card rounded-none lg:rounded-bl-xl p-2.5 md:p-3 space-y-2">
              {/* Custom Prompt */}
              <div>
                <label className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-xs md:text-sm font-semibold text-white">
                    {hasReferenceImages ? 'Describe Changes' : 'Prompt'}
                  </span>
                  <span className="text-xs text-gray-500">(optional)</span>
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={
                    hasReferenceImages 
                      ? "e.g., 'make it more vibrant', 'add sunset colors', 'change to winter scene'..." 
                      : "e.g., 'a futuristic city at night', 'a serene mountain landscape', 'a cute cat wearing sunglasses'..."
                  }
                  className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none text-sm transition-all duration-300 focus:bg-white/8"
                  rows={2}
                />
                {!hasReferenceImages && (
                  <p className="text-xs text-gray-500 mt-1">
                    💡 Tip: Be specific! Describe details like colors, mood, style, and composition
                  </p>
                )}
              </div>

              {/* Style Selection */}
              <div>
                <StyleSelector />
              </div>
            </div>

            {/* Generate Button - Mobile */}
            <div className="lg:hidden">
              <div className="glass-card rounded-none p-2">
                <GenerateButton 
                  customPrompt={customPrompt}
                  onShowTokenPayment={onShowTokenPayment}
                />
              </div>
            </div>
          </div>

          {/* Generated Image Output - Enhanced */}
          <div className="slide-up" style={{ animationDelay: '200ms' }}>
            <div className="glass-card rounded-none lg:rounded-r-xl lg:rounded-tl-none p-2.5 md:p-3 h-full">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1 bg-purple-500/20 rounded-lg">
                  <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-400" />
                </div>
                <h2 className="text-sm md:text-base font-semibold text-white">Generated Image</h2>
              </div>
              <div className="min-h-[120px] md:min-h-[140px]">
                <ImageOutput />
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button - Desktop */}
        <div className="hidden lg:flex justify-center mt-0">
          <div className="glass-card rounded-none rounded-b-xl p-3 w-full max-w-lg slide-up" style={{ animationDelay: '300ms' }}>
            <GenerateButton 
              customPrompt={customPrompt}
              onShowTokenPayment={onShowTokenPayment}
            />
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
