/**
 * Health & Utility Routes
 * Simple endpoints for monitoring and debugging
 */
import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';

// Types
interface Dependencies {
  dbCircuitBreaker?: {
    isOpen: boolean;
  };
}

/**
 * Create health routes with dependencies
 */
export const createHealthRoutes = (deps: Dependencies = {}) => {
  const router = Router();
  const { dbCircuitBreaker } = deps;

  /**
   * Health check endpoint
   * GET /api/health
   */
  router.get('/health', (req: Request, res: Response) => {
    try {
      const dbState = mongoose.connection.readyState;
      const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
      
      const criticalVars = {
        MONGODB_URI: !!process.env.MONGODB_URI,
        JWT_SECRET: !!process.env.JWT_SECRET,
        SESSION_SECRET: !!process.env.SESSION_SECRET
      };
      const hasAllCritical = Object.values(criticalVars).every(v => v);
      
      const circuitOpen = dbCircuitBreaker?.isOpen ?? false;
      
      const health = {
        status: hasAllCritical && dbState === 1 && !circuitOpen ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        database: dbStatus === 'connected' ? 'connected' : 'disconnected'
      };

      const httpStatus = health.status === 'healthy' ? 200 : 503;
      res.status(httpStatus).json(health);
    } catch (error) {
      const err = error as Error;
      logger.error('Health check error', { error: err.message });
      res.status(500).json({
        status: 'error',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * CORS info endpoint (debugging)
   * GET /api/cors-info
   */
  router.get('/cors-info', (req: Request, res: Response) => {
    res.json({
      origin: req.headers.origin || 'none',
      allowedOrigins: process.env.ALLOWED_ORIGINS || 'not configured',
      nodeEnv: process.env.NODE_ENV || 'development'
    });
  });

  /**
   * Client-side error logging
   * POST /api/logs
   */
  router.post('/logs', (req: Request, res: Response) => {
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

  return router;
};

/**
 * Create robots.txt route (standalone, no dependencies)
 */
export const createRobotsRoute = () => {
  const router = Router();
  
  router.get('/robots.txt', (req: Request, res: Response) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://seisoai.com/sitemap.xml`);
  });

  return router;
};

export default { createHealthRoutes, createRobotsRoute };

