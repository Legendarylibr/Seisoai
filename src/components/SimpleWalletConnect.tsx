import React, { memo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, Coins, RefreshCw } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';

const SimpleWalletConnect: React.FC = () => {
  const { 
    isConnected, 
    address, 
    credits, 
    isLoading, 
    isNFTHolder, 
    fetchCredits 
  } = useSimpleWallet();

  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits ?? 0) || 0);

  return (
    <div style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <div 
          className="p-1"
          style={{
            background: WIN95.buttonFace,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
          }}
        >
          <Wallet className="w-3 h-3" style={{ color: WIN95.text }} />
        </div>
        <h3 className="text-[11px] font-bold" style={{ color: WIN95.text }}>
          {isConnected ? 'Wallet Connected' : 'Connect Wallet'}
        </h3>
      </div>

      {/* RainbowKit Connect Button */}
      <ConnectButton.Custom>
        {({
          account,
          chain,
          openAccountModal,
          openChainModal,
          openConnectModal,
          mounted,
        }) => {
          const ready = mounted;
          const connected = ready && account && chain;

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
              {(() => {
                if (!connected) {
                  return (
                    <button
                      onClick={openConnectModal}
                      type="button"
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-none select-none"
                      style={{
                        background: WIN95.buttonFace,
                        color: WIN95.text,
                        border: 'none',
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                        cursor: 'pointer',
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                      }}
                    >
                      <Wallet className="w-4 h-4" />
                      <span>Connect Wallet</span>
                    </button>
                  );
                }

                if (chain.unsupported) {
                  return (
                    <button
                      onClick={openChainModal}
                      type="button"
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-none select-none"
                      style={{
                        background: '#800000',
                        color: '#ffffff',
                        border: 'none',
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                        cursor: 'pointer',
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                      }}
                    >
                      ⚠️ Wrong Network
                    </button>
                  );
                }

                return (
                  <div className="space-y-1.5">
                    {/* Account & Chain Row */}
                    <div className="flex items-center gap-1">
                      {/* Chain Button */}
                      <button
                        onClick={openChainModal}
                        type="button"
                        className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-bold transition-none select-none"
                        style={{
                          background: WIN95.buttonFace,
                          color: WIN95.text,
                          border: 'none',
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                          cursor: 'pointer',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        }}
                      >
                        {chain.hasIcon && (
                          <div
                            style={{
                              background: chain.iconBackground,
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              overflow: 'hidden',
                            }}
                          >
                            {chain.iconUrl && (
                              <img
                                alt={chain.name ?? 'Chain icon'}
                                src={chain.iconUrl}
                                style={{ width: 14, height: 14 }}
                              />
                            )}
                          </div>
                        )}
                        <span className="hidden sm:inline">{chain.name}</span>
                      </button>

                      {/* Account Button */}
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="flex-1 flex items-center justify-between gap-1 px-2 py-1.5 text-[10px] font-bold transition-none select-none"
                        style={{
                          background: WIN95.buttonFace,
                          color: WIN95.text,
                          border: 'none',
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                          cursor: 'pointer',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        }}
                      >
                        <span className="font-mono">{account.displayName}</span>
                        {account.displayBalance && (
                          <span style={{ color: WIN95.textDisabled }}>
                            ({account.displayBalance})
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Credits Section */}
                    <div className="pt-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
                      <div 
                        className="flex items-center justify-between p-1 mb-1"
                        style={{
                          background: WIN95.inputBg,
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <Coins className="w-3 h-3" style={{ color: WIN95.text }} />
                          <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>Credits:</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-[11px]" style={{ color: WIN95.text }}>{displayCredits}</span>
                          <button 
                            onClick={() => address && fetchCredits(address)} 
                            className="p-0.5"
                            style={{
                              background: WIN95.buttonFace,
                              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                              border: 'none',
                              cursor: 'pointer'
                            }}
                            title="Refresh"
                          >
                            <RefreshCw className="w-3 h-3" style={{ color: WIN95.text }} />
                          </button>
                        </div>
                      </div>

                      {/* Pricing Info */}
                      <div 
                        className="text-[9px] p-1"
                        style={{
                          background: WIN95.bgLight,
                          border: `1px solid ${WIN95.bgDark}`,
                          color: WIN95.text
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <span style={{ color: WIN95.textDisabled }}>Pricing:</span>
                          <span className="font-bold">${isNFTHolder ? '0.06' : '0.15'}/credit</span>
                        </div>
                        {isNFTHolder && (
                          <div className="flex items-center gap-1 text-[9px] mt-1 pt-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
                            ✨ <span className="font-bold">NFT Holder Discount</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        }}
      </ConnectButton.Custom>
    </div>
  );
};

export default memo(SimpleWalletConnect);
