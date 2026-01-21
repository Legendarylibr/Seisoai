/**
 * Achievement Service
 * Handles achievement unlocking, tracking, and leaderboards
 */
import mongoose from 'mongoose';
import logger from '../utils/logger';
import type { IUser } from '../models/User';

// Achievement Definitions
export interface AchievementDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: 'generation' | 'social' | 'milestone' | 'streak';
  requirement: number;
  credits: number;  // Credits awarded when unlocked
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Generation milestones
  { id: 'first_gen', name: 'First Creation', description: 'Generate your first image', icon: '🎨', category: 'generation', requirement: 1, credits: 2 },
  { id: 'gen_10', name: 'Getting Started', description: 'Generate 10 creations', icon: '🌱', category: 'generation', requirement: 10, credits: 3 },
  { id: 'gen_50', name: 'Content Creator', description: 'Generate 50 creations', icon: '🎯', category: 'generation', requirement: 50, credits: 5 },
  { id: 'gen_100', name: 'Prolific Artist', description: 'Generate 100 creations', icon: '⭐', category: 'generation', requirement: 100, credits: 10 },
  { id: 'gen_500', name: 'Master Creator', description: 'Generate 500 creations', icon: '🏆', category: 'generation', requirement: 500, credits: 25 },
  { id: 'gen_1000', name: 'Legendary Artist', description: 'Generate 1000 creations', icon: '👑', category: 'generation', requirement: 1000, credits: 50 },
  
  // Social achievements
  { id: 'first_ref', name: 'Friend Finder', description: 'Refer your first friend', icon: '👥', category: 'social', requirement: 1, credits: 2 },
  { id: 'ref_5', name: 'Social Butterfly', description: 'Refer 5 friends', icon: '🦋', category: 'social', requirement: 5, credits: 5 },
  { id: 'ref_10', name: 'Influencer', description: 'Refer 10 friends', icon: '📣', category: 'social', requirement: 10, credits: 10 },
  { id: 'ref_25', name: 'Ambassador', description: 'Refer 25 friends', icon: '🎖️', category: 'social', requirement: 25, credits: 25 },
  { id: 'ref_50', name: 'Community Leader', description: 'Refer 50 friends', icon: '🌟', category: 'social', requirement: 50, credits: 50 },
  
  // Streak achievements
  { id: 'streak_7', name: 'Week Warrior', description: 'Login 7 days in a row', icon: '🔥', category: 'streak', requirement: 7, credits: 5 },
  { id: 'streak_30', name: 'Monthly Master', description: 'Login 30 days in a row', icon: '💪', category: 'streak', requirement: 30, credits: 20 },
  { id: 'streak_100', name: 'Centurion', description: 'Login 100 days in a row', icon: '💎', category: 'streak', requirement: 100, credits: 50 },
  
  // Milestone achievements
  { id: 'spend_100', name: 'Supporter', description: 'Spend 100 credits', icon: '💰', category: 'milestone', requirement: 100, credits: 5 },
  { id: 'spend_500', name: 'Power User', description: 'Spend 500 credits', icon: '💵', category: 'milestone', requirement: 500, credits: 15 },
  { id: 'spend_1000', name: 'VIP Creator', description: 'Spend 1000 credits', icon: '💎', category: 'milestone', requirement: 1000, credits: 30 },
];

/**
 * Get User model (lazy load to avoid circular deps)
 */
function getUserModel() {
  return mongoose.model<IUser>('User');
}

/**
 * Get achievement by ID
 */
export function getAchievement(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find(a => a.id === id);
}

/**
 * Get all achievements with user's unlock status
 */
export async function getUserAchievements(userId: string): Promise<{
  achievements: (AchievementDefinition & { unlocked: boolean; unlockedAt?: Date })[];
  totalUnlocked: number;
  totalCreditsEarned: number;
}> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    return {
      achievements: ACHIEVEMENTS.map(a => ({ ...a, unlocked: false })),
      totalUnlocked: 0,
      totalCreditsEarned: 0
    };
  }
  
  const userAchievements = user.achievements || [];
  const unlockedIds = new Set(userAchievements.map(a => a.id));
  
  const achievements = ACHIEVEMENTS.map(achievement => {
    const unlocked = unlockedIds.has(achievement.id);
    const userAchievement = userAchievements.find(a => a.id === achievement.id);
    return {
      ...achievement,
      unlocked,
      unlockedAt: userAchievement?.unlockedAt
    };
  });
  
  const totalUnlocked = userAchievements.length;
  const totalCreditsEarned = userAchievements.reduce((sum, a) => {
    const def = getAchievement(a.id);
    return sum + (def?.credits || 0);
  }, 0);
  
  return { achievements, totalUnlocked, totalCreditsEarned };
}

/**
 * Check and unlock achievements for a user
 * Call this after relevant actions (generation, referral, login)
 */
