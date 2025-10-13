import React, { useState } from 'react';
import { ImageGeneratorProvider } from './contexts/ImageGeneratorContext';
import { MultiWalletProvider, useMultiWallet } from './contexts/MultiWalletContext';
import MultiWalletConnect from './components/MultiWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import PaymentModal from './components/PaymentModal';
import TokenPaymentModal from './components/TokenPaymentModal';
import AuthGuard from './components/AuthGuard';
import ImageGallery from './components/ImageGallery';
import BatchProcessor from './components/BatchProcessor';
import Templates from './components/Templates';
import Settings from './components/Settings';
import LegalDisclaimer from './components/LegalDisclaimer';
import WalletErrorHandler from './components/WalletErrorHandler';
import WalletConnect from './components/WalletConnect';
import GenerateButton from './components/GenerateButton';
import { Image, Grid, File, Settings as SettingsIcon2, Coins, Wand2, Wallet, ArrowRight, Sparkles } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('generate');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);

  const tabs = [
    { id: 'generate', name: 'Generate', icon: Sparkles },
    { id: 'gallery', name: 'Gallery', icon: Grid },
    { id: 'templates', name: 'Templates', icon: File },
    { id: 'batch', name: 'Batch', icon: Wand2 },
    { id: 'settings', name: 'Settings', icon: SettingsIcon2 }
  ];

  return (
    <MultiWalletProvider>
      <ImageGeneratorProvider>
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900">
          <Navigation 
            activeTab={activeTab} 
            setActiveTab={setActiveTab}
            tabs={tabs}
            onShowPayment={() => setShowPaymentModal(true)}
            onShowTokenPayment={() => setShowTokenPaymentModal(true)}
          />
          
          <main className="container mx-auto px-4 py-6">
            <AppContent 
              activeTab={activeTab} 
              onShowPayment={() => setShowPaymentModal(true)}
              onShowTokenPayment={() => setShowTokenPaymentModal(true)}
            />
          </main>

          <PaymentModal 
            isOpen={showPaymentModal} 
            onClose={() => setShowPaymentModal(false)} 
          />
          
          <TokenPaymentModal 
            isOpen={showTokenPaymentModal} 
            onClose={() => setShowTokenPaymentModal(false)} 
          />
          
          <LegalDisclaimer />
          
        </div>
      </ImageGeneratorProvider>
    </MultiWalletProvider>
  );
}

function AppContent({ activeTab, onShowPayment, onShowTokenPayment }) {
  const { isConnected } = useMultiWallet();

  // Show wallet connection prompt if not connected
  if (!isConnected) {
    return <MultiWalletConnect />;
  }

  // Show main content if wallet is connected (AuthGuard will handle credit requirements)
  return (
    <>
      <WalletErrorHandler />
      <AuthGuard requireCredits={activeTab === 'generate' || activeTab === 'batch'}>
        {activeTab === 'generate' && <GenerateTab onShowPayment={onShowPayment} onShowTokenPayment={onShowTokenPayment} />}
        {activeTab === 'gallery' && <GalleryTab />}
        {activeTab === 'templates' && <TemplatesTab />}
        {activeTab === 'batch' && <BatchTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </AuthGuard>
    </>
  );
}

function WalletPrompt({ onConnect }) {
  const [showChainSelection, setShowChainSelection] = useState(false);
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
    { id: 'solflare', name: 'Solflare', icon: '☀️' }
  ];

  const handleChainSelect = (chainId) => {
    setSelectedChain(chainId);
  };

  const handleWalletSelect = (walletId) => {
    onConnect(walletId);
  };

  const handleBack = () => {
    setSelectedChain(null);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-2xl mx-auto">
        {/* Wallet Error Handler */}
        <WalletErrorHandler />
        
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
            Connect your wallet to get started and access exclusive NFT holder discounts
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-2xl mb-2">🎨</div>
            <h3 className="font-semibold text-white mb-1">20+ Styles</h3>
            <p className="text-sm text-gray-400">Choose from photorealistic to artistic styles</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-2xl mb-2">💳</div>
            <h3 className="font-semibold text-white mb-1">NFT Discounts</h3>
            <p className="text-sm text-gray-400">Free access for qualifying NFT holders</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="font-semibold text-white mb-1">Fast Generation</h3>
            <p className="text-sm text-gray-400">High-quality images in seconds</p>
          </div>
        </div>

        {/* Wallet Connection */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Connect Your Wallet
          </h2>
          
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


function GenerateTab({ onShowPayment, onShowTokenPayment }) {
  const [customPrompt, setCustomPrompt] = useState('');
  const [workflowStep, setWorkflowStep] = useState(1);
  const { credits, hasFreeAccess } = useMultiWallet();

  return (
    <div className="space-y-3">
      {/* Compact Header */}
      <div className="text-center py-1">
        <h1 className="text-xl font-bold gradient-text mb-1">Seiso AI</h1>
        <p className="text-gray-400 text-xs">Create stunning images with AI</p>
      </div>

      {/* Credits Status Banner */}
      {!hasFreeAccess && credits <= 0 && (
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
        {/* Wallet Connection - Top Priority */}
        <div className="glass-effect rounded-xl p-4">
          <WalletConnect />
        </div>

        {/* Top Section - Input and Output Images */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Input Image Section */}
          <div className="space-y-4">
            <div className="glass-effect rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Image className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">Reference Image</h2>
              </div>
              <div className="min-h-[240px]">
                <ReferenceImageInput />
              </div>
            </div>

            {/* Custom Prompt - Under Reference Image */}
            <div className="glass-effect rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 text-purple-400 text-sm">✏️</div>
                <div>
                  <h2 className="text-base font-semibold text-white">Describe Generation</h2>
                  <p className="text-xs text-gray-400">What to change or add (optional)</p>
                </div>
              </div>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Describe what you want to change or add in the reference image excluding the style preset if selected. Describe desired changes in simple concise text"
                className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400 resize-none text-sm transition-all duration-200"
                rows={3}
              />
            </div>
          </div>

          {/* Generated Image Output */}
          <div className="space-y-4">
            <div className="glass-effect rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h2 className="text-lg font-semibold text-white">Generated Image</h2>
              </div>
              <div className="min-h-[240px]">
                <ImageOutput />
              </div>
            </div>

            {/* Style Selection - Moved to right column */}
            <div className="glass-effect rounded-lg p-4">
              <StyleSelector onSelect={() => setWorkflowStep(2)} />
            </div>
          </div>
        </div>

        {/* Generate Button - Centered in middle of screen */}
        <div className="flex justify-center my-6">
          <div className="glass-effect rounded-lg p-4">
            <GenerateButton customPrompt={customPrompt} />
          </div>
        </div>


        {/* Credits Info */}
        <div className="glass-effect rounded-lg p-4 max-w-xl mx-auto">
          <div className="text-center">
            <p className="text-xs text-gray-400 mb-2">
              Need more credits? Use the "Buy Credits" dropdown in the top right navigation.
            </p>
            <div className="flex items-center justify-center gap-1 text-xs text-purple-400">
              <Coins className="w-3 h-3" />
              <span>Credits available in navigation</span>
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
