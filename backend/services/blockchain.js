/**
 * Blockchain service
 * Handles blockchain interactions (EVM and Solana)
 */
import { ethers } from 'ethers';
import { Connection, PublicKey } from '@solana/web3.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// RPC providers cache
const providers = {};

/**
 * Get RPC provider for a chain
 */
export function getProvider(chainId) {
  if (providers[chainId]) {
    return providers[chainId];
  }

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
      return null;
  }

  if (!rpcUrl) {
    return null;
  }

  providers[chainId] = new ethers.JsonRpcProvider(rpcUrl);
  return providers[chainId];
}

/**
 * Get Solana connection
 */
export function getSolanaConnection() {
  if (!config.SOLANA_RPC_URL) {
    return null;
  }
  return new Connection(config.SOLANA_RPC_URL, 'confirmed');
}

/**
 * Verify EVM transaction
 */
export async function verifyEVMTransaction(txHash, expectedTo, expectedAmount, chainId) {
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
    to: tx.to,
    value: txValue,
    blockNumber: receipt.blockNumber
  };
}

/**
 * Verify Solana transaction
 */
export async function verifySolanaTransaction(txHash, expectedTo, expectedAmount) {
  const connection = getSolanaConnection();
  if (!connection) {
    throw new Error('Solana RPC not configured');
  }

  const tx = await connection.getParsedTransaction(txHash, {
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    throw new Error('Transaction not found');
  }

  if (tx.meta?.err) {
    throw new Error('Transaction failed');
  }

  // Find the transfer instruction
  const instructions = tx.transaction.message.instructions;
  let transferFound = false;
  let from = null;
  let amount = 0;

  for (const ix of instructions) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info;
      if (info.destination === expectedTo) {
        transferFound = true;
        from = info.source;
        amount = info.lamports / 1e9; // Convert lamports to SOL
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
    from,
    to: expectedTo,
    value: amount,
    slot: tx.slot
  };
}

/**
 * Check NFT balance
 */
export async function checkNFTBalance(walletAddress, contractAddress, chainId) {
  const provider = getProvider(chainId);
  if (!provider) {
    return 0;
  }

  try {
    const contract = new ethers.Contract(
      contractAddress,
      ['function balanceOf(address owner) view returns (uint256)'],
      provider
    );

    const balance = await contract.balanceOf(walletAddress);
    return Number(balance);
  } catch (error) {
    logger.error('NFT balance check failed:', { error: error.message });
    return 0;
  }
}

/**
 * Check ERC20 token balance
 */
export async function checkTokenBalance(walletAddress, tokenAddress, chainId) {
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
    );

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals()
    ]);

    return parseFloat(ethers.formatUnits(balance, decimals));
  } catch (error) {
    logger.error('Token balance check failed:', { error: error.message });
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



