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
   */
  router.post('/solana/rpc', limiter, async (req: Request, res: Response) => {
    try {
      const rpcUrl = config.SOLANA_RPC_URL;
      
      if (!rpcUrl) {
        res.status(503).json({ 
          success: false, 
          error: 'Solana RPC not configured' 
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
      
      let rpcUrl: string | undefined;
      switch (String(chainId)) {
        case '1':
        case 'ethereum':
          rpcUrl = config.ETH_RPC_URL;
          break;
        case '137':
        case 'polygon':
          rpcUrl = config.POLYGON_RPC_URL;
          break;
        case '42161':
        case 'arbitrum':
          rpcUrl = config.ARBITRUM_RPC_URL;
          break;
        case '10':
        case 'optimism':
          rpcUrl = config.OPTIMISM_RPC_URL;
          break;
        case '8453':
        case 'base':
          rpcUrl = config.BASE_RPC_URL;
          break;
        default:
          rpcUrl = config.ETH_RPC_URL;
      }
      
      if (!rpcUrl) {
        res.status(503).json({ 
          success: false, 
          error: 'EVM RPC not configured for this chain' 
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
    res.json({
      success: true,
      chains: {
        solana: !!config.SOLANA_RPC_URL,
        ethereum: !!config.ETH_RPC_URL,
        polygon: !!config.POLYGON_RPC_URL,
        arbitrum: !!config.ARBITRUM_RPC_URL,
        optimism: !!config.OPTIMISM_RPC_URL,
        base: !!config.BASE_RPC_URL
      }
    });
  });

  return router;
}

export default createRpcRoutes;





