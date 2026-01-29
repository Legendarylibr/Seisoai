/**
 * ERC-8004 Agent Reputation Service
 * Handles feedback submission, reputation aggregation, and response management
 */
import { ethers, Contract, Wallet } from 'ethers';
import { getProvider } from './blockchain';
import logger from '../utils/logger';
import config from '../config/env';

// Contract ABI
const REPUTATION_REGISTRY_ABI = [
  // Read functions
  'function getIdentityRegistry() view returns (address)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)',
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function readAllFeedback(uint256 agentId, address[] clientAddresses, string tag1, string tag2, bool includeRevoked) view returns (address[] clients, uint64[] feedbackIndexes, int128[] values, uint8[] valueDecimals, string[] tag1s, string[] tag2s, bool[] revokedStatuses)',
  'function getClients(uint256 agentId) view returns (address[])',
  'function getLastIndex(uint256 agentId, address clientAddress) view returns (uint64)',
  'function getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders) view returns (uint64)',
  
  // Write functions
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex)',
  'function appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseURI, bytes32 responseHash)',
  
  // Events
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
  'event FeedbackRevoked(uint256 indexed agentId, address indexed clientAddress, uint64 indexed feedbackIndex)',
  'event ResponseAppended(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, address indexed responder, string responseURI, bytes32 responseHash)',
];

// Types
export interface Feedback {
  clientAddress: string;
  feedbackIndex: number;
  value: number;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
}

export interface FeedbackSummary {
  count: number;
  summaryValue: number;
  summaryValueDecimals: number;
  averageValue?: number;
}

export interface FeedbackInput {
  agentId: string;
  value: number;
  valueDecimals: number;
  tag1?: string;
  tag2?: string;
  endpoint?: string;
  feedbackURI?: string;
  feedbackHash?: string;
}

// Contract addresses per chain
const REPUTATION_REGISTRY_ADDRESSES: Record<string, string> = {
  // Add deployed contract addresses here
};

/**
 * Get Reputation Registry contract instance
 */
function getReputationRegistry(chainId: string | number): Contract | null {
  const chainIdStr = String(chainId);
  const address = REPUTATION_REGISTRY_ADDRESSES[chainIdStr];
  
  if (!address) {
    logger.warn(`No Reputation Registry deployed on chain ${chainId}`);
    return null;
  }

  const provider = getProvider(chainId);
  if (!provider) {
    return null;
  }

  return new ethers.Contract(address, REPUTATION_REGISTRY_ABI, provider);
}

/**
 * Get Reputation Registry with signer for write operations
 */
function getReputationRegistryWithSigner(chainId: string | number): Contract | null {
  const chainIdStr = String(chainId);
  const address = REPUTATION_REGISTRY_ADDRESSES[chainIdStr];
  
  if (!address) {
    return null;
  }

  const provider = getProvider(chainId);
  if (!provider) {
    return null;
  }

  const privateKey = config.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    return null;
  }

  const wallet = new Wallet(privateKey, provider);
  return new ethers.Contract(address, REPUTATION_REGISTRY_ABI, wallet);
}

/**
 * Submit feedback for an agent
 */
export async function submitFeedback(
  chainId: string | number,
  input: FeedbackInput,
  signerPrivateKey?: string
): Promise<{ feedbackIndex: string; transactionHash: string }> {
  const chainIdStr = String(chainId);
  const address = REPUTATION_REGISTRY_ADDRESSES[chainIdStr];
  
  if (!address) {
    throw new Error(`Reputation Registry not available on chain ${chainId}`);
  }

  const provider = getProvider(chainId);
  if (!provider) {
    throw new Error(`Provider not available for chain ${chainId}`);
  }

  const privateKey = signerPrivateKey || config.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('No signer available');
  }

  const wallet = new Wallet(privateKey, provider);
  const contract = new ethers.Contract(address, REPUTATION_REGISTRY_ABI, wallet);

  const feedbackHash = input.feedbackHash 
    ? input.feedbackHash 
    : input.feedbackURI 
      ? ethers.keccak256(ethers.toUtf8Bytes(input.feedbackURI))
      : ethers.ZeroHash;

  const tx = await contract.giveFeedback(
    input.agentId,
    input.value,
    input.valueDecimals,
    input.tag1 || '',
    input.tag2 || '',
    input.endpoint || '',
    input.feedbackURI || '',
    feedbackHash
  );

  const receipt = await tx.wait();

  // Extract feedbackIndex from NewFeedback event
  const feedbackEvent = receipt.logs.find((log: any) => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed?.name === 'NewFeedback';
    } catch {
      return false;
    }
  });

  let feedbackIndex = '0';
  if (feedbackEvent) {
    const parsed = contract.interface.parseLog(feedbackEvent);
    feedbackIndex = parsed?.args.feedbackIndex?.toString() || '0';
  }

  logger.info('Feedback submitted', { 
    agentId: input.agentId, 
    feedbackIndex, 
    chainId, 
    txHash: tx.hash 
  });

  return {
    feedbackIndex,
    transactionHash: tx.hash,
  };
}

