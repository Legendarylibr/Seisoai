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
      <div className="glass-card rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Wallet className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Connect Wallet</h3>
        </div>
        
        <button
          onClick={connectWallet}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center gap-2 py-3"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className="w-5 h-5" />
              <span>Connect Wallet</span>
            </>
          )}
        </button>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400 slide-up">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass-card rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Wallet className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-green-400">Connected</h3>
            <p className="text-sm text-gray-400 font-mono">{formatAddress(address)}</p>
          </div>
        </div>
        <button
          onClick={disconnectWallet}
          className="p-2 rounded-lg hover:bg-red-500/20 transition-all duration-300 hover:scale-110"
          title="Disconnect"
        >
          <LogOut className="w-4 h-4 text-red-400" />
        </button>
      </div>

      <div className="space-y-3 pt-3 border-t border-white/10">
        <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-purple-400" />
            <span className="text-gray-300 font-medium">Credits:</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-purple-400 font-bold text-xl">
              {credits}
            </span>
            <button
              onClick={() => fetchCredits(address)}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-all duration-300 hover:scale-110"
              title="Refresh credits"
            >
              <RefreshCw className="w-4 h-4 text-gray-400 hover:text-purple-400 transition-colors" />
            </button>
          </div>
        </div>
        
        {/* Pricing Info */}
        <div className="text-xs text-gray-400 p-3 bg-white/5 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-300">Pricing:</span>
            <span className="text-yellow-400 font-semibold">${isNFTHolder ? '0.06' : '0.15'}/credit</span>
          </div>
          {isNFTHolder && (
            <div className="flex items-center gap-2 text-purple-400 mt-2 pt-2 border-t border-purple-500/20">
              <span className="text-base">✨</span>
              <span className="text-xs font-medium">NFT Holder Discount Applied</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleWalletConnect;
