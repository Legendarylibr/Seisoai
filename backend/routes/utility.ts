/**
 * Utility routes
 * Health checks, robots.txt, CORS info, logging, image proxy
 */
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';

// Allowed image domains for proxy (security)
const ALLOWED_IMAGE_DOMAINS = [
  'fal.media',
  'v3.fal.media',
  'storage.googleapis.com',
  'cdn.fal.ai',
  'replicate.delivery',
  'oaidalleapiprodscus.blob.core.windows.net'
];

// Types
interface Dependencies {
  [key: string]: unknown;
}

// Rate limiter for client logging endpoint (prevent log flooding)
const clientLogLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 logs per minute per IP
  message: { error: 'Too many log requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for image proxy (prevent abuse)
const imageProxyLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 images per minute per IP
  message: { error: 'Too many image requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

interface HealthResponse {
  status: string;
  timestamp: string;
  database?: string;
}

export function createUtilityRoutes(_deps: Dependencies = {}) {
  const router = Router();

  /**
   * Health check
   * GET /api/health
   */
  router.get('/health', (_req: Request, res: Response) => {
    try {
      const dbState = mongoose.connection.readyState;
      const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
      
      const criticalVars = {
        MONGODB_URI: !!config.MONGODB_URI,
        JWT_SECRET: !!config.JWT_SECRET
      };
      const hasAllCritical = Object.values(criticalVars).every(v => v);
      
      const health: HealthResponse = {
        status: hasAllCritical && dbState === 1 ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbStatus
      };

      const httpStatus = health.status === 'healthy' ? 200 : 503;
      
      if (config.isProduction) {
        res.status(httpStatus).json({
          status: health.status,
          timestamp: health.timestamp
        });
      } else {
        res.status(httpStatus).json(health);
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Health check error:', { error: err.message });
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * Frontend config (runtime)
   * GET /api/config
   * Returns public config values that frontend needs at runtime
   * (avoids build-time VITE_ env var issues)
   */
  router.get('/config', (_req: Request, res: Response) => {
    // Public frontend config
    res.json({
      // Add public frontend config as needed
    });
  });

  /**
   * CORS info
   * GET /api/cors-info
   */
  router.get('/cors-info', (req: Request, res: Response) => {
    if (config.isProduction) {
      res.json({
        message: 'CORS validation is working',
        currentRequest: {
          hasOrigin: !!req.headers.origin
        }
      });
      return;
    }

    res.json({
      origin: req.headers.origin || 'none',
      allowedOrigins: config.ALLOWED_ORIGINS || 'not configured',
      nodeEnv: config.NODE_ENV
    });
  });

  /**
   * Client error logging
   * POST /api/logs
   * Rate limited to prevent log flooding
   */
  router.post('/logs', clientLogLimiter, (req: Request, res: Response) => {
    const { level, message, context } = req.body as { level?: string; message?: string; context?: unknown };
    
    if (!message) {
      res.status(400).json({ error: 'Message required' });
      return;
    }

    const logLevel = ['error', 'warn', 'info', 'debug'].includes(level || '') ? level : 'info';
    
    if (logLevel === 'error') {
      logger.error('Client log', {
        message,
        context,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    } else if (logLevel === 'warn') {
      logger.warn('Client log', {
        message,
        context,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    } else if (logLevel === 'debug') {
      logger.debug('Client log', {
        message,
        context,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    } else {
      logger.info('Client log', {
        message,
        context,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    res.json({ success: true });
  });

  /**
   * Image proxy for CORS bypass (enables WebGL 360 viewer)
   * GET /api/image-proxy?url=...
   * Only allows whitelisted domains for security
   */
  router.get('/image-proxy', imageProxyLimiter, async (req: Request, res: Response) => {
    try {
      const imageUrl = req.query.url as string;
      
      if (!imageUrl) {
        res.status(400).json({ error: 'URL parameter required' });
        return;
      }
      
      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        res.status(400).json({ error: 'Invalid URL' });
        return;
      }
      
      // Security: only allow whitelisted domains
      const isAllowed = ALLOWED_IMAGE_DOMAINS.some(domain => 
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        logger.warn('Image proxy blocked domain', { domain: parsedUrl.hostname });
        res.status(403).json({ error: 'Domain not allowed' });
        return;
      }
      
      // Fetch the image
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Seiso-ImageProxy/1.0',
          'Accept': 'image/*'
        }
      });
      
      if (!response.ok) {
        res.status(response.status).json({ error: 'Failed to fetch image' });
        return;
      }
      
      // Get content type
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      
      // Verify it's actually an image
      if (!contentType.startsWith('image/')) {
        res.status(400).json({ error: 'URL does not point to an image' });
        return;
      }
      
      // Stream the image with CORS headers
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache 1 day
      
      // Get as buffer and send
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
      
    } catch (error) {
      const err = error as Error;
      logger.error('Image proxy error:', { error: err.message });
      res.status(500).json({ error: 'Failed to proxy image' });
    }
  });

  /**
   * Log safety violations
   * POST /api/safety/violation
   */
  router.post('/safety/violation', (req: Request, res: Response) => {
    try {
      const { walletAddress, violation, userAgent, url } = req.body as {
        walletAddress?: string;
        violation?: string;
        userAgent?: string;
        url?: string;
      };
      
      logger.warn('Safety violation detected', {
        walletAddress: walletAddress?.toLowerCase(),
        violation,
        userAgent,
        url,
        ip: req.ip
      });
      
      res.json({ success: true, message: 'Violation logged' });
    } catch (error) {
      const err = error as Error;
      logger.error('Error logging safety violation:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to log safety violation' });
    }
  });

  return router;
}

export default createUtilityRoutes;
