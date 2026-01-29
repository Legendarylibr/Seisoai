import React, { useState } from 'react';
import { Wallet, ArrowRight, Sparkles, MessageCircle, Image, Film, Music, Coins } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import logger from '../utils/logger';

const AuthPrompt: React.FC = () => {
  const { connectWallet } = useSimpleWallet();
  const [selectedChain, setSelectedChain] = useState<'evm' | 'solana' | null>(null);

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

  const chainOptions = [
    { id: 'evm' as const, name: 'Ethereum', icon: '⟠', description: 'EVM Compatible (ETH, Polygon, Base, Arbitrum)' },
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

  // Show chain selection if not selected
  if (!selectedChain) {
    return (
      <div className="flex items-center justify-center h-full px-2 sm:px-4 py-2 lg:py-2 overflow-hidden" style={{ position: 'relative', zIndex: 10 }}>
        {/* Win95 Window Container */}
        <div 
          className="text-center max-w-5xl mx-auto slide-up max-h-full"
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
          <div className="p-2 sm:p-4 lg:p-6">
            {/* Hero Section */}
            <div className="mb-2 sm:mb-4 text-center">
              <h1 className="text-lg sm:text-2xl md:text-3xl font-bold mb-1 sm:mb-2" style={{ 
                color: WIN95.highlight,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}>
                🎨 AI Creative Studio
              </h1>
              <p className="text-xs sm:text-sm" style={{ 
                color: WIN95.text,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}>
                Image • Video • Music • AI Generation
              </p>
            </div>

            {/* Connect Wallet Section Header */}
            <div 
              className="mb-2 sm:mb-3 py-1 sm:py-1.5 px-2 sm:px-3 inline-block"
              style={{
                background: WIN95.highlight,
                color: '#ffffff',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <span className="text-xs sm:text-sm font-bold">▸ Connect Wallet to Get Started</span>
            </div>

            {/* Chain Selection - Win95 Buttons */}
            <div className="grid md:grid-cols-2 gap-2 sm:gap-3 max-w-3xl mx-auto mb-2 sm:mb-4">
              {chainOptions.map((chain) => (
                <button
                  key={chain.id}
                  onClick={() => handleChainSelect(chain.id)}
                  className="w-full p-2 sm:p-4 text-left transition-all active:translate-y-px"
                  style={{
                    background: WIN95.bg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                  }}
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div 
                      className="p-1.5 sm:p-2 flex-shrink-0"
                      style={{
                        background: WIN95.bgLight,
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                      }}
                    >
                      <span className="text-lg sm:text-xl">{chain.icon}</span>
                    </div>
                    <div className="flex-1">
                      <div className="font-bold text-xs sm:text-sm" style={{ color: WIN95.text }}>
                        {chain.name}
                      </div>
                      <div className="text-[10px] sm:text-xs" style={{ color: WIN95.textDisabled }}>
                        {chain.description}
                      </div>
                    </div>
                    <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" style={{ color: WIN95.text }} />
                  </div>
                </button>
              ))}
            </div>

            {/* Main Content Grid - Win95 Group Boxes */}
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2 md:gap-3 mb-2 sm:mb-3">
              {/* AI Tools - 4 compact cards */}
              <div 
                className="p-1.5 sm:p-2 md:p-3 text-center"
                style={{ 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mx-auto mb-0.5 sm:mb-1" style={{ color: WIN95.highlight }} />
                <div className="text-[8px] sm:text-[10px] md:text-xs font-bold" style={{ color: WIN95.text }}>Chat</div>
                <div className="text-[7px] sm:text-[8px] md:text-[10px] hidden sm:block" style={{ color: WIN95.textDisabled }}>Plan & describe</div>
              </div>
              <div 
                className="p-1.5 sm:p-2 md:p-3 text-center"
                style={{ 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <Image className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mx-auto mb-0.5 sm:mb-1" style={{ color: '#008000' }} />
                <div className="text-[8px] sm:text-[10px] md:text-xs font-bold" style={{ color: WIN95.text }}>Images</div>
                <div className="text-[7px] sm:text-[8px] md:text-[10px] hidden sm:block" style={{ color: WIN95.textDisabled }}>20+ styles</div>
              </div>
              <div 
                className="p-1.5 sm:p-2 md:p-3 text-center"
                style={{ 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <Film className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mx-auto mb-0.5 sm:mb-1" style={{ color: '#800080' }} />
                <div className="text-[8px] sm:text-[10px] md:text-xs font-bold" style={{ color: WIN95.text }}>Videos</div>
                <div className="text-[7px] sm:text-[8px] md:text-[10px] hidden sm:block" style={{ color: WIN95.textDisabled }}>AI animation</div>
              </div>
              <div 
                className="p-1.5 sm:p-2 md:p-3 text-center"
                style={{ 
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <Music className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 mx-auto mb-0.5 sm:mb-1" style={{ color: '#b8860b' }} />
                <div className="text-[8px] sm:text-[10px] md:text-xs font-bold" style={{ color: WIN95.text }}>Music</div>
                <div className="text-[7px] sm:text-[8px] md:text-[10px] hidden sm:block" style={{ color: WIN95.textDisabled }}>50+ genres</div>
              </div>
            </div>

            {/* Bottom Row - Free Access Info */}
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2 md:gap-3">
              {/* NFT Holder Benefits */}
              <div 
                className="p-1.5 sm:p-3 text-left"
                style={{ 
                  background: '#ffffc8',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <h2 className="text-[10px] sm:text-xs font-bold mb-1 sm:mb-2 flex items-center gap-1" style={{ color: '#b8860b' }}>
                  <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  NFT Holders
                </h2>
                <div className="space-y-0.5 sm:space-y-1 text-[8px] sm:text-[10px]" style={{ color: WIN95.text }}>
                  <div>🎨 <strong>FREE</strong> generation</div>
                  <div>⚡ Priority queue</div>
                  <div>🌟 Exclusive models</div>
                </div>
              </div>

              {/* Token Holder Benefits (Coming Soon) */}
              <div 
                className="p-1.5 sm:p-3 text-left"
                style={{ 
                  background: '#c8ffc8',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                }}
              >
                <h2 className="text-[10px] sm:text-xs font-bold mb-1 sm:mb-2 flex items-center gap-1" style={{ color: '#006400' }}>
                  <Coins className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  Token Holders
                </h2>
                <div className="space-y-0.5 sm:space-y-1 text-[8px] sm:text-[10px]" style={{ color: WIN95.text }}>
                  <div>🪙 <strong>FREE</strong> access</div>
                  <div>🚀 Coming soon</div>
                  <div>💎 Hold to earn</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show wallet selection for selected chain
  return (
    <div className="flex items-center justify-center h-full px-2 sm:px-4 py-2 overflow-hidden" style={{ position: 'relative', zIndex: 10 }}>
      <div className="w-full max-w-md md:max-w-xl mx-auto max-h-full flex flex-col">
        <button
          onClick={handleBack}
          className="mb-2 sm:mb-4 flex items-center gap-2 transition-all duration-300 btn-secondary text-sm md:text-base flex-shrink-0"
          style={{
            color: '#000000',
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
          }}
        >
          <ArrowRight className="w-4 h-4 md:w-5 md:h-5 rotate-180" />
          <span>Back</span>
        </button>

        <div className="glass-card rounded-xl p-6 md:p-8 space-y-4 md:space-y-6" style={{ 
          background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
          border: '2px outset #e8e8e8',
          boxShadow: 'inset 3px 3px 0 rgba(255, 255, 255, 1), inset -3px -3px 0 rgba(0, 0, 0, 0.25), 0 6px 12px rgba(0, 0, 0, 0.2)'
        }}>
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

          <div className="space-y-3 md:space-y-4 max-h-[50vh] overflow-y-auto">
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
      </div>
    </div>
  );
};

export default AuthPrompt;
