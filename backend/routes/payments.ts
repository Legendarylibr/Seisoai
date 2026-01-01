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
  processedTransactions?: LRUCache<string, { timestamp: Date; walletAddress: string }>;
}

export function createPaymentRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { paymentLimiter, processedTransactions } = deps;

  const limiter = paymentLimiter || ((req: Request, res: Response, next: () => void) => next());

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

      // Calculate credits (1 credit per dollar equivalent)
      const credits = Math.floor(amount * 5); // 5 credits per dollar

      // Add credits to user
      const User = mongoose.model<IUser>('User');
      const user = await User.findOneAndUpdate(
        { walletAddress: walletAddress.toLowerCase() },
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
      res.status(500).json({
        success: false,
        error: err.message
      });
    }
  });

  return router;
}

export default createPaymentRoutes;

