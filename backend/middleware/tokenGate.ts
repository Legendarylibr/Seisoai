/**
 * Token Gate Middleware
 * Restricts platform access to holders of a specific token/NFT
 */
import type { Request, Response, NextFunction } from 'express';
import { ethers } from 'ethers';
import { TOKEN_GATE } from '../config/constants';
import { getProvider } from '../services/blockchain';
import { LRUCache } from '../services/cache';
import logger from '../utils/logger';
import type { IUser } from '../models/User';

// Types
interface AuthenticatedRequest extends Request {
  user?: IUser;
  tokenGateStatus?: TokenGateStatus;
}

export interface TokenGateStatus {
  hasAccess: boolean;
  balance: number;
  requiredBalance: number;
  contractAddress: string;
  chainId: string;
  chainName: string;
  tokenName: string;
  isERC20: boolean;
}

// Cache token gate checks for 5 minutes to reduce RPC calls
const tokenGateCache = new LRUCache<string, TokenGateStatus>(10000);
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ERC-20 ABI for balanceOf and decimals
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

// ERC-721 ABI for balanceOf
const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)'
];

// ERC-1155 ABI for balanceOf (requires tokenId, but we check total)
const ERC1155_ABI = [
  'function balanceOf(address owner, uint256 id) view returns (uint256)'
];

/**
 * Check if a wallet holds the required tokens/NFTs for platform access
 */
export async function checkTokenGateAccess(walletAddress: string): Promise<TokenGateStatus> {
  if (!TOKEN_GATE.enabled) {
    return {
      hasAccess: true,
      balance: 0,
      requiredBalance: 0,
      contractAddress: '',
      chainId: '',
      chainName: '',
      tokenName: 'Token Gate Disabled',
      isERC20: false
    };
  }

  if (!walletAddress) {
    return {
      hasAccess: false,
      balance: 0,
      requiredBalance: TOKEN_GATE.minimumBalance,
      contractAddress: TOKEN_GATE.contractAddress,
      chainId: TOKEN_GATE.chainId,
      chainName: TOKEN_GATE.chainName,
      tokenName: TOKEN_GATE.name,
      isERC20: TOKEN_GATE.isERC20
    };
  }

  // Normalize address
  const normalizedAddress = walletAddress.toLowerCase();
  const cacheKey = `tokengate:${normalizedAddress}`;

  // Check cache first
  const cached = tokenGateCache.get(cacheKey);
  if (cached) {
    logger.debug('Token gate check: cache hit', { 
      wallet: normalizedAddress.substring(0, 10) + '...',
      hasAccess: cached.hasAccess 
    });
    return cached;
  }

  // Get provider for the configured chain
  const provider = getProvider(TOKEN_GATE.chainId);
  if (!provider) {
    logger.error('Token gate: No RPC provider for chain', { chainId: TOKEN_GATE.chainId });
    // Fail open in case of RPC issues - log but allow access
    return {
      hasAccess: false,
      balance: 0,
      requiredBalance: TOKEN_GATE.minimumBalance,
      contractAddress: TOKEN_GATE.contractAddress,
      chainId: TOKEN_GATE.chainId,
      chainName: TOKEN_GATE.chainName,
      tokenName: TOKEN_GATE.name,
      isERC20: TOKEN_GATE.isERC20
    };
  }

  try {
    let balance = 0;
    
    if (TOKEN_GATE.isERC20) {
      // Check ERC-20 token balance
      const contract = new ethers.Contract(TOKEN_GATE.contractAddress, ERC20_ABI, provider);
      const rawBalance = await contract.balanceOf(normalizedAddress);
      const decimals = TOKEN_GATE.decimals || 18;
      balance = parseFloat(ethers.formatUnits(rawBalance, decimals));
    } else {
      // Check NFT balance (ERC-721)
      const contract = new ethers.Contract(TOKEN_GATE.contractAddress, ERC721_ABI, provider);
      const rawBalance = await contract.balanceOf(normalizedAddress);
      balance = Number(rawBalance);
    }

    const hasAccess = balance >= TOKEN_GATE.minimumBalance;

    const status: TokenGateStatus = {
      hasAccess,
      balance,
      requiredBalance: TOKEN_GATE.minimumBalance,
      contractAddress: TOKEN_GATE.contractAddress,
      chainId: TOKEN_GATE.chainId,
      chainName: TOKEN_GATE.chainName,
      tokenName: TOKEN_GATE.name,
      isERC20: TOKEN_GATE.isERC20
    };

    // Cache the result
    tokenGateCache.set(cacheKey, status);
    setTimeout(() => tokenGateCache.delete(cacheKey), CACHE_TTL_MS);

    logger.info('Token gate check completed', {
      wallet: normalizedAddress.substring(0, 10) + '...',
      balance,
      hasAccess,
      chain: TOKEN_GATE.chainName
    });

    return status;
  } catch (error) {
    const err = error as Error;
    logger.error('Token gate check failed:', { 
      error: err.message, 
      wallet: normalizedAddress.substring(0, 10) + '...',
      contract: TOKEN_GATE.contractAddress 
    });
    
    // Return no access on error (fail closed for security)
    return {
      hasAccess: false,
      balance: 0,
      requiredBalance: TOKEN_GATE.minimumBalance,
      contractAddress: TOKEN_GATE.contractAddress,
      chainId: TOKEN_GATE.chainId,
      chainName: TOKEN_GATE.chainName,
      tokenName: TOKEN_GATE.name,
      isERC20: TOKEN_GATE.isERC20
    };
  }
}

