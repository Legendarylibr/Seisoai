/**
 * Authentication routes
 * Handles wallet-based authentication, token refresh, logout
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { ethers } from 'ethers';
import logger from '../utils/logger';
import config from '../config/env';
import { blacklistToken } from '../middleware/auth';
import { getOrCreateUser } from '../services/user';
import { isValidWalletAddress } from '../utils/validation';
import type { IUser } from '../models/User';
import { LRUCache } from '../services/cache';

// Types
interface Dependencies {
  authenticateToken?: RequestHandler;
  JWT_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
}

interface JWTDecoded extends JwtPayload {
  userId?: string;
  walletAddress?: string;
  type?: string;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId?: string;
    walletAddress?: string;
  };
}

// Nonce cache for wallet authentication (5 minute expiry)
// Stores: walletAddress -> { nonce, expiresAt }
const nonceCache = new LRUCache<string, { nonce: string; expiresAt: number }>(10000);
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

export function createAuthRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { authenticateToken, JWT_SECRET = config.JWT_SECRET, JWT_REFRESH_SECRET = config.JWT_REFRESH_SECRET } = deps;

  const authMiddleware = authenticateToken || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Get nonce for wallet authentication
   * POST /api/auth/nonce
   * 
   * Generates a random nonce that must be signed by the wallet to prove ownership.
   * The nonce expires after 5 minutes.
   */
  router.post('/nonce', async (req: Request, res: Response) => {
    try {
      const { walletAddress } = req.body as { walletAddress?: string };

      if (!walletAddress) {
        res.status(400).json({
          success: false,
          error: 'Wallet address required'
        });
        return;
      }

      if (!isValidWalletAddress(walletAddress)) {
        res.status(400).json({
          success: false,
          error: 'Invalid wallet address format'
        });
        return;
      }

      const normalizedAddress = walletAddress.toLowerCase();
      
      // Generate a random nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + NONCE_EXPIRY_MS;
      
      // Store nonce in cache
      nonceCache.set(normalizedAddress, { nonce, expiresAt });
      
      // Build the message the user will sign
      const message = `Sign this message to authenticate with SeisoAI.\n\nWallet: ${normalizedAddress}\nNonce: ${nonce}\nExpires: ${new Date(expiresAt).toISOString()}`;
      
      logger.debug('Nonce generated for wallet auth', { 
        wallet: normalizedAddress.substring(0, 10) + '...' 
      });
      
      res.json({
        success: true,
        nonce,
        message,
        expiresAt
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Nonce generation error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to generate nonce'
      });
    }
  });

  /**
   * Authenticate with wallet signature (SIWE-style)
   * POST /api/auth/wallet
   * 
   * Verifies the wallet owns the address by checking the signature.
   * Returns JWT access and refresh tokens on success.
   */
  router.post('/wallet', async (req: Request, res: Response) => {
    try {
      const { walletAddress, signature, message } = req.body as { 
        walletAddress?: string; 
        signature?: string;
        message?: string;
      };

      if (!walletAddress || !signature || !message) {
        res.status(400).json({
          success: false,
          error: 'Wallet address, signature, and message are required'
        });
        return;
      }

      if (!isValidWalletAddress(walletAddress)) {
        res.status(400).json({
          success: false,
          error: 'Invalid wallet address format'
        });
        return;
      }

      const normalizedAddress = walletAddress.toLowerCase();
      
      // Verify nonce exists and hasn't expired
      const nonceEntry = nonceCache.get(normalizedAddress);
      if (!nonceEntry) {
        res.status(401).json({
          success: false,
          error: 'No pending authentication. Please request a new nonce.'
        });
        return;
      }
      
      if (Date.now() > nonceEntry.expiresAt) {
        nonceCache.delete(normalizedAddress);
        res.status(401).json({
          success: false,
          error: 'Nonce expired. Please request a new one.'
        });
        return;
      }
      
      // Verify the message contains the correct nonce
      if (!message.includes(nonceEntry.nonce)) {
        res.status(401).json({
          success: false,
          error: 'Invalid message. Nonce mismatch.'
        });
        return;
      }
      
      // Verify the signature - supports both EOA and Smart Wallet (EIP-1271)
      let isValidSignature = false;
      
      // First, try EOA signature verification
      try {
        const recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
        if (recoveredAddress === normalizedAddress) {
          isValidSignature = true;
          logger.debug('EOA signature verified', { wallet: normalizedAddress.substring(0, 10) + '...' });
        }
      } catch (eoaError) {
        // EOA verification failed, will try EIP-1271 next
        logger.debug('EOA signature verification failed, trying EIP-1271', { 
          wallet: normalizedAddress.substring(0, 10) + '...',
          error: (eoaError as Error).message 
        });
      }
      
      // If EOA failed, try EIP-1271 Smart Wallet verification
      if (!isValidSignature) {
        try {
          // EIP-1271 magic value for valid signature
          const EIP1271_MAGIC_VALUE = '0x1626ba7e';
          
          // Minimal EIP-1271 interface
          const EIP1271_ABI = ['function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)'];
          
          // Use Base RPC for Smart Wallet verification (most common for Coinbase Smart Wallet)
          const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
          const contract = new ethers.Contract(walletAddress, EIP1271_ABI, provider);
          
          // Hash the message the same way personal_sign does
          const messageHash = ethers.hashMessage(message);
          
          const result = await contract.isValidSignature(messageHash, signature);
          if (result === EIP1271_MAGIC_VALUE) {
            isValidSignature = true;
            logger.debug('EIP-1271 Smart Wallet signature verified', { 
              wallet: normalizedAddress.substring(0, 10) + '...' 
            });
          }
        } catch (eip1271Error) {
          // EIP-1271 verification also failed
          logger.debug('EIP-1271 verification failed', { 
            wallet: normalizedAddress.substring(0, 10) + '...',
            error: (eip1271Error as Error).message 
          });
        }
      }
      
      if (!isValidSignature) {
        logger.warn('All signature verification methods failed', {
          wallet: normalizedAddress.substring(0, 10) + '...'
        });
        res.status(401).json({
          success: false,
          error: 'Invalid signature. If using a Smart Wallet, please ensure you are on the Base network.'
        });
        return;
      }
      
      // Nonce is consumed - delete it to prevent replay attacks
      nonceCache.delete(normalizedAddress);
      
      // Get or create user
      const user = await getOrCreateUser(normalizedAddress);
      
      if (!JWT_SECRET) {
        logger.error('JWT_SECRET not configured');
        res.status(500).json({
          success: false,
          error: 'Server configuration error'
        });
        return;
      }
      
      // Generate JWT tokens
      const accessToken = jwt.sign(
        { userId: user.userId, walletAddress: user.walletAddress, type: 'access' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );
      
      const refreshToken = JWT_REFRESH_SECRET ? jwt.sign(
        { userId: user.userId, walletAddress: user.walletAddress, type: 'refresh' },
        JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      ) : null;
      
      logger.info('Wallet authenticated successfully', {
        userId: user.userId,
        wallet: normalizedAddress.substring(0, 10) + '...'
      });
      
      res.json({
        success: true,
        token: accessToken,
        refreshToken,
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          credits: user.credits || 0,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Wallet authentication error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Authentication failed'
      });
    }
  });

  /**
   * Verify token
   * GET /api/auth/verify
   */
  router.get('/verify', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (!token || !JWT_SECRET) {
        res.status(401).json({
          success: false,
          error: 'No token provided'
        });
        return;
      }

      const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: decoded.userId })
        .select('-password -generationHistory -gallery -paymentHistory');

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Prevent caching to ensure fresh credits data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json({
        success: true,
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress,
          credits: user.credits,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0
        }
      });
    } catch (error) {
      res.status(403).json({
        success: false,
        error: 'Invalid token'
      });
    }
  });

  /**
   * Simple credits check - bypasses all complexity
   * GET /api/auth/credits
   */
  router.get('/credits', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (!token || !JWT_SECRET) {
        logger.warn('Credits endpoint: No token provided');
        res.status(401).json({ success: false, error: 'No token' });
        return;
      }

      let decoded: JWTDecoded;
      try {
        decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
      } catch (jwtErr) {
        logger.warn('Credits endpoint: Invalid JWT', { error: (jwtErr as Error).message });
        res.status(403).json({ success: false, error: 'Invalid token' });
        return;
      }
      
      logger.info('Credits endpoint: Looking up user', { userId: decoded.userId });
      
      // Direct DB query - no mongoose model overhead
      const db = mongoose.connection.db;
      const user = await db.collection('users').findOne({ userId: decoded.userId });

      if (!user) {
        logger.warn('Credits endpoint: User not found', { userId: decoded.userId });
        res.status(404).json({ success: false, error: 'User not found', userId: decoded.userId });
        return;
      }

      logger.info('Credits endpoint: Returning credits', { 
        userId: decoded.userId, 
        credits: user.credits 
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        success: true,
        credits: user.credits || 0,
        totalCreditsEarned: user.totalCreditsEarned || 0,
        totalCreditsSpent: user.totalCreditsSpent || 0
      });
    } catch (error) {
      logger.error('Credits endpoint error', { error: (error as Error).message });
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  /**
   * Logout (blacklist tokens)
   * POST /api/auth/logout
   */
  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      const accessToken = authHeader?.split(' ')[1];
      const { refreshToken } = req.body as { refreshToken?: string };

      let tokensRevoked = 0;

      if (accessToken && JWT_SECRET) {
        try {
          const decoded = jwt.verify(accessToken, JWT_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
          await blacklistToken(accessToken, decoded.exp ? decoded.exp * 1000 : null);
          tokensRevoked++;
        } catch {
          // Token already invalid
        }
      }

      if (refreshToken && JWT_REFRESH_SECRET) {
        try {
          const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;
          await blacklistToken(refreshToken, decoded.exp ? decoded.exp * 1000 : null);
          tokensRevoked++;
        } catch {
          // Token already invalid
        }
      }

      res.json({
        success: true,
        message: `${tokensRevoked} token(s) revoked`
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Logout error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body as { refreshToken?: string };

      if (!refreshToken || !JWT_SECRET || !JWT_REFRESH_SECRET) {
        res.status(400).json({
          success: false,
          error: 'Refresh token required'
        });
        return;
      }

      // SECURITY FIX: Check if refresh token is blacklisted
      const { isTokenBlacklisted } = await import('../middleware/auth.js');
      if (await isTokenBlacklisted(refreshToken)) {
        res.status(401).json({
          success: false,
          error: 'Refresh token has been revoked. Please sign in again.'
        });
        return;
      }

      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as JWTDecoded;

      if (decoded.type !== 'refresh') {
        res.status(403).json({
          success: false,
          error: 'Invalid token type'
        });
        return;
      }

      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: decoded.userId });

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'User not found'
        });
        return;
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: user.userId, walletAddress: user.walletAddress, type: 'access' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token: newAccessToken
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Token refresh error:', { error: err.message });
      res.status(403).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }
  });

  /**
   * Get current user data
   * GET /api/auth/me
   */
  router.get('/me', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
      // authMiddleware already loaded the user - just use it directly
      // For fresh data, re-fetch by userId
      const User = mongoose.model<IUser>('User');
      const user = await User.findOne({ userId: req.user?.userId })
        .select('-password')
        .maxTimeMS(5000);
      
      if (!user) {
        res.status(404).json({
          success: false,
          error: 'User not found'
        });
        return;
      }
      
      const isNFTHolder = user.nftCollections && user.nftCollections.length > 0;

      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      
      res.json({
        success: true,
        user: {
          userId: user.userId,
          walletAddress: user.walletAddress || null,
          credits: user.credits || 0,
          totalCreditsEarned: user.totalCreditsEarned || 0,
          totalCreditsSpent: user.totalCreditsSpent || 0,
          isNFTHolder
        }
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Get user data error:', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get user data'
      });
    }
  });

  return router;
}

export default createAuthRoutes;

