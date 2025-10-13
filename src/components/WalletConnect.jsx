import React, { useState } from 'react';
import { useMultiWallet } from '../contexts/MultiWalletContext';
import { Wallet, LogOut, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

const WalletConnect = () => {
  const {
    isConnected,
    address,
    chainId,
    balance,
    credits,
    isLoading,
    error,
    walletType,
    walletName,
    connectWallet,
    connectEVMWallet,
    connectSolanaWallet,
    connectWalletUniversal,
    disconnectWallet,
    refreshCredits,
    discountInfo,
    hasFreeAccess,
    isCheckingDiscounts,
    ownedNFTs,
    tokenBalances
  } = useMultiWallet();

  const [showWalletOptions, setShowWalletOptions] = useState(false);

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getChainName = (chainId) => {
    if (chainId === 'solana') return 'Solana';
    const chains = {
      '1': 'Ethereum',
      '137': 'Polygon',
      '42161': 'Arbitrum',
      '10': 'Optimism',
      '8453': 'Base'
    };
    return chains[chainId] || `Chain ${chainId}`;
  };

  const getWalletIcon = (walletName) => {
    const icons = {
      'metamask': '🦊',
      'rabby': '🐰',
      'coinbase': '🔵',
      'phantom': '👻',
      'solflare': '☀️',
      'walletconnect': '🔗',
      'generic': '💳',
      'unknown': '❓'
    };
    return icons[walletName] || '💳';
  };

  const walletOptions = [
    { id: 'metamask', name: 'MetaMask', type: 'evm', icon: '🦊' },
    { id: 'rabby', name: 'Rabby', type: 'evm', icon: '🐰' },
    { id: 'phantom', name: 'Phantom', type: 'solana', icon: '👻' },
    { id: 'solflare', name: 'Solflare', type: 'solana', icon: '☀️' },
    { id: 'coinbase', name: 'Coinbase Wallet', type: 'evm', icon: '🔵' }
  ];

  if (!isConnected) {
    return (
      <div className="glass-effect rounded-lg p-4">
        <div className="flex items-center gap-3 mb-3">
          <Wallet className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="text-sm font-semibold">Connect Wallet</h3>
            <p className="text-xs text-gray-400">Choose your preferred wallet</p>
          </div>
        </div>
        
        {/* Quick Connect Button */}
        <button
          onClick={() => {
            console.log('🖱️ Connect Wallet button clicked');
            if (showWalletOptions) {
              console.log('📋 Closing wallet options');
              setShowWalletOptions(false);
            } else {
              console.log('📋 Showing wallet options for user selection');
              setShowWalletOptions(true);
            }
          }}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center gap-2 py-2"
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
              {showWalletOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </>
          )}
        </button>

        {/* Wallet Options */}
        {showWalletOptions && (
          <div className="mt-3 space-y-2">
            {walletOptions.map((wallet) => (
              <button
                key={wallet.id}
                onClick={() => connectWalletUniversal(wallet.id)}
                disabled={isLoading}
                className="w-full flex items-center gap-3 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left"
              >
                <span className="text-lg">{wallet.icon}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{wallet.name}</div>
                  <div className="text-xs text-gray-400 capitalize">{wallet.type}</div>
                </div>
              </button>
            ))}
          </div>
        )}



        {error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
            <div className="mb-2">{error}</div>
            <button
              onClick={() => {
                console.log('🔄 Retrying wallet connection...');
                if (window.ethereum) {
                  connectWallet();
                } else if (window.solana) {
                  connectWalletUniversal('phantom');
                } else {
                  setShowWalletOptions(true);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="glass-effect rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getWalletIcon(walletName)}</span>
          <div>
            <h3 className="text-sm font-semibold text-green-400">Connected</h3>
            <p className="text-xs text-gray-400">{formatAddress(address)}</p>
            <p className="text-xs text-purple-400">
              {walletName === 'generic' ? 'EVM Wallet' : walletName?.charAt(0).toUpperCase() + walletName?.slice(1)} • {walletType?.toUpperCase()}
            </p>
          </div>
        </div>
        <button
          onClick={disconnectWallet}
          className="p-1 rounded hover:bg-white/10 transition-colors"
          title="Disconnect"
        >
          <LogOut className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="space-y-2">
        {/* Chain Info */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Network:</span>
          <span className="text-white">{getChainName(chainId)}</span>
        </div>

        {/* Balance */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Balance:</span>
          <span className="text-white">
            {parseFloat(balance).toFixed(4)} {walletType === 'solana' ? 'SOL' : 'ETH'}
          </span>
        </div>

        {/* Credits */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Credits:</span>
          <div className="flex items-center gap-1">
            <span className="text-purple-400 font-semibold">
              {hasFreeAccess ? '∞' : credits}
            </span>
            <button
              onClick={refreshCredits}
              className="p-0.5 rounded hover:bg-white/10 transition-colors"
              title="Refresh credits"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Discount Information */}
        {discountInfo && (
          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center gap-1 text-xs">
              <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-green-400 font-medium">
                {discountInfo.message}
              </span>
            </div>
            {hasFreeAccess && (
              <div className="text-xs text-yellow-400 mt-1">
                🎉 Free access granted!
              </div>
            )}
          </div>
        )}

        {/* NFT Holdings Summary */}
        {ownedNFTs && ownedNFTs.length > 0 && (
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-gray-400 mb-1">NFT Holdings:</div>
            <div className="text-xs text-purple-400">
              {ownedNFTs.filter(nft => nft.owns).length} qualifying NFTs
            </div>
          </div>
        )}

        {/* Token Holdings Summary */}
        {tokenBalances && tokenBalances.length > 0 && (
          <div className="pt-2 border-t border-white/10">
            <div className="text-xs text-gray-400 mb-1">Token Holdings:</div>
            <div className="text-xs text-purple-400">
              {tokenBalances.filter(token => parseFloat(token.formattedBalance) > 0).length} qualifying tokens
            </div>
          </div>
        )}

        {/* View on Explorer */}
        <div className="pt-2 border-t border-white/10">
          <a
            href={
              walletType === 'solana' 
                ? `https://solscan.io/account/${address}`
                : `https://etherscan.io/address/${address}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            View on {walletType === 'solana' ? 'Solscan' : 'Etherscan'}
          </a>
        </div>
      </div>
    </div>
  );
};

export default WalletConnect;
