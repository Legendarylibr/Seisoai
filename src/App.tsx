import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import logger from './utils/logger';
import { ImageGeneratorProvider } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider, useSimpleWallet } from './contexts/SimpleWalletContext';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import MultiImageModelSelector from './components/MultiImageModelSelector';
import AspectRatioSelector from './components/AspectRatioSelector';
import PromptOptimizer from './components/PromptOptimizer';
import AuthGuard from './components/AuthGuard';
import GenerateButton from './components/GenerateButton';
import GenerationQueue from './components/GenerationQueue';
import PromptLab from './components/PromptLab';
import { useImageGenerator } from './contexts/ImageGeneratorContext';
import { Grid, Sparkles, Film, Music, Layers, MessageCircle, type LucideIcon } from 'lucide-react';
import { API_URL, ensureCSRFToken } from './utils/apiConfig';

// Build version - check console to verify deployment
logger.info('[SEISOAI BUILD] v2026.01.06.1');

// PERFORMANCE: Lazy load heavy modals and gallery - not needed on initial render
// TokenPaymentModal handles on-chain stablecoin payments (USDC on Ethereum, Solana, Polygon, Base, etc.)
const TokenPaymentModal = lazy(() => import('./components/TokenPaymentModal'));
const ImageGallery = lazy(() => import('./components/ImageGallery'));
const VideoGenerator = lazy(() => import('./components/VideoGenerator'));
const MusicGenerator = lazy(() => import('./components/MusicGenerator'));
const ChatAssistant = lazy(() => import('./components/ChatAssistant'));
const _CharacterGenerator = lazy(() => import('./components/CharacterGenerator'));
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
        background: 'var(--win95-bg)',
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      <div 
        className="p-6 text-center"
        style={{
          background: 'var(--win95-bg)',
          boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), inset 2px 2px 0 var(--win95-bg-light), inset -2px -2px 0 var(--win95-bg-dark)'
        }}
      >
        <div className="w-8 h-8 mx-auto mb-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--win95-highlight)', borderTopColor: 'transparent' }} />
        <p className="text-[11px] font-bold" style={{ color: 'var(--win95-text)' }}>{text}</p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--win95-text-disabled)' }}>Please wait...</p>
      </div>
    </div>
  );
}

function App(): JSX.Element {
  const [activeTab, setActiveTab] = useState('chat');

  const tabs: Tab[] = [
    { id: 'chat', name: 'Chat', icon: MessageCircle },
    { id: 'generate', name: 'Image', icon: Sparkles },
    { id: 'batch', name: 'Batch', icon: Layers },
    { id: 'video', name: 'Video', icon: Film },
    { id: 'music', name: 'Music', icon: Music },
    // TEMPORARILY DISABLED - 3D not working, re-enable when fixed
    // { id: '3d', name: '3D', icon: Box },
    { id: 'gallery', name: 'Gallery', icon: Grid }
  ];

  return (
    <SimpleWalletProvider>
      <ImageGeneratorProvider>
        <AppWithCreditsCheck 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tabs={tabs}
        />
      </ImageGeneratorProvider>
    </SimpleWalletProvider>
  );
}

interface AppWithCreditsCheckProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: Tab[];
}

