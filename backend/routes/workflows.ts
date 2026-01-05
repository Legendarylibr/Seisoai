/**
 * Workflow routes
 * Multi-step AI generation pipelines
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { submitToQueue, checkQueueStatus, getQueueResult, getFalApiKey, isStatusCompleted, isStatusFailed } from '../services/fal';
import { buildUserUpdateQuery } from '../services/user';
import type { IUser } from '../models/User';

// Types
interface Dependencies {
  rateLimiter?: RequestHandler;
  requireCredits: (credits: number) => RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

// FAL.ai model endpoints
const FAL_MODELS = {
  TTS: 'fal-ai/xtts-v2',
  LIP_SYNC: 'fal-ai/sadtalker',
  MUSIC_GEN: 'fal-ai/cassetteai/music-generator',
  IMAGE_GEN: 'fal-ai/flux-pro/v1.1-ultra',
  VIDEO_GEN: 'fal-ai/veo-3-preview',
  STEM_SEPARATE: 'fal-ai/demucs'
};

// Workflow step definitions
interface WorkflowStep {
  id: string;
  name: string;
  credits: number;
  model?: string;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  steps: WorkflowStep[];
  totalCredits: number;
}

const WORKFLOW_DEFINITIONS: Record<string, WorkflowDefinition> = {
  'ai-influencer': {
    id: 'ai-influencer',
    name: 'AI Influencer',
    totalCredits: 4,
    steps: [
      { id: 'portrait', name: 'Portrait Upload', credits: 0 },
      { id: 'script', name: 'Script Input', credits: 0 },
      { id: 'voice', name: 'Voice Generation', credits: 1, model: FAL_MODELS.TTS },
      { id: 'lipsync', name: 'Lip Sync', credits: 3, model: FAL_MODELS.LIP_SYNC }
    ]
  },
  'music-video': {
    id: 'music-video',
    name: 'Music Video',
    totalCredits: 20,
    steps: [
      { id: 'describe', name: 'Describe', credits: 0 },
      { id: 'music', name: 'Generate Music', credits: 1, model: FAL_MODELS.MUSIC_GEN },
      { id: 'video', name: 'Generate Video', credits: 18, model: FAL_MODELS.VIDEO_GEN },
      { id: 'combine', name: 'Combine', credits: 1 }
    ]
  },
  'avatar-creator': {
    id: 'avatar-creator',
    name: 'Avatar Creator',
    totalCredits: 3,
    steps: [
      { id: 'describe', name: 'Describe Character', credits: 0 },
      { id: 'generate', name: 'Generate Base', credits: 1, model: FAL_MODELS.IMAGE_GEN },
      { id: 'variations', name: 'Create Variations', credits: 2, model: FAL_MODELS.IMAGE_GEN }
    ]
  },
  'remix-visualizer': {
    id: 'remix-visualizer',
    name: 'Remix Visualizer',
    totalCredits: 2,
    steps: [
      { id: 'upload', name: 'Upload Song', credits: 0 },
      { id: 'separate', name: 'Separate Stems', credits: 2, model: FAL_MODELS.STEM_SEPARATE },
      { id: 'mix', name: 'Mix & Export', credits: 0 }
    ]
  }
};

/**
 * Refund credits to a user after a failed generation
 */
async function refundCredits(
  user: IUser,
  credits: number,
  reason: string
): Promise<IUser | null> {
  try {
    const User = mongoose.model<IUser>('User');
    const updateQuery = buildUserUpdateQuery(user);
    
    if (!updateQuery) {
      logger.error('Cannot refund credits: no valid user identifier', { userId: user.userId });
      return null;
    }

    const updatedUser = await User.findOneAndUpdate(
      updateQuery,
      { $inc: { credits: credits, totalCreditsSpent: -credits } },
      { new: true }
    );

    if (updatedUser) {
      logger.info('Credits refunded for failed workflow step', {
        userId: user.userId || user.email || user.walletAddress,
        creditsRefunded: credits,
        newBalance: updatedUser.credits,
        reason
      });
    }

    return updatedUser;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to refund credits', { userId: user.userId, credits, reason, error: err.message });
    return null;
  }
}

