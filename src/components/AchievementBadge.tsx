/**
 * AchievementBadge Component
 * Displays achievements, badges, and user progress
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, Trophy, Gift, Award, TrendingUp, Users, Flame, Target } from 'lucide-react';
import { BTN, PANEL, WIN95, hoverHandlers, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'generation' | 'social' | 'streak' | 'milestone';
  requirement: number;
  credits: number;
  unlocked: boolean;
  unlockedAt?: string;
}

interface AchievementStats {
  totalAchievements: number;
  totalUnlocked: number;
  totalCreditsEarned: number;
  progress: number;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  achievementCount: number;
  totalGenerations: number;
}

interface AchievementDashboardProps {
  isOpen: boolean;
  onClose: () => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  generation: <Target className="w-4 h-4" />,
  social: <Users className="w-4 h-4" />,
  streak: <Flame className="w-4 h-4" />,
  milestone: <TrendingUp className="w-4 h-4" />
};

const categoryLabels: Record<string, string> = {
  generation: 'Generation',
  social: 'Social',
  streak: 'Streak',
  milestone: 'Milestone'
};

const AchievementDashboard: React.FC<AchievementDashboardProps> = ({ isOpen, onClose }) => {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [stats, setStats] = useState<AchievementStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'generation' | 'social' | 'streak' | 'milestone'>('all');
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Fetch achievements
  const fetchAchievements = useCallback(async () => {
    if (!isAuthenticated) return;
    
    setIsLoading(true);
    try {
      const csrfToken = await ensureCSRFToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };
      
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      
      const token = localStorage.getItem('authToken');
      if (token) headers['Authorization'] = `Bearer ${token}`;
      
      const [achievementsRes, leaderboardRes] = await Promise.all([
        fetch(`${API_URL}/api/achievements`, {
          headers,
          credentials: 'include'
        }),
        fetch(`${API_URL}/api/achievements/leaderboard?limit=10`, {
          credentials: 'include'
        })
      ]);
      
      const achievementsData = await achievementsRes.json();
      const leaderboardData = await leaderboardRes.json();
      
      if (achievementsData.success) {
        setAchievements(achievementsData.achievements || []);
        setStats(achievementsData.stats || null);
      }
      
      if (leaderboardData.success) {
        setLeaderboard(leaderboardData.leaderboard || []);
      }
    } catch (error) {
      logger.error('Failed to fetch achievements', { error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchAchievements();
    }
  }, [isOpen, fetchAchievements]);

  // Filter achievements by category
  const filteredAchievements = activeTab === 'all' 
    ? achievements 
    : achievements.filter(a => a.category === activeTab);

  // Count unlocked by category
  const unlockedByCategory = achievements.reduce((acc, a) => {
    if (a.unlocked) {
      acc[a.category] = (acc[a.category] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={PANEL.window}
      >
        {/* Title Bar */}
        <div 
          className="flex items-center justify-between px-2 py-1"
          style={WINDOW_TITLE_STYLE}
        >
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4" />
            <span className="text-sm font-bold">Achievements</span>
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
        <div className="flex-1 overflow-y-auto p-4" style={{ background: WIN95.bg }}>
          {isLoading ? (
            <div className="text-center py-8">
              <p style={{ color: WIN95.text }}>Loading achievements...</p>
            </div>
          ) : (
            <>
              {/* Stats Overview */}
              {stats && (
                <div className="mb-4 p-3 grid grid-cols-4 gap-2 text-center" style={PANEL.sunken}>
                  <div>
                    <div className="text-xl font-bold" style={{ color: WIN95.highlight }}>
                      {stats.totalUnlocked}
                    </div>
                    <div className="text-[10px]" style={{ color: WIN95.text }}>Unlocked</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: WIN95.textDisabled }}>
                      {stats.totalAchievements}
                    </div>
                    <div className="text-[10px]" style={{ color: WIN95.text }}>Total</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: WIN95.successText }}>
                      {stats.totalCreditsEarned}
                    </div>
                    <div className="text-[10px]" style={{ color: WIN95.text }}>Credits Earned</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: WIN95.highlight }}>
                      {stats.progress}%
                    </div>
                    <div className="text-[10px]" style={{ color: WIN95.text }}>Progress</div>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 mb-4 flex-wrap">
                <button
                  onClick={() => setShowLeaderboard(false)}
                  className="px-3 py-1 text-xs"
                  style={!showLeaderboard ? BTN.active : BTN.base}
                  {...hoverHandlers}
                >
                  <Award className="w-3 h-3 inline mr-1" />
                  Badges
                </button>
                <button
                  onClick={() => setShowLeaderboard(true)}
                  className="px-3 py-1 text-xs"
                  style={showLeaderboard ? BTN.active : BTN.base}
                  {...hoverHandlers}
                >
                  <Trophy className="w-3 h-3 inline mr-1" />
                  Leaderboard
                </button>
              </div>

              {showLeaderboard ? (
                /* Leaderboard */
                <div className="p-3" style={PANEL.sunken}>
                  {leaderboard.length === 0 ? (
                    <p className="text-center text-xs py-4" style={{ color: WIN95.textDisabled }}>
                      No achievers yet. Be the first!
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {leaderboard.map((entry) => (
                        <div 
                          key={entry.rank}
                          className="flex items-center gap-2 py-2 px-2 text-xs"
                          style={{ 
                            background: entry.rank % 2 === 0 ? WIN95.inputBg : 'transparent',
                            color: WIN95.text
                          }}
                        >
                          <span className="w-6 font-bold">
                            {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                          </span>
                          <span className="flex-1 truncate">
                            {`${entry.userId.substring(0, 12)}...`}
                          </span>
                          <span className="font-mono">{entry.achievementCount} badges</span>
                          <span className="font-mono text-[10px]" style={{ opacity: 0.7 }}>
                            {entry.totalGenerations} gens
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Category Filters */}
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {(['all', 'generation', 'social', 'streak', 'milestone'] as const).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setActiveTab(cat)}
                        className="px-2 py-1 text-[10px] flex items-center gap-1"
                        style={activeTab === cat ? BTN.active : BTN.base}
                        {...hoverHandlers}
                      >
                        {cat !== 'all' && categoryIcons[cat]}
                        {cat === 'all' ? 'All' : categoryLabels[cat]}
                        {cat !== 'all' && (
                          <span style={{ opacity: 0.7 }}>
                            ({unlockedByCategory[cat] || 0})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Achievement Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {filteredAchievements.map((achievement) => (
                      <div
                        key={achievement.id}
                        className="p-3 text-center relative"
                        style={{
                          ...PANEL.base,
                          opacity: achievement.unlocked ? 1 : 0.5
                        }}
                      >
                        {/* Icon */}
                        <div className="text-2xl mb-1">{achievement.icon}</div>
                        
                        {/* Name */}
                        <h4 
                          className="text-xs font-bold truncate" 
                          style={{ color: achievement.unlocked ? WIN95.text : WIN95.textDisabled }}
                          title={achievement.name}
                        >
                          {achievement.name}
                        </h4>
                        
                        {/* Description */}
                        <p 
                          className="text-[10px] truncate" 
                          style={{ color: WIN95.textDisabled }}
                          title={achievement.description}
                        >
                          {achievement.description}
                        </p>
                        
                        {/* Credits reward */}
                        <div 
                          className="text-[10px] mt-1"
                          style={{ color: achievement.unlocked ? WIN95.successText : WIN95.textDisabled }}
                        >
                          <Gift className="w-3 h-3 inline mr-0.5" />
                          +{achievement.credits} credits
                        </div>
                        
                        {/* Unlocked badge */}
                        {achievement.unlocked && (
                          <div 
                            className="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full text-[10px]"
                            style={{ background: WIN95.successText, color: '#fff' }}
                          >
                            ✓
                          </div>
                        )}
                        
                        {/* Category badge */}
                        <div 
                          className="absolute bottom-1 left-1 text-[8px] px-1 rounded"
                          style={{ background: WIN95.border.dark, color: WIN95.highlightText }}
                        >
                          {categoryLabels[achievement.category]}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
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

export default AchievementDashboard;
