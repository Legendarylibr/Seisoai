import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { ethers } from 'ethers';
import { 
  getAvailableTokens, 
  getTokenBalance, 
  getSolanaTokenBalance,
  validatePayment,
  calculateCredits,
  transferToPaymentWallet,
  verifyPayment,
  getPaymentWallet
} from '../services/paymentService';
import { X, CreditCard, Coins, RefreshCw, ChevronDown, ChevronUp, Wallet } from 'lucide-react';

const TokenPaymentModal = ({ isOpen, onClose }) => {
  const { 
    address, 
    credits, 
    fetchCredits
  } = useSimpleWallet();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableTokens, setAvailableTokens] = useState([]);
  const [tokenBalances, setTokenBalances] = useState({});
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [error, setError] = useState('');

  // Load available tokens when modal opens
  useEffect(() => {
    if (isOpen) {
      const tokens = getAvailableTokens('0x1', 'evm'); // Default to Ethereum
      setAvailableTokens(tokens);
      if (tokens.length > 0) {
        setSelectedToken(tokens[0]);
      }
    }
  }, [isOpen]);

  // Load token balances when token is selected
  useEffect(() => {
    if (selectedToken && address) {
      loadTokenBalance(selectedToken);
    }
  }, [selectedToken, address]);

  const loadTokenBalance = async (token) => {
    try {
      // Simplified - just set a placeholder balance
      setTokenBalances(prev => ({
        ...prev,
        [token.symbol]: '0.0'
      }));
    } catch (error) {
      console.error('Error loading token balance:', error);
    }
  };

  const handleTokenSelect = (token) => {
    setSelectedToken(token);
    setShowTokenSelector(false);
    setAmount('');
    setError('');
  };

  const handleAmountChange = (value) => {
    setAmount(value);
    setError('');
  };

  const validateAmount = () => {
    if (!selectedToken || !amount) {
      setError('Please select a token and enter an amount');
      return false;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount');
      return false;
    }

    // Simplified validation
    if (numAmount <= 0) {
      setError('Amount must be greater than 0');
      return false;
    }

    return true;
  };

  const handlePayment = async () => {
    if (!address) return;

    if (!validateAmount()) return;

    setIsProcessing(true);
    setError('');

    try {
      // Simplified payment - just add credits directly
      const numAmount = parseFloat(amount);
      const creditsToAdd = Math.floor(numAmount * 10); // 1 token = 10 credits
      
      // Call backend to add credits
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/admin/add-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          credits: creditsToAdd,
          reason: 'Token payment'
        })
      });

      if (response.ok) {
        await fetchCredits(address);
        onClose();
      } else {
        throw new Error('Payment failed');
      }
    } catch (error) {
      console.error('Payment error:', error);
      setError(error.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const getCreditsPreview = () => {
    if (!selectedToken || !amount) return 0;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return 0;
    
    // For now, use base rate - this should be enhanced to check NFT ownership
    return Math.floor(numAmount * 10); // 1 token = 10 credits
  };

  const getTokenBalance = (tokenSymbol) => {
    return tokenBalances[tokenSymbol]?.formattedBalance || '0';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-white/20 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <Coins className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Buy Credits</h2>
              <p className="text-sm text-gray-400">Purchase credits with tokens</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Current Credits */}
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Current Credits:</span>
              <span className="text-lg font-semibold text-purple-400">
                {credits}
              </span>
            </div>
          </div>


          {/* Token Selection */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Select Token
            </label>
            
            <div className="relative">
              <button
                onClick={() => setShowTokenSelector(!showTokenSelector)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/20 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {selectedToken ? (
                    <>
                      <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {selectedToken.symbol.charAt(0)}
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-white">{selectedToken.symbol}</div>
                        <div className="text-xs text-gray-400">{selectedToken.name}</div>
                      </div>
                    </>
                  ) : (
                    <span className="text-gray-400">Select a token</span>
                  )}
                </div>
                {showTokenSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {/* Token Options */}
              {showTokenSelector && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-white/20 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
                  {availableTokens.map((token) => (
                    <button
                      key={token.symbol}
                      onClick={() => handleTokenSelect(token)}
                      className="w-full flex items-center gap-3 p-3 hover:bg-white/10 transition-colors"
                    >
                      <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {token.symbol.charAt(0)}
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-medium text-white">{token.symbol}</div>
                        <div className="text-xs text-gray-400">{token.name}</div>
                      </div>
                      <div className="text-xs text-gray-400">
                        Balance: {getTokenBalance(token.symbol)}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Amount
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Enter amount"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
                step="0.000001"
                min="0"
                id="token-amount-input"
                name="token-amount"
              />
              {selectedToken && (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                  {selectedToken.symbol}
                </div>
              )}
            </div>
            {selectedToken && (
              <div className="text-xs text-gray-400">
                Balance: {getTokenBalance(selectedToken.symbol)} {selectedToken.symbol}
                {selectedToken.minAmount && (
                  <span className="ml-2">• Min: {selectedToken.minAmount}</span>
                )}
              </div>
            )}
          </div>

          {/* Credits Preview */}
          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">You'll receive:</span>
              <span className="text-lg font-semibold text-purple-400">
                {getCreditsPreview()} Credits
              </span>
            </div>
            {selectedToken && (
              <p className="text-xs text-gray-400 mt-1">
                1 {selectedToken.symbol} = {selectedToken.creditRate} Credit{selectedToken.creditRate !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Payment Wallet Info */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">Payment Details</span>
            </div>
            <div className="text-xs text-gray-300">
              <p className="mb-1">Payment will be processed automatically</p>
              <p className="mt-2 text-gray-400">
                Transaction will be verified automatically after confirmation
              </p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 btn-secondary py-3"
            >
              Cancel
            </button>
            <button
              onClick={handlePayment}
              disabled={isProcessing || (!selectedToken || !amount)}
              className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  <span>Buy Credits</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenPaymentModal;
