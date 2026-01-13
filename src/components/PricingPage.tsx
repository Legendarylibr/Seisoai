import { useState, useEffect, useCallback } from 'react';
import SubscriptionCheckout from './SubscriptionCheckout';
import PaymentSuccessModal from './PaymentSuccessModal';
import SubscriptionManagement from './SubscriptionManagement';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { CheckCircle, AlertCircle, X, CreditCard } from 'lucide-react';
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';

interface SuccessState {
  sessionId: string;
  planName: string;
  planPrice: string;
}

/**
 * PricingPage Component
 * Displays the four pricing packs: Starter Pack, Creator Pack, Pro Pack, and Studio Pack
 * 
 * Note: Replace the priceLookupKey values with your actual Stripe Price Lookup Keys
 * You can find/create these in your Stripe Dashboard under Products > Prices
 */
const PricingPage: React.FC = () => {
  // TODO: Replace these with your actual Stripe Price Lookup Keys
  // You can also use price IDs (starting with 'price_') if you prefer
  const starterPriceLookupKey = 'starter_pack_monthly'; // Replace with your actual lookup key
  const creatorPriceLookupKey = 'creator_pack_monthly'; // Replace with your actual lookup key
  const proPriceLookupKey = 'pro_pack_monthly'; // Replace with your actual lookup key
  const studioPriceLookupKey = 'studio_pack_monthly'; // Replace with your actual lookup key

  const { refreshCredits, userId, isAuthenticated } = useEmailAuth();
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState(false);

  // Check for success in URL params when component mounts
  const handleSuccess = useCallback((sessionId: string, planName: string, planPrice: string) => {
    setSuccessState({
      sessionId,
      planName: planName || 'Subscription',
      planPrice: planPrice || 'Activated'
    });
    
    // OPTIMIZATION: Reduced polling - use exponential backoff instead of constant polling
    if (refreshCredits) {
      setTimeout(() => refreshCredits(), 2000);  // First check at 2s
      setTimeout(() => refreshCredits(), 5000);  // Second check at 5s
      setTimeout(() => refreshCredits(), 10000); // Final check at 10s
    }
  }, [refreshCredits]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    const cleanupUrl = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (sessionId) {
      const verifySubscription = async () => {
        try {
          const body: { sessionId: string; userId?: string } = { sessionId };
          if (userId) {
            body.userId = userId;
          }

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('authToken');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
          
          // Add CSRF token for secure API call
          const csrfToken = await ensureCSRFToken();
          if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
          }

          const response = await fetch(`${API_URL}/api/subscription/verify`, {
            method: 'POST',
            headers,
            credentials: 'include',
            body: JSON.stringify(body)
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to verify subscription payment. Please contact support.');
          }

          handleSuccess(
            sessionId,
            data.planName || 'Subscription',
            data.planPrice || (data.amount ? `$${data.amount}/month` : 'Activated')
          );
        } catch (error) {
          const err = error as Error;
          logger.error('Subscription verification failed:', { error: err.message });
          const message = err.message || 'Failed to verify subscription payment. Please contact support.';
          setErrorMessage(message);
          setTimeout(() => setErrorMessage(null), 6000);
        } finally {
          cleanupUrl();
        }
      };

      verifySubscription();
    } else if (canceled) {
      setErrorMessage('Checkout was canceled. You can try again anytime.');
      setTimeout(() => setErrorMessage(null), 6000);
      cleanupUrl();
    }
  }, [userId, handleSuccess]);

  const handleError = (error: string) => {
    setErrorMessage(error);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  const closeSuccessModal = () => {
    setSuccessState(null);
  };

  return (
    <div className="min-h-screen py-12 px-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #c8c8d8 0%, #b8b8c8 50%, #a8a8b8 100%)' }}>
      {/* Background decorations */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-10 w-32 h-32 rounded-full opacity-20" style={{
          background: 'radial-gradient(circle, #00b8a9 0%, transparent 70%)'
        }}></div>
        <div className="absolute bottom-40 right-20 w-40 h-40 rounded-full opacity-15" style={{
          background: 'radial-gradient(circle, #3b82f6 0%, transparent 70%)'
        }}></div>
        <div className="absolute top-1/2 left-1/4 w-24 h-24 rounded-full opacity-10" style={{
          background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)'
        }}></div>
      </div>
      
      {/* Success Modal */}
      {successState && (
        <PaymentSuccessModal
          isOpen={!!successState}
          onClose={closeSuccessModal}
          planName={successState.planName}
          planPrice={successState.planPrice}
          sessionId={successState.sessionId}
        />
      )}

      <SubscriptionManagement
        isOpen={showSubscriptionManagement}
        onClose={() => setShowSubscriptionManagement(false)}
      />

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-40 max-w-md w-full mx-4">
          <div 
            className="glass-card rounded-xl p-4 flex items-center gap-3 animate-slide-down"
            style={{
              background: 'linear-gradient(135deg, #ffe8e8, #ffd8d8)',
              border: '2px outset #ffc8c8',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 4px 12px rgba(0, 0, 0, 0.2)'
            }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#cc0000' }} />
            <p className="text-sm flex-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)', fontFamily: "'IBM Plex Mono', monospace" }}>{errorMessage}</p>
            <button
              onClick={() => setErrorMessage(null)}
              className="transition-colors hover:scale-110"
              style={{ color: '#000000' }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="container mx-auto max-w-6xl relative z-10">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 hero-title" style={{ 
            fontFamily: "'VT323', monospace",
            letterSpacing: '0.08em'
          }}>
            CHOOSE YOUR PLAN
          </h1>
          <p className="text-lg md:text-xl tracking-wide mb-2" style={{ 
            color: '#ffffff', 
            textShadow: '0 0 10px rgba(0, 212, 255, 0.5), 2px 2px 0 rgba(0, 0, 0, 0.8)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            Unlock AI-Powered Image, Video & Music Generation
          </p>
          <p className="text-sm tracking-wide" style={{ 
            color: '#e2e8f0', 
            textShadow: '1px 1px 0 rgba(0, 0, 0, 0.5)',
            fontFamily: "'IBM Plex Mono', monospace"
          }}>
            1 credit = $0.10 • Monthly subscriptions with savings up to 30%
          </p>
          {isAuthenticated && (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <button
                onClick={() => setShowSubscriptionManagement(true)}
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded transition-all duration-200 w-full sm:w-auto"
                style={{
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                  e.currentTarget.style.border = '2px outset #f8f8f8';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                  e.currentTarget.style.border = '2px outset #f0f0f0';
                }}
                onMouseDown={(e) => {
                  e.currentTarget.style.border = '2px inset #c0c0c0';
                  e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.border = '2px outset #f0f0f0';
                  e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                }}
              >
                <CreditCard className="w-4 h-4" />
                Manage Subscription
              </button>
              <p className="text-xs sm:text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                View plan details, billing dates, or cancel anytime.
              </p>
            </div>
          )}
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Starter Pack */}
          <SubscriptionCheckout
            priceLookupKey={starterPriceLookupKey}
            planName="Starter Pack"
            planPrice="$10/month"
            description="Perfect for trying out Seiso AI"
            credits="50 credits/month"
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Starter Pack', '$10/month')}
            onError={handleError}
            compact={true}
          />

          {/* Creator Pack */}
          <SubscriptionCheckout
            priceLookupKey={creatorPriceLookupKey}
            planName="Creator Pack"
            planPrice="$20/month"
            description="Great for regular creators"
            credits="110 credits/month (10% savings)"
            highlight={true}
            savePercentage={10}
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Creator Pack', '$20/month')}
            onError={handleError}
            compact={true}
          />

          {/* Pro Pack */}
          <SubscriptionCheckout
            priceLookupKey={proPriceLookupKey}
            planName="Pro Pack"
            planPrice="$40/month"
            description="Best value for power users"
            credits="240 credits/month (20% savings)"
            savePercentage={20}
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Pro Pack', '$40/month')}
            onError={handleError}
            compact={true}
          />

          {/* Studio Pack */}
          <SubscriptionCheckout
            priceLookupKey={studioPriceLookupKey}
            planName="Studio Pack"
            planPrice="$80/month"
            description="For professional studios"
            credits="520 credits/month (30% savings)"
            savePercentage={30}
            onSuccess={(sessionId) => handleSuccess(sessionId, 'Studio Pack', '$80/month')}
            onError={handleError}
            compact={true}
          />
        </div>

        {/* Additional Info */}
        <div className="mt-12 space-y-6">
          {/* What's Included - Expanded */}
          <div className="glass-card rounded-xl p-6 max-w-4xl mx-auto">
            <h3 className="text-xl font-semibold mb-4 text-center" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)', fontFamily: "'VT323', monospace" }}>WHAT'S INCLUDED</h3>
            
            {/* Feature Categories */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Image Generation */}
              <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, #f0fdfb, #d1fae5)', border: '2px solid #10b981' }}>
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: '#047857' }}>
                  🎨 Image Generation
                </h4>
                <ul className="space-y-1.5 text-xs" style={{ color: '#1f2937' }}>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                    <span>Text-to-Image generation</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                    <span>Reference-based editing & blending</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                    <span>Layer extraction</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                    <span>20+ style presets (Anime, Cyberpunk, etc.)</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                    <span>AI Prompt Reasoning enhancement</span>
                  </li>
                </ul>
              </div>
              
              {/* Video Generation */}
              <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, #faf5ff, #e9d5ff)', border: '2px solid #8b5cf6' }}>
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: '#6d28d9' }}>
                  🎬 Video Generation
                </h4>
                <ul className="space-y-1.5 text-xs" style={{ color: '#1f2937' }}>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} />
                    <span>Frame-to-frame AI animation</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} />
                    <span>4-8 second video clips</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} />
                    <span>720p & 1080p resolution</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} />
                    <span>AI-generated audio option</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#8b5cf6' }} />
                    <span>Multiple aspect ratios (16:9, 9:16)</span>
                  </li>
                </ul>
              </div>
              
              {/* Music Generation */}
              <div className="p-4 rounded-lg" style={{ background: 'linear-gradient(135deg, #f0fdfa, #cffafe)', border: '2px solid #06b6d4' }}>
                <h4 className="font-bold text-sm mb-2 flex items-center gap-2" style={{ color: '#0891b2' }}>
                  🎵 Music Generation
                </h4>
                <ul className="space-y-1.5 text-xs" style={{ color: '#1f2937' }}>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#06b6d4' }} />
                    <span>50+ genre presets (EDM, Jazz, Rock...)</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#06b6d4' }} />
                    <span>15 seconds to 3 minute tracks</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#06b6d4' }} />
                    <span>Ultra-fast (~2 seconds for 30s track)</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#06b6d4' }} />
                    <span>High-quality WAV export</span>
                  </li>
                  <li className="flex items-start gap-1.5">
                    <CheckCircle className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: '#06b6d4' }} />
                    <span>Custom tempo, key & instruments</span>
                  </li>
                </ul>
              </div>
            </div>
            
            {/* Additional Benefits */}
            <div className="mt-6 pt-4 border-t" style={{ borderColor: '#d1d5db' }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="p-2 rounded" style={{ background: 'rgba(255,255,255,0.5)' }}>
                  <div className="text-lg font-bold" style={{ color: '#059669' }}>∞</div>
                  <div className="text-[10px]" style={{ color: '#374151' }}>Unlimited Downloads</div>
                </div>
                <div className="p-2 rounded" style={{ background: 'rgba(255,255,255,0.5)' }}>
                  <div className="text-lg font-bold" style={{ color: '#059669' }}>🔒</div>
                  <div className="text-[10px]" style={{ color: '#374151' }}>Secure Stripe Payments</div>
                </div>
                <div className="p-2 rounded" style={{ background: 'rgba(255,255,255,0.5)' }}>
                  <div className="text-lg font-bold" style={{ color: '#059669' }}>📅</div>
                  <div className="text-[10px]" style={{ color: '#374151' }}>Cancel Anytime</div>
                </div>
                <div className="p-2 rounded" style={{ background: 'rgba(255,255,255,0.5)' }}>
                  <div className="text-lg font-bold" style={{ color: '#059669' }}>🎨</div>
                  <div className="text-[10px]" style={{ color: '#374151' }}>Gallery Storage</div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Credit Value Info */}
          <div className="glass-card rounded-xl p-4 max-w-2xl mx-auto">
            <h4 className="font-bold text-sm mb-2 text-center" style={{ color: '#000', fontFamily: "'VT323', monospace" }}>CREDIT VALUES</h4>
            <div className="grid grid-cols-3 gap-4 text-center text-xs">
              <div>
                <div className="font-bold" style={{ color: '#10b981' }}>🎨 Images</div>
                <div style={{ color: '#374151' }}>1 credit = 1 image</div>
              </div>
              <div>
                <div className="font-bold" style={{ color: '#8b5cf6' }}>🎬 Videos</div>
                <div style={{ color: '#374151' }}>1-1.5 credits/second</div>
              </div>
              <div>
                <div className="font-bold" style={{ color: '#06b6d4' }}>🎵 Music</div>
                <div style={{ color: '#374151' }}>1 credit = any length</div>
              </div>
            </div>
          </div>
          
          <p className="text-sm text-center" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
            All plans include access to all features. Cancel anytime. No hidden fees.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage;

