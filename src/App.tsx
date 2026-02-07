import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import logger from './utils/logger';
import { ImageGeneratorProvider } from './contexts/ImageGeneratorContext';
import { SimpleWalletProvider, useSimpleWallet } from './contexts/SimpleWalletContext';
import { UserPreferencesProvider, useUserPreferences } from './contexts/UserPreferencesContext';
import { WalletProvider } from './providers/WalletProvider';
import { LanguageProvider, useLanguage } from './i18n';
import SimpleWalletConnect from './components/SimpleWalletConnect';
import StyleSelector from './components/StyleSelector';
import ImageOutput from './components/ImageOutput';
import Navigation from './components/Navigation';
import ReferenceImageInput from './components/ReferenceImageInput';
import MultiImageModelSelector from './components/MultiImageModelSelector';
import AspectRatioSelector from './components/AspectRatioSelector';
import PromptOptimizer from './components/PromptOptimizer';
import AuthGuard from './components/AuthGuard';
import AuthPrompt from './components/AuthPrompt';
import GenerateButton from './components/GenerateButton';
import GenerationQueue from './components/GenerationQueue';
import PromptLab from './components/PromptLab';
import ErrorBoundary from './components/ErrorBoundary';
import { useImageGenerator } from './contexts/ImageGeneratorContext';
import { Grid, Globe, Sparkles, Film, Music, Layers, MessageCircle, Cpu, Bot, ListTree, type LucideIcon } from 'lucide-react';
import { ensureCSRFToken } from './utils/apiConfig';

// Build version - check console to verify deployment
logger.info('[SEISOAI BUILD] v2026.01.06.1');

