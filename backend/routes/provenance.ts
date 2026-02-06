/**
 * Provenance Routes
 * Verification and ownership-gated file access for AI output provenance.
 * Zero database dependency — all data comes from on-chain + Pinata.
 *
 * Security model:
 *   - Verification endpoints are PUBLIC (on-chain data is public)
 *   - File access requires proof of NFT OWNERSHIP (wallet must match ownerOf)
 *   - Only time-limited Pinata signed URLs are returned
 */
import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ethers } from 'ethers';
import {
  verifyProvenance,
  verifyByResultUrl,
  getSignedUrlForOwner,
  isProvenanceConfigured,
  isNftProvenanceConfigured,
  getProvenanceAgentRegistry,
} from '../services/provenanceService.js';
import { isPinataConfigured } from '../services/pinataService.js';
import logger from '../utils/logger.js';

interface Dependencies {
  [key: string]: unknown;
}

// Rate limiter for verification endpoints
const verifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Rate limit exceeded' },
});

// Stricter rate limiter for signed URL generation
const accessLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'Rate limit exceeded' },
});

export default function createProvenanceRoutes(_deps: Dependencies) {
  const router = Router();

  /**
   * GET /provenance/status
   * Check if provenance system is configured
   */
  router.get('/status', (_req: Request, res: Response) => {
    res.json({
      success: true,
      provenance: {
        configured: isProvenanceConfigured(),
        nftEnabled: isNftProvenanceConfigured(),
        privateStorageEnabled: isPinataConfigured(),
        agentRegistry: getProvenanceAgentRegistry(),
      },
    });
  });

  /**
   * GET /provenance/verify/:tokenId
   * Verify provenance by token ID.
   * Returns on-chain data + whether a private file exists (not the CID itself).
   */
  router.get('/verify/:tokenId', verifyLimiter, async (req: Request, res: Response) => {
    try {
      const tokenId = parseInt(req.params.tokenId, 10);
      if (isNaN(tokenId) || tokenId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid token ID' });
      }

      const result = await verifyProvenance({ tokenId });

      if (!result.exists) {
        return res.status(404).json({ success: false, error: 'Provenance not found' });
      }

      return res.json({ success: true, provenance: result });
    } catch (err) {
      logger.error('Provenance verification failed', { error: (err as Error).message });
      return res.status(500).json({ success: false, error: 'Verification failed' });
    }
  });

  /**
   * POST /provenance/verify
   * Verify provenance by content hash or result URL.
   * Body: { contentHash?: string, resultUrl?: string }
   */
  router.post('/verify', verifyLimiter, async (req: Request, res: Response) => {
    try {
      const { contentHash, resultUrl } = req.body;

      if (!contentHash && !resultUrl) {
        return res.status(400).json({
          success: false,
          error: 'Provide either contentHash or resultUrl',
        });
      }

      let result;
      if (resultUrl) {
        result = await verifyByResultUrl(resultUrl);
      } else {
        const hash = contentHash.startsWith('0x')
          ? contentHash
          : ethers.keccak256(ethers.toUtf8Bytes(contentHash));
        result = await verifyProvenance({ contentHash: hash });
      }

      if (!result.exists) {
        return res.status(404).json({ success: false, error: 'Provenance not found' });
      }

      return res.json({ success: true, provenance: result });
    } catch (err) {
      logger.error('Provenance verification failed', { error: (err as Error).message });
      return res.status(500).json({ success: false, error: 'Verification failed' });
    }
  });

  /**
   * POST /provenance/access
   * Ownership-gated file access.
   *
   * Body: { tokenId: number, walletAddress: string }
   *
   * Security flow (zero database — all on-chain + Pinata):
   *   1. Check ownerOf(tokenId) on-chain
   *   2. Verify walletAddress matches the on-chain owner
   *   3. Read privateCid from chain via getPrivateCid(tokenId)
   *   4. Generate a time-limited Pinata signed URL
   *   5. Return ONLY the signed URL
   */
  router.post('/access', accessLimiter, async (req: Request, res: Response) => {
    try {
      const { tokenId, walletAddress } = req.body;

      if (!tokenId || !walletAddress) {
        return res.status(400).json({
          success: false,
          error: 'tokenId and walletAddress are required',
        });
      }

      const parsedTokenId = parseInt(tokenId, 10);
      if (isNaN(parsedTokenId) || parsedTokenId <= 0) {
        return res.status(400).json({ success: false, error: 'Invalid token ID' });
      }

      if (!ethers.isAddress(walletAddress)) {
        return res.status(400).json({ success: false, error: 'Invalid wallet address' });
      }

      const result = await getSignedUrlForOwner(parsedTokenId, walletAddress);

      if (!result) {
        return res.status(401).json({
          success: false,
          error: 'Not authorized — you must own this provenance NFT to access the file',
        });
      }

      // Return ONLY the signed URL — no CID, no storage details
      return res.json({
        success: true,
        tokenId: result.tokenId,
        signedUrl: result.signedUrl,
        expiresInSeconds: result.expiresInSeconds,
      });
    } catch (err) {
      logger.error('Provenance access failed', { error: (err as Error).message });
      return res.status(500).json({ success: false, error: 'Access request failed' });
    }
  });

  return router;
}
