/**
 * Email Marketing Service
 * Handles automated email campaigns, triggers, and scheduling
 */
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { sendEmail } from './email';
import { getOrCreateReferralCode } from './referralService';
import type { IUser } from '../models/User';
import {
  welcomeEmail,
  onboardingEmail1,
  onboardingEmail2,
  lowCreditsEmail,
  winBackEmail,
  type WelcomeEmailData,
  type OnboardingEmail1Data,
  type OnboardingEmail2Data,
  type LowCreditsEmailData,
  type WinBackEmailData
} from '../templates/emails/index';

// Configuration
const EMAIL_QUEUE_ENABLED = process.env.EMAIL_QUEUE_ENABLED !== 'false';
const BATCH_SIZE = 50; // Process emails in batches
const LOW_CREDITS_THRESHOLD = 5;
const INACTIVE_DAYS_THRESHOLD = 30;

/**
 * Get User model (lazy load to avoid circular deps)
 */
function getUserModel() {
  return mongoose.model<IUser>('User');
}

/**
 * Send welcome email to a new user
 */
export async function sendWelcomeEmail(userId: string): Promise<boolean> {
  try {
    const User = getUserModel();
    const user = await User.findOne({ userId });
    
    if (!user || !user.email) {
      logger.warn('Cannot send welcome email - user or email not found', { userId });
      return false;
    }
    
    // Get or create referral code
    const referralCode = await getOrCreateReferralCode(userId);
    
    const data: WelcomeEmailData = {
      userName: user.email.split('@')[0],
      referralCode,
      credits: user.credits || 10
    };
    
    const { html, text, subject } = welcomeEmail(data);
    
    const result = await sendEmail({
      to: user.email,
      subject,
      html: html.replace('{{email}}', encodeURIComponent(user.email)),
      text
    });
    
    if (result.success) {
      logger.info('Welcome email sent', { userId, email: user.email.substring(0, 5) + '...' });
    }
    
    return result.success;
  } catch (error) {
    logger.error('Failed to send welcome email', { userId, error: (error as Error).message });
    return false;
  }
}

/**
 * Send onboarding email 1 (24 hours after signup)
 */
export async function sendOnboardingEmail1(userId: string): Promise<boolean> {
  try {
    const User = getUserModel();
    const user = await User.findOne({ userId });
    
    if (!user || !user.email) {
      return false;
    }
    
    // Check if marketing emails are enabled
    if (user.settings?.enableNotifications === false) {
      return false;
    }
    
    const data: OnboardingEmail1Data = {
      userName: user.email.split('@')[0],
      hasGenerated: (user.totalGenerations || 0) > 0
    };
    
    const { html, text, subject } = onboardingEmail1(data);
    
    const result = await sendEmail({
      to: user.email,
      subject,
      html: html.replace('{{email}}', encodeURIComponent(user.email)),
      text
    });
    
    return result.success;
  } catch (error) {
    logger.error('Failed to send onboarding email 1', { userId, error: (error as Error).message });
    return false;
  }
}

/**
 * Send onboarding email 2 (3 days after signup)
 */
export async function sendOnboardingEmail2(userId: string): Promise<boolean> {
  try {
    const User = getUserModel();
    const user = await User.findOne({ userId });
    
    if (!user || !user.email) {
      return false;
    }
    
    if (user.settings?.enableNotifications === false) {
      return false;
    }
    
    const data: OnboardingEmail2Data = {
      userName: user.email.split('@')[0],
      generationCount: user.totalGenerations || 0
    };
    
    const { html, text, subject } = onboardingEmail2(data);
    
    const result = await sendEmail({
      to: user.email,
      subject,
      html: html.replace('{{email}}', encodeURIComponent(user.email)),
      text
    });
    
    return result.success;
  } catch (error) {
    logger.error('Failed to send onboarding email 2', { userId, error: (error as Error).message });
    return false;
  }
}

/**
 * Send low credits reminder email
 */
export async function sendLowCreditsEmail(userId: string): Promise<boolean> {
  try {
    const User = getUserModel();
    const user = await User.findOne({ userId });
    
    if (!user || !user.email) {
      return false;
    }
    
    if (user.settings?.enableNotifications === false) {
      return false;
    }
    
    const referralCode = await getOrCreateReferralCode(userId);
    
    const data: LowCreditsEmailData = {
      userName: user.email.split('@')[0],
      credits: user.credits,
      referralCode
    };
    
    const { html, text, subject } = lowCreditsEmail(data);
    
    const result = await sendEmail({
      to: user.email,
      subject,
      html: html.replace('{{email}}', encodeURIComponent(user.email)),
      text
    });
    
    return result.success;
  } catch (error) {
    logger.error('Failed to send low credits email', { userId, error: (error as Error).message });
    return false;
  }
}

/**
 * Send win-back email (30 days inactive)
 */
export async function sendWinBackEmail(userId: string): Promise<boolean> {
  try {
    const User = getUserModel();
    const user = await User.findOne({ userId });
    
    if (!user || !user.email) {
      return false;
    }
    
    if (user.settings?.enableNotifications === false) {
      return false;
    }
    
    const data: WinBackEmailData = {
      userName: user.email.split('@')[0],
      lastActiveDate: user.lastActive,
      credits: user.credits
    };
    
    const { html, text, subject } = winBackEmail(data);
    
    const result = await sendEmail({
      to: user.email,
      subject,
      html: html.replace('{{email}}', encodeURIComponent(user.email)),
      text
    });
    
    return result.success;
  } catch (error) {
    logger.error('Failed to send win-back email', { userId, error: (error as Error).message });
    return false;
  }
}

/**
 * Process onboarding emails (run as a scheduled job)
 * - Finds users who signed up 24h ago and haven't received onboarding email 1
 * - Finds users who signed up 3 days ago and haven't received onboarding email 2
 */
