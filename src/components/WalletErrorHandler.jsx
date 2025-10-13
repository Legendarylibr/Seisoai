import React, { useState, useEffect } from 'react';
import { useMultiWallet } from '../contexts/MultiWalletContext';
import { detectWalletExtensions } from '../utils/walletUtils';
import { Wallet, AlertCircle, CheckCircle, XCircle, RefreshCw, Download } from 'lucide-react';

const WalletErrorHandler = () => {
  const { error, isLoading, isConnected } = useMultiWallet();
  const [availableWallets, setAvailableWallets] = useState({});
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const wallets = detectWalletExtensions();
    setAvailableWallets(wallets);
  }, []);

  if (!error) return null;

  const getErrorIcon = () => {
    if (error.includes('cancelled') || error.includes('rejected')) {
      return <XCircle className="w-5 h-5 text-yellow-400" />;
    }
    if (error.includes('not detected') || error.includes('not installed')) {
      return <Download className="w-5 h-5 text-blue-400" />;
    }
    return <AlertCircle className="w-5 h-5 text-red-400" />;
  };

  const getErrorType = () => {
    if (error.includes('cancelled') || error.includes('rejected')) {
      return 'user_cancelled';
    }
    if (error.includes('not detected') || error.includes('not installed')) {
      return 'wallet_not_found';
    }
    return 'connection_error';
  };

  const errorType = getErrorType();

  const getSuggestedAction = () => {
    switch (errorType) {
      case 'user_cancelled':
        return 'You cancelled the wallet connection. Click "Connect Wallet" to try again.';
      case 'wallet_not_found':
        return 'Please install a compatible wallet extension to continue.';
      case 'connection_error':
        return 'There was an issue connecting to your wallet. Please try again.';
      default:
        return 'Please try connecting your wallet again.';
    }
  };

  const getAvailableWalletInfo = () => {
    const available = Object.entries(availableWallets).filter(([_, isAvailable]) => isAvailable);
    if (available.length === 0) {
      return 'No wallet extensions detected. Please install MetaMask, Phantom, or another compatible wallet.';
    }
    return `Detected wallets: ${available.map(([name]) => name).join(', ')}`;
  };

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-4">
      <div className="flex items-start gap-3">
        {getErrorIcon()}
        <div className="flex-1">
          <h3 className="text-red-300 font-medium mb-1">Wallet Connection Error</h3>
          <p className="text-red-200 text-sm mb-2">{error}</p>
          <p className="text-red-200/80 text-xs mb-3">{getSuggestedAction()}</p>
          
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-red-300 hover:text-red-200 text-xs underline"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-red-300 hover:text-red-200 text-xs underline flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh Page
            </button>
          </div>

          {showDetails && (
            <div className="bg-red-500/5 border border-red-500/10 rounded p-3 text-xs">
              <p className="text-red-200/80 mb-2">{getAvailableWalletInfo()}</p>
              <div className="text-red-200/60">
                <p className="mb-1">Available wallet extensions:</p>
                <ul className="list-disc list-inside space-y-1">
                  {Object.entries(availableWallets).map(([name, isAvailable]) => (
                    <li key={name} className={isAvailable ? 'text-green-300' : 'text-red-300'}>
                      {name}: {isAvailable ? '✅ Available' : '❌ Not detected'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletErrorHandler;
