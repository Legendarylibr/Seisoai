import { memo } from 'react';
import { WIN95 } from '../utils/buttonStyles';

interface FooterProps {
  onOpenTerms: (page?: 'terms' | 'privacy' | 'content' | 'refunds') => void;
}

const Footer = memo(function Footer({ onOpenTerms }: FooterProps) {
  return (
    <div 
      className="flex items-center justify-center gap-2 px-2 py-1 text-[10px]"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: WIN95.bg,
        borderTop: `1px solid ${WIN95.border.light}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        zIndex: 40,
        height: '24px'
      }}
    >
      <button
        onClick={() => onOpenTerms('terms')}
        className="hover:underline min-h-0"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Terms
      </button>
      <span style={{ color: WIN95.bgDark }}>•</span>
      <button
        onClick={() => onOpenTerms('privacy')}
        className="hover:underline min-h-0"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Privacy
      </button>
      <span style={{ color: WIN95.bgDark }}>•</span>
      <button
        onClick={() => onOpenTerms('content')}
        className="hover:underline min-h-0"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Content
      </button>
      <span style={{ color: WIN95.bgDark }}>•</span>
      <button
        onClick={() => onOpenTerms('refunds')}
        className="hover:underline min-h-0"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Refunds
      </button>
    </div>
  );
});

export default Footer;

