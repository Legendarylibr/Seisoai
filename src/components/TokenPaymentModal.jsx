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
import { X, CreditCard, Coins, RefreshCw, ChevronDown, ChevronUp, Wallet, Copy, Check, ExternalLink } from 'lucide-react';

const TokenPaymentModal = ({ isOpen, onClose }) => {
  const { 
    address, 
    credits, 
    fetchCredits,
    walletType
  } = useSimpleWallet();

  const [selectedToken, setSelectedToken] = useState(null);
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [availableTokens, setAvailableTokens] = useState([]);
  const [tokenBalances, setTokenBalances] = useState({});
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  const [error, setError] = useState('');
  const [paymentAddress, setPaymentAddress] = useState('');
  const [solanaPaymentAddress, setSolanaPaymentAddress] = useState('');
  const [copied, setCopied] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(''); // 'pending', 'detected', 'confirmed'

  // Load available tokens and payment address when modal opens
  useEffect(() => {
    if (isOpen) {
      // Only show USDC token - no native tokens
      const usdcToken = {
        symbol: 'USDC',
        name: 'USD Coin',
        creditRate: 10, // 1 USDC = 10 credits
        minAmount: 1,
        decimals: 6
      };
      
      setAvailableTokens([usdcToken]);
      setSelectedToken(usdcToken);
      
      // Set fallback addresses immediately
      setPaymentAddress('0xa0aE05e2766A069923B2a51011F270aCadFf023a');
      setSolanaPaymentAddress('CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA');
      
      // Try to get updated addresses from API
      fetchPaymentAddress();
    }
  }, [isOpen]);

  const fetchPaymentAddress = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/payment/get-address`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ walletAddress: address })
      });
      
      const data = await response.json();
      if (data.success) {
        setPaymentAddress(data.paymentAddress); // EVM chains
        setSolanaPaymentAddress(data.solanaPaymentAddress); // Solana
      } else {
        // If API fails, use fallback addresses
        setPaymentAddress('0xa0aE05e2766A069923B2a51011F270aCadFf023a');
        setSolanaPaymentAddress('CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA');
      }
    } catch (error) {
      console.error('Error fetching payment address:', error);
      // Fallback to default payment addresses
      setPaymentAddress('0xa0aE05e2766A069923B2a51011F270aCadFf023a');
      setSolanaPaymentAddress('CkhFmeUNxdr86SZEPg6bLgagFkRyaDMTmFzSVL69oadA');
    }
  };

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

  const copyAddress = async () => {
    try {
      // Determine which address to copy based on selected token/chain
      // For now, use EVM address (could be enhanced to detect chain)
      const addressToCopy = paymentAddress;
      await navigator.clipboard.writeText(addressToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleSendTransaction = async () => {
    console.log('🚀 handleSendTransaction called', { 
      amount, 
      paymentAddress, 
      walletType, 
      address,
      isConnected: !!address 
    });
    
    if (!amount || !paymentAddress) {
      console.log('❌ Missing amount or payment address');
      setError('Please enter an amount and ensure payment address is loaded');
      return;
    }
    
    if (!address) {
      console.log('❌ No wallet connected');
      setError('Please connect your wallet first');
      return;
    }
    
    if (!walletType) {
      console.log('❌ No wallet type detected');
      setError('Wallet type not detected. Please reconnect your wallet');
      return;
    }
    
    try {
      setIsProcessing(true);
      setError('');
      
      console.log('🔍 Processing transaction for wallet type:', walletType);
      
      // Ensure wallet is still connected and working
      if (walletType === 'solana') {
        if (!window.solana || !window.solana.isPhantom) {
          throw new Error('Phantom wallet not found. Please refresh and reconnect.');
        }
        
        // Reconnect if needed
        if (!window.solana.isConnected) {
          console.log('🔄 Reconnecting to Phantom...');
          await window.solana.connect();
        }
      } else {
        if (!window.ethereum) {
          throw new Error('EVM wallet not found. Please refresh and reconnect.');
        }
        
        // Test if we can get accounts
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (!accounts || accounts.length === 0) {
            throw new Error('No accounts found. Please reconnect your wallet.');
          }
        } catch (e) {
          throw new Error('Wallet connection lost. Please reconnect your wallet.');
        }
      }
      
      if (walletType === 'solana') {
        console.log('🔍 Processing Solana USDC payment...');
        
        // For Solana, just copy the USDC payment address
        // Users need to send USDC manually to the payment address
        await navigator.clipboard.writeText(solanaPaymentAddress);
        setError(`✅ Solana USDC payment address copied to clipboard: ${solanaPaymentAddress}\n\nPlease send ${amount} USDC to this address and click "Check Payment" to verify.`);
      } else {
        console.log('🔍 Processing USDC payment...');
        
        // For EVM chains, just copy the USDC payment address
        // Users need to send USDC manually to the payment address
        await navigator.clipboard.writeText(paymentAddress);
        setError(`✅ USDC payment address copied to clipboard: ${paymentAddress}\n\nPlease send ${amount} USDC to this address and click "Check Payment" to verify.`);
      }
    } catch (error) {
      console.error('Error sending transaction:', error);
      setError('Failed to open wallet. Please copy the address and send manually.');
    } finally {
      setIsProcessing(false);
    }
  };

  const checkForPayment = async () => {
    if (!address || !amount) {
      setError('Please enter an amount');
      return;
    }
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 1) {
      setError('Minimum amount is 1 USDC');
      return;
    }
    
    setCheckingPayment(true);
    setPaymentStatus('pending');
    setError('');
    
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      console.log('[Payment] Checking for payment:', {
        walletAddress: address,
        expectedAmount: numAmount,
        token: 'USDC'
      });
      
      const response = await fetch(`${apiUrl}/api/payment/check-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: address,
          expectedAmount: numAmount,
          token: 'USDC'
        })
      });
      
      const data = await response.json();
      console.log('[Payment] Check result:', data);
      
      if (data.success && data.paymentDetected) {
        console.log('[Payment] Payment detected!', data.payment);
        setPaymentStatus('confirmed');
        setCheckingPayment(false);
        await fetchCredits(address);
        setTimeout(() => {
          onClose();
        }, 2000);
      } else {
        // Continue checking - keep monitoring
        console.log('[Payment] No payment yet, will check again in 5 seconds...');
        if (paymentStatus === 'pending') {
          setTimeout(() => checkForPayment(), 5000); // Check every 5 seconds
        }
      }
    } catch (error) {
      console.error('[Payment] Error checking payment:', error);
      setError('Failed to check payment. Please try again.');
      setCheckingPayment(false);
      setPaymentStatus('');
    }
  };

  const handlePayment = () => {
    if (!validateAmount()) return;
    
    checkForPayment();
  };
  
  const stopMonitoring = () => {
    setPaymentStatus('');
    setCheckingPayment(false);
    setError('');
  };

  const getCreditsPreview = () => {
    if (!selectedToken || !amount) return 0;
    
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) return 0;
    
    // 1 USDC = 10 credits
    return Math.floor(numAmount * (selectedToken.creditRate || 10));
  };

  const getTokenBalance = (tokenSymbol) => {
    return tokenBalances[tokenSymbol]?.formattedBalance || '0';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2">
      <div className="bg-gray-900 rounded-xl border border-white/20 w-full max-w-sm max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
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

        <div className="p-4 space-y-4">
          {/* Current Credits */}
          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Current Credits:</span>
              <span className="text-lg font-semibold text-purple-400">
                {credits}
              </span>
            </div>
          </div>



          {/* Payment Method - USDC Only */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Payment Method
            </label>
            
            <div className="w-full flex items-center justify-between p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  $
                </div>
                <div className="text-left">
                  <div className="font-semibold text-white">Pay with USDC</div>
                  <div className="text-xs text-blue-300">USD Coin on {walletType === 'solana' ? 'Solana' : 'EVM Chains'}</div>
                </div>
              </div>
              <div className="px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full">
                Active
              </div>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-300">
              Amount (USDC)
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Enter USDC amount"
                className="w-full p-3 pr-16 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400"
                step="0.1"
                min="1"
                id="token-amount-input"
                name="token-amount"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm font-semibold text-blue-400">
                USDC
              </div>
            </div>
            <div className="text-xs text-gray-400">
              Minimum: 1 USDC
            </div>
          </div>

          {/* Credits Preview */}
          <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300">You'll receive:</span>
              <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                {getCreditsPreview()} Credits
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">Rate:</span>
              <span className="text-purple-400 font-semibold">1 USDC = 10 Credits</span>
            </div>
          </div>

          {/* Payment Address */}
          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">
                {walletType === 'solana' ? 'Solana Payment Address' : 'EVM Payment Address'}
              </span>
            </div>
            
            {/* Show only relevant payment address based on connected wallet type */}
            {walletType === 'solana' ? (
              // Solana Payment Address
              <div className="space-y-2">
                <div className="text-xs text-purple-400 font-semibold">Solana Network:</div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2 bg-black/30 rounded border border-white/10 text-xs font-mono text-white break-all">
                    {solanaPaymentAddress || 'Loading...'}
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(solanaPaymentAddress);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch (error) {
                        console.error('Failed to copy:', error);
                      }
                    }}
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                    title="Copy Solana address"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              // EVM Payment Address
              <div className="space-y-2">
                <div className="text-xs text-purple-400 font-semibold">
                  EVM Networks (Ethereum, Polygon, Arbitrum, Optimism, Base):
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2 bg-black/30 rounded border border-white/10 text-xs font-mono text-white break-all">
                    {paymentAddress || 'Loading...'}
                  </div>
                  <button
                    onClick={copyAddress}
                    className="p-2 hover:bg-white/10 rounded transition-colors"
                    title="Copy EVM address"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Send Transaction Buttons */}
            <div className="space-y-2">
              <button
                onClick={handleSendTransaction}
                disabled={!amount || !paymentAddress || isProcessing}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm"
              >
                <ExternalLink className="w-4 h-4" />
                {isProcessing ? 'Opening Wallet...' : `Send ${amount || '0'} USDC to Payment Address`}
              </button>
              
              {/* Alternative: Deep Link for Mobile */}
              {walletType === 'evm' && (
                <button
                  onClick={() => {
                    const deepLink = `ethereum:${paymentAddress}@1?value=${ethers.parseUnits(amount || '0', 6).toString()}&gas=21000`;
                    window.open(deepLink, '_blank');
                  }}
                  disabled={!amount || !paymentAddress}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  Open in Mobile Wallet
                </button>
              )}
              
              <div className="text-center text-xs text-gray-400">
                This will open your wallet with the payment pre-filled
              </div>
            </div>

            {/* Clear Instructions */}
            <div className="bg-black/20 p-2 rounded border border-white/10">
              <div className="text-xs text-white font-semibold mb-2">📋 How to Pay:</div>
              <div className="text-xs text-gray-300 space-y-1">
                <p><strong>Option 1:</strong> Click "Send Transaction" above (opens wallet)</p>
                <p><strong>Option 2:</strong> Copy address and send manually</p>
                <p><strong>3.</strong> Click "Start Monitoring" below</p>
                <p><strong>4.</strong> Wait 1-5 mins for blockchain confirmation</p>
                <p><strong>5.</strong> Credits will be added automatically!</p>
              </div>
            </div>
            
            {/* Payment Status */}
            {paymentStatus && (
              <div className={`p-2 rounded text-xs ${
                paymentStatus === 'confirmed' 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }`}>
                {paymentStatus === 'pending' && '⏳ Monitoring for payment...'}
                {paymentStatus === 'detected' && '👀 Payment detected! Confirming...'}
                {paymentStatus === 'confirmed' && '✅ Payment confirmed! Credits added.'}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {paymentStatus === 'pending' ? (
              <>
                <button
                  onClick={stopMonitoring}
                  className="flex-1 btn-secondary py-3"
                >
                  Stop Monitoring
                </button>
                <button
                  disabled
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 opacity-90"
                >
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Checking...</span>
                </button>
              </>
            ) : paymentStatus === 'confirmed' ? (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Done</span>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="flex-1 btn-secondary py-3"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePayment}
                  disabled={!amount || parseFloat(amount) < 1}
                  className="flex-1 btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Coins className="w-4 h-4" />
                  <span>Start Monitoring</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TokenPaymentModal;
