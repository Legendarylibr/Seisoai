/**
 * Referral Service (Frontend)
 * Handles referral code operations and social sharing
 */
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

// Types
export interface ReferralStats {
  referral: {
    code: string;
    shareUrl: string;
    count: number;
    creditsEarned: number;
    recentReferrals: {
      refereeId: string;
      completedAt: string;
      creditsAwarded: number;
    }[];
  };
  sharing: {
    weeklyShareCredits: number;
    weeklyShareLimit: number;
    totalShares: number;
    sharesByPlatform: Record<string, number>;
  };
}

export interface LeaderboardEntry {
  rank: number;
  isCurrentUser: boolean;
  referralCount: number;
  creditsEarned: number;
}

/**
 * Get authentication headers
 */
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  try {
    const token = localStorage.getItem('authToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {
    // localStorage may be blocked in some browsers
  }
  
  return headers;
}

/**
 * Get or generate referral code for current user
 */
export async function getReferralCode(): Promise<{ code: string; shareUrl: string } | null> {
  try {
    const csrfToken = await ensureCSRFToken();
    const headers = getAuthHeaders();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${API_URL}/api/referral/code`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      logger.error('Failed to get referral code', { error: data.error });
      return null;
    }

    return {
      code: data.referralCode,
      shareUrl: data.shareUrl
    };
  } catch (error) {
    logger.error('Error getting referral code', { error: (error as Error).message });
    return null;
  }
}

/**
 * Validate a referral code
 */
export async function validateReferralCode(code: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const csrfToken = await ensureCSRFToken();
    const headers = getAuthHeaders();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${API_URL}/api/referral/validate`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ code })
    });

    const data = await response.json();
    return {
      valid: data.valid || false,
      error: data.error
    };
  } catch (error) {
    logger.error('Error validating referral code', { error: (error as Error).message });
    return { valid: false, error: 'Failed to validate code' };
  }
}

/**
 * Apply a referral code for the current user
 */
export async function applyReferralCode(code: string): Promise<{ success: boolean; bonusCredits?: number; error?: string }> {
  try {
    const csrfToken = await ensureCSRFToken();
    const headers = getAuthHeaders();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${API_URL}/api/referral/apply`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ code })
    });

    const data = await response.json();
    
    return {
      success: data.success || false,
      bonusCredits: data.bonusCredits,
      error: data.error
    };
  } catch (error) {
    logger.error('Error applying referral code', { error: (error as Error).message });
    return { success: false, error: 'Failed to apply code' };
  }
}

/**
 * Get referral statistics
 */
export async function getReferralStats(): Promise<ReferralStats | null> {
  try {
    const csrfToken = await ensureCSRFToken();
    const headers = getAuthHeaders();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${API_URL}/api/referral/stats`, {
      method: 'GET',
      headers,
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      logger.error('Failed to get referral stats', { error: data.error });
      return null;
    }

    return {
      referral: data.referral,
      sharing: data.sharing
    };
  } catch (error) {
    logger.error('Error getting referral stats', { error: (error as Error).message });
    return null;
  }
}

/**
 * Get referral leaderboard
 */
export async function getReferralLeaderboard(limit: number = 10): Promise<LeaderboardEntry[]> {
  try {
    const response = await fetch(`${API_URL}/api/referral/leaderboard?limit=${limit}`, {
      method: 'GET',
      credentials: 'include'
    });

    const data = await response.json();
    
    if (!response.ok || !data.success) {
      return [];
    }

    return data.leaderboard || [];
  } catch (error) {
    logger.error('Error getting leaderboard', { error: (error as Error).message });
    return [];
  }
}

/**
 * Track a social share
 */
export async function trackSocialShare(
  platform: 'twitter' | 'discord' | 'reddit' | 'facebook' | 'linkedin',
  contentId: string
): Promise<{ success: boolean; creditsAwarded: number; message?: string }> {
  try {
    const csrfToken = await ensureCSRFToken();
    const headers = getAuthHeaders();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

    const response = await fetch(`${API_URL}/api/referral/share`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ platform, contentId })
    });

    const data = await response.json();
    
    return {
      success: data.success || false,
      creditsAwarded: data.creditsAwarded || 0,
      message: data.message
    };
  } catch (error) {
    logger.error('Error tracking share', { error: (error as Error).message });
    return { success: false, creditsAwarded: 0 };
  }
}

/**
 * Generate share URLs for different platforms
 */
export function generateShareUrls(
  content: { imageUrl?: string; videoUrl?: string; prompt?: string },
  referralCode?: string
): Record<string, string> {
  const baseUrl = window.location.origin;
  const shareUrl = referralCode ? `${baseUrl}?ref=${referralCode}` : baseUrl;
  
  const text = content.prompt 
    ? `Check out this AI creation: "${content.prompt.substring(0, 100)}..." Made with SeisoAI`
    : 'Check out this amazing AI creation made with SeisoAI!';
  
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(shareUrl);
  
  return {
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    reddit: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}`,
    discord: shareUrl // Discord doesn't have a share URL, we copy to clipboard
  };
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      return false;
    }
  }
}

export default {
  getReferralCode,
  validateReferralCode,
  applyReferralCode,
  getReferralStats,
  getReferralLeaderboard,
  trackSocialShare,
  generateShareUrls,
  copyToClipboard
};
