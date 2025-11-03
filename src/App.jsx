import React, { useState } from 'react';
import { ImageGeneratorProvider, useImageGenerator } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider, useSimpleWallet } from './contexts/SimpleWalletContext';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import TokenPaymentModal from './components/TokenPaymentModal';
// import StripePaymentModal from './components/StripePaymentModal'; // DISABLED - Stripe disabled, crypto only
import AuthGuard from './components/AuthGuard';
import ImageGallery from './components/ImageGallery';
// Batch and Templates removed from UI
// Settings removed from UI
// Video functionality removed
// import LegalDisclaimer from './components/LegalDisclaimer'; // DISABLED - Legal/terms removed from main screen
import GenerateButton from './components/GenerateButton';
import { Grid, Sparkles, Wallet, ArrowRight, Image } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('generate');
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  // const [showStripePaymentModal, setShowStripePaymentModal] = useState(false); // DISABLED - Stripe

  const tabs = [
    { id: 'generate', name: 'Generate', icon: Sparkles },
    { id: 'gallery', name: 'Gallery', icon: Grid }
  ];

  return (
    <SimpleWalletProvider>
      <ImageGeneratorProvider>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 animated-bg">
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            tabs={tabs}
            onShowTokenPayment={() => {
              console.log('🔵 App: onShowTokenPayment called, setting showTokenPaymentModal to true');
              setShowTokenPaymentModal(true);
            }}
            // onShowStripePayment={() => setShowStripePaymentModal(true)} // DISABLED - Stripe
          />
          
          <main className="container mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-10">
            <div className="fade-in">
              <AppContent 
                activeTab={activeTab} 
                onShowTokenPayment={() => {
                console.log('🔵 App: onShowTokenPayment called, setting showTokenPaymentModal to true');
                setShowTokenPaymentModal(true);
              }}
                // onShowStripePayment={() => setShowStripePaymentModal(true)} // DISABLED - Stripe
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
          
          {/* STRIPE DISABLED - Stripe disabled, crypto payments only
          <StripePaymentModal 
            isOpen={showStripePaymentModal} 
            onClose={() => setShowStripePaymentModal(false)} 
          />
          */}
          
          {/* DISABLED - Legal/terms panel removed from main screen
          <LegalDisclaimer />
          */}
          
        </div>
      </ImageGeneratorProvider>
    </SimpleWalletProvider>
  );
}

