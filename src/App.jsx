import React, { useState, useEffect, useCallback } from 'react';
import { ImageGeneratorProvider, useImageGenerator } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider, useSimpleWallet } from './contexts/SimpleWalletContext';
import { EmailAuthProvider, useEmailAuth } from './contexts/EmailAuthContext';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import TokenPaymentModal from './components/TokenPaymentModal';
import StripePaymentModal from './components/StripePaymentModal';
import EmailSignIn from './components/EmailSignIn';
import EmailUserInfo from './components/EmailUserInfo';
import AuthGuard from './components/AuthGuard';
import ImageGallery from './components/ImageGallery';
import PricingPage from './components/PricingPage';
import GenerateButton from './components/GenerateButton';
import { Grid, Sparkles, Wallet, ArrowRight, Image, Mail, CreditCard, DollarSign } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('generate');
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  // const [showStripePaymentModal, setShowStripePaymentModal] = useState(false); // DISABLED - Stripe

  const tabs = [
    { id: 'generate', name: 'Generate', icon: Sparkles },
    { id: 'gallery', name: 'Gallery', icon: Grid },
    { id: 'pricing', name: 'Pricing', icon: DollarSign }
  ];

  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleShowTokenPayment = useCallback(() => {
    console.log('🔵 App: onShowTokenPayment called, setting showTokenPaymentModal to true');
    setShowTokenPaymentModal(true);
  }, []);

  const handleShowStripePayment = useCallback(() => {
    setShowStripePaymentModal(true);
  }, []);

  return (
    <SimpleWalletProvider>
      <EmailAuthProvider>
        <ImageGeneratorProvider>
          <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 animated-bg">
            <Navigation 
              activeTab={activeTab} 
              setActiveTab={setActiveTab}
              tabs={tabs}
              onShowTokenPayment={handleShowTokenPayment}
              onShowStripePayment={handleShowStripePayment}
            />
            
            <main className="container mx-auto px-4 md:px-6 lg:px-8 py-1 md:py-2">
              <div className="fade-in">
                <AppContent 
                  activeTab={activeTab} 
                  onShowTokenPayment={handleShowTokenPayment}
                  onShowStripePayment={handleShowStripePayment}
                />
              </div>
            </main>
            
            <TokenPaymentModal 
              isOpen={showTokenPaymentModal} 
              onClose={() => {
                console.log('🔴 TokenPaymentModal: onClose called');
                setShowTokenPaymentModal(false);
              }} 
            />
            
            <StripePaymentModal 
              isOpen={showStripePaymentModal} 
              onClose={() => setShowStripePaymentModal(false)} 
            />
          </div>
        </ImageGeneratorProvider>
      </EmailAuthProvider>
    </SimpleWalletProvider>
  );
}

