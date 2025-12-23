import React from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut } from 'lucide-react';

const SimpleWalletConnect = () => {
  const {
    isConnected,
    address,
    isLoading,
    error,
    connectWallet,
    disconnectWallet
  } = useSimpleWallet();

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="p-1 rounded" style={{ 
            background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
            border: '2px outset #e0e0e0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}>
            <Wallet className="w-3 h-3" style={{ color: '#000000' }} />
          </div>
          <h3 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Connect Wallet</h3>
        </div>
        
        <button
          onClick={connectWallet}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center gap-1.5 py-1.5 text-xs"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </>
          )}
        </button>

        {error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 slide-up">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded" style={{ 
            background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
            border: '2px outset #e0e0e0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}>
            <Wallet className="w-3 h-3" style={{ color: '#000000' }} />
          </div>
          <div>
            <h3 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Connected</h3>
            <p className="text-xs font-mono" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>{formatAddress(address)}</p>
          </div>
        </div>
        <button
          onClick={disconnectWallet}
          className="p-1 rounded transition-all duration-300"
          style={{
            background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
            border: '2px outset #f0f0f0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}
          title="Disconnect"
        >
          <LogOut className="w-3 h-3" style={{ color: '#000000' }} />
        </button>
      </div>

    </div>
  );
};

export default SimpleWalletConnect;
