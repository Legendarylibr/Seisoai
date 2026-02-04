import React from 'react';
import { Wallet, Sparkles, MessageCircle, Image, Film, Music, Coins } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WIN95_COLORS as WIN95 } from './ui/Win95';

const AuthPrompt: React.FC = () => {
  return (
    <div 
      style={{ 
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'auto',
        padding: '50px 8px 32px 8px',
        background: '#008080',
        zIndex: 30
      }}
    >
      {/* Win95 Window Container - full width */}
      <div 
        className="text-center w-full slide-up"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 8px rgba(0,0,0,0.3)`,
          margin: 'auto 0'
        }}
      >
        {/* Win95 Title Bar */}
        <div 
          className="flex items-center gap-2 px-3 py-2"
          style={{ 
            background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
            color: '#ffffff',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <Sparkles className="w-5 h-5" />
          <span className="text-base font-bold flex-1 text-left">Welcome to Seiso AI</span>
          <div className="flex gap-1">
            <div className="w-5 h-5 flex items-center justify-center text-xs" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}` }}>_</div>
            <div className="w-5 h-5 flex items-center justify-center text-xs" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}` }}>□</div>
            <div className="w-5 h-5 flex items-center justify-center text-xs" style={{ background: WIN95.bg, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}` }}>×</div>
          </div>
        </div>

        {/* Window Content - larger padding */}
        <div style={{ padding: '16px' }}>
          {/* Hero Section */}
          <div className="mb-4 text-center">
            <h1 className="text-2xl font-bold mb-2" style={{ 
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

          {/* Connect Wallet Section */}
          <div 
            className="mb-4 py-2 px-4 inline-block"
            style={{
              background: WIN95.highlight,
              color: '#ffffff',
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            <span className="text-sm font-bold">▸ Connect Wallet to Get Started</span>
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
                      className="px-8 py-4 text-lg font-bold transition-all active:translate-y-px"
                      style={{
                        background: WIN95.bg,
                        color: WIN95.text,
                        boxShadow: `inset 2px 2px 0 ${WIN95.border.light}, inset -2px -2px 0 ${WIN95.border.darker}, inset 3px 3px 0 ${WIN95.bgLight}, inset -3px -3px 0 ${WIN95.bgDark}`,
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Wallet className="w-6 h-6" />
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
            className="mb-4 p-3 text-center"
            style={{
              background: WIN95.bgLight,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            <p className="text-xs" style={{ color: WIN95.textDisabled }}>
              Supports MetaMask, Coinbase, Rainbow, WalletConnect & 300+ wallets
            </p>
          </div>

          {/* Main Content Grid - Win95 Group Boxes */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div 
              className="p-3 text-center"
              style={{ 
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <MessageCircle className="w-6 h-6 mx-auto mb-1" style={{ color: WIN95.highlight }} />
              <div className="text-xs font-bold" style={{ color: WIN95.text }}>Chat</div>
            </div>
            <div 
              className="p-3 text-center"
              style={{ 
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <Image className="w-6 h-6 mx-auto mb-1" style={{ color: '#008000' }} />
              <div className="text-xs font-bold" style={{ color: WIN95.text }}>Images</div>
            </div>
            <div 
              className="p-3 text-center"
              style={{ 
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <Film className="w-6 h-6 mx-auto mb-1" style={{ color: '#800080' }} />
              <div className="text-xs font-bold" style={{ color: WIN95.text }}>Videos</div>
            </div>
            <div 
              className="p-3 text-center"
              style={{ 
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <Music className="w-6 h-6 mx-auto mb-1" style={{ color: '#b8860b' }} />
              <div className="text-xs font-bold" style={{ color: WIN95.text }}>Music</div>
            </div>
          </div>

          {/* Bottom Row - Free Access Info */}
          <div className="grid grid-cols-2 gap-2">
            <div 
              className="p-3 text-left"
              style={{ 
                background: '#ffffc8',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <h2 className="text-sm font-bold mb-1 flex items-center gap-1" style={{ color: '#b8860b' }}>
                <Wallet className="w-4 h-4" />
                NFT Holders
              </h2>
              <div className="text-xs space-y-0.5" style={{ color: WIN95.text }}>
                <div>🎨 <strong>FREE</strong> generation</div>
                <div>⚡ Priority queue</div>
                <div>🌟 Exclusive models</div>
              </div>
            </div>

            <div 
              className="p-3 text-left"
              style={{ 
                background: '#c8ffc8',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
            >
              <h2 className="text-sm font-bold mb-1 flex items-center gap-1" style={{ color: '#006400' }}>
                <Coins className="w-4 h-4" />
                Token Holders
              </h2>
              <div className="text-xs space-y-0.5" style={{ color: WIN95.text }}>
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
