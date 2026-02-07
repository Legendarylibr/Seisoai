import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Sparkles, MessageCircle, Film, Music, Bot,
  Sun, Moon, Monitor, Eye, ChevronRight, User, Layers, Cpu, Grid, Settings
} from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WIN95 } from '../utils/buttonStyles';
import { useUserPreferences, ACCENT_COLORS, ALL_FEATURES } from '../contexts/UserPreferencesContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import type { LucideIcon } from 'lucide-react';

interface AuthPromptProps {
  onNavigate?: (tab: string) => void;
}

// Typewriter hook
function useTypewriter(text: string, speed = 30, startDelay = 1000): { displayText: string; isDone: boolean } {
  const [displayText, setDisplayText] = useState('');
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    setDisplayText('');
    setIsDone(false);
    let i = 0;
    let interval: NodeJS.Timeout;
    const timeout = setTimeout(() => {
      interval = setInterval(() => {
        i++;
        if (i <= text.length) {
          setDisplayText(text.slice(0, i));
        } else {
          setIsDone(true);
          clearInterval(interval);
        }
      }, speed);
    }, startDelay);
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
  }, [text, speed, startDelay]);

  return { displayText, isDone };
}

// Icon map for feature cards
const ICON_MAP: Record<string, LucideIcon> = {
  MessageCircle, Sparkles, Layers, Film, Music, Cpu, Bot, Grid,
};

const THEMES = [
  { id: 'system' as const, label: 'System', icon: Monitor },
  { id: 'light' as const, label: 'Light', icon: Sun },
  { id: 'dark' as const, label: 'Dark', icon: Moon },
  { id: 'high-contrast' as const, label: 'Contrast', icon: Eye },
];