/**
 * Revoke feedback
 */
export async function revokeFeedback(
  chainId: string | number,
  agentId: string,
  feedbackIndex: number,
  signerPrivateKey?: string
): Promise<{ transactionHash: string }> {
  const chainIdStr = String(chainId);
  const address = REPUTATION_REGISTRY_ADDRESSES[chainIdStr];
  
  if (!address) {
    throw new Error(`Reputation Registry not available on chain ${chainId}`);
  }

  const provider = getProvider(chainId);
  if (!provider) {
    throw new Error(`Provider not available for chain ${chainId}`);
  }

  const privateKey = signerPrivateKey || config.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('No signer available');
  }

  const wallet = new Wallet(privateKey, provider);
  const contract = new ethers.Contract(address, REPUTATION_REGISTRY_ABI, wallet);

  const tx = await contract.revokeFeedback(agentId, feedbackIndex);
  await tx.wait();

  logger.info('Feedback revoked', { agentId, feedbackIndex, chainId, txHash: tx.hash });

  return { transactionHash: tx.hash };
}

/**
 * Append response to feedback
 */
export async function appendResponse(
  chainId: string | number,
  agentId: string,
  clientAddress: string,
  feedbackIndex: number,
  responseURI: string,
  responseHash?: string,
  signerPrivateKey?: string
): Promise<{ transactionHash: string }> {
  const chainIdStr = String(chainId);
  const address = REPUTATION_REGISTRY_ADDRESSES[chainIdStr];
  
  if (!address) {
    throw new Error(`Reputation Registry not available on chain ${chainId}`);
  }

  const provider = getProvider(chainId);
  if (!provider) {
    throw new Error(`Provider not available for chain ${chainId}`);
  }

  const privateKey = signerPrivateKey || config.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('No signer available');
  }

  const wallet = new Wallet(privateKey, provider);
  const contract = new ethers.Contract(address, REPUTATION_REGISTRY_ABI, wallet);

  const hash = responseHash || ethers.keccak256(ethers.toUtf8Bytes(responseURI));

  const tx = await contract.appendResponse(
    agentId,
    clientAddress,
    feedbackIndex,
    responseURI,
    hash
  );
  await tx.wait();

  logger.info('Response appended', { agentId, feedbackIndex, chainId, txHash: tx.hash });

  return { transactionHash: tx.hash };
}

/**
 * Get reputation summary for an agent
 */
export async function getReputationSummary(
  chainId: string | number,
  agentId: string,
  clientAddresses?: string[],
  tag1?: string,
  tag2?: string
): Promise<FeedbackSummary | null> {
  const contract = getReputationRegistry(chainId);
  if (!contract) {
    return null;
  }

  try {
    // If no client addresses provided, get all clients
    let clients = clientAddresses;
    if (!clients || clients.length === 0) {
      clients = await contract.getClients(agentId);
    }

    if (clients.length === 0) {
      return {
        count: 0,
        summaryValue: 0,
        summaryValueDecimals: 0,
        averageValue: 0,
      };
    }

    const [count, summaryValue, summaryValueDecimals] = await contract.getSummary(
      agentId,
      clients,
      tag1 || '',
      tag2 || ''
    );

    const countNum = Number(count);
    const valueNum = Number(summaryValue);
    const decimalsNum = Number(summaryValueDecimals);

    return {
      count: countNum,
      summaryValue: valueNum,
      summaryValueDecimals: decimalsNum,
      averageValue: countNum > 0 ? valueNum / countNum / (10 ** decimalsNum) : 0,
    };
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get reputation summary', { agentId, chainId, error: err.message });
    return null;
  }
}

