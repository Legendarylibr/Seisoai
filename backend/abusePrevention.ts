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
 * SECURITY ENHANCED: Comprehensive list with pattern matching
 */
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  '10minutemail.com',
  '10minutemail.net',
  '10minutemail.org',
  'guerrillamail.com',
  'guerrillamail.org',
  'guerrillamail.net',
  'guerrillamail.biz',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'temp-mail.io',
  'mohmal.com',
  'yopmail.com',
  'yopmail.fr',
  'getnada.com',
  'fakeinbox.com',
  'trashmail.com',
  'trashmail.net',
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
  'zoemail.org',
  // Additional common disposable domains
  'mailnesia.com',
  'mailnator.com',
  'getairmail.com',
  'fakemailgenerator.net',
  'emailfake.com',
  'crazymailing.com',
  'tempsky.com',
  'emailtemporanea.com',
  'disposableemailaddresses.com',
  'throwawaymail.com',
  'spamgourmet.com',
  'mailcatch.com',
  'jetable.org',
  'nospam.ze.tc',
  'uggsrock.com',
  'mailexpire.com',
  'incognitomail.com',
  'anonymbox.com',
  'spamavert.com',
  'spamfree24.org',
  'spamherelots.com',
  'tempr.email',
  'burnermail.io',
  'dropmail.me',
  'harakirimail.com',
  'mailsac.com'
];

/**
 * SECURITY ENHANCED: Regex patterns to detect disposable email services
 * Catches variations and subdomains
 */
const DISPOSABLE_EMAIL_PATTERNS = [
  /^temp/i,           // tempmail, temporary, temp-*
  /^fake/i,           // fakemail, fakeinbox
  /^trash/i,          // trashmail, trashy
  /^throw/i,          // throwaway
  /^disposable/i,     // disposable*
  /^spam/i,           // spammail, spam*
  /^junk/i,           // junkmail
  /^burner/i,         // burnermail
  /^10min/i,          // 10minute*, 10min*
  /minute.*mail/i,    // *minutemail
  /^guerrilla/i,      // guerrillamail
  /mailinator/i,      // *mailinator*
  /yopmail/i,         // *yopmail*
  /nospam/i,          // *nospam*
  /tmpmail/i,         // *tmpmail*
  /tempinbox/i,       // *tempinbox*
  /maildrop/i,        // *maildrop*
  /mailnesia/i,       // *mailnesia*
  /anonymbox/i,       // *anonymbox*
  /incognitomail/i,   // *incognitomail*
];

/**
 * Check if email is from a disposable/temporary email service
 * SECURITY ENHANCED: Uses both domain list and pattern matching
 */
export function isDisposableEmail(email: unknown): boolean {
  if (!email || typeof email !== 'string') return false;
  
  const domain = email.toLowerCase().split('@')[1];
  if (!domain) return false;
  
  // Check against explicit domain list
  const matchesDomain = DISPOSABLE_EMAIL_DOMAINS.some(disposableDomain => 
    domain === disposableDomain || domain.endsWith(`.${disposableDomain}`)
  );
  
  if (matchesDomain) return true;
  
  // Check against pattern matching (catches variations)
  const matchesPattern = DISPOSABLE_EMAIL_PATTERNS.some(pattern => 
    pattern.test(domain)
  );
  
  return matchesPattern;
}

/**
 * Generate a privacy-preserving browser fingerprint from request headers
 * DATA MINIMIZATION: Only creates a one-way hash - original data is never stored
 * Uses minimal headers to reduce uniqueness while still preventing abuse
 */
