/**
 * Blockchain service
 * Handles blockchain interactions (EVM and Solana)
 */
import { ethers, type JsonRpcProvider, type Contract } from 'ethers';
import { Connection, type ParsedTransactionWithMeta } from '@solana/web3.js';
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

// ERC-20 Transfer event topic (keccak256 of "Transfer(address,address,uint256)")
const TRANSFER_EVENT_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// USDC contract addresses for all supported chains
const USDC_CONTRACTS: Record<string, string> = {
  '1': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',      // Ethereum
  '137': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',    // Polygon (PoS Bridged)
  '42161': '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',  // Arbitrum (Native)
  '10': '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',     // Optimism (Native)
  '8453': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',   // Base (Native)
};

interface SolanaInstruction {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: {
      destination?: string;
      source?: string;
      lamports?: number;
      // SPL Token transfer fields
      authority?: string;
      amount?: string;
      mint?: string;
      tokenAmount?: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string;
      };
    };
  };
}

// Solana USDC mint address
const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Alchemy RPC base URLs by chain ID
const ALCHEMY_RPC_URLS: Record<string, string> = {
  '1': 'https://eth-mainnet.g.alchemy.com/v2',
  '137': 'https://polygon-mainnet.g.alchemy.com/v2',
  '42161': 'https://arb-mainnet.g.alchemy.com/v2',
  '10': 'https://opt-mainnet.g.alchemy.com/v2',
  '8453': 'https://base-mainnet.g.alchemy.com/v2',
};

// RPC providers cache
const providers: Record<string, JsonRpcProvider> = {};

/**
 * Get RPC URL for a chain (uses Alchemy if configured, falls back to individual URLs)
 */
function getRpcUrl(chainId: string): string | undefined {
  // If Alchemy API key is configured, use it
  if (config.ALCHEMY_API_KEY) {
    const baseUrl = ALCHEMY_RPC_URLS[chainId];
    if (baseUrl) {
      return `${baseUrl}/${config.ALCHEMY_API_KEY}`;
    }
  }
  
  // Fallback to individual RPC URL config
  switch (chainId) {
    case '1':
    case 'ethereum':
      return config.ETH_RPC_URL;
    case '137':
    case 'polygon':
      return config.POLYGON_RPC_URL;
    case '42161':
    case 'arbitrum':
      return config.ARBITRUM_RPC_URL;
    case '10':
    case 'optimism':
      return config.OPTIMISM_RPC_URL;
    case '8453':
    case 'base':
      return config.BASE_RPC_URL;
    default:
      return undefined;
  }
}

/**
 * Get RPC provider for a chain
 */
