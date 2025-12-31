/**
 * Stripe routes
 * Payment intents, subscriptions, webhooks
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import express from 'express';
import logger from '../utils/logger.js';
import { getStripe, calculateCredits } from '../services/stripe.js';
import { findUserByIdentifier } from '../services/user.js';
import { checkNFTBalance } from '../services/blockchain.js';
import config from '../config/env.js';

export function createStripeRoutes(deps) {
  const router = Router();
  const { paymentLimiter } = deps;

  /**
   * Create payment intent
   * POST /api/stripe/create-payment-intent
   */
  router.post('/create-payment-intent', paymentLimiter, async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({
          success: false,
          error: 'Stripe not configured'
        });
      }

      const { amount, currency = 'usd', userId, walletAddress } = req.body;

      if (!amount || amount < 1) {
        return res.status(400).json({
          success: false,
          error: 'Invalid amount'
        });
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
      logger.error('Payment intent creation error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Create subscription
   * POST /api/stripe/create-subscription
   */
  router.post('/create-subscription', paymentLimiter, async (req, res) => {
    try {
      const stripe = getStripe();
      if (!stripe) {
        return res.status(503).json({
          success: false,
          error: 'Stripe not configured'
        });
      }

      const { planType, userId, email, walletAddress } = req.body;

      // Subscription plans
      const plans = {
        basic: { priceId: process.env.STRIPE_BASIC_PRICE_ID, credits: 100 },
        pro: { priceId: process.env.STRIPE_PRO_PRICE_ID, credits: 300 },
        premium: { priceId: process.env.STRIPE_PREMIUM_PRICE_ID, credits: 1000 }
      };

      const plan = plans[planType];
      if (!plan || !plan.priceId) {
        return res.status(400).json({
          success: false,
          error: 'Invalid plan or plan not configured'
        });
      }

      // Create or retrieve customer
      let customer;
      if (email) {
        const existing = await stripe.customers.list({ email, limit: 1 });
        customer = existing.data[0];
      }

      if (!customer) {
        customer = await stripe.customers.create({
          email,
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
          planType,
          monthlyCredits: plan.credits.toString()
        }
      });

      res.json({
        success: true,
        subscriptionId: subscription.id,
        clientSecret: subscription.latest_invoice.payment_intent.client_secret
      });
    } catch (error) {
      logger.error('Subscription creation error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * Stripe webhook
   * POST /api/stripe/webhook
   */
  router.post('/webhook',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      try {
        const stripe = getStripe();
        if (!stripe) {
          return res.status(503).send('Stripe not configured');
        }

        const sig = req.headers['stripe-signature'];
        const webhookSecret = config.STRIPE_WEBHOOK_SECRET;

        if (!webhookSecret) {
          logger.error('Webhook secret not configured');
          return res.status(500).send('Webhook not configured');
        }

        let event;
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
          logger.error('Webhook signature verification failed:', { error: err.message });
          return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Handle events
        switch (event.type) {
          case 'payment_intent.succeeded': {
            const paymentIntent = event.data.object;
            const { userId, walletAddress, credits } = paymentIntent.metadata;
            
            if (credits && (userId || walletAddress)) {
              const User = mongoose.model('User');
              const creditsNum = parseInt(credits, 10);
              
              const user = await findUserByIdentifier(walletAddress, null, userId);
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
                        paymentIntentId: paymentIntent.id
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
            const invoice = event.data.object;
            const subscription = invoice.subscription;
            
            if (subscription) {
              const sub = await stripe.subscriptions.retrieve(subscription);
              const { userId, walletAddress, monthlyCredits } = sub.metadata;
              
              if (monthlyCredits && (userId || walletAddress)) {
                const User = mongoose.model('User');
                const creditsNum = parseInt(monthlyCredits, 10);
                
                const user = await findUserByIdentifier(walletAddress, null, userId);
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
        logger.error('Webhook handler error:', { error: error.message });
        res.status(500).send('Webhook handler failed');
      }
    }
  );

  return router;
}

export default createStripeRoutes;



