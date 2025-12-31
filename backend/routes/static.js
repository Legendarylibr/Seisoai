/**
 * Static routes
 * robots.txt, favicon, metrics
 */
import { Router } from 'express';
import path from 'path';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import config from '../config/env.js';

export function createStaticRoutes(deps) {
  const router = Router();

  /**
   * Robots.txt
   * GET /robots.txt
   */
  router.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send(`User-agent: *
Allow: /
Sitemap: https://seisoai.com/sitemap.xml`);
  });

  /**
   * Favicon
   * GET /favicon.ico
   */
  router.get('/favicon.ico', (req, res) => {
    res.status(204).end();
  });

  /**
   * Metrics endpoint
   * GET /api/metrics (mounted at /api, so just /metrics here)
   */
  router.get('/metrics', async (req, res) => {
    try {
      const dbState = mongoose.connection.readyState;
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const metrics = {
        uptime: Math.floor(uptime),
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024)
        },
        database: dbState === 1 ? 'connected' : 'disconnected',
        nodeVersion: process.version,
        env: config.NODE_ENV
      };

      // Add user count if DB connected
      if (dbState === 1) {
        try {
          const User = mongoose.model('User');
          metrics.userCount = await User.countDocuments();
        } catch (e) {
          metrics.userCount = 'unavailable';
        }
      }

      res.json(metrics);
    } catch (error) {
      logger.error('Metrics error', { error: error.message });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  /**
   * Home redirect (non-API)
   * GET /
   */
  router.get('/', (req, res, next) => {
    // Skip if this is an API route
    if (req.path.startsWith('/api')) {
      return next();
    }
    
    // In production, let static file handler deal with it
    if (config.isProduction) {
      return next();
    }
    
    res.json({
      message: 'SeisoAI API Server',
      version: '1.0.0',
      health: '/api/health'
    });
  });

  return router;
}

export default createStaticRoutes;

