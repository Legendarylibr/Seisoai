import React, { memo } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut, Coins, RefreshCw } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';

const SimpleWalletConnect: React.FC = () => {
  const { address, credits, isLoading, isNFTHolder, fetchCredits, disconnectWallet } = useSimpleWallet();

  const formatAddr = (addr: string | null): string => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';
  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits ?? 0) || 0);

  return (
    <div style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
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
                    <div>
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
                        <h3 className="text-[11px] font-bold" style={{ color: WIN95.text }}>Connect Wallet</h3>
                      </div>
                      <button 
                        onClick={openConnectModal}
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold transition-none select-none"
                        style={{
                          background: WIN95.buttonFace,
                          color: isLoading ? WIN95.textDisabled : WIN95.text,
                          border: 'none',
                          boxShadow: isLoading
                            ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
                            : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                          cursor: isLoading ? 'default' : 'pointer',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                        }}
                      >
                        {isLoading ? (
                          <>
                            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: WIN95.bgDark, borderTopColor: 'transparent' }} />
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <Wallet className="w-4 h-4" />
                            <span>Connect Wallet</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                }

                if (chain.unsupported) {
                  return (
                    <button 
                      onClick={openChainModal} 
                      className="w-full py-2 text-[11px] font-bold"
                      style={{
                        background: '#800000',
                        color: 'white',
                        border: 'none',
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                        cursor: 'pointer'
                      }}
                    >
                      Wrong network - Click to switch
                    </button>
                  );
                }

                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={openChainModal}
                          className="p-1 text-lg"
                          style={{
                            background: WIN95.buttonFace,
                            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                            border: 'none',
                            cursor: 'pointer'
                          }}
                          title="Switch Network"
                        >
                          {chain.hasIcon && chain.iconUrl ? (
                            <img
                              alt={chain.name ?? 'Chain icon'}
                              src={chain.iconUrl}
                              style={{ width: 16, height: 16 }}
                            />
                          ) : (
                            <Wallet className="w-3 h-3" style={{ color: WIN95.text }} />
                          )}
                        </button>
                        <div>
                          <button
                            onClick={openAccountModal}
                            className="text-[11px] font-bold block"
                            style={{ 
                              color: WIN95.text, 
                              background: 'none', 
                              border: 'none', 
                              cursor: 'pointer',
                              padding: 0 
                            }}
                          >
                            {chain.name}
                          </button>
                          <p className="text-[10px] font-mono" style={{ color: WIN95.textDisabled }}>
                            {formatAddr(address)}
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => disconnectWallet()} 
                        className="p-1"
                        style={{
                          background: WIN95.buttonFace,
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                          border: 'none',
                          cursor: 'pointer'
                        }}
                        title="Disconnect"
                      >
                        <LogOut className="w-3 h-3" style={{ color: WIN95.text }} />
                      </button>
                    </div>

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
                          <span className="font-bold">$0.06/credit</span>
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
