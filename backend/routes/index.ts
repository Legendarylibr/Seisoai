/**
 * API Routes Index
 * Central router for all API endpoints
 */
import { Router, type Request, type Response } from 'express';
import createAuthRoutes from './auth';
import createUtilityRoutes from './utility';
import createGenerationRoutes from './generate';
import createPaymentRoutes from './payments';
import createStripeRoutes from './stripe';
import createUserRoutes from './user';
import createWanAnimateRoutes from './wan-animate';
import createAdminRoutes from './admin';
import createRpcRoutes from './rpc';
import createGalleryRoutes from './gallery';
import createStaticRoutes from './static';
import createExtractRoutes from './extract';
import createAudioRoutes from './audio';
import createImageToolsRoutes from './image-tools';
import createWorkflowRoutes from './workflows';

// Types
interface Dependencies {
  [key: string]: unknown;
}

/**
 * Create and configure all API routes
 */
export function createApiRoutes(deps: Dependencies) {
  const router = Router();

  // Static routes (robots.txt, favicon, metrics, home)
  const staticRouter = createStaticRoutes(deps);
  router.use('/', staticRouter);
  
  // Utility routes (health, cors-info, logging, safety)
  const utilityRoutes = createUtilityRoutes(deps);
  router.use('/', utilityRoutes);
  router.use('/safety', utilityRoutes);
  
  // Authentication
  router.use('/auth', createAuthRoutes(deps));
  
  // User management
  const userRoutes = createUserRoutes(deps);
  router.use('/user', userRoutes);
  router.use('/credits', userRoutes);
  
  // Gallery
  const galleryRoutes = createGalleryRoutes(deps);
  router.use('/gallery', galleryRoutes);
  
  // NFT routes (reuse user routes)
  router.use('/nft', userRoutes);
  
  // Users lookup (GET /api/users/:walletAddress)
  router.use('/users', userRoutes);
  
  // Generation
  const generationRoutes = createGenerationRoutes(deps);
  router.use('/generate', generationRoutes);
  
  // Generations history (POST /api/generations/add)
  router.use('/generations', generationRoutes);
  
  // Extract layers
  router.use('/', createExtractRoutes(deps));
  
  // WAN Animate
  router.use('/wan-animate', createWanAnimateRoutes(deps));
  
  // Audio routes (voice clone, TTS, lip sync, audio separation, SFX)
  router.use('/audio', createAudioRoutes(deps));
  
  // Image tools (face swap, inpaint, describe)
  router.use('/image-tools', createImageToolsRoutes(deps));
  
  // Multi-step workflows (AI Influencer, Music Video, Avatar Creator, Remix Visualizer)
  router.use('/workflows', createWorkflowRoutes(deps));
  
  // Payments
  const paymentRoutes = createPaymentRoutes(deps);
  router.use('/payments', paymentRoutes);
  router.use('/payment', paymentRoutes);
  
  // Stripe
  const stripeRoutes = createStripeRoutes(deps);
  router.use('/stripe', stripeRoutes);
  
  // Subscription routes (alias for stripe subscription-verify)
  router.post('/subscription/verify', (req, res, next) => {
    // Forward to stripe subscription-verify
    req.url = '/subscription-verify';
    stripeRoutes(req, res, next);
  });
  
  // RPC routes
  router.use('/', createRpcRoutes(deps));
  
  // Admin routes
  router.use('/admin', createAdminRoutes(deps));

  // 404 handler for API routes
  router.use('*', (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found'
    });
  });

  return router;
}

export default createApiRoutes;

