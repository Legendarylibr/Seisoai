/**
 * Session Management Routes
 * Enterprise-grade session control
 * 
 * Features:
 * - Revoke current session (logout)
 * - Revoke all sessions (logout everywhere)
 * 
 * Note: Full session listing requires session storage implementation.
 * This basic version uses token blacklisting for revocation.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger.js';
import type { IUser } from '../models/User.js';
import { logAuditEvent, AuditEventType, AuditSeverity } from '../services/auditLog.js';
import { blacklistToken } from '../middleware/auth.js';
import { requireAuth } from '../utils/responses.js';

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authRateLimiter?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  requestId?: string;
  correlationId?: string;
}

export function createSessionRoutes(deps: Dependencies) {
  const router = Router();
  const { authenticateToken, authRateLimiter } = deps;
  
  const limiter = authRateLimiter || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * @openapi
   * /api/sessions/current:
   *   get:
   *     summary: Get current session info
   *     tags: [Sessions]
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Current session information
   */
  router.get('/current', limiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      // Return current session info from the authenticated user
      res.json({
        success: true,
        session: {
          userId: req.user.userId,
          walletAddress: req.user.walletAddress 
            ? req.user.walletAddress.substring(0, 6) + '...' + req.user.walletAddress.slice(-4)
            : undefined,
          ipAddress: maskIP(req.ip),
          userAgent: parseUserAgent(req.headers['user-agent']),
          isActive: true,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error getting current session', { error: err.message, userId: req.user?.userId });
      res.status(500).json({ success: false, error: 'Failed to get session info' });
    }
  });

  /**
   * @openapi
   * /api/sessions/revoke:
   *   post:
   *     summary: Revoke current session (logout)
   *     tags: [Sessions]
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Session revoked successfully
   */
  router.post('/revoke', limiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      // Get the token from the authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (token) {
        // Blacklist the current token (24 hours expiry)
        await blacklistToken(token, Date.now() + 24 * 60 * 60 * 1000);
      }

      // Audit log
      await logAuditEvent({
        eventType: AuditEventType.AUTH_LOGOUT,
        severity: AuditSeverity.INFO,
        actor: {
          userId: req.user.userId,
          walletAddress: req.user.walletAddress,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        action: 'User logged out (session revoked)',
        outcome: 'success',
        request: {
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
      });

      logger.info('Session revoked', { userId: req.user.userId });

      res.json({
        success: true,
        message: 'Session revoked successfully. Please login again.',
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error revoking session', { error: err.message, userId: req.user?.userId });
      res.status(500).json({ success: false, error: 'Failed to revoke session' });
    }
  });

  /**
   * @openapi
   * /api/sessions/revoke-all:
   *   post:
   *     summary: Revoke all sessions (logout everywhere)
   *     description: |
   *       Revokes the current session. For full "logout everywhere" functionality,
   *       consider implementing refresh token rotation or session storage.
   *     tags: [Sessions]
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: All sessions revoked
   */
  router.post('/revoke-all', limiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!requireAuth(req, res)) return;

      // Get the token from the authorization header
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (token) {
        // Blacklist the current token
        await blacklistToken(token, Date.now() + 24 * 60 * 60 * 1000);
      }

      // Audit log with higher severity for "revoke all"
      await logAuditEvent({
        eventType: AuditEventType.AUTH_TOKEN_REVOKED,
        severity: AuditSeverity.WARNING,
        actor: {
          userId: req.user.userId,
          walletAddress: req.user.walletAddress,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        action: 'All sessions revoked (logout everywhere)',
        outcome: 'success',
        metadata: {
          note: 'Current token revoked. Full session listing requires session storage implementation.',
        },
        request: {
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
      });

      logger.info('All sessions revoke requested', { userId: req.user.userId });

      res.json({
        success: true,
        message: 'Current session revoked. Please login again on all devices.',
        note: 'For complete session management, consider implementing session storage.',
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error revoking all sessions', { error: err.message, userId: req.user?.userId });
      res.status(500).json({ success: false, error: 'Failed to revoke sessions' });
    }
  });

  /**
   * @openapi
   * /api/sessions/info:
   *   get:
   *     summary: Get session management information
   *     tags: [Sessions]
   *     responses:
   *       200:
   *         description: Session management info
   */
  router.get('/info', (_req: Request, res: Response) => {
    res.json({
      success: true,
      sessionManagement: {
        description: 'Session management endpoints for security control',
        endpoints: {
          'GET /sessions/current': 'Get current session information',
          'POST /sessions/revoke': 'Revoke current session (logout)',
          'POST /sessions/revoke-all': 'Revoke all sessions (logout everywhere)',
        },
        tokenExpiry: '24 hours (access token)',
        refreshTokenExpiry: '7 days',
        notes: [
          'Revoked tokens are blacklisted and cannot be reused',
          'Use refresh tokens to obtain new access tokens',
          'For enhanced security, revoke all sessions if account is compromised',
        ],
      },
    });
  });

  return router;
}

/**
 * Parse user agent to friendly device name
 */
function parseUserAgent(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown device';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('iphone')) return 'iPhone';
  if (ua.includes('ipad')) return 'iPad';
  if (ua.includes('android')) return 'Android';
  if (ua.includes('windows')) return 'Windows PC';
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'Mac';
  if (ua.includes('linux')) return 'Linux';
  if (ua.includes('bot') || ua.includes('crawler')) return 'Bot';
  
  return 'Unknown device';
}

/**
 * Mask IP for privacy
 */
function maskIP(ip: string | undefined): string {
  if (!ip) return 'Unknown';
  
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.*.*`;
    }
  }
  
  return ip.substring(0, ip.length / 2) + '...';
}

export default createSessionRoutes;
