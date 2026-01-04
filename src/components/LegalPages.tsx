import React, { useState, memo } from 'react';
import { X, FileText, Shield, AlertTriangle, Scale, ChevronRight } from 'lucide-react';
import { WIN95, BTN, PANEL, TITLEBAR } from '../utils/buttonStyles';

type LegalPage = 'terms' | 'privacy' | 'content' | 'refunds' | null;

interface LegalPagesProps {
  isOpen: boolean;
  onClose: () => void;
  initialPage?: LegalPage;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem = memo(function NavItem({ icon, label, active, onClick }: NavItemProps) {
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
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = WIN95.bgDark;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
        }
      }}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {active && <ChevronRight className="w-3 h-3" />}
    </button>
  );
});

const TermsOfService = memo(function TermsOfService() {
  return (
    <div className="space-y-4 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold mb-4">Terms of Service</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>
      
      <section className="space-y-2">
        <h3 className="font-bold">1. Acceptance of Terms</h3>
        <p>By accessing and using Seiso AI ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">2. Description of Service</h3>
        <p>Seiso AI provides AI-powered content generation services including:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Image generation using FAL.ai endpoints</li>
          <li>Video generation using FAL.ai endpoints</li>
          <li>Music generation using FAL.ai endpoints</li>
          <li>Content gallery and storage</li>
        </ul>
        <p className="mt-2">All generation services are powered by compliant FAL.ai API endpoints.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">3. User Accounts</h3>
        <p>You may access the Service through:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Email authentication</li>
          <li>Cryptocurrency wallet connection (Ethereum, Solana)</li>
        </ul>
        <p className="mt-2">You are responsible for maintaining the security of your account credentials and wallet private keys.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">4. Credits and Payments</h3>
        <p>The Service operates on a credit-based system:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Credits can be purchased via Stripe (credit card) or cryptocurrency</li>
          <li>Different content types consume different amounts of credits</li>
          <li>Free credits may be offered for new users subject to limitations</li>
          <li>Purchased credits are non-refundable except as required by law</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">5. Subscription Plans</h3>
        <p>Monthly subscription plans provide recurring credit allocations:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Subscriptions auto-renew unless cancelled</li>
          <li>You may cancel at any time; service continues until the end of the billing period</li>
          <li>Unused subscription credits may expire at the end of each billing cycle</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">6. User Conduct</h3>
        <p>You agree not to:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Violate our Content Policy (see Content Policy section)</li>
          <li>Attempt to circumvent rate limits or abuse prevention systems</li>
          <li>Use automated tools or bots to access the Service without authorization</li>
          <li>Share account access with unauthorized users</li>
          <li>Reverse engineer or attempt to extract the source code of the Service</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">7. Content Ownership</h3>
        <p><strong>Your Content:</strong> You retain ownership of prompts you submit and concepts you create.</p>
        <p><strong>Generated Content:</strong> Images, videos, and music generated through the Service are provided for your use. You receive a license to use generated content for personal and commercial purposes, subject to the terms of the underlying AI models.</p>
        <p><strong>No Guarantees:</strong> AI-generated content may not be unique and similar outputs may be generated for other users with similar prompts.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">8. Intellectual Property</h3>
        <p>The Service, including its design, features, and technology, is owned by Seiso AI. The Windows 95-inspired visual design is a creative work and does not imply any affiliation with Microsoft Corporation.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">9. Third-Party Services</h3>
        <p>The Service integrates with:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li><strong>FAL.ai:</strong> AI model hosting and inference</li>
          <li><strong>Stripe:</strong> Payment processing</li>
          <li><strong>Ethereum/Solana:</strong> Cryptocurrency payments</li>
        </ul>
        <p className="mt-2">Your use of these integrations is subject to their respective terms of service.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">10. Disclaimer of Warranties</h3>
        <p>THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. WE DO NOT GUARANTEE:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Continuous, uninterrupted access to the Service</li>
          <li>Accuracy or quality of AI-generated content</li>
          <li>That generated content will meet your specific requirements</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">11. Limitation of Liability</h3>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, SEISO AI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFITS, DATA, OR OTHER INTANGIBLE LOSSES.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">12. Termination</h3>
        <p>We may suspend or terminate your access to the Service at our discretion for violations of these Terms or our Content Policy. Upon termination:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Your access to the Service will be revoked</li>
          <li>Unused credits may be forfeited</li>
          <li>Generated content stored in the gallery may be deleted</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">13. Changes to Terms</h3>
        <p>We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">14. Contact</h3>
        <p>For questions about these Terms, please contact us at legal@seiso.ai</p>
      </section>
    </div>
  );
});

