/**
 * Public Gallery Routes
 * Public endpoints for viewing and sharing gallery content
 * SEO-optimized with Open Graph tags support
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import type { IUser } from '../models/User';
import config from '../config/env';

// Types
interface Dependencies {
  rateLimiter?: RequestHandler;
}

interface GalleryQueryParams {
  page?: string;
  limit?: string;
  type?: 'image' | 'video' | '3d' | 'all';
  sort?: 'newest' | 'popular';
}

// Reserved for future gallery features
export interface PublicGalleryItem {
  id: string;
  type: 'image' | 'video' | '3d';
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  style?: string;
  createdAt: Date;
  likes?: number;
}

const FRONTEND_URL = config.FRONTEND_URL || 'https://seisoai.com';

export function createPublicGalleryRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { rateLimiter } = deps;
  
  const limiter = rateLimiter || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Get featured/public gallery items
   * GET /api/gallery/public
   */
  router.get('/public', limiter, async (req: Request, res: Response) => {
    try {
      const { page = '1', limit = '20', type = 'all', sort = 'newest' } = req.query as GalleryQueryParams;
      
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
      const skip = (pageNum - 1) * limitNum;
      
      const User = mongoose.model<IUser>('User');
      
      // Build aggregation pipeline to get public gallery items
      // Only show items from users who have opted into public sharing
      const pipeline: any[] = [
        // Unwind gallery array
        { $unwind: '$gallery' },
        // Only completed items with URLs
        { 
          $match: { 
            'gallery.status': 'completed',
            $or: [
              { 'gallery.imageUrl': { $exists: true, $ne: null } },
              { 'gallery.videoUrl': { $exists: true, $ne: null } }
            ]
          } 
        }
      ];
      
      // Filter by type if specified
      if (type !== 'all') {
        pipeline.push({
          $match: { 'gallery.modelType': type }
        });
      }
      
      // Sort
      if (sort === 'newest') {
        pipeline.push({ $sort: { 'gallery.timestamp': -1 } });
      }
      
      // Pagination
      pipeline.push({ $skip: skip });
      pipeline.push({ $limit: limitNum });
      
      // Project only public fields
      pipeline.push({
        $project: {
          _id: 0,
          id: '$gallery.id',
          type: { $ifNull: ['$gallery.modelType', 'image'] },
          url: { $ifNull: ['$gallery.imageUrl', '$gallery.videoUrl'] },
          thumbnailUrl: '$gallery.thumbnailUrl',
          prompt: '$gallery.prompt',
          style: '$gallery.style',
          createdAt: '$gallery.timestamp'
        }
      });
      
      const items = await User.aggregate(pipeline);
      
      // Count total for pagination
      const countPipeline = [
        { $unwind: '$gallery' },
        { 
          $match: { 
            'gallery.status': 'completed',
            $or: [
              { 'gallery.imageUrl': { $exists: true, $ne: null } },
              { 'gallery.videoUrl': { $exists: true, $ne: null } }
            ]
          } 
        },
        { $count: 'total' }
      ];
      
      if (type !== 'all') {
        countPipeline.splice(2, 0, { $match: { 'gallery.modelType': type } } as any);
      }
      
      const countResult = await User.aggregate(countPipeline);
      const total = countResult[0]?.total || 0;
      
      res.json({
        success: true,
        items,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      logger.error('Public gallery error', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to load gallery' });
    }
  });

  /**
   * Get single gallery item by ID
   * GET /api/gallery/public/:id
   */
  router.get('/public/:id', limiter, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        res.status(400).json({ success: false, error: 'Item ID required' });
        return;
      }
      
      const User = mongoose.model<IUser>('User');
      
      // Find the gallery item
      const result = await User.aggregate([
        { $unwind: '$gallery' },
        { $match: { 'gallery.id': id } },
        {
          $project: {
            _id: 0,
            id: '$gallery.id',
            type: { $ifNull: ['$gallery.modelType', 'image'] },
            url: { $ifNull: ['$gallery.imageUrl', '$gallery.videoUrl'] },
            thumbnailUrl: '$gallery.thumbnailUrl',
            prompt: '$gallery.prompt',
            style: '$gallery.style',
            createdAt: '$gallery.timestamp'
          }
        }
      ]);
      
      if (!result || result.length === 0) {
        res.status(404).json({ success: false, error: 'Item not found' });
        return;
      }
      
      const item = result[0];
      
      res.json({
        success: true,
        item,
        // Include Open Graph meta data for social sharing
        meta: {
          title: `AI ${item.type === 'image' ? 'Image' : item.type === 'video' ? 'Video' : '3D Model'} - SeisoAI`,
          description: item.prompt?.substring(0, 160) || 'Created with SeisoAI',
          image: item.thumbnailUrl || item.url,
          url: `${FRONTEND_URL}/gallery/${id}`
        }
      });
    } catch (error) {
      logger.error('Public gallery item error', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to load item' });
    }
  });

  /**
   * Get Open Graph meta tags for a gallery item (for crawlers/previews)
   * GET /api/gallery/public/:id/og
   */
  router.get('/public/:id/og', limiter, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const User = mongoose.model<IUser>('User');
      
      const result = await User.aggregate([
        { $unwind: '$gallery' },
        { $match: { 'gallery.id': id } },
        {
          $project: {
            id: '$gallery.id',
            type: { $ifNull: ['$gallery.modelType', 'image'] },
            url: { $ifNull: ['$gallery.imageUrl', '$gallery.videoUrl'] },
            thumbnailUrl: '$gallery.thumbnailUrl',
            prompt: '$gallery.prompt'
          }
        }
      ]);
      
      if (!result || result.length === 0) {
        // Return default OG tags
        res.json({
          title: 'SeisoAI - AI Image, Video & Music Generation',
          description: 'Create stunning AI images, videos, and music with SeisoAI.',
          image: `${FRONTEND_URL}/seiso-logo.png`,
          url: FRONTEND_URL,
          type: 'website'
        });
        return;
      }
      
      const item = result[0];
      const typeLabels: Record<string, string> = {
        image: 'Image',
        video: 'Video',
        '3d': '3D Model'
      };
      
      res.json({
        title: `AI ${typeLabels[item.type] || 'Creation'} - SeisoAI`,
        description: item.prompt?.substring(0, 160) || 'Created with SeisoAI - AI Image, Video & Music Generation',
        image: item.thumbnailUrl || item.url,
        url: `${FRONTEND_URL}/gallery/${id}`,
        type: item.type === 'video' ? 'video.other' : 'website'
      });
    } catch (error) {
      logger.error('OG tags error', { error: (error as Error).message });
      res.json({
        title: 'SeisoAI - AI Image, Video & Music Generation',
        description: 'Create stunning AI images, videos, and music with SeisoAI.',
        image: `${FRONTEND_URL}/seiso-logo.png`,
        url: FRONTEND_URL,
        type: 'website'
      });
    }
  });

  /**
   * Get embed code for a gallery item
   * GET /api/gallery/public/:id/embed
   */
  router.get('/public/:id/embed', limiter, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { ref } = req.query; // Optional referral code
      
      const User = mongoose.model<IUser>('User');
      
      const result = await User.aggregate([
        { $unwind: '$gallery' },
        { $match: { 'gallery.id': id } },
        {
          $project: {
            id: '$gallery.id',
            type: { $ifNull: ['$gallery.modelType', 'image'] },
            url: { $ifNull: ['$gallery.imageUrl', '$gallery.videoUrl'] },
            prompt: '$gallery.prompt'
          }
        }
      ]);
      
      if (!result || result.length === 0) {
        res.status(404).json({ success: false, error: 'Item not found' });
        return;
      }
      
      const item = result[0];
      const shareUrl = ref ? `${FRONTEND_URL}?ref=${ref}` : FRONTEND_URL;
      
      // Generate embed HTML
      let embedHtml = '';
      
      if (item.type === 'video') {
        embedHtml = `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;">
  <video src="${item.url}" style="position:absolute;top:0;left:0;width:100%;height:100%;" controls autoplay muted loop></video>
</div>
<p style="margin-top:8px;font-size:12px;color:#666;">Created with <a href="${shareUrl}" target="_blank">SeisoAI</a></p>`;
      } else {
        embedHtml = `<div style="text-align:center;">
  <img src="${item.url}" alt="${item.prompt?.substring(0, 50) || 'AI Generated'}" style="max-width:100%;height:auto;border-radius:8px;" />
  <p style="margin-top:8px;font-size:12px;color:#666;">Created with <a href="${shareUrl}" target="_blank">SeisoAI</a></p>
</div>`;
      }
      
      // oEmbed response format
      const oembedJson = {
        version: '1.0',
        type: item.type === 'video' ? 'video' : 'photo',
        title: item.prompt?.substring(0, 50) || 'AI Generated Content',
        provider_name: 'SeisoAI',
        provider_url: FRONTEND_URL,
        thumbnail_url: item.url,
        html: embedHtml,
        width: 640,
        height: item.type === 'video' ? 360 : 640
      };
      
      res.json({
        success: true,
        embedHtml,
        oembed: oembedJson
      });
    } catch (error) {
      logger.error('Embed code error', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to generate embed' });
    }
  });

  /**
   * Featured/trending items for homepage
   * GET /api/gallery/public/featured
   */
  router.get('/featured', limiter, async (_req: Request, res: Response) => {
    try {
      const User = mongoose.model<IUser>('User');
      
      // Get 12 recent high-quality items
      const items = await User.aggregate([
        { $unwind: '$gallery' },
        { 
          $match: { 
            'gallery.status': 'completed',
            'gallery.imageUrl': { $exists: true, $ne: null }
          } 
        },
        { $sort: { 'gallery.timestamp': -1 } },
        { $limit: 12 },
        {
          $project: {
            _id: 0,
            id: '$gallery.id',
            type: { $ifNull: ['$gallery.modelType', 'image'] },
            url: '$gallery.imageUrl',
            thumbnailUrl: '$gallery.thumbnailUrl',
            prompt: '$gallery.prompt',
            style: '$gallery.style'
          }
        }
      ]);
      
      res.json({
        success: true,
        items
      });
    } catch (error) {
      logger.error('Featured gallery error', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Failed to load featured items' });
    }
  });

  return router;
}

export default createPublicGalleryRoutes;
