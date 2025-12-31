/**
 * Payment routes
 * Blockchain payment verification and credit addition
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import { verifyEVMTransaction, verifySolanaTransaction } from '../services/blockchain.js';
import { buildUserUpdateQuery } from '../services/user.js';
import config from '../config/env.js';

export function createPaymentRoutes(deps) {
  const router = Router();
  const { paymentLimiter, processedTransactions } = deps;

  /**
   * Get payment address
   * POST /api/payment/get-address
   */
  router.post('/get-address', async (req, res) => {
    const { chainId, walletType } = req.body;

    let paymentAddress;
    
    if (walletType === 'solana' || chainId === 'solana') {
      paymentAddress = config.SOLANA_PAYMENT_WALLET;
    } else {
      paymentAddress = config.EVM_PAYMENT_WALLET;
    }

    if (!paymentAddress) {
      return res.status(500).json({
        success: false,
        error: 'Payment wallet not configured'
      });
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
  router.post('/verify', paymentLimiter, async (req, res) => {
    try {
      const { txHash, walletAddress, tokenSymbol, amount, chainId, walletType } = req.body;

      if (!txHash || !walletAddress || !amount) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      // Check if already processed
      if (processedTransactions.has(txHash)) {
        return res.status(400).json({
          success: false,
          error: 'Transaction already processed',
          alreadyProcessed: true
        });
      }

      // Get payment address
      const expectedTo = walletType === 'solana' 
        ? config.SOLANA_PAYMENT_WALLET 
        : config.EVM_PAYMENT_WALLET;

      // Verify transaction
      let txInfo;
      if (walletType === 'solana') {
        txInfo = await verifySolanaTransaction(txHash, expectedTo, amount);
      } else {
        txInfo = await verifyEVMTransaction(txHash, expectedTo, amount, chainId);
      }

      // Calculate credits (1 credit per dollar equivalent)
      const credits = Math.floor(amount * 5); // 5 credits per dollar

      // Add credits to user
      const User = mongoose.model('User');
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
              chainId,
              walletType,
              timestamp: new Date()
            }
          }
        },
        { new: true, upsert: true }
      );

      // Mark as processed
      processedTransactions.set(txHash, {
        timestamp: new Date(),
        walletAddress
      });

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
      logger.error('Payment verification error:', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
}

export default createPaymentRoutes;