function AppWithCreditsCheck({ activeTab, setActiveTab, tabs }: AppWithCreditsCheckProps): JSX.Element {
  const { isConnected, address, refreshCredits, hasFreeAccess, isNFTHolder, isTokenHolder } = useSimpleWallet();
  const { multiImageModel } = useImageGenerator();
  // Payment modal - crypto payments only (USDC, USDT on EVM chains + Solana)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [userPrompt, setUserPrompt] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsPage, setTermsPage] = useState<LegalPage>('terms');
  // Track video model and mode for PromptLab optimization
  const [videoModel, setVideoModel] = useState<string>('ltx');
  const [videoGenerationMode, setVideoGenerationMode] = useState<string>('text-to-video');

  // Initialize CSRF token on app mount to ensure it's available for POST requests
  useEffect(() => {
    ensureCSRFToken().catch(() => {
      // Silent fail - token will be fetched on first POST request if needed
    });
  }, []);

  // Log holder status for debugging
  useEffect(() => {
    if (isConnected && address) {
      logger.info('Wallet connected', { 
        address, 
        hasFreeAccess, 
        isNFTHolder, 
        isTokenHolder 
      });
    }
  }, [isConnected, address, hasFreeAccess, isNFTHolder, isTokenHolder]);

  // Clean up any stale URL parameters (e.g., from old bookmarks)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const canceled = urlParams.get('canceled');

    // Clean up legacy Stripe-related URL parameters
    if (sessionId || canceled) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Payment handler - crypto payments (USDC, USDT on Ethereum, Solana, Polygon, Base)
  const handleShowPayment = useCallback((): void => {
    setShowPaymentModal(true);
  }, []);

  // Keep legacy handlers pointing to the unified modal for backwards compatibility
  const handleShowTokenPayment = handleShowPayment;
  const handleShowStripePayment = handleShowPayment;

  const handleOpenTerms = useCallback((page: LegalPage = 'terms'): void => {
    setTermsPage(page);
    setShowTermsModal(true);
  }, []);

  return (
    <div className="h-dvh animated-bg flex flex-col overflow-hidden" style={{ position: 'relative', zIndex: 0, maxHeight: '100dvh' }}>
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        tabs={tabs}
        onShowTokenPayment={handleShowTokenPayment}
        onShowStripePayment={handleShowStripePayment}
      />
      
      <div className="flex-1 min-h-0 overflow-hidden p-0.5 sm:p-1 lg:p-2" style={{ flex: '1 1 0%' }}>
        {activeTab === 'chat' && (
          <div className="h-full min-h-0 flex flex-col" style={{ flex: '1 1 0%' }}>
            <Suspense fallback={<Win95LoadingFallback text="Loading Chat Assistant..." />}>
              <ChatAssistant 
                onShowTokenPayment={handleShowTokenPayment}
                onShowStripePayment={handleShowStripePayment}
              />
            </Suspense>
          </div>
        )}
        
        {activeTab === 'generate' && (
          <div className="h-full min-h-0 overflow-hidden container mx-auto max-w-7xl" style={{ flex: '1 1 0%' }}>
            <AuthGuard>
              <div className="h-full flex flex-col lg:flex-row gap-0.5 sm:gap-1.5 lg:gap-2">
                {/* Left Column - Controls */}
                <div className="lg:w-[42%] flex flex-col min-h-0 flex-shrink-0">
                  {/* Mobile: compact layout with prompt visible, Desktop: scrollable */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 sm:space-y-1.5 pb-0.5 sm:pb-1">
                    {/* Wallet connect - hidden on mobile since it's in nav */}
                    <div className="hidden sm:block">
                      <SimpleWalletConnect />
                    </div>
                    {/* Prompt - always visible first */}
                    <PromptOptimizer value={userPrompt} onPromptChange={setUserPrompt} />
                    {/* Secondary controls - collapsed on mobile */}
                    <details className="sm:hidden" open>
                      <summary 
                        className="text-[10px] font-bold px-2 py-1 cursor-pointer select-none"
                        style={{
                          background: 'var(--win95-bg)',
                          color: 'var(--win95-text)',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)'
                        }}
                      >
                        ▼ More Options (Style, Aspect, Reference, Model)
                      </summary>
                      <div className="space-y-0.5 mt-0.5">
                        <StyleSelector />
                        <AspectRatioSelector />
                        <ReferenceImageInput />
                        <MultiImageModelSelector />
                      </div>
                    </details>
                    {/* Desktop: show all controls */}
                    <div className="hidden sm:block space-y-1.5">
                      <StyleSelector />
                      <AspectRatioSelector />
                      <ReferenceImageInput />
                      <MultiImageModelSelector />
                    </div>
                  </div>
                  {/* Generate button */}
                  <div className="flex-shrink-0 pt-0.5 sm:pt-1 pb-0.5 sm:pb-2 lg:pb-0">
                    <GenerateButton 
                      customPrompt={userPrompt}
                      onShowTokenPayment={handleShowTokenPayment}
                      onShowStripePayment={handleShowStripePayment}
                    />
                  </div>
                </div>
                
                {/* Right Column - Output */}
                <div className="flex-1 min-h-[120px] sm:min-h-[300px] lg:min-h-0">
                  <ImageOutput />
                </div>
              </div>
            </AuthGuard>
          </div>
        )}
        
        {activeTab === 'batch' && (
          <div className="h-full min-h-0 overflow-hidden container mx-auto max-w-7xl" style={{ flex: '1 1 0%' }}>
            <AuthGuard>
              <div className="h-full flex flex-col lg:flex-row gap-0.5 sm:gap-1.5 lg:gap-2">
                {/* Left Column - Batch Controls */}
                <div className="lg:w-[42%] flex flex-col min-h-0 flex-shrink-0">
                  {/* Mobile: compact layout, Desktop: scrollable */}
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 sm:space-y-1.5 pb-0.5 sm:pb-2 lg:pb-0">
                    {/* Wallet connect - hidden on mobile since it's in nav */}
                    <div className="hidden sm:block">
                      <SimpleWalletConnect />
                    </div>
                    {/* Secondary controls - collapsed on mobile */}
                    <details className="sm:hidden" open>
                      <summary 
                        className="text-[10px] font-bold px-2 py-1 cursor-pointer select-none"
                        style={{
                          background: 'var(--win95-bg)',
                          color: 'var(--win95-text)',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)'
                        }}
                      >
                        ▼ Options (Style, Model)
                      </summary>
                      <div className="space-y-0.5 mt-0.5">
                        <StyleSelector />
                        <MultiImageModelSelector />
                      </div>
                    </details>
                    {/* Desktop: show all controls */}
                    <div className="hidden sm:block space-y-1.5">
                      <StyleSelector />
                      <MultiImageModelSelector />
                    </div>
                    <GenerationQueue
                      onShowTokenPayment={handleShowTokenPayment}
                      onShowStripePayment={handleShowStripePayment}
                    />
                  </div>
                </div>
                
                {/* Right Column - Output */}
                <div className="flex-1 min-h-[120px] sm:min-h-[300px] lg:min-h-0">
                  <ImageOutput />
                </div>
              </div>
            </AuthGuard>
          </div>
        )}
        
        {activeTab === 'video' && (
          <div className="h-full min-h-0 overflow-hidden" style={{ flex: '1 1 0%' }}>
            <Suspense fallback={<Win95LoadingFallback text="Loading Video Generator..." />}>
              <VideoGenerator 
                onShowTokenPayment={handleShowTokenPayment}
                onShowStripePayment={handleShowStripePayment}
                onModelChange={setVideoModel}
                onGenerationModeChange={setVideoGenerationMode}
              />
            </Suspense>
          </div>
        )}
        
        {activeTab === 'music' && (
          <div className="h-full min-h-0 overflow-hidden" style={{ flex: '1 1 0%' }}>
            <Suspense fallback={<Win95LoadingFallback text="Loading Music Generator..." />}>
              <MusicGenerator 
                onShowTokenPayment={handleShowTokenPayment}
                onShowStripePayment={handleShowStripePayment}
              />
            </Suspense>
          </div>
        )}
        
        {/* TEMPORARILY DISABLED - 3D not working, re-enable when fixed
        {activeTab === '3d' && (
          <Suspense fallback={<Win95LoadingFallback text="Loading 3D Character Creator..." />}>
            <CharacterGenerator 
              onShowTokenPayment={handleShowTokenPayment}
              onShowStripePayment={handleShowStripePayment}
            />
          </Suspense>
        )}
        */}
        
        
        {activeTab === 'gallery' && (
          <div className="h-full min-h-0 overflow-hidden" style={{ flex: '1 1 0%' }}>
            <Suspense fallback={<Win95LoadingFallback text="Loading Gallery..." />}>
              <ImageGallery />
            </Suspense>
          </div>
        )}
      </div>

      {/* Token Payment Modal - On-chain stablecoin payments (USDC) */}
      {showPaymentModal && (
        <Suspense fallback={null}>
          <TokenPaymentModal 
            isOpen={showPaymentModal}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => {
              setShowPaymentModal(false);
              if (refreshCredits) refreshCredits();
            }}
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

      {/* Prompt Lab - AI prompt planning assistant (only for connected users on generation screens, not chat since chat IS the assistant) */}
      {isConnected && activeTab !== 'chat' && (activeTab === 'generate' || activeTab === 'batch' || activeTab === 'video' || activeTab === 'music') && (
        <PromptLab
          mode={activeTab === 'generate' || activeTab === 'batch' ? 'image' : activeTab as 'video' | 'music'}
          currentPrompt={userPrompt}
          selectedModel={
            activeTab === 'generate' || activeTab === 'batch' 
              ? multiImageModel || 'flux'
              : activeTab === 'video' 
                ? videoModel 
                : 'music'
          }
          generationMode={activeTab === 'video' ? videoGenerationMode : undefined}
          onApplyPrompt={setUserPrompt}
        />
      )}

      <Footer onOpenTerms={handleOpenTerms} />
    </div>
  );
}

export default App;

