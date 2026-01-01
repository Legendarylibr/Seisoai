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
  
  // Utility routes (health, cors-info, logging)
  router.use('/', createUtilityRoutes(deps));
  
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
  
  // Generation
  router.use('/generate', createGenerationRoutes(deps));
  
  // Extract layers
  router.use('/', createExtractRoutes(deps));
  
  // WAN Animate
  router.use('/wan-animate', createWanAnimateRoutes(deps));
  
  // Payments
  const paymentRoutes = createPaymentRoutes(deps);
  router.use('/payments', paymentRoutes);
  router.use('/payment', paymentRoutes);
  
  // Stripe
  router.use('/stripe', createStripeRoutes(deps));
  
  // RPC routes
  router.use('/', createRpcRoutes(deps));
  
  // Admin routes
  router.use('/admin', createAdminRoutes(deps));

  // 404 handler for API routes
  router.use('*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found'
    });
  });

  return router;
}

export default createApiRoutes;

