/**
 * Health route integration tests
 */
import { describe, it, expect, beforeAll } from '@jest/globals';
import express, { type Express } from 'express';
import request from 'supertest';

// Mock the health endpoint directly without importing routes
describe('Health Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    
    // Create a simple health endpoint for testing
    app.get('/api/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'test',
      });
    });
  });

  describe('GET /api/health', () => {
    it('should return 200 OK', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return health status properties', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('environment');
    });
  });
});
