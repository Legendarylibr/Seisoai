import React, { useEffect } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { CheckCircle, Sparkles, X, CreditCard } from 'lucide-react';

/**
 * PaymentSuccessModal Component
 * Displays a professional payment confirmation after successful subscription checkout
 */
interface PaymentSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  planName?: string;
  planPrice?: string;
  sessionId?: string;
}

const PaymentSuccessModal: React.FC<PaymentSuccessModalProps> = ({ 
  isOpen, 
  onClose, 
  planName, 
  planPrice,
  sessionId 
}) => {
  const { refreshCredits } = useEmailAuth();
  
  useEffect(() => {
    if (isOpen) {
      // OPTIMIZATION: Reduced polling - use exponential backoff instead of constant polling
      // Webhook usually processes within 2-3 seconds
      if (refreshCredits) {
        // Initial refresh after webhook processing time
        const timeouts = [
          setTimeout(() => refreshCredits(), 2000),  // First check at 2s
          setTimeout(() => refreshCredits(), 5000),  // Second check at 5s
          setTimeout(() => refreshCredits(), 10000), // Final check at 10s
        ];
        
        // Auto-close after 5 seconds
        const closeTimer = setTimeout(() => {
          onClose();
        }, 5000);
        
        return () => {
          timeouts.forEach(t => clearTimeout(t));
          clearTimeout(closeTimer);
        };
      }
      
      // Auto-close after 5 seconds
      const timer = setTimeout(() => {
        onClose();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose, refreshCredits]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
      <div className="glass-card rounded-2xl p-8 max-w-md w-full relative animate-slide-up">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>

        {/* Success Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center animate-scale-in">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Payment Successful!
          </h2>
          <p className="text-gray-300 mb-4">
            Your subscription has been activated
          </p>
        </div>

        {/* Plan Details */}
        <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span className="text-white font-semibold">Plan</span>
            </div>
            <span className="text-white font-bold">{planName}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-purple-400" />
              <span className="text-white font-semibold">Amount</span>
            </div>
            <span className="text-white font-bold">{planPrice}</span>
          </div>
          {sessionId && (
            <div className="pt-3 border-t border-white/10">
              <p className="text-xs text-gray-400 text-center">
                Session ID: {sessionId.substring(0, 20)}...
              </p>
            </div>
          )}
        </div>

        {/* Info Message */}
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-blue-300 text-center">
            <strong>Credits are being processed</strong>
            <br />
            Your credits will be added to your account automatically. This usually takes just a few seconds.
            <br />
            <button
              onClick={() => refreshCredits && refreshCredits()}
              className="mt-2 text-xs underline hover:text-blue-200"
            >
              Refresh Credits Now
            </button>
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={() => {
            if (refreshCredits) {
              refreshCredits();
            }
            onClose();
          }}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2"
        >
          <CheckCircle className="w-5 h-5" />
          <span>Continue</span>
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccessModal;

