import React from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw, Wallet } from 'lucide-react';

const EmailUserInfo = ({ onShowStripePayment }) => {
  const { 
    email, 
    credits, 
    isNFTHolder,
    linkedWalletAddress,
    refreshCredits,
    signOut,
    connectWallet
  } = useEmailAuth();

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/20 rounded-lg">
            <Mail className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-blue-400">Signed In</h3>
            <p className="text-xs text-gray-400">{email}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all duration-300 hover:scale-110"
          title="Sign Out"
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
              onClick={refreshCredits}
              className="p-1 rounded-lg hover:bg-white/10 transition-all duration-300 hover:scale-110"
              title="Refresh credits"
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-400 hover:text-purple-400 transition-colors" />
            </button>
          </div>
        </div>

        {/* Optional Wallet Connection */}
        {!linkedWalletAddress && (
          <div className="p-2 bg-white/5 rounded-lg border border-white/10">
            <p className="text-xs text-gray-400 mb-2">Connect wallet for NFT discounts (optional)</p>
            <button
              onClick={() => connectWallet('metamask').catch(() => {})}
              className="w-full flex items-center justify-center gap-2 py-1.5 text-xs bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <Wallet className="w-3.5 h-3.5 text-purple-400" />
              <span>Connect Wallet</span>
            </button>
          </div>
        )}

        {linkedWalletAddress && (
          <div className="p-2 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs text-gray-300">Wallet:</span>
                <span className="text-xs text-gray-400 font-mono">{formatAddress(linkedWalletAddress)}</span>
              </div>
            </div>
            {isNFTHolder && (
              <div className="flex items-center gap-1.5 text-purple-400 mt-1.5 pt-1.5 border-t border-purple-500/20">
                <span className="text-sm">✨</span>
                <span className="text-xs font-medium">NFT Holder Discount Active</span>
              </div>
            )}
          </div>
        )}

        {/* Buy Credits Button */}
        {credits <= 0 && (
          <button
            onClick={onShowStripePayment}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-semibold rounded-lg transition-all duration-200 hover:scale-105 shadow-lg"
          >
            <Coins className="w-4 h-4" />
            <span>Buy Credits</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default EmailUserInfo;

