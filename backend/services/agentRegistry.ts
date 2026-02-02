/**
 * Agent Registry Service
 * Manages Seisoai's registered agents on ERC-8004 contracts
 */
import { ethers, type Contract, type Signer } from 'ethers';
import { getProvider } from './blockchain';
import logger from '../utils/logger';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import _config from '../config/env';

// Contract ABIs (minimal interfaces for the functions we need)
const IDENTITY_REGISTRY_ABI = [
  'function register(string agentURI) external returns (uint256 agentId)',
  'function register(string agentURI, tuple(string metadataKey, bytes metadataValue)[] metadata) external returns (uint256 agentId)',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)',
  'function tokenURI(uint256 agentId) external view returns (string)',
  'function ownerOf(uint256 agentId) external view returns (address)',
  'function nextAgentId() external view returns (uint256)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
];

const REPUTATION_REGISTRY_ABI = [
  'function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)',
  'function getClients(uint256 agentId) external view returns (address[])',
  'function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64)',
  'function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)',
];

// Types
export interface AgentRegistration {
  type: string;
  name: string;
  description: string;
  image: string;
  services: Array<{
    name: string;
    endpoint: string;
    version?: string;
  }>;
  active: boolean;
  supportedTrust: string[];
  registrations?: Array<{
    agentId: number;
    agentRegistry: string;
  }>;
}

export interface RegisteredAgent {
  agentId: number;
  name: string;
  description: string;
  agentURI: string;
  owner: string;
  agentRegistry: string;
  chainId: number;
}

export interface AgentReputationSummary {
  agentId: number;
  feedbackCount: number;
  averageScore: number;
  clientCount: number;
}

// Seisoai agent definitions
export const SEISOAI_AGENTS: AgentRegistration[] = [
  {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Seisoai ChatAssistant',
    description: 'AI assistant for creative content generation including images, videos, and music',
    image: 'https://seisoai.com/seiso-logo.png',
    services: [
      { name: 'web', endpoint: 'https://seisoai.com/' },
    ],
    active: true,
    supportedTrust: ['reputation'],
  },
  {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Seisoai Image Generator',
    description: 'AI-powered image generation using state-of-the-art diffusion models',
    image: 'https://seisoai.com/seiso-logo.png',
    services: [
      { name: 'web', endpoint: 'https://seisoai.com/' },
    ],
    active: true,
    supportedTrust: ['reputation'],
  },
  {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Seisoai Video Generator',
    description: 'AI video creation and editing service',
    image: 'https://seisoai.com/seiso-logo.png',
    services: [
      { name: 'web', endpoint: 'https://seisoai.com/' },
    ],
    active: true,
    supportedTrust: ['reputation'],
  },
  {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Seisoai Music Generator',
    description: 'AI music and audio generation service with stem mixing',
    image: 'https://seisoai.com/seiso-logo.png',
    services: [
      { name: 'web', endpoint: 'https://seisoai.com/' },
    ],
    active: true,
    supportedTrust: ['reputation'],
  },
];

// Contract addresses (loaded from env or deployment files)
let contractAddresses: {
  identityRegistry?: string;
  reputationRegistry?: string;
  validationRegistry?: string;
  chainId?: number;
} = {};

/**
 * Initialize contract addresses from environment or deployment file
 */
export function initializeContracts(addresses: {
  identityRegistry: string;
  reputationRegistry: string;
  validationRegistry?: string;
  chainId: number;
}) {
  contractAddresses = addresses;
  logger.info('ERC-8004 contracts initialized', { 
    chainId: addresses.chainId,
    identityRegistry: addresses.identityRegistry 
  });
}

/**
 * Get Identity Registry contract instance
 */
function getIdentityRegistry(signerOrProvider?: Signer | ethers.Provider): Contract | null {
  if (!contractAddresses.identityRegistry || !contractAddresses.chainId) {
    logger.warn('Identity Registry not configured');
    return null;
  }

  const provider = signerOrProvider || getProvider(contractAddresses.chainId);
  if (!provider) {
    return null;
  }

  return new ethers.Contract(
    contractAddresses.identityRegistry,
    IDENTITY_REGISTRY_ABI,
    provider
  );
}

/**
 * Get Reputation Registry contract instance
 */
function getReputationRegistry(signerOrProvider?: Signer | ethers.Provider): Contract | null {
  if (!contractAddresses.reputationRegistry || !contractAddresses.chainId) {
    logger.warn('Reputation Registry not configured');
    return null;
  }

  const provider = signerOrProvider || getProvider(contractAddresses.chainId);
  if (!provider) {
    return null;
  }

  return new ethers.Contract(
    contractAddresses.reputationRegistry,
    REPUTATION_REGISTRY_ABI,
    provider
  );
}

