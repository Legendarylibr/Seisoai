import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { ImageGeneratorProvider } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider } from './contexts/SimpleWalletContext';
import { EmailAuthProvider, useEmailAuth } from './contexts/EmailAuthContext';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import MultiImageModelSelector from './components/MultiImageModelSelector';
import PromptOptimizer from './components/PromptOptimizer';
import EmailUserInfo from './components/EmailUserInfo';
import AuthGuard from './components/AuthGuard';
import GenerateButton from './components/GenerateButton';
import GenerationQueue from './components/GenerationQueue';
import { Grid, Sparkles, Film, Music, Layers, Box, type LucideIcon } from 'lucide-react';
import logger from './utils/logger';
import { API_URL } from './utils/apiConfig';

// PERFORMANCE: Lazy load heavy modals and gallery - not needed on initial render
const TokenPaymentModal = lazy(() => import('./components/TokenPaymentModal'));
const StripePaymentModal = lazy(() => import('./components/StripePaymentModal'));
const PaymentSuccessModal = lazy(() => import('./components/PaymentSuccessModal'));
const ImageGallery = lazy(() => import('./components/ImageGallery'));
const VideoGenerator = lazy(() => import('./components/VideoGenerator'));
const MusicGenerator = lazy(() => import('./components/MusicGenerator'));
const CharacterGenerator = lazy(() => import('./components/CharacterGenerator'));
const TermsModal = lazy(() => import('./components/TermsModal'));
import Footer from './components/Footer';
import type { LegalPage } from './components/TermsModal';

interface Tab {
  id: string;
  name: string;
  icon: LucideIcon;
}

// Win95 style loading fallback component
function Win95LoadingFallback({ text }: { text: string }): JSX.Element {
  return (
    <div 
      className="h-full flex flex-col items-center justify-center p-8"
      style={{ 
        background: '#c0c0c0',
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      <div 
        className="p-6 text-center"
        style={{
          background: '#c0c0c0',
          boxShadow: 'inset 1px 1px 0 #ffffff, inset -1px -1px 0 #000000, inset 2px 2px 0 #dfdfdf, inset -2px -2px 0 #808080'
        }}
      >
        <div className="w-8 h-8 mx-auto mb-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#000080', borderTopColor: 'transparent' }} />
        <p className="text-[11px] font-bold" style={{ color: '#000' }}>{text}</p>
        <p className="text-[10px] mt-1" style={{ color: '#808080' }}>Please wait...</p>
      </div>
    </div>
  );
}

interface SubscriptionSuccess {
  sessionId: string;
  planName: string;
  planPrice: string;
  credits?: number;
  error?: string;
}

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState('generate');

  const tabs: Tab[] = [
    { id: 'generate', name: 'Image', icon: Sparkles },
    { id: 'batch', name: 'Batch', icon: Layers },
    { id: 'video', name: 'Video', icon: Film },
    { id: 'music', name: 'Music', icon: Music },
    { id: '3d', name: '3D', icon: Box },
    { id: 'gallery', name: 'Gallery', icon: Grid }
  ];

  return (
    <SimpleWalletProvider>
      <EmailAuthProvider>
        <ImageGeneratorProvider>
          <AppWithCreditsCheck 
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            tabs={tabs}
          />
        </ImageGeneratorProvider>
      </EmailAuthProvider>
    </SimpleWalletProvider>
  );
}

interface AppWithCreditsCheckProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: Tab[];
}

