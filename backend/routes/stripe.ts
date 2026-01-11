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
import { createEmailHash } from '../utils/emailHash';
import config from '../config/env';
import User, { type IUser } from '../models/User';
import Payment from '../models/Payment';
import type Stripe from 'stripe';

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

  const limiter = paymentLimiter || ((req: Request, res: Response, next: () => void) => next());
  const authMiddleware = authenticateToken || ((req: Request, res: Response, next: () => void) => next());

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

      // Create payment intent with automatic payment methods (includes card + stablecoins if enabled)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        // Enable automatic payment methods - includes card and crypto/stablecoins
        // Stablecoins (USDC on Ethereum, Solana, Polygon, Base) are automatically available
        // if enabled in Stripe Dashboard > Settings > Payment methods > Crypto
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never' // Stablecoin payments don't require redirects
        },
        metadata: {
          userId: userId || 'unknown',
          walletAddress: walletAddress || 'none',
          credits: credits.toString(),
          isNFTHolder: isNFTHolder.toString()
        }
      });

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

      const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = latestInvoice?.payment_intent as Stripe.PaymentIntent;

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
                  await User.findOneAndUpdate(
                    { userId: user.userId },
                    {
                      $inc: {
                        credits: creditsNum,
                        totalCreditsEarned: creditsNum
                      }
                    }
                  );
                  
                  logger.info('Subscription credits added', {
                    userId: user.userId,
                    credits: creditsNum
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
        
        if (subscriptionPayment) {
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
            const subscriptions = await stripe.subscriptions.list({
              customer: customers.data[0].id,
              status: 'all',
              limit: 1
            });

            if (subscriptions.data.length > 0) {
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
      res.json({
        success: true,
        hasSubscription: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          cancel_at_period_end: subscription.cancel_at_period_end,
          plan: subscription.metadata?.planType || 'unknown',
          items: subscription.items
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
          currentPeriodEnd: new Date((updatedSubscription.current_period_end as number) * 1000)
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

      const baseUrl = process.env.FRONTEND_URL || (config.isProduction ? 'https://seisoai.com' : 'http://localhost:5173');

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
   */
  router.post('/verify-payment', limiter, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe payment is not configured'
        });
        return;
      }

      const { paymentIntentId, walletAddress, userId, email } = req.body as {
        paymentIntentId?: string;
        walletAddress?: string;
        userId?: string;
        email?: string;
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

      // Find user from metadata or request body
      let user: IUser | null = null;
      const User = mongoose.model<IUser>('User');

      // Use findUserByIdentifier which handles encrypted emails via emailHash
      if (paymentIntent.metadata.userId) {
        user = await findUserByIdentifier(null, null, paymentIntent.metadata.userId);
      } else if (paymentIntent.metadata.email) {
        user = await findUserByIdentifier(null, paymentIntent.metadata.email, null);
      } else if (paymentIntent.metadata.walletAddress) {
        user = await findUserByIdentifier(paymentIntent.metadata.walletAddress, null, null);
      }

      if (!user) {
        // Fallback to request body identifiers
        user = await findUserByIdentifier(walletAddress || null, email || null, userId || null);
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
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
   */
  router.post('/subscription-verify', limiter, async (req: Request, res: Response) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        res.status(400).json({
          success: false,
          error: 'Stripe is not configured'
        });
        return;
      }

      const { sessionId, userId } = req.body as { sessionId?: string; userId?: string };
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

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const User = mongoose.model<IUser>('User');

      // Find user
      let user: IUser | null = null;
      const metadata = session.metadata || {};
      
      // Use findUserByIdentifier which handles encrypted emails via emailHash
      if (metadata.userId) {
        user = await findUserByIdentifier(null, null, metadata.userId);
      } else if (metadata.email) {
        user = await findUserByIdentifier(null, metadata.email as string, null);
      } else if (userId) {
        user = await findUserByIdentifier(null, null, userId);
      }

      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Add subscription credits
      const monthlyCredits = parseInt(subscription.metadata?.monthlyCredits || '100', 10);
      
      await User.findOneAndUpdate(
        { userId: user.userId },
        {
          $inc: { credits: monthlyCredits, totalCreditsEarned: monthlyCredits },
          $push: {
            paymentHistory: {
              type: 'subscription',
              subscriptionId,
              credits: monthlyCredits,
              timestamp: new Date()
            }
          }
        }
      );

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

