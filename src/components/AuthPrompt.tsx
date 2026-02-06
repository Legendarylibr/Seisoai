import React, { useState, useEffect, useCallback } from 'react';
import { Wallet, Sparkles, MessageCircle, Image, Film, Music, Bot } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WIN95 } from '../utils/buttonStyles';

interface AuthPromptProps {
  onNavigate?: (tab: string) => void;
}

// Typewriter hook — types out text character by character
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

    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [text, speed, startDelay]);

  return { displayText, isDone };
}

// Agent roster data
const AGENTS = [
  { id: 'chat', icon: MessageCircle, name: 'Chat Agent', color: 'var(--win95-highlight)' },
  { id: 'image', icon: Image, name: 'Image Agent', color: 'var(--win95-success-text)' },
  { id: 'video', icon: Film, name: 'Video Agent', color: 'var(--win95-purple, #800080)' },
  { id: 'music', icon: Music, name: 'Music Agent', color: 'var(--win95-yellow, #808000)' },
];

const QUICK_ACTIONS = [
  { id: 'chat', icon: MessageCircle, label: 'Chat with AI' },
  { id: 'generate', icon: Image, label: 'Generate Image' },
  { id: 'video', icon: Film, label: 'Create Video' },
  { id: 'marketplace', icon: Bot, label: 'Create an Agent' },
];

