import React, { useState } from 'react';
import { useMultiWallet } from '../contexts/MultiWalletContext';
import { detectWalletExtensions } from '../utils/walletUtils';
import { Wallet, AlertCircle, CheckCircle, XCircle } from 'lucide-react';

const WalletConnectionStatus = () => {
  const { isConnected, address, error, isLoading } = useMultiWallet();
  const [availableWallets, setAvailableWallets] = useState({});

  React.useEffect(() => {
    const wallets = detectWalletExtensions();
    setAvailableWallets(wallets);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
        <span className="text-blue-300 text-sm">Connecting wallet...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
        <XCircle className="w-4 h-4 text-red-400" />
        <span className="text-red-300 text-sm">{error}</span>
      </div>
    );
  }

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
        <CheckCircle className="w-4 h-4 text-green-400" />
        <span className="text-green-300 text-sm">
          Connected: {address.slice(0, 6)}...{address.slice(-4)}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-gray-500/10 border border-gray-500/20 rounded-lg">
      <Wallet className="w-4 h-4 text-gray-400" />
      <span className="text-gray-300 text-sm">No wallet connected</span>
    </div>
  );
};

export default WalletConnectionStatus;
