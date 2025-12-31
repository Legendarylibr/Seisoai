/**
 * API Routes Index
 * Central router for all API endpoints
 */
import { Router } from 'express';
import createAuthRoutes from './auth.js';
import createUtilityRoutes from './utility.js';
import createGenerationRoutes from './generate.js';
import createPaymentRoutes from './payments.js';
import createStripeRoutes from './stripe.js';
import createUserRoutes from './user.js';
import createWanAnimateRoutes from './wan-animate.js';
import createAdminRoutes from './admin.js';
import createRpcRoutes from './rpc.js';
import createGalleryRoutes from './gallery.js';
import createStaticRoutes from './static.js';
import createExtractRoutes from './extract.js';

/**
 * Create and configure all API routes
 */
export function createApiRoutes(deps) {
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
  router.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found'
    });
  });

  return router;
}

export default createApiRoutes;
