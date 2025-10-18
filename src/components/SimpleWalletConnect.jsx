import React from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut, RefreshCw } from 'lucide-react';

const SimpleWalletConnect = () => {
  const {
    isConnected,
    address,
    credits,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    fetchCredits
  } = useSimpleWallet();

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div className="glass-effect rounded p-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-5 h-5 text-purple-400" />
          <h3 className="text-lg font-semibold">Connect Wallet</h3>
        </div>
        
        <button
          onClick={connectWallet}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center gap-2 py-3"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 animate-spin">⏳</div>
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
          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass-effect rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-green-400" />
          <div>
            <h3 className="text-lg font-semibold text-green-400">Connected</h3>
            <p className="text-sm text-gray-400">{formatAddress(address)}</p>
          </div>
        </div>
        <button
          onClick={disconnectWallet}
          className="p-2 rounded hover:bg-red-500/10 transition-colors"
          title="Disconnect"
        >
          <LogOut className="w-4 h-4 text-red-400" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-gray-400">Credits:</span>
          <div className="flex items-center gap-2">
            <span className="text-purple-400 font-semibold text-lg">
              {credits}
            </span>
            <button
              onClick={() => fetchCredits(address)}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Refresh credits"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SimpleWalletConnect;
