/**
 * Provenance Service - Minimal ERC-8004 provenance
 * No DB, no prompts, no user linkage. Only on-chain anchor with tiny data URI:
 * agentId, type, contentHash (hash of result), timestamp. Verifiers decode from requestURI in tx.
 */
import { ethers } from 'ethers';
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { getProvider } from './blockchain.js';

const VALIDATION_REGISTRY_ABI = [
  'function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash) external',
  'function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag) external',
];

/** Minimal payload: no prompt, no user, no result URL (only contentHash). Keys sorted for canonical hash. */
interface MinimalPayload {
  agentId: number;
  agentRegistry: string;
  chainId: number;
  type: string;
  contentHash: string; // keccak256(resultUrl) - binds to output without storing URL
  timestamp: string;
}

function canonicalize(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    sorted[key] = v !== null && typeof v === 'object' && !Array.isArray(v)
      ? canonicalize(v as Record<string, unknown>)
      : v;
  }
  return sorted;
}

function toCanonicalJson(obj: Record<string, unknown>): string {
  return JSON.stringify(canonicalize(obj));
}

export interface RecordProvenanceInput {
  agentId: number;
  agentRegistry: string;
  chainId: number;
  type: 'image' | 'video' | 'music';
  resultUrl: string; // used only to compute contentHash, not stored anywhere
}

/**
 * Record provenance on-chain only. No DB. Payload is minimal (agentId, type, contentHash, timestamp)
 * and embedded as data URI in the tx so verifiers can decode it from chain.
 */
export async function recordProvenance(input: RecordProvenanceInput): Promise<void> {
  if (
    !config.ERC8004_VALIDATION_REGISTRY ||
    !config.ERC8004_CHAIN_ID ||
    !config.ERC8004_PROVENANCE_SIGNER_PRIVATE_KEY ||
    !config.ERC8004_VALIDATOR_ADDRESS
  ) {
    return;
  }

  const timestamp = new Date().toISOString();
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(input.resultUrl));

  const payload: MinimalPayload = {
    agentId: input.agentId,
    agentRegistry: input.agentRegistry,
    chainId: input.chainId,
    type: input.type,
    contentHash,
    timestamp,
  };

  const canonical = toCanonicalJson(payload as unknown as Record<string, unknown>);
  const requestHash = ethers.keccak256(ethers.toUtf8Bytes(canonical));
  const requestUri = `data:application/json;base64,${Buffer.from(canonical, 'utf8').toString('base64')}`;

  try {
    await anchorProvenanceOnChain({
      agentId: input.agentId,
      requestHash,
      requestUri,
      type: input.type,
    });
    logger.info('Provenance anchored (minimal)', {
      agentId: input.agentId,
      type: input.type,
      requestHash: requestHash.slice(0, 18) + '…',
    });
  } catch (err) {
    logger.warn('Provenance anchor failed', { type: input.type, error: (err as Error).message });
  }
}

async function anchorProvenanceOnChain(params: {
  agentId: number;
  requestHash: string;
  requestUri: string;
  type: string;
}): Promise<void> {
  const provider = getProvider(config.ERC8004_CHAIN_ID!);
  if (!provider) return;

  const signer = new ethers.Wallet(config.ERC8004_PROVENANCE_SIGNER_PRIVATE_KEY!, provider);
  const validationRegistry = new ethers.Contract(
    config.ERC8004_VALIDATION_REGISTRY!,
    VALIDATION_REGISTRY_ABI,
    signer
  );

  const requestHashBytes32 = params.requestHash as `0x${string}`;

  await validationRegistry.validationRequest(
    config.ERC8004_VALIDATOR_ADDRESS!,
    params.agentId,
    params.requestUri,
    requestHashBytes32
  );

  await validationRegistry.validationResponse(
    requestHashBytes32,
    100,
    params.requestUri,
    requestHashBytes32,
    params.type
  );
}

/** Whether provenance anchoring is configured (no DB, just chain config). */
export function isProvenanceConfigured(): boolean {
  return Boolean(
    config.ERC8004_VALIDATION_REGISTRY &&
    config.ERC8004_CHAIN_ID &&
    config.ERC8004_PROVENANCE_SIGNER_PRIVATE_KEY &&
    config.ERC8004_VALIDATOR_ADDRESS &&
    config.ERC8004_IDENTITY_REGISTRY
  );
}

/** Agent registry string for provenance (from config only). */
export function getProvenanceAgentRegistry(): string | null {
  if (!config.ERC8004_CHAIN_ID || !config.ERC8004_IDENTITY_REGISTRY) return null;
  return `eip155:${config.ERC8004_CHAIN_ID}:${config.ERC8004_IDENTITY_REGISTRY}`;
}
