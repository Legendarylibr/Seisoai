/**
 * Audit Log Export Routes
 * Enterprise compliance reporting
 * 
 * Features:
 * - Export audit logs as JSON/CSV
 * - Filter by date range, event type, user
 * - Integrity verification
 * - Admin-only access
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { 
  queryAuditLogs, 
  verifyAuditLogIntegrity, 
  AuditEventType, 
  AuditSeverity,
  logAuditEvent 
} from '../services/auditLog.js';

// Pagination limits - prevent DoS via large offsets
const PAGINATION = {
  MAX_LIMIT: 1000,      // Maximum records per request
  MAX_SKIP: 100000,     // Maximum offset (100k records deep)
  DEFAULT_LIMIT: 100,
  DEFAULT_SKIP: 0,
  MAX_EXPORT: 10000,    // Maximum export size
} as const;

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authRateLimiter?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    walletAddress?: string;
    isAdmin?: boolean;
  };
  requestId?: string;
  correlationId?: string;
}

/**
 * Safely parse pagination parameters with validation
 */
function parsePaginationParams(limitStr: string | undefined, skipStr: string | undefined): {
  limit: number;
  skip: number;
} {
  let limit = parseInt(limitStr || String(PAGINATION.DEFAULT_LIMIT), 10);
  let skip = parseInt(skipStr || String(PAGINATION.DEFAULT_SKIP), 10);
  
  // Handle NaN and negative values
  if (isNaN(limit) || limit < 1) limit = PAGINATION.DEFAULT_LIMIT;
  if (isNaN(skip) || skip < 0) skip = PAGINATION.DEFAULT_SKIP;
  
  // Enforce maximum caps
  limit = Math.min(limit, PAGINATION.MAX_LIMIT);
  skip = Math.min(skip, PAGINATION.MAX_SKIP);
  
  return { limit, skip };
}

