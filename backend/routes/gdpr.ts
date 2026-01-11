/**
 * GDPR Compliance Routes
 * Data Subject Access Requests (DSAR) endpoints
 * 
 * Implements:
 * - Right to Access (Article 15) - Data export
 * - Right to Erasure (Article 17) - Data deletion
 * - Right to Rectification (Article 16) - Data correction
 * - Right to Data Portability (Article 20) - Machine-readable export
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import type { IUser } from '../models/User.js';
// Note: decryption is handled automatically by mongoose hooks
import { logAuditEvent, AuditEventType, AuditSeverity } from '../services/auditLog.js';

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authRateLimiter?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  requestId?: string;
}

export function createGDPRRoutes(deps: Dependencies) {
  const router = Router();
  const { authenticateToken, authRateLimiter } = deps;
  
  const limiter = authRateLimiter || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Request data export (GDPR Article 15 & 20)
   * GET /api/gdpr/export
   * 
   * Returns all personal data associated with the user in JSON format
   */
  router.get('/export', limiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user.userId })
        .select('-password') // Never include password
        .lean();

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // Log the data export request
      await logAuditEvent({
        eventType: AuditEventType.DATA_EXPORT_REQUEST,
        severity: AuditSeverity.INFO,
        actor: {
          userId: req.user.userId,
          email: req.user.email,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        action: 'GDPR data export requested',
        outcome: 'success',
        request: {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
        },
      });

      // Prepare the export data
      const exportData = {
        exportDate: new Date().toISOString(),
        exportFormat: 'JSON',
        gdprArticle: 'Article 15 & 20 - Right to Access & Data Portability',
        
        // Identity information
        identity: {
          userId: user.userId,
          email: user.email, // Will be decrypted by mongoose hooks
          walletAddress: user.walletAddress,
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          createdAt: user.createdAt,
          lastActive: user.lastActive,
        },
        
        // Account information
        account: {
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned,
          totalCreditsSpent: user.totalCreditsSpent,
          nftCollections: user.nftCollections,
          settings: user.settings,
        },
        
        // Transaction history
        transactions: {
          paymentHistory: (user.paymentHistory || []).map(p => ({
            type: p.type,
            amount: p.amount,
            credits: p.credits,
            timestamp: p.timestamp,
            // Exclude sensitive payment IDs
          })),
        },
        
        // Content history
        content: {
          generationHistory: (user.generationHistory || []).map(g => ({
            id: g.id,
            prompt: g.prompt, // Will be decrypted
            style: g.style,
            timestamp: g.timestamp,
            creditsUsed: g.creditsUsed,
          })),
          gallery: (user.gallery || []).map(g => ({
            id: g.id,
            prompt: g.prompt, // Will be decrypted
            style: g.style,
            modelType: g.modelType,
            timestamp: g.timestamp,
          })),
        },
        
        // Data processing information
        dataProcessing: {
          purpose: 'AI image/video/music generation service',
          legalBasis: 'Contract performance and legitimate interest',
          retention: 'Account data retained until deletion request or 90 days of inactivity with 0 credits',
          thirdParties: [
            'FAL.ai (AI generation)',
            'Stripe (payment processing)',
            'MongoDB Atlas (data storage)',
          ],
        },
      };

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="seisoai-data-export-${user.userId}.json"`);
      
      res.json({
        success: true,
        data: exportData,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('GDPR export error', { error: err.message, userId: req.user?.userId });
      res.status(500).json({ success: false, error: 'Failed to export data' });
    }
  });

  /**
   * Request data deletion (GDPR Article 17 - Right to Erasure)
   * POST /api/gdpr/delete
   * 
   * Initiates account and data deletion process
   */
  router.post('/delete', limiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { confirmation } = req.body as { confirmation?: string };
      
      // Require explicit confirmation
      if (confirmation !== 'DELETE_MY_ACCOUNT') {
        res.status(400).json({
          success: false,
          error: 'Please confirm deletion by sending { "confirmation": "DELETE_MY_ACCOUNT" }',
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user.userId });

      if (!user) {
        res.status(404).json({ success: false, error: 'User not found' });
        return;
      }

      // Log the deletion request BEFORE deleting
      await logAuditEvent({
        eventType: AuditEventType.DATA_DELETION_REQUEST,
        severity: AuditSeverity.WARNING,
        actor: {
          userId: req.user.userId,
          email: req.user.email,
          walletAddress: req.user.walletAddress,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        target: {
          type: 'user',
          id: req.user.userId,
        },
        action: 'GDPR data deletion requested',
        outcome: 'success',
        metadata: {
          credits: user.credits,
          accountAge: user.createdAt,
        },
        request: {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
        },
        // Retain deletion audit logs for 7 years (legal requirement)
        retentionDays: 2555,
      });

      // Delete the user
      await User.deleteOne({ userId: req.user.userId });

      logger.info('GDPR deletion completed', { userId: req.user.userId });

      res.json({
        success: true,
        message: 'Your account and personal data have been deleted.',
        note: 'Some data may be retained for legal/compliance purposes as outlined in our privacy policy.',
        deletedAt: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('GDPR deletion error', { error: err.message, userId: req.user?.userId });
      
      // Log failed deletion attempt
      await logAuditEvent({
        eventType: AuditEventType.DATA_DELETION_REQUEST,
        severity: AuditSeverity.ERROR,
        actor: {
          userId: req.user?.userId,
          ipAddress: req.ip,
        },
        action: 'GDPR data deletion failed',
        outcome: 'failure',
        reason: err.message,
        request: {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
        },
      });
      
      res.status(500).json({ success: false, error: 'Failed to delete data' });
    }
  });

  /**
   * Update personal data (GDPR Article 16 - Right to Rectification)
   * PUT /api/gdpr/rectify
   * 
   * Allows users to correct their personal information
   */
  router.put('/rectify', limiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const { settings, discordUsername } = req.body as {
        settings?: {
          preferredStyle?: string;
          defaultImageSize?: string;
          enableNotifications?: boolean;
        };
        discordUsername?: string;
      };

      // Only allow updating non-sensitive fields
      const updates: Record<string, unknown> = {};
      
      if (settings) {
        if (settings.preferredStyle) updates['settings.preferredStyle'] = settings.preferredStyle;
        if (settings.defaultImageSize) updates['settings.defaultImageSize'] = settings.defaultImageSize;
        if (typeof settings.enableNotifications === 'boolean') {
          updates['settings.enableNotifications'] = settings.enableNotifications;
        }
      }
      
      if (discordUsername) {
        updates.discordUsername = discordUsername;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          success: false,
          error: 'No valid fields to update',
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      await User.updateOne({ userId: req.user.userId }, { $set: updates });

      // Log the update
      await logAuditEvent({
        eventType: AuditEventType.ACCOUNT_UPDATED,
        severity: AuditSeverity.INFO,
        actor: {
          userId: req.user.userId,
          ipAddress: req.ip,
        },
        action: 'GDPR data rectification',
        outcome: 'success',
        metadata: {
          fieldsUpdated: Object.keys(updates),
        },
        request: {
          requestId: req.requestId,
          method: req.method,
          path: req.path,
        },
      });

      res.json({
        success: true,
        message: 'Personal data updated successfully',
        updatedFields: Object.keys(updates),
      });
    } catch (error) {
      const err = error as Error;
      logger.error('GDPR rectification error', { error: err.message, userId: req.user?.userId });
      res.status(500).json({ success: false, error: 'Failed to update data' });
    }
  });

  /**
   * Get data processing information (GDPR Article 13 & 14)
   * GET /api/gdpr/info
   * 
   * Returns information about how we process user data
   */
  router.get('/info', (_req: Request, res: Response) => {
    res.json({
      success: true,
      dataController: {
        name: 'SeisoAI',
        contact: 'privacy@seisoai.com',
      },
      dataProcessing: {
        purposes: [
          'Providing AI image, video, and music generation services',
          'Processing payments and managing credits',
          'Preventing fraud and abuse',
          'Improving our services',
        ],
        legalBasis: [
          'Contract performance (service delivery)',
          'Legitimate interest (security, fraud prevention)',
          'Consent (marketing, if applicable)',
        ],
        categories: [
          'Identity data (email, wallet address)',
          'Account data (credits, settings)',
          'Transaction data (payment history)',
          'Content data (prompts, generated content)',
          'Technical data (IP address, browser info)',
        ],
        retention: {
          activeAccounts: 'Data retained while account is active',
          inactiveAccounts: '90 days after last activity with 0 credits',
          paymentData: '7 years (legal requirement)',
          auditLogs: '2 years',
        },
        thirdParties: [
          { name: 'FAL.ai', purpose: 'AI model inference', location: 'USA' },
          { name: 'Stripe', purpose: 'Payment processing', location: 'USA' },
          { name: 'MongoDB Atlas', purpose: 'Data storage', location: 'USA/EU' },
          { name: 'Railway', purpose: 'Application hosting', location: 'USA' },
        ],
        rights: [
          'Right to access your data (GET /api/gdpr/export)',
          'Right to delete your data (POST /api/gdpr/delete)',
          'Right to correct your data (PUT /api/gdpr/rectify)',
          'Right to data portability (GET /api/gdpr/export)',
          'Right to object to processing',
          'Right to lodge a complaint with a supervisory authority',
        ],
      },
    });
  });

  return router;
}

export default createGDPRRoutes;
