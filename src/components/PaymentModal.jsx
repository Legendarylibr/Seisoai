import React, { useState } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { X, CreditCard, Coins, RefreshCw } from 'lucide-react';

const PaymentModal = ({ isOpen, onClose }) => {
  const { 
    address, 
    credits, 
    fetchCredits
  } = useSimpleWallet();
  const [amount, setAmount] = useState(10);
  const [selectedChain, setSelectedChain] = useState('ethereum');
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState('');

  const chains = [
    { id: 'ethereum', name: 'Ethereum', usdc: '0xA0b86a33E6441b8C4C8C0C4C0C4C0C4C0C4C0C4C' },
    { id: 'polygon', name: 'Polygon', usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174' },
    { id: 'arbitrum', name: 'Arbitrum', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
    { id: 'optimism', name: 'Optimism', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' },
    { id: 'base', name: 'Base', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' }
  ];

  const handlePayment = async () => {
    if (!address) return;

    setIsProcessing(true);
    try {
      // In a real implementation, you would:
      // 1. Generate a payment request
      // 2. User sends USDC to your wallet
      // 3. Verify the transaction
      // 4. Award credits

      // For demo purposes, we'll simulate the process
      const apiUrl = import.meta.env.VITE_API_URL;
      if (!apiUrl) {
        throw new Error('API URL not configured');
      }
      const response = await fetch(`${apiUrl}/api/payments/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transactionHash: txHash,
          chain: selectedChain,
          amount: amount,
          walletAddress: address
        })
      });

      if (response.ok) {
        const data = await response.json();
        await fetchCredits(address);
        onClose();
      } else {
        throw new Error('Payment verification failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      alert('Payment failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="glass-effect rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold">Buy Credits</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Current Credits */}
          <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
            <span className="text-sm text-gray-400">Current Credits:</span>
            <span className="text-lg font-semibold text-purple-400">{credits}</span>
          </div>

          {/* Amount Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount (USDC)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[10, 25, 50, 100, 250, 500].map((value) => (
                <button
                  key={value}
                  onClick={() => setAmount(value)}
                  className={`p-2 rounded text-sm font-medium transition-colors ${
                    amount === value
                      ? 'bg-purple-500 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  ${value}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
                className="w-full p-2 rounded bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
                placeholder="Custom amount"
                min="1"
                id="payment-amount-input"
                name="payment-amount"
              />
            </div>
          </div>

          {/* Chain Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Network
            </label>
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value)}
              className="w-full p-2 rounded bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
              id="payment-chain-select"
              name="payment-chain"
            >
              {chains.map((chain) => (
                <option key={chain.id} value={chain.id} className="bg-gray-800">
                  {chain.name}
                </option>
              ))}
            </select>
          </div>



          {/* Credits Preview */}
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">You'll receive:</span>
              <span className="text-lg font-semibold text-purple-400">
                {amount} Credits
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              1 USDC = 1 Credit
            </p>
          </div>

          {/* Transaction Hash Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Transaction Hash (after sending USDC)
            </label>
            <input
              type="text"
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
              className="w-full p-2 rounded bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
              placeholder="0x..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 btn-secondary py-2"
            >
              Cancel
            </button>
            <button
              onClick={handlePayment}
              disabled={isProcessing || !txHash}
              className="flex-1 btn-primary py-2 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Coins className="w-4 h-4" />
                  <span>Verify Payment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
