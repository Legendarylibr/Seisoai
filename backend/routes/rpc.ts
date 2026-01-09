/**
 * RPC routes
 * Proxy routes for Solana and EVM RPC calls
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
  [key: string]: unknown;
}

export function createRpcRoutes(deps: Dependencies = {}) {
  const router = Router();
  const { blockchainRpcLimiter } = deps;

  const limiter = blockchainRpcLimiter || ((req: Request, res: Response, next: () => void) => next());

  /**
   * Solana RPC proxy
   * POST /api/solana/rpc
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

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
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
   */
  router.post('/evm/rpc', limiter, async (req: Request, res: Response) => {
    try {
      const { chainId } = req.body as RpcRequestBody;
      
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

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
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
  router.get('/rpc/config', limiter, (req: Request, res: Response) => {
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





