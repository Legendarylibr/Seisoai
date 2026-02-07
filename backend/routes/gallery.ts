/**
 * Gallery routes
 * User gallery management
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
// findUserByIdentifier import removed - SECURITY: Use authenticated user from JWT instead
import type { IUser } from '../models/User';
import { encrypt, isEncryptionConfigured } from '../utils/encryption';
import { requireAuth } from '../utils/responses';

// Types
interface Dependencies {
  authenticateToken: RequestHandler;
  authenticateFlexible?: RequestHandler; // Optional - kept for backwards compatibility
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

export function createGalleryRoutes(deps: Dependencies) {
  const router = Router();
  const { authenticateToken } = deps;

  /**
   * Get user gallery
   * GET /api/gallery/:identifier
   * SECURITY FIX: Requires authentication and only returns authenticated user's gallery
   */
  router.get('/:identifier', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Only allow users to access their own gallery
      if (!requireAuth(req, res)) return;

      const { identifier } = req.params;
      
      // Validate identifier format (wallet address or userId only)
      const isWallet = identifier.startsWith('0x') || identifier.length === 44;
      const isUserId = !isWallet;

      // SECURITY: Verify the requested identifier matches the authenticated user
      let isAuthorized = false;
      if (isWallet) {
        const normalizedRequest = identifier.startsWith('0x') ? identifier.toLowerCase() : identifier;
        const normalizedUser = req.user.walletAddress?.startsWith('0x') 
          ? req.user.walletAddress.toLowerCase() 
          : req.user.walletAddress;
        if (normalizedUser === normalizedRequest) {
          isAuthorized = true;
        }
      } else if (isUserId && req.user.userId === identifier) {
        isAuthorized = true;
      }

      if (!isAuthorized) {
        logger.warn('SECURITY: Blocked gallery access attempt for different user', {
          requestedIdentifier: identifier.substring(0, 20) + '...',
          authenticatedUserId: req.user.userId,
          path: req.path,
          ip: req.ip
        });
        res.status(403).json({ 
          success: false, 
          error: 'You can only access your own gallery' 
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user.userId })
        .select('gallery')
        .lean()
        .maxTimeMS(10000);

      if (!user) {
        res.json({ 
          success: true, 
          gallery: [] 
        });
        return;
      }

      res.json({
        success: true,
        gallery: user.gallery || []
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery fetch error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: err.message 
      });
    }
  });

  /**
   * Get gallery stats
   * GET /api/gallery/:walletAddress/stats
   * SECURITY FIX: Requires authentication and only returns authenticated user's stats
   */
  router.get('/:walletAddress/stats', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Only allow users to access their own stats
      if (!requireAuth(req, res)) return;

      const { walletAddress } = req.params;
      
      // SECURITY: Verify the requested wallet matches the authenticated user
      const normalizedRequest = walletAddress.startsWith('0x') ? walletAddress.toLowerCase() : walletAddress;
      const normalizedUser = req.user.walletAddress?.startsWith('0x') 
        ? req.user.walletAddress.toLowerCase() 
        : req.user.walletAddress;
      
      if (normalizedUser !== normalizedRequest) {
        logger.warn('SECURITY: Blocked gallery stats access attempt for different user', {
          requestedWallet: normalizedRequest.substring(0, 10) + '...',
          authenticatedUserId: req.user.userId,
          path: req.path,
          ip: req.ip
        });
        res.status(403).json({ 
          success: false, 
          error: 'You can only access your own gallery stats' 
        });
        return;
      }
      
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user.userId })
        .select('gallery')
        .lean();

      if (!user) {
        res.json({
          success: true,
          stats: {
            galleryCount: 0
          }
        });
        return;
      }

      res.json({
        success: true,
        stats: {
          galleryCount: user.gallery?.length || 0
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery stats error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get stats' 
      });
    }
  });

  /**
   * Delete gallery item
   * DELETE /api/gallery/:walletAddress/:generationId
   */
  router.delete('/:walletAddress/:generationId', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { walletAddress, generationId } = req.params;
      
      // Verify ownership
      if (req.user?.walletAddress?.toLowerCase() !== walletAddress.toLowerCase()) {
        res.status(403).json({ 
          success: false, 
          error: 'Not authorized to delete this item' 
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const result = await User.updateOne(
        { walletAddress: walletAddress.toLowerCase() },
        { $pull: { gallery: { id: generationId } } }
      );

      if (result.modifiedCount === 0) {
        res.status(404).json({ 
          success: false, 
          error: 'Item not found' 
        });
        return;
      }

      res.json({
        success: true,
        message: 'Item deleted'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery delete error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to delete item' 
      });
    }
  });

  /**
   * Save to gallery
   * POST /api/gallery/save
   * SECURITY FIX: Uses authenticateToken and only saves to authenticated user's gallery
   */
  router.post('/save', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Only allow saving to authenticated user's gallery
      if (!requireAuth(req, res)) return;

      const { 
        imageUrl, prompt, model, generationId,
        // 3D model fields
        modelType, glbUrl, objUrl, fbxUrl, thumbnailUrl
      } = req.body as {
        imageUrl?: string;
        prompt?: string;
        model?: string;
        generationId?: string;
        // 3D model fields
        modelType?: '3d' | 'image' | 'video';
        glbUrl?: string;
        objUrl?: string;
        fbxUrl?: string;
        thumbnailUrl?: string;
      };
      
      if (!imageUrl && !glbUrl) {
        res.status(400).json({ 
          success: false, 
          error: 'Image URL or GLB URL required' 
        });
        return;
      }

      // SECURITY: Use authenticated user, not body parameters
      const user = req.user;

      // Build gallery item
      // Encrypt prompt if encryption is configured (findOneAndUpdate bypasses pre-save hooks)
      let encryptedPrompt = prompt;
      if (prompt && isEncryptionConfigured()) {
        // Check if already encrypted (shouldn't be, but be safe)
        const isEncrypted = prompt.includes(':') && prompt.split(':').length === 3;
        if (!isEncrypted) {
          encryptedPrompt = encrypt(prompt);
        }
      }
      
      const galleryItem: Record<string, unknown> = {
        id: generationId || `gen-${Date.now()}`,
        imageUrl: imageUrl || thumbnailUrl,
        prompt: encryptedPrompt,
        style: model,
        timestamp: new Date(),
        modelType: modelType || 'image'
      };

      // Add 3D model fields if present
      if (modelType === '3d' || glbUrl) {
        galleryItem.modelType = '3d';
        galleryItem.glbUrl = glbUrl;
        galleryItem.objUrl = objUrl;
        galleryItem.fbxUrl = fbxUrl;
        galleryItem.thumbnailUrl = thumbnailUrl;
        // 3D models expire after 1 day
        galleryItem.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        logger.info('Saving 3D model to gallery', {
          userId: user.userId,
          hasGlb: !!glbUrl,
          hasObj: !!objUrl,
          expiresAt: galleryItem.expiresAt
        });
      }

      const User = mongoose.model<IUser>('User');
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $push: {
            gallery: {
              $each: [galleryItem],
              $slice: -100 // Keep last 100 items
            }
          }
        }
      );

      res.json({
        success: true,
        message: 'Saved to gallery',
        expiresAt: galleryItem.expiresAt
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery save error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: 'Failed to save to gallery' 
      });
    }
  });

  /**
   * Clean up expired gallery items (3D models expire after 1 day)
   * This runs periodically or can be called manually
   */
  const cleanupExpiredGalleryItems = async (): Promise<number> => {
    try {
      const User = mongoose.model<IUser>('User');
      const now = new Date();
      
      // Remove expired gallery items from all users
      const result = await User.updateMany(
        { 'gallery.expiresAt': { $lt: now } },
        { $pull: { gallery: { expiresAt: { $lt: now } } } }
      );
      
      if (result.modifiedCount > 0) {
        logger.info('Cleaned up expired gallery items', { 
          usersAffected: result.modifiedCount 
        });
      }
      
      return result.modifiedCount;
    } catch (error) {
      const err = error as Error;
      logger.error('Gallery cleanup error', { error: err.message });
      return 0;
    }
  };

  // Run cleanup every hour
  setInterval(cleanupExpiredGalleryItems, 60 * 60 * 1000);

  return router;
}

export default createGalleryRoutes;



