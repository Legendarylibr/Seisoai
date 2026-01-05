/**
 * Static routes
 * robots.txt, favicon, metrics
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import config from '../config/env';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  [key: string]: unknown;
}

interface MetricsResponse {
  uptime: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
  database: string;
  nodeVersion: string;
  env: string;
  userCount?: number | string;
}

export function createStaticRoutes(deps: Dependencies = {}) {
  const router = Router();

  /**
   * Metrics endpoint
   * GET /api/metrics
   */
  router.get('/metrics', async (req: Request, res: Response) => {
    try {
      const dbState = mongoose.connection.readyState;
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();

      const metrics: MetricsResponse = {
        uptime: Math.floor(uptime),
        memory: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          rss: Math.round(memoryUsage.rss / 1024 / 1024)
        },
        database: dbState === 1 ? 'connected' : 'disconnected',
        nodeVersion: process.version,
        env: config.NODE_ENV || 'development'
      };

      // Add user count if DB connected
      if (dbState === 1) {
        try {
          const User = mongoose.model<IUser>('User');
          metrics.userCount = await User.countDocuments();
        } catch (e) {
          metrics.userCount = 'unavailable';
        }
      }

      res.json(metrics);
    } catch (error) {
      const err = error as Error;
      logger.error('Metrics error', { error: err.message });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  });

  /**
   * Home redirect (non-API)
   * GET /
   */
  router.get('/', (req: Request, res: Response, next: NextFunction) => {
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




