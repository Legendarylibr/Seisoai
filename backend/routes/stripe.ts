/**
 * Stripe routes
 * Payment intents, subscriptions, webhooks
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import express from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { getStripe, calculateCredits } from '../services/stripe';
import { findUserByIdentifier } from '../services/user';
import config from '../config/env';
import type { IUser } from '../models/User';
import type Stripe from 'stripe';

// Types
interface Dependencies {
  paymentLimiter?: RequestHandler;
}

interface SubscriptionPlans {
  [key: string]: {
    priceId?: string;
    credits: number;
  };
}

export function createStripeRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { paymentLimiter } = deps;

  const limiter = paymentLimiter || ((req: Request, res: Response, next: () => void) => next());

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

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
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
      res.status(500).json({
        success: false,
        error: err.message
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
      res.status(500).json({
        success: false,
        error: err.message
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

  return router;
}

export default createStripeRoutes;

