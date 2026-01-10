/**
 * CDN Middleware
 * Adds proper cache headers for CDN optimization
 */
import { type Request, type Response, type NextFunction } from 'express';
import config from '../config/env.js';

// Asset types and their cache durations
const CACHE_RULES: Record<string, { maxAge: number; immutable: boolean }> = {
  // Immutable assets (hashed filenames)
  '.js': { maxAge: 31536000, immutable: true },      // 1 year
  '.css': { maxAge: 31536000, immutable: true },     // 1 year
  '.woff': { maxAge: 31536000, immutable: true },    // 1 year
  '.woff2': { maxAge: 31536000, immutable: true },   // 1 year
  '.ttf': { maxAge: 31536000, immutable: true },     // 1 year
  '.eot': { maxAge: 31536000, immutable: true },     // 1 year
  
  // Images - long cache
  '.png': { maxAge: 2592000, immutable: false },     // 30 days
  '.jpg': { maxAge: 2592000, immutable: false },     // 30 days
  '.jpeg': { maxAge: 2592000, immutable: false },    // 30 days
  '.gif': { maxAge: 2592000, immutable: false },     // 30 days
  '.svg': { maxAge: 2592000, immutable: false },     // 30 days
  '.webp': { maxAge: 2592000, immutable: false },    // 30 days
  '.avif': { maxAge: 2592000, immutable: false },    // 30 days
  '.ico': { maxAge: 2592000, immutable: false },     // 30 days
  
  // Videos - medium cache
  '.mp4': { maxAge: 604800, immutable: false },      // 7 days
  '.webm': { maxAge: 604800, immutable: false },     // 7 days
  
  // Documents
  '.pdf': { maxAge: 86400, immutable: false },       // 1 day
  '.json': { maxAge: 0, immutable: false },          // No cache (data)
  '.xml': { maxAge: 3600, immutable: false },        // 1 hour
};

// Files that should never be cached
const NO_CACHE_FILES = [
  'index.html',
  'manifest.json',
  'robots.txt',
  'sitemap.xml',
  '.map'
];

/**
 * CDN cache headers middleware
 */
export function cdnCacheMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip API routes
  if (req.path.startsWith('/api')) {
    next();
    return;
  }

  // Get file extension
  const ext = getFileExtension(req.path);
  const filename = req.path.split('/').pop() || '';

  // Check if file should not be cached
  if (NO_CACHE_FILES.some(pattern => filename.includes(pattern) || req.path.endsWith(pattern))) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
    return;
  }

  // Get cache rules for extension
  const cacheRule = CACHE_RULES[ext];
  
  if (cacheRule) {
    const cacheControl = cacheRule.immutable
      ? `public, max-age=${cacheRule.maxAge}, immutable`
      : `public, max-age=${cacheRule.maxAge}`;
    
    res.setHeader('Cache-Control', cacheControl);
    
    // Add CDN-specific headers
    if (config.isProduction) {
      // Cloudflare headers
      res.setHeader('CDN-Cache-Control', cacheControl);
      
      // Vary header for proper caching
      res.setHeader('Vary', 'Accept-Encoding');
    }
  }

  next();
}

/**
 * Get file extension from path
 */
function getFileExtension(path: string): string {
  const match = path.match(/\.[a-zA-Z0-9]+$/);
  return match ? match[0].toLowerCase() : '';
}

/**
 * Middleware to add security headers for CDN
 */
export function cdnSecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // CORS headers for CDN assets
  if (!req.path.startsWith('/api')) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Timing-Allow-Origin', '*');
  }

  next();
}

export default { cdnCacheMiddleware, cdnSecurityMiddleware };

