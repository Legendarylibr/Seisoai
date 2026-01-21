import { memo } from 'react';
import { WIN95 } from '../utils/buttonStyles';

interface FooterProps {
  onOpenTerms: (page?: 'terms' | 'privacy' | 'content' | 'refunds') => void;
}

const Footer = memo(function Footer({ onOpenTerms }: FooterProps) {
  return (
    <div 
      className="flex-shrink-0 flex items-center justify-center gap-2 sm:gap-3 md:gap-4 px-2 py-1 sm:py-1.5 text-[9px] sm:text-[10px] md:text-[11px]"
      style={{
        background: WIN95.bg,
        borderTop: `1px solid ${WIN95.border.light}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      <button
        onClick={() => onOpenTerms('terms')}
        className="hover:underline"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Terms
      </button>
      <span style={{ color: WIN95.bgDark }}>•</span>
      <button
        onClick={() => onOpenTerms('privacy')}
        className="hover:underline"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Privacy
      </button>
      <span style={{ color: WIN95.bgDark }}>•</span>
      <button
        onClick={() => onOpenTerms('content')}
        className="hover:underline"
        style={{ color: WIN95.textDisabled }}
        onMouseEnter={(e) => e.currentTarget.style.color = WIN95.highlight}
        onMouseLeave={(e) => e.currentTarget.style.color = WIN95.textDisabled}
      >
        Content
      </button>
      <span style={{ color: WIN95.bgDark }}>•</span>
      <button
        onClick={() => onOpenTerms('refunds')}
        className="hover:underline"
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