/**
 * Create agent URI from registration data
 */
export function createAgentURI(registration: AgentRegistration): string {
  const base64Data = Buffer.from(JSON.stringify(registration)).toString('base64');
  return `data:application/json;base64,${base64Data}`;
}

/**
 * Parse agent URI to get registration data
 */
export function parseAgentURI(uri: string): AgentRegistration | null {
  try {
    if (uri.startsWith('data:application/json;base64,')) {
      const base64Data = uri.replace('data:application/json;base64,', '');
      const jsonData = Buffer.from(base64Data, 'base64').toString('utf-8');
      return JSON.parse(jsonData);
    }
    // For IPFS or HTTPS URIs, would need to fetch
    return null;
  } catch (error) {
    logger.error('Failed to parse agent URI', { error });
    return null;
  }
}

/**
 * Get agent info by ID
 */
export async function getAgentInfo(agentId: number): Promise<RegisteredAgent | null> {
  const contract = getIdentityRegistry();
  if (!contract) {
    return null;
  }

  try {
    const [agentURI, owner] = await Promise.all([
      contract.tokenURI(agentId),
      contract.ownerOf(agentId),
    ]);

    const registration = parseAgentURI(agentURI);

    return {
      agentId,
      name: registration?.name || `Agent #${agentId}`,
      description: registration?.description || '',
      agentURI,
      owner,
      agentRegistry: `eip155:${contractAddresses.chainId}:${contractAddresses.identityRegistry}`,
      chainId: contractAddresses.chainId!,
    };
  } catch (error) {
    logger.error('Failed to get agent info', { agentId, error });
    return null;
  }
}

/**
 * Get all agents owned by an address
 */
export async function getAgentsByOwner(ownerAddress: string): Promise<RegisteredAgent[]> {
  const contract = getIdentityRegistry();
  if (!contract) {
    return [];
  }

  try {
    const nextId = await contract.nextAgentId();
    const agents: RegisteredAgent[] = [];

    // Check each agent ID to see if owned by the address
    for (let i = 1; i < Number(nextId); i++) {
      try {
        const owner = await contract.ownerOf(i);
        if (owner.toLowerCase() === ownerAddress.toLowerCase()) {
          const agentInfo = await getAgentInfo(i);
          if (agentInfo) {
            agents.push(agentInfo);
          }
        }
      } catch {
        // Agent might be burned or not exist
        continue;
      }
    }

    return agents;
  } catch (error) {
    logger.error('Failed to get agents by owner', { ownerAddress, error });
    return [];
  }
}

/**
 * Get reputation summary for an agent
 */
export async function getAgentReputation(agentId: number): Promise<AgentReputationSummary | null> {
  const contract = getReputationRegistry();
  if (!contract) {
    return null;
  }

  try {
    // Get all clients who gave feedback
    const clients = await contract.getClients(agentId);
    
    if (clients.length === 0) {
      return {
        agentId,
        feedbackCount: 0,
        averageScore: 0,
        clientCount: 0,
      };
    }

    // Get summary with all clients
    const [count, summaryValue, summaryValueDecimals] = await contract.getSummary(
      agentId,
      clients,
      '',
      ''
    );

    // Calculate average score (normalize to 0-100)
    const divisor = Math.pow(10, Number(summaryValueDecimals));
    const averageScore = Number(count) > 0 
      ? Number(summaryValue) / divisor / Number(count)
      : 0;

    return {
      agentId,
      feedbackCount: Number(count),
      averageScore,
      clientCount: clients.length,
    };
  } catch (error) {
    logger.error('Failed to get agent reputation', { agentId, error });
    return null;
  }
}

/**
 * Get the agent registry string for the configured chain
 */
export function getAgentRegistryString(): string | null {
  if (!contractAddresses.identityRegistry || !contractAddresses.chainId) {
    return null;
  }
  return `eip155:${contractAddresses.chainId}:${contractAddresses.identityRegistry}`;
}

/**
 * Get contract configuration status
 */
export function getContractStatus(): {
  configured: boolean;
  chainId?: number;
  identityRegistry?: string;
  reputationRegistry?: string;
} {
  return {
    configured: Boolean(contractAddresses.identityRegistry),
    chainId: contractAddresses.chainId,
    identityRegistry: contractAddresses.identityRegistry,
    reputationRegistry: contractAddresses.reputationRegistry,
  };
}

export default {
  initializeContracts,
  getAgentInfo,
  getAgentsByOwner,
  getAgentReputation,
  createAgentURI,
  parseAgentURI,
  getAgentRegistryString,
  getContractStatus,
  SEISOAI_AGENTS,
};
