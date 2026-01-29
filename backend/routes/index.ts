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
import createPromptLabRoutes from './promptLab';
import createChatAssistantRoutes from './chatAssistant';
import createReferralRoutes from './referral';
import createPublicGalleryRoutes from './gallery-public';
import createAchievementRoutes from './achievements';
// DISABLED: ERC-8004 Agent Registry - not used initially
// import agentRoutes from './agents';
import { adminIPAllowlist } from '../middleware/ipAllowlist';
import { getCSRFToken } from '../middleware/csrf';

// Types - generic interface that accepts any deps object
// Each route module defines its own specific Dependencies interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dependencies = Record<string, any>;

/**
 * Create and configure all API routes
 */
export function createApiRoutes(deps: Dependencies) {
  const router = Router();

  // ============================================
  // CSRF Token Endpoint
  // ============================================
  router.get('/csrf-token', getCSRFToken);

  // ============================================
  // Static & Utility Routes (mounted at root)
  // ============================================
  router.use('/', createStaticRoutes(deps as never));
  router.use('/', createUtilityRoutes(deps as never));
  router.use('/', createExtractRoutes(deps as never));
  router.use('/', createRpcRoutes(deps as never));

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
  // Referral System
  // Referral codes, stats, leaderboard, social sharing
  // ============================================
  router.use('/referral', createReferralRoutes(deps as never));

  // ============================================
  // Achievements & Gamification
  // Badges, milestones, leaderboards
  // ============================================
  router.use('/achievements', createAchievementRoutes(deps as never));

  // ============================================
  // Content Generation
  // Primary: /generate, Alias: /generations
  // ============================================
  const generationRoutes = createGenerationRoutes(deps as never);
  router.use('/generate', generationRoutes);
  router.use('/generations', generationRoutes);

  // ============================================
  // Media & Content Routes
  // ============================================
  router.use('/gallery', createGalleryRoutes(deps as never));
  router.use('/gallery', createPublicGalleryRoutes(deps as never));
  router.use('/audio', createAudioRoutes(deps as never));
  router.use('/image-tools', createImageToolsRoutes(deps as never));
  router.use('/workflows', createWorkflowRoutes(deps as never));
  router.use('/model3d', createModel3dRoutes(deps as never));
  router.use('/wan-animate', createWanAnimateRoutes(deps as never));
  router.use('/prompt-lab', createPromptLabRoutes(deps as never));
  router.use('/chat-assistant', createChatAssistantRoutes(deps as never));

  // ============================================
  // ERC-8004 Agents (DISABLED - not used initially)
  // Agent registry, reputation, and management
  // Uncomment when ready to enable agent functionality
  // ============================================
  // router.use('/agents', agentRoutes);

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
  router.use('/gdpr', createGDPRRoutes(deps as never));

  // ============================================
  // Session Management (Enterprise)
  // View/revoke active sessions
  // ============================================
  router.use('/sessions', createSessionRoutes(deps as never));

  // ============================================
  // Audit Logs (Enterprise - Admin only with IP allowlist)
  // Query, export, verify audit logs
  // ============================================
  router.use('/audit', adminIPAllowlist, createAuditRoutes(deps as never));

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
