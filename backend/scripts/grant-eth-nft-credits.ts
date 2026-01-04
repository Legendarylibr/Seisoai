#!/usr/bin/env node
/*
  One-off script: Grant credits to users.
  Modes:
  1) NFT mode (default): 2 credits per ETH NFT (counts multiples)
     - Filters NFTs by chainId === '1' (Ethereum mainnet)
  2) Address list mode: grant N credits per provided quantity
     - Use --addresses <file> (CSV or plain text)
     - Default per-quantity credits: 3 (override with --per <number>)

  Common:
  - Supports --dry-run to preview without writing
  - Supports --json for machine-readable output
  - Uses MONGODB_URI from environment (loads ../backend.env if present)
*/

import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from backend.env if present at repo root
(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const backendEnvPath = path.join(repoRoot, 'backend.env');
  if (fs.existsSync(backendEnvPath)) {
    try {
      dotenv.config({ path: backendEnvPath });
      console.log(`[env] Loaded environment from ${backendEnvPath}`);
    } catch (e: any) {
      console.warn('[env] Failed to load backend.env:', e.message);
    }
  } else if (fs.existsSync(path.join(repoRoot, '.env'))) {
    try {
      dotenv.config({ path: path.join(repoRoot, '.env') });
      console.log('[env] Loaded environment from .env');
    } catch (e: any) {
      console.warn('[env] Failed to load .env:', e.message);
    }
  }
})();

// Parse CLI flags
const args = process.argv.slice(2);
const uriEq = args.find(a => a.startsWith('--uri='));
let overrideUri: string | null = null;
if (uriEq) {
  overrideUri = uriEq.slice('--uri='.length);
} else {
  const uriIdx = args.indexOf('--uri');
  if (uriIdx !== -1 && args[uriIdx + 1]) {
    overrideUri = args[uriIdx + 1];
  }
}

const MONGODB_URI = overrideUri || process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Please set it in backend.env or your environment.');
  process.exit(1);
}

const isDryRun = process.argv.includes('--dry-run');
const outputJson = process.argv.includes('--json');

// Address-list mode flags
function readFlagValue(longName: string, shortName?: string): string | null {
  const argsLocal = process.argv.slice(2);
  const eq = argsLocal.find(a => a.startsWith(`--${longName}=`));
  if (eq) return eq.slice(longName.length + 3);
  const idx = argsLocal.indexOf(`--${longName}`);
  if (idx !== -1 && argsLocal[idx + 1]) return argsLocal[idx + 1];
  if (shortName) {
    const sIdx = argsLocal.indexOf(shortName);
    if (sIdx !== -1 && argsLocal[sIdx + 1]) return argsLocal[sIdx + 1];
  }
  return null;
}

const addressesFile = readFlagValue('addresses', '-a');
const perQuantityStr = readFlagValue('per', '-p');
const perQuantityCredits = perQuantityStr ? Number(perQuantityStr) : 3;
if (Number.isNaN(perQuantityCredits)) {
  console.error('❌ Invalid --per value. It must be a number.');
  process.exit(1);
}

// Minimal User schema for this script
const userSchema = new mongoose.Schema({
  walletAddress: { type: String, index: true, lowercase: true },
  credits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 },
  nftCollections: [
    {
      contractAddress: String,
      chainId: String,
      tokenIds: [String],
      lastChecked: Date,
    },
  ],
});

const User = mongoose.models.User || mongoose.model('User', userSchema);

interface NFTCollection {
  contractAddress?: string;
  chainId?: string;
  tokenIds?: string[];
  lastChecked?: Date;
}

function countEthTokens(nftCollections: NFTCollection[] | undefined): number {
  if (!Array.isArray(nftCollections)) return 0;
  return nftCollections
    .filter((c) => (c?.chainId || '').toString() === '1')
    .reduce((sum, c) => sum + (Array.isArray(c?.tokenIds) ? c.tokenIds.length : 0), 0);
}

interface AddressEntry {
  address: string;
  quantity: number;
}

function parseAddressList(filePath: string): AddressEntry[] {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const entries: AddressEntry[] = [];
  const stripQuotes = (s: string | null | undefined): string | null => {
    if (s == null) return s;
    const t = s.trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith('\'') && t.endsWith('\''))) {
      return t.slice(1, -1);
    }
    return t;
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) continue;

    // Support CSV: address,quantity and whitespace-separated formats
    let address: string | null = null;
    let quantity = 1;

    if (trimmed.includes(',')) {
      const parts = trimmed.split(',');
      const a = stripQuotes(parts[0]);
      const q = stripQuotes(parts[1]);
      // Silently skip header rows like HolderAddress,Quantity,...
      if (a && /holderaddress/i.test(a)) continue;
      address = a;
      if (q !== undefined && q !== '' && q !== null) {
        const qNum = Number(q);
        if (!Number.isNaN(qNum) && qNum > 0) quantity = qNum;
      }
    } else {
      const parts = trimmed.split(/\s+/);
      address = stripQuotes(parts[0]);
      if (parts[1]) {
        const q = stripQuotes(parts[1]);
        if (q) {
          const qNum = Number(q);
          if (!Number.isNaN(qNum) && qNum > 0) quantity = qNum;
        }
      }
    }

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      console.warn(`⚠️ Skipping invalid address line: ${trimmed}`);
      continue;
    }
    entries.push({ address: address.toLowerCase(), quantity });
  }
  return entries;
}

