import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { 
  createPaymentIntent, 
  verifyStripePayment, 
  getStripe, 
  calculateCreditsFromUSD,
  getCreditPackages 
} from '../services/stripeService';
import { X, CreditCard, Coins, RefreshCw, Check, Star, Zap } from 'lucide-react';

const StripePaymentModal = ({ isOpen, onClose }) => {
  const { 
    address, 
    credits, 
    fetchCredits,
    isNFTHolder = false // This would come from your wallet context
  } = useSimpleWallet();

  const [selectedPackage, setSelectedPackage] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [stripe, setStripe] = useState(null);
  const [elements, setElements] = useState(null);
  const [paymentIntent, setPaymentIntent] = useState(null);

  const packages = getCreditPackages();

  // Initialize Stripe when modal opens
  useEffect(() => {
    if (isOpen) {
      initializeStripe();
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
      console.error('Error initializing Stripe:', error);
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
    if (!selectedPackage && !customAmount) {
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

  const handlePayment = async () => {
    if (!address || !stripe) return;

    if (!validatePayment()) return;

    setIsProcessing(true);
    setError('');

    try {
      const amount = getPrice();
      const creditsToPurchase = getCreditsPreview();

      // Create payment intent
      const intentResponse = await createPaymentIntent(address, amount, creditsToPurchase);
      
      if (!intentResponse.success) {
        throw new Error('Failed to create payment intent');
      }

      // For this demo, we'll simulate a successful payment
      // In a real implementation, you would use Stripe Elements here
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate payment processing

      // Verify payment
      const verificationResponse = await verifyStripePayment(intentResponse.paymentIntentId, address);
      
      if (verificationResponse.success) {
        setSuccess(true);
        await fetchCredits(address);
        
        // Close modal after a short delay
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setSelectedPackage(null);
          setCustomAmount('');
        }, 2000);
      } else {
        throw new Error('Payment verification failed');
      }

    } catch (error) {
      console.error('Payment error:', error);
      setError(error.message || 'Payment failed');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl border border-white/20 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Buy Credits with Card</h2>
              <p className="text-sm text-gray-400">Secure payment powered by Stripe</p>
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
            {isNFTHolder && (
              <div className="mt-2 flex items-center gap-2 text-xs text-green-400">
                <Star className="w-3 h-3" />
                <span>NFT Holder - 20% bonus credits!</span>
              </div>
            )}
          </div>

          {/* Credit Packages */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-300">Choose a Package</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  onClick={() => handlePackageSelect(pkg)}
                  className={`p-4 rounded-lg border transition-all ${
                    selectedPackage?.id === pkg.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-white/20 hover:border-white/40 bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-white">{pkg.name}</h4>
                      {pkg.popular && (
                        <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                          Popular
                        </span>
                      )}
                    </div>
                    {pkg.savings && (
                      <span className="text-xs text-green-400">
                        Save {pkg.savings}%
                      </span>
                    )}
                  </div>
                  
                  <div className="text-left">
                    <div className="text-2xl font-bold text-white mb-1">
                      ${pkg.price}
                    </div>
                    <div className="text-sm text-gray-400 mb-2">
                      {pkg.description}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Coins className="w-4 h-4 text-purple-400" />
                      <span className="text-purple-400 font-medium">
                        {calculateCreditsFromUSD(pkg.price, isNFTHolder)} credits
                      </span>
                      {isNFTHolder && (
                        <span className="text-green-400 text-xs">
                          (+{Math.floor(pkg.price * 0.2)} bonus)
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Amount */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300">Or Enter Custom Amount</h3>
            <div className="relative">
              <input
                type="number"
                value={customAmount}
                onChange={(e) => handleCustomAmountChange(e.target.value)}
                placeholder="Enter amount in USD"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
                step="0.01"
                min="1"
                max="1000"
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-sm text-gray-400">
                USD
              </div>
            </div>
          </div>

          {/* Credits Preview */}
          {getCreditsPreview() > 0 && (
            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">You'll receive:</span>
                <span className="text-lg font-semibold text-purple-400">
                  {getCreditsPreview()} Credits
                </span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                ${getPrice()} USD • {isNFTHolder ? '1.2x rate (NFT bonus)' : '1x rate'}
              </div>
            </div>
          )}

          {/* Payment Security Info */}
          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400">Secure Payment</span>
            </div>
            <div className="text-xs text-gray-300">
              <p className="mb-1">• Powered by Stripe - industry standard security</p>
              <p className="mb-1">• Your card details are never stored on our servers</p>
              <p>• Instant credit delivery after successful payment</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400 flex items-center gap-2">
              <Check className="w-4 h-4" />
              Payment successful! Credits have been added to your account.
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
              disabled={isProcessing || getCreditsPreview() === 0}
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
                  <span>Pay ${getPrice()}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StripePaymentModal;
