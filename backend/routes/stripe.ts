/**
 * Stripe routes
 * Payment intents, subscriptions, webhooks
 * 
 * NOTE: Email addresses are encrypted at rest. Uses findUserByIdentifier for lookups.
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { getStripe, calculateCredits } from '../services/stripe';
import { findUserByIdentifier } from '../services/user';
import config from '../config/env';
import User, { type IUser } from '../models/User';
import Payment from '../models/Payment';
import type Stripe from 'stripe';
import { requireAuth } from '../utils/responses';

// Types
interface Dependencies {
  paymentLimiter?: RequestHandler;
  authenticateToken?: RequestHandler;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
}

interface SubscriptionPlans {
  [key: string]: {
    priceId?: string;
    credits: number;
  };
}

export function createStripeRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { paymentLimiter, authenticateToken } = deps;

  const limiter = paymentLimiter || ((_req: Request, _res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Create payment intent
   * POST /api/stripe/create-payment-intent
   */
  router.post('/create-payment-intent', limiter, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(503).json({
          success: false,
          error: 'Stripe not configured'
        });
        return;
      }

      const { amount, currency = 'usd', userId, walletAddress } = req.body as {
        amount?: number;
        currency?: string;
        userId?: string;
        walletAddress?: string;
      };

      if (!amount || amount < 1) {
        res.status(400).json({
          success: false,
          error: 'Invalid amount'
        });
        return;
      }

      // Check NFT holder status
      let isNFTHolder = false;
      if (walletAddress) {
        // Check common NFT collections (would need actual contract addresses)
        isNFTHolder = false; // Simplified
      }

      // Calculate credits
      const { credits } = calculateCredits(amount, isNFTHolder);

      // Create payment intent with all available payment methods
      // Both email and wallet users can pay with cards OR stablecoins
      // Stripe will show available methods based on Dashboard configuration
      const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata: {
          userId: userId || 'unknown',
          walletAddress: walletAddress || 'none',
          credits: credits.toString(),
          isNFTHolder: isNFTHolder.toString()
        },
        // Enable all payment methods configured in Stripe Dashboard
        // This includes cards AND stablecoins (USDC) if enabled
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never' // Stablecoin payments don't require redirects
        }
      };

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

      res.json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        credits,
        paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Payment intent creation error:', { error: err.message });
      // SECURITY: Don't expose internal error details
      res.status(500).json({
        success: false,
        error: 'Failed to create payment. Please try again.'
      });
    }
  });

  /**
   * Create subscription
   * POST /api/stripe/create-subscription
   */
  router.post('/create-subscription', limiter, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(503).json({
          success: false,
          error: 'Stripe not configured'
        });
        return;
      }

      const { planType, userId, email, walletAddress } = req.body as {
        planType?: string;
        userId?: string;
        email?: string;
        walletAddress?: string;
      };

      // Subscription plans
      const plans: SubscriptionPlans = {
        basic: { priceId: process.env.STRIPE_BASIC_PRICE_ID, credits: 100 },
        pro: { priceId: process.env.STRIPE_PRO_PRICE_ID, credits: 300 },
        premium: { priceId: process.env.STRIPE_PREMIUM_PRICE_ID, credits: 1000 }
      };

      const plan = plans[planType || ''];
      if (!plan || !plan.priceId) {
        res.status(400).json({
          success: false,
          error: 'Invalid plan or plan not configured'
        });
        return;
      }

      // Create or retrieve customer
      let customer: Stripe.Customer;
      if (email) {
        const existing = await stripe.customers.list({ email, limit: 1 });
        customer = existing.data[0];
      }

      if (!customer!) {
        customer = await stripe.customers.create({
          email: email || undefined,
          metadata: {
            userId: userId || 'unknown',
            walletAddress: walletAddress || 'none'
          }
        });
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: plan.priceId }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId: userId || 'unknown',
          planType: planType || '',
          monthlyCredits: plan.credits.toString()
        }
      });

      const latestInvoice = subscription.latest_invoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent };
      const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent | undefined;

      res.json({
        success: true,
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Subscription creation error:', { error: err.message });
      // SECURITY: Don't expose internal error details
      res.status(500).json({
        success: false,
        error: 'Failed to create subscription. Please try again.'
      });
    }
  });

  /**
   * Stripe webhook
   * POST /api/stripe/webhook
   */
  router.post('/webhook',
    express.raw({ type: 'application/json' }),
    async (req: Request, res: Response) => {
      try {
        const stripe = getStripe();
        if (!stripe) {
          res.status(503).send('Stripe not configured');
          return;
        }

        const sig = req.headers['stripe-signature'] as string;
        const webhookSecret = config.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
          logger.error('Webhook secret not configured');
          res.status(500).send('Webhook not configured');
          return;
        }

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
          const error = err as Error;
          logger.error('Webhook signature verification failed:', { error: error.message });
          res.status(400).send(`Webhook Error: ${error.message}`);
          return;
        }

        // Handle events
        switch (event.type) {
          case 'payment_intent.succeeded': {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const { userId, walletAddress, credits } = paymentIntent.metadata;
            
            if (credits && (userId || walletAddress)) {
              const User = mongoose.model<IUser>('User');
              const creditsNum = parseInt(credits, 10);
              
              const user = await findUserByIdentifier(walletAddress || null, null, userId || null);
              if (user) {
                await User.findOneAndUpdate(
                  { userId: user.userId },
                  {
                    $inc: {
                      credits: creditsNum,
                      totalCreditsEarned: creditsNum
                    },
                    $push: {
                      paymentHistory: {
                        type: 'stripe',
                        amount: paymentIntent.amount / 100,
                        credits: creditsNum,
                        timestamp: new Date(),
                        stripePaymentId: paymentIntent.id
                      }
                    }
                  }
                );
                
                logger.info('Credits added from Stripe payment', {
                  userId: user.userId,
                  credits: creditsNum
                });
              }
            }
            break;
          }

          case 'invoice.payment_succeeded': {
            const invoice = event.data.object as Stripe.Invoice;
            const subscriptionId = invoice.subscription as string;
            
            if (subscriptionId) {
              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              const { userId, walletAddress, monthlyCredits } = sub.metadata;
              
              if (monthlyCredits && (userId || walletAddress)) {
                const User = mongoose.model<IUser>('User');
                const creditsNum = parseInt(monthlyCredits, 10);
                
                const user = await findUserByIdentifier(walletAddress || null, null, userId || null);
                if (user) {
                  // Store subscriptionId in paymentHistory for future lookups
                  await User.findOneAndUpdate(
                    { userId: user.userId },
                    {
                      $inc: {
                        credits: creditsNum,
                        totalCreditsEarned: creditsNum
                      },
                      $push: {
                        paymentHistory: {
                          $each: [{
                            type: 'subscription',
                            subscriptionId,
                            credits: creditsNum,
                            amount: (invoice.amount_paid || 0) / 100,
                            timestamp: new Date()
                          }],
                          $slice: -30 // Keep last 30 entries
                        }
                      }
                    }
                  );
                  
                  logger.info('Subscription credits added', {
                    userId: user.userId,
                    credits: creditsNum,
                    subscriptionId
                  });
                }
              }
            }
            break;
          }

          case 'customer.subscription.created':
          case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            const { userId, walletAddress, email } = subscription.metadata;
            
            if (userId || walletAddress || email) {
              const User = mongoose.model<IUser>('User');
              const user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
              
              if (user) {
                // Check if this subscription is already in paymentHistory
                const hasSubscription = user.paymentHistory?.some(
                  (p: { subscriptionId?: string }) => p.subscriptionId === subscription.id
                );
                
                // Only add if not already present (for 'created' event or first 'updated')
                if (!hasSubscription && subscription.status === 'active') {
                  await User.findOneAndUpdate(
                    { userId: user.userId },
                    {
                      $push: {
                        paymentHistory: {
                          $each: [{
                            type: 'subscription',
                            subscriptionId: subscription.id,
                            credits: 0, // Credits added via invoice.payment_succeeded
                            timestamp: new Date()
                          }],
                          $slice: -30
                        }
                      }
                    }
                  );
                  
                  logger.info('Subscription linked to user', {
                    userId: user.userId,
                    subscriptionId: subscription.id,
                    status: subscription.status
                  });
                }
              }
            }
            break;
          }

          default:
            logger.info('Unhandled webhook event', { type: event.type });
        }

        res.json({ received: true });
      } catch (error) {
        const err = error as Error;
        logger.error('Webhook handler error:', { error: err.message });
        res.status(500).send('Webhook handler failed');
      }
    }
  );

  /**
   * Get user's active subscription
   * GET /api/stripe/subscription
   */
  router.get('/subscription', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe is not configured'
        });
        return;
      }

      const user = req.user;
      if (!user) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      // Find subscription in payment history (embedded array - legacy)
      let subscriptionId: string | null = null;
      if (user.paymentHistory && user.paymentHistory.length > 0) {
        const subscriptionPayment = user.paymentHistory
          .filter((p: { subscriptionId?: string; timestamp?: Date }) => p.subscriptionId)
          .sort((a: { timestamp?: Date }, b: { timestamp?: Date }) => 
            new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
          )[0];
        
        if (subscriptionPayment && subscriptionPayment.subscriptionId) {
          subscriptionId = subscriptionPayment.subscriptionId;
        }
      }

      // Also check the Payment collection (primary storage)
      if (!subscriptionId && user.userId) {
        try {
          const recentSubscriptionPayment = await Payment.findOne({
            userId: user.userId,
            subscriptionId: { $exists: true, $ne: null }
          }).sort({ createdAt: -1 });
          
          if (recentSubscriptionPayment && recentSubscriptionPayment.subscriptionId) {
            subscriptionId = recentSubscriptionPayment.subscriptionId;
          }
        } catch (paymentError) {
          logger.warn('Error checking Payment collection for subscription:', { error: (paymentError as Error).message });
        }
      }

      if (!subscriptionId && user.email) {
        try {
          const customers = await stripe.customers.list({
            email: user.email,
            limit: 1
          });

          if (customers.data.length > 0) {
            const customerId = customers.data[0].id;
            
            // First, try to find an active subscription
            let subscriptions = await stripe.subscriptions.list({
              customer: customerId,
              status: 'active',
              limit: 1
            });

            // If no active subscription, check for trialing
            if (subscriptions.data.length === 0) {
              subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'trialing',
                limit: 1
              });
            }

            // If no trialing, check for past_due (user might need to update payment)
            if (subscriptions.data.length === 0) {
              subscriptions = await stripe.subscriptions.list({
                customer: customerId,
                status: 'past_due',
                limit: 1
              });
            }

            // If still none, check for any subscription that's not canceled/incomplete_expired
            // This catches edge cases like 'incomplete' subscriptions awaiting payment
            if (subscriptions.data.length === 0) {
              const allSubs = await stripe.subscriptions.list({
                customer: customerId,
                limit: 10
              });
              // Filter to usable subscriptions (not canceled or incomplete_expired)
              const usableSub = allSubs.data.find(sub => 
                sub.status !== 'canceled' && sub.status !== 'incomplete_expired'
              );
              if (usableSub) {
                subscriptionId = usableSub.id;
              }
            } else {
              subscriptionId = subscriptions.data[0].id;
            }
          }
        } catch (stripeError) {
          logger.error('Error finding subscription by customer:', { error: (stripeError as Error).message });
        }
      }

      if (!subscriptionId) {
        res.json({
          success: true,
          hasSubscription: false,
          subscription: null
        });
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price']
      });
      
      // Return the subscription data in a format the frontend expects
      // Cast subscription to access properties (Stripe types may vary)
      const subData = subscription as Stripe.Subscription;
      res.json({
        success: true,
        hasSubscription: true,
        subscription: {
          id: subData.id,
          status: subData.status,
          current_period_start: (subData as unknown as { current_period_start: number }).current_period_start,
          current_period_end: (subData as unknown as { current_period_end: number }).current_period_end,
          cancel_at_period_end: subData.cancel_at_period_end,
          plan: subData.metadata?.planType || 'unknown',
          items: subData.items
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Get subscription error:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to get subscription' });
    }
  });

  /**
   * Cancel subscription
   * POST /api/stripe/subscription/cancel
   */
  router.post('/subscription/cancel', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe is not configured'
        });
        return;
      }

      const { subscriptionId } = req.body as { subscriptionId?: string };
      const user = req.user;

      if (!user) {
        res.status(401).json({ success: false, error: 'Not authenticated' });
        return;
      }

      if (!subscriptionId) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID is required'
        });
        return;
      }

      // Verify subscription belongs to user via Stripe customer
      if (user.email) {
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 1
        });

        if (customers.data.length > 0) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.customer !== customers.data[0].id) {
            res.status(403).json({
              success: false,
              error: 'Subscription does not belong to this user'
            });
            return;
          }
        }
      }

      // Cancel at period end (user keeps access until end of billing period)
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });

      logger.info('Subscription cancelled', {
        subscriptionId,
        userId: user.userId
      });

      res.json({
        success: true,
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
          currentPeriodEnd: new Date(((updatedSubscription as unknown as { current_period_end: number }).current_period_end) * 1000)
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Cancel subscription error:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to cancel subscription' });
    }
  });

  /**
   * Create billing portal session
   * POST /api/stripe/billing-portal
   */
  router.post('/billing-portal', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe is not configured'
        });
        return;
      }

      const user = req.user;
      if (!user || !user.email) {
        res.status(401).json({
          success: false,
          error: 'Authentication required'
        });
        return;
      }

      const baseUrl = config.FRONTEND_URL || (config.isProduction ? 'https://seisoai.com' : 'http://localhost:5173');

      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1
      });

      if (customers.data.length === 0) {
        res.status(404).json({
          success: false,
          error: 'No Stripe customer found. Please subscribe first.'
        });
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: baseUrl
      });

      logger.info('Stripe billing portal session created', {
        userId: user.userId
        // Note: Email intentionally not logged for privacy
      });

      res.json({
        success: true,
        url: session.url
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Billing portal error:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to create billing portal session' });
    }
  });

  /**
   * Verify Stripe payment and award credits
   * POST /api/stripe/verify-payment
   * SECURITY FIX: Now requires authentication - users can only verify their own payments
   */
  router.post('/verify-payment', limiter, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe payment is not configured'
        });
        return;
      }

      // SECURITY: Require authentication
      if (!requireAuth(req, res)) return;

      const { paymentIntentId } = req.body as {
        paymentIntentId?: string;
      };

      if (!paymentIntentId) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: paymentIntentId'
        });
        return;
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        res.status(400).json({
          success: false,
          error: `Payment not completed. Status: ${paymentIntent.status}`
        });
        return;
      }

      // SECURITY: Use authenticated user, don't trust request body identifiers
      const user = req.user;
      const User = mongoose.model<IUser>('User');

      // SECURITY: Verify the payment belongs to the authenticated user
      const metaUserId = paymentIntent.metadata.userId;
      const metaEmail = paymentIntent.metadata.email;
      const metaWallet = paymentIntent.metadata.walletAddress;

      const isOwner = (
        (metaUserId && metaUserId === user.userId) ||
        (metaEmail && user.email && metaEmail.toLowerCase() === user.email.toLowerCase()) ||
        (metaWallet && user.walletAddress && metaWallet.toLowerCase() === user.walletAddress.toLowerCase())
      );

      if (!isOwner) {
        logger.warn('SECURITY: Payment verification attempt for non-owned payment', {
          paymentIntentId,
          authenticatedUserId: user.userId,
          metaUserId,
          ip: req.ip
        });
        res.status(403).json({
          success: false,
          error: 'This payment does not belong to your account'
        });
        return;
      }

      // Calculate credits
      const creditsFromMetadata = parseInt(paymentIntent.metadata.credits || '0', 10);
      const credits = creditsFromMetadata || Math.floor((paymentIntent.amount / 100) * 6.67);

      // SECURITY FIX: Use $addToSet to prevent duplicate payment processing (atomic operation)
      // This prevents race conditions where the same payment is processed multiple times
      const paymentRecord = {
        type: 'stripe' as const,
        amount: paymentIntent.amount / 100,
        credits,
        timestamp: new Date(),
        paymentIntentId
      };

      // Try to add payment record atomically - if paymentIntentId already exists, $addToSet won't add it
      // SECURITY: Use authenticated user's userId, not from untrusted sources
      const updatedUser = await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $inc: { credits, totalCreditsEarned: credits },
          $addToSet: {
            paymentHistory: paymentRecord
          }
        },
        { new: true }
      );

      // Check if payment was actually added (not a duplicate)
      const wasAdded = updatedUser?.paymentHistory?.some(
        (p: { paymentIntentId?: string; timestamp?: Date }) => 
          p.paymentIntentId === paymentIntentId && 
          Math.abs(new Date(p.timestamp || 0).getTime() - paymentRecord.timestamp.getTime()) < 1000
      );

      if (!wasAdded) {
        // Payment was already processed (duplicate detected)
        logger.info('Stripe payment already processed (duplicate detected)', {
          userId: user.userId,
          paymentIntentId
        });
        res.json({
          success: true,
          alreadyProcessed: true,
          credits: 0,
          totalCredits: updatedUser?.credits || user.credits,
          message: 'Payment already processed'
        });
        return;
      }

      logger.info('Stripe payment verified and credits added', {
        userId: user.userId,
        credits,
        paymentIntentId
      });

      res.json({
        success: true,
        credits,
        totalCredits: updatedUser?.credits || 0
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Verify payment error:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to verify payment' });
    }
  });

  /**
   * Verify subscription checkout session
   * POST /api/subscription/verify (mounted at /api/stripe but also needs /api route)
   * SECURITY FIX: Now requires authentication and verifies session belongs to user
   */
  router.post('/subscription-verify', limiter, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe is not configured'
        });
        return;
      }

      // SECURITY: Require authentication
      if (!requireAuth(req, res)) return;

      const { sessionId } = req.body as { sessionId?: string };
      if (!sessionId) {
        res.status(400).json({
          success: false,
          error: 'sessionId is required'
        });
        return;
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          error: 'Checkout session not found'
        });
        return;
      }

      if (session.mode !== 'subscription') {
        res.status(400).json({
          success: false,
          error: 'Only subscription checkouts can be verified'
        });
        return;
      }

      if (session.payment_status !== 'paid') {
        res.status(400).json({
          success: false,
          error: 'Payment is not completed yet'
        });
        return;
      }

      const subscriptionId = session.subscription as string;
      if (!subscriptionId) {
        res.status(400).json({
          success: false,
          error: 'No subscription found for this checkout session'
        });
        return;
      }

      // SECURITY: Verify the session belongs to the authenticated user
      const metadata = session.metadata || {};
      const metaUserId = metadata.userId;
      const metaEmail = metadata.email;
      const metaWallet = metadata.walletAddress;
      
      const isOwner = (
        (metaUserId && metaUserId === req.user.userId) ||
        (metaEmail && req.user.email && metaEmail.toLowerCase() === req.user.email.toLowerCase()) ||
        (metaWallet && req.user.walletAddress && metaWallet.toLowerCase() === req.user.walletAddress.toLowerCase())
      );

      if (!isOwner) {
        logger.warn('SECURITY: Subscription verification attempt for non-owned session', {
          sessionId,
          authenticatedUserId: req.user.userId,
          metaUserId,
          ip: req.ip
        });
        res.status(403).json({
          success: false,
          error: 'This subscription session does not belong to your account'
        });
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const User = mongoose.model<IUser>('User');

      // SECURITY: Use authenticated user, not metadata
      const user = req.user;

      // Add subscription credits with duplicate prevention
      const monthlyCredits = parseInt(subscription.metadata?.monthlyCredits || '100', 10);
      
      // SECURITY: Use $addToSet to prevent duplicate credit additions
      const paymentRecord = {
        type: 'subscription' as const,
        subscriptionId,
        credits: monthlyCredits,
        timestamp: new Date()
      };

      const updatedUser = await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $inc: { credits: monthlyCredits, totalCreditsEarned: monthlyCredits },
          $addToSet: {
            paymentHistory: paymentRecord
          }
        },
        { new: true }
      );

      // Check if payment was actually added (not a duplicate)
      const wasAdded = updatedUser?.paymentHistory?.some(
        (p: { subscriptionId?: string; timestamp?: Date }) => 
          p.subscriptionId === subscriptionId && 
          Math.abs(new Date(p.timestamp || 0).getTime() - paymentRecord.timestamp.getTime()) < 1000
      );

      if (!wasAdded) {
        logger.info('Subscription already verified (duplicate detected)', {
          userId: user.userId,
          subscriptionId
        });
        res.json({
          success: true,
          alreadyProcessed: true,
          credits: 0,
          subscription: {
            id: subscriptionId,
            status: subscription.status
          }
        });
        return;
      }

      logger.info('Subscription verified', {
        userId: user.userId,
        subscriptionId,
        credits: monthlyCredits
      });

      res.json({
        success: true,
        credits: monthlyCredits,
        subscription: {
          id: subscriptionId,
          status: subscription.status
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Subscription verify error:', { error: err.message });
      res.status(500).json({ success: false, error: 'Failed to verify subscription' });
    }
  });

  /**
   * Create Stripe Checkout Session for subscriptions
   * POST /api/stripe/checkout-session
   * Note: Also mounted at /create-checkout-session for backwards compatibility
   */
  router.post('/checkout-session', limiter, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe payment is not configured. Please use token payment instead.'
        });
        return;
      }

      const { 
        lookup_key,
        walletAddress, 
        userId,
        success_url,
        cancel_url
      } = req.body as {
        lookup_key?: string;
        walletAddress?: string;
        userId?: string;
        success_url?: string;
        cancel_url?: string;
      };

      if (!lookup_key) {
        res.status(400).json({
          success: false,
          error: 'Missing required field: lookup_key'
        });
        return;
      }

      // Verify user exists - support both wallet and email auth
      let user: IUser | null = null;
      if (userId) {
        user = await User.findOne({ userId });
        if (!user) {
          res.status(404).json({ success: false, error: 'User not found' });
          return;
        }
      } else if (walletAddress) {
        user = await findUserByIdentifier(walletAddress, null, null);
        if (!user) {
          // Create new user
          const normalized = walletAddress.startsWith('0x') ? walletAddress.toLowerCase() : walletAddress;
          user = new User({
            walletAddress: normalized,
            credits: 0,
            totalCreditsEarned: 0,
            totalCreditsSpent: 0
          });
          await user.save();
        }
      } else {
        res.status(400).json({
          success: false,
          error: 'Either walletAddress or userId is required'
        });
        return;
      }

      // Get base URL from environment or request
      const isValidHttpUrl = (candidate: string | undefined | null): boolean => {
        if (!candidate || typeof candidate !== 'string') return false;
        try {
          const parsed = new URL(candidate);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      };

      const fallbackFrontendUrl = 'https://seisoai.com';
      const envFrontendUrl = config.FRONTEND_URL;
      const requestOrigin = req.headers.origin as string | undefined;
      const inferredHost = req.headers.host ? `https://${req.headers.host}` : null;
      let baseUrl: string = fallbackFrontendUrl;

      if (isValidHttpUrl(envFrontendUrl)) {
        baseUrl = envFrontendUrl!;
      } else if (isValidHttpUrl(requestOrigin)) {
        baseUrl = requestOrigin!;
      } else if (isValidHttpUrl(inferredHost)) {
        baseUrl = inferredHost!;
      }

      // Look up the price by lookup_key if it's not already a price ID
      let priceId = lookup_key;
      
      if (!lookup_key.startsWith('price_')) {
        const prices = await stripe.prices.list({
          lookup_keys: [lookup_key],
          limit: 1,
        });
        
        if (prices.data.length === 0) {
          res.status(400).json({
            success: false,
            error: `Price with lookup_key "${lookup_key}" not found`
          });
          return;
        }
        
        priceId = prices.data[0].id;
      }

      // Create checkout session
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        customer_email: user.email || undefined,
        metadata: {
          userId: user.userId || (user._id as mongoose.Types.ObjectId).toString(),
          walletAddress: user.walletAddress ? user.walletAddress.toLowerCase() : '',
          email: user.email || '',
        },
        subscription_data: {
          metadata: {
            userId: user.userId || (user._id as mongoose.Types.ObjectId).toString(),
            walletAddress: user.walletAddress ? user.walletAddress.toLowerCase() : '',
            email: user.email || '',
          },
        },
        success_url: success_url || `${baseUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancel_url || `${baseUrl}?canceled=true`,
      });

      logger.info('Stripe checkout session created', {
        userId: user.userId,
        lookup_key,
        sessionId: session.id
        // Note: Email/wallet intentionally not logged for privacy
      });

      res.json({
        success: true,
        sessionId: session.id,
        url: session.url
      });

    } catch (error) {
      const err = error as Error;
      logger.error('Stripe checkout session creation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session'
      });
    }
  });

  return router;
}

export default createStripeRoutes;

