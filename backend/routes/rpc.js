/**
 * RPC routes
 * Proxy routes for Solana and EVM RPC calls
 */
import { Router } from 'express';
import logger from '../utils/logger.js';
import config from '../config/env.js';

export function createRpcRoutes(deps) {
  const router = Router();
  const { blockchainRpcLimiter } = deps;

  const limiter = blockchainRpcLimiter || ((req, res, next) => next());

  /**
   * Solana RPC proxy
   * POST /api/solana/rpc
   */
  router.post('/solana/rpc', limiter, async (req, res) => {
    try {
      const rpcUrl = config.SOLANA_RPC_URL;
      
      if (!rpcUrl) {
        return res.status(503).json({ 
          success: false, 
          error: 'Solana RPC not configured' 
        });
      }

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error('Solana RPC error', { error: error.message });
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
  router.post('/evm/rpc', limiter, async (req, res) => {
    try {
      const { chainId } = req.body;
      
      let rpcUrl;
      switch (chainId) {
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
        return res.status(503).json({ 
          success: false, 
          error: 'EVM RPC not configured for this chain' 
        });
      }

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body)
      });

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error('EVM RPC error', { error: error.message });
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
  router.get('/rpc/config', limiter, (req, res) => {
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



