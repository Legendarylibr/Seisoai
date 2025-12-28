import React, { useState } from 'react';
import { Mail, Wallet, ArrowRight, Sparkles, Link2, Calendar } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import EmailSignIn from './EmailSignIn';
import logger from '../utils/logger.js';

const AuthPrompt = () => {
  const [authMode, setAuthMode] = useState(null); // 'email' or 'wallet'

  // Show auth mode selection if not selected
  if (!authMode) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)] px-4 py-6" style={{ position: 'relative', zIndex: 10 }}>
        <div className="text-center max-w-5xl mx-auto slide-up">
          {/* Hero Section with Neon Effect */}
          <div className="mb-8 relative">
            {/* Decorative corners */}
            <div className="absolute -top-2 -left-2 w-6 h-6 opacity-50" style={{
              background: 'linear-gradient(90deg, #00b8a9 33%, transparent 33%), linear-gradient(180deg, #00b8a9 33%, transparent 33%)',
              backgroundSize: '4px 4px'
            }}></div>
            <div className="absolute -top-2 -right-2 w-6 h-6 opacity-50" style={{
              background: 'linear-gradient(270deg, #f59e0b 33%, transparent 33%), linear-gradient(180deg, #f59e0b 33%, transparent 33%)',
              backgroundSize: '4px 4px'
            }}></div>
            <div className="text-center mb-6">
              <h1 className="text-3xl md:text-4xl font-bold mb-3 hero-title" style={{ 
                fontFamily: "'VT323', monospace",
                letterSpacing: '0.1em'
              }}>
                WELCOME TO SEISO AI
              </h1>
              <p className="text-sm md:text-base tracking-wide" style={{ 
                color: '#ffffff', 
                textShadow: '0 0 12px rgba(0, 184, 169, 0.5), 2px 2px 0 rgba(0, 0, 0, 0.8), 1px 1px 2px rgba(0, 0, 0, 0.9)',
                fontFamily: "'IBM Plex Mono', monospace"
              }}>
                Generate • Edit • Extract Layers
              </p>
            </div>
          </div>

          {/* Sign In Section */}
          <div className="mb-5">
            <h2 className="text-lg font-bold mb-3 inline-flex items-center gap-2" style={{ 
              color: '#ffffff', 
              textShadow: '0 0 8px rgba(245, 158, 11, 0.5), 2px 2px 0 rgba(0, 0, 0, 0.8)',
              fontFamily: "'VT323', monospace",
              letterSpacing: '0.05em'
            }}>
              <span>▸</span> Sign In to Get Started
            </h2>
          </div>

          {/* Auth Mode Selection */}
          <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto mb-6">
            <button
              onClick={() => setAuthMode('email')}
              className="w-full rounded-lg p-4 group transition-all duration-300"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.border = '2px inset #c0c0c0';
                e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.border = '2px outset #f0f0f0';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded flex-shrink-0" style={{
                  background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                  border: '2px outset #e0e0e0',
                  boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
                }}>
                  <Mail className="w-5 h-5" style={{ color: '#000000' }} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm mb-1" style={{ 
                    color: '#000000', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}>
                    Sign in with Email
                  </div>
                  <div className="text-xs" style={{ 
                    color: '#1a1a1a', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    Monthly subscriptions • Credit card payments
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: '#000000' }} />
              </div>
            </button>

            <button
              onClick={() => setAuthMode('wallet')}
              className="w-full rounded-lg p-4 group transition-all duration-300"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                textAlign: 'left'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                e.currentTarget.style.border = '2px outset #f8f8f8';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                e.currentTarget.style.border = '2px outset #f0f0f0';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.border = '2px inset #c0c0c0';
                e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.border = '2px outset #f0f0f0';
                e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
              }}
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded flex-shrink-0" style={{
                  background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                  border: '2px outset #e0e0e0',
                  boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
                }}>
                  <Wallet className="w-5 h-5" style={{ color: '#000000' }} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm mb-1" style={{ 
                    color: '#000000', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}>
                    Connect Crypto Wallet
                  </div>
                  <div className="text-xs" style={{ 
                    color: '#1a1a1a', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    Pay-per-credit • <strong>NFT: 5 credits</strong>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: '#000000' }} />
              </div>
            </button>
          </div>

          {/* Main Content Grid */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Features */}
            <div className="rounded-lg p-3 text-left" style={{ 
              background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
              border: '2px outset #e8e8e8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <h2 className="text-xs font-bold mb-2 flex items-center gap-1" style={{ 
                color: '#000000', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                <Link2 className="w-3 h-3" style={{ color: '#000000' }} />
                Features
              </h2>
              <div className="space-y-1 text-[10px]" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                <div>• <strong>Generate</strong> from text</div>
                <div>• <strong>Edit</strong> existing images</div>
                <div>• <strong>Blend</strong> 2+ images</div>
                <div>• <strong>Extract layers</strong> with Qwen</div>
                <div>• <strong>Multiple</strong> art styles</div>
              </div>
            </div>

            {/* Free Benefits */}
            <div className="rounded-lg p-3 text-left" style={{ 
              background: 'linear-gradient(to bottom, #ecfdf5, #d1fae5, #a7f3d0)',
              border: '2px outset #a7f3d0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
              <h2 className="text-xs font-bold mb-2 flex items-center gap-1" style={{ 
                color: '#000000', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                <Calendar className="w-3 h-3" style={{ color: '#000000' }} />
                Free Benefits
              </h2>
              <div className="space-y-1 text-[10px]" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                <div>• <strong>2 Credits</strong> for all new users</div>
                <div>• <strong>5 Credits</strong> (NFT holders)</div>
                <div>• No credit card required</div>
              </div>
            </div>

            {/* Quick Instructions */}
            <div className="rounded-lg p-3 text-left" style={{ 
              background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
              border: '2px outset #e8e8e8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <h2 className="text-xs font-bold mb-2 flex items-center gap-1" style={{ 
                color: '#000000', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                <Sparkles className="w-3 h-3" style={{ color: '#000000' }} />
                How to Use
              </h2>
              <div className="space-y-0.5 text-[10px] leading-tight" style={{ color: '#000000' }}>
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
      </div>
    );
  }

  // Show email sign-in
  if (authMode === 'email') {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4" style={{ position: 'relative', zIndex: 10 }}>
        <div className="w-full max-w-md md:max-w-xl mx-auto">
          <button
            onClick={() => setAuthMode(null)}
            className="mb-4 flex items-center gap-2 transition-all duration-300 btn-secondary"
            style={{
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back</span>
          </button>
          <EmailSignIn />
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
    { id: 'evm', name: 'Ethereum', icon: '⟠', description: 'EVM Compatible Chains (Ethereum, Polygon, Base, Arbitrum, Optimism)' },
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
      logger.error('Wallet connection failed:', { walletId, error: error.message });
    }
  };

  const handleBack = () => {
    setSelectedChain(null);
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4" style={{ position: 'relative', zIndex: 10 }}>
      <div className="w-full max-w-md md:max-w-xl mx-auto">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 transition-all duration-300 btn-secondary text-sm md:text-base"
            style={{
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}
          >
            <ArrowRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" />
            <span>Back to Sign In Options</span>
          </button>
        )}

        {!selectedChain ? (
          <div className="glass-card rounded-xl p-6 md:p-8 space-y-4 md:space-y-6" style={{ 
            background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
            border: '2px outset #e8e8e8',
            boxShadow: 'inset 3px 3px 0 rgba(255, 255, 255, 1), inset -3px -3px 0 rgba(0, 0, 0, 0.25), 0 6px 12px rgba(0, 0, 0, 0.2)'
          }}>
            <div className="text-center mb-6 md:mb-8">
              <div className="p-4 md:p-5 rounded inline-block mb-4 md:mb-5" style={{
                background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                border: '2px outset #e0e0e0',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
              }}>
                <Wallet className="w-12 h-12 md:w-16 md:h-16" style={{ color: '#000000' }} />
              </div>
              <h2 className="text-2xl md:text-3xl font-bold mb-2 md:mb-3" style={{ 
                color: '#000000', 
                textShadow: '2px 2px 0 rgba(255, 255, 255, 1), 1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                Connect Wallet
              </h2>
              <p className="text-sm md:text-base" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Choose your blockchain</p>
            </div>

            <div className="space-y-3 md:space-y-4">
              {chainOptions.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => handleChainSelect(chain.id)}
                  className="w-full flex items-center gap-4 md:gap-5 p-4 md:p-5 rounded-xl transition-all duration-300"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                    e.currentTarget.style.border = '2px outset #f8f8f8';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span className="text-2xl md:text-3xl">{chain.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-base md:text-lg" style={{ 
                      color: '#000000', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}>
                      {chain.name}
                    </div>
                    <div className="text-sm md:text-base" style={{ 
                      color: '#1a1a1a', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                    }}>
                      {chain.description}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" style={{ color: '#000000' }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-6 md:p-8 space-y-4 md:space-y-6" style={{ 
            background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
            border: '2px outset #e8e8e8',
            boxShadow: 'inset 3px 3px 0 rgba(255, 255, 255, 1), inset -3px -3px 0 rgba(0, 0, 0, 0.25), 0 6px 12px rgba(0, 0, 0, 0.2)'
          }}>
            <button
              onClick={handleBack}
              className="mb-2 flex items-center gap-2 transition-all duration-300 btn-secondary text-sm md:text-base"
              style={{
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              <ArrowRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" />
              <span>Back</span>
            </button>

            <div className="text-center mb-6 md:mb-8">
              <div className="p-3 md:p-4 rounded inline-block mb-3 md:mb-4" style={{
                background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                border: '2px outset #e0e0e0',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
              }}>
                <Wallet className="w-10 h-10 md:w-14 md:h-14" style={{ color: '#000000' }} />
              </div>
              <h2 className="text-xl md:text-2xl font-bold mb-2 md:mb-3" style={{ 
                color: '#000000', 
                textShadow: '2px 2px 0 rgba(255, 255, 255, 1), 1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                {selectedChain === 'evm' ? 'EVM Wallets' : 'Solana Wallets'}
              </h2>
              <p className="text-sm md:text-base" style={{ 
                color: '#1a1a1a', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
              }}>
                Select your wallet
              </p>
            </div>

            <div className="space-y-3 md:space-y-4">
              {(selectedChain === 'evm' ? evmWallets : solanaWallets).map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleWalletSelect(wallet.id)}
                  className="w-full flex items-center gap-4 md:gap-5 p-4 md:p-5 rounded-xl transition-all duration-300"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                    e.currentTarget.style.border = '2px outset #f8f8f8';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <span className="text-2xl md:text-3xl">{wallet.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-base md:text-lg" style={{ 
                      color: '#000000', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}>
                      {wallet.name}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 md:w-6 md:h-6 flex-shrink-0" style={{ color: '#000000' }} />
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
