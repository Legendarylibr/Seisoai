/**
 * Blockchain service
 * Handles blockchain interactions (EVM and Solana)
 */
import { ethers, type JsonRpcProvider, type Contract } from 'ethers';
import { Connection, PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';
import logger from '../utils/logger';
import config from '../config/env';

// Types
interface TransactionVerification {
  verified: boolean;
  from: string;
  to: string;
  value: number;
  blockNumber?: number;
  slot?: number;
}

interface SolanaInstruction {
  program?: string;
  parsed?: {
    type?: string;
    info?: {
      destination?: string;
      source?: string;
      lamports?: number;
    };
  };
}

// RPC providers cache
const providers: Record<string, JsonRpcProvider> = {};

/**
 * Get RPC provider for a chain
 */
export function getProvider(chainId: string | number): JsonRpcProvider | null {
  const chainIdStr = String(chainId);
  if (providers[chainIdStr]) {
    return providers[chainIdStr];
  }

  let rpcUrl: string | undefined;
  switch (chainIdStr) {
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
      return null;
  }

  if (!rpcUrl) {
    return null;
  }

  providers[chainIdStr] = new ethers.JsonRpcProvider(rpcUrl);
  return providers[chainIdStr];
}

/**
 * Get Solana connection
 */
export function getSolanaConnection(): Connection | null {
  if (!config.SOLANA_RPC_URL) {
    return null;
  }
  return new Connection(config.SOLANA_RPC_URL, 'confirmed');
}

/**
 * Verify EVM transaction
 */
export async function verifyEVMTransaction(
  txHash: string, 
  expectedTo: string, 
  expectedAmount: number, 
  chainId: string | number
): Promise<TransactionVerification> {
  const provider = getProvider(chainId);
  if (!provider) {
    throw new Error(`No RPC provider for chain ${chainId}`);
  }

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error('Transaction not found');
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt || receipt.status !== 1) {
    throw new Error('Transaction failed or pending');
  }

  // Verify recipient
  if (tx.to?.toLowerCase() !== expectedTo.toLowerCase()) {
    throw new Error('Transaction recipient mismatch');
  }

  // Verify amount (in wei)
  const txValue = parseFloat(ethers.formatEther(tx.value));
  if (txValue < expectedAmount * 0.99) { // 1% tolerance
    throw new Error('Transaction amount too low');
  }

  return {
    verified: true,
    from: tx.from,
    to: tx.to || '',
    value: txValue,
    blockNumber: receipt.blockNumber
  };
}

/**
 * Verify Solana transaction
 */
export async function verifySolanaTransaction(
  txHash: string, 
  expectedTo: string, 
  expectedAmount: number
): Promise<TransactionVerification> {
  const connection = getSolanaConnection();
  if (!connection) {
    throw new Error('Solana RPC not configured');
  }

  const tx = await connection.getParsedTransaction(txHash, {
    maxSupportedTransactionVersion: 0
  }) as ParsedTransactionWithMeta | null;

  if (!tx) {
    throw new Error('Transaction not found');
  }

  if (tx.meta?.err) {
    throw new Error('Transaction failed');
  }

  // Find the transfer instruction
  const instructions = tx.transaction.message.instructions as SolanaInstruction[];
  let transferFound = false;
  let from: string | null = null;
  let amount = 0;

  for (const ix of instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info;
      if (info?.destination === expectedTo) {
        transferFound = true;
        from = info.source || null;
        amount = (info.lamports || 0) / 1e9; // Convert lamports to SOL
        break;
      }
    }
  }

  if (!transferFound) {
    throw new Error('No matching transfer found');
  }

  if (amount < expectedAmount * 0.99) {
    throw new Error('Transaction amount too low');
  }

  return {
    verified: true,
    from: from || '',
    to: expectedTo,
    value: amount,
    slot: tx.slot
  };
}

/**
 * Check NFT balance
 */
export async function checkNFTBalance(
  walletAddress: string, 
  contractAddress: string, 
  chainId: string | number
): Promise<number> {
  const provider = getProvider(chainId);
  if (!provider) {
    return 0;
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      ['function balanceOf(address owner) view returns (uint256)'],
      provider
    ) as Contract;

    const balance = await contract.balanceOf(walletAddress);
    return Number(balance);
  } catch (error) {
    const err = error as Error;
    logger.error('NFT balance check failed:', { error: err.message });
    return 0;
  }
}

/**
 * Check ERC20 token balance
 */
export async function checkTokenBalance(
  walletAddress: string, 
  tokenAddress: string, 
  chainId: string | number
): Promise<number> {
  const provider = getProvider(chainId);
  if (!provider) {
    return 0;
  }

  try {
    const contract = new ethers.Contract(
      tokenAddress,
      [
        'function balanceOf(address owner) view returns (uint256)',
        'function decimals() view returns (uint8)'
      ],
      provider
    ) as Contract;

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals()
    ]);

    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (error) {
    const err = error as Error;
    logger.error('Token balance check failed:', { error: err.message });
    return 0;
  }
}

export default {
  getProvider,
  getSolanaConnection,
  verifyEVMTransaction,
  verifySolanaTransaction,
  checkNFTBalance,
  checkTokenBalance
};


