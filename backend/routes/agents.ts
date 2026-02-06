/**
 * Agent routes
 * API endpoints for managing Seisoai's ERC-8004 registered agents
 */
import { Router, type Request, type Response } from 'express';
import logger from '../utils/logger';
import {
  getAgentInfo,
  getAgentsByOwner,
  getAgentReputation,
  getContractStatus,
  getAgentRegistryString,
  SEISOAI_AGENTS,
  parseAgentURI,
  createAgentURI,
} from '../services/agentRegistry';

const router = Router();

// ── Custom agent type (in-memory store) ──
export interface CustomAgentRecord {
  agentId: string;
  name: string;
  description: string;
  type: string;
  tools: string[];
  owner: string;
  agentURI: string;
  registration: Record<string, unknown>;
  skillMd: string;
  createdAt: string;
  isCustom: boolean;
}

/**
 * Resolve a custom agent by agentId across all owners.
 * Returns the agent record or null.
 */
export function getCustomAgentById(agentId: string): CustomAgentRecord | null {
  const agentsMap = (globalThis as Record<string, unknown>)._customAgents as Map<string, CustomAgentRecord[]> | undefined;
  if (!agentsMap) return null;
  for (const agents of agentsMap.values()) {
    const found = agents.find(a => a.agentId === agentId);
    if (found) return found;
  }
  return null;
}

/**
 * Return all custom agents across all owners.
 */
export function getAllCustomAgents(): CustomAgentRecord[] {
  const agentsMap = (globalThis as Record<string, unknown>)._customAgents as Map<string, CustomAgentRecord[]> | undefined;
  if (!agentsMap) return [];
  const all: CustomAgentRecord[] = [];
  for (const agents of agentsMap.values()) {
    all.push(...agents);
  }
  return all;
}

/**
 * List all custom agents
 * GET /api/agents/list
 */
router.get('/list', async (_req: Request, res: Response) => {
  try {
    const agents = getAllCustomAgents();
    const baseUrl = `${_req.protocol}://${_req.get('host')}`;

    res.json({
      success: true,
      agents: agents.map(a => ({
        agentId: a.agentId,
        name: a.name,
        description: a.description,
        type: a.type,
        tools: a.tools,
        owner: a.owner,
        createdAt: a.createdAt,
        agentURI: a.agentURI,
        invokeUrl: `${baseUrl}/api/gateway/agent/${a.agentId}/invoke`,
        x402Supported: true,
      })),
      count: agents.length,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to list agents', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to list agents' });
  }
});

/**
 * Get ERC-8004 contract configuration status
 * GET /api/agents/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = getContractStatus();
    const agentRegistry = getAgentRegistryString();

    res.json({
      success: true,
      status: {
        ...status,
        agentRegistry,
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get agent status', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

/**
 * Get Seisoai agent definitions (pre-configured agents to register)
 * GET /api/agents/definitions
 */
router.get('/definitions', async (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      agents: SEISOAI_AGENTS.map((agent, index) => ({
        id: index,
        name: agent.name,
        description: agent.description,
        services: agent.services,
        active: agent.active,
        supportedTrust: agent.supportedTrust,
        agentURI: createAgentURI(agent),
      })),
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get agent definitions', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get definitions' });
  }
});

/**
 * Get agent info by ID
 * GET /api/agents/:agentId
 */
router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    
    if (isNaN(agentId) || agentId < 1) {
      res.status(400).json({ success: false, error: 'Invalid agent ID' });
      return;
    }

    const agentInfo = await getAgentInfo(agentId);
    
    if (!agentInfo) {
      res.status(404).json({ success: false, error: 'Agent not found' });
      return;
    }

    // Parse the agent URI to get full registration data
    const registration = parseAgentURI(agentInfo.agentURI);

    res.json({
      success: true,
      agent: {
        ...agentInfo,
        registration,
      },
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get agent info', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get agent' });
  }
});

/**
 * Get agents owned by an address
 * GET /api/agents/owner/:address
 */
router.get('/owner/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    
    if (!address || !address.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid address' });
      return;
    }

    const agents = await getAgentsByOwner(address);

    res.json({
      success: true,
      agents,
      count: agents.length,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get agents by owner', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get agents' });
  }
});

/**
 * Get agent reputation summary
 * GET /api/agents/:agentId/reputation
 */
router.get('/:agentId/reputation', async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    
    if (isNaN(agentId) || agentId < 1) {
      res.status(400).json({ success: false, error: 'Invalid agent ID' });
      return;
    }

    const reputation = await getAgentReputation(agentId);
    
    if (!reputation) {
      res.status(404).json({ success: false, error: 'Agent not found or no reputation data' });
      return;
    }

    res.json({
      success: true,
      reputation,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get agent reputation', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get reputation' });
  }
});

