import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { 
  createPaymentIntent, 
  verifyStripePayment, 
  getStripe, 
  calculateCreditsFromUSD,
  getCreditPackages,
  getEnhancedStripeError
} from '../services/stripeService';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { X, CreditCard, Coins, RefreshCw, Check, Star, Zap } from 'lucide-react';
import logger from '../utils/logger.js';

// Inner component that uses Stripe hooks
const PaymentForm = ({ 
  clientSecret,
  amount,
  address, 
  userId, 
  onSuccess, 
  onError,
  fetchCredits 
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements || !clientSecret) {
      return;
    }

    setIsProcessing(true);
    setError('');

    try {
      // IMPORTANT: Submit elements first to validate the form
      // This must be called before confirmPayment()
      const { error: submitError } = await elements.submit();
      
      if (submitError) {
        throw new Error(submitError.message || 'Payment form validation failed');
      }

      // Now confirm payment with Stripe using the existing client secret
      const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: 'if_required'
      });

      if (confirmError) {
        throw new Error(confirmError.message || 'Payment failed');
      }

      // Handle different payment intent statuses
      if (!paymentIntent) {
        throw new Error('Payment intent not returned. Please try again.');
      }

      const status = paymentIntent.status;
      
      // If payment requires additional action (3D Secure), handle it
      if (status === 'requires_action' || status === 'requires_source_action') {
        // Stripe will handle the redirect or show the challenge
        // The payment will be completed after the action
        throw new Error('Payment requires additional authentication. Please complete the verification.');
      }

      // If payment is processing, wait a bit and check again
      if (status === 'processing') {
        // Wait a moment for processing to complete, then retry verification
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try to verify on backend - it will check the status again
        try {
          const verificationResponse = await verifyStripePayment(
            paymentIntent.id, 
            address, 
            userId
          );
          
          if (verificationResponse.success) {
            await fetchCredits();
            onSuccess();
            return;
          } else {
            // If still not succeeded, inform user to wait
            throw new Error('Payment is still processing. Credits will be added automatically once payment completes. Please refresh in a moment.');
          }
        } catch (verifyError) {
          // If verification fails, payment might still be processing
          // Inform user that they should wait or the payment may need manual review
          throw new Error('Payment is processing. Please wait a moment and refresh your credits. If credits do not appear within a few minutes, please contact support.');
        }
      }

      // Payment succeeded
      if (status === 'succeeded') {
        // Verify payment on backend
        const verificationResponse = await verifyStripePayment(
          paymentIntent.id, 
          address, 
          userId
        );
        
        if (verificationResponse.success) {
          await fetchCredits();
          onSuccess();
        } else {
          throw new Error('Payment verification failed');
        }
      } else {
        // Other statuses (requires_payment_method, canceled, etc.)
        throw new Error(`Payment ${status}. Please try again.`);
      }
    } catch (err) {
      logger.error('Payment error:', { error: err.message });
      const originalMessage = err.message || 'Payment failed. Please try again.';
      const errorMessage = getEnhancedStripeError(originalMessage);
      setError(errorMessage);
      onError(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-white/5 rounded-lg border border-white/20">
        <PaymentElement />
      </div>
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={isProcessing || !stripe || !elements}
        className="w-full btn-primary py-3 flex items-center justify-center gap-2"
      >
        {isProcessing ? (
          <>
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          <>
            <CreditCard className="w-4 h-4" />
            <span>Pay ${amount.toFixed(2)}</span>
          </>
        )}
      </button>
    </form>
  );
};

