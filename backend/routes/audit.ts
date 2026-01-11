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
import logger from '../utils/logger.js';
import { 
  queryAuditLogs, 
  verifyAuditLogIntegrity, 
  AuditEventType, 
  AuditSeverity,
  logAuditEvent 
} from '../services/auditLog.js';

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authRateLimiter?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email?: string;
    isAdmin?: boolean;
  };
  requestId?: string;
  correlationId?: string;
}

export function createAuditRoutes(deps: Dependencies) {
  const router = Router();
  const { authRateLimiter } = deps;
  
  const limiter = authRateLimiter || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Admin authentication check
   */
  const requireAdmin = (req: AuthenticatedRequest, res: Response, next: () => void) => {
    const adminSecret = req.headers['x-admin-secret'];
    
    if (adminSecret !== process.env.ADMIN_SECRET) {
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
        limit = '100',
        skip = '0',
      } = req.query as Record<string, string | undefined>;

      const result = await queryAuditLogs({
        userId,
        eventType: eventType as AuditEventType,
        severity: severity as AuditSeverity,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        limit: Math.min(parseInt(limit, 10), 1000),
        skip: parseInt(skip, 10),
      });

      res.json({
        success: true,
        logs: result.logs,
        total: result.total,
        limit: parseInt(limit, 10),
        skip: parseInt(skip, 10),
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
        limit: 10000, // Max export size
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
