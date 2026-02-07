/**
 * API Key Management Routes
 * CRUD operations for agent API keys
 * Allows users to create, list, update, and revoke API keys for external agents
 * 
 * SECURITY: Webhook URLs are validated to prevent data exfiltration attacks.
 * Only HTTPS URLs to verified public domains are allowed.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { isValidWebhookUrl } from '../utils/validation';
import { createApiKeyCreationLimiter } from '../middleware/rateLimiter';
import { logAuditEvent, AuditEventType, AuditSeverity } from '../services/auditLog';
import type { IApiKey } from '../models/ApiKey';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authenticateFlexible: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

// SECURITY: Rate limiter for API key creation
const apiKeyCreationLimiter = createApiKeyCreationLimiter();

export default function createApiKeyRoutes(deps: Dependencies): Router {
  const router = Router();
  const { authenticateToken } = deps;

  /**
   * POST /api/api-keys
   * Create a new API key
   * SECURITY: Rate limited to prevent abuse
   */
  router.post('/', apiKeyCreationLimiter, authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const {
        name,
        credits,
        rateLimitPerMinute,
        rateLimitPerDay,
        allowedCategories,
        allowedTools,
        webhookUrl,
        expiresInDays,
        ipAllowlist,
      } = req.body;

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Key name is required' });
      }

      if (name.length > 100) {
        return res.status(400).json({ success: false, error: 'Key name must be 100 characters or less' });
      }

      // SECURITY: Validate webhook URL to prevent data exfiltration
      if (webhookUrl) {
        const webhookValidation = isValidWebhookUrl(webhookUrl);
        if (!webhookValidation.valid) {
          logger.warn('API key creation blocked - invalid webhook URL', {
            userId: user.userId,
            error: webhookValidation.error,
            webhookUrl: String(webhookUrl).substring(0, 100),
          });

          // SECURITY: Audit log blocked webhook attempt
          await logAuditEvent({
            eventType: AuditEventType.API_KEY_WEBHOOK_BLOCKED,
            severity: AuditSeverity.WARNING,
            actor: {
              userId: user.userId,
              walletAddress: user.walletAddress,
              ipAddress: req.ip,
              userAgent: req.headers['user-agent'],
            },
            action: 'API key webhook URL blocked',
            outcome: 'blocked',
            metadata: {
              error: webhookValidation.error,
              webhookUrlPreview: String(webhookUrl).substring(0, 100),
            },
          }).catch(err => logger.warn('Failed to log webhook blocked audit event', { error: err.message }));

          return res.status(400).json({
            success: false,
            error: `Invalid webhook URL: ${webhookValidation.error}`,
            securityNote: 'Webhook URLs must use HTTPS and point to a public domain. Private IPs, localhost, and raw IP addresses are not allowed.',
          });
        }
      }

      // Check max keys per user (limit to 10)
      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const existingKeyCount = await ApiKey.countDocuments({ ownerId: user.userId, active: true });
      if (existingKeyCount >= 10) {
        return res.status(400).json({
          success: false,
          error: 'Maximum 10 active API keys per account',
        });
      }

      // Calculate credits to transfer from user account to API key
      const creditsToAllocate = credits ? Math.min(credits, user.credits) : 0;

      // Deduct credits from user if allocating to API key
      if (creditsToAllocate > 0) {
        const User = mongoose.model<IUser>('User');
        const updated = await User.findOneAndUpdate(
          { userId: user.userId, credits: { $gte: creditsToAllocate } },
          { $inc: { credits: -creditsToAllocate } },
          { new: true }
        );
        if (!updated) {
          return res.status(400).json({ success: false, error: 'Insufficient credits to allocate' });
        }
      }

      // Calculate expiration
      let expiresAt: Date | undefined;
      if (expiresInDays && typeof expiresInDays === 'number' && expiresInDays > 0) {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      }

      const { rawKey, apiKey } = await (ApiKey as any).generateKey({
        name: name.trim(),
        ownerId: user.userId!,
        ownerWallet: user.walletAddress,
        credits: creditsToAllocate,
        rateLimitPerMinute: rateLimitPerMinute || 60,
        rateLimitPerDay: rateLimitPerDay || 10000,
        allowedCategories: allowedCategories || [],
        allowedTools: allowedTools || [],
        webhookUrl,
        expiresAt,
        ipAllowlist: ipAllowlist || [],
      });

      logger.info('API key created', {
        userId: user.userId,
        keyPrefix: apiKey.keyPrefix,
        name: apiKey.name,
        credits: creditsToAllocate,
      });

      // SECURITY: Audit log API key creation
      await logAuditEvent({
        eventType: AuditEventType.API_KEY_CREATED,
        severity: AuditSeverity.INFO,
        actor: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        target: {
          type: 'api_key',
          id: apiKey.keyPrefix,
          description: `API key: ${apiKey.name}`,
        },
        action: 'API key created',
        outcome: 'success',
        metadata: {
          keyPrefix: apiKey.keyPrefix,
          name: apiKey.name,
          credits: creditsToAllocate,
          hasWebhook: !!webhookUrl,
          rateLimitPerMinute: apiKey.rateLimitPerMinute,
          rateLimitPerDay: apiKey.rateLimitPerDay,
        },
      }).catch(err => logger.warn('Failed to log API key creation audit event', { error: err.message }));

      res.status(201).json({
        success: true,
        message: 'API key created successfully. Save the key now - it cannot be shown again.',
        apiKey: {
          id: apiKey._id,
          key: rawKey, // Only returned once at creation time!
          keyPrefix: apiKey.keyPrefix,
          name: apiKey.name,
          credits: apiKey.credits,
          rateLimitPerMinute: apiKey.rateLimitPerMinute,
          rateLimitPerDay: apiKey.rateLimitPerDay,
          allowedCategories: apiKey.allowedCategories,
          allowedTools: apiKey.allowedTools,
          webhookUrl: apiKey.webhookUrl,
          expiresAt: apiKey.expiresAt,
          ipAllowlist: apiKey.ipAllowlist,
          createdAt: apiKey.createdAt,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to create API key', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to create API key' });
    }
  });

  /**
   * GET /api/api-keys
   * List all API keys for the authenticated user
   */
  router.get('/', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const keys = await ApiKey.find({ ownerId: user.userId })
        .select('-keyHash -webhookSecret')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        keys: keys.map(k => ({
          id: k._id,
          keyPrefix: k.keyPrefix,
          name: k.name,
          credits: k.credits,
          totalCreditsLoaded: k.totalCreditsLoaded,
          totalCreditsSpent: k.totalCreditsSpent,
          rateLimitPerMinute: k.rateLimitPerMinute,
          rateLimitPerDay: k.rateLimitPerDay,
          allowedCategories: k.allowedCategories,
          allowedTools: k.allowedTools,
          webhookUrl: k.webhookUrl,
          active: k.active,
          lastUsedAt: k.lastUsedAt,
          totalRequests: k.totalRequests,
          expiresAt: k.expiresAt,
          ipAllowlist: k.ipAllowlist,
          createdAt: k.createdAt,
          usageByTool: k.usageByTool,
        })),
        count: keys.length,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to list API keys', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to list API keys' });
    }
  });

  /**
   * GET /api/api-keys/:keyId
   * Get details for a specific API key
   */
  router.get('/:keyId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const key = await ApiKey.findOne({ _id: req.params.keyId, ownerId: user.userId })
        .select('-keyHash -webhookSecret');

      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }

      res.json({
        success: true,
        key: {
          id: key._id,
          keyPrefix: key.keyPrefix,
          name: key.name,
          credits: key.credits,
          totalCreditsLoaded: key.totalCreditsLoaded,
          totalCreditsSpent: key.totalCreditsSpent,
          rateLimitPerMinute: key.rateLimitPerMinute,
          rateLimitPerDay: key.rateLimitPerDay,
          allowedCategories: key.allowedCategories,
          allowedTools: key.allowedTools,
          webhookUrl: key.webhookUrl,
          active: key.active,
          lastUsedAt: key.lastUsedAt,
          totalRequests: key.totalRequests,
          expiresAt: key.expiresAt,
          ipAllowlist: key.ipAllowlist,
          createdAt: key.createdAt,
          usageByTool: key.usageByTool,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to get API key', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to get API key' });
    }
  });

  /**
   * PUT /api/api-keys/:keyId
   * Update an API key's settings
   */
  router.put('/:keyId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const {
        name,
        rateLimitPerMinute,
        rateLimitPerDay,
        allowedCategories,
        allowedTools,
        webhookUrl,
        ipAllowlist,
        active,
      } = req.body;

      // SECURITY: Validate webhook URL if provided
      if (webhookUrl !== undefined && webhookUrl !== null && webhookUrl !== '') {
        const webhookValidation = isValidWebhookUrl(webhookUrl);
        if (!webhookValidation.valid) {
          logger.warn('API key update blocked - invalid webhook URL', {
            userId: user.userId,
            keyId: req.params.keyId,
            error: webhookValidation.error,
            webhookUrl: String(webhookUrl).substring(0, 100),
          });
          return res.status(400).json({
            success: false,
            error: `Invalid webhook URL: ${webhookValidation.error}`,
            securityNote: 'Webhook URLs must use HTTPS and point to a public domain. Private IPs, localhost, and raw IP addresses are not allowed.',
          });
        }
      }

      const updateFields: Record<string, unknown> = {};
      if (name !== undefined) updateFields.name = name.trim();
      if (rateLimitPerMinute !== undefined) updateFields.rateLimitPerMinute = rateLimitPerMinute;
      if (rateLimitPerDay !== undefined) updateFields.rateLimitPerDay = rateLimitPerDay;
      if (allowedCategories !== undefined) updateFields.allowedCategories = allowedCategories;
      if (allowedTools !== undefined) updateFields.allowedTools = allowedTools;
      if (webhookUrl !== undefined) updateFields.webhookUrl = webhookUrl;
      if (ipAllowlist !== undefined) updateFields.ipAllowlist = ipAllowlist;
      if (active !== undefined) updateFields.active = active;

      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const key = await ApiKey.findOneAndUpdate(
        { _id: req.params.keyId, ownerId: user.userId },
        { $set: updateFields },
        { new: true }
      ).select('-keyHash -webhookSecret');

      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }

      logger.info('API key updated', {
        userId: user.userId,
        keyPrefix: key.keyPrefix,
        fields: Object.keys(updateFields),
      });

      res.json({
        success: true,
        key: {
          id: key._id,
          keyPrefix: key.keyPrefix,
          name: key.name,
          active: key.active,
          rateLimitPerMinute: key.rateLimitPerMinute,
          rateLimitPerDay: key.rateLimitPerDay,
          allowedCategories: key.allowedCategories,
          allowedTools: key.allowedTools,
          webhookUrl: key.webhookUrl,
          ipAllowlist: key.ipAllowlist,
        },
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to update API key', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to update API key' });
    }
  });

  /**
   * POST /api/api-keys/:keyId/top-up
   * Add credits to an API key from user's balance
   */
  router.post('/:keyId/top-up', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const { credits } = req.body;
      if (!credits || typeof credits !== 'number' || credits <= 0) {
        return res.status(400).json({ success: false, error: 'Credits must be a positive number' });
      }

      if (credits > user.credits) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient account credits',
          available: user.credits,
          requested: credits,
        });
      }

      // Deduct from user
      const User = mongoose.model<IUser>('User');
      const updatedUser = await User.findOneAndUpdate(
        { userId: user.userId, credits: { $gte: credits } },
        { $inc: { credits: -credits } },
        { new: true }
      );

      if (!updatedUser) {
        return res.status(400).json({ success: false, error: 'Insufficient credits' });
      }

      // Add to API key
      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const key = await ApiKey.findOneAndUpdate(
        { _id: req.params.keyId, ownerId: user.userId, active: true },
        { $inc: { credits: credits, totalCreditsLoaded: credits } },
        { new: true }
      ).select('-keyHash -webhookSecret');

      if (!key) {
        // Refund user if key not found
        await User.findOneAndUpdate(
          { userId: user.userId },
          { $inc: { credits: credits } }
        );
        return res.status(404).json({ success: false, error: 'API key not found' });
      }

      logger.info('API key topped up', {
        userId: user.userId,
        keyPrefix: key.keyPrefix,
        credits,
        newBalance: key.credits,
      });

      res.json({
        success: true,
        key: {
          id: key._id,
          keyPrefix: key.keyPrefix,
          credits: key.credits,
          totalCreditsLoaded: key.totalCreditsLoaded,
        },
        userCreditsRemaining: updatedUser.credits,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to top up API key', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to top up' });
    }
  });

  /**
   * DELETE /api/api-keys/:keyId
   * Revoke (deactivate) an API key and return remaining credits
   */
  router.delete('/:keyId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const key = await ApiKey.findOne({ _id: req.params.keyId, ownerId: user.userId });

      if (!key) {
        return res.status(404).json({ success: false, error: 'API key not found' });
      }

      const remainingCredits = key.credits;

      // Deactivate the key
      key.active = false;
      key.credits = 0;
      await key.save();

      // Return remaining credits to user
      if (remainingCredits > 0) {
        const User = mongoose.model<IUser>('User');
        await User.findOneAndUpdate(
          { userId: user.userId },
          { $inc: { credits: remainingCredits } }
        );
      }

      logger.info('API key revoked', {
        userId: user.userId,
        keyPrefix: key.keyPrefix,
        creditsReturned: remainingCredits,
      });

      // SECURITY: Audit log API key revocation
      await logAuditEvent({
        eventType: AuditEventType.API_KEY_REVOKED,
        severity: AuditSeverity.INFO,
        actor: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        target: {
          type: 'api_key',
          id: key.keyPrefix,
          description: `API key: ${key.name}`,
        },
        action: 'API key revoked',
        outcome: 'success',
        metadata: {
          keyPrefix: key.keyPrefix,
          creditsReturned: remainingCredits,
        },
      }).catch(err => logger.warn('Failed to log API key revocation audit event', { error: err.message }));

      res.json({
        success: true,
        message: 'API key revoked',
        creditsReturned: remainingCredits,
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Failed to revoke API key', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to revoke API key' });
    }
  });

  return router;
}