// PERFORMANCE: Lazy load heavy modals and gallery - not needed on initial render
// TokenPaymentModal handles on-chain stablecoin payments (USDC on Ethereum, Solana, Polygon, Base, etc.)
const TokenPaymentModal = lazy(() => import('./components/TokenPaymentModal'));
const ImageGallery = lazy(() => import('./components/ImageGallery'));
const VideoGenerator = lazy(() => import('./components/VideoGenerator'));
const MusicGenerator = lazy(() => import('./components/MusicGenerator'));
const ChatAssistant = lazy(() => import('./components/ChatAssistant'));
// CharacterGenerator is temporarily disabled - uncomment when 3D generation is fixed
// const CharacterGenerator = lazy(() => import('./components/CharacterGenerator'));
const ModelTraining = lazy(() => import('./components/ModelTraining'));
const AgentMarketplace = lazy(() => import('./components/AgentMarketplace'));
const TaskBuilder = lazy(() => import('./components/TaskBuilder'));
const TermsModal = lazy(() => import('./components/TermsModal'));
const OnboardingWizard = lazy(() => import('./components/OnboardingWizard'));
const PublicGallery = lazy(() => import('./components/PublicGallery'));
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
      className="h-full flex flex-col items-center justify-center p-4 lg:p-8"
      style={{ 
        background: 'var(--win95-bg)',
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      <div 
        className="p-4 lg:p-6 text-center"
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

/** Get the tab ID from URL hash */
function getTabFromHash(): string | null {
  const hash = window.location.hash.slice(1); // Remove '#'
  return hash || null;
}

/** Update URL hash without triggering navigation */
function updateUrlHash(tabId: string): void {
  const newUrl = `${window.location.pathname}#${tabId}`;
  window.history.pushState({ tab: tabId }, '', newUrl);
}

function AppContentInner(): JSX.Element {
  const { preferences } = useUserPreferences();
  const { t } = useLanguage();

  const allTabs: Tab[] = [
    { id: 'workbench', name: 'Agent Builder', icon: Bot },
    { id: 'chat', name: t.nav.chat, icon: MessageCircle },
    { id: 'generate', name: t.nav.image, icon: Sparkles },
    { id: 'batch', name: t.nav.batch, icon: Layers },
    { id: 'video', name: t.nav.video, icon: Film },
    { id: 'music', name: t.nav.music, icon: Music },
    { id: 'training', name: t.nav.training || 'Training', icon: Cpu },
    { id: 'workflows', name: 'Workflows', icon: ListTree },
    // TEMPORARILY DISABLED - 3D not working, re-enable when fixed
    // { id: '3d', name: '3D', icon: Box },
    { id: 'gallery', name: t.nav.gallery, icon: Grid },
    { id: 'community', name: 'Community', icon: Globe }
  ];

  // Filter tabs to only show user-enabled features
  const enabledSet = new Set(preferences.enabledTabs);
  const tabs = allTabs.filter((tab) => enabledSet.has(tab.id));
  const validTabIds = new Set(tabs.map(t => t.id));

  // Initialize tab from URL hash, fallback to preferences, then first enabled tab
  const [activeTab, setActiveTab] = useState(() => {
    const hashTab = getTabFromHash();
    if (hashTab && validTabIds.has(hashTab)) return hashTab;
    if (preferences.defaultTab && validTabIds.has(preferences.defaultTab)) return preferences.defaultTab;
    return tabs[0]?.id || 'workbench';
  });

  // Sync URL hash when tab changes
  const handleSetActiveTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    updateUrlHash(tabId);
  }, []);

  // Listen for browser back/forward navigation
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const hashTab = getTabFromHash();
      if (hashTab && validTabIds.has(hashTab)) {
        setActiveTab(hashTab);
      } else if (event.state?.tab && validTabIds.has(event.state.tab)) {
        setActiveTab(event.state.tab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [validTabIds]);

  // Set initial URL hash if not present
  useEffect(() => {
    if (!window.location.hash && activeTab) {
      window.history.replaceState({ tab: activeTab }, '', `${window.location.pathname}#${activeTab}`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If current activeTab was disabled, switch to the first enabled tab
  useEffect(() => {
    if (tabs.length > 0 && !enabledSet.has(activeTab)) {
      const newTab = tabs[0].id;
      setActiveTab(newTab);
      updateUrlHash(newTab);
    }
  }, [preferences.enabledTabs]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ImageGeneratorProvider
      defaultModel={preferences.defaultModel}
      defaultOptimizePrompt={preferences.defaultOptimizePrompt}
    >
      <AppWithCreditsCheck 
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        tabs={tabs}
      />
    </ImageGeneratorProvider>
  );
}

// Sign-in gate - shows AuthPrompt until user is fully authenticated with JWT
function SignInGate(): JSX.Element {
  const { isConnected, isLoading, error } = useSimpleWallet();
  const { preferences } = useUserPreferences();
  const [csrfReady, setCsrfReady] = useState(false);

  // Pre-fetch CSRF token on mount so it's ready before any auth attempts
  useEffect(() => {
    ensureCSRFToken()
      .then(() => setCsrfReady(true))
      .catch(() => setCsrfReady(true)); // Continue anyway, will retry on request
  }, []);

  // Show loading spinner while CSRF token is being fetched
  if (!csrfReady) {
    return (
      <div 
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'var(--win95-teal)',
          zIndex: 50 
        }}
      >
        <div 
          className="p-6 text-center"
          style={{
            background: 'var(--win95-bg)',
            boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), 4px 4px 8px rgba(0,0,0,0.3)'
          }}
        >
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--win95-highlight)', borderTopColor: 'transparent' }} />
          <p className="text-[12px] font-bold" style={{ color: 'var(--win95-text)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Initializing...
          </p>
        </div>
      </div>
    );
  }

  // Show loading spinner while authenticating
  if (isLoading) {
    return (
      <div 
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'var(--win95-teal)',
          zIndex: 50 
        }}
      >
        <div 
          className="p-6 text-center"
          style={{
            background: 'var(--win95-bg)',
            boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), 4px 4px 8px rgba(0,0,0,0.3)'
          }}
        >
          <div className="w-8 h-8 mx-auto mb-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--win95-highlight)', borderTopColor: 'transparent' }} />
          <p className="text-[12px] font-bold" style={{ color: 'var(--win95-text)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Authenticating...
          </p>
          <p className="text-[10px] mt-1" style={{ color: 'var(--win95-text-disabled)' }}>
            Please sign the message in your wallet
          </p>
        </div>
      </div>
    );
  }

  // Show error if authentication failed
  if (error) {
    return (
      <div 
        style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          background: 'var(--win95-teal)',
          zIndex: 50 
        }}
      >
        <div 
          className="p-6 text-center max-w-md"
          style={{
            background: 'var(--win95-bg)',
            boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), 4px 4px 8px rgba(0,0,0,0.3)'
          }}
        >
          <div className="w-10 h-10 mx-auto mb-3 flex items-center justify-center" style={{ color: '#c00' }}>
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
          </div>
          <p className="text-[12px] font-bold mb-2" style={{ color: 'var(--win95-text)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Authentication Error
          </p>
          <p className="text-[11px] mb-4" style={{ color: 'var(--win95-text)' }}>
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-[11px] font-bold"
            style={{
              background: 'var(--win95-bg)',
              boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Not connected or not authenticated - show sign-in screen
  if (!isConnected || !preferences.profileCompleted) {
    return <AuthPrompt />;
  }

  // Authenticated - show the main app
  return <AppContentInner />;
}

function AppContent(): JSX.Element {
  return (
    <WalletProvider>
      <SimpleWalletProvider>
        <UserPreferencesProvider>
          <SignInGate />
        </UserPreferencesProvider>
      </SimpleWalletProvider>
    </WalletProvider>
  );
}

function App(): JSX.Element {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
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
  // Onboarding wizard for first-time users
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem('onboarding_completed'); } catch { return false; }
  });
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

  // Keep legacy handler pointing to the unified modal for backwards compatibility
  const handleShowTokenPayment = handleShowPayment;

  const handleOpenTerms = useCallback((page: LegalPage = 'terms'): void => {
    setTermsPage(page);
    setShowTermsModal(true);
  }, []);

  return (
    <div className="h-dvh animated-bg flex flex-col">
      <Navigation 
        activeTab={activeTab} 
        setActiveTab={setActiveTab}
        tabs={tabs}
        onShowTokenPayment={handleShowTokenPayment}
      />
      
      {/* Main content area - pb-6 accounts for fixed footer (24px) */}
      <div className="flex-1 min-h-0 flex flex-col pb-6 overflow-auto">
        {activeTab === 'chat' && (
          <ErrorBoundary fallbackText="Chat encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Chat Assistant..." />}>
                  <ChatAssistant />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {activeTab === 'generate' && (
          <ErrorBoundary fallbackText="Image generator encountered an error">
          <div className="container mx-auto max-w-7xl" style={{ height: '100%', width: '100%', overflow: 'auto' }}>
            <AuthGuard onNavigate={setActiveTab}>
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
          </ErrorBoundary>
        )}
        
        {activeTab === 'batch' && (
          <ErrorBoundary fallbackText="Batch generator encountered an error">
          <div className="container mx-auto max-w-7xl" style={{ height: '100%', width: '100%', overflow: 'auto' }}>
            <AuthGuard onNavigate={setActiveTab}>
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
                      onShowStripePayment={handleShowPayment}
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
          </ErrorBoundary>
        )}
        
        {activeTab === 'video' && (
          <ErrorBoundary fallbackText="Video generator encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Video Generator..." />}>
                  <VideoGenerator 
                    onModelChange={setVideoModel}
                    onGenerationModeChange={setVideoGenerationMode}
                  />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {activeTab === 'music' && (
          <ErrorBoundary fallbackText="Music generator encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Music Generator..." />}>
                  <MusicGenerator />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {activeTab === 'training' && (
          <ErrorBoundary fallbackText="Model training encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Model Training..." />}>
                  <ModelTraining />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {/* TEMPORARILY DISABLED - 3D not working, re-enable when fixed
        {activeTab === '3d' && (
          <Suspense fallback={<Win95LoadingFallback text="Loading 3D Character Creator..." />}>
            <CharacterGenerator />
          </Suspense>
        )}
        */}
        
        {activeTab === 'workbench' && (
          <ErrorBoundary fallbackText="Agent workbench encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Agent Workbench..." />}>
                  <AgentMarketplace onNavigate={setActiveTab} />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {activeTab === 'workflows' && (
          <ErrorBoundary fallbackText="Workflow builder encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Workflow Builder..." />}>
                  <TaskBuilder />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {activeTab === 'gallery' && (
          <ErrorBoundary fallbackText="Gallery encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Gallery..." />}>
                  <ImageGallery />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
        )}
        
        {activeTab === 'community' && (
          <ErrorBoundary fallbackText="Community gallery encountered an error">
            <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
              <AuthGuard onNavigate={setActiveTab}>
                <Suspense fallback={<Win95LoadingFallback text="Loading Community Gallery..." />}>
                  <PublicGallery showHeader={true} />
                </Suspense>
              </AuthGuard>
            </div>
          </ErrorBoundary>
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

      {/* Onboarding Wizard - shown for first-time users */}
      {showOnboarding && isConnected && (
        <Suspense fallback={null}>
          <OnboardingWizard
            isOpen={showOnboarding}
            onClose={() => {
              setShowOnboarding(false);
              try { localStorage.setItem('onboarding_completed', 'true'); } catch { /* ignore */ }
            }}
            onComplete={() => {
              setShowOnboarding(false);
              try { localStorage.setItem('onboarding_completed', 'true'); } catch { /* ignore */ }
            }}
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

