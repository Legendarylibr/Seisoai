/**
 * Credit Transaction Service
 * Atomic credit deduction with rollback support.
 *
 * Pattern:
 *   const tx = await CreditTx.begin(userId, amount, 'tool-invocation');
 *   try {
 *     await doWork();
 *     await CreditTx.commit(tx);
 *   } catch {
 *     await CreditTx.rollback(tx);
 *   }
 */
import mongoose from 'mongoose';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface CreditTransaction {
  /** Unique transaction ID */
  txId: string;
  /** User identifier (wallet address or API key ID) */
  userId: string;
  /** Source type */
  source: 'wallet' | 'api-key';
  /** Amount deducted */
  amount: number;
  /** Reason / use-case label */
  reason: string;
  /** Current state */
  status: 'pending' | 'committed' | 'rolled-back';
  /** Timestamp */
  createdAt: Date;
}

// In-memory ledger for pending transactions (TTL: 10 min)
const pendingTx = new Map<string, CreditTransaction>();

// Auto-cleanup stale pending transactions every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [txId, tx] of pendingTx) {
    if (tx.status === 'pending' && now - tx.createdAt.getTime() > 10 * 60 * 1000) {
      logger.warn('Auto-rolling-back stale credit transaction', { txId, userId: tx.userId, amount: tx.amount });
      rollback(txId).catch(() => { /* best-effort */ });
    }
  }
}, 5 * 60 * 1000);

// ============================================================================
// Wallet-based users (User model)
// ============================================================================

async function deductUserCredits(walletAddress: string, amount: number): Promise<boolean> {
  try {
    const User = mongoose.model('User');
    const result = await User.findOneAndUpdate(
      {
        $or: [
          { walletAddress, credits: { $gte: amount } },
          { 'walletAddress_bi': walletAddress, credits: { $gte: amount } },
        ],
      },
      { $inc: { credits: -amount } },
      { new: true },
    );
    return !!result;
  } catch (error) {
    logger.error('Failed to deduct user credits', { walletAddress, amount, error: (error as Error).message });
    return false;
  }
}

async function refundUserCredits(walletAddress: string, amount: number): Promise<boolean> {
  try {
    const User = mongoose.model('User');
    await User.findOneAndUpdate(
      { $or: [{ walletAddress }, { 'walletAddress_bi': walletAddress }] },
      { $inc: { credits: amount } },
    );
    return true;
  } catch (error) {
    logger.error('Failed to refund user credits', { walletAddress, amount, error: (error as Error).message });
    return false;
  }
}

// ============================================================================
// API-key-based users
// ============================================================================

async function deductApiKeyCredits(apiKeyId: string, amount: number): Promise<boolean> {
  try {
    const ApiKey = mongoose.model('ApiKey');
    const result = await ApiKey.findOneAndUpdate(
      { _id: apiKeyId, credits: { $gte: amount } },
      { $inc: { credits: -amount, totalCreditsSpent: amount } },
      { new: true },
    );
    return !!result;
  } catch (error) {
    logger.error('Failed to deduct API key credits', { apiKeyId, amount, error: (error as Error).message });
    return false;
  }
}

async function refundApiKeyCredits(apiKeyId: string, amount: number): Promise<boolean> {
  try {
    const ApiKey = mongoose.model('ApiKey');
    await ApiKey.findOneAndUpdate(
      { _id: apiKeyId },
      { $inc: { credits: amount, totalCreditsSpent: -amount } },
    );
    return true;
  } catch (error) {
    logger.error('Failed to refund API key credits', { apiKeyId, amount, error: (error as Error).message });
    return false;
  }
}

// ============================================================================
// Public API
// ============================================================================

function generateTxId(): string {
  return `ctx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Begin a credit transaction — deducts credits upfront.
 * Returns txId on success, throws on insufficient credits.
 */
export async function begin(
  userId: string,
  amount: number,
  reason: string,
  source: 'wallet' | 'api-key' = 'wallet',
): Promise<string> {
  const txId = generateTxId();

  const ok = source === 'api-key'
    ? await deductApiKeyCredits(userId, amount)
    : await deductUserCredits(userId, amount);

  if (!ok) {
    throw new Error(`Insufficient credits. Needed ${amount} for ${reason}`);
  }

  const tx: CreditTransaction = {
    txId,
    userId,
    source,
    amount,
    reason,
    status: 'pending',
    createdAt: new Date(),
  };
  pendingTx.set(txId, tx);

  logger.debug('Credit transaction begun', { txId, userId, amount, reason, source });
  return txId;
}

/**
 * Commit a transaction — marks it as settled (no refund possible).
 */
export async function commit(txId: string): Promise<void> {
  const tx = pendingTx.get(txId);
  if (!tx) {
    logger.warn('Commit called for unknown transaction', { txId });
    return;
  }
  tx.status = 'committed';
  pendingTx.delete(txId);
  logger.debug('Credit transaction committed', { txId, userId: tx.userId, amount: tx.amount });
}

/**
 * Rollback a transaction — refunds credits.
 */
export async function rollback(txId: string): Promise<void> {
  const tx = pendingTx.get(txId);
  if (!tx) {
    logger.warn('Rollback called for unknown transaction', { txId });
    return;
  }
  if (tx.status !== 'pending') {
    logger.warn('Rollback called for non-pending transaction', { txId, status: tx.status });
    return;
  }

  const ok = tx.source === 'api-key'
    ? await refundApiKeyCredits(tx.userId, tx.amount)
    : await refundUserCredits(tx.userId, tx.amount);

  tx.status = 'rolled-back';
  pendingTx.delete(txId);

  if (ok) {
    logger.info('Credit transaction rolled back', { txId, userId: tx.userId, amount: tx.amount });
  } else {
    logger.error('Credit rollback failed!', { txId, userId: tx.userId, amount: tx.amount });
  }
}

/**
 * Get transaction info (for debugging).
 */
export function getTransaction(txId: string): CreditTransaction | undefined {
  return pendingTx.get(txId);
}

export const CreditTx = { begin, commit, rollback, getTransaction };
export default CreditTx;