function AppWithCreditsCheck({ activeTab, setActiveTab, tabs }: AppWithCreditsCheckProps): JSX.Element {
  const { isAuthenticated, userId, refreshCredits } = useEmailAuth();
  const [showTokenPaymentModal, setShowTokenPaymentModal] = useState(false);
  const [showStripePaymentModal, setShowStripePaymentModal] = useState(false);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState<SubscriptionSuccess | null>(null);
  const [userPrompt, setUserPrompt] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsPage, setTermsPage] = useState<LegalPage>('terms');

  // Handle subscription verification from Stripe checkout redirect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    const cleanupUrl = (): void => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    if (sessionId) {
      const verifySubscription = async (): Promise<void> => {
        try {
          const body: Record<string, string> = { sessionId };
          if (userId) {
            body.userId = userId;
          }

          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          const token = localStorage.getItem('authToken');
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const response = await fetch(`${API_URL}/api/subscription/verify`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to verify subscription payment');
          }

          // Show success modal
          setSubscriptionSuccess({
            sessionId,
            planName: data.planName || 'Subscription',
            planPrice: data.planPrice || (data.amount ? `$${data.amount}/month` : 'Activated'),
            credits: data.credits
          });

          // Refresh credits
          if (refreshCredits) {
            setTimeout(() => refreshCredits(), 1000);
          }

          logger.info('Subscription verified successfully', { 
            sessionId, 
            credits: data.credits, 
            planName: data.planName 
          });
        } catch (error) {
          const err = error as Error;
          logger.error('Subscription verification failed:', { error: err.message });
          // Still show some feedback even on error
          setSubscriptionSuccess({
            sessionId,
            planName: 'Subscription',
            planPrice: 'Processing...',
            error: err.message
          });
        } finally {
          cleanupUrl();
        }
      };

      verifySubscription();
    } else if (canceled) {
      logger.info('Subscription checkout was canceled');
      cleanupUrl();
    }
  }, [userId, refreshCredits]);

  const handleShowTokenPayment = useCallback((): void => {
    setShowTokenPaymentModal(true);
  }, []);

  const handleShowStripePayment = useCallback((): void => {
    setShowStripePaymentModal(true);
  }, []);

  const handleOpenTerms = useCallback((page: LegalPage = 'terms'): void => {
    setTermsPage(page);
    setShowTermsModal(true);
  }, []);

  return (
    <div className="min-h-screen lg:h-screen animated-bg flex flex-col" style={{ position: 'relative', zIndex: 0 }}>
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        tabs={tabs}
        onShowTokenPayment={handleShowTokenPayment}
        onShowStripePayment={handleShowStripePayment}
      />
      
      <div className="flex-1 overflow-auto p-2 lg:p-3">
        {activeTab === 'generate' && (
          <div className="container mx-auto max-w-7xl">
            <AuthGuard>
              <div className="space-y-3">
                {!isAuthenticated && <SimpleWalletConnect />}
                <EmailUserInfo />
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Left Column - Controls */}
                  <div className="space-y-3">
                    <PromptOptimizer onPromptChange={setUserPrompt} />
                    <StyleSelector />
                    <ReferenceImageInput />
                    <MultiImageModelSelector />
                    <GenerateButton 
                      customPrompt={userPrompt}
                      onShowTokenPayment={handleShowTokenPayment}
                      onShowStripePayment={handleShowStripePayment}
                    />
                  </div>
                  
                  {/* Right Column - Output */}
                  <div className="lg:h-full lg:min-h-[500px]">
                    <ImageOutput />
                  </div>
                </div>
              </div>
            </AuthGuard>
          </div>
        )}
        
        {activeTab === 'batch' && (
          <div className="container mx-auto max-w-7xl">
            <AuthGuard>
              <div className="space-y-3">
                {!isAuthenticated && <SimpleWalletConnect />}
                <EmailUserInfo />
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Left Column - Batch Controls */}
                  <div className="space-y-3">
                    <StyleSelector />
                    <MultiImageModelSelector />
                    <GenerationQueue
                      onShowTokenPayment={handleShowTokenPayment}
                      onShowStripePayment={handleShowStripePayment}
                    />
                  </div>
                  
                  {/* Right Column - Output */}
                  <div className="lg:h-full lg:min-h-[500px]">
                    <ImageOutput />
                  </div>
                </div>
              </div>
            </AuthGuard>
          </div>
        )}
        
        {activeTab === 'video' && (
          <Suspense fallback={<Win95LoadingFallback text="Loading Video Generator..." />}>
            <VideoGenerator 
              onShowTokenPayment={handleShowTokenPayment}
              onShowStripePayment={handleShowStripePayment}
            />
          </Suspense>
        )}
        
        {activeTab === 'music' && (
          <Suspense fallback={<Win95LoadingFallback text="Loading Music Generator..." />}>
            <MusicGenerator 
              onShowTokenPayment={handleShowTokenPayment}
              onShowStripePayment={handleShowStripePayment}
            />
          </Suspense>
        )}
        
        {activeTab === '3d' && (
          <Suspense fallback={<Win95LoadingFallback text="Loading 3D Character Creator..." />}>
            <CharacterGenerator 
              onShowTokenPayment={handleShowTokenPayment}
              onShowStripePayment={handleShowStripePayment}
            />
          </Suspense>
        )}
        
        
        {activeTab === 'gallery' && (
          <Suspense fallback={<Win95LoadingFallback text="Loading Gallery..." />}>
            <ImageGallery />
          </Suspense>
        )}
      </div>

      {/* Payment Modals */}
      {showTokenPaymentModal && (
        <Suspense fallback={null}>
          <TokenPaymentModal 
            isOpen={showTokenPaymentModal}
            onClose={() => setShowTokenPaymentModal(false)}
          />
        </Suspense>
      )}
      
      {showStripePaymentModal && (
        <Suspense fallback={null}>
          <StripePaymentModal 
            isOpen={showStripePaymentModal}
            onClose={() => setShowStripePaymentModal(false)}
          />
        </Suspense>
      )}

      {subscriptionSuccess && (
        <Suspense fallback={null}>
          <PaymentSuccessModal
            isOpen={!!subscriptionSuccess}
            onClose={() => setSubscriptionSuccess(null)}
            sessionId={subscriptionSuccess.sessionId}
            planName={subscriptionSuccess.planName}
            planPrice={subscriptionSuccess.planPrice}
            credits={subscriptionSuccess.credits}
            error={subscriptionSuccess.error}
          />
        </Suspense>
      )}

      {showTermsModal && (
        <Suspense fallback={null}>
          <TermsModal
            isOpen={showTermsModal}
            onClose={() => setShowTermsModal(false)}
            initialPage={termsPage}
          />
        </Suspense>
      )}

      <Footer onOpenTerms={handleOpenTerms} />
    </div>
  );
}

export default App;