async function main(): Promise<void> {
  const start = Date.now();
  console.log(`🚀 Starting grant (dryRun=${isDryRun})`);

  // Address list mode: grant per provided quantities
  if (addressesFile) {
    if (!fs.existsSync(addressesFile)) {
      console.error(`❌ Addresses file not found: ${addressesFile}`);
      process.exit(1);
    }

    const entries = parseAddressList(addressesFile);
    let usersUpdated = 0;
    let creditsTotal = 0;
    const jsonRows: any[] = [];

    for (const { address, quantity } of entries) {
      const creditsToAdd = perQuantityCredits * quantity;
      creditsTotal += creditsToAdd;

      if (outputJson) {
        jsonRows.push({ walletAddress: address, quantity, creditsToAdd });
      } else {
        console.log(`→ ${address} | qty=${quantity} | per=${perQuantityCredits} | add=${creditsToAdd}`);
      }

      if (!isDryRun) {
        // Connect lazily only when we need to write
        if (mongoose.connection.readyState === 0) {
          await mongoose.connect(MONGODB_URI, {
            maxPoolSize: 5,
            serverSelectionTimeoutMS: 8000,
          });
          console.log('✅ Connected to MongoDB');
        }
        // Ensure address is normalized (lowercase for EVM addresses)
        const normalizedAddr = address.toLowerCase();
        const result = await User.findOneAndUpdate(
          { walletAddress: normalizedAddr },
          {
            $setOnInsert: { walletAddress: normalizedAddr },
            $inc: { credits: creditsToAdd, totalCreditsEarned: creditsToAdd },
          },
          { upsert: true, new: true }
        );
        
        // Verify the update worked
        const verifyUser = await User.findOne({ walletAddress: normalizedAddr });
        if (verifyUser) {
          console.log(`✓ Verified: ${normalizedAddr} now has ${verifyUser.credits} credits (earned: ${verifyUser.totalCreditsEarned})`);
        } else {
          console.error(`✗ ERROR: Could not verify update for ${normalizedAddr}`);
        }
        
        usersUpdated += 1;
      }
    }

    if (outputJson) {
      console.log(JSON.stringify({
        mode: 'addresses',
        dryRun: isDryRun,
        usersUpdated,
        totalCreditsToAdd: creditsTotal,
        perQuantityCredits,
        entries: jsonRows,
        tookSeconds: (Date.now() - start) / 1000,
      }, null, 2));
    } else {
      console.log('—'.repeat(60));
      console.log(`✅ Users updated: ${usersUpdated}${isDryRun ? ' (dry-run)' : ''}`);
      console.log(`➕ Credits to add total: ${creditsTotal}`);
      console.log(`⏱️ Took ${(Date.now() - start) / 1000}s`);
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    process.exit(0);
  }

  // NFT mode: Find users that have at least one ETH NFT
  await mongoose.connect(MONGODB_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 8000,
  });
  console.log('✅ Connected to MongoDB');
  const cursor = User.find({ 'nftCollections.chainId': '1' })
    .select('walletAddress credits totalCreditsEarned nftCollections')
    .cursor();

  let usersSeen = 0;
  let usersUpdated = 0;
  let creditsTotal = 0;
  const jsonRows: any[] = [];

  for await (const user of cursor) {
    usersSeen += 1;
    const tokenCount = countEthTokens(user.nftCollections as NFTCollection[]);
    if (tokenCount <= 0) continue;

    const creditsToAdd = 2 * tokenCount;
    creditsTotal += creditsToAdd;

    if (outputJson) {
      jsonRows.push({
        walletAddress: user.walletAddress,
        tokenCount,
        creditsToAdd,
        previousCredits: user.credits || 0,
      });
    } else {
      console.log(`→ ${user.walletAddress} | tokens=${tokenCount} | add=${creditsToAdd} | prev=${user.credits}`);
    }

    if (!isDryRun) {
      user.credits = (user.credits || 0) + creditsToAdd;
      user.totalCreditsEarned = (user.totalCreditsEarned || 0) + creditsToAdd;
      await user.save();
      
      // Verify the save worked
      const verifyUser = await User.findOne({ walletAddress: user.walletAddress });
      if (verifyUser) {
        console.log(`✓ Verified: ${user.walletAddress} now has ${verifyUser.credits} credits (earned: ${verifyUser.totalCreditsEarned})`);
      } else {
        console.error(`✗ ERROR: Could not verify save for ${user.walletAddress}`);
      }
      
      usersUpdated += 1;
    }
  }

  if (outputJson) {
    console.log(JSON.stringify({
      dryRun: isDryRun,
      usersScanned: usersSeen,
      usersUpdated: usersUpdated,
      totalCreditsToAdd: creditsTotal,
      holders: jsonRows,
      tookSeconds: (Date.now() - start) / 1000,
    }, null, 2));
  } else {
    console.log('—'.repeat(60));
    console.log(`👥 Users scanned: ${usersSeen}`);
    console.log(`✅ Users updated: ${usersUpdated}${isDryRun ? ' (dry-run)' : ''}`);
    console.log(`➕ Credits to add total: ${creditsTotal}`);
    console.log(`⏱️ Took ${(Date.now() - start) / 1000}s`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err: unknown) => {
  console.error('❌ Error during grant:', err);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});