export async function checkAndUnlockAchievements(userId: string): Promise<{
  newlyUnlocked: AchievementDefinition[];
  creditsAwarded: number;
}> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    return { newlyUnlocked: [], creditsAwarded: 0 };
  }
  
  const userAchievements = user.achievements || [];
  const unlockedIds = new Set(userAchievements.map(a => a.id));
  
  const newlyUnlocked: AchievementDefinition[] = [];
  let creditsAwarded = 0;
  
  for (const achievement of ACHIEVEMENTS) {
    // Skip if already unlocked
    if (unlockedIds.has(achievement.id)) continue;
    
    // Check if user meets requirement
    let qualifies = false;
    
    switch (achievement.category) {
      case 'generation':
        qualifies = (user.totalGenerations || 0) >= achievement.requirement;
        break;
      case 'social':
        qualifies = (user.referralCount || 0) >= achievement.requirement;
        break;
      case 'streak':
        qualifies = (user.loginStreak || 0) >= achievement.requirement;
        break;
      case 'milestone':
        qualifies = (user.totalCreditsSpent || 0) >= achievement.requirement;
        break;
    }
    
    if (qualifies) {
      // Unlock achievement
      user.achievements = user.achievements || [];
      user.achievements.push({
        id: achievement.id,
        unlockedAt: new Date()
      });
      
      // Award credits
      user.credits += achievement.credits;
      user.totalCreditsEarned += achievement.credits;
      
      newlyUnlocked.push(achievement);
      creditsAwarded += achievement.credits;
      
      logger.info('Achievement unlocked', { 
        userId, 
        achievementId: achievement.id, 
        credits: achievement.credits 
      });
    }
  }
  
  if (newlyUnlocked.length > 0) {
    await user.save();
  }
  
  return { newlyUnlocked, creditsAwarded };
}

/**
 * Update login streak and check streak achievements
 */
export async function updateLoginStreak(userId: string): Promise<{
  streak: number;
  creditsAwarded: number;
  newlyUnlocked: AchievementDefinition[];
}> {
  const User = getUserModel();
  const user = await User.findOne({ userId });
  
  if (!user) {
    return { streak: 0, creditsAwarded: 0, newlyUnlocked: [] };
  }
  
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastLogin = user.lastLoginDate ? new Date(user.lastLoginDate) : null;
  const lastLoginDay = lastLogin 
    ? new Date(lastLogin.getFullYear(), lastLogin.getMonth(), lastLogin.getDate())
    : null;
  
  // Check if already logged in today
  if (lastLoginDay && lastLoginDay.getTime() === today.getTime()) {
    return { 
      streak: user.loginStreak || 1, 
      creditsAwarded: 0, 
      newlyUnlocked: [] 
    };
  }
  
  // Check if streak continues (logged in yesterday)
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  let newStreak = 1;
  if (lastLoginDay && lastLoginDay.getTime() === yesterday.getTime()) {
    newStreak = (user.loginStreak || 0) + 1;
  }
  
  // Daily login bonus (1 credit)
  let dailyBonus = 1;
  
  // Streak bonuses
  if (newStreak === 7) {
    dailyBonus += 5;  // 7-day streak bonus
  } else if (newStreak === 30) {
    dailyBonus += 20;  // 30-day streak bonus
  } else if (newStreak === 100) {
    dailyBonus += 50;  // 100-day streak bonus
  }
  
  user.loginStreak = newStreak;
  user.lastLoginDate = now;
  user.credits += dailyBonus;
  user.totalCreditsEarned += dailyBonus;
  
  await user.save();
  
  // Check for new achievements
  const { newlyUnlocked, creditsAwarded: achievementCredits } = await checkAndUnlockAchievements(userId);
  
  return {
    streak: newStreak,
    creditsAwarded: dailyBonus + achievementCredits,
    newlyUnlocked
  };
}

/**
 * Get achievement leaderboard
 */
export async function getAchievementLeaderboard(limit: number = 10): Promise<{
  rank: number;
  userId: string;
  achievementCount: number;
  totalGenerations: number;
}[]> {
  const User = getUserModel();
  
  const leaders = await User.aggregate([
    {
      $project: {
        userId: 1,
        achievementCount: { $size: { $ifNull: ['$achievements', []] } },
        totalGenerations: { $ifNull: ['$totalGenerations', 0] }
      }
    },
    { $match: { achievementCount: { $gt: 0 } } },
    { $sort: { achievementCount: -1, totalGenerations: -1 } },
    { $limit: limit }
  ]);
  
  return leaders.map((user, index) => ({
    rank: index + 1,
    userId: user.userId || 'unknown',
    achievementCount: user.achievementCount,
    totalGenerations: user.totalGenerations
  }));
}

/**
 * Increment generation count and check achievements
 * Call this after successful generation
 */
export async function incrementGenerations(userId: string): Promise<{
  totalGenerations: number;
  newlyUnlocked: AchievementDefinition[];
  creditsAwarded: number;
}> {
  const User = getUserModel();
  
  await User.updateOne(
    { userId },
    { $inc: { totalGenerations: 1 } }
  );
  
  const user = await User.findOne({ userId });
  const totalGenerations = user?.totalGenerations || 0;
  
  const { newlyUnlocked, creditsAwarded } = await checkAndUnlockAchievements(userId);
  
  return { totalGenerations, newlyUnlocked, creditsAwarded };
}

export default {
  ACHIEVEMENTS,
  getAchievement,
  getUserAchievements,
  checkAndUnlockAchievements,
  updateLoginStreak,
  getAchievementLeaderboard,
  incrementGenerations
};