export async function processOnboardingEmails(): Promise<{ sent: number; errors: number }> {
  if (!EMAIL_QUEUE_ENABLED) {
    return { sent: 0, errors: 0 };
  }
  
  const User = getUserModel();
  let sent = 0;
  let errors = 0;
  
  try {
    const now = new Date();
    
    // Find users for 24-hour email (signed up 24-25 hours ago)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneDayPlusHour = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    
    const users24h = await User.find({
      email: { $exists: true, $ne: null },
      createdAt: { $gte: oneDayPlusHour, $lte: oneDayAgo },
      onboardingStep: { $lt: 1 }
    }).limit(BATCH_SIZE);
    
    for (const user of users24h) {
      if (!user.userId) continue;
      
      const success = await sendOnboardingEmail1(user.userId);
      if (success) {
        await User.updateOne({ _id: user._id }, { $set: { onboardingStep: 1 } });
        sent++;
      } else {
        errors++;
      }
    }
    
    // Find users for 3-day email (signed up 3 days ago)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const threeDaysPlusHour = new Date(now.getTime() - (3 * 24 + 1) * 60 * 60 * 1000);
    
    const users3d = await User.find({
      email: { $exists: true, $ne: null },
      createdAt: { $gte: threeDaysPlusHour, $lte: threeDaysAgo },
      onboardingStep: { $lt: 2 }
    }).limit(BATCH_SIZE);
    
    for (const user of users3d) {
      if (!user.userId) continue;
      
      const success = await sendOnboardingEmail2(user.userId);
      if (success) {
        await User.updateOne({ _id: user._id }, { $set: { onboardingStep: 2 } });
        sent++;
      } else {
        errors++;
      }
    }
    
    logger.info('Onboarding emails processed', { sent, errors });
  } catch (error) {
    logger.error('Failed to process onboarding emails', { error: (error as Error).message });
  }
  
  return { sent, errors };
}

/**
 * Process low credits reminder emails
 * Finds users with credits below threshold who haven't been notified recently
 */
export async function processLowCreditsEmails(): Promise<{ sent: number; errors: number }> {
  if (!EMAIL_QUEUE_ENABLED) {
    return { sent: 0, errors: 0 };
  }
  
  const User = getUserModel();
  let sent = 0;
  let errors = 0;
  
  try {
    // Find users with low credits who:
    // - Have been active in the last 7 days (still engaged)
    // - Haven't been sent this email recently (prevent spam)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const users = await User.find({
      email: { $exists: true, $ne: null },
      credits: { $lte: LOW_CREDITS_THRESHOLD, $gt: 0 },
      lastActive: { $gte: sevenDaysAgo },
      // Only email once per 14 days
      $or: [
        { 'settings.lastLowCreditsEmail': { $exists: false } },
        { 'settings.lastLowCreditsEmail': { $lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } }
      ]
    }).limit(BATCH_SIZE);
    
    for (const user of users) {
      if (!user.userId) continue;
      
      const success = await sendLowCreditsEmail(user.userId);
      if (success) {
        await User.updateOne(
          { _id: user._id }, 
          { $set: { 'settings.lastLowCreditsEmail': new Date() } }
        );
        sent++;
      } else {
        errors++;
      }
    }
    
    logger.info('Low credits emails processed', { sent, errors });
  } catch (error) {
    logger.error('Failed to process low credits emails', { error: (error as Error).message });
  }
  
  return { sent, errors };
}

/**
 * Process win-back emails
 * Finds users who have been inactive for 30+ days
 */
export async function processWinBackEmails(): Promise<{ sent: number; errors: number }> {
  if (!EMAIL_QUEUE_ENABLED) {
    return { sent: 0, errors: 0 };
  }
  
  const User = getUserModel();
  let sent = 0;
  let errors = 0;
  
  try {
    const thirtyDaysAgo = new Date(Date.now() - INACTIVE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000);
    
    const users = await User.find({
      email: { $exists: true, $ne: null },
      lastActive: { $lt: thirtyDaysAgo },
      // Only email once per 30 days
      $or: [
        { 'settings.lastWinBackEmail': { $exists: false } },
        { 'settings.lastWinBackEmail': { $lt: thirtyDaysAgo } }
      ]
    }).limit(BATCH_SIZE);
    
    for (const user of users) {
      if (!user.userId) continue;
      
      const success = await sendWinBackEmail(user.userId);
      if (success) {
        await User.updateOne(
          { _id: user._id }, 
          { $set: { 'settings.lastWinBackEmail': new Date() } }
        );
        sent++;
      } else {
        errors++;
      }
    }
    
    logger.info('Win-back emails processed', { sent, errors });
  } catch (error) {
    logger.error('Failed to process win-back emails', { error: (error as Error).message });
  }
  
  return { sent, errors };
}

/**
 * Run all email campaigns
 * Call this from a scheduled job (e.g., every hour)
 */
export async function runEmailCampaigns(): Promise<void> {
  logger.info('Running email campaigns...');
  
  const results = await Promise.all([
    processOnboardingEmails(),
    processLowCreditsEmails(),
    processWinBackEmails()
  ]);
  
  const totals = results.reduce(
    (acc, r) => ({ sent: acc.sent + r.sent, errors: acc.errors + r.errors }),
    { sent: 0, errors: 0 }
  );
  
  logger.info('Email campaigns completed', totals);
}

export default {
  sendWelcomeEmail,
  sendOnboardingEmail1,
  sendOnboardingEmail2,
  sendLowCreditsEmail,
  sendWinBackEmail,
  processOnboardingEmails,
  processLowCreditsEmails,
  processWinBackEmails,
  runEmailCampaigns
};