const AuthPrompt: React.FC<AuthPromptProps> = ({ onNavigate }) => {
  const wallet = useSimpleWallet();
  const { preferences, updatePreference } = useUserPreferences();
  
  // IMPORTANT: Don't auto-show profile on mount based on stored auth.
  // Only show profile after user explicitly connects via the "Activate Agents" button.
  // The wallet context may report isConnected=true from a stale stored token,
  // but we want fresh authentication each session.
  const [isConnected, setIsConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const preConnectMessage = '> Authenticate to activate your agents. Connect a wallet to begin.';
  const profileMessage = '> Build your workspace. Toggle the features you want.';

  const { displayText: preText, isDone: preTypeDone } = useTypewriter(preConnectMessage, 25, 1200);
  const { displayText: profileText } = useTypewriter(
    showProfile ? profileMessage : '', 20, showProfile ? 300 : 99999
  );

  const toggleTab = useCallback((tabId: string) => {
    const current = preferences.enabledTabs;
    if (current.includes(tabId)) {
      // Don't allow disabling all — keep at least one
      if (current.length <= 1) return;
      updatePreference('enabledTabs', current.filter((t) => t !== tabId));
      // If we just disabled the default tab, update it
      if (preferences.defaultTab === tabId) {
        const remaining = current.filter((t) => t !== tabId);
        updatePreference('defaultTab', remaining[0]);
      }
    } else {
      updatePreference('enabledTabs', [...current, tabId]);
    }
  }, [preferences.enabledTabs, preferences.defaultTab, updatePreference]);

  const handleLaunch = useCallback(() => {
    updatePreference('profileCompleted', true);
    if (onNavigate) onNavigate(preferences.defaultTab || preferences.enabledTabs[0] || 'chat');
  }, [onNavigate, preferences.defaultTab, preferences.enabledTabs, updatePreference]);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const font = 'Tahoma, "MS Sans Serif", sans-serif';
  const monoFont = '"Consolas", "Courier New", monospace';

  const sunken = {
    background: WIN95.inputBg,
    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
  };

  return (
    <div
      className="p-3 sm:p-4"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'auto',
        background: 'var(--win95-teal)', zIndex: 30,
        // Safe area for devices with notches
        paddingTop: 'max(12px, env(safe-area-inset-top))',
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingLeft: 'max(12px, env(safe-area-inset-left))',
        paddingRight: 'max(12px, env(safe-area-inset-right))',
      }}
    >
      {/* Win95 Window - constrained height on mobile to ensure scrollability */}
      <div
        className="w-full max-w-lg win95-window-open max-h-full overflow-y-auto"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 8px rgba(0,0,0,0.3)`,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ background: 'var(--win95-active-title)', color: '#ffffff', fontFamily: font }}
        >
          <span className="agent-status-dot flex-shrink-0" />
          <span className="text-[12px] font-bold flex-1 text-left">
            {showProfile ? 'SEISO.AI — Agent Profile' : 'SEISO.AI — Agent Terminal'}
          </span>
        </div>

        {/* Window Content - responsive padding */}
        <div className="p-3 sm:p-5">
          {!showProfile ? (
            /* ===== PRE-CONNECT STATE ===== */
            <>
              {/* Logo + Branding */}
              <div className="text-center mb-5 agent-reveal-1">
                <img src="/seiso-logo.png" alt="Seiso AI" className="w-12 h-12 mx-auto mb-2 rounded-sm object-cover" style={{ imageRendering: 'auto' }} />
                <h1 className="text-xl font-bold mb-1" style={{ color: WIN95.highlight, fontFamily: font }}>
                  Seiso AI Agents
                </h1>
                <p className="text-[12px]" style={{ color: WIN95.text, fontFamily: font }}>
                  Autonomous AI agents that create images, videos, and music for you.
                </p>
              </div>

              {/* Typewriter Message */}
              <div className="mb-5 p-3 agent-reveal-2" style={{ ...sunken, fontFamily: monoFont, fontSize: '11px', color: WIN95.text, minHeight: '40px' }}>
                {preText}
                {!preTypeDone && <span className="typewriter-cursor" />}
              </div>

              {/* CTA — Activate Agents */}
              <div className="mb-4 agent-reveal-3">
                <ConnectButton.Custom>
                  {({ openConnectModal, account, mounted }) => {
                    const ready = mounted;
                    if (account?.address && !isConnected) {
                      setTimeout(() => {
                        setIsConnected(true);
                        setConnectedAddress(account.address);
                        setShowProfile(true);
                      }, 0);
                    }
                    
                    // Handler that sets the userInitiatedConnection flag via context
                    // and then opens RainbowKit modal
                    const handleActivateAgents = () => {
                      // Call connectWallet from context to set the flag
                      wallet.connectWallet().catch(() => {
                        // Ignore errors - the modal will show them
                      });
                    };
                    
                    return (
                      <div {...(!ready && { 'aria-hidden': true, style: { opacity: 0, pointerEvents: 'none' as const, userSelect: 'none' as const } })}>
                        <button
                          onClick={handleActivateAgents}
                          className="w-full generate-btn cta-glow flex items-center justify-center gap-3 px-4 sm:px-6 py-4 text-sm sm:text-base font-bold min-h-[52px] touch-manipulation active:scale-[0.98] transition-transform"
                          style={{ fontFamily: font, border: 'none', cursor: 'pointer' }}
                        >
                          <Wallet className="w-5 h-5 flex-shrink-0" />
                          <span>Activate Agents</span>
                        </button>
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
                <p className="text-center mt-2 text-[10px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                  Supports MetaMask, Coinbase, Rainbow & 300+ wallets
                </p>
              </div>

              {/* Benefits Strip */}
              <div className="grid grid-cols-2 gap-2 agent-reveal-4">
                <div className="p-3 text-left" style={{ background: 'var(--win95-info-yellow)', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`, fontFamily: font }}>
                  <h2 className="text-[11px] font-bold mb-1 flex items-center gap-1" style={{ color: 'var(--win95-warning-text)' }}>
                    <Wallet className="w-3.5 h-3.5" /> NFT Holders
                  </h2>
                  <div className="text-[10px] space-y-0.5" style={{ color: WIN95.text }}>
                    <div><strong>FREE</strong> agent access</div>
                    <div>Priority queue</div>
                  </div>
                </div>
                <div className="p-3 text-left" style={{ background: 'var(--win95-info-green)', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`, fontFamily: font }}>
                  <h2 className="text-[11px] font-bold mb-1 flex items-center gap-1" style={{ color: 'var(--win95-success-text)' }}>
                    <Sparkles className="w-3.5 h-3.5" /> Token Holders
                  </h2>
                  <div className="text-[10px] space-y-0.5" style={{ color: WIN95.text }}>
                    <div><strong>FREE</strong> access</div>
                    <div>Hold to earn rewards</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ===== POST-CONNECT: AGENT PROFILE / UI BUILDER ===== */
            <>
              {/* Profile Header */}
              <div className="flex items-center gap-3 mb-4 agent-reveal-1">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--win95-info-green)', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}
                >
                  <User className="w-5 h-5" style={{ color: 'var(--win95-success-text)' }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: WIN95.text, fontFamily: font }}>
                    {connectedAddress ? formatAddress(connectedAddress) : 'Operator'}
                  </h2>
                  <p className="text-[10px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                    Build your workspace — choose what you need
                  </p>
                </div>
              </div>

              {/* Terminal */}
              <div className="mb-4 p-2 agent-reveal-2" style={{ ...sunken, fontFamily: monoFont, fontSize: '10px', color: WIN95.text, minHeight: '24px' }}>
                {profileText}
                {profileText.length < profileMessage.length && <span className="typewriter-cursor" />}
              </div>

              {/* ===== FEATURE PICKER ===== */}
              <div className="mb-4 agent-reveal-3">
                <label className="flex items-center gap-1.5 text-[11px] font-bold mb-2" style={{ fontFamily: font, color: WIN95.text }}>
                  <Settings className="w-3.5 h-3.5" />
                  Your Features
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 sm:gap-1.5">
                  {ALL_FEATURES.map((feature) => {
                    const enabled = preferences.enabledTabs.includes(feature.id);
                    const isDefault = preferences.defaultTab === feature.id;
                    const Icon = ICON_MAP[feature.icon] || Bot;
                    
                    // Handle setting as home (works on tap for mobile)
                    const setAsHome = (e: React.MouseEvent | React.TouchEvent) => {
                      e.stopPropagation();
                      if (!preferences.enabledTabs.includes(feature.id)) {
                        updatePreference('enabledTabs', [...preferences.enabledTabs, feature.id]);
                      }
                      updatePreference('defaultTab', feature.id);
                    };
                    
                    return (
                      <button
                        key={feature.id}
                        onClick={() => toggleTab(feature.id)}
                        className="p-1.5 sm:p-2 text-center relative touch-manipulation"
                        style={{
                          background: enabled ? 'var(--win95-info-green)' : WIN95.inputBg,
                          boxShadow: enabled
                            ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                            : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                          border: 'none',
                          cursor: 'pointer',
                          fontFamily: font,
                          opacity: enabled ? 1 : 0.55,
                          // Minimum touch target size for mobile
                          minHeight: '44px',
                        }}
                        title={feature.description}
                      >
                        <Icon
                          className="w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-0.5 sm:mb-1"
                          style={{ color: enabled ? 'var(--win95-success-text)' : WIN95.textDisabled }}
                        />
                        <div className="text-[9px] sm:text-[10px] font-bold leading-tight" style={{ color: WIN95.text }}>
                          {feature.label}
                        </div>
                        {enabled && (
                          <button
                            onClick={setAsHome}
                            className="flex items-center justify-center gap-0.5 mt-0.5 w-full touch-manipulation"
                            style={{ 
                              background: isDefault ? 'var(--win95-success-text)' : 'transparent',
                              color: isDefault ? '#fff' : 'var(--win95-success-text)',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              borderRadius: '2px',
                            }}
                          >
                            <span className="agent-status-dot" style={{ width: 4, height: 4 }} />
                            <span className="text-[8px]">
                              {isDefault ? 'Home' : 'Set Home'}
                            </span>
                          </button>
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] mt-1.5" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                  Tap to toggle. Tap "Set Home" to choose your start page. {preferences.enabledTabs.length}/{ALL_FEATURES.length} enabled.
                </p>
              </div>

              {/* ===== THEME & COLOR (compact) ===== */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 agent-reveal-4">
                {/* Theme */}
                <div>
                  <label className="block text-[10px] font-bold mb-1.5" style={{ fontFamily: font, color: WIN95.text }}>
                    Theme
                  </label>
                  <div className="grid grid-cols-4 sm:grid-cols-2 gap-1">
                    {THEMES.map((theme) => {
                      const ThIcon = theme.icon;
                      const isActive = preferences.theme === theme.id;
                      return (
                        <button
                          key={theme.id}
                          onClick={() => updatePreference('theme', theme.id)}
                          className="p-1.5 sm:p-2 text-center touch-manipulation min-h-[40px]"
                          style={{
                            background: isActive ? 'var(--win95-info-green)' : WIN95.inputBg,
                            boxShadow: isActive
                              ? `inset 1px 1px 0 ${WIN95.border.darker}`
                              : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                            border: 'none', cursor: 'pointer', fontFamily: font,
                          }}
                        >
                          <ThIcon className="w-3.5 h-3.5 sm:w-3 sm:h-3 mx-auto" style={{ color: isActive ? 'var(--win95-success-text)' : WIN95.text }} />
                          <span className="text-[8px] font-bold block mt-0.5" style={{ color: WIN95.text }}>{theme.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accent + Language */}
                <div>
                  <label className="block text-[10px] font-bold mb-1.5" style={{ fontFamily: font, color: WIN95.text }}>
                    Accent Color
                  </label>
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {ACCENT_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => updatePreference('accentColor', color.value)}
                        className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center touch-manipulation"
                        style={{
                          background: color.value,
                          boxShadow: preferences.accentColor === color.value
                            ? `0 0 0 2px ${WIN95.text}`
                            : `inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.3)`,
                          border: 'none', cursor: 'pointer',
                        }}
                        title={color.name}
                      >
                        {preferences.accentColor === color.value && (
                          <span className="text-white text-[8px] font-bold">✓</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <label className="block text-[10px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                    Language
                  </label>
                  <div className="flex gap-1">
                    {([
                      { id: 'en' as const, label: 'EN' },
                      { id: 'ja' as const, label: 'JP' },
                      { id: 'zh' as const, label: 'CN' },
                    ]).map((lang) => (
                      <button
                        key={lang.id}
                        onClick={() => updatePreference('language', lang.id)}
                        className="px-3 py-1.5 sm:px-2 sm:py-1 text-[9px] font-bold touch-manipulation min-h-[32px]"
                        style={{
                          background: preferences.language === lang.id ? WIN95.bgDark : WIN95.inputBg,
                          color: preferences.language === lang.id ? WIN95.highlightText : WIN95.text,
                          boxShadow: preferences.language === lang.id
                            ? `inset 1px 1px 0 ${WIN95.border.darker}`
                            : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                          border: 'none', cursor: 'pointer', fontFamily: font,
                        }}
                      >
                        {lang.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ===== LAUNCH ===== */}
              <div className="agent-reveal-5">
                <button
                  onClick={handleLaunch}
                  className="w-full flex items-center justify-center gap-2 sm:gap-2.5 px-4 sm:px-6 py-3 sm:py-4 text-sm font-bold generate-btn cta-glow min-h-[52px] touch-manipulation active:scale-[0.98] transition-transform"
                  style={{ fontFamily: font, border: 'none', cursor: 'pointer' }}
                >
                  <Bot className="w-5 h-5 flex-shrink-0" />
                  <span>Launch My Workspace</span>
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                </button>
                <p className="text-center mt-2 text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                  You can change all of this later from the toolbar gear icon.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPrompt;