const PrivacyPolicy = memo(function PrivacyPolicy() {
  return (
    <div className="space-y-4 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold mb-4">Privacy Policy</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>
      
      <section className="space-y-2">
        <h3 className="font-bold">1. Introduction</h3>
        <p>This Privacy Policy explains how Seiso AI ("we", "us", "our") collects, uses, and protects your personal information when you use our Service.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">2. Information We Collect</h3>
        
        <h4 className="font-bold mt-3">2.1 Account Information</h4>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li><strong>Email Users:</strong> Email address, account creation date</li>
          <li><strong>Wallet Users:</strong> Public wallet address (Ethereum/Solana)</li>
        </ul>

        <h4 className="font-bold mt-3">2.2 Usage Information</h4>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Prompts submitted for content generation</li>
          <li>Generated content (images, videos, music)</li>
          <li>Credit balance and transaction history</li>
          <li>Feature usage and preferences</li>
        </ul>

        <h4 className="font-bold mt-3">2.3 Technical Information</h4>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>IP address (for abuse prevention)</li>
          <li>Browser type and version</li>
          <li>Device information</li>
          <li>Browser fingerprint (hashed, for fraud prevention)</li>
        </ul>

        <h4 className="font-bold mt-3">2.4 Payment Information</h4>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Stripe processes credit card payments; we do not store full card details</li>
          <li>Cryptocurrency transactions are recorded on public blockchains</li>
          <li>Transaction IDs and amounts for record-keeping</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">3. How We Use Your Information</h3>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>To provide and improve the Service</li>
          <li>To process payments and manage your account</li>
          <li>To prevent abuse and enforce our Terms of Service</li>
          <li>To communicate service updates and announcements</li>
          <li>To comply with legal obligations</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">4. Content Generation and AI Processing</h3>
        <p>When you submit prompts:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Prompts are sent to FAL.ai for processing</li>
          <li>We may retain prompts and generated content for service improvement</li>
          <li>Safety checks are performed to filter prohibited content</li>
          <li>Violation attempts are logged for security purposes</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">5. Data Sharing</h3>
        <p>We share your information with:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li><strong>FAL.ai:</strong> AI inference provider (prompts and parameters)</li>
          <li><strong>Stripe:</strong> Payment processor (payment details)</li>
          <li><strong>Blockchain Networks:</strong> Cryptocurrency transactions (public by nature)</li>
          <li><strong>Legal Authorities:</strong> When required by law or to protect rights</li>
        </ul>
        <p className="mt-2">We do not sell your personal information to third parties.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">6. Data Retention</h3>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Account data is retained while your account is active</li>
          <li>Generated content is stored until you delete it or close your account</li>
          <li>Usage logs are retained for 90 days for security purposes</li>
          <li>Payment records are retained as required by financial regulations</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">7. Your Rights</h3>
        <p>Depending on your jurisdiction, you may have the right to:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Delete your data ("right to be forgotten")</li>
          <li>Export your data in a portable format</li>
          <li>Opt-out of certain data processing</li>
        </ul>
        <p className="mt-2">To exercise these rights, contact us at privacy@seiso.ai</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">8. Cookies and Tracking</h3>
        <p>We use:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li><strong>Essential Cookies:</strong> Authentication tokens, session management</li>
          <li><strong>Local Storage:</strong> User preferences, cached data</li>
          <li><strong>Browser Fingerprinting:</strong> Fraud prevention (hashed, not personally identifying)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">9. Security</h3>
        <p>We implement security measures including:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>HTTPS encryption for all data transmission</li>
          <li>Secure authentication systems</li>
          <li>Rate limiting and abuse prevention</li>
          <li>Regular security audits</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">10. International Data Transfers</h3>
        <p>Your data may be processed in countries outside your jurisdiction. We ensure appropriate safeguards are in place for international transfers.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">11. Children's Privacy</h3>
        <p>The Service is not intended for users under 18 years of age. We do not knowingly collect data from minors.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">12. Changes to This Policy</h3>
        <p>We may update this Privacy Policy periodically. We will notify users of significant changes via the Service or email.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">13. Contact Us</h3>
        <p>For privacy inquiries: privacy@seiso.ai</p>
        <p>For data requests: dpo@seiso.ai</p>
      </section>
    </div>
  );
});

