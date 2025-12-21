import React, { useState } from 'react';
import { Mail, Wallet, ArrowRight, Sparkles } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import EmailSignIn from './EmailSignIn';

const AuthPrompt = () => {
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
            <p className="text-xl md:text-2xl text-gray-300 mb-4">
              Create and edit stunning images with AI
            </p>
            
            {/* What Seiso AI Does */}
            <div className="glass-card rounded-xl p-6 mb-6 max-w-2xl mx-auto text-left">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                What You Can Do
              </h2>
              <div className="space-y-3 text-gray-300">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-white">Text-to-Image:</span> Generate images from text descriptions
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-white">Image Editing:</span> Transform and enhance existing images
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-white">Image Blending:</span> Combine multiple images into one
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <span className="font-medium text-white">Multiple Styles:</span> Choose from various artistic styles
                  </div>
                </div>
              </div>
            </div>
            
            <p className="text-gray-400 text-lg mb-2">
              Choose how you'd like to sign in to get started
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

  // Show wallet connection
  return <WalletPrompt onBack={() => setAuthMode(null)} />;
};

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
      <div className="w-full max-w-md mx-auto">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to Sign In Options</span>
          </button>
        )}

        {!selectedChain ? (
          <div className="glass-card rounded-xl p-6 space-y-4">
            <div className="text-center mb-6">
              <Wallet className="w-16 h-16 text-purple-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Connect Wallet</h2>
              <p className="text-gray-400">Choose your blockchain</p>
            </div>

            <div className="space-y-3">
              {chainOptions.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => handleChainSelect(chain.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl glass-card card-hover group"
                >
                  <span className="text-2xl">{chain.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">{chain.name}</div>
                    <div className="text-sm text-gray-400">{chain.description}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-purple-400 group-hover:translate-x-1 transition-all duration-300" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-6 space-y-4">
            <button
              onClick={handleBack}
              className="mb-2 flex items-center gap-2 text-gray-400 hover:text-white transition-all duration-300"
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              <span>Back</span>
            </button>

            <div className="text-center mb-6">
              <Wallet className="w-12 h-12 text-purple-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-white mb-2">
                {selectedChain === 'evm' ? 'EVM Wallets' : 'Solana Wallets'}
              </h2>
              <p className="text-gray-400 text-sm">Select your wallet</p>
            </div>

            <div className="space-y-3">
              {(selectedChain === 'evm' ? evmWallets : solanaWallets).map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleWalletSelect(wallet.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl glass-card card-hover group"
                >
                  <span className="text-2xl">{wallet.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-white">{wallet.name}</div>
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

export default AuthPrompt;