export function createAuditRoutes(deps: Dependencies) {
  const router = Router();
  const { authRateLimiter } = deps;
  
  const limiter = authRateLimiter || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Admin authentication check
   * SECURITY FIX: Use constant-time comparison to prevent timing attacks
   */
  const requireAdmin = (req: AuthenticatedRequest, res: Response, next: () => void) => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET;
    const adminSecret = req.headers['x-admin-secret'];
    
    // SECURITY: Fail if admin secret is not configured
    if (!ADMIN_SECRET || ADMIN_SECRET.length < 32) {
      logger.error('Audit admin access attempted but ADMIN_SECRET is not properly configured');
      res.status(503).json({ success: false, error: 'Admin functionality not available' });
      return;
    }
    
    if (!adminSecret || typeof adminSecret !== 'string') {
      logger.warn('Failed audit admin authentication - no secret provided', { 
        ip: req.ip,
        path: req.path 
      });
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    
    // SECURITY FIX: Use constant-time comparison to prevent timing attacks
    let isValid = false;
    if (adminSecret.length === ADMIN_SECRET.length) {
      try {
        const providedBuffer = Buffer.from(adminSecret, 'utf8');
        const secretBuffer = Buffer.from(ADMIN_SECRET, 'utf8');
        isValid = crypto.timingSafeEqual(providedBuffer, secretBuffer);
      } catch {
        isValid = false;
      }
    }
    
    if (!isValid) {
      logger.warn('Failed audit admin authentication', { 
        ip: req.ip,
        path: req.path 
      });
      res.status(403).json({ success: false, error: 'Admin access required' });
      return;
    }
    
    next();
  };

  /**
   * @openapi
   * /api/audit/logs:
   *   get:
   *     summary: Query audit logs
   *     tags: [Admin, Audit]
   *     security:
   *       - AdminAuth: []
   *     parameters:
   *       - name: userId
   *         in: query
   *         schema:
   *           type: string
   *       - name: eventType
   *         in: query
   *         schema:
   *           type: string
   *       - name: severity
   *         in: query
   *         schema:
   *           type: string
   *           enum: [INFO, WARNING, ERROR, CRITICAL]
   *       - name: startDate
   *         in: query
   *         schema:
   *           type: string
   *           format: date-time
   *       - name: endDate
   *         in: query
   *         schema:
   *           type: string
   *           format: date-time
   *       - name: limit
   *         in: query
   *         schema:
   *           type: integer
   *           default: 100
   *       - name: skip
   *         in: query
   *         schema:
   *           type: integer
   *           default: 0
   *     responses:
   *       200:
   *         description: Audit logs retrieved
   */
  router.get('/logs', limiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        userId,
        eventType,
        severity,
        startDate,
        endDate,
        limit: limitStr,
        skip: skipStr,
      } = req.query as Record<string, string | undefined>;

      // SECURITY FIX: Use safe pagination parsing with max caps
      const { limit, skip } = parsePaginationParams(limitStr, skipStr);

      const result = await queryAuditLogs({
        userId,
        eventType: eventType as AuditEventType,
        severity: severity as AuditSeverity,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit,
        skip,
      });

      res.json({
        success: true,
        logs: result.logs,
        total: result.total,
        limit,
        skip,
        maxSkip: PAGINATION.MAX_SKIP, // Inform client of limits
        maxLimit: PAGINATION.MAX_LIMIT,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error querying audit logs', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to query audit logs' });
    }
  });

  /**
   * @openapi
   * /api/audit/export:
   *   get:
   *     summary: Export audit logs as JSON or CSV
   *     tags: [Admin, Audit]
   *     security:
   *       - AdminAuth: []
   *     parameters:
   *       - name: format
   *         in: query
   *         schema:
   *           type: string
   *           enum: [json, csv]
   *           default: json
   *       - name: startDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *           format: date-time
   *       - name: endDate
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *           format: date-time
   *     responses:
   *       200:
   *         description: Audit log export
   */
  router.get('/export', limiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const {
        format = 'json',
        startDate,
        endDate,
        eventType,
        severity,
      } = req.query as Record<string, string | undefined>;

      if (!startDate || !endDate) {
        res.status(400).json({ 
          success: false, 
          error: 'startDate and endDate are required' 
        });
        return;
      }

      // Log the export request
      await logAuditEvent({
        eventType: AuditEventType.DATA_ACCESS_SENSITIVE,
        severity: AuditSeverity.INFO,
        actor: {
          ipAddress: req.ip,
        },
        action: 'Audit log export',
        outcome: 'success',
        metadata: {
          format,
          startDate,
          endDate,
        },
        request: {
          requestId: req.requestId,
          correlationId: req.correlationId,
        },
      });

      const result = await queryAuditLogs({
        eventType: eventType as AuditEventType,
        severity: severity as AuditSeverity,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        limit: PAGINATION.MAX_EXPORT, // Max export size
      });

      if (format === 'csv') {
        // Generate CSV
        const headers = [
          'timestamp',
          'eventType',
          'severity',
          'action',
          'outcome',
          'userId',
          'ipAddress',
          'requestId',
          'reason',
        ];

        const csvRows = [headers.join(',')];
        
        for (const log of result.logs) {
          const row = [
            log.timestamp.toISOString(),
            log.eventType,
            log.severity,
            `"${(log.details?.action || '').replace(/"/g, '""')}"`,
            log.details?.outcome,
            log.actor?.userId || '',
            log.actor?.ipAddress || '',
            log.request?.requestId || '',
            `"${(log.details?.reason || '').replace(/"/g, '""')}"`,
          ];
          csvRows.push(row.join(','));
        }

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 
          `attachment; filename="audit-logs-${startDate}-${endDate}.csv"`);
        res.send(csvRows.join('\n'));
      } else {
        // JSON export
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 
          `attachment; filename="audit-logs-${startDate}-${endDate}.json"`);
        res.json({
          exportDate: new Date().toISOString(),
          dateRange: { startDate, endDate },
          totalRecords: result.total,
          logs: result.logs,
        });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Error exporting audit logs', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to export audit logs' });
    }
  });

  /**
   * @openapi
   * /api/audit/verify:
   *   get:
   *     summary: Verify audit log integrity
   *     tags: [Admin, Audit]
   *     security:
   *       - AdminAuth: []
   *     parameters:
   *       - name: startSequence
   *         in: query
   *         schema:
   *           type: integer
   *       - name: endSequence
   *         in: query
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Integrity verification result
   */
  router.get('/verify', limiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { startSequence, endSequence } = req.query as Record<string, string | undefined>;

      const result = await verifyAuditLogIntegrity(
        startSequence ? parseInt(startSequence, 10) : undefined,
        endSequence ? parseInt(endSequence, 10) : undefined
      );

      res.json({
        success: true,
        verification: {
          valid: result.valid,
          recordsChecked: result.checked,
          errors: result.errors,
          verifiedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error verifying audit logs', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to verify audit logs' });
    }
  });

  /**
   * @openapi
   * /api/audit/event-types:
   *   get:
   *     summary: List available audit event types
   *     tags: [Admin, Audit]
   *     security:
   *       - AdminAuth: []
   *     responses:
   *       200:
   *         description: List of event types
   */
  router.get('/event-types', requireAdmin, (_req: Request, res: Response) => {
    res.json({
      success: true,
      eventTypes: Object.values(AuditEventType),
      severities: Object.values(AuditSeverity),
    });
  });

  return router;
}

export default createAuditRoutes;
