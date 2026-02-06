/**
 * Agent Registry Service
 * Frontend service for interacting with ERC-8004 agent registry
 */
import logger from '../utils/logger';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';

// Types
export interface AgentService {
  name: string;
  endpoint: string;
  version?: string;
}

export interface AgentRegistration {
  type: string;
  name: string;
  description: string;
  image: string;
  services: AgentService[];
  active: boolean;
  supportedTrust: string[];
}

export interface RegisteredAgent {
  agentId: number;
  name: string;
  description: string;
  agentURI: string;
  owner: string;
  agentRegistry: string;
  chainId: number;
  registration?: AgentRegistration;
}

export interface AgentReputationSummary {
  agentId: number;
  feedbackCount: number;
  averageScore: number;
  clientCount: number;
}

export interface AgentDefinition {
  id: number;
  name: string;
  description: string;
  services: AgentService[];
  active: boolean;
  supportedTrust: string[];
  agentURI: string;
}

export interface ContractStatus {
  configured: boolean;
  chainId?: number;
  identityRegistry?: string;
  reputationRegistry?: string;
  agentRegistry?: string;
}

/**
 * Get ERC-8004 contract configuration status
 */
export async function getContractStatus(): Promise<ContractStatus> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get status');
    }

    return data.status;
  } catch (error) {
    logger.error('Failed to get contract status', { error });
    return { configured: false };
  }
}

/**
 * Get pre-configured Seisoai agent definitions
 */
export async function getAgentDefinitions(): Promise<AgentDefinition[]> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/definitions`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to get definitions');
    }

    return data.agents;
  } catch (error) {
    logger.error('Failed to get agent definitions', { error });
    return [];
  }
}

/**
 * Get agent info by ID
 */
export async function getAgentInfo(agentId: number): Promise<RegisteredAgent | null> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/${agentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    
    if (!data.success) {
      return null;
    }

    return data.agent;
  } catch (error) {
    logger.error('Failed to get agent info', { error });
    return null;
  }
}

/**
 * Get agents owned by an address
 */
export async function getAgentsByOwner(ownerAddress: string): Promise<RegisteredAgent[]> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/owner/${ownerAddress}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    
    if (!data.success) {
      return [];
    }

    return data.agents;
  } catch (error) {
    logger.error('Failed to get agents by owner', { error });
    return [];
  }
}

/**
 * Get reputation summary for an agent
 */
export async function getAgentReputation(agentId: number): Promise<AgentReputationSummary | null> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/${agentId}/reputation`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    
    if (!data.success) {
      return null;
    }

    return data.reputation;
  } catch (error) {
    logger.error('Failed to get agent reputation', { error });
    return null;
  }
}

/**
 * Generate an agent URI for registration
 */
export async function generateAgentURI(
  name: string,
  description: string,
  options?: {
    image?: string;
    services?: AgentService[];
    active?: boolean;
    supportedTrust?: string[];
  }
): Promise<{ registration: AgentRegistration; agentURI: string } | null> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/generate-uri`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        name,
        description,
        ...options,
      }),
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to generate URI');
    }

    return {
      registration: data.registration,
      agentURI: data.agentURI,
    };
  } catch (error) {
    logger.error('Failed to generate agent URI', { error });
    return null;
  }
}

/**
 * Get chain name from chain ID
 */
export function getChainName(chainId: number): string {
  const chains: Record<number, string> = {
    1: 'Ethereum',
    8453: 'Base',
    42161: 'Arbitrum',
    137: 'Polygon',
    10: 'Optimism',
    11155111: 'Sepolia',
    84532: 'Base Sepolia',
  };
  return chains[chainId] || `Chain ${chainId}`;
}

/**
 * Get block explorer URL for a contract
 */
export function getExplorerUrl(chainId: number, address: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io/address/',
    8453: 'https://basescan.org/address/',
    42161: 'https://arbiscan.io/address/',
    137: 'https://polygonscan.com/address/',
    10: 'https://optimistic.etherscan.io/address/',
    11155111: 'https://sepolia.etherscan.io/address/',
    84532: 'https://sepolia.basescan.org/address/',
  };
  return `${explorers[chainId] || 'https://etherscan.io/address/'}${address}`;
}

/**
 * Create a custom AI agent
 */
export async function createAgent(agentData: {
  name: string;
  description: string;
  type: string;
  image?: string;
  tools: string[];
  services?: AgentService[];
  skillMd?: string;
}): Promise<{ agent: RegisteredAgent; agentURI: string; skillMd: string } | null> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(agentData),
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to create agent');
    }

    return {
      agent: data.agent,
      agentURI: data.agentURI,
      skillMd: data.skillMd,
    };
  } catch (error) {
    logger.error('Failed to create agent', { error });
    return null;
  }
}

/**
 * Get custom agents for the connected wallet
 */
export async function getCustomAgents(ownerAddress: string): Promise<RegisteredAgent[]> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/custom/${ownerAddress}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    
    if (!data.success) {
      return [];
    }

    return data.agents;
  } catch (error) {
    logger.error('Failed to get custom agents', { error });
    return [];
  }
}

/**
 * Delete a custom agent
 */
export async function deleteCustomAgent(agentId: string): Promise<boolean> {
  try {
    await ensureCSRFToken();
    
    const response = await fetch(`${API_URL}/api/agents/custom/${agentId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    const data = await response.json();
    return data.success === true;
  } catch (error) {
    logger.error('Failed to delete custom agent', { error });
    return false;
  }
}

/**
 * List all custom agents across all owners (public directory)
 */
export interface AgentListItem {
  agentId: string;
  name: string;
  description: string;
  type: string;
  tools: string[];
  owner: string;
  createdAt: string;
  agentURI: string;
  invokeUrl: string;
  x402Supported: boolean;
}

export async function getAgentList(): Promise<AgentListItem[]> {
  try {
    const response = await fetch(`${API_URL}/api/agents/list`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    
    if (!data.success) {
      return [];
    }

    return data.agents;
  } catch (error) {
    logger.error('Failed to list agents', { error });
    return [];
  }
}

export default {
  getContractStatus,
  getAgentDefinitions,
  getAgentInfo,
  getAgentsByOwner,
  getAgentReputation,
  generateAgentURI,
  createAgent,
  getCustomAgents,
  deleteCustomAgent,
  getAgentList,
  getChainName,
  getExplorerUrl,
};
