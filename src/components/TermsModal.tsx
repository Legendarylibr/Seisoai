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
      
      <p>By using Seiso AI, you agree to these terms. If you disagree, please do not use the service.</p>

      <h3 className="font-bold">Service</h3>
      <p>Seiso AI provides AI-powered image, video, and music generation using FAL.ai endpoints. All features require credits, purchasable via Stripe or cryptocurrency.</p>

      <h3 className="font-bold">Accounts</h3>
      <p>Access via email or crypto wallet. You're responsible for account security. Accounts may be suspended for policy violations.</p>

      <h3 className="font-bold">Credits & Subscriptions</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Credits are non-refundable except for technical failures</li>
        <li>Subscriptions auto-renew until cancelled</li>
        <li>Unused credits may expire at billing cycle end</li>
      </ul>

      <h3 className="font-bold">Content</h3>
      <p>You retain rights to your prompts. Generated content is licensed for personal and commercial use. Similar outputs may be generated for other users.</p>

      <h3 className="font-bold">Prohibited Use</h3>
      <p>See Content Policy. Violations result in account termination without refund.</p>

      <h3 className="font-bold">Disclaimer</h3>
      <p>Service provided "as is" without warranties. We're not liable for indirect damages or AI output quality.</p>

      <h3 className="font-bold">Indemnification</h3>
      <p>You agree to indemnify and hold harmless Seiso AI from any claims, damages, or expenses arising from your use of the service or violation of these terms.</p>

      <h3 className="font-bold">IP & Generated Content</h3>
      <p>AI outputs may unintentionally resemble existing works. You assume responsibility for checking generated content before commercial use. We make no guarantees regarding IP clearance.</p>

      <h3 className="font-bold">Dispute Resolution</h3>
      <p>Disputes shall be resolved through binding arbitration rather than court. You waive rights to participate in class actions. Small claims court remains available.</p>
    </div>
  );
});

const PrivacyPolicy = memo(function PrivacyPolicy() {
  return (
    <div className="space-y-3 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold">Privacy Policy</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>

      <h3 className="font-bold">Data We Collect</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Account info (email or wallet address)</li>
        <li>Prompts and generated content</li>
        <li>Payment records (processed by Stripe)</li>
        <li>IP address and browser info (abuse prevention)</li>
      </ul>

      <h3 className="font-bold">How We Use Data</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Provide and improve the service</li>
        <li>Process payments</li>
        <li>Prevent abuse and enforce policies</li>
      </ul>

      <h3 className="font-bold">Data Sharing</h3>
      <p>We share data with FAL.ai (generation) and Stripe (payments). We don't sell your data.</p>

      <h3 className="font-bold">Data Retention & Deletion</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Account data retained while active</li>
        <li>Generated content stored until you delete it</li>
        <li>Logs retained 90 days for security</li>
        <li>Payment records retained per financial regulations</li>
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

      <h3 className="font-bold">Security</h3>
      <p>HTTPS encryption, secure authentication, rate limiting, and regular audits.</p>
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

      <h3 className="font-bold">Abuse Prevention</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Rate limits and cooldowns apply</li>
        <li>Disposable emails blocked</li>
        <li>Multi-account abuse detected via fingerprinting</li>
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
      <p>Non-refundable except for:</p>
      <ul className="list-disc list-inside ml-2">
        <li>Technical failures (generation failed but credits deducted)</li>
        <li>Duplicate charges</li>
        <li>Unauthorized transactions</li>
      </ul>

      <h3 className="font-bold">Subscriptions</h3>
      <ul className="list-disc list-inside ml-2">
        <li>Cancel anytime; service continues until period end</li>
        <li>No partial refunds</li>
        <li>Unused credits expire at cycle end</li>
      </ul>

      <h3 className="font-bold">Crypto Payments</h3>
      <p>Refunds issued in original cryptocurrency. Network fees non-refundable.</p>

      <h3 className="font-bold">Request Refund</h3>
      <p>Contact support with transaction ID and reason. Processed within 5-7 days.</p>

      <h3 className="font-bold">Termination</h3>
      <p>No refunds for accounts terminated due to policy violations.</p>
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
