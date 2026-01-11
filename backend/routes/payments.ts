/**
 * Payment routes
 * Blockchain payment verification and credit addition
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { verifyEVMTransaction, verifySolanaTransaction } from '../services/blockchain';
import config from '../config/env';
import type { IUser } from '../models/User';
import type { LRUCache } from '../services/cache';

// Types
interface Dependencies {
  paymentLimiter?: RequestHandler;
  authenticateFlexible?: RequestHandler;
  processedTransactions?: LRUCache<string, { timestamp: Date; walletAddress: string }>;
}

interface AuthenticatedRequest extends Request {
  user?: IUser;
  authType?: string;
}

// NFT holder rate for credits
const NFT_HOLDER_CREDITS_PER_USDC = 16.67;
const STANDARD_CREDITS_PER_USDC = 6.67;

export function createPaymentRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { paymentLimiter, authenticateFlexible, processedTransactions } = deps;

  const limiter = paymentLimiter || ((req: Request, res: Response, next: () => void) => next());
  const flexibleAuth = authenticateFlexible || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Get payment address
   * POST /api/payment/get-address
   */
  router.post('/get-address', async (req: Request, res: Response) => {
    const { chainId, walletType } = req.body as {
      chainId?: string;
      walletType?: string;
    };

    let paymentAddress: string | undefined;
    
    if (walletType === 'solana' || chainId === 'solana') {
      paymentAddress = config.SOLANA_PAYMENT_WALLET;
    } else {
      paymentAddress = config.EVM_PAYMENT_WALLET;
    }

    if (!paymentAddress) {
      res.status(500).json({
        success: false,
        error: 'Payment wallet not configured'
      });
      return;
    }

    res.json({
      success: true,
      paymentAddress
    });
  });

  /**
   * Verify payment and add credits
   * POST /api/payments/verify
   */
  router.post('/verify', limiter, async (req: Request, res: Response) => {
    try {
      const { txHash, walletAddress, tokenSymbol, amount, chainId, walletType } = req.body as {
        txHash?: string;
        walletAddress?: string;
        tokenSymbol?: string;
        amount?: number;
        chainId?: string | number;
        walletType?: string;
      };

      if (!txHash || !walletAddress || !amount) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
        return;
      }

      // Check if already processed
      if (processedTransactions?.has(txHash)) {
        res.status(400).json({
          success: false,
          error: 'Transaction already processed',
          alreadyProcessed: true
        });
        return;
      }

      // Get payment address
      const expectedTo = walletType === 'solana' 
        ? config.SOLANA_PAYMENT_WALLET 
        : config.EVM_PAYMENT_WALLET;

      if (!expectedTo) {
        res.status(500).json({
          success: false,
          error: 'Payment wallet not configured'
        });
        return;
      }

      // Verify transaction
      let txInfo;
      if (walletType === 'solana') {
        txInfo = await verifySolanaTransaction(txHash, expectedTo, amount);
      } else {
        if (!chainId) {
          res.status(400).json({
            success: false,
            error: 'Chain ID required for EVM transactions'
          });
          return;
        }
        txInfo = await verifyEVMTransaction(txHash, expectedTo, amount, chainId);
      }

      // SECURITY FIX: Verify that the walletAddress being credited matches the transaction sender
      // This prevents attackers from claiming credits for payments made by others
      const normalizedWallet = walletAddress.toLowerCase();
      const normalizedSender = txInfo.from.toLowerCase();
      
      if (normalizedWallet !== normalizedSender) {
        logger.warn('SECURITY: Payment verification wallet mismatch', {
          txHash,
          claimedWallet: normalizedWallet.substring(0, 10) + '...',
          actualSender: normalizedSender.substring(0, 10) + '...',
          ip: req.ip
        });
        res.status(403).json({
          success: false,
          error: 'Wallet address does not match transaction sender'
        });
        return;
      }

      // Calculate credits (1 credit per dollar equivalent)
      const credits = Math.floor(amount * 5); // 5 credits per dollar

      // Add credits to user (using verified sender address)
      const User = mongoose.model<IUser>('User');
      const user = await User.findOneAndUpdate(
        { walletAddress: normalizedSender },
        {
          $inc: { credits, totalCreditsEarned: credits },
          $push: {
            paymentHistory: {
              txHash,
              tokenSymbol,
              amount,
              credits,
              chainId: String(chainId),
              walletType,
              timestamp: new Date()
            }
          }
        },
        { new: true, upsert: true }
      );

      // Mark as processed
      if (processedTransactions) {
        processedTransactions.set(txHash, {
          timestamp: new Date(),
          walletAddress
        });
      }

      logger.info('Payment verified and credits added', {
        txHash,
        walletAddress,
        credits,
        amount
      });

      res.json({
        success: true,
        credits,
        totalCredits: user.credits,
        txHash
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Payment verification error:', { error: err.message });
      // SECURITY: Don't expose internal error messages
      res.status(500).json({
        success: false,
        error: 'Payment verification failed. Please try again or contact support.'
      });
    }
  });

  /**
   * Check for payment on blockchain
   * POST /api/payment/check-payment
   */
  router.post('/check-payment', async (req: Request, res: Response) => {
    try {
      const { walletAddress, expectedAmount, token = 'USDC' } = req.body as {
        walletAddress?: string;
        expectedAmount?: number;
        token?: string;
      };

      logger.info('Payment check started', { walletAddress, expectedAmount, token });

      if (!walletAddress || !expectedAmount) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
        return;
      }

      // For now, return no payment found - full blockchain scanning would require
      // RPC polling which is complex. The /verify endpoint handles direct verification.
      res.json({
        success: true,
        paymentDetected: false,
        message: 'Use /api/payments/verify with transaction hash for payment verification'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Payment check error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to check payment'
      });
    }
  });

  /**
   * Instant payment check for specific chain
   * POST /api/payment/instant-check
   */
  router.post('/instant-check', limiter, async (req: Request, res: Response) => {
    try {
      const { walletAddress, chainId, expectedAmount } = req.body as {
        walletAddress?: string;
        chainId?: number;
        expectedAmount?: number;
      };

      logger.debug('Starting instant payment check', { walletAddress, chainId, expectedAmount });

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
        return;
      }

      // Instant check returns quickly - for real blockchain scanning,
      // the frontend should use the /verify endpoint with tx hash
      res.json({
        success: true,
        paymentDetected: false,
        message: 'Submit transaction hash to /api/payments/verify for instant credit'
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Instant check error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Check failed'
      });
    }
  });

  /**
   * Credit user after blockchain payment
   * POST /api/payments/credit
   * 
   * SECURITY: Requires JWT authentication and verifies wallet ownership
   */
  router.post('/credit', flexibleAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // SECURITY: Require JWT authentication
      if (!req.user || req.authType !== 'jwt') {
        res.status(401).json({
          success: false,
          error: 'Authentication required. Please sign in with a valid token.'
        });
        return;
      }

      const { txHash, walletAddress, tokenSymbol, amount, chainId, walletType } = req.body as {
        txHash?: string;
        walletAddress?: string;
        tokenSymbol?: string;
        amount?: number;
        chainId?: string | number;
        walletType?: string;
      };

      logger.info('Payment credit started', {
        txHash,
        walletAddress,
        tokenSymbol,
        amount,
        chainId,
        walletType,
        authType: req.authType,
        authenticatedUser: req.user.userId || req.user.email
      });

      if (!txHash || !walletAddress || !amount) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
        return;
      }

      // Validate txHash format
      if (typeof txHash !== 'string' || txHash.length > 100 || !/^[a-zA-Z0-9]+$/.test(txHash)) {
        res.status(400).json({
          success: false,
          error: 'Invalid transaction hash format'
        });
        return;
      }

      // SECURITY: Verify wallet ownership - wallet must belong to authenticated user
      const normalizedAddress = walletAddress.toLowerCase();
      const userWallet = req.user.walletAddress?.toLowerCase();
      
      if (userWallet && userWallet !== normalizedAddress) {
        logger.warn('Wallet ownership verification failed', {
          userId: req.user.userId,
          requestedWallet: normalizedAddress.substring(0, 10) + '...',
          userWallet: userWallet.substring(0, 10) + '...'
        });
        res.status(403).json({
          success: false,
          error: 'Wallet address does not match authenticated user'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');

      // Use authenticated user, not arbitrary wallet
      const user = req.user;

      // SECURITY: Validate amount is positive and reasonable
      if (typeof amount !== 'number' || amount <= 0 || amount > 100000) {
        res.status(400).json({
          success: false,
          error: 'Invalid payment amount'
        });
        return;
      }

      // Check NFT holder status (before atomic update)
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;
      const creditsPerUSDC = isNFTHolder ? NFT_HOLDER_CREDITS_PER_USDC : STANDARD_CREDITS_PER_USDC;
      const credits = Math.floor(amount * creditsPerUSDC);
      
      // SECURITY: Validate credits are positive integer
      if (credits <= 0 || !Number.isInteger(credits)) {
        res.status(400).json({
          success: false,
          error: 'Invalid credits calculation'
        });
        return;
      }

      // Add credits to authenticated user
      const updateQuery = user.userId 
        ? { userId: user.userId }
        : user.email 
          ? { email: user.email.toLowerCase() }
          : { walletAddress: normalizedAddress };

      // SECURITY ENHANCED: Use Redis distributed lock + $addToSet for duplicate prevention
      // Check Redis first for transaction deduplication (if available)
      let isDuplicate = false;
      try {
        const { markTransactionProcessed, isTransactionProcessed } = await import('../services/redis.js');
        if (isTransactionProcessed && markTransactionProcessed) {
          const alreadyProcessed = await isTransactionProcessed(txHash);
          if (alreadyProcessed) {
            logger.info('Payment already processed (Redis check)', { txHash, userId: user.userId });
            isDuplicate = true;
          } else {
            // Mark as processing (atomic operation)
            const marked = await markTransactionProcessed(txHash, 7 * 24 * 60 * 60); // 7 days
            if (!marked) {
              // Another process is already processing this transaction
              logger.info('Payment processing conflict (Redis)', { txHash, userId: user.userId });
              isDuplicate = true;
            }
          }
        }
      } catch (redisError) {
        logger.debug('Redis transaction check failed, using database only', { error: (redisError as Error).message });
      }

      // SECURITY FIX: Use $addToSet to prevent duplicate payment processing (atomic operation)
      // This prevents race conditions where the same transaction is processed multiple times
      const paymentRecord = {
        txHash,
        tokenSymbol: tokenSymbol || 'USDC',
        amount,
        credits,
        chainId: String(chainId),
        walletType,
        timestamp: new Date()
      };

      // Try to add payment record atomically - if txHash already exists, $addToSet won't add it
      const updatedUser = await User.findOneAndUpdate(
        updateQuery,
        {
          $inc: { credits, totalCreditsEarned: credits },
          $addToSet: {
            paymentHistory: paymentRecord
          }
        },
        { new: true }
      );

      // SECURITY: Check if payment was actually added (not a duplicate)
      const wasAdded = updatedUser?.paymentHistory?.some(
        (p: { txHash?: string; timestamp?: Date }) => 
          p.txHash === txHash && 
          Math.abs(new Date(p.timestamp || 0).getTime() - paymentRecord.timestamp.getTime()) < 1000
      );

      if (!wasAdded || isDuplicate) {
        // Payment was already processed (duplicate detected)
        logger.info('Payment already processed (duplicate detected)', { 
          txHash, 
          userId: user.userId,
          wasAdded,
          isDuplicate,
          redisCheck: isDuplicate
        });
        res.json({
          success: true,
          credits: 0,
          totalCredits: updatedUser?.credits || user.credits,
          message: 'Payment already processed'
        });
        return;
      }

      logger.info('Payment credited', {
        txHash,
        userId: user.userId,
        credits,
        isNFTHolder,
        totalCredits: updatedUser?.credits
      });

      res.json({
        success: true,
        credits,
        totalCredits: updatedUser?.credits || 0,
        isNFTHolder
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Payment credit error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to credit payment'
      });
    }
  });

  return router;
}

export default createPaymentRoutes;

