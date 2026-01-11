/**
 * API Routes Index
 * Central router for all API endpoints
 * 
 * Route Organization:
 * - Primary routes use the canonical path
 * - Legacy aliases are documented for backward compatibility
 */
import { Router, type Request, type Response } from 'express';
import createAuthRoutes from './auth';
import createDiscordRoutes from './discord';
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
import createModel3dRoutes from './model3d';
import createGDPRRoutes from './gdpr';
import createSessionRoutes from './sessions';
import createAuditRoutes from './audit';
import { adminIPAllowlist } from '../middleware/ipAllowlist';

// Types
interface Dependencies {
  [key: string]: unknown;
}

/**
 * Create and configure all API routes
 */
export function createApiRoutes(deps: Dependencies) {
  const router = Router();

  // ============================================
  // Static & Utility Routes (mounted at root)
  // ============================================
  router.use('/', createStaticRoutes(deps));
  router.use('/', createUtilityRoutes(deps));
  router.use('/', createExtractRoutes(deps));
  router.use('/', createRpcRoutes(deps));

  // ============================================
  // Authentication
  // ============================================
  router.use('/auth', createAuthRoutes(deps));
  router.use('/auth/discord', createDiscordRoutes(deps));

  // ============================================
  // User Management
  // Primary: /user, Aliases: /credits, /nft, /users
  // ============================================
  const userRoutes = createUserRoutes(deps);
  router.use('/user', userRoutes);
  // Legacy aliases for backward compatibility
  router.use('/credits', userRoutes);
  router.use('/nft', userRoutes);
  router.use('/users', userRoutes);

  // ============================================
  // Content Generation
  // Primary: /generate, Alias: /generations
  // ============================================
  const generationRoutes = createGenerationRoutes(deps);
  router.use('/generate', generationRoutes);
  router.use('/generations', generationRoutes);

  // ============================================
  // Media & Content Routes
  // ============================================
  router.use('/gallery', createGalleryRoutes(deps));
  router.use('/audio', createAudioRoutes(deps));
  router.use('/image-tools', createImageToolsRoutes(deps));
  router.use('/workflows', createWorkflowRoutes(deps));
  router.use('/model3d', createModel3dRoutes(deps));
  router.use('/wan-animate', createWanAnimateRoutes(deps));

  // ============================================
  // Payments
  // Primary: /payments, Alias: /payment
  // ============================================
  const paymentRoutes = createPaymentRoutes(deps);
  router.use('/payments', paymentRoutes);
  router.use('/payment', paymentRoutes);

  // Stripe payments & subscriptions
  const stripeRoutes = createStripeRoutes(deps);
  router.use('/stripe', stripeRoutes);
  
  // Subscription verification alias
  router.post('/subscription/verify', (req, res, next) => {
    req.url = '/subscription-verify';
    stripeRoutes(req, res, next);
  });

  // ============================================
  // Admin (with IP allowlist)
  // ============================================
  router.use('/admin', adminIPAllowlist, createAdminRoutes(deps));

  // ============================================
  // GDPR Compliance (Enterprise)
  // Data export, deletion, rectification
  // ============================================
  router.use('/gdpr', createGDPRRoutes(deps));

  // ============================================
  // Session Management (Enterprise)
  // View/revoke active sessions
  // ============================================
  router.use('/sessions', createSessionRoutes(deps));

  // ============================================
  // Audit Logs (Enterprise - Admin only with IP allowlist)
  // Query, export, verify audit logs
  // ============================================
  router.use('/audit', adminIPAllowlist, createAuditRoutes(deps));

  // ============================================
  // 404 Handler
  // ============================================
  router.use('*', (_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'API endpoint not found'
    });
  });

  return router;
}

export default createApiRoutes;
