/**
 * Discord OAuth Routes
 * Handles Discord account linking for authenticated users
 * Syncs with Discord bot's DiscordUser collection for seamless integration
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import type { IUser } from '../models/User.js';
import getDiscordUserModel from '../models/DiscordUser.js';

// Types
interface Dependencies {
  authenticateToken?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    email?: string;
  };
}

interface OAuthStateData {
  userId: string;
  expiresAt: number;
}

// SECURITY: Store OAuth state tokens in Redis for production (persists across restarts, works with multiple instances)
// Fallback to in-memory Map for development/testing
const oauthStatesMemory = new Map<string, OAuthStateData>();

// Lazy import Redis to avoid circular dependencies
let redisService: typeof import('../services/redis.js') | null = null;
async function getRedisService() {
  if (!redisService) {
    redisService = await import('../services/redis.js');
  }
  return redisService;
}

/**
 * Store OAuth state in Redis (primary) or memory (fallback)
 */
async function setOAuthState(state: string, data: OAuthStateData): Promise<void> {
  const ttlSeconds = Math.floor((data.expiresAt - Date.now()) / 1000);
  
  try {
    const redis = await getRedisService();
    if (redis && redis.isRedisConnected()) {
      await redis.cacheSet(`oauth:state:${state}`, data, { prefix: '', ttl: ttlSeconds });
      return;
    }
  } catch (error) {
    logger.debug('Redis OAuth state storage failed, using in-memory fallback', { error: (error as Error).message });
  }
  
  // Fallback to in-memory
  oauthStatesMemory.set(state, data);
}

/**
 * Get OAuth state from Redis (primary) or memory (fallback)
 */
async function getOAuthState(state: string): Promise<OAuthStateData | null> {
  try {
    const redis = await getRedisService();
    if (redis && redis.isRedisConnected()) {
      const data = await redis.cacheGet<OAuthStateData>(`oauth:state:${state}`, { prefix: '' });
      return data;
    }
  } catch (error) {
    logger.debug('Redis OAuth state retrieval failed, using in-memory fallback', { error: (error as Error).message });
  }
  
  // Fallback to in-memory
  return oauthStatesMemory.get(state) || null;
}

/**
 * Delete OAuth state from Redis (primary) and memory (fallback)
 */
async function deleteOAuthState(state: string): Promise<void> {
  try {
    const redis = await getRedisService();
    if (redis && redis.isRedisConnected()) {
      await redis.cacheDelete(`oauth:state:${state}`, { prefix: '' });
    }
  } catch (error) {
    logger.debug('Redis OAuth state deletion failed', { error: (error as Error).message });
  }
  
  // Also delete from memory fallback
  oauthStatesMemory.delete(state);
}

// Clean up expired states from in-memory fallback periodically
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStatesMemory.entries()) {
    if (data.expiresAt < now) {
      oauthStatesMemory.delete(state);
    }
  }
}, 60 * 1000); // Every minute