const StripePaymentModal = ({ isOpen, onClose }) => {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  // Use email auth if available, otherwise fall back to wallet
  const isEmailAuth = emailContext.isAuthenticated;
  const address = walletContext.address;
  const credits = isEmailAuth ? (emailContext.credits ?? 0) : (walletContext.credits ?? 0);
  const userId = isEmailAuth ? emailContext.userId : null;
  // Only apply NFT pricing if user has a linked wallet (for email users) or is a wallet user
  const isNFTHolder = isEmailAuth 
    ? false 
    : (walletContext.isNFTHolder || false);
  const fetchCredits = isEmailAuth ? emailContext.refreshCredits : walletContext.fetchCredits;

  const [selectedPackage, setSelectedPackage] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [stripe, setStripe] = useState(null);
  const [clientSecret, setClientSecret] = useState(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const packages = getCreditPackages();

  // Initialize Stripe when modal opens
  useEffect(() => {
    if (isOpen) {
      initializeStripe();
      setShowPaymentForm(false);
      setClientSecret(null);
      setSuccess(false);
      setError('');
    }
  }, [isOpen]);

  const initializeStripe = async () => {
    try {
      // Check if Stripe publishable key is configured
      const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
      if (!publishableKey || publishableKey.includes('your_stripe_publishable_key_here')) {
        setError('Stripe payment is not configured. Please contact support or use token payment instead.');
        return;
      }

      const stripeInstance = await getStripe();
      if (!stripeInstance) {
        throw new Error('Failed to load Stripe');
      }
      setStripe(stripeInstance);
    } catch (error) {
      logger.error('Error initializing Stripe:', { error: error.message });
      setError('Failed to initialize payment system. Please use token payment instead.');
    }
  };

  const handlePackageSelect = (pkg) => {
    setSelectedPackage(pkg);
    setCustomAmount('');
    setError('');
  };

  const handleCustomAmountChange = (value) => {
    setCustomAmount(value);
    setSelectedPackage(null);
    setError('');
  };

  const getCreditsPreview = () => {
    if (selectedPackage) {
      return calculateCreditsFromUSD(selectedPackage.price, isNFTHolder);
    }
    if (customAmount) {
      const amount = parseFloat(customAmount);
      if (!isNaN(amount) && amount > 0) {
        return calculateCreditsFromUSD(amount, isNFTHolder);
      }
    }
    return 0;
  };

  const getPrice = () => {
    if (selectedPackage) {
      return selectedPackage.price;
    }
    if (customAmount) {
      const amount = parseFloat(customAmount);
      return isNaN(amount) ? 0 : amount;
    }
    return 0;
  };

  const validatePayment = () => {
    // For email users, require package selection (no custom amount)
    if (isEmailAuth && !selectedPackage) {
      setError('Please select a package');
      return false;
    }
    
    // For wallet users, allow either package or custom amount
    if (!isEmailAuth && !selectedPackage && !customAmount) {
      setError('Please select a package or enter a custom amount');
      return false;
    }

    const amount = getPrice();
    if (amount < 1) {
      setError('Minimum amount is $1');
      return false;
    }

    if (amount > 1000) {
      setError('Maximum amount is $1000');
      return false;
    }

    return true;
  };

  const handleContinueToPayment = async () => {
    if (!validatePayment()) return;

    setError('');
    setShowPaymentForm(true);
    
    // Pre-create payment intent to get client secret
    try {
      const amount = getPrice();
      const creditsToPurchase = getCreditsPreview();

      const intentResponse = await createPaymentIntent(
        address, 
        amount, 
        creditsToPurchase, 
        'usd', 
        userId
      );
      
      if (!intentResponse.success || !intentResponse.clientSecret) {
        throw new Error('Failed to create payment intent');
      }

      setClientSecret(intentResponse.clientSecret);
    } catch (error) {
      logger.error('Error creating payment intent:', { error: error.message });
      setError(error.message || 'Failed to initialize payment');
      setShowPaymentForm(false);
    }
  };

  const handlePaymentSuccess = () => {
    setSuccess(true);
    setTimeout(() => {
      onClose();
      setSuccess(false);
      setSelectedPackage(null);
      setCustomAmount('');
      setShowPaymentForm(false);
      setClientSecret(null);
    }, 2000);
  };

  const handlePaymentError = (errorMessage) => {
    setError(errorMessage);
  };

  if (!isOpen) return null;

  // Check if user is authenticated (either email or wallet)
  if (!isEmailAuth && !walletContext.isConnected) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900 rounded-xl border border-white/20 w-full max-w-md p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Authentication Required</h2>
          <p className="text-gray-400 mb-4">Please sign in with email or connect your wallet to purchase credits.</p>
          <button
            onClick={onClose}
            className="w-full btn-primary py-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded"
        style={{
          background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
          border: '2px outset #f0f0f0',
          boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3)'
        }}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-6"
          style={{
            borderBottom: '2px inset #c0c0c0',
            background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0)'
          }}
        >
          <div className="flex items-center gap-3">
            <div 
              className="w-10 h-10 rounded flex items-center justify-center"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)'
              }}
            >
              <CreditCard className="w-5 h-5" style={{ color: '#000000' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Buy Credits with Card</h2>
              <p className="text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Secure payment powered by Stripe</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded transition-all duration-200"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)'
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.border = '2px inset #c0c0c0';
              e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4)';
            }}
          >
            <X className="w-5 h-5" style={{ color: '#000000' }} />
          </button>
        </div>

        <div className="p-6 space-y-6" style={{ background: 'linear-gradient(to bottom, #f0f0f0, #e8e8e8)' }}>
          {/* Current Credits */}
          <div 
            className="p-4 rounded"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Current Credits:</span>
              <span className="text-lg font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                {credits}
              </span>
            </div>
            {isNFTHolder && (
              <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: '#006600', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                <Star className="w-3 h-3" />
                <span>NFT Holder - 20% bonus credits!</span>
              </div>
            )}
          </div>

          {/* Credit Packages */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Choose a Package</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  className="p-4 rounded transition-all duration-200"
                  style={selectedPackage?.id === pkg.id ? {
                    background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
                    border: '2px inset #c0c0c0',
                    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                    color: '#000000',
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  } : {
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                    color: '#000000',
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedPackage?.id !== pkg.id) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPackage?.id !== pkg.id) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                    }
                  }}
                  onMouseDown={(e) => {
                    if (selectedPackage?.id !== pkg.id) {
                      e.currentTarget.style.border = '2px inset #c0c0c0';
                      e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
                    }
                  }}
                  onMouseUp={(e) => {
                    if (selectedPackage?.id !== pkg.id) {
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{pkg.name}</h4>
                      {pkg.popular && (
                        <span 
                          className="px-2 py-1 text-xs rounded"
                          style={{
                            background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0)',
                            border: '2px outset #e0e0e0',
                            color: '#000000',
                            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                          }}
                        >
                          Popular
                        </span>
                      )}
                    </div>
                    {pkg.savings && (
                      <span className="text-xs" style={{ color: '#006600', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                        Save {pkg.savings}%
                      </span>
                    )}
                  </div>
                  
                  <div className="text-left">
                    <div className="text-2xl font-bold mb-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                      ${pkg.price}/month
                    </div>
                    <div className="text-sm mb-2" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                      {pkg.description}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Coins className="w-4 h-4" style={{ color: '#000000' }} />
                      <span className="font-medium" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                        {calculateCreditsFromUSD(pkg.price, isNFTHolder)} credits/month
                      </span>
                      {isNFTHolder && (
                        <span className="text-xs" style={{ color: '#006600', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                          (+20% NFT bonus)
                        </span>
                      )}
                      {pkg.savings && (
                        <span className="text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                          ({pkg.savings}% savings)
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount - Only show for wallet users, not email users */}
          {!isEmailAuth && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Or Enter Custom Amount</h3>
              <div className="relative">
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                  placeholder="Enter amount in USD"
                  className="w-full p-3 rounded text-sm"
                  style={{
                    background: 'linear-gradient(to bottom, #ffffff, #f8f8f8)',
                    border: '2px inset #c0c0c0',
                    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                    color: '#000000',
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}
                  step="0.01"
                  min="1"
                  max="1000"
                />
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                  USD
                </div>
              </div>
            </div>
          )}

          {/* Credits Preview */}
          {getCreditsPreview() > 0 && (
            <div 
              className="p-4 rounded"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>You'll receive:</span>
                <span className="text-lg font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                  {getCreditsPreview()} Credits
                </span>
              </div>
              <div className="text-xs mt-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                ${getPrice()}/month USD • {(() => {
                  const amount = getPrice();
                  let rate = '3.33 credits/$';
                  if (amount >= 100) rate = '4.33 credits/$ (30% bonus)';
                  else if (amount >= 50) rate = '4 credits/$ (20% bonus)';
                  else if (amount >= 25) rate = '3.67 credits/$ (10% bonus)';
                  else if (amount >= 15) rate = '3.33 credits/$';
                  return rate + (isNFTHolder ? ' + NFT bonus' : '');
                })()}
              </div>
            </div>
          )}

          {/* Payment Security Info */}
          <div 
            className="p-4 rounded"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4" style={{ color: '#000000' }} />
              <span className="text-sm font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Secure Payment</span>
            </div>
            <div className="text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              <p className="mb-1">• Powered by Stripe - industry standard security</p>
              <p className="mb-1">• Your card details are never stored on our servers</p>
              <p>• Instant credit delivery after successful payment</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div 
              className="p-3 rounded text-sm"
              style={{
                background: 'linear-gradient(to bottom, #ffe0e0, #ffd0d0)',
                border: '2px outset #ffc0c0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div 
              className="p-3 rounded text-sm flex items-center gap-2"
              style={{
                background: 'linear-gradient(to bottom, #d0f0d0, #c0e0c0)',
                border: '2px outset #e0e0e0',
                boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                color: '#000000',
                textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
              }}
            >
              <Check className="w-4 h-4" />
              Payment successful! Credits have been added to your account.
            </div>
          )}

          {/* Payment Form or Continue Button */}
          {showPaymentForm && stripe && clientSecret ? (
            <Elements
              stripe={stripe}
              options={{
                clientSecret,
                appearance: {
                  theme: 'night',
                  variables: {
                    colorPrimary: '#a855f7',
                    colorBackground: '#1f2937',
                    colorText: '#ffffff',
                    colorDanger: '#ef4444',
                    fontFamily: 'system-ui, sans-serif',
                    spacingUnit: '4px',
                    borderRadius: '8px',
                  },
                },
              }}
            >
              <PaymentForm
                clientSecret={clientSecret}
                amount={getPrice()}
                address={address}
                userId={userId}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
                fetchCredits={fetchCredits}
              />
            </Elements>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 btn-secondary py-3"
              >
                Cancel
              </button>
              <button
                onClick={handleContinueToPayment}
                disabled={getCreditsPreview() === 0 || !stripe}
                className="flex-1 btn-primary py-3 flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                <span>Continue to Payment</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StripePaymentModal;