export function getProvider(chainId: string | number): JsonRpcProvider | null {
  const chainIdStr = String(chainId);
  if (providers[chainIdStr]) {
    return providers[chainIdStr];
  }

  const rpcUrl = getRpcUrl(chainIdStr);

  if (!rpcUrl) {
    logger.error('No RPC URL configured for chain', { chainId: chainIdStr, hasAlchemyKey: !!config.ALCHEMY_API_KEY });
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
 * Supports both native ETH/token transfers and ERC-20 token transfers (USDC)
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

  const chainIdStr = String(chainId);
  const usdcAddress = USDC_CONTRACTS[chainIdStr]?.toLowerCase();
  const expectedToLower = expectedTo.toLowerCase();

  // First, check for USDC Transfer events in the logs
  // This handles both direct transfers to USDC contract and transfers through other contracts
  if (usdcAddress) {
    // Find a Transfer event from USDC contract TO the payment wallet
    const transferLog = receipt.logs.find(log => {
      if (
        log.address.toLowerCase() === usdcAddress &&
        log.topics[0] === TRANSFER_EVENT_TOPIC &&
        log.topics.length >= 3
      ) {
        // Check if 'to' address matches expected payment wallet
        const toAddress = '0x' + log.topics[2].slice(26);
        return toAddress.toLowerCase() === expectedToLower;
      }
      return false;
    });

    if (transferLog) {
      // Decode Transfer event: Transfer(address indexed from, address indexed to, uint256 value)
      // topics[0] = event signature
      // topics[1] = from address (padded to 32 bytes)
      // topics[2] = to address (padded to 32 bytes)
      // data = value (uint256)
      const fromAddress = '0x' + transferLog.topics[1].slice(26);
      const toAddress = '0x' + transferLog.topics[2].slice(26);
      const valueHex = transferLog.data;
      
      // USDC has 6 decimals
      const valueBigInt = BigInt(valueHex);
      const valueInUSDC = Number(valueBigInt) / 1e6;

      logger.debug('Parsed ERC-20 Transfer event', {
        txHash,
        from: fromAddress,
        to: toAddress,
        value: valueInUSDC,
        chainId,
        usdcContract: usdcAddress
      });

      // Verify amount (with 1% tolerance)
      if (valueInUSDC < expectedAmount * 0.99) {
        logger.error('Transfer amount too low', {
          expected: expectedAmount,
          actual: valueInUSDC
        });
        throw new Error(`Transaction amount too low: expected ${expectedAmount}, got ${valueInUSDC}`);
      }

      return {
        verified: true,
        from: fromAddress,
        to: toAddress,
        value: valueInUSDC,
        blockNumber: receipt.blockNumber
      };
    }

    // If tx.to is the USDC contract but no Transfer to payment wallet found
    if (tx.to?.toLowerCase() === usdcAddress) {
      logger.error('USDC transfer detected but not to payment wallet', {
        txHash,
        chainId,
        expectedTo: expectedToLower
      });
      throw new Error('No balance change found - USDC not sent to payment wallet');
    }
  }

  // Fall back to native token transfer (ETH, MATIC, etc.)
  // Verify recipient
  if (tx.to?.toLowerCase() !== expectedToLower) {
    // Log detailed info for debugging
    logger.error('No valid payment found', {
      txHash,
      chainId,
      txTo: tx.to?.toLowerCase(),
      expectedTo: expectedToLower,
      hasUsdcAddress: !!usdcAddress,
      logsCount: receipt.logs.length
    });
    throw new Error('No balance change found - transaction not to payment wallet');
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
 * Supports both native SOL transfers and SPL token transfers (USDC)
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

  // Find the transfer instruction (check both main instructions and inner instructions)
  const instructions = tx.transaction.message.instructions as SolanaInstruction[];
  const innerInstructions = tx.meta?.innerInstructions || [];
  
  // Collect all instructions including inner ones
  const allInstructions: SolanaInstruction[] = [...instructions];
  for (const inner of innerInstructions) {
    if (inner.instructions) {
      allInstructions.push(...(inner.instructions as SolanaInstruction[]));
    }
  }

  let transferFound = false;
  let from: string | null = null;
  let amount = 0;

  // First, try to find SPL Token transfer (for USDC)
  let destination: string | null = null;
  
  for (const ix of allInstructions) {
    // SPL Token program transfers
    if (ix.program === 'spl-token' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info;
      // For SPL token transfers, 'destination' is the token account, not the wallet
      // The amount is in the smallest unit (for USDC, 6 decimals)
      if (info?.amount) {
        transferFound = true;
        from = info.authority || null;
        destination = info.destination || null;
        amount = parseInt(info.amount) / 1e6; // USDC has 6 decimals
        logger.debug('Found SPL Token transfer', {
          from,
          amount,
          destination,
          source: info.source
        });
        break;
      }
    }
    
    // SPL Token transferChecked (more common for USDC)
    if (ix.program === 'spl-token' && ix.parsed?.type === 'transferChecked') {
      const info = ix.parsed.info;
      if (info?.tokenAmount) {
        transferFound = true;
        from = info.authority || null;
        destination = info.destination || null;
        amount = info.tokenAmount.uiAmount || 0;
        logger.debug('Found SPL Token transferChecked', {
          from,
          amount,
          destination,
          decimals: info.tokenAmount.decimals,
          mint: info.mint
        });
        break;
      }
    }
  }

  // If no SPL token transfer found, check for native SOL transfer
  if (!transferFound) {
    for (const ix of allInstructions) {
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
  }

  if (!transferFound) {
    logger.error('No matching transfer found in Solana transaction', { txHash });
    throw new Error('No balance change found - no transfer instruction found');
  }

  if (amount < expectedAmount * 0.99) {
    logger.error('Solana transfer amount too low', {
      expected: expectedAmount,
      actual: amount
    });
    throw new Error(`Transaction amount too low: expected ${expectedAmount}, got ${amount}`);
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





