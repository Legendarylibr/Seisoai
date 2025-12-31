/**
 * Health & Utility Routes
 * Simple endpoints for monitoring and debugging
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';

/**
 * Create health routes with dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.dbCircuitBreaker - Database circuit breaker (optional)
 */
export const createHealthRoutes = (deps = {}) => {
  const router = Router();
  const { dbCircuitBreaker } = deps;

  /**
   * Health check endpoint
   * GET /api/health
   */
  router.get('/health', (req, res) => {
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
      logger.error('Health check error', { error: error.message });
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
  router.get('/cors-info', (req, res) => {
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
};

/**
 * Create robots.txt route (standalone, no dependencies)
 */
export const createRobotsRoute = () => {
  const router = Router();
  
  router.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Disallow: /api/
Sitemap: https://seisoai.com/sitemap.xml`);
  });

  return router;
};

export default { createHealthRoutes, createRobotsRoute };
