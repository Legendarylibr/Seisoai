import React, { useState } from 'react';
import { Mail, Wallet, ArrowRight, Sparkles, Zap, Gift } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import EmailSignIn from './EmailSignIn';
import logger from '../utils/logger.js';

const AuthPrompt = () => {
  const [authMode, setAuthMode] = useState(null); // 'email' or 'wallet'

  // Show auth mode selection if not selected
  if (!authMode) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-120px)] px-4 py-2" style={{ position: 'relative', zIndex: 10 }}>
        <div className="text-center max-w-5xl mx-auto slide-up">
          {/* Compact Hero Section */}
          <div className="mb-2">
            <div className="text-center mb-2">
              <h1 className="text-2xl md:text-3xl font-bold mb-0.5" style={{ 
                color: '#000000', 
                textShadow: '2px 2px 0 rgba(255, 255, 255, 1), 1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                Welcome to Seiso AI
              </h1>
              <p className="text-xs md:text-sm" style={{ 
                color: '#1a1a1a', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
              }}>
                Create and edit stunning AI-generated images
              </p>
            </div>
          </div>

          {/* Sign In Section - Moved Above Instructions */}
          <div className="mb-2">
            <h2 className="text-base font-bold mb-1.5" style={{ 
              color: '#000000', 
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}>
              Sign In to Get Started
            </h2>
          </div>

          {/* Compact Auth Mode Selection */}
          <div className="grid md:grid-cols-2 gap-2 max-w-3xl mx-auto mb-2">
            <button
              onClick={() => setAuthMode('email')}
              className="w-full glass-card rounded-lg p-2.5 group transition-all duration-300"
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
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded flex-shrink-0" style={{
                  background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                  border: '2px outset #e0e0e0',
                  boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
                }}>
                  <Mail className="w-4 h-4" style={{ color: '#000000' }} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm mb-0.5" style={{ 
                    color: '#000000', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}>
                    Sign in with Email
                  </div>
                  <div className="text-[10px]" style={{ 
                    color: '#1a1a1a', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    Monthly subscriptions • Credit card payments
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: '#000000' }} />
              </div>
            </button>

            <button
              onClick={() => setAuthMode('wallet')}
              className="w-full glass-card rounded-lg p-2.5 group transition-all duration-300"
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
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded flex-shrink-0" style={{
                  background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                  border: '2px outset #e0e0e0',
                  boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
                }}>
                  <Wallet className="w-4 h-4" style={{ color: '#000000' }} />
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm mb-0.5" style={{ 
                    color: '#000000', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}>
                    Connect Crypto Wallet
                  </div>
                  <div className="text-[10px]" style={{ 
                    color: '#1a1a1a', 
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                  }}>
                    Pay-per-credit • <strong>NFT: 5 free credits</strong>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: '#000000' }} />
              </div>
            </button>
          </div>

          {/* Compact Main Content Grid - Moved Below Sign In */}
          <div className="grid md:grid-cols-3 gap-2">
            {/* Features */}
            <div className="glass-card rounded-lg p-2 text-left" style={{ 
              background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
              border: '2px outset #e8e8e8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <h2 className="text-xs font-bold mb-1 flex items-center gap-1" style={{ 
                color: '#000000', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                <Sparkles className="w-3 h-3" style={{ color: '#000000' }} />
                Features
              </h2>
              <div className="space-y-1 text-[10px]" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                <div>• <strong>Generate</strong> from text</div>
                <div>• <strong>Edit</strong> existing images</div>
                <div>• <strong>Blend</strong> 2+ images</div>
                <div>• <strong>Multiple</strong> art styles</div>
              </div>
            </div>

            {/* Free Benefits */}
            <div className="glass-card rounded-lg p-2 text-left" style={{ 
              background: 'linear-gradient(to bottom, #ffffdd, #ffffbb, #ffffaa)',
              border: '2px outset #ffffbb',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.8), inset -2px -2px 0 rgba(0, 0, 0, 0.2), 0 2px 4px rgba(0, 0, 0, 0.15)'
            }}>
              <h2 className="text-xs font-bold mb-1 flex items-center gap-1" style={{ 
                color: '#000000', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                <Gift className="w-3 h-3" style={{ color: '#000000' }} />
                Free Benefits
              </h2>
              <div className="space-y-1 text-[10px]" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                <div>• <strong>2 Free Images</strong> (all users)</div>
                <div>• <strong>5 Free Credits</strong> (NFT holders)</div>
                <div>• No credit card required</div>
              </div>
            </div>

            {/* Quick Instructions */}
            <div className="glass-card rounded-lg p-2 text-left" style={{ 
              background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
              border: '2px outset #e8e8e8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <h2 className="text-xs font-bold mb-1 flex items-center gap-1" style={{ 
                color: '#000000', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                <Zap className="w-3 h-3" style={{ color: '#000000' }} />
                How It Works
              </h2>
              <div className="space-y-1 text-[10px]" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
                <div><strong>1.</strong> Upload (0=new, 1=edit, 2+=blend)</div>
                <div><strong>2.</strong> Enter prompt (optional)</div>
                <div><strong>3.</strong> Choose style (optional)</div>
                <div><strong>4.</strong> Click Generate</div>
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
        <div className="w-full max-w-md mx-auto">
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
      <div className="w-full max-w-md mx-auto">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 flex items-center gap-2 transition-all duration-300 btn-secondary"
            style={{
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
            }}
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            <span>Back to Sign In Options</span>
          </button>
        )}

        {!selectedChain ? (
          <div className="glass-card rounded-xl p-6 space-y-4" style={{ 
            background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
            border: '2px outset #e8e8e8',
            boxShadow: 'inset 3px 3px 0 rgba(255, 255, 255, 1), inset -3px -3px 0 rgba(0, 0, 0, 0.25), 0 6px 12px rgba(0, 0, 0, 0.2)'
          }}>
            <div className="text-center mb-6">
              <div className="p-4 rounded inline-block mb-4" style={{
                background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                border: '2px outset #e0e0e0',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
              }}>
                <Wallet className="w-12 h-12" style={{ color: '#000000' }} />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ 
                color: '#000000', 
                textShadow: '2px 2px 0 rgba(255, 255, 255, 1), 1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                Connect Wallet
              </h2>
              <p style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Choose your blockchain</p>
            </div>

            <div className="space-y-3">
              {chainOptions.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => handleChainSelect(chain.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300"
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
                  <span className="text-2xl">{chain.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold" style={{ 
                      color: '#000000', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}>
                      {chain.name}
                    </div>
                    <div className="text-sm" style={{ 
                      color: '#1a1a1a', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                    }}>
                      {chain.description}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: '#000000' }} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="glass-card rounded-xl p-6 space-y-4" style={{ 
            background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
            border: '2px outset #e8e8e8',
            boxShadow: 'inset 3px 3px 0 rgba(255, 255, 255, 1), inset -3px -3px 0 rgba(0, 0, 0, 0.25), 0 6px 12px rgba(0, 0, 0, 0.2)'
          }}>
            <button
              onClick={handleBack}
              className="mb-2 flex items-center gap-2 transition-all duration-300 btn-secondary"
              style={{
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              <ArrowRight className="w-4 h-4 rotate-180" />
              <span>Back</span>
            </button>

            <div className="text-center mb-6">
              <div className="p-3 rounded inline-block mb-3" style={{
                background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
                border: '2px outset #e0e0e0',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
              }}>
                <Wallet className="w-10 h-10" style={{ color: '#000000' }} />
              </div>
              <h2 className="text-xl font-bold mb-2" style={{ 
                color: '#000000', 
                textShadow: '2px 2px 0 rgba(255, 255, 255, 1), 1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}>
                {selectedChain === 'evm' ? 'EVM Wallets' : 'Solana Wallets'}
              </h2>
              <p className="text-sm" style={{ 
                color: '#1a1a1a', 
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
              }}>
                Select your wallet
              </p>
            </div>

            <div className="space-y-3">
              {(selectedChain === 'evm' ? evmWallets : solanaWallets).map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => handleWalletSelect(wallet.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-300"
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
                  <span className="text-2xl">{wallet.icon}</span>
                  <div className="flex-1 text-left">
                    <div className="font-semibold" style={{ 
                      color: '#000000', 
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}>
                      {wallet.name}
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 flex-shrink-0" style={{ color: '#000000' }} />
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
