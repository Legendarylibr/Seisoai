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