const AuthPrompt: React.FC<AuthPromptProps> = ({ onNavigate }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [showConcierge, setShowConcierge] = useState(false);

  const preConnectMessage = '> Authenticate to activate your agents. Connect a wallet to begin.';
  const postConnectMessage = '> Your agents are ready. What would you like to create today?';

  const { displayText: preText, isDone: preTypeDone } = useTypewriter(preConnectMessage, 25, 1200);
  const { displayText: postText } = useTypewriter(
    showConcierge ? postConnectMessage : '',
    25,
    showConcierge ? 400 : 99999
  );

  // Auto-dismiss concierge after 8 seconds
  useEffect(() => {
    if (showConcierge) {
      const timeout = setTimeout(() => {
        if (onNavigate) onNavigate('chat');
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [showConcierge, onNavigate]);

  const handleQuickAction = useCallback((tab: string) => {
    if (onNavigate) onNavigate(tab);
  }, [onNavigate]);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const font = 'Tahoma, "MS Sans Serif", sans-serif';
  const monoFont = '"Consolas", "Courier New", monospace';

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
        overflow: 'auto',
        padding: '16px',
        background: 'var(--win95-teal)',
        zIndex: 30,
      }}
    >
      {/* Win95 Window */}
      <div
        className="w-full max-w-md win95-window-open"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 8px rgba(0,0,0,0.3)`,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{
            background: 'var(--win95-active-title)',
            color: '#ffffff',
            fontFamily: font,
          }}
        >
          <span className="agent-status-dot flex-shrink-0" />
          <span className="text-[12px] font-bold flex-1 text-left">
            SEISO.AI — Agent Terminal
          </span>
        </div>

        {/* Window Content */}
        <div style={{ padding: '20px' }}>
          {!showConcierge ? (
            /* ===== PRE-CONNECT STATE ===== */
            <>
              {/* Logo + Branding */}
              <div className="text-center mb-5 agent-reveal-1">
                <img
                  src="/seiso-logo.png"
                  alt="Seiso AI"
                  className="w-12 h-12 mx-auto mb-2 rounded-sm object-cover"
                  style={{ imageRendering: 'auto' }}
                />
                <h1
                  className="text-xl font-bold mb-1"
                  style={{ color: WIN95.highlight, fontFamily: font }}
                >
                  Seiso AI Agents
                </h1>
                <p className="text-[12px]" style={{ color: WIN95.text, fontFamily: font }}>
                  Autonomous AI agents that create images, videos, and music for you.
                </p>
              </div>

              {/* Agent Roster */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5 agent-reveal-2">
                {AGENTS.map((agent) => {
                  const Icon = agent.icon;
                  return (
                    <div
                      key={agent.id}
                      className="p-2 text-center"
                      style={{
                        background: WIN95.inputBg,
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                        fontFamily: font,
                      }}
                    >
                      <Icon
                        className="w-5 h-5 mx-auto mb-1"
                        style={{ color: agent.color }}
                      />
                      <div className="text-[10px] font-bold" style={{ color: WIN95.text }}>
                        {agent.name}
                      </div>
                      <div className="flex items-center justify-center gap-1 mt-1">
                        <span className="agent-status-dot" style={{ width: 5, height: 5 }} />
                        <span className="text-[9px]" style={{ color: 'var(--win95-success-text)' }}>
                          Online
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Typewriter Message */}
              <div
                className="mb-5 p-3 agent-reveal-3"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                  fontFamily: monoFont,
                  fontSize: '11px',
                  color: WIN95.text,
                  minHeight: '40px',
                }}
              >
                {preText}
                {!preTypeDone && <span className="typewriter-cursor" />}
              </div>

              {/* CTA — Activate Agents */}
              <div className="mb-4 agent-reveal-4">
                <ConnectButton.Custom>
                  {({ openConnectModal, account, mounted }) => {
                    const ready = mounted;

                    // Detect connection
                    if (account?.address && !isConnected) {
                      setTimeout(() => {
                        setIsConnected(true);
                        setConnectedAddress(account.address);
                        setShowConcierge(true);
                      }, 0);
                    }

                    return (
                      <div
                        {...(!ready && {
                          'aria-hidden': true,
                          style: { opacity: 0, pointerEvents: 'none' as const, userSelect: 'none' as const },
                        })}
                      >
                        <button
                          onClick={openConnectModal}
                          className="w-full generate-btn cta-glow flex items-center justify-center gap-3 px-6 py-4 text-base font-bold min-h-[48px]"
                          style={{
                            fontFamily: font,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <Wallet className="w-5 h-5" />
                          <span>Activate Agents</span>
                        </button>
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
                <p
                  className="text-center mt-2 text-[10px]"
                  style={{ color: WIN95.textDisabled, fontFamily: font }}
                >
                  Supports MetaMask, Coinbase, Rainbow & 300+ wallets
                </p>
              </div>

              {/* Benefits Strip */}
              <div className="grid grid-cols-2 gap-2 agent-reveal-5">
                <div
                  className="p-3 text-left"
                  style={{
                    background: 'var(--win95-info-yellow)',
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    fontFamily: font,
                  }}
                >
                  <h2
                    className="text-[11px] font-bold mb-1 flex items-center gap-1"
                    style={{ color: 'var(--win95-warning-text)' }}
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    NFT Holders
                  </h2>
                  <div className="text-[10px] space-y-0.5" style={{ color: WIN95.text }}>
                    <div><strong>FREE</strong> agent access</div>
                    <div>Priority queue</div>
                  </div>
                </div>

                <div
                  className="p-3 text-left"
                  style={{
                    background: 'var(--win95-info-green)',
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    fontFamily: font,
                  }}
                >
                  <h2
                    className="text-[11px] font-bold mb-1 flex items-center gap-1"
                    style={{ color: 'var(--win95-success-text)' }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Token Holders
                  </h2>
                  <div className="text-[10px] space-y-0.5" style={{ color: WIN95.text }}>
                    <div><strong>FREE</strong> access</div>
                    <div>Hold to earn rewards</div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ===== POST-CONNECT CONCIERGE ===== */
            <>
              <div className="text-center mb-4 agent-reveal-1">
                <img
                  src="/seiso-logo.png"
                  alt="Seiso AI"
                  className="w-10 h-10 mx-auto mb-2 rounded-sm object-cover"
                  style={{ imageRendering: 'auto' }}
                />
                <h2
                  className="text-base font-bold"
                  style={{ color: WIN95.text, fontFamily: font }}
                >
                  Welcome, {connectedAddress ? formatAddress(connectedAddress) : 'Operator'}
                </h2>
              </div>

              {/* Typewriter greeting */}
              <div
                className="mb-5 p-3 agent-reveal-2"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                  fontFamily: monoFont,
                  fontSize: '11px',
                  color: WIN95.text,
                  minHeight: '40px',
                }}
              >
                {postText}
                {postText.length < postConnectMessage.length && (
                  <span className="typewriter-cursor" />
                )}
              </div>

              {/* Quick Actions */}
              <div className="grid grid-cols-2 gap-2 agent-reveal-3">
                {QUICK_ACTIONS.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => handleQuickAction(action.id)}
                      className="p-3 text-center transition-none"
                      style={{
                        background: WIN95.buttonFace,
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
                        fontFamily: font,
                        border: 'none',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = WIN95.bgLight;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = WIN95.buttonFace;
                      }}
                    >
                      <Icon className="w-6 h-6 mx-auto mb-1" style={{ color: WIN95.highlight }} />
                      <div className="text-[11px] font-bold" style={{ color: WIN95.text }}>
                        {action.label}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p
                className="text-center mt-4 text-[10px] agent-reveal-4"
                style={{ color: WIN95.textDisabled, fontFamily: font }}
              >
                Click any option or wait to continue...
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPrompt;
