import React from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut, RefreshCw, Coins } from 'lucide-react';

const SimpleWalletConnect = () => {
  const {
    isConnected,
    address,
    credits,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    fetchCredits,
    isNFTHolder
  } = useSimpleWallet();

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (!isConnected) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 bg-purple-500/20 rounded-lg">
            <Wallet className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-sm font-semibold text-white">Connect Wallet</h3>
        </div>
        
        <button
          onClick={connectWallet}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center gap-2 py-2 text-sm"
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-green-500/20 rounded-lg">
            <Wallet className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-green-400">Connected</h3>
            <p className="text-xs text-gray-400 font-mono">{formatAddress(address)}</p>
          </div>
        </div>
        <button
          onClick={disconnectWallet}
          className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all duration-300 hover:scale-110"
          title="Disconnect"
        >
          <LogOut className="w-3.5 h-3.5 text-red-400" />
        </button>
      </div>

      <div className="space-y-2 pt-2 border-t border-white/10">
        <div className="flex items-center justify-between p-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
          <div className="flex items-center gap-1.5">
            <Coins className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-gray-300 text-sm font-medium">Credits:</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-purple-400 font-bold text-lg">
              {credits}
            </span>
            <button
              onClick={() => fetchCredits(address)}
              className="p-1 rounded-lg hover:bg-white/10 transition-all duration-300 hover:scale-110"
              title="Refresh credits"
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-400 hover:text-purple-400 transition-colors" />
            </button>
          </div>
        </div>
        
        {/* Pricing Info */}
        <div className="text-xs text-gray-400 p-2 bg-white/5 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="text-gray-300 text-xs">Pricing:</span>
            <span className="text-yellow-400 font-semibold text-xs">${isNFTHolder ? '0.06' : '0.15'}/credit</span>
          </div>
          {isNFTHolder && (
            <div className="flex items-center gap-1.5 text-purple-400 mt-1.5 pt-1.5 border-t border-purple-500/20">
              <span className="text-sm">✨</span>
              <span className="text-xs font-medium">NFT Holder Discount</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleWalletConnect;
