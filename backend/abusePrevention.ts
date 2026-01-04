// Abuse Prevention Utilities
// Additional measures to prevent abuse of free images and other features

import crypto from 'crypto';
import type { Request } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import type { IUser } from './models/User';
import type { IIPFreeImage } from './models/IPFreeImage';
import type { Model } from 'mongoose';
import logger from './utils/logger';

/**
 * List of known temporary/disposable email domains
 * Add more as needed
 */
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'mohmal.com',
  'yopmail.com',
  'getnada.com',
  'fakeinbox.com',
  'trashmail.com',
  'mintemail.com',
  'sharklasers.com',
  'grr.la',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'bccto.me',
  'chitthi.in',
  'dispostable.com',
  'emailondeck.com',
  'fakemailgenerator.com',
  'maildrop.cc',
  'meltmail.com',
  'mytemp.email',
  'tempail.com',
  'tempinbox.co.uk',
  'tempinbox.com',
  'tempmail.co',
  'tempmail.de',
  'tempmail.net',
  'tempmailo.com',
  'tmpmail.org',
  'tmpmail.net',
  'tmail.ws',
  'tmailinator.com',
  'trashmailer.com',
  'trashymail.com',
  'tyldd.com',
  'yapped.net',
  'zoemail.org'
];

/**
 * Check if email is from a disposable/temporary email service
 */
export function isDisposableEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;
  
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  
  return DISPOSABLE_EMAIL_DOMAINS.some(disposableDomain => 
    domain === disposableDomain || domain.endsWith(`.${disposableDomain}`)
  );
}

/**
 * Generate a simple browser fingerprint from request headers
 * This helps identify unique devices/browsers even if IP changes
 */
export function generateBrowserFingerprint(req: Request): string {
  const headers = req.headers;
  const fingerprint = {
    userAgent: headers['user-agent'] || 'unknown',
    acceptLanguage: headers['accept-language'] || 'unknown',
    acceptEncoding: headers['accept-encoding'] || 'unknown',
    accept: headers['accept'] || 'unknown',
    connection: headers['connection'] || 'unknown',
    dnt: headers['dnt'] || 'unknown',
    upgradeInsecureRequests: headers['upgrade-insecure-requests'] || 'unknown'
  };
  
  // Create a hash of the fingerprint
  const fingerprintString = JSON.stringify(fingerprint);
  return crypto.createHash('sha256').update(fingerprintString).digest('hex').substring(0, 16);
}

/**
 * Check if IP is likely a VPN/Proxy
 * This is a simple check - for production, consider using a service like MaxMind
 */
export function isLikelyVPN(ip: string): boolean {
  // This is a placeholder - in production, use a proper VPN detection service
  // For now, we'll just check for common patterns
  
  // Private IP ranges (shouldn't be in production, but check anyway)
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/
  ];
  
  // If it's a private IP, it's likely behind a proxy
  return privateRanges.some(range => range.test(ip));
}

/**
 * Rate limiter specifically for free image generation
 * Stricter limits to prevent abuse - but SKIPS authenticated users
 * Authenticated users are managed by the requireCredits middleware instead
 */
export function createFreeImageRateLimiter(rateLimit: (options: unknown) => RateLimitRequestHandler): RateLimitRequestHandler {
  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // Maximum 5 free image attempts per hour per IP
    message: {
      error: 'Too many free image requests. Please wait before trying again.',
      retryAfter: '1 hour'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false, // Count all requests, even failed ones
    keyGenerator: (req: Request) => {
      // Use IP + browser fingerprint for more accurate tracking
      const fingerprint = generateBrowserFingerprint(req);
      return `${req.ip || 'unknown'}-${fingerprint}`;
    },
    // Skip rate limiting for authenticated users (they'll be checked by requireCredits middleware)
    skip: (req: Request) => {
      // Check for user identification in request body (how the app sends auth info)
      const body = req.body || {};
      const hasWallet = !!(body as { walletAddress?: string }).walletAddress;
      const hasUserId = !!(body as { userId?: string }).userId;
      const hasEmail = !!(body as { email?: string }).email;
      
      // Skip rate limiting if user is authenticated (they have credits system instead)
      // The requireCredits middleware will handle credit checks for authenticated users
      if (hasWallet || hasUserId || hasEmail) {
        return true;
      }
      
      return false;
    }
  });
}

