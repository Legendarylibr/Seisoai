import { useState, useEffect } from 'react';
import { Wallet, Sparkles } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WIN95 } from '../utils/buttonStyles';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';

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

const AuthPrompt: React.FC<AuthPromptProps> = () => {
  const wallet = useSimpleWallet();

  const preConnectMessage = '> Authenticate to activate your agents. Connect a wallet to begin.';
  const { displayText: preText, isDone: preTypeDone } = useTypewriter(preConnectMessage, 25, 1200);

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
      {/* Win95 Window */}
      <div
        className="w-full max-w-lg win95-window-open"
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
            SEISO.AI — Agent Terminal
          </span>
        </div>

        {/* Window Content */}
        <div className="p-3 sm:p-5">
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
              {({ mounted }) => {
                const ready = mounted;
                
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
        </div>
      </div>
    </div>
  );
};

export default AuthPrompt;
