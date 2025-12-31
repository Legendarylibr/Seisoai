/**
 * Utility routes
 * Health checks, robots.txt, CORS info, logging
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from '../config/env.js';

export function createUtilityRoutes(deps = {}) {
  const router = Router();

  /**
   * Health check
   * GET /api/health
   */
  router.get('/health', (req, res) => {
    try {
      const dbState = mongoose.connection.readyState;
      const dbStatus = dbState === 1 ? 'connected' : dbState === 2 ? 'connecting' : 'disconnected';
      
      const criticalVars = {
        MONGODB_URI: !!config.MONGODB_URI,
        JWT_SECRET: !!config.JWT_SECRET
      };
      const hasAllCritical = Object.values(criticalVars).every(v => v);
      
      const health = {
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
      logger.error('Health check error:', { error: error.message });
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
  router.get('/cors-info', (req, res) => {
    if (config.isProduction) {
      return res.json({
        message: 'CORS validation is working',
        currentRequest: {
          hasOrigin: !!req.headers.origin
        }
      });
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
   */
  router.post('/logs', (req, res) => {
    const { level, message, context } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }

    const logLevel = ['error', 'warn', 'info', 'debug'].includes(level) ? level : 'info';
    
    logger[logLevel]('Client log', {
      message,
      context,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });

    res.json({ success: true });
  });

  return router;
}

export default createUtilityRoutes;



