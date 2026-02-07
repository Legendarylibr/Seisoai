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

/**
 * SECURITY: Validate that a string is a valid MongoDB ObjectId
 * Prevents MongoDB CastError and potential injection
 */
function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id) && new mongoose.Types.ObjectId(id).toString() === id;
}

/**
 * SECURITY: Validate rate limit values are within acceptable bounds
 */
function validateRateLimits(perMinute?: unknown, perDay?: unknown): { valid: boolean; error?: string } {
  if (perMinute !== undefined) {
    if (typeof perMinute !== 'number' || !Number.isInteger(perMinute) || perMinute < 1 || perMinute > 1000) {
      return { valid: false, error: 'rateLimitPerMinute must be an integer between 1 and 1000' };
    }
  }
  if (perDay !== undefined) {
    if (typeof perDay !== 'number' || !Number.isInteger(perDay) || perDay < 1 || perDay > 1000000) {
      return { valid: false, error: 'rateLimitPerDay must be an integer between 1 and 1,000,000' };
    }
  }
  return { valid: true };
}

/**
 * SECURITY: Validate IP allowlist entries are valid IPv4/IPv6 addresses or CIDR ranges
 */
function validateIpAllowlist(ips: unknown): { valid: boolean; error?: string } {
  if (!Array.isArray(ips)) {
    return { valid: false, error: 'ipAllowlist must be an array' };
  }
  if (ips.length > 50) {
    return { valid: false, error: 'ipAllowlist cannot exceed 50 entries' };
  }
  // IPv4, IPv6, and CIDR notation
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}(\/\d{1,3})?$/;
  for (const ip of ips) {
    if (typeof ip !== 'string' || ip.length > 45) {
      return { valid: false, error: `Invalid IP address entry: must be a string` };
    }
    if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
      return { valid: false, error: `Invalid IP address format: ${ip}` };
    }
  }
  return { valid: true };
}

/**
 * SECURITY: Validate allowedTools and allowedCategories are arrays of safe strings
 */
function validateStringArray(arr: unknown, fieldName: string, maxLength = 100, maxItems = 50): { valid: boolean; error?: string } {
  if (!Array.isArray(arr)) {
    return { valid: false, error: `${fieldName} must be an array` };
  }
  if (arr.length > maxItems) {
    return { valid: false, error: `${fieldName} cannot exceed ${maxItems} items` };
  }
  for (const item of arr) {
    if (typeof item !== 'string' || item.length === 0 || item.length > maxLength) {
      return { valid: false, error: `${fieldName} entries must be non-empty strings (max ${maxLength} chars)` };
    }
    // Only allow alphanumeric, dots, hyphens, underscores (tool IDs / category names)
    if (!/^[a-zA-Z0-9._-]+$/.test(item)) {
      return { valid: false, error: `${fieldName} entry contains invalid characters: ${item}` };
    }
  }
  return { valid: true };
}