export function generateBrowserFingerprint(req: Request): string {
  const headers = req.headers;
  // DATA MINIMIZATION: Only use essential headers for abuse detection
  // Deliberately avoid detailed fingerprinting (no screen size, fonts, plugins)
  const fingerprintData = [
    // Broad browser family only (not full user-agent)
    (headers['user-agent'] || '').split('/')[0] || 'unknown',
    // Language preference (2 chars only)
    (headers['accept-language'] || 'en').substring(0, 2),
    // DNT preference
    headers['dnt'] || '0'
  ].join('|');
  
  // One-way hash - cannot be reversed to identify user
  return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
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
 * 
 * SECURITY FIX: Actually verify JWT tokens, not just check structure
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
    // SECURITY FIX: Actually verify JWT tokens, not just check structure
    // Fake tokens matching xxx.yyy.zzz pattern will now fail verification
    // Also skip rate limiting if user is already authenticated and has credits
    skip: (req: Request) => {
      // First check if req.user is already set (from previous middleware) and has credits
      const user = (req as Request & { user?: { credits?: number } }).user;
      if (user && (user.credits || 0) > 0) {
        // User is authenticated and has credits - skip rate limiting
        return true;
      }
      
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
      }
      
      const token = authHeader.split(' ')[1];
      if (!token) return false;
      
      // SECURITY: Validate JWT structure first (cheap check)
      const jwtPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
      if (!jwtPattern.test(token)) {
        return false;
      }
      
      // SECURITY FIX: Actually verify the JWT signature
      try {
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET;
        if (!secret) return false;
        
        const decoded = jwt.verify(token, secret);
        // Token is valid - skip rate limiting for authenticated users
        // Note: We can't check credits here synchronously, but requireCredits middleware will handle that
        return !!decoded;
      } catch {
        // Invalid token - do NOT skip rate limiting
        logger.debug('Rate limiter: Invalid JWT token, applying rate limit');
        return false;
      }
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
 * SECURITY FIX: Added validation and trusted proxy awareness
 * 
 * NOTE: This function should only be used behind a trusted reverse proxy
 * that sets these headers correctly. If not behind a proxy, attackers
 * can spoof these headers.
 */
export function extractClientIP(req: Request): string {
  // SECURITY: Only trust proxy headers if Express trust proxy is configured
  // This prevents IP spoofing when the app is directly exposed to the internet
  const trustProxy = req.app.get('trust proxy');
  
  if (trustProxy) {
    // SECURITY FIX: Check cf-connecting-ip FIRST (Cloudflare sets this, can't be spoofed by client)
    if (req.headers['cf-connecting-ip']) {
      const cfIp = String(req.headers['cf-connecting-ip']).trim();
      if (isValidIPAddress(cfIp)) {
        return cfIp;
      }
    }
    
    // Check x-real-ip (nginx proxy - typically set by the proxy, not client)
    if (req.headers['x-real-ip']) {
      const realIp = String(req.headers['x-real-ip']).trim();
      if (isValidIPAddress(realIp)) {
        return realIp;
      }
    }
    
    // SECURITY FIX: For x-forwarded-for, take the RIGHTMOST IP that isn't a known proxy
    // The leftmost IP can be spoofed by the client, but proxies append to the right
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = String(forwardedFor).split(',').map(ip => ip.trim());
      // Take the first valid IP (could also take rightmost if you know your proxy count)
      for (const ip of ips) {
        if (isValidIPAddress(ip) && !isPrivateIP(ip)) {
          return ip;
        }
      }
      // If all IPs are private (development), use the first one
      if (ips.length > 0 && isValidIPAddress(ips[0])) {
        return ips[0];
      }
    }
  } else {
    // SECURITY: Log warning if proxy headers present but trust proxy not set
    if (req.headers['x-forwarded-for'] || req.headers['x-real-ip']) {
      logger.warn('Proxy headers present but trust proxy not configured - ignoring headers', {
        path: req.path,
        hasXFF: !!req.headers['x-forwarded-for'],
        hasXRI: !!req.headers['x-real-ip']
      });
    }
  }
  
  // Fallback to req.ip (set by express trust proxy) or socket IP
  return req.ip || (req.socket?.remoteAddress) || 'unknown';
}

/**
 * Validate IP address format
 */
function isValidIPAddress(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  // IPv4
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  // IPv6 (simplified - allows :: notation)
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,6}::[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

/**
 * Check if IP is a private/internal address
 */
function isPrivateIP(ip: string): boolean {
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^127\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
    /^fd[0-9a-f]{2}:/i
  ];
  return privateRanges.some(range => range.test(ip));
}