function AppContent({ activeTab, onShowTokenPayment }) {
  const { isConnected } = useSimpleWallet();

  // Show wallet connection prompt if not connected
  if (!isConnected) {
    return <WalletPrompt />;
  }

  // Show main content if wallet is connected (AuthGuard will handle credit requirements)
  return (
    <>
      <AuthGuard requireCredits={activeTab === 'generate'}>
        {activeTab === 'generate' && <GenerateTab onShowTokenPayment={onShowTokenPayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
        {/* Settings route removed */}
        {/* Video tab removed */}
      </AuthGuard>
    </>
  );
}

function WalletPrompt({ onConnect }) {
  // onShowStripePayment prop removed - Stripe disabled
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
      // Pass the wallet type to connectWallet
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
            Welcome to Seiso AI
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-3">
            Create and edit high quality images with AI
          </p>
          <p className="text-gray-400 text-lg">
            Connect your wallet to get started
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="space-y-6">
          <div className="glass-card p-6 mb-6">
            <h2 className="text-2xl md:text-3xl font-semibold text-white mb-2">
              Connect Your Wallet
            </h2>
            <p className="text-gray-400 text-sm md:text-base">
              Choose your preferred blockchain to continue
            </p>
          </div>
          
          {/* STRIPE DISABLED - Stripe button removed, crypto only
          <button
            onClick={onShowStripePayment}
            className="w-full max-w-md mx-auto flex items-center justify-center gap-3 px-8 py-4 text-lg bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-lg transition-all duration-200 hover:scale-105 shadow-lg"
          >
            <CreditCard className="w-6 h-6" />
            <span>Buy Credits with Card (No Wallet Required)</span>
            <ArrowRight className="w-5 h-5" />
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-gray-900 text-gray-400">OR</span>
            </div>
          </div>
          */}

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
            /* Wallet Selection for Selected Chain */
            <div className="space-y-6 slide-up">
              {/* Back Button */}
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300 mx-auto group"
              >
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform duration-300" />
                <span className="group-hover:text-white">Back to Blockchain Selection</span>
              </button>

              {/* Chain Header */}
              <div className="text-center glass-card p-6">
                <h3 className="text-2xl font-semibold text-white mb-2">
                  {selectedChain === 'evm' ? '⟠ Ethereum Wallets' : '◎ Solana Wallets'}
                </h3>
                <p className="text-gray-400 text-base">
                  Choose your {selectedChain === 'evm' ? 'EVM' : 'Solana'} wallet
                </p>
              </div>

              {/* Wallet Options */}
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

          {/* Benefits */}
          <div className="mt-8 glass-card p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
            <h3 className="font-semibold text-purple-300 mb-4 text-lg flex items-center gap-2">
              <span className="text-xl">✨</span>
              Why connect a wallet?
            </h3>
            <ul className="text-sm md:text-base text-gray-300 space-y-2">
              <li className="flex items-center gap-2">
                <span className="text-purple-400">✓</span>
                Secure authentication and credit management
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">✓</span>
                Access to NFT holder discounts and free generation
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">✓</span>
                Purchase credits with USDC for image generation
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-400">✓</span>
                Track your generation history and gallery
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}


function GenerateTab({ onShowTokenPayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const { credits } = useSimpleWallet();
  const { controlNetImage } = useImageGenerator();
  
  // Determine if user has reference images
  const hasReferenceImages = !!controlNetImage;

  return (
    <div className="section-spacing fade-in">
      {/* Professional Header */}
      <div className="text-center py-4 mb-6">
        <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-2">Seiso AI</h1>
        <p className="text-gray-400 text-base md:text-lg">Create and edit stunning AI-generated images</p>
      </div>

      {/* Credits Status Banner */}
      {credits <= 0 && (
        <div className="glass-card bg-yellow-500/10 border-yellow-500/30 p-4 mb-6 animate-pulse">
          <div className="flex items-center gap-3 text-center justify-center">
            <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-yellow-300 text-sm md:text-base font-medium">
              No credits available - Click "Buy Credits" in the top right to purchase credits
            </span>
          </div>
        </div>
      )}

      {/* Main Content - Improved Layout */}
      <div className="section-spacing">
        {/* Wallet Connection - Enhanced */}
        <div className="glass-card rounded-xl p-4 mb-4 slide-up">
          <SimpleWalletConnect />
        </div>

        {/* Main Generation Area - Prioritized */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
          {/* Input Image Section - Enhanced */}
          <div className="space-y-4 md:space-y-5 slide-up" style={{ animationDelay: '100ms' }}>
            <div className="glass-card rounded-xl p-4 md:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Image className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-semibold text-white">Reference Image</h2>
                  <p className="text-xs md:text-sm text-gray-400 mt-1">
                    0 images: text-to-image • 1 image: edit from reference • 2+ images: blend
                  </p>
                </div>
              </div>
              <div className="min-h-[250px] md:min-h-[300px]">
                <ReferenceImageInput />
              </div>
            </div>

            {/* Prompt and Style Combined */}
            <div className="glass-card rounded-xl p-4 md:p-6 space-y-4">
              {/* Custom Prompt */}
              <div>
                <label className="flex items-center gap-2 mb-3">
                  <span className="text-base md:text-lg font-semibold text-white">
                    {hasReferenceImages ? 'Describe Changes' : 'Prompt'}
                  </span>
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder={hasReferenceImages ? "Describe changes to make... (optional)" : "Enter your prompt... (optional)"}
                  className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none text-sm md:text-base transition-all duration-300 focus:bg-white/8"
                  rows={3}
                />
              </div>

              {/* Style Selection */}
              <div>
                <StyleSelector />
              </div>
            </div>

            {/* Generate Button - Mobile */}
            <div className="lg:hidden">
              <div className="glass-card rounded-xl p-4">
                <GenerateButton 
                  customPrompt={customPrompt}
                  onShowTokenPayment={onShowTokenPayment}
                />
              </div>
            </div>
          </div>

          {/* Generated Image Output - Enhanced */}
          <div className="space-y-4 md:space-y-5 slide-up" style={{ animationDelay: '200ms' }}>
            <div className="glass-card rounded-xl p-4 md:p-6 h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Sparkles className="w-5 h-5 md:w-6 md:h-6 text-purple-400" />
                </div>
                <h2 className="text-lg md:text-xl font-semibold text-white">Generated Image</h2>
              </div>
              <div className="min-h-[250px] md:min-h-[300px]">
                <ImageOutput />
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button - Desktop */}
        <div className="hidden lg:flex justify-center my-6">
          <div className="glass-card rounded-xl p-5 w-full max-w-lg slide-up" style={{ animationDelay: '300ms' }}>
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

// TemplatesTab and BatchTab removed
// VideoTab removed
// SettingsTab removed

export default App;