/**
 * Create a custom user agent
 * POST /api/agents/create
 * Body: { name, description, type, tools, image?, services?, skillMd? }
 * Requires wallet address in session
 */
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { name, description, type, tools, image, services, skillMd } = req.body;

    // Get wallet address from session
    const walletAddress = (req as Record<string, unknown>).walletAddress as string
      || req.headers['x-wallet-address'] as string;

    if (!walletAddress) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    // Validate required fields
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 64) {
      res.status(400).json({ success: false, error: 'Name is required (1-64 characters)' });
      return;
    }
    if (!description || typeof description !== 'string' || description.length < 1 || description.length > 256) {
      res.status(400).json({ success: false, error: 'Description is required (1-256 characters)' });
      return;
    }
    const validTypes = ['Image Generation', 'Video Generation', 'Music Generation', 'Chat/Assistant', 'Multi-Modal', 'Custom'];
    if (!type || !validTypes.includes(type)) {
      res.status(400).json({ success: false, error: `Type must be one of: ${validTypes.join(', ')}` });
      return;
    }
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      res.status(400).json({ success: false, error: 'At least one tool must be selected' });
      return;
    }

    // Generate agent URI
    const agentId = `custom-${walletAddress.slice(2, 8)}-${Date.now()}`;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const invokeUrl = `${baseUrl}/api/gateway/agent/${agentId}/invoke`;
    const registration = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      image: image || 'https://seisoai.com/seiso-logo.png',
      services: services || [
        { name: 'web', endpoint: 'https://seisoai.com/' },
        { name: 'gateway', endpoint: 'https://seisoai.com/api/gateway' },
        { name: 'mcp', endpoint: 'https://seisoai.com/api/mcp' },
        { name: 'invoke', endpoint: invokeUrl },
        { name: 'mcp-manifest', endpoint: `${baseUrl}/api/gateway/agent/${agentId}/mcp-manifest` },
        { name: 'orchestrate', endpoint: `${baseUrl}/api/gateway/agent/${agentId}/orchestrate` },
      ],
      x402Support: true,
      x402Config: { network: 'eip155:8453', asset: 'USDC' },
      active: true,
      supportedTrust: ['reputation'],
      tools,
    };

    const agentURI = createAgentURI(registration);

    // Store in a simple in-memory map for now (upgrade to MongoDB when needed)
    // In production, save to a UserAgent collection
    const agent = {
      agentId,
      name,
      description,
      type,
      tools,
      owner: walletAddress,
      agentURI,
      registration,
      skillMd: skillMd || '',
      createdAt: new Date().toISOString(),
      isCustom: true,
    };

    // Store in global map (persists per server instance)
    if (!globalThis._customAgents) {
      (globalThis as Record<string, unknown>)._customAgents = new Map();
    }
    const agentsMap = (globalThis as Record<string, unknown>)._customAgents as Map<string, unknown[]>;
    const ownerAgents = agentsMap.get(walletAddress) || [];
    ownerAgents.push(agent);
    agentsMap.set(walletAddress, ownerAgents);

    logger.info('Custom agent created', { agentId, name, owner: walletAddress, toolCount: tools.length });

    res.json({
      success: true,
      agent,
      agentURI,
      skillMd: skillMd || '',
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to create custom agent', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to create agent' });
  }
});

/**
 * Get custom agents for an owner
 * GET /api/agents/custom/:address
 */
router.get('/custom/:address', async (req: Request, res: Response) => {
  try {
    const { address } = req.params;
    if (!address || !address.startsWith('0x')) {
      res.status(400).json({ success: false, error: 'Invalid address' });
      return;
    }

    const agentsMap = (globalThis as Record<string, unknown>)._customAgents as Map<string, unknown[]> | undefined;
    const agents = agentsMap?.get(address) || [];

    res.json({ success: true, agents, count: agents.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get custom agents', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get custom agents' });
  }
});

/**
 * Delete a custom agent
 * DELETE /api/agents/custom/:agentId
 */
router.delete('/custom/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const walletAddress = (req as Record<string, unknown>).walletAddress as string
      || req.headers['x-wallet-address'] as string;

    if (!walletAddress) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const agentsMap = (globalThis as Record<string, unknown>)._customAgents as Map<string, Array<{ agentId: string }>>;
    if (agentsMap) {
      const ownerAgents = agentsMap.get(walletAddress) || [];
      const filtered = ownerAgents.filter((a) => a.agentId !== agentId);
      agentsMap.set(walletAddress, filtered);
    }

    res.json({ success: true });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to delete custom agent', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to delete agent' });
  }
});

/**
 * Generate agent URI for registration
 * POST /api/agents/generate-uri
 * Body: { name, description, image?, services?, active?, supportedTrust? }
 */
router.post('/generate-uri', async (req: Request, res: Response) => {
  try {
    const { name, description, image, services, active, supportedTrust } = req.body;

    if (!name || !description) {
      res.status(400).json({ success: false, error: 'Name and description are required' });
      return;
    }

    const registration = {
      type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
      name,
      description,
      image: image || 'https://seisoai.com/seiso-logo.png',
      services: services || [{ name: 'web', endpoint: 'https://seisoai.com/' }],
      active: active !== false,
      supportedTrust: supportedTrust || ['reputation'],
    };

    const agentURI = createAgentURI(registration);

    res.json({
      success: true,
      registration,
      agentURI,
    });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to generate agent URI', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to generate URI' });
  }
});

export default router;
