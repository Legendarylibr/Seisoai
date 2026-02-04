/**
 * ReferralDashboard Component
 * Displays referral code, share links, stats, and leaderboard
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Users, Gift, Trophy, ExternalLink } from 'lucide-react';
import { BTN, PANEL, WIN95, hoverHandlers, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import {
  getReferralStats,
  getReferralLeaderboard,
  copyToClipboard,
  type ReferralStats,
  type LeaderboardEntry
} from '../services/referralService';
import logger from '../utils/logger';

interface ReferralDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const ReferralDashboard: React.FC<ReferralDashboardProps> = ({ isOpen, onClose }) => {
  const { isAuthenticated } = useEmailAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'stats' | 'leaderboard'>('stats');

  // Fetch data on mount
  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    try {
      const [statsData, leaderboardData] = await Promise.all([
        getReferralStats(),
        getReferralLeaderboard(10)
      ]);
      
      if (statsData) setStats(statsData);
      setLeaderboard(leaderboardData);
    } catch (error) {
      logger.error('Failed to fetch referral data', { error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isOpen && isAuthenticated) {
      fetchData();
    }
  }, [isOpen, isAuthenticated, fetchData]);

  // Handle copy to clipboard
  const handleCopy = async (text: string, type: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  // Share to social platforms
  const handleShare = (platform: string) => {
    if (!stats) return;
    
    const shareUrl = stats.referral.shareUrl;
    const text = encodeURIComponent('Join me on SeisoAI! Create amazing AI images, videos, and music.');
    const encodedUrl = encodeURIComponent(shareUrl);
    
    let url = '';
    switch (platform) {
      case 'twitter':
        url = `https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case 'linkedin':
        url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
        break;
      case 'reddit':
        url = `https://www.reddit.com/submit?url=${encodedUrl}&title=${text}`;
        break;
    }
    
    if (url) {
      window.open(url, '_blank', 'width=600,height=400');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        style={PANEL.window}
      >
        {/* Title Bar */}
        <div 
          className="flex items-center justify-between px-2 py-1"
          style={WINDOW_TITLE_STYLE}
        >
          <div className="flex items-center gap-2">
            <Gift className="w-4 h-4" />
            <span className="text-sm font-bold">Referral Program</span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 flex items-center justify-center text-xs"
            style={BTN.small}
            {...hoverHandlers}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1" style={{ background: WIN95.bg }}>
          {!isAuthenticated ? (
            <div className="text-center py-8">
              <p style={{ color: WIN95.text }}>Please sign in to access the referral program.</p>
            </div>
          ) : isLoading ? (
            <div className="text-center py-8">
              <p style={{ color: WIN95.text }}>Loading...</p>
            </div>
          ) : stats ? (
            <>
              {/* Referral Link Section */}
              <div className="mb-4 p-3" style={PANEL.sunken}>
                <h3 className="text-sm font-bold mb-2" style={{ color: WIN95.text }}>
                  Your Referral Link
                </h3>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={stats.referral.shareUrl}
                    className="flex-1 px-3 py-2 text-sm font-mono"
                    style={{
                      background: WIN95.inputBg,
                      color: WIN95.highlight,
                      border: `1px solid ${WIN95.border.dark}`
                    }}
                  />
                  <button
                    onClick={() => handleCopy(stats.referral.shareUrl, 'url')}
                    className="px-3 py-2 flex items-center gap-1 text-xs"
                    style={BTN.base}
                    {...hoverHandlers}
                  >
                    {copied === 'url' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied === 'url' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Rewards Info */}
              <div className="mb-4 p-3 grid grid-cols-2 gap-3" style={PANEL.base}>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: WIN95.highlight }}>+5</div>
                  <div className="text-xs" style={{ color: WIN95.text }}>Credits for you</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold" style={{ color: WIN95.successText }}>10</div>
                  <div className="text-xs" style={{ color: WIN95.text }}>Credits for friend</div>
                </div>
              </div>

              {/* Share Buttons */}
              <div className="mb-4">
                <h3 className="text-sm font-bold mb-2" style={{ color: WIN95.text }}>
                  Share & Earn
                </h3>
                <div className="flex flex-wrap gap-2">
                  {['twitter', 'facebook', 'linkedin', 'reddit'].map((platform) => (
                    <button
                      key={platform}
                      onClick={() => handleShare(platform)}
                      className="px-3 py-1.5 text-xs flex items-center gap-1 capitalize"
                      style={BTN.base}
                      {...hoverHandlers}
                    >
                      <ExternalLink className="w-3 h-3" />
                      {platform}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-2">
                <button
                  onClick={() => setActiveTab('stats')}
                  className="px-3 py-1 text-xs"
                  style={activeTab === 'stats' ? BTN.active : BTN.base}
                  {...hoverHandlers}
                >
                  <Users className="w-3 h-3 inline mr-1" />
                  Your Stats
                </button>
                <button
                  onClick={() => setActiveTab('leaderboard')}
                  className="px-3 py-1 text-xs"
                  style={activeTab === 'leaderboard' ? BTN.active : BTN.base}
                  {...hoverHandlers}
                >
                  <Trophy className="w-3 h-3 inline mr-1" />
                  Leaderboard
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-3" style={PANEL.sunken}>
                {activeTab === 'stats' ? (
                  <div>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="text-center p-2" style={PANEL.base}>
                        <div className="text-xl font-bold" style={{ color: WIN95.highlight }}>
                          {stats.referral.count}
                        </div>
                        <div className="text-xs" style={{ color: WIN95.text }}>
                          Referrals
                        </div>
                      </div>
                      <div className="text-center p-2" style={PANEL.base}>
                        <div className="text-xl font-bold" style={{ color: WIN95.successText }}>
                          {stats.referral.creditsEarned}
                        </div>
                        <div className="text-xs" style={{ color: WIN95.text }}>
                          Credits Earned
                        </div>
                      </div>
                    </div>

                    {/* Share Stats */}
                    <div className="mb-4">
                      <h4 className="text-xs font-bold mb-1" style={{ color: WIN95.text }}>
                        Weekly Share Rewards
                      </h4>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded" style={{ background: WIN95.border.dark }}>
                          <div 
                            className="h-full rounded"
                            style={{ 
                              width: `${(stats.sharing.weeklyShareCredits / stats.sharing.weeklyShareLimit) * 100}%`,
                              background: WIN95.highlight
                            }}
                          />
                        </div>
                        <span className="text-xs" style={{ color: WIN95.text }}>
                          {stats.sharing.weeklyShareCredits}/{stats.sharing.weeklyShareLimit}
                        </span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: WIN95.textDisabled }}>
                        Earn 1 credit per share (max 5/week)
                      </p>
                    </div>

                    {/* Recent Referrals */}
                    {stats.referral.recentReferrals.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold mb-1" style={{ color: WIN95.text }}>
                          Recent Referrals
                        </h4>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {stats.referral.recentReferrals.map((ref, i) => (
                            <div 
                              key={i} 
                              className="flex justify-between text-xs py-1 px-2"
                              style={{ background: i % 2 === 0 ? WIN95.inputBg : 'transparent' }}
                            >
                              <span style={{ color: WIN95.text }}>
                                {ref.refereeId.substring(0, 12)}...
                              </span>
                              <span style={{ color: WIN95.successText }}>
                                +{ref.creditsAwarded} credits
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {leaderboard.length === 0 ? (
                      <p className="text-center text-xs py-4" style={{ color: WIN95.textDisabled }}>
                        No referrals yet. Be the first!
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {leaderboard.map((entry) => (
                          <div 
                            key={entry.rank}
                            className="flex items-center gap-2 py-1 px-2 text-xs"
                            style={{ 
                              background: entry.isCurrentUser ? WIN95.highlight : 
                                         entry.rank % 2 === 0 ? WIN95.inputBg : 'transparent',
                              color: entry.isCurrentUser ? WIN95.highlightText : WIN95.text
                            }}
                          >
                            <span className="w-6 font-bold">#{entry.rank}</span>
                            <span className="flex-1 truncate">
                              {entry.isCurrentUser ? 'You' : `Player #${entry.rank}`}
                            </span>
                            <span className="font-mono">{entry.referralCount} refs</span>
                            <span className="font-mono" style={{ color: entry.isCurrentUser ? 'inherit' : WIN95.successText }}>
                              {entry.creditsEarned}c
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8">
              <p style={{ color: WIN95.errorText }}>Failed to load referral data.</p>
              <button
                onClick={fetchData}
                className="mt-2 px-4 py-1 text-xs"
                style={BTN.base}
                {...hoverHandlers}
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 flex justify-end" style={{ background: WIN95.bg, borderTop: `1px solid ${WIN95.border.dark}` }}>
          <button
            onClick={onClose}
            className="px-4 py-1 text-xs"
            style={BTN.base}
            {...hoverHandlers}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferralDashboard;
