/**
 * OpenAPI/Swagger Documentation Service
 * Enterprise-grade API documentation
 * 
 * Features:
 * - Auto-generated from JSDoc annotations
 * - Interactive Swagger UI
 * - JSON/YAML export
 */
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Router, type Request, type Response } from 'express';
import config from '../config/env.js';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SeisoAI API',
      version: '1.0.0',
      description: `
# SeisoAI API Documentation

Enterprise AI generation platform for images, videos, and music.

## Authentication

Most endpoints require JWT authentication. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your_jwt_token>
\`\`\`

## Rate Limiting

API requests are rate limited. When limits are exceeded, responses include:
- \`Retry-After\` header with seconds to wait
- \`X-RateLimit-Reset\` header with reset timestamp

## CSRF Protection

State-changing requests (POST, PUT, DELETE) require a CSRF token:
1. Make a GET request to receive \`X-CSRF-Token\` cookie
2. Include the token in \`X-CSRF-Token\` header for subsequent requests

## Support

- Email: support@seisoai.com
- Security: security@seisoai.com
      `,
      contact: {
        name: 'SeisoAI Support',
        email: 'support@seisoai.com',
        url: 'https://seisoai.com',
      },
      license: {
        name: 'Proprietary',
        url: 'https://seisoai.com/terms',
      },
    },
    servers: [
      {
        url: config.isProduction 
          ? 'https://api.seisoai.com' 
          : 'http://localhost:3001',
        description: config.isProduction ? 'Production' : 'Development',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from /api/auth/signin',
        },
        AdminAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Admin-Secret',
          description: 'Admin secret for administrative operations',
        },
        CSRFToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-CSRF-Token',
          description: 'CSRF token for state-changing requests',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error message' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
          },
        },
        User: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            walletAddress: { type: 'string' },
            credits: { type: 'number' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Generation: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            prompt: { type: 'string' },
            style: { type: 'string' },
            modelType: { type: 'string', enum: ['image', 'video', 'music'] },
            status: { type: 'string', enum: ['pending', 'processing', 'completed', 'failed'] },
            result: { type: 'string', format: 'uri' },
            creditsUsed: { type: 'number' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        CreditBalance: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            credits: { type: 'number' },
            tier: { type: 'string', enum: ['free', 'basic', 'pro', 'enterprise'] },
          },
        },
        RateLimitError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Too many requests' },
            retryAfter: { type: 'number', example: 900 },
            retryAfterDate: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: 'Authentication required',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, error: 'Authentication required' },
            },
          },
        },
        Forbidden: {
          description: 'Access denied',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
              example: { success: false, error: 'Access denied' },
            },
          },
        },
        RateLimited: {
          description: 'Rate limit exceeded',
          headers: {
            'Retry-After': {
              schema: { type: 'integer' },
              description: 'Seconds until rate limit resets',
            },
            'X-RateLimit-Reset': {
              schema: { type: 'string', format: 'date-time' },
              description: 'Timestamp when rate limit resets',
            },
          },
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RateLimitError' },
            },
          },
        },
        NotFound: {
          description: 'Resource not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        ValidationError: {
          description: 'Validation error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
    tags: [
      { name: 'Authentication', description: 'User authentication and authorization' },
      { name: 'User', description: 'User profile and account management' },
      { name: 'Generation', description: 'AI content generation (images, videos, music)' },
      { name: 'Gallery', description: 'User content gallery' },
      { name: 'Payments', description: 'Credit purchases and subscriptions' },
      { name: 'GDPR', description: 'Privacy and data management' },
      { name: 'Admin', description: 'Administrative operations' },
      { name: 'Health', description: 'System health and monitoring' },
    ],
  },
  apis: [
    './routes/*.ts',
    './routes/*.js',
  ],
};

// Generate OpenAPI spec
export const openapiSpec = swaggerJsdoc(options);

/**
 * Create OpenAPI documentation routes
 */
export function createOpenApiRoutes(): Router {
  const router = Router();

  // Swagger UI
  router.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'SeisoAI API Documentation',
      customfavIcon: '/favicon.ico',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        showExtensions: true,
        tryItOutEnabled: !config.isProduction,
      },
    })
  );

  // OpenAPI JSON spec
  router.get('/openapi.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(openapiSpec);
  });

  // OpenAPI YAML spec
  router.get('/openapi.yaml', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/yaml');
    const yaml = jsonToYaml(openapiSpec);
    res.send(yaml);
  });

  return router;
}

/**
 * Simple JSON to YAML converter for OpenAPI spec
 */
function jsonToYaml(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (obj === null || obj === undefined) {
    return 'null';
  }
  
  if (typeof obj === 'string') {
    if (obj.includes('\n') || obj.includes(':') || obj.includes('#')) {
      return `|\n${obj.split('\n').map(line => spaces + '  ' + line).join('\n')}`;
    }
    return obj;
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return obj.map(item => {
      const value = jsonToYaml(item, indent + 1);
      if (typeof item === 'object' && item !== null) {
        return `\n${spaces}- ${value.trim()}`;
      }
      return `\n${spaces}- ${value}`;
    }).join('');
  }
  
  if (typeof obj === 'object') {
    const entries = Object.entries(obj);
    if (entries.length === 0) return '{}';
    return entries.map(([key, value]) => {
      const yamlValue = jsonToYaml(value, indent + 1);
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return `\n${spaces}${key}:${yamlValue}`;
      }
      if (Array.isArray(value)) {
        return `\n${spaces}${key}:${yamlValue}`;
      }
      return `\n${spaces}${key}: ${yamlValue}`;
    }).join('');
  }
  
  return String(obj);
}

export default {
  openapiSpec,
  createOpenApiRoutes,
};