export function createWorkflowRoutes(deps: Dependencies) {
  const router = Router();
  const { rateLimiter, requireCredits } = deps;
  
  const limiter = rateLimiter || ((req: Request, res: Response, next: () => void) => next());
  
  // Get available workflows
  router.get('/list', (req: Request, res: Response) => {
    const workflows = Object.values(WORKFLOW_DEFINITIONS).map(w => ({
      id: w.id,
      name: w.name,
      totalCredits: w.totalCredits,
      stepCount: w.steps.length,
      steps: w.steps.map(s => ({
        id: s.id,
        name: s.name,
        credits: s.credits
      }))
    }));
    
    res.json({ success: true, workflows });
  });
  
  // ============================================================================
  // AI INFLUENCER WORKFLOW
  // Portrait → Script → Voice → Lip Sync → Talking Video
  // ============================================================================
  
  /**
   * Generate voice from script
   * POST /api/workflows/ai-influencer/voice
   */
  router.post('/ai-influencer/voice', limiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }
      
      const { script, language = 'en' } = req.body;
      
      if (!script || script.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Script text is required' });
        return;
      }
      
      const creditsRequired = 1;
      
      // Deduct credits
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }
      
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );
      
      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }
      
      logger.info('[Workflow] AI Influencer - Generating voice', { scriptLength: script.length });
      
      // Submit to TTS
      const result = await submitToQueue<{ request_id?: string }>(FAL_MODELS.TTS, {
        text: script.trim(),
        language
      });
      
      const requestId = result.request_id;
      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit TTS request' });
        return;
      }
      
      // Poll for completion
      const maxWaitTime = 60 * 1000;
      const pollInterval = 500;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, FAL_MODELS.TTS);
          const normalizedStatus = (statusData.status || '').toUpperCase();
          
          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{ audio?: { url?: string }; audio_url?: string }>(
              requestId, FAL_MODELS.TTS
            );
            
            const audioUrl = resultData.audio?.url || resultData.audio_url;
            
            if (audioUrl) {
              logger.info('[Workflow] Voice generation completed', { requestId });
              res.json({
                success: true,
                audio_url: audioUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No audio URL in response');
              res.status(500).json({ success: false, error: 'No audio generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'TTS generation failed');
            res.status(500).json({ success: false, error: 'Voice generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Voice polling error', { error: (pollError as Error).message });
        }
      }
      
      await refundCredits(user, creditsRequired, 'Voice generation timed out');
      res.status(504).json({ success: false, error: 'Voice generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('[Workflow] Voice generation error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  /**
   * Generate lip sync video
   * POST /api/workflows/ai-influencer/lipsync
   */
  router.post('/ai-influencer/lipsync', limiter, requireCredits(3), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }
      
      const { portraitUrl, voiceUrl } = req.body;
      
      if (!portraitUrl) {
        res.status(400).json({ success: false, error: 'Portrait image URL is required' });
        return;
      }
      if (!voiceUrl) {
        res.status(400).json({ success: false, error: 'Voice audio URL is required' });
        return;
      }
      
      const creditsRequired = 3;
      
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }
      
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );
      
      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }
      
      logger.info('[Workflow] AI Influencer - Generating lip sync');
      
      const result = await submitToQueue<{ request_id?: string }>(FAL_MODELS.LIP_SYNC, {
        source_image_url: portraitUrl,
        driven_audio_url: voiceUrl,
        expression_scale: 1.0,
        preprocess: 'full',
        still_mode: false,
        use_enhancer: true
      });
      
      const requestId = result.request_id;
      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit lip sync request' });
        return;
      }
      
      // Poll for completion
      const maxWaitTime = 5 * 60 * 1000;
      const pollInterval = 3000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, FAL_MODELS.LIP_SYNC);
          const normalizedStatus = (statusData.status || '').toUpperCase();
          
          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{ video?: { url?: string }; video_url?: string }>(
              requestId, FAL_MODELS.LIP_SYNC
            );
            
            const videoUrl = resultData.video?.url || resultData.video_url;
            
            if (videoUrl) {
              logger.info('[Workflow] Lip sync completed', { requestId });
              res.json({
                success: true,
                video_url: videoUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No video URL in response');
              res.status(500).json({ success: false, error: 'No video generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Lip sync failed');
            res.status(500).json({ success: false, error: 'Lip sync generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Lip sync polling error', { error: (pollError as Error).message });
        }
      }
      
      await refundCredits(user, creditsRequired, 'Lip sync timed out');
      res.status(504).json({ success: false, error: 'Lip sync generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('[Workflow] Lip sync error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  // ============================================================================
  // MUSIC VIDEO WORKFLOW
  // Describe → Generate Music → Generate Video → Combine
  // ============================================================================
  
  /**
   * Generate music for music video
   * POST /api/workflows/music-video/music
   */
  router.post('/music-video/music', limiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }
      
      const { musicPrompt, duration = 30 } = req.body;
      
      if (!musicPrompt || musicPrompt.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Music prompt is required' });
        return;
      }
      
      const creditsRequired = 1;
      
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }
      
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );
      
      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }
      
      logger.info('[Workflow] Music Video - Generating music', { prompt: musicPrompt.substring(0, 50) });
      
      const result = await submitToQueue<{ request_id?: string }>(FAL_MODELS.MUSIC_GEN, {
        prompt: musicPrompt.trim(),
        seconds_total: Math.min(duration, 60)
      });
      
      const requestId = result.request_id;
      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit music request' });
        return;
      }
      
      // Poll for completion
      const maxWaitTime = 2 * 60 * 1000;
      const pollInterval = 2000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, FAL_MODELS.MUSIC_GEN);
          const normalizedStatus = (statusData.status || '').toUpperCase();
          
          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{ audio_file?: { url?: string } }>(
              requestId, FAL_MODELS.MUSIC_GEN
            );
            
            const audioUrl = resultData.audio_file?.url;
            
            if (audioUrl) {
              logger.info('[Workflow] Music generation completed', { requestId });
              res.json({
                success: true,
                audio_url: audioUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No audio URL in response');
              res.status(500).json({ success: false, error: 'No music generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Music generation failed');
            res.status(500).json({ success: false, error: 'Music generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Music polling error', { error: (pollError as Error).message });
        }
      }
      
      await refundCredits(user, creditsRequired, 'Music generation timed out');
      res.status(504).json({ success: false, error: 'Music generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('[Workflow] Music generation error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  // ============================================================================
  // AVATAR CREATOR WORKFLOW
  // Describe → Generate Base → Create Variations
  // ============================================================================
  
  /**
   * Generate base character
   * POST /api/workflows/avatar-creator/generate
   */
  router.post('/avatar-creator/generate', limiter, requireCredits(1), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }
      
      const { characterDescription } = req.body;
      
      if (!characterDescription || characterDescription.trim().length === 0) {
        res.status(400).json({ success: false, error: 'Character description is required' });
        return;
      }
      
      const creditsRequired = 1;
      
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }
      
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );
      
      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }
      
      const prompt = `portrait of ${characterDescription}, centered, high quality, detailed face, clean background`;
      logger.info('[Workflow] Avatar Creator - Generating base character', { prompt: prompt.substring(0, 50) });
      
      const result = await submitToQueue<{ request_id?: string }>(FAL_MODELS.IMAGE_GEN, {
        prompt,
        aspect_ratio: '1:1',
        output_format: 'jpeg'
      });
      
      const requestId = result.request_id;
      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit image request' });
        return;
      }
      
      // Poll for completion
      const maxWaitTime = 60 * 1000;
      const pollInterval = 1000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, FAL_MODELS.IMAGE_GEN);
          const normalizedStatus = (statusData.status || '').toUpperCase();
          
          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{ images?: { url: string }[] }>(
              requestId, FAL_MODELS.IMAGE_GEN
            );
            
            const imageUrl = resultData.images?.[0]?.url;
            
            if (imageUrl) {
              logger.info('[Workflow] Character generation completed', { requestId });
              res.json({
                success: true,
                image_url: imageUrl,
                remainingCredits: updateResult.credits,
                creditsDeducted: creditsRequired
              });
              return;
            } else {
              await refundCredits(user, creditsRequired, 'No image URL in response');
              res.status(500).json({ success: false, error: 'No image generated' });
              return;
            }
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Image generation failed');
            res.status(500).json({ success: false, error: 'Image generation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Image polling error', { error: (pollError as Error).message });
        }
      }
      
      await refundCredits(user, creditsRequired, 'Image generation timed out');
      res.status(504).json({ success: false, error: 'Image generation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('[Workflow] Character generation error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  // ============================================================================
  // REMIX VISUALIZER WORKFLOW
  // Upload → Separate Stems → Mix & Export
  // ============================================================================
  
  /**
   * Separate stems
   * POST /api/workflows/remix-visualizer/separate
   */
  router.post('/remix-visualizer/separate', limiter, requireCredits(2), async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }
      
      const FAL_API_KEY = getFalApiKey();
      if (!FAL_API_KEY) {
        res.status(500).json({ success: false, error: 'AI service not configured' });
        return;
      }
      
      const { audioUrl } = req.body;
      
      if (!audioUrl) {
        res.status(400).json({ success: false, error: 'Audio URL is required' });
        return;
      }
      
      const creditsRequired = 2;
      
      const User = mongoose.model<IUser>('User');
      const updateQuery = buildUserUpdateQuery(user);
      
      if (!updateQuery) {
        res.status(400).json({ success: false, error: 'User account required' });
        return;
      }
      
      const updateResult = await User.findOneAndUpdate(
        { ...updateQuery, credits: { $gte: creditsRequired } },
        { $inc: { credits: -creditsRequired, totalCreditsSpent: creditsRequired } },
        { new: true }
      );
      
      if (!updateResult) {
        res.status(402).json({ success: false, error: 'Insufficient credits' });
        return;
      }
      
      logger.info('[Workflow] Remix Visualizer - Separating stems');
      
      const result = await submitToQueue<{ request_id?: string }>(FAL_MODELS.STEM_SEPARATE, {
        audio_url: audioUrl,
        model: 'htdemucs_ft',
        shifts: 2,
        overlap: 0.25
      });
      
      const requestId = result.request_id;
      if (!requestId) {
        await refundCredits(user, creditsRequired, 'No request ID returned');
        res.status(500).json({ success: false, error: 'Failed to submit separation request' });
        return;
      }
      
      // Poll for completion
      const maxWaitTime = 3 * 60 * 1000;
      const pollInterval = 2000;
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          const statusData = await checkQueueStatus<{ status?: string }>(requestId, FAL_MODELS.STEM_SEPARATE);
          const normalizedStatus = (statusData.status || '').toUpperCase();
          
          if (isStatusCompleted(normalizedStatus)) {
            const resultData = await getQueueResult<{
              vocals?: { url?: string };
              drums?: { url?: string };
              bass?: { url?: string };
              other?: { url?: string };
            }>(requestId, FAL_MODELS.STEM_SEPARATE);
            
            logger.info('[Workflow] Stem separation completed', { requestId });
            
            res.json({
              success: true,
              stems: {
                vocals: resultData.vocals?.url || null,
                drums: resultData.drums?.url || null,
                bass: resultData.bass?.url || null,
                other: resultData.other?.url || null
              },
              remainingCredits: updateResult.credits,
              creditsDeducted: creditsRequired
            });
            return;
          } else if (isStatusFailed(normalizedStatus)) {
            await refundCredits(user, creditsRequired, 'Stem separation failed');
            res.status(500).json({ success: false, error: 'Stem separation failed' });
            return;
          }
        } catch (pollError) {
          logger.warn('Stem separation polling error', { error: (pollError as Error).message });
        }
      }
      
      await refundCredits(user, creditsRequired, 'Stem separation timed out');
      res.status(504).json({ success: false, error: 'Stem separation timed out' });
    } catch (error) {
      const err = error as Error;
      logger.error('[Workflow] Stem separation error', { error: err.message });
      res.status(500).json({ success: false, error: err.message });
    }
  });
  
  return router;
}

export default createWorkflowRoutes;
