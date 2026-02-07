/**
 * Pinata Private IPFS Service
 *
 * Handles uploading AI outputs to Pinata Private IPFS and generating
 * time-limited signed URLs for ownership-gated access.
 *
 * Flow (from "How to Manage AI Files with ERC-721"):
 *   1. AI generates an output (image/video/music) → hosted on FAL CDN
 *   2. Backend downloads the raw bytes from FAL
 *   3. Uploads to Pinata Private IPFS → gets a CID
 *   4. CID is stored on-chain in the provenance NFT ("file" field)
 *   5. To retrieve: prove NFT ownership → backend creates a signed URL
 */
import logger from '../utils/logger.js';
import config from '../config/env.js';
import { isValidPublicUrl } from '../utils/validation.js';

// ── Types ───────────────────────────────────────────────────────────────

export interface PinataUploadResult {
  cid: string;
  size: number;
}

// ── SDK instance (lazy-initialized) ─────────────────────────────────────

let pinataInstance: any = null;

async function getPinata() {
  if (pinataInstance) return pinataInstance;
  if (!config.PINATA_JWT) return null;

  // Dynamic import — pinata is an optional dependency
  try {
    const { PinataSDK } = await import('pinata');
    pinataInstance = new PinataSDK({
      pinataJwt: config.PINATA_JWT,
      pinataGateway: config.PINATA_GATEWAY || 'gateway.pinata.cloud',
    });
    return pinataInstance;
  } catch (err) {
    logger.warn('Pinata SDK not installed. Run: npm i pinata', {
      error: (err as Error).message,
    });
    return null;
  }
}

// ── Upload to Private IPFS ──────────────────────────────────────────────

/**
 * Download a file from a URL and upload it to Pinata Private IPFS.
 *
 * @param sourceUrl  The URL to download the file from (e.g. FAL CDN).
 * @param fileName   File name for the upload (e.g. "image-abc123.png").
 * @param outputType The AI output type for metadata grouping.
 * @returns          The private CID and file size, or null if Pinata is not configured.
 */
export async function uploadToPrivateIPFS(
  sourceUrl: string,
  fileName: string,
  outputType: string,
): Promise<PinataUploadResult | null> {
  const pinata = await getPinata();
  if (!pinata) return null;

  try {
    // SECURITY FIX: Validate URL to prevent SSRF attacks
    if (!isValidPublicUrl(sourceUrl)) {
      logger.warn('SSRF attempt blocked in uploadToPrivateIPFS', { sourceUrl: sourceUrl.substring(0, 100) });
      return null;
    }

    // Download the file from the source URL
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch source: ${response.status} ${response.statusText}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    // Create a File object for the Pinata SDK
    const file = new File([buffer], fileName, { type: contentType });

    // Upload to Private IPFS
    const upload = await pinata.upload.private.file(file);

    logger.info('File uploaded to Pinata Private IPFS', {
      cid: upload.cid,
      fileName,
      outputType,
      size: buffer.length,
    });

    return {
      cid: upload.cid,
      size: buffer.length,
    };
  } catch (err) {
    logger.error('Pinata Private IPFS upload failed', {
      error: (err as Error).message,
      fileName,
      outputType,
    });
    return null;
  }
}

/**
 * Upload raw bytes to Pinata Private IPFS (for when you already have the buffer).
 */
export async function uploadBufferToPrivateIPFS(
  buffer: Buffer,
  fileName: string,
  contentType: string,
): Promise<PinataUploadResult | null> {
  const pinata = await getPinata();
  if (!pinata) return null;

  try {
    const file = new File([buffer], fileName, { type: contentType });
    const upload = await pinata.upload.private.file(file);

    logger.info('Buffer uploaded to Pinata Private IPFS', {
      cid: upload.cid,
      fileName,
      size: buffer.length,
    });

    return { cid: upload.cid, size: buffer.length };
  } catch (err) {
    logger.error('Pinata Private IPFS buffer upload failed', {
      error: (err as Error).message,
      fileName,
    });
    return null;
  }
}

// ── Create Signed Access URL ────────────────────────────────────────────

/**
 * Generate a time-limited signed URL for accessing a private file on Pinata.
 *
 * The caller must have already verified NFT ownership before calling this.
 *
 * @param cid     The CID on Pinata Private IPFS.
 * @param expires Seconds until the link expires (default: 300 = 5 min).
 * @returns       The signed URL, or null if Pinata is not configured.
 */
export async function createSignedAccessUrl(
  cid: string,
  expires: number = 300,
): Promise<string | null> {
  const pinata = await getPinata();
  if (!pinata) return null;

  try {
    const url = await pinata.gateways.private.createAccessLink({
      cid,
      expires,
    });

    logger.info('Pinata signed access URL created', {
      cid: cid.slice(0, 16) + '…',
      expires,
    });

    return url;
  } catch (err) {
    logger.error('Failed to create Pinata signed URL', {
      error: (err as Error).message,
      cid: cid.slice(0, 16) + '…',
    });
    return null;
  }
}

// ── Compute content hash from raw bytes ─────────────────────────────────

/**
 * Download a file and return both the raw bytes and its keccak256 hash.
 * This gives a true content hash (of the actual file, not the URL string).
 */
export async function downloadAndHash(
  sourceUrl: string,
): Promise<{ buffer: Buffer; contentHash: string; contentType: string } | null> {
  try {
    // SECURITY FIX: Validate URL to prevent SSRF attacks
    if (!isValidPublicUrl(sourceUrl)) {
      logger.warn('SSRF attempt blocked in downloadAndHash', { sourceUrl: sourceUrl.substring(0, 100) });
      return null;
    }

    const { ethers } = await import('ethers');
    const response = await fetch(sourceUrl);
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentHash = ethers.keccak256(buffer);

    return { buffer, contentHash, contentType };
  } catch (err) {
    logger.error('downloadAndHash failed', { error: (err as Error).message });
    return null;
  }
}

// ── Configuration check ─────────────────────────────────────────────────

/** Whether Pinata Private IPFS is configured. */
export function isPinataConfigured(): boolean {
  return Boolean(config.PINATA_JWT);
}