const ContentPolicy = memo(function ContentPolicy() {
  return (
    <div className="space-y-4 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold mb-4">Content Policy & Acceptable Use</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>
      
      <section className="space-y-2">
        <h3 className="font-bold">1. Overview</h3>
        <p>This Content Policy outlines what content is and is not permitted on Seiso AI. We operate with a focus on preventing the most harmful content while allowing creative freedom for adult users.</p>
      </section>

      <section className="space-y-2">
        <div 
          className="p-3"
          style={{
            background: '#ffcccc',
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
          }}
        >
          <h3 className="font-bold flex items-center gap-2" style={{ color: '#800000' }}>
            <AlertTriangle className="w-4 h-4" />
            ZERO TOLERANCE CONTENT
          </h3>
          <p className="mt-2" style={{ color: '#800000' }}>The following content is STRICTLY PROHIBITED with no exceptions:</p>
          <ul className="list-disc list-inside ml-2 space-y-1 mt-2" style={{ color: '#800000' }}>
            <li><strong>CSAM (Child Sexual Abuse Material):</strong> Any sexual content involving minors, including AI-generated imagery depicting minors in sexual situations</li>
            <li><strong>Age-related inappropriate content:</strong> Content combining age indicators (child, teen, minor, young, etc.) with sexual themes</li>
            <li><strong>Bestiality:</strong> Sexual content involving animals</li>
          </ul>
          <p className="mt-2 font-bold" style={{ color: '#800000' }}>Violations will result in immediate permanent ban and may be reported to authorities.</p>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">2. Content Filtering System</h3>
        <p>We employ multiple layers of content filtering:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li><strong>Keyword Detection:</strong> Automated blocking of prohibited terms</li>
          <li><strong>Pattern Analysis:</strong> Detection of suspicious term combinations</li>
          <li><strong>Style Validation:</strong> Safety checks on visual styles</li>
          <li><strong>Reference Image Screening:</strong> Analysis of uploaded reference images</li>
          <li><strong>FAL.ai Safety:</strong> Additional safety filters at the AI model level</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">3. Adult Content (Permitted with Restrictions)</h3>
        <p>Seiso AI allows adult content generation for users 18+. Permitted adult content includes:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Explicit sexual content involving clearly adult subjects</li>
          <li>Nudity and erotic art</li>
          <li>Fetish and fantasy content (within legal boundaries)</li>
        </ul>
        <p className="mt-2"><strong>You are responsible</strong> for complying with local laws regarding adult content in your jurisdiction.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">4. Violation Consequences</h3>
        <table className="w-full mt-2" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: WIN95.bgDark }}>
              <th className="p-2 text-left" style={{ border: `1px solid ${WIN95.border.darker}`, color: WIN95.highlightText }}>Violation Type</th>
              <th className="p-2 text-left" style={{ border: `1px solid ${WIN95.border.darker}`, color: WIN95.highlightText }}>Consequence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}` }}>CSAM / Minor-related</td>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}`, color: '#800000', fontWeight: 'bold' }}>Permanent ban + Law enforcement report</td>
            </tr>
            <tr style={{ background: WIN95.bgLight }}>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}` }}>Bestiality</td>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}`, color: '#800000', fontWeight: 'bold' }}>Permanent ban</td>
            </tr>
            <tr>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}` }}>Repeated filter bypass attempts</td>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}` }}>Account suspension/ban</td>
            </tr>
            <tr style={{ background: WIN95.bgLight }}>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}` }}>System abuse/botting</td>
              <td className="p-2" style={{ border: `1px solid ${WIN95.border.dark}` }}>Rate limiting → Suspension</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">5. Rate Limiting & Abuse Prevention</h3>
        <p>To ensure fair usage and prevent abuse:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>API rate limits apply to all users</li>
          <li>Free tier has additional restrictions (IP-based tracking, cooldowns)</li>
          <li>Disposable email addresses are blocked</li>
          <li>Browser fingerprinting is used to prevent multi-account abuse</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">6. Reporting Content</h3>
        <p>If you encounter content that violates this policy:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Use the in-app report feature</li>
          <li>Email: safety@seiso.ai</li>
          <li>For urgent CSAM reports: Immediately contact NCMEC (CyberTipline) or local authorities</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">7. Appeals</h3>
        <p>If you believe your account was incorrectly suspended:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Email appeals@seiso.ai with your account details</li>
          <li>Appeals are reviewed within 48 hours</li>
          <li>CSAM-related bans are not eligible for appeal</li>
        </ul>
      </section>
    </div>
  );
});

const RefundPolicy = memo(function RefundPolicy() {
  return (
    <div className="space-y-4 text-[11px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <h2 className="text-sm font-bold mb-4">Refund Policy</h2>
      <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Last Updated: January 2026</p>
      
      <section className="space-y-2">
        <h3 className="font-bold">1. Credit Purchases</h3>
        <p>Credits purchased through Stripe or cryptocurrency are generally <strong>non-refundable</strong> as they are digital goods that can be consumed immediately.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">2. Exceptions</h3>
        <p>Refunds may be granted in the following circumstances:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li><strong>Technical Failures:</strong> If credits were deducted but the generation failed due to system errors</li>
          <li><strong>Duplicate Charges:</strong> If you were charged multiple times for the same purchase</li>
          <li><strong>Unauthorized Transactions:</strong> If a purchase was made without your authorization</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">3. Subscription Cancellations</h3>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>You may cancel your subscription at any time</li>
          <li>No prorated refunds for partial months</li>
          <li>Service continues until the end of the current billing period</li>
          <li>Unused subscription credits expire at the end of each billing cycle</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">4. How to Request a Refund</h3>
        <p>To request a refund, email billing@seiso.ai with:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Your account email or wallet address</li>
          <li>Transaction ID or receipt</li>
          <li>Reason for refund request</li>
          <li>Any relevant screenshots or error messages</li>
        </ul>
        <p className="mt-2">Refund requests are processed within 5-7 business days.</p>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">5. Cryptocurrency Payments</h3>
        <p>Due to the nature of blockchain transactions:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>Cryptocurrency refunds will be issued in the original cryptocurrency</li>
          <li>Exchange rate fluctuations are not grounds for additional refunds</li>
          <li>Network fees are non-refundable</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">6. Account Termination</h3>
        <p>If your account is terminated for Terms of Service violations:</p>
        <ul className="list-disc list-inside ml-2 space-y-1">
          <li>No refund will be issued for unused credits</li>
          <li>No refund will be issued for remaining subscription time</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-bold">7. Contact</h3>
        <p>For billing questions: billing@seiso.ai</p>
      </section>
    </div>
  );
});

const LegalPages = memo(function LegalPages({ isOpen, onClose, initialPage = 'terms' }: LegalPagesProps) {
  const [activePage, setActivePage] = useState<LegalPage>(initialPage);

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activePage) {
      case 'terms':
        return <TermsOfService />;
      case 'privacy':
        return <PrivacyPolicy />;
      case 'content':
        return <ContentPolicy />;
      case 'refunds':
        return <RefundPolicy />;
      default:
        return <TermsOfService />;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl max-h-[85vh] flex flex-col win95-window-open"
        style={{
          ...PANEL.window,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 0 rgba(0,0,0,0.4)`
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div 
          className="flex items-center gap-2 px-2 py-1"
          style={TITLEBAR.active}
        >
          <Scale className="w-4 h-4" />
          <span className="text-[11px] font-bold flex-1">Legal Information - Seiso AI</span>
          <button
            onClick={onClose}
            className="w-4 h-4 flex items-center justify-center text-[10px] font-bold"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              color: WIN95.text
            }}
          >
            ×
          </button>
        </div>

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar navigation */}
          <div 
            className="w-48 flex-shrink-0 overflow-y-auto"
            style={{
              background: WIN95.bg,
              borderRight: `1px solid ${WIN95.bgDark}`
            }}
          >
            <div className="p-2">
              <NavItem
                icon={<FileText className="w-4 h-4" />}
                label="Terms of Service"
                active={activePage === 'terms'}
                onClick={() => setActivePage('terms')}
              />
              <NavItem
                icon={<Shield className="w-4 h-4" />}
                label="Privacy Policy"
                active={activePage === 'privacy'}
                onClick={() => setActivePage('privacy')}
              />
              <NavItem
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Content Policy"
                active={activePage === 'content'}
                onClick={() => setActivePage('content')}
              />
              <NavItem
                icon={<Scale className="w-4 h-4" />}
                label="Refund Policy"
                active={activePage === 'refunds'}
                onClick={() => setActivePage('refunds')}
              />
            </div>
          </div>

          {/* Main content */}
          <div 
            className="flex-1 overflow-y-auto p-4"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
            }}
          >
            {renderContent()}
          </div>
        </div>

        {/* Status bar */}
        <div 
          className="flex items-center px-2 py-1"
          style={{
            background: WIN95.bg,
            borderTop: `1px solid ${WIN95.border.light}`
          }}
        >
          <div 
            className="flex-1 text-[10px] px-2"
            style={{
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              color: WIN95.textDisabled,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            All services powered by compliant FAL.ai endpoints
          </div>
        </div>
      </div>
    </div>
  );
});

export default LegalPages;
export type { LegalPage };


