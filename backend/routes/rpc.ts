/**
 * RPC routes
 * Proxy routes for Solana and EVM RPC calls
 * 
 * SECURITY: These are proxies to blockchain RPCs - validate and sanitize all inputs
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import logger from '../utils/logger';
import config from '../config/env';

// Alchemy RPC base URLs by chain ID
const ALCHEMY_RPC_URLS: Record<string, string> = {
  '1': 'https://eth-mainnet.g.alchemy.com/v2',
  '137': 'https://polygon-mainnet.g.alchemy.com/v2',
  '42161': 'https://arb-mainnet.g.alchemy.com/v2',
  '10': 'https://opt-mainnet.g.alchemy.com/v2',
  '8453': 'https://base-mainnet.g.alchemy.com/v2',
};

/**
 * Get Alchemy RPC URL for a chain
 * Falls back to individual RPC URL config if Alchemy key not set
 */
function getAlchemyRpcUrl(chainId: string): string | undefined {
  // If Alchemy API key is configured, use it
  if (config.ALCHEMY_API_KEY) {
    const baseUrl = ALCHEMY_RPC_URLS[chainId];
    if (baseUrl) {
      return `${baseUrl}/${config.ALCHEMY_API_KEY}`;
    }
  }
  
  // Fallback to individual RPC URL config
  switch (chainId) {
    case '1': return config.ETH_RPC_URL;
    case '137': return config.POLYGON_RPC_URL;
    case '42161': return config.ARBITRUM_RPC_URL;
    case '10': return config.OPTIMISM_RPC_URL;
    case '8453': return config.BASE_RPC_URL;
    default: return undefined;
  }
}

// Types
interface Dependencies {
  blockchainRpcLimiter?: RequestHandler;
}

interface RpcRequestBody {
  chainId?: string | number;
  jsonrpc?: string;
  method?: string;
  params?: unknown[];
  id?: number | string;
  [key: string]: unknown;
}

// SECURITY: Whitelist of allowed RPC methods
// This prevents attackers from using the proxy to execute arbitrary RPC commands
const ALLOWED_RPC_METHODS = new Set([
  // Read-only methods
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getLogs',
  'eth_chainId',
  'net_version',
  // Solana read-only methods
  'getBalance',
  'getAccountInfo',
  'getTransaction',
  'getSignaturesForAddress',
  'getSignatureStatuses',  // Required for transaction confirmation checks
  'getSlot',
  'getLatestBlockhash',
  'getTokenAccountBalance',
  'getProgramAccounts'
]);

// SECURITY: Blocked methods that could be dangerous
const BLOCKED_RPC_METHODS = new Set([
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'sendTransaction',
  'simulateTransaction',
  'debug_',
  'admin_',
  'miner_',
  'personal_'
]);

/**
 * Validate RPC request
 */
function isValidRpcRequest(body: RpcRequestBody): { valid: boolean; error?: string } {
  // Validate JSON-RPC structure
  if (!body.method || typeof body.method !== 'string') {
    return { valid: false, error: 'Invalid RPC request: missing method' };
  }
  
  // Check against blocked methods (prefix matching for debug_, admin_, etc.)
  const methodLower = body.method.toLowerCase();
  for (const blocked of BLOCKED_RPC_METHODS) {
    if (methodLower === blocked.toLowerCase() || methodLower.startsWith(blocked.toLowerCase())) {
      logger.warn('SECURITY: Blocked RPC method attempted', { method: body.method });
      return { valid: false, error: 'This RPC method is not allowed' };
    }
  }
  
  // Check against whitelist (if whitelist is non-empty)
  if (ALLOWED_RPC_METHODS.size > 0 && !ALLOWED_RPC_METHODS.has(body.method)) {
    logger.warn('SECURITY: Non-whitelisted RPC method attempted', { method: body.method });
    return { valid: false, error: 'This RPC method is not allowed' };
  }
  
  // Validate params is an array if present
  if (body.params !== undefined && !Array.isArray(body.params)) {
    return { valid: false, error: 'Invalid RPC request: params must be an array' };
  }
  
  return { valid: true };
}

