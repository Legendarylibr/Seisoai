import React, { useState, memo } from 'react';
import { FileText, Shield, AlertTriangle, Scale, ChevronRight } from 'lucide-react';
import { WIN95, PANEL, TITLEBAR } from '../utils/buttonStyles';

type LegalPage = 'terms' | 'privacy' | 'content' | 'refunds' | null;

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPage?: LegalPage;
}

const NavItem = memo(function NavItem({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-none"
      style={{
        background: active ? WIN95.highlight : 'transparent',
        color: active ? WIN95.highlightText : WIN95.text,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        fontWeight: active ? 'bold' : 'normal'
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = WIN95.bgDark; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {active && <ChevronRight className="w-3 h-3" />}
    </button>
  );
});

const TermsOfService = memo(function TermsOfService() {
  return (
    <div className="space-y-3 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold">Terms of Service</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>
      
      <p>By using Seiso AI, you agree to these terms.</p>

      <h3 className="font-bold">Service</h3>
      <p>AI-powered image, video, and music generation. Credits purchased with crypto only (USDC, USDT on EVM chains and Solana).</p>

      <h3 className="font-bold">Accounts & Credits</h3>
      <p>Access via wallet. Credits are non-refundable except for technical failures. You're responsible for account security.</p>

      <h3 className="font-bold">Content Rights</h3>
      <p>You retain rights to prompts. Generated content licensed for personal and commercial use. You're responsible for checking IP before commercial use.</p>

      <h3 className="font-bold">Prohibited Use</h3>
      <p>See Content Policy. Violations = termination without refund.</p>

      <h3 className="font-bold">Disclaimer</h3>
      <p>Service "as is" without warranties. Not liable for indirect damages. Disputes via binding arbitration.</p>

      <h3 className="font-bold">Restricted Regions</h3>
      <div 
        className="p-2 mt-1"
        style={{ background: '#fff3e0', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}
      >
        <p style={{ color: '#bf360c' }}>Not available in: North Korea, Iran, Syria, Cuba, Crimea/Donetsk/Luhansk, Russia, and OFAC-sanctioned territories. By using the service, you confirm you're not in a restricted region.</p>
      </div>
    </div>
  );
});

const PrivacyPolicy = memo(function PrivacyPolicy() {
  return (
    <div className="space-y-3 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold">Privacy Policy</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>

      <h3 className="font-bold">Data We Collect (Minimized)</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Account info (wallet address only)</li>
        <li>Prompts and generated content (auto-deleted after 30 days)</li>
        <li>Payment records (blockchain transaction hashes only)</li>
        <li>Temporary abuse prevention data (auto-deleted after 7 days)</li>
      </ul>

      <h3 className="font-bold">How We Use Data</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Provide and improve the service</li>
        <li>Process payments</li>
        <li>Prevent abuse and enforce policies</li>
      </ul>

      <h3 className="font-bold">Data Sharing</h3>
      <p>We share data with FAL.ai (generation). We don't sell your data.</p>

      <h3 className="font-bold">Payment Privacy</h3>
      <div 
        className="p-3 mt-1"
        style={{ background: '#e8f5e9', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}
      >
        <p className="font-bold mb-2" style={{ color: '#2e7d32' }}>Your wallet credentials never touch our servers.</p>
        <ul className="list-disc list-inside ml-2" style={{ color: '#1b5e20' }}>
          <li>All payments are processed on-chain (Ethereum, Polygon, Base, Solana, etc.)</li>
          <li>We never access your private keys or seed phrases</li>
          <li>We only verify blockchain transaction hashes after payment</li>
          <li>Supported tokens: USDC, USDT, DAI, WETH</li>
        </ul>
      </div>

      <h3 className="font-bold">Data Retention & Auto-Deletion</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Generated content: <strong>auto-deleted after 30 days</strong></li>
        <li>Gallery items: <strong>auto-deleted after 30 days</strong> (download before expiry)</li>
        <li>Abuse prevention data: <strong>auto-deleted after 7 days</strong></li>
        <li>Inactive accounts (0 credits): <strong>auto-deleted after 90 days</strong></li>
        <li>Payment records: retained per financial regulations (required by law)</li>
      </ul>

      <h3 className="font-bold">Data Deletion</h3>
      <p>To delete your data:</p>
      <ul className="list-disc list-inside ml-2">
        <li>Delete individual items from your gallery anytime</li>
        <li>Request full account deletion through our support</li>
        <li>Account deletion removes all stored content within 30 days</li>
        <li>Some data may be retained for legal compliance</li>
      </ul>

      <h3 className="font-bold">Your Rights</h3>
      <p>You may request access, correction, or deletion of your data through our support.</p>

      <h3 className="font-bold">Security & Encryption</h3>
      <p>All connections use HTTPS. Your wallet address is the only identifier used for authentication. We never require email or personal information.</p>
      
      <p className="mt-2">Additional protections: rate limiting, input validation, automated log sanitization, and regular security audits.</p>
    </div>
  );
});

const ContentPolicy = memo(function ContentPolicy() {
  return (
    <div className="space-y-3 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold">Content Policy</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>

      <div 
        className="p-3"
        style={{ background: '#ffcccc', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}
      >
        <h3 className="font-bold flex items-center gap-2" style={{ color: '#800000' }}>
          <AlertTriangle className="w-4 h-4" />
          Prohibited Content
        </h3>
        <ul className="list-disc list-inside ml-2 mt-2" style={{ color: '#800000' }}>
          <li>CSAM or any content sexualizing minors</li>
          <li>Bestiality</li>
        </ul>
        <p className="mt-2 font-bold" style={{ color: '#800000' }}>Zero tolerance. Permanent ban.</p>
      </div>

      <h3 className="font-bold">Abuse Prevention (Privacy-Preserving)</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Rate limits and cooldowns apply</li>
        <li>Wallet-based authentication only</li>
        <li>Minimal fingerprinting (one-way hash only, auto-deleted after 7 days)</li>
      </ul>

      <h3 className="font-bold">Violations</h3>
      <table className="w-full mt-1" style={{ borderCollapse: 'collapse', fontSize: '10px' }}>
        <tbody>
          <tr>
            <td className="p-1" style={{ border: `1px solid ${WIN95.border.dark}` }}>Prohibited content</td>
            <td className="p-1" style={{ border: `1px solid ${WIN95.border.dark}`, color: '#800000' }}>Permanent ban</td>
          </tr>
          <tr>
            <td className="p-1" style={{ border: `1px solid ${WIN95.border.dark}` }}>Filter bypass</td>
            <td className="p-1" style={{ border: `1px solid ${WIN95.border.dark}` }}>Suspension/ban</td>
          </tr>
          <tr>
            <td className="p-1" style={{ border: `1px solid ${WIN95.border.dark}` }}>System abuse</td>
            <td className="p-1" style={{ border: `1px solid ${WIN95.border.dark}` }}>Rate limit → Suspension</td>
          </tr>
        </tbody>
      </table>

      <h3 className="font-bold">Reporting</h3>
      <p>Report violations through our support channels.</p>
    </div>
  );
});

const RefundPolicy = memo(function RefundPolicy() {
  return (
    <div className="space-y-3 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold">Refund Policy</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>

      <h3 className="font-bold">Credits</h3>
      <p>Non-refundable except for technical failures, duplicate charges, or unauthorized transactions.</p>

      <h3 className="font-bold">Crypto Refunds</h3>
      <p>Issued in original cryptocurrency. Network fees non-refundable. Contact support with tx hash. No refunds for policy violations.</p>
    </div>
  );
});

const TermsModal = memo(function TermsModal({ isOpen, onClose, initialPage = 'terms' }: TermsModalProps) {
  const [activePage, setActivePage] = useState<LegalPage>(initialPage);

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activePage) {
      case 'terms': return <TermsOfService />;
      case 'privacy': return <PrivacyPolicy />;
      case 'content': return <ContentPolicy />;
      case 'refunds': return <RefundPolicy />;
      default: return <TermsOfService />;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-3xl h-[90vh] sm:h-auto sm:max-h-[80vh] flex flex-col win95-window-open"
        style={{ ...PANEL.window, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 0 rgba(0,0,0,0.4)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-2 py-1" style={TITLEBAR.active}>
          <Scale className="w-4 h-4" />
          <span className="text-[11px] font-bold flex-1">Terms & Policies</span>
          <button
            onClick={onClose}
            className="w-5 h-5 sm:w-4 sm:h-4 flex items-center justify-center text-[12px] sm:text-[10px] font-bold"
            style={{ background: WIN95.buttonFace, boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`, color: WIN95.text }}
          >
            ×
          </button>
        </div>

        {/* Mobile tabs */}
        <div className="flex sm:hidden overflow-x-auto" style={{ background: WIN95.bg, borderBottom: `1px solid ${WIN95.bgDark}` }}>
          <button
            onClick={() => setActivePage('terms')}
            className="flex-1 px-2 py-2 text-[10px] font-bold whitespace-nowrap"
            style={{ background: activePage === 'terms' ? WIN95.inputBg : WIN95.bg, color: WIN95.text, borderBottom: activePage === 'terms' ? `2px solid ${WIN95.highlight}` : 'none' }}
          >
            Terms
          </button>
          <button
            onClick={() => setActivePage('privacy')}
            className="flex-1 px-2 py-2 text-[10px] font-bold whitespace-nowrap"
            style={{ background: activePage === 'privacy' ? WIN95.inputBg : WIN95.bg, color: WIN95.text, borderBottom: activePage === 'privacy' ? `2px solid ${WIN95.highlight}` : 'none' }}
          >
            Privacy
          </button>
          <button
            onClick={() => setActivePage('content')}
            className="flex-1 px-2 py-2 text-[10px] font-bold whitespace-nowrap"
            style={{ background: activePage === 'content' ? WIN95.inputBg : WIN95.bg, color: WIN95.text, borderBottom: activePage === 'content' ? `2px solid ${WIN95.highlight}` : 'none' }}
          >
            Content
          </button>
          <button
            onClick={() => setActivePage('refunds')}
            className="flex-1 px-2 py-2 text-[10px] font-bold whitespace-nowrap"
            style={{ background: activePage === 'refunds' ? WIN95.inputBg : WIN95.bg, color: WIN95.text, borderBottom: activePage === 'refunds' ? `2px solid ${WIN95.highlight}` : 'none' }}
          >
            Refunds
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Desktop sidebar - hidden on mobile */}
          <div className="hidden sm:block w-40 flex-shrink-0 overflow-y-auto" style={{ background: WIN95.bg, borderRight: `1px solid ${WIN95.bgDark}` }}>
            <div className="p-1">
              <NavItem icon={<FileText className="w-3 h-3" />} label="Terms" active={activePage === 'terms'} onClick={() => setActivePage('terms')} />
              <NavItem icon={<Shield className="w-3 h-3" />} label="Privacy" active={activePage === 'privacy'} onClick={() => setActivePage('privacy')} />
              <NavItem icon={<AlertTriangle className="w-3 h-3" />} label="Content" active={activePage === 'content'} onClick={() => setActivePage('content')} />
              <NavItem icon={<Scale className="w-3 h-3" />} label="Refunds" active={activePage === 'refunds'} onClick={() => setActivePage('refunds')} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 sm:p-4" style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}` }}>
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
});

export default TermsModal;
export type { LegalPage };