/**
 * Clear cached token gate status for a wallet
 */
export function clearTokenGateCache(walletAddress: string): void {
  const normalizedAddress = walletAddress.toLowerCase();
  tokenGateCache.delete(`tokengate:${normalizedAddress}`);
}

/**
 * Get token gate configuration (for frontend)
 */
export function getTokenGateConfig() {
  return {
    enabled: TOKEN_GATE.enabled,
    contractAddress: TOKEN_GATE.contractAddress,
    chainId: TOKEN_GATE.chainId,
    chainName: TOKEN_GATE.chainName,
    minimumBalance: TOKEN_GATE.minimumBalance,
    tokenName: TOKEN_GATE.name,
    symbol: TOKEN_GATE.symbol,
    isERC20: TOKEN_GATE.isERC20
  };
}

/**
 * Middleware to require token gate access
 * Use this on protected routes that require token holding
 */
export const requireTokenGate = () => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Skip if token gate is disabled
    if (!TOKEN_GATE.enabled) {
      next();
      return;
    }

    // Get wallet address from authenticated user or request
    const walletAddress = req.user?.walletAddress || 
                         (req.body as { walletAddress?: string })?.walletAddress ||
                         req.params.walletAddress;

    if (!walletAddress) {
      res.status(401).json({
        success: false,
        error: 'Wallet connection required for access',
        tokenGate: getTokenGateConfig()
      });
      return;
    }

    // Check token gate access
    const status = await checkTokenGateAccess(walletAddress);
    req.tokenGateStatus = status;

    if (!status.hasAccess) {
      res.status(403).json({
        success: false,
        error: `Access requires holding ${TOKEN_GATE.name} on ${TOKEN_GATE.chainName}`,
        tokenGate: {
          ...getTokenGateConfig(),
          currentBalance: status.balance,
          hasAccess: false
        }
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check token gate without blocking
 * Attaches token gate status to request for optional use
 */
export const checkTokenGate = () => {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
    const walletAddress = req.user?.walletAddress || 
                         (req.body as { walletAddress?: string })?.walletAddress ||
                         req.params.walletAddress;

    if (walletAddress) {
      req.tokenGateStatus = await checkTokenGateAccess(walletAddress);
    }

    next();
  };
};

export default {
  checkTokenGateAccess,
  clearTokenGateCache,
  getTokenGateConfig,
  requireTokenGate,
  checkTokenGate
};