function AppContent({ activeTab, onShowTokenPayment, onShowStripePayment }) {
  const { isConnected } = useSimpleWallet();
  const { isAuthenticated, credits: emailCredits } = useEmailAuth();
  const [hasShownStripeModal, setHasShownStripeModal] = useState(false);

  // For email users with no credits, automatically show Stripe modal once after sign-in
  // NOTE: This useEffect must be called before any early returns to follow React hooks rules
  useEffect(() => {
    if (isAuthenticated && !isConnected && (emailCredits === 0 || emailCredits === null || emailCredits === undefined) && !hasShownStripeModal && onShowStripePayment) {
      setHasShownStripeModal(true);
      // Small delay to ensure modal can render after component mounts
      const timer = setTimeout(() => {
        onShowStripePayment();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isConnected, emailCredits, hasShownStripeModal, onShowStripePayment]);

  // Pricing page is accessible without auth (but checkout requires auth)
  if (activeTab === 'pricing') {
    return <PricingPage />;
  }

  // Show auth prompt if not authenticated (for other tabs)
  if (!isConnected && !isAuthenticated) {
    return <AuthPrompt onSwitchToWallet={() => {}} />;
  }

  // Show main content if authenticated (AuthGuard will handle credit requirements)
  return (
    <>
      <AuthGuard requireCredits={activeTab === 'generate'}>
        {activeTab === 'generate' && <GenerateTab onShowTokenPayment={onShowTokenPayment} onShowStripePayment={onShowStripePayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
      </AuthGuard>
    </>
  );
}

function AuthPrompt() {
  const [authMode, setAuthMode] = useState(null); // 'email' or 'wallet'

  // Show auth mode selection if not selected
  if (!authMode) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center max-w-2xl mx-auto slide-up">
          {/* Hero Section */}
          <div className="mb-10">
            <div className="w-24 h-24 flex items-center justify-center mx-auto mb-8 animate-pulse">
              <div className="glass-card p-4 rounded-2xl">
                <img 
                  src="/1d1c7555360a737bb22bbdfc2784655f.png" 
                  alt="Seiso AI Logo" 
                  className="w-16 h-16 object-contain"
                />
              </div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
              Welcome to Seiso AI
            </h1>
            <p className="text-xl md:text-2xl text-gray-300 mb-3">
              Create and edit high quality images with AI
            </p>
            <p className="text-gray-400 text-lg">
              Choose how you'd like to sign in
            </p>
          </div>

          {/* Auth Mode Selection */}
          <div className="space-y-4 max-w-md mx-auto">
            <button
              onClick={() => setAuthMode('email')}
              className="w-full flex items-center gap-4 p-5 rounded-xl glass-card card-hover group"
            >
              <Mail className="w-6 h-6 text-blue-400 group-hover:scale-110 transition-transform duration-300" />
              <div className="flex-1 text-left">
                <div className="font-semibold text-white text-lg mb-1">Sign in with Email</div>
                <div className="text-sm text-gray-400">Use Stripe for payments</div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-300" />
            </button>

            <button
              onClick={() => setAuthMode('wallet')}
              className="w-full flex items-center gap-4 p-5 rounded-xl glass-card card-hover group"
            >
              <Wallet className="w-6 h-6 text-purple-400 group-hover:scale-110 transition-transform duration-300" />
              <div className="flex-1 text-left">
                <div className="font-semibold text-white text-lg mb-1">Connect Wallet</div>
                <div className="text-sm text-gray-400">Crypto payments & NFT discounts</div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-300" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show email sign-in
  if (authMode === 'email') {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="w-full max-w-md mx-auto">
          <button
            onClick={() => setAuthMode(null)}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back</span>
          </button>
          <EmailSignIn onSwitchToWallet={() => setAuthMode('wallet')} />
        </div>
      </div>
    );
  }

  // Show wallet connection (existing logic)
  return <WalletPrompt onBack={() => setAuthMode(null)} />;
}

function WalletPrompt({ onBack }) {
  const { connectWallet } = useSimpleWallet();
  const [selectedChain, setSelectedChain] = useState(null);

  const chainOptions = [
    { id: 'evm', name: 'Ethereum', icon: '⟠', description: 'EVM Compatible Chains' },
    { id: 'solana', name: 'Solana', icon: '◎', description: 'Solana Blockchain' }
  ];

  const evmWallets = [
    { id: 'metamask', name: 'MetaMask', icon: '🦊' },
    { id: 'rabby', name: 'Rabby', icon: '🐰' },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' }
  ];

  const solanaWallets = [
    { id: 'phantom', name: 'Phantom', icon: '👻' },
    { id: 'solflare', name: 'Solflare', icon: '🔥' }
  ];

  const handleChainSelect = (chainId) => {
    setSelectedChain(chainId);
  };

  const handleWalletSelect = async (walletId) => {
    try {
      await connectWallet(walletId);
    } catch (error) {
      console.error('Wallet connection failed:', error);
    }
  };

  const handleBack = () => {
    setSelectedChain(null);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="text-center max-w-2xl mx-auto slide-up">
        {/* Hero Section */}
        <div className="mb-10">
          <div className="w-24 h-24 flex items-center justify-center mx-auto mb-8 animate-pulse">
            <div className="glass-card p-4 rounded-2xl">
              <img 
                src="/1d1c7555360a737bb22bbdfc2784655f.png" 
                alt="Seiso AI Logo" 
                className="w-16 h-16 object-contain"
              />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-4">
            Connect Your Wallet
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-3">
            Connect your crypto wallet to get started
          </p>
        </div>

        {/* Back Button */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300 mx-auto"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to Sign In Options</span>
          </button>
        )}

        {/* Chain Selection */}
        {!selectedChain ? (
          <div className="mt-4 space-y-4 max-w-md mx-auto">
            {chainOptions.map((chain, index) => (
              <button
                key={chain.id}
                onClick={() => handleChainSelect(chain.id)}
                className="w-full flex items-center gap-4 p-5 rounded-xl glass-card card-hover group"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <span className="text-3xl group-hover:scale-110 transition-transform duration-300">{chain.icon}</span>
                <div className="flex-1 text-left">
                  <div className="font-semibold text-white text-lg mb-1">{chain.name}</div>
                  <div className="text-sm text-gray-400">{chain.description}</div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-300" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-6 slide-up">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300 mx-auto group"
            >
              <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform duration-300" />
              <span className="group-hover:text-white">Back to Blockchain Selection</span>
            </button>

            <div className="text-center glass-card p-6">
              <h3 className="text-2xl font-semibold text-white mb-2">
                {selectedChain === 'evm' ? '⟠ Ethereum Wallets' : '◎ Solana Wallets'}
              </h3>
              <p className="text-gray-400 text-base">
                Choose your {selectedChain === 'evm' ? 'EVM' : 'Solana'} wallet
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              {(selectedChain === 'evm' ? evmWallets : solanaWallets).map((wallet, index) => (
                <button
                  key={wallet.id}
                  onClick={() => handleWalletSelect(wallet.id)}
                  className="w-full flex items-center gap-4 p-5 rounded-xl glass-card card-hover group"
                  style={{ animationDelay: `${index * 100}ms` }}
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform duration-300">{wallet.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white text-lg">{wallet.name}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-300" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
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
                    0 images: text-to-image • 1 image: edit • 2+ images: blend
                  </p>
                </div>
              </div>
              <div className="min-h-[120px] md:min-h-[140px]">
                <ReferenceImageInput />
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
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={hasReferenceImages ? "Describe changes to make... (optional)" : "Enter your prompt... (optional)"}
                  className="w-full p-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none text-sm transition-all duration-300 focus:bg-white/8"
                  rows={2}
                />
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