/**
 * Cooldown period between free image generations
 * Prevents rapid-fire abuse
 */
export async function checkFreeImageCooldown(
  ipAddress: string, 
  IPFreeImage: Model<IIPFreeImage>
): Promise<{ allowed: boolean; reason: string; remainingSeconds?: number }> {
  const ipRecord = await IPFreeImage.findOne({ ipAddress });
  
  if (!ipRecord || !ipRecord.lastUsed) {
    return { allowed: true, reason: 'No previous free image usage' };
  }
  
  const cooldownPeriod = 5 * 60 * 1000; // 5 minutes between free images
  const timeSinceLastUse = Date.now() - new Date(ipRecord.lastUsed).getTime();
  
  if (timeSinceLastUse < cooldownPeriod) {
    const remainingSeconds = Math.ceil((cooldownPeriod - timeSinceLastUse) / 1000);
    return {
      allowed: false,
      reason: `Please wait ${remainingSeconds} seconds between free image generations`,
      remainingSeconds
    };
  }
  
  return { allowed: true, reason: 'Cooldown period passed' };
}

/**
 * Validate account age before allowing free images
 * New accounts must exist for at least a few minutes
 */
export function checkAccountAge(user: IUser | null): { allowed: boolean; reason: string; remainingSeconds?: number } {
  if (!user || !user.createdAt) {
    return { allowed: false, reason: 'Account age cannot be determined' };
  }
  
  const minAccountAge = 2 * 60 * 1000; // 2 minutes
  const accountAge = Date.now() - new Date(user.createdAt).getTime();
  
  if (accountAge < minAccountAge) {
    const remainingSeconds = Math.ceil((minAccountAge - accountAge) / 1000);
    return {
      allowed: false,
      reason: `Account must be at least 2 minutes old. Please wait ${remainingSeconds} more seconds.`,
      remainingSeconds
    };
  }
  
  return { allowed: true, reason: 'Account age requirement met' };
}

/**
 * Check for suspicious patterns
 * Multiple accounts from same IP in short time
 */
export async function checkSuspiciousPatterns(
  ipAddress: string, 
  email: string | null, 
  User: Model<IUser>, 
  _IPFreeImage: Model<IIPFreeImage>
): Promise<{ suspicious: boolean; reason?: string }> {
  // Check how many accounts were created from this IP recently
  const recentAccountWindow = 24 * 60 * 60 * 1000; // 24 hours
  const recentAccounts = await User.countDocuments({
    $or: [
      { createdAt: { $gte: new Date(Date.now() - recentAccountWindow) } }
    ]
  });
  
  // If more than 10 accounts created recently, flag as suspicious
  if (recentAccounts > 10) {
    logger.warn('Suspicious pattern detected: Many recent account creations', {
      ipAddress,
      recentAccounts,
      email
    });
    return {
      suspicious: true,
      reason: 'Too many accounts created recently from this IP'
    };
  }
  
  return { suspicious: false };
}

/**
 * Enhanced IP extraction that handles various proxy scenarios
 */
export function extractClientIP(req: Request): string {
  // Check x-forwarded-for header (most common proxy header)
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one (original client)
    const ips = String(forwardedFor).split(',').map(ip => ip.trim());
    return ips[0];
  }
  
  // Check x-real-ip (nginx proxy)
  if (req.headers['x-real-ip']) {
    return String(req.headers['x-real-ip']);
  }
  
  // Check cf-connecting-ip (Cloudflare)
  if (req.headers['cf-connecting-ip']) {
    return String(req.headers['cf-connecting-ip']);
  }
  
  // Fallback to req.ip (set by express trust proxy)
  return req.ip || (req.socket?.remoteAddress) || 'unknown';
}
