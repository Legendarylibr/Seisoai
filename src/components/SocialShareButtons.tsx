/**
 * SocialShareButtons Component
 * Reusable social sharing buttons with share-to-earn tracking
 */
import React, { useState } from 'react';
import { Share2, Twitter, ExternalLink, Copy, Check, Gift } from 'lucide-react';
import { BTN, WIN95, hoverHandlers } from '../utils/buttonStyles';
import { 
  trackSocialShare, 
  getReferralCode, 
  copyToClipboard,
  generateShareUrls 
} from '../services/referralService';
import logger from '../utils/logger';

interface SocialShareButtonsProps {
  content: {
    imageUrl?: string;
    videoUrl?: string;
    prompt?: string;
    id?: string;
  };
  onCreditsEarned?: (credits: number) => void;
  compact?: boolean;
}

type Platform = 'twitter' | 'facebook' | 'linkedin' | 'reddit' | 'discord';

const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  twitter: <Twitter className="w-3 h-3" />,
  facebook: <span className="text-xs font-bold">f</span>,
  linkedin: <span className="text-xs font-bold">in</span>,
  reddit: <span className="text-xs font-bold">r/</span>,
  discord: <span className="text-xs font-bold">D</span>
};

const PLATFORM_LABELS: Record<Platform, string> = {
  twitter: 'Twitter',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  reddit: 'Reddit',
  discord: 'Discord'
};

const SocialShareButtons: React.FC<SocialShareButtonsProps> = ({ 
  content, 
  onCreditsEarned,
  compact = false 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState<Platform | null>(null);
  const [earnedMessage, setEarnedMessage] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);

  // Get referral code on first open
  const handleOpen = async () => {
    setIsOpen(!isOpen);
  };

  // Generate content ID for tracking
  const getContentId = (): string => {
    if (content.id) return content.id;
    // Generate a hash from the URL
    const url = content.imageUrl || content.videoUrl || '';
    return url.split('/').pop()?.split('?')[0] || Date.now().toString();
  };

  // Handle share to platform
  const handleShare = async (platform: Platform) => {
    setSharing(platform);
    
    try {
      const shareUrls = generateShareUrls(content, referralCode || undefined);
      const contentId = getContentId();
      
      if (platform === 'discord') {
        // For Discord, just copy the share URL
        const success = await copyToClipboard(shareUrls.discord);
        if (success) {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      } else {
        // Open share URL in new window
        window.open(shareUrls[platform], '_blank', 'width=600,height=400');
      }
    } catch (error) {
      logger.error('Share failed', { error: (error as Error).message });
    } finally {
      setSharing(null);
    }
  };

  // Copy share link
  const handleCopyLink = async () => {
    const shareUrls = generateShareUrls(content, referralCode || undefined);
    const success = await copyToClipboard(shareUrls.discord);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (compact) {
    // Compact mode - just a share button that opens dropdown
    return (
      <div className="relative inline-block">
        <button
          onClick={handleOpen}
          className="px-2 py-1 flex items-center gap-1 text-xs"
          style={BTN.base}
          {...hoverHandlers}
          title="Share"
        >
          <Share2 className="w-3 h-3" />
        </button>
        
        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40" 
              onClick={() => setIsOpen(false)}
            />
            
            {/* Dropdown */}
            <div 
              className="absolute right-0 mt-1 z-50 p-2 min-w-[140px]"
              style={{ 
                background: WIN95.bg,
                boxShadow: '2px 2px 0 rgba(0,0,0,0.5)',
                border: `1px solid ${WIN95.border.dark}`
              }}
            >
              {/* Credits earned message */}
              {earnedMessage && (
                <div 
                  className="mb-2 p-1 text-xs text-center flex items-center justify-center gap-1"
                  style={{ background: WIN95.highlight, color: WIN95.highlightText }}
                >
                  <Gift className="w-3 h-3" />
                  {earnedMessage}
                </div>
              )}
              
              {/* Share buttons */}
              <div className="space-y-1">
                {(['twitter', 'facebook', 'reddit', 'linkedin'] as Platform[]).map((platform) => (
                  <button
                    key={platform}
                    onClick={() => handleShare(platform)}
                    disabled={sharing === platform}
                    className="w-full px-2 py-1 flex items-center gap-2 text-xs"
                    style={sharing === platform ? BTN.disabled : BTN.base}
                    {...(sharing !== platform ? hoverHandlers : {})}
                  >
                    {PLATFORM_ICONS[platform]}
                    {PLATFORM_LABELS[platform]}
                    <ExternalLink className="w-2 h-2 ml-auto opacity-50" />
                  </button>
                ))}
                
                {/* Copy link */}
                <button
                  onClick={handleCopyLink}
                  className="w-full px-2 py-1 flex items-center gap-2 text-xs"
                  style={BTN.base}
                  {...hoverHandlers}
                >
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // Full mode - horizontal button row
  return (
    <div className="flex flex-col gap-2">
      {/* Credits earned message */}
      {earnedMessage && (
        <div 
          className="p-2 text-xs text-center flex items-center justify-center gap-1"
          style={{ background: WIN95.highlight, color: WIN95.highlightText }}
        >
          <Gift className="w-3 h-3" />
          {earnedMessage}
        </div>
      )}
      
      <div className="flex flex-wrap gap-1">
        <span className="flex items-center gap-1 text-xs mr-1" style={{ color: WIN95.text }}>
          <Share2 className="w-3 h-3" />
          Share:
        </span>
        
        {(['twitter', 'facebook', 'reddit', 'linkedin'] as Platform[]).map((platform) => (
          <button
            key={platform}
            onClick={() => handleShare(platform)}
            disabled={sharing === platform}
            className="px-2 py-1 flex items-center gap-1 text-xs"
            style={sharing === platform ? BTN.disabled : BTN.base}
            {...(sharing !== platform ? hoverHandlers : {})}
            title={PLATFORM_LABELS[platform]}
          >
            {PLATFORM_ICONS[platform]}
          </button>
        ))}
        
        <button
          onClick={handleCopyLink}
          className="px-2 py-1 flex items-center gap-1 text-xs"
          style={BTN.base}
          {...hoverHandlers}
          title="Copy Link"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        </button>
      </div>
    </div>
  );
};

export default SocialShareButtons;