export default function createApiKeyRoutes(deps: Dependencies): Router {
  const router = Router();
  const { authenticateToken } = deps;

  /**
   * POST /api/api-keys
   * Create a new API key
   * SECURITY: Rate limited to prevent abuse, auth runs first so rate limiter can use userId
   */
  router.post('/', authenticateToken, apiKeyCreationLimiter, async (req: AuthenticatedRequest, res: Response) => {
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

      // --- Input validation ---

      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Key name is required' });
      }

      if (name.trim().length > 100) {
        return res.status(400).json({ success: false, error: 'Key name must be 100 characters or less' });
      }

      // SECURITY: Validate rate limits
      const rateLimitCheck = validateRateLimits(rateLimitPerMinute, rateLimitPerDay);
      if (!rateLimitCheck.valid) {
        return res.status(400).json({ success: false, error: rateLimitCheck.error });
      }

      // SECURITY: Validate credits
      if (credits !== undefined && credits !== null) {
        if (typeof credits !== 'number' || credits < 0 || !Number.isFinite(credits)) {
          return res.status(400).json({ success: false, error: 'Credits must be a non-negative finite number' });
        }
      }

      // SECURITY: Validate expiresInDays
      if (expiresInDays !== undefined && expiresInDays !== null) {
        if (typeof expiresInDays !== 'number' || expiresInDays <= 0 || expiresInDays > 365 || !Number.isFinite(expiresInDays)) {
          return res.status(400).json({ success: false, error: 'expiresInDays must be a number between 1 and 365' });
        }
      }

      // SECURITY: Validate allowedTools and allowedCategories
      if (allowedTools !== undefined && allowedTools !== null) {
        const toolsCheck = validateStringArray(allowedTools, 'allowedTools');
        if (!toolsCheck.valid) {
          return res.status(400).json({ success: false, error: toolsCheck.error });
        }
      }

      if (allowedCategories !== undefined && allowedCategories !== null) {
        const catsCheck = validateStringArray(allowedCategories, 'allowedCategories');
        if (!catsCheck.valid) {
          return res.status(400).json({ success: false, error: catsCheck.error });
        }
      }

      // SECURITY: Validate ipAllowlist
      if (ipAllowlist !== undefined && ipAllowlist !== null) {
        const ipCheck = validateIpAllowlist(ipAllowlist);
        if (!ipCheck.valid) {
          return res.status(400).json({ success: false, error: ipCheck.error });
        }
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

      // SECURITY: Validate ObjectId to prevent MongoDB CastError
      if (!isValidObjectId(req.params.keyId)) {
        return res.status(400).json({ success: false, error: 'Invalid API key ID format' });
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

      // SECURITY: Validate ObjectId to prevent MongoDB CastError
      if (!isValidObjectId(req.params.keyId)) {
        return res.status(400).json({ success: false, error: 'Invalid API key ID format' });
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

      // --- Input validation ---

      // SECURITY: Validate name length
      if (name !== undefined) {
        if (typeof name !== 'string' || name.trim().length === 0) {
          return res.status(400).json({ success: false, error: 'Key name must be a non-empty string' });
        }
        if (name.trim().length > 100) {
          return res.status(400).json({ success: false, error: 'Key name must be 100 characters or less' });
        }
      }

      // SECURITY: Validate rate limits
      const rateLimitCheck = validateRateLimits(rateLimitPerMinute, rateLimitPerDay);
      if (!rateLimitCheck.valid) {
        return res.status(400).json({ success: false, error: rateLimitCheck.error });
      }

      // SECURITY: Validate active is boolean
      if (active !== undefined && typeof active !== 'boolean') {
        return res.status(400).json({ success: false, error: 'active must be a boolean' });
      }

      // SECURITY: Validate allowedTools and allowedCategories
      if (allowedTools !== undefined && allowedTools !== null) {
        const toolsCheck = validateStringArray(allowedTools, 'allowedTools');
        if (!toolsCheck.valid) {
          return res.status(400).json({ success: false, error: toolsCheck.error });
        }
      }

      if (allowedCategories !== undefined && allowedCategories !== null) {
        const catsCheck = validateStringArray(allowedCategories, 'allowedCategories');
        if (!catsCheck.valid) {
          return res.status(400).json({ success: false, error: catsCheck.error });
        }
      }

      // SECURITY: Validate ipAllowlist
      if (ipAllowlist !== undefined && ipAllowlist !== null) {
        const ipCheck = validateIpAllowlist(ipAllowlist);
        if (!ipCheck.valid) {
          return res.status(400).json({ success: false, error: ipCheck.error });
        }
      }

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

      // SECURITY: Validate ObjectId
      if (!isValidObjectId(req.params.keyId)) {
        return res.status(400).json({ success: false, error: 'Invalid API key ID format' });
      }

      const { credits } = req.body;
      if (!credits || typeof credits !== 'number' || credits <= 0 || !Number.isFinite(credits)) {
        return res.status(400).json({ success: false, error: 'Credits must be a positive finite number' });
      }

      if (credits > user.credits) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient account credits',
          available: user.credits,
          requested: credits,
        });
      }

      // SECURITY FIX: Verify API key exists and is valid BEFORE deducting user credits.
      // Previously, user credits were deducted first, and if the API key update failed
      // for any reason other than "not found", credits were permanently lost.
      const ApiKey = mongoose.model<IApiKey>('ApiKey');
      const keyExists = await ApiKey.findOne({ _id: req.params.keyId, ownerId: user.userId, active: true }).select('_id keyPrefix');
      if (!keyExists) {
        return res.status(404).json({ success: false, error: 'API key not found or inactive' });
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

      // Add to API key (key is pre-validated above)
      const key = await ApiKey.findOneAndUpdate(
        { _id: req.params.keyId, ownerId: user.userId, active: true },
        { $inc: { credits: credits, totalCreditsLoaded: credits } },
        { new: true }
      ).select('-keyHash -webhookSecret');

      if (!key) {
        // SECURITY FIX: Refund on ANY failure, not just "not found"
        // This handles edge cases like the key being deactivated between the check and update
        logger.warn('API key top-up: key update failed after credit deduction, refunding', {
          userId: user.userId,
          keyId: req.params.keyId,
          credits,
        });
        await User.findOneAndUpdate(
          { userId: user.userId },
          { $inc: { credits: credits } }
        );
        return res.status(500).json({ success: false, error: 'Failed to top up API key. Credits have been refunded.' });
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

      // SECURITY: Validate ObjectId
      if (!isValidObjectId(req.params.keyId)) {
        return res.status(400).json({ success: false, error: 'Invalid API key ID format' });
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