export function createRpcRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { blockchainRpcLimiter } = deps;

  const limiter = blockchainRpcLimiter || ((_req: Request, _res: Response, next: () => void) => next());

  /**
   * Solana RPC proxy
   * POST /api/solana/rpc
   * SECURITY: Only allows whitelisted read-only methods
   * Uses Alchemy API key if configured, falls back to SOLANA_RPC_URL
   */
  router.post('/solana/rpc', limiter, async (req: Request, res: Response) => {
    try {
      // Use Alchemy for Solana if configured, otherwise fall back to custom URL
      let rpcUrl = config.SOLANA_RPC_URL;
      if (!rpcUrl && config.ALCHEMY_API_KEY) {
        rpcUrl = `https://solana-mainnet.g.alchemy.com/v2/${config.ALCHEMY_API_KEY}`;
      }
      
      if (!rpcUrl) {
        res.status(503).json({ 
          success: false, 
          error: 'Solana RPC not configured. Set ALCHEMY_API_KEY or SOLANA_RPC_URL.' 
        });
        return;
      }

      // SECURITY: Validate RPC request
      const validation = isValidRpcRequest(req.body as RpcRequestBody);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
        });
        return;
      }

      // SECURITY: Only forward allowed fields, strip any extra data
      const safeBody = {
        jsonrpc: '2.0',
        method: (req.body as RpcRequestBody).method,
        params: (req.body as RpcRequestBody).params || [],
        id: (req.body as RpcRequestBody).id || 1
      };

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(safeBody)
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      const err = error as Error;
      logger.error('Solana RPC error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: 'Solana RPC request failed' 
      });
    }
  });

  /**
   * EVM RPC proxy
   * POST /api/evm/rpc
   * SECURITY: Only allows whitelisted read-only methods
   * Uses Alchemy API key if configured, falls back to individual RPC URLs
   */
  router.post('/evm/rpc', limiter, async (req: Request, res: Response) => {
    try {
      const { chainId } = req.body as RpcRequestBody;
      
      // SECURITY: Validate RPC request
      const validation = isValidRpcRequest(req.body as RpcRequestBody);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.error
        });
        return;
      }
      
      // Normalize chainId to string number format
      let normalizedChainId: string;
      switch (String(chainId).toLowerCase()) {
        case '1':
        case 'ethereum':
          normalizedChainId = '1';
          break;
        case '137':
        case 'polygon':
          normalizedChainId = '137';
          break;
        case '42161':
        case 'arbitrum':
          normalizedChainId = '42161';
          break;
        case '10':
        case 'optimism':
          normalizedChainId = '10';
          break;
        case '8453':
        case 'base':
          normalizedChainId = '8453';
          break;
        default:
          normalizedChainId = '1'; // Default to Ethereum
      }
      
      // Get RPC URL (Alchemy if configured, otherwise individual URLs)
      const rpcUrl = getAlchemyRpcUrl(normalizedChainId);
      
      if (!rpcUrl) {
        res.status(503).json({ 
          success: false, 
          error: 'EVM RPC not configured. Set ALCHEMY_API_KEY or individual chain RPC URLs.' 
        });
        return;
      }

      // SECURITY: Only forward allowed fields, strip any extra data
      const safeBody = {
        jsonrpc: '2.0',
        method: (req.body as RpcRequestBody).method,
        params: (req.body as RpcRequestBody).params || [],
        id: (req.body as RpcRequestBody).id || 1
      };

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(safeBody)
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      const err = error as Error;
      logger.error('EVM RPC error', { error: err.message });
      res.status(500).json({ 
        success: false, 
        error: 'EVM RPC request failed' 
      });
    }
  });

  /**
   * RPC configuration
   * GET /api/rpc/config
   */
  router.get('/rpc/config', limiter, (_req: Request, res: Response) => {
    const hasAlchemy = !!config.ALCHEMY_API_KEY;
    res.json({
      success: true,
      provider: hasAlchemy ? 'alchemy' : 'custom',
      chains: {
        solana: hasAlchemy || !!config.SOLANA_RPC_URL,
        ethereum: hasAlchemy || !!config.ETH_RPC_URL,
        polygon: hasAlchemy || !!config.POLYGON_RPC_URL,
        arbitrum: hasAlchemy || !!config.ARBITRUM_RPC_URL,
        optimism: hasAlchemy || !!config.OPTIMISM_RPC_URL,
        base: hasAlchemy || !!config.BASE_RPC_URL
      }
    });
  });

  return router;
}

export default createRpcRoutes;





