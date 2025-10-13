import React, { useState } from 'react';
import { useMultiWallet } from '../contexts/MultiWalletContext';
import { Wallet, ArrowRight, Sparkles } from 'lucide-react';
import WalletErrorHandler from './WalletErrorHandler';

const MultiWalletConnect = () => {
  const {
    isConnected,
    address,
    chainId,
    balance,
    walletName,
    isLoading,
    error,
    connectWallet,
    connectWalletUniversal,
    disconnectWallet,
    switchChain,
    detectWallets,
    getChainInfo,
    formatAddress,
    SUPPORTED_CHAINS
  } = useMultiWallet();

  const [showChainSelection, setShowChainSelection] = useState(false);
  const [selectedChain, setSelectedChain] = useState(null);

  const chainOptions = [
    { id: 'evm', name: 'Ethereum', icon: '⟠', description: 'EVM Compatible Chains' },
    { id: 'solana', name: 'Solana', icon: '◎', description: 'Solana Blockchain' }
  ];

  const evmWallets = [
    { id: 'metamask', name: 'MetaMask', icon: '🦊' },
    { id: 'rabby', name: 'Rabby', icon: '🐰' },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵' }
  ];

  const solanaWallets = [
    { id: 'phantom', name: 'Phantom', icon: '👻' },
    { id: 'solflare', name: 'Solflare', icon: '☀️' }
  ];

  const handleChainSelect = (chainId) => {
    setSelectedChain(chainId);
  };

  const handleWalletSelect = (walletId) => {
    console.log(`🖱️ Wallet selected: ${walletId}`);
    console.log(`🔍 Selected chain: ${selectedChain}`);
    console.log(`🔍 Available wallets:`, selectedChain === 'evm' ? evmWallets : solanaWallets);
    connectWalletUniversal(walletId);
  };

  const handleBack = () => {
    setSelectedChain(null);
  };

  // If connected, show the connected state
  if (isConnected) {
    const chainInfo = getChainInfo(chainId);
    return (
      <div className="glass-effect rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{chainInfo.icon}</span>
            <div>
              <h3 className="text-sm font-semibold text-green-400">Connected</h3>
              <p className="text-xs text-gray-400">{formatAddress(address)}</p>
              <p className="text-xs text-purple-400">
                {walletName?.charAt(0).toUpperCase() + walletName?.slice(1)} • {chainInfo.name}
              </p>
            </div>
          </div>
          <button
            onClick={disconnectWallet}
            className="p-1 rounded hover:bg-white/10 transition-colors"
            title="Disconnect"
          >
            <span className="text-gray-400">✕</span>
          </button>
        </div>

        {/* Balance */}
        {balance && (
          <div className="mb-3 p-2 bg-white/5 rounded text-xs">
            <div className="text-gray-400">Balance</div>
            <div className="text-white font-medium">{balance} {chainInfo.symbol}</div>
          </div>
        )}
      </div>
    );
  }

  // Show the original beautiful introduction screen
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-2xl mx-auto">
        {/* Wallet Error Handler */}
        <WalletErrorHandler />
        
        {/* Hero Section */}
        <div className="mb-8">
          <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">
            Welcome to Seiso AI
          </h1>
          <p className="text-xl text-gray-300 mb-2">
            Create stunning AI-generated images with your preferred style
          </p>
          <p className="text-gray-400">
            Connect your wallet to get started and access exclusive NFT holder discounts
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-2xl mb-2">🎨</div>
            <h3 className="font-semibold text-white mb-1">20+ Styles</h3>
            <p className="text-sm text-gray-400">Choose from photorealistic to artistic styles</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-2xl mb-2">💳</div>
            <h3 className="font-semibold text-white mb-1">NFT Discounts</h3>
            <p className="text-sm text-gray-400">Free access for qualifying NFT holders</p>
          </div>
          <div className="p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="text-2xl mb-2">⚡</div>
            <h3 className="font-semibold text-white mb-1">Fast Generation</h3>
            <p className="text-sm text-gray-400">High-quality images in seconds</p>
          </div>
        </div>

        {/* Wallet Connection */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Connect Your Wallet
          </h2>
          
          {/* Chain Selection */}
          {!selectedChain ? (
            <>
              {/* Main Connect Button */}
              <button
                onClick={() => setShowChainSelection(!showChainSelection)}
                disabled={isLoading}
                className="btn-primary flex items-center justify-center gap-3 px-8 py-4 text-lg mx-auto"
              >
                {isLoading ? (
                  <>
                    <div className="w-6 h-6 animate-spin">⏳</div>
                    <span>Connecting...</span>
                  </>
                ) : (
                  <>
                    <Wallet className="w-6 h-6" />
                    <span>Choose Blockchain</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>

              {/* Chain Options */}
              {showChainSelection && (
                <div className="mt-6 space-y-3 max-w-md mx-auto">
                  {chainOptions.map((chain) => (
                    <button
                      key={chain.id}
                      onClick={() => handleChainSelect(chain.id)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 transition-all duration-200 hover:scale-105"
                    >
                      <span className="text-2xl">{chain.icon}</span>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-white">{chain.name}</div>
                        <div className="text-sm text-gray-400">{chain.description}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Wallet Selection for Selected Chain */
            <div className="space-y-4">
              {/* Back Button */}
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mx-auto"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                <span>Back to Blockchain Selection</span>
              </button>

              {/* Chain Header */}
              <div className="text-center">
                <h3 className="text-xl font-semibold text-white mb-2">
                  {selectedChain === 'evm' ? '⟠ Ethereum Wallets' : '◎ Solana Wallets'}
                </h3>
                <p className="text-gray-400 text-sm">
                  Choose your {selectedChain === 'evm' ? 'EVM' : 'Solana'} wallet
                </p>
              </div>

              {/* Wallet Options */}
              <div className="space-y-3 max-w-md mx-auto">
                {(selectedChain === 'evm' ? evmWallets : solanaWallets).map((wallet) => (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletSelect(wallet.id)}
                    disabled={isLoading}
                    className="w-full flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 transition-all duration-200 hover:scale-105 disabled:opacity-50"
                  >
                    <span className="text-2xl">{wallet.icon}</span>
                    <div className="flex-1 text-left">
                      <div className="font-semibold text-white">{wallet.name}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Benefits */}
          <div className="mt-8 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
            <h3 className="font-semibold text-purple-300 mb-2">Why connect a wallet?</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Secure authentication and credit management</li>
              <li>• Access to NFT holder discounts and free generation</li>
              <li>• Purchase credits with USDC for image generation</li>
              <li>• Track your generation history and gallery</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MultiWalletConnect;
