/**
 * Agent routes
 * API endpoints for managing Seisoai's ERC-8004 registered agents
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import mongoose from 'mongoose';
import logger from '../utils/logger';
import { isTokenBlacklisted } from '../middleware/auth';
import CustomAgent, { type ICustomAgent } from '../models/CustomAgent';
import type { IUser } from '../models/User';
import config from '../config/env';

interface JWTDecoded extends JwtPayload {
  userId?: string;
  email?: string;
  type?: string;
}

/**
 * Optional auth middleware: tries JWT auth to set req.user,
 * but always calls next() so wallet-only users can still proceed.
 * The route handler is responsible for requiring wallet address.
 */
const optionalAuth = async (req: Request & { user?: IUser }, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token && config.JWT_SECRET) {
      const blacklisted = await isTokenBlacklisted(token);
      if (!blacklisted) {
        const decoded = jwt.verify(token, config.JWT_SECRET) as JWTDecoded;
        if (decoded.type !== 'refresh') {
          const User = mongoose.model<IUser>('User');
          let user = null;
          if (decoded.userId) {
            user = await User.findOne({ userId: decoded.userId }).select('-password');
          }
          if (!user && decoded.email) {
            user = await User.findOne({ email: decoded.email.toLowerCase().trim() }).select('-password');
          }
          if (user) {
            req.user = user;
          }
        }
      }
    }
  } catch {
    // JWT auth failed — that's fine, route will check for wallet address
  }
  next();
};
import { toolRegistry } from '../services/toolRegistry';
import { getTrace, getTracesForUser } from '../services/agentTracer';
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

// ── Custom agent type ──
export type CustomAgentRecord = ICustomAgent;

/**
 * Resolve a custom agent by agentId.
 * Returns the agent record or null.
 */
export async function getCustomAgentById(agentId: string): Promise<ICustomAgent | null> {
  try {
    return await CustomAgent.findOne({ agentId }).lean<ICustomAgent>();
  } catch (error) {
    logger.error('Failed to find custom agent', { agentId, error: (error as Error).message });
    return null;
  }
}

/**
 * Return all custom agents.
 */
export async function getAllCustomAgents(): Promise<ICustomAgent[]> {
  try {
    return await CustomAgent.find().sort({ createdAt: -1 }).lean<ICustomAgent[]>();
  } catch (error) {
    logger.error('Failed to list custom agents', { error: (error as Error).message });
    return [];
  }
}

/**
 * List all custom agents
 * GET /api/agents/list
 */
router.get('/list', async (_req: Request, res: Response) => {
  try {
    const agents = await getAllCustomAgents();
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
 * Body: { name, description, type, tools, image?, services?, skillMd?, walletAddress? }
 * Requires authentication (JWT) or wallet address in body/header
 */
router.post('/create', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { name, description, type, tools, image, services, skillMd, systemPrompt, walletAddress: bodyWallet } = req.body;

    // Get wallet address: JWT user first, then body, then header
    const user = (req as Request & { user?: IUser }).user;
    const walletAddress = user?.walletAddress
      || bodyWallet as string
      || req.headers['x-wallet-address'] as string;

    if (!walletAddress) {
      res.status(401).json({ success: false, error: 'Wallet address required. Please connect your wallet.' });
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

    // Validate tool IDs against registry
    const toolValidation = toolRegistry.validateToolIds(tools);
    if (!toolValidation.valid) {
      res.status(400).json({
        success: false,
        error: `Unknown tool IDs: ${toolValidation.unknownTools.join(', ')}`,
        unknownTools: toolValidation.unknownTools,
      });
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

    // Persist to MongoDB
    const agent = await CustomAgent.create({
      agentId,
      name,
      description,
      type,
      tools,
      owner: walletAddress,
      agentURI,
      registration,
      skillMd: skillMd || '',
      systemPrompt: systemPrompt || '',
      imageUrl: image || 'https://seisoai.com/seiso-logo.png',
      services: registration.services || [],
      isCustom: true,
    });

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

    const agents = await CustomAgent.find({ owner: address }).sort({ createdAt: -1 }).lean();

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
router.delete('/custom/:agentId', optionalAuth, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const user = (req as Request & { user?: IUser }).user;
    const walletAddress = user?.walletAddress
      || req.headers['x-wallet-address'] as string;

    if (!walletAddress) {
      res.status(401).json({ success: false, error: 'Wallet address required. Please connect your wallet.' });
      return;
    }

    const result = await CustomAgent.findOneAndDelete({ agentId, owner: walletAddress });

    if (!result) {
      res.status(404).json({ success: false, error: 'Agent not found or not owned by you' });
      return;
    }

    logger.info('Custom agent deleted', { agentId, owner: walletAddress });
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

// ── Execution traces ──

/**
 * GET /api/agents/traces/:traceId
 * Get a specific execution trace
 */
router.get('/traces/:traceId', async (req: Request, res: Response) => {
  try {
    const trace = await getTrace(req.params.traceId);
    if (!trace) {
      res.status(404).json({ success: false, error: 'Trace not found' });
      return;
    }
    res.json({ success: true, trace });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get trace', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get trace' });
  }
});

/**
 * GET /api/agents/traces/user/:address
 * List recent traces for a user
 */
router.get('/traces/user/:address', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const traces = await getTracesForUser(req.params.address, Math.min(limit, 100));
    res.json({ success: true, traces, count: traces.length });
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to get user traces', { error: err.message });
    res.status(500).json({ success: false, error: 'Failed to get traces' });
  }
});

export default router;
