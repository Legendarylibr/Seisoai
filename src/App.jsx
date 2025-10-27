import React, { useState } from 'react';
import { ImageGeneratorProvider } from './contexts/ImageGeneratorContext';
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
import BatchProcessor from './components/BatchProcessor';
import Templates from './components/Templates';
import Settings from './components/Settings';
import LegalDisclaimer from './components/LegalDisclaimer';
import GenerateButton from './components/GenerateButton';
import VideoGeneration from './components/VideoGeneration';
import { Image, Grid, File, Settings as SettingsIcon2, Coins, Wand2, Wallet, ArrowRight, Sparkles, Video } from 'lucide-react';
// import { CreditCard } from 'lucide-react'; // DISABLED - Stripe disabled

function App() {
  const [activeTab, setActiveTab] = useState('generate');
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  // const [showStripePaymentModal, setShowStripePaymentModal] = useState(false); // DISABLED - Stripe

  const tabs = [
    { id: 'generate', name: 'Generate', icon: Sparkles },
    { id: 'gallery', name: 'Gallery', icon: Grid },
    { id: 'video', name: 'Video', icon: Video },
    { id: 'templates', name: 'Templates', icon: File },
    { id: 'batch', name: 'Batch', icon: Wand2 },
    { id: 'settings', name: 'Settings', icon: SettingsIcon2 }
  ];

  return (
    <SimpleWalletProvider>
      <ImageGeneratorProvider>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            tabs={tabs}
            onShowTokenPayment={() => setShowTokenPaymentModal(true)}
            // onShowStripePayment={() => setShowStripePaymentModal(true)} // DISABLED - Stripe
          />
          
          <main className="container mx-auto px-2 md:px-6 lg:px-8 py-4 md:py-8">
            <AppContent 
              activeTab={activeTab} 
              onShowTokenPayment={() => setShowTokenPaymentModal(true)}
              // onShowStripePayment={() => setShowStripePaymentModal(true)} // DISABLED - Stripe
            />
          </main>
          
          <TokenPaymentModal 
            isOpen={showTokenPaymentModal} 
            onClose={() => setShowTokenPaymentModal(false)} 
          />
          
          {/* STRIPE DISABLED - Stripe disabled, crypto payments only
          <StripePaymentModal 
            isOpen={showStripePaymentModal} 
            onClose={() => setShowStripePaymentModal(false)} 
          />
          */}
          
          <LegalDisclaimer />
          
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
      <AuthGuard requireCredits={activeTab === 'generate' || activeTab === 'batch' || activeTab === 'video'}>
        {activeTab === 'generate' && <GenerateTab onShowTokenPayment={onShowTokenPayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
        {activeTab === 'video' && <VideoTab onShowTokenPayment={onShowTokenPayment} />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'batch' && <BatchTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </AuthGuard>
    </>
  );
}

function WalletPrompt({ onConnect }) {
  // onShowStripePayment prop removed - Stripe disabled
  const { connectWallet } = useSimpleWallet();
  const [showChainSelection, setShowChainSelection] = useState(true);
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
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-2xl mx-auto">
        {/* Hero Section */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Welcome to Seiso AI
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            Create stunning AI-generated images with your preferred style
          </p>
          <p className="text-gray-400">
            Choose how to get started
          </p>
        </div>

        {/* Wallet Connection */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Connect Your Wallet
          </h2>
          
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
            <>
              {/* Main Connect Button */}
              <button
                onClick={() => setShowChainSelection(!showChainSelection)}
                className="btn-primary flex items-center justify-center gap-3 px-8 py-4 text-lg mx-auto"
              >
                <Wallet className="w-6 h-6" />
                <span>Choose Blockchain</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              {/* Chain Options */}
              {showChainSelection && (
                <div className="mt-6 space-y-3 max-w-md mx-auto">
                  {chainOptions.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={() => handleChainSelect(chain.id)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 transition-all duration-200 hover:scale-105"
                    >
                      <span className="text-2xl">{chain.icon}</span>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-white">{chain.name}</div>
                        <div className="text-sm text-gray-400">{chain.description}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Wallet Selection for Selected Chain */
            <div className="space-y-4">
              {/* Back Button */}
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mx-auto"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span>Back to Blockchain Selection</span>
              </button>

              {/* Chain Header */}
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white mb-2">
                  {selectedChain === 'evm' ? '⟠ Ethereum Wallets' : '◎ Solana Wallets'}
                </h3>
                <p className="text-gray-400 text-sm">
                  Choose your {selectedChain === 'evm' ? 'EVM' : 'Solana'} wallet
                </p>
              </div>

              {/* Wallet Options */}
              <div className="space-y-3 max-w-md mx-auto">
                {(selectedChain === 'evm' ? evmWallets : solanaWallets).map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletSelect(wallet.id)}
                    className="w-full flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 transition-all duration-200 hover:scale-105"
                  >
                    <span className="text-2xl">{wallet.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-white">{wallet.name}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Benefits */}
          <div className="mt-8 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
            <h3 className="font-semibold text-purple-300 mb-2">Why connect a wallet?</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Secure authentication and credit management</li>
              <li>• Access to NFT holder discounts and free generation</li>
              <li>• Purchase credits with USDC for image generation</li>
              <li>• Track your generation history and gallery</li>
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

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Compact Header */}
      <div className="text-center py-1">
        <h1 className="text-xl font-bold gradient-text mb-1">Seiso AI</h1>
        <p className="text-gray-400 text-xs">Create stunning images with AI</p>
      </div>

      {/* Credits Status Banner */}
      {credits <= 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
          <div className="flex items-center gap-2 text-center justify-center">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-yellow-300 text-sm font-medium">
              No credits available - Click "Buy Credits" in the top right to purchase credits
            </span>
          </div>
        </div>
      )}

      {/* Main Content - Improved Layout */}
      <div className="space-y-4">
        {/* Wallet Connection - Compact */}
        <div className="glass-effect rounded-lg p-2 mb-3">
          <SimpleWalletConnect />
        </div>

        {/* Main Generation Area - Prioritized */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Input Image Section - Bigger */}
          <div className="space-y-3 md:space-y-4">
            <div className="glass-effect rounded-lg p-3 md:p-4">
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <Image className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                <h2 className="text-base md:text-lg font-semibold text-white">Reference Image</h2>
              </div>
              <div className="min-h-[200px] md:min-h-[250px]">
                <ReferenceImageInput />
              </div>
            </div>

            {/* Style Selection for Reference Image */}
            <div className="glass-effect rounded-lg p-3 md:p-4">
              <StyleSelector />
            </div>

            {/* Custom Prompt - Compact */}
            <div className="glass-effect rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-4 h-4 text-purple-400 text-xs">✏️</div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Describe</h2>
                  <p className="text-xs text-gray-400">Optional changes</p>
                </div>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Describe changes to make..."
                className="w-full p-2 rounded bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none text-xs transition-all duration-200"
                rows={2}
              />
            </div>
          </div>

          {/* Generated Image Output - Bigger */}
          <div className="space-y-3 md:space-y-4">
            <div className="glass-effect rounded-lg p-3 md:p-4">
              <div className="flex items-center gap-2 mb-3 md:mb-4">
                <Sparkles className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
                <h2 className="text-base md:text-lg font-semibold text-white">Generated Image</h2>
              </div>
              <div className="min-h-[200px] md:min-h-[250px]">
                <ImageOutput />
              </div>
            </div>
          </div>
        </div>

        {/* Generate Button - Compact */}
        <div className="flex justify-center my-3">
          <div className="glass-effect rounded-lg p-3">
              <GenerateButton 
              customPrompt={customPrompt}
              onShowTokenPayment={onShowTokenPayment}
            />
          </div>
        </div>

        {/* Credits Info - Minimal */}
        <div className="text-center mt-2">
          <p className="text-xs text-gray-500">
            Need credits? Use "Buy Credits" in navigation.
          </p>
        </div>
      </div>
    </div>
  );
}

function GalleryTab() {
  return <ImageGallery />;
}

function VideoTab({ onShowTokenPayment }) {
  return <VideoGeneration onShowTokenPayment={onShowTokenPayment} />;
}

function TemplatesTab() {
  return <Templates />;
}

function BatchTab() {
  return <BatchProcessor />;
}

function SettingsTab() {
  return <Settings />;
}

export default App;
