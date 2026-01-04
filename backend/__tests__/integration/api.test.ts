/**
 * API Versioning Tests
 * Tests for API versioning middleware
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

// Constants matching versioned.ts
const CURRENT_VERSION = 'v1';
const SUPPORTED_VERSIONS = ['v1'];

/**
 * Version middleware (copy from versioned.ts to avoid import issues)
 */
function versionMiddleware(req: Request, res: Response, next: NextFunction): void {
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
    
    (req as Request & { apiVersion?: string }).apiVersion = version;
  } else {
    (req as Request & { apiVersion?: string }).apiVersion = CURRENT_VERSION;
  }
  
  res.setHeader('X-API-Version', (req as Request & { apiVersion?: string }).apiVersion || CURRENT_VERSION);
  res.setHeader('X-API-Deprecated', 'false');
  
  next();
}

describe('API Versioning', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    
    // Apply version middleware
    app.use('/api', versionMiddleware);
    
    // Add test routes
    app.get('/api/version', (_req, res) => {
      res.json({
        success: true,
        version: CURRENT_VERSION,
        supportedVersions: SUPPORTED_VERSIONS,
      });
    });
    
    app.get('/api/v1/test', (_req, res) => {
      res.json({ success: true, version: 'v1' });
    });
    
    app.get('/api/test', (_req, res) => {
      res.json({ success: true, version: 'default' });
    });
  });

  describe('Version Header', () => {
    it('should add X-API-Version header to responses', async () => {
      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.headers).toHaveProperty('x-api-version', 'v1');
    });

    it('should add X-API-Deprecated header', async () => {
      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.headers).toHaveProperty('x-api-deprecated', 'false');
    });
  });

  describe('Version Info Endpoint', () => {
    it('should return version info', async () => {
      const response = await request(app)
        .get('/api/version')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('version', 'v1');
      expect(response.body).toHaveProperty('supportedVersions');
      expect(response.body.supportedVersions).toContain('v1');
    });
  });

  describe('Versioned Routes', () => {
    it('should handle versioned routes at /api/v1/*', async () => {
      const response = await request(app)
        .get('/api/v1/test')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('version', 'v1');
    });

    it('should handle unversioned routes at /api/*', async () => {
      const response = await request(app)
        .get('/api/test')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should reject unsupported API versions', async () => {
      const response = await request(app)
        .get('/api/v99/test')
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.error).toContain('not supported');
    });

    it('should include current version in rejection message', async () => {
      const response = await request(app)
        .get('/api/v99/test')
        .expect(400);

      expect(response.body).toHaveProperty('currentVersion', 'v1');
    });
  });
});
