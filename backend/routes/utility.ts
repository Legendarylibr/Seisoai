/**
 * Utility routes
 * Health checks, robots.txt, CORS info, logging
 */
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';

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