export function createDiscordRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateToken } = deps;

  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Initiate Discord OAuth flow
   * GET /api/auth/discord
   * Requires authentication - links Discord to existing account
   */
  router.get('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!config.DISCORD_CLIENT_ID || !config.DISCORD_CLIENT_SECRET) {
        res.status(503).json({
          success: false,
          error: 'Discord OAuth is not configured'
        });
        return;
      }

      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'You must be logged in to link Discord'
        });
        return;
      }

      // Generate state token for CSRF protection
      const state = crypto.randomBytes(32).toString('hex');
      await setOAuthState(state, {
        userId: req.user.userId,
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
      });

      // Build Discord OAuth URL
      const params = new URLSearchParams({
        client_id: config.DISCORD_CLIENT_ID,
        redirect_uri: config.DISCORD_REDIRECT_URI || '',
        response_type: 'code',
        scope: 'identify',
        state
      });

      const discordAuthUrl = `https://discord.com/oauth2/authorize?${params.toString()}`;

      // Redirect to Discord
      res.redirect(discordAuthUrl);
    } catch (error) {
      const err = error as Error;
      logger.error('Discord OAuth initiation error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to initiate Discord OAuth'
      });
    }
  });

  /**
   * Discord OAuth callback
   * GET /api/auth/discord/callback
   */
  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const { code, state, error: oauthError } = req.query as {
        code?: string;
        state?: string;
        error?: string;
      };

      // Handle OAuth errors
      if (oauthError) {
        logger.warn('Discord OAuth error', { error: oauthError });
        res.redirect('/?discord=error&message=' + encodeURIComponent(oauthError));
        return;
      }

      // Validate state - retrieve from Redis/memory
      if (!state) {
        logger.warn('Missing OAuth state');
        res.redirect('/?discord=error&message=invalid_state');
        return;
      }
      
      const stateData = await getOAuthState(state);
      if (!stateData) {
        logger.warn('Invalid OAuth state - not found');
        res.redirect('/?discord=error&message=invalid_state');
        return;
      }

      // Delete state immediately (one-time use) to prevent replay attacks
      await deleteOAuthState(state);

      // Check expiration
      if (stateData.expiresAt < Date.now()) {
        logger.warn('OAuth state expired');
        res.redirect('/?discord=error&message=expired');
        return;
      }

      if (!code) {
        res.redirect('/?discord=error&message=no_code');
        return;
      }

      if (!config.DISCORD_CLIENT_ID || !config.DISCORD_CLIENT_SECRET || !config.DISCORD_REDIRECT_URI) {
        res.redirect('/?discord=error&message=not_configured');
        return;
      }

      // Exchange code for token
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: config.DISCORD_CLIENT_ID,
          client_secret: config.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
          redirect_uri: config.DISCORD_REDIRECT_URI
        })
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logger.error('Discord token exchange failed', { error: errorText });
        res.redirect('/?discord=error&message=token_exchange_failed');
        return;
      }

      const tokenData = await tokenResponse.json() as {
        access_token: string;
        token_type: string;
      };

      // Get Discord user info
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `${tokenData.token_type} ${tokenData.access_token}`
        }
      });

      if (!userResponse.ok) {
        logger.error('Failed to get Discord user info');
        res.redirect('/?discord=error&message=user_info_failed');
        return;
      }

      const discordUser = await userResponse.json() as {
        id: string;
        username: string;
        discriminator: string;
        avatar?: string;
        global_name?: string;
      };

      // Check if this Discord account is already linked to another user
      const User = mongoose.model<IUser>('User');
      const existingLink = await User.findOne({ discordId: discordUser.id });
      
      if (existingLink && existingLink.userId !== stateData.userId) {
        logger.warn('Discord already linked to another account', {
          discordId: discordUser.id,
          existingUserId: existingLink.userId,
          requestingUserId: stateData.userId
        });
        res.redirect('/?discord=error&message=already_linked');
        return;
      }

      // Link Discord to user account
      // DATA MINIMIZATION: Only store ID and username, not avatar
      const user = await User.findOneAndUpdate(
        { userId: stateData.userId },
        {
          $set: {
            discordId: discordUser.id,
            discordUsername: discordUser.global_name || discordUser.username,
            discordLinkedAt: new Date()
          }
        },
        { new: true }
      );

      if (!user) {
        logger.error('User not found during Discord link', { userId: stateData.userId });
        res.redirect('/?discord=error&message=user_not_found');
        return;
      }

      // Sync to Discord bot's DiscordUser collection
      // This allows the bot to immediately recognize the linked account
      try {
        const DiscordUserModel = getDiscordUserModel();
        await DiscordUserModel.syncFromMainUser({
          userId: user.userId,
          email: user.email,
          walletAddress: user.walletAddress,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned,
          totalCreditsSpent: user.totalCreditsSpent,
          discordId: discordUser.id,
          discordUsername: discordUser.global_name || discordUser.username
        });
        
        logger.info('Synced Discord link to bot collection', {
          userId: user.userId,
          discordId: discordUser.id
        });
      } catch (syncError) {
        // Don't fail the main flow if bot sync fails
        logger.warn('Failed to sync Discord link to bot collection', {
          error: (syncError as Error).message,
          userId: user.userId,
          discordId: discordUser.id
        });
      }

      logger.info('Discord account linked', {
        userId: user.userId,
        discordId: discordUser.id,
        discordUsername: discordUser.username
      });

      // Redirect back to app with success
      res.redirect('/?discord=success');
    } catch (error) {
      const err = error as Error;
      logger.error('Discord OAuth callback error', { error: err.message });
      res.redirect('/?discord=error&message=internal_error');
    }
  });

  /**
   * Unlink Discord account
   * DELETE /api/auth/discord
   */
  router.delete('/', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      
      // Get user first to get Discord ID for cleanup
      const existingUser = await User.findOne({ userId: req.user.userId });
      const discordId = existingUser?.discordId;
      
      const user = await User.findOneAndUpdate(
        { userId: req.user.userId },
        {
          $unset: {
            discordId: '',
            discordUsername: '',
            discordLinkedAt: ''
          }
        },
        { new: true }
      );

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Also unlink from Discord bot's collection
      if (discordId) {
        try {
          const DiscordUserModel = getDiscordUserModel();
          await DiscordUserModel.findOneAndUpdate(
            { discordId },
            {
              $unset: {
                seisoUserId: '',
                email: '',
                walletAddress: ''
              },
              $set: {
                credits: 0,
                totalCreditsEarned: 0,
                totalCreditsSpent: 0
              }
            }
          );
          
          logger.info('Discord bot record unlinked', { discordId });
        } catch (syncError) {
          logger.warn('Failed to unlink from Discord bot collection', {
            error: (syncError as Error).message,
            discordId
          });
        }
      }

      logger.info('Discord account unlinked', { userId: user.userId });

      res.json({
        success: true,
        message: 'Discord account unlinked'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Discord unlink error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to unlink Discord'
      });
    }
  });

  /**
   * Get Discord link status
   * GET /api/auth/discord/status
   */
  router.get('/status', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!req.user?.userId) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      // DATA MINIMIZATION: Only return essential Discord info
      const user = await User.findOne({ userId: req.user.userId })
        .select('discordId discordUsername discordLinkedAt');

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      res.json({
        success: true,
        linked: !!user.discordId,
        discord: user.discordId ? {
          id: user.discordId,
          username: user.discordUsername,
          linkedAt: user.discordLinkedAt
        } : null
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Discord status error', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get Discord status'
      });
    }
  });

  return router;
}

export default createDiscordRoutes;