/**
 * Read single feedback entry
 */
export async function readFeedback(
  chainId: string | number,
  agentId: string,
  clientAddress: string,
  feedbackIndex: number
): Promise<Feedback | null> {
  const contract = getReputationRegistry(chainId);
  if (!contract) {
    return null;
  }

  try {
    const [value, valueDecimals, tag1, tag2, isRevoked] = await contract.readFeedback(
      agentId,
      clientAddress,
      feedbackIndex
    );

    return {
      clientAddress,
      feedbackIndex,
      value: Number(value),
      valueDecimals: Number(valueDecimals),
      tag1,
      tag2,
      isRevoked,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Read all feedback for an agent
 */
export async function readAllFeedback(
  chainId: string | number,
  agentId: string,
  options?: {
    clientAddresses?: string[];
    tag1?: string;
    tag2?: string;
    includeRevoked?: boolean;
  }
): Promise<Feedback[]> {
  const contract = getReputationRegistry(chainId);
  if (!contract) {
    return [];
  }

  try {
    const result = await contract.readAllFeedback(
      agentId,
      options?.clientAddresses || [],
      options?.tag1 || '',
      options?.tag2 || '',
      options?.includeRevoked || false
    );

    const feedback: Feedback[] = [];
    for (let i = 0; i < result.clients.length; i++) {
      feedback.push({
        clientAddress: result.clients[i],
        feedbackIndex: Number(result.feedbackIndexes[i]),
        value: Number(result.values[i]),
        valueDecimals: Number(result.valueDecimals[i]),
        tag1: result.tag1s[i],
        tag2: result.tag2s[i],
        isRevoked: result.revokedStatuses[i],
      });
    }

    return feedback;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to read all feedback', { agentId, chainId, error: err.message });
    return [];
  }
}

/**
 * Get all clients who gave feedback to an agent
 */
export async function getClients(
  chainId: string | number,
  agentId: string
): Promise<string[]> {
  const contract = getReputationRegistry(chainId);
  if (!contract) {
    return [];
  }

  try {
    return await contract.getClients(agentId);
  } catch {
    return [];
  }
}

/**
 * Get last feedback index for a client-agent pair
 */
export async function getLastFeedbackIndex(
  chainId: string | number,
  agentId: string,
  clientAddress: string
): Promise<number> {
  const contract = getReputationRegistry(chainId);
  if (!contract) {
    return 0;
  }

  try {
    const index = await contract.getLastIndex(agentId, clientAddress);
    return Number(index);
  } catch {
    return 0;
  }
}

/**
 * Set contract address (for dynamic configuration)
 */
export function setReputationRegistryAddress(chainId: string | number, address: string): void {
  REPUTATION_REGISTRY_ADDRESSES[String(chainId)] = address;
}

/**
 * Get contract address for a chain
 */
export function getReputationRegistryAddress(chainId: string | number): string | null {
  return REPUTATION_REGISTRY_ADDRESSES[String(chainId)] || null;
}

// Common feedback tags
export const FEEDBACK_TAGS = {
  STARRED: 'starred',        // Quality rating (0-100)
  REACHABLE: 'reachable',    // Endpoint reachable (binary)
  UPTIME: 'uptime',          // Endpoint uptime (%)
  SUCCESS_RATE: 'successRate', // Success rate (%)
  RESPONSE_TIME: 'responseTime', // Response time (ms)
  REVENUES: 'revenues',      // Cumulative revenues
} as const;

export default {
  submitFeedback,
  revokeFeedback,
  appendResponse,
  getReputationSummary,
  readFeedback,
  readAllFeedback,
  getClients,
  getLastFeedbackIndex,
  setReputationRegistryAddress,
  getReputationRegistryAddress,
  FEEDBACK_TAGS,
};
