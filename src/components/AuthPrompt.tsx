import React, { useState } from 'react';
import { Mail, Wallet, ArrowRight, Sparkles, Link2, Calendar } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import EmailSignIn from './EmailSignIn';
import logger from '../utils/logger';

const AuthPrompt: React.FC = () => {
  const [authMode, setAuthMode] = useState<'email' | 'wallet' | null>(null);

  // Win95 style constants
  const WIN95 = {
    bg: '#c0c0c0',
    bgLight: '#dfdfdf',
    bgDark: '#808080',
    border: {
      light: '#ffffff',
      dark: '#808080',
      darker: '#404040'
    },
    text: '#000000',
    textDisabled: '#808080',
    highlight: '#000080'
  };

  // Show auth mode selection if not selected
  if (!authMode) {
    return (
      <div className="flex items-center justify-center h-full lg:max-h-[calc(100vh-80px)] px-4 py-4 lg:py-2 overflow-auto lg:overflow-hidden" style={{ position: 'relative', zIndex: 10 }}>
        {/* Win95 Window Container */}
        <div 
          className="text-center max-w-5xl mx-auto slide-up"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 8px rgba(0,0,0,0.3)`
          }}
        >
          {/* Win95 Title Bar */}
          <div 
            className="flex items-center gap-2 px-2 py-1.5"
            style={{ 
              background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
              color: '#ffffff',
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-bold flex-1 text-left">Welcome to Seiso AI</span>
            <div className="flex gap-0.5">
              <div className="w-4 h-4 flex items-center justify-center text-[10px]" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}` }}>_</div>
              <div className="w-4 h-4 flex items-center justify-center text-[10px]" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}` }}>□</div>
              <div className="w-4 h-4 flex items-center justify-center text-[10px]" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}` }}>×</div>
            </div>
          </div>

          {/* Window Content */}
          <div className="p-4 lg:p-6">
            {/* Hero Section */}
            <div className="mb-4 text-center">
              <h1 className="text-2xl md:text-3xl font-bold mb-2" style={{ 
                color: WIN95.highlight,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}>
                🎨 AI Creative Studio
              </h1>
              <p className="text-sm" style={{ 
                color: WIN95.text,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}>
                Image • Video • Music • AI Generation
              </p>
            </div>

            {/* Sign In Section Header */}
            <div 
              className="mb-3 py-1.5 px-3 inline-block"
              style={{
                background: WIN95.highlight,
                color: '#ffffff',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <span className="text-sm font-bold">▸ Sign In to Get Started</span>
            </div>

            {/* Auth Mode Selection - Win95 Buttons */}
            <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto mb-4">
              <button
                onClick={() => setAuthMode('email')}
                className="w-full p-4 text-left transition-all active:translate-y-px"
                style={{
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 flex-shrink-0"
                    style={{
                      background: WIN95.bgLight,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    <Mail className="w-5 h-5" style={{ color: WIN95.highlight }} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm" style={{ color: WIN95.text }}>
                      📧 Sign in with Email
                    </div>
                    <div className="text-xs" style={{ color: WIN95.textDisabled }}>
                      Monthly subscriptions • Credit card
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: WIN95.text }} />
                </div>
              </button>

              <button
                onClick={() => setAuthMode('wallet')}
                className="w-full p-4 text-left transition-all active:translate-y-px"
                style={{
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <div className="flex items-center gap-3">
                  <div 
                    className="p-2 flex-shrink-0"
                    style={{
                      background: WIN95.bgLight,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    <Wallet className="w-5 h-5" style={{ color: '#008000' }} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm" style={{ color: WIN95.text }}>
                      💳 Connect Crypto Wallet
                    </div>
                    <div className="text-xs" style={{ color: WIN95.textDisabled }}>
                      Pay-per-credit • Crypto payments
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: WIN95.text }} />
                </div>
              </button>
            </div>

            {/* Main Content Grid - Win95 Group Boxes */}
            <div className="grid md:grid-cols-3 gap-3">
              {/* Features */}
              <div 
                className="p-3 text-left"
                style={{ 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <h2 className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: WIN95.highlight }}>
                  <Link2 className="w-3.5 h-3.5" />
                  Features
                </h2>
                <div className="space-y-1 text-[10px]" style={{ color: WIN95.text }}>
                  <div>• <strong>Generate</strong> from text</div>
                  <div>• <strong>Edit</strong> existing images</div>
                  <div>• <strong>Blend</strong> 2+ images</div>
                  <div>• <strong>Extract layers</strong> from images</div>
                  <div>• <strong>Multiple</strong> art styles</div>
                </div>
              </div>

              {/* Free Benefits */}
              <div 
                className="p-3 text-left"
                style={{ 
                  background: '#c8ffc8',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <h2 className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#006400' }}>
                  <Calendar className="w-3.5 h-3.5" />
                  Free Benefits
                </h2>
                <div className="space-y-1.5 text-[10px]" style={{ color: WIN95.text }}>
                  <div className="flex items-center gap-1.5">
                    <span>🎁</span>
                    <strong>2 Credits</strong> for all new users
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>✨</span>
                    No credit card required
                  </div>
                </div>
              </div>

              {/* Quick Instructions */}
              <div 
                className="p-3 text-left"
                style={{ 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <h2 className="text-xs font-bold mb-2 flex items-center gap-1.5" style={{ color: '#b8860b' }}>
                  <Sparkles className="w-3.5 h-3.5" />
                  How to Use
                </h2>
                <div className="space-y-1 text-[10px] leading-relaxed" style={{ color: WIN95.text }}>
                  <div><strong>1.</strong> Type a description and Generate</div>
                  <div><strong>2.</strong> Upload images to edit</div>
                  <div><strong>3.</strong> Blend multiple images</div>
                  <div><strong>4.</strong> Extract layers from images</div>
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
      <div className="flex items-center justify-center h-full lg:max-h-[calc(100vh-80px)] px-4 overflow-auto lg:overflow-hidden" style={{ position: 'relative', zIndex: 10 }}>
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

interface WalletPromptProps {
  onBack: () => void;
}

function WalletPrompt({ onBack }: WalletPromptProps) {
  const { connectWallet } = useSimpleWallet();
  const [selectedChain, setSelectedChain] = useState<'evm' | 'solana' | null>(null);

  const chainOptions = [
    { id: 'evm' as const, name: 'Ethereum', icon: '⟠', description: 'EVM Compatible Chains (Ethereum, Polygon, Base, Arbitrum, Optimism)' },
    { id: 'solana' as const, name: 'Solana', icon: '◎', description: 'Solana Blockchain' }
  ];

  const evmWallets = [
    { id: 'metamask', name: 'MetaMask', icon: '🦊' },
    { id: 'walletconnect', name: 'WalletConnect', icon: '🔗' },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' },
    { id: 'rabby', name: 'Rabby Wallet', icon: '🐰' },
    { id: 'phantom-evm', name: 'Phantom', icon: '👻' },
    { id: 'rainbow', name: 'Rainbow Wallet', icon: '🌈' },
    { id: 'trust', name: 'Trust Wallet', icon: '🛡️' },
    { id: 'okx', name: 'OKX Wallet', icon: '⭕' },
    { id: 'bitget', name: 'Bitget Wallet', icon: '💼' },
    { id: 'brave', name: 'Brave Wallet', icon: '🦁' },
    { id: 'frame', name: 'Frame', icon: '🖼️' }
  ];

  const solanaWallets = [
    { id: 'phantom', name: 'Phantom', icon: '👻' },
    { id: 'solflare', name: 'Solflare', icon: '☀️' }
  ];

  const handleChainSelect = (chainId: 'evm' | 'solana') => {
    setSelectedChain(chainId);
  };

  const handleWalletSelect = async (walletId: string) => {
    try {
      await connectWallet(walletId);
    } catch (error) {
      logger.error('Wallet connection failed:', { walletId, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  };

  const handleBack = () => {
    setSelectedChain(null);
  };

  return (
    <div className="flex items-center justify-center h-full lg:max-h-[calc(100vh-80px)] px-4 overflow-auto lg:overflow-hidden" style={{ position: 'relative', zIndex: 10 }}>
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





