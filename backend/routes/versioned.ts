/**
 * API Versioning Router
 * Supports /api/v1/* and /api/* (v1 by default)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { createApiRoutes } from './index.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// Types
interface Dependencies {
  [key: string]: unknown;
}

// Current API version
export const CURRENT_VERSION = 'v1';

// Supported versions (for future expansion)
export const SUPPORTED_VERSIONS = ['v1'];

/**
 * Version extraction middleware
 * Extracts API version from URL and attaches to request
 */
export function versionMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if URL starts with /v{n}/
  const versionMatch = req.path.match(/^\/v(\d+)\//);
  
  if (versionMatch) {
    const version = `v${versionMatch[1]}`;
    
    if (!SUPPORTED_VERSIONS.includes(version)) {
      res.status(400).json({
        success: false,
        error: `API version '${version}' is not supported. Supported versions: ${SUPPORTED_VERSIONS.join(', ')}`,
        currentVersion: CURRENT_VERSION,
      });
      return;
    }
    
    // Attach version to request
    (req as Request & { apiVersion?: string }).apiVersion = version;
  } else {
    // Default to current version
    (req as Request & { apiVersion?: string }).apiVersion = CURRENT_VERSION;
  }
  
  // Add version to response headers
  res.setHeader('X-API-Version', (req as Request & { apiVersion?: string }).apiVersion || CURRENT_VERSION);
  res.setHeader('X-API-Deprecated', 'false');
  
  next();
}

/**
 * Create versioned API routes
 * Supports both /api/v1/* and /api/* (defaults to v1)
 */
export function createVersionedRoutes(deps: Dependencies): Router {
  const router = Router();
  
  // Add version middleware
  router.use(versionMiddleware);
  
  // Version info endpoint
  router.get('/version', (_req: Request, res: Response) => {
    res.json({
      success: true,
      version: CURRENT_VERSION,
      supportedVersions: SUPPORTED_VERSIONS,
      deprecatedVersions: [],
    });
  });
  
  // Create v1 routes
  const v1Routes = createApiRoutes(deps);
  
  // Mount v1 routes at /v1/*
  router.use('/v1', v1Routes);
  
  // Also mount at root for backward compatibility (default to v1)
  // This allows /api/health and /api/v1/health to work the same
  router.use('/', (req: Request, res: Response, next: NextFunction) => {
    // Skip if already handled by versioned routes
    if (req.path.startsWith('/v1') || req.path.startsWith('/v2')) {
      return next();
    }
    
    // Log deprecation warning for unversioned routes in production
    if (config.isProduction) {
      logger.debug('Unversioned API call', {
        path: req.path,
        method: req.method,
        hint: 'Consider using /api/v1/* for better forward compatibility',
      });
    }
    
    // Forward to v1 routes
    v1Routes(req, res, next);
  });
  
  return router;
}

/**
 * Deprecation middleware for future use
 * Marks routes as deprecated and adds sunset headers
 */
export function deprecationMiddleware(
  sunsetDate: Date,
  message: string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-API-Deprecated', 'true');
    res.setHeader('Sunset', sunsetDate.toUTCString());
    res.setHeader('X-Deprecation-Notice', message);
    
    logger.warn('Deprecated API endpoint accessed', {
      path: req.path,
      method: req.method,
      sunsetDate: sunsetDate.toISOString(),
    });
    
    next();
  };
}

export default {
  createVersionedRoutes,
  versionMiddleware,
  deprecationMiddleware,
  CURRENT_VERSION,
  SUPPORTED_VERSIONS,
};

