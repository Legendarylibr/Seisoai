import React from 'react';
import { Wallet, Sparkles, MessageCircle, Image, Film, Music, Coins } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';

const AuthPrompt: React.FC = () => {
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

          {/* Connect Wallet Section */}
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

          {/* RainbowKit Connect Button */}
          <div className="mb-4 flex justify-center">
            <ConnectButton.Custom>
              {({ openConnectModal, mounted }) => {
                const ready = mounted;
                return (
                  <div
                    {...(!ready && {
                      'aria-hidden': true,
                      style: {
                        opacity: 0,
                        pointerEvents: 'none',
                        userSelect: 'none',
                      },
                    })}
                  >
                    <button
                      onClick={openConnectModal}
                      className="px-6 py-3 text-sm sm:text-base font-bold transition-all active:translate-y-px"
                      style={{
                        background: WIN95.bg,
                        color: WIN95.text,
                        boxShadow: `inset 2px 2px 0 ${WIN95.border.light}, inset -2px -2px 0 ${WIN95.border.darker}, inset 3px 3px 0 ${WIN95.bgLight}, inset -3px -3px 0 ${WIN95.bgDark}`,
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Wallet className="w-5 h-5" />
                        <span>Connect Wallet</span>
                      </div>
                    </button>
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>

          {/* Supported Wallets Info */}
          <div 
            className="mb-4 p-2 text-center"
            style={{
              background: WIN95.bgLight,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            <p className="text-[10px] sm:text-xs" style={{ color: WIN95.textDisabled }}>
              Supports MetaMask, Coinbase, Rainbow, WalletConnect & 300+ wallets
            </p>
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

            {/* Token Holder Benefits */}
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
};

export default AuthPrompt;
