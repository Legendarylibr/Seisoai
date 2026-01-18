/**
 * Immutable Audit Logging Service
 * Enterprise-grade security audit trail for compliance (SOC 2, GDPR, PCI DSS)
 * 
 * Features:
 * - Append-only storage (immutable)
 * - Cryptographic integrity verification (HMAC)
 * - Structured logging with correlation IDs
 * - Separate collection from application data
 * - Retention policies
 */
import mongoose, { type Document } from 'mongoose';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// Audit event types for security monitoring
export enum AuditEventType {
  // Authentication events
  AUTH_LOGIN_SUCCESS = 'AUTH_LOGIN_SUCCESS',
  AUTH_LOGIN_FAILURE = 'AUTH_LOGIN_FAILURE',
  AUTH_LOGOUT = 'AUTH_LOGOUT',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  AUTH_TOKEN_REVOKED = 'AUTH_TOKEN_REVOKED',
  AUTH_PASSWORD_CHANGE = 'AUTH_PASSWORD_CHANGE',
  AUTH_PASSWORD_RESET_REQUEST = 'AUTH_PASSWORD_RESET_REQUEST',
  AUTH_ACCOUNT_LOCKED = 'AUTH_ACCOUNT_LOCKED',
  AUTH_ACCOUNT_UNLOCKED = 'AUTH_ACCOUNT_UNLOCKED',
  
  // Authorization events
  AUTHZ_ACCESS_DENIED = 'AUTHZ_ACCESS_DENIED',
  AUTHZ_ADMIN_ACCESS = 'AUTHZ_ADMIN_ACCESS',
  AUTHZ_PRIVILEGE_ESCALATION_ATTEMPT = 'AUTHZ_PRIVILEGE_ESCALATION_ATTEMPT',
  
  // Data access events
  DATA_EXPORT_REQUEST = 'DATA_EXPORT_REQUEST',
  DATA_DELETION_REQUEST = 'DATA_DELETION_REQUEST',
  DATA_ACCESS_SENSITIVE = 'DATA_ACCESS_SENSITIVE',
  
  // Payment events
  PAYMENT_INITIATED = 'PAYMENT_INITIATED',
  PAYMENT_COMPLETED = 'PAYMENT_COMPLETED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  PAYMENT_DUPLICATE_ATTEMPT = 'PAYMENT_DUPLICATE_ATTEMPT',
  
  // Security events
  SECURITY_CSRF_VIOLATION = 'SECURITY_CSRF_VIOLATION',
  SECURITY_RATE_LIMIT_EXCEEDED = 'SECURITY_RATE_LIMIT_EXCEEDED',
  SECURITY_INJECTION_ATTEMPT = 'SECURITY_INJECTION_ATTEMPT',
  SECURITY_SSRF_ATTEMPT = 'SECURITY_SSRF_ATTEMPT',
  SECURITY_SUSPICIOUS_ACTIVITY = 'SECURITY_SUSPICIOUS_ACTIVITY',
  
  // Account events
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  ACCOUNT_UPDATED = 'ACCOUNT_UPDATED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',
  ACCOUNT_WALLET_LINKED = 'ACCOUNT_WALLET_LINKED',
  
  // Admin events
  ADMIN_CREDITS_ADDED = 'ADMIN_CREDITS_ADDED',
  ADMIN_USER_MODIFIED = 'ADMIN_USER_MODIFIED',
  ADMIN_CONFIG_CHANGED = 'ADMIN_CONFIG_CHANGED',
}

// Audit log severity levels
export enum AuditSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

// Audit log entry interface
interface IAuditLog extends Document {
  // Core fields
  eventType: AuditEventType;
  severity: AuditSeverity;
  timestamp: Date;
  
  // Actor information (who performed the action)
  actor: {
    userId?: string;
    email?: string; // Hashed for privacy
    walletAddress?: string; // Partial for privacy
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
  
  // Target information (what was affected)
  target?: {
    type?: string; // 'user', 'payment', 'generation', etc.
    id?: string;
    description?: string;
  };
  
  // Event details
  details: {
    action: string;
    outcome: 'success' | 'failure';
    reason?: string;
    metadata?: Record<string, unknown>;
  };
  
  // Request context
  request?: {
    requestId?: string;
    method?: string;
    path?: string;
    correlationId?: string;
  };
  
  // Integrity verification
  integrity: {
    hash: string; // HMAC of the log entry
    previousHash?: string; // Hash of previous entry (chain)
    sequence: number; // Monotonic sequence number
  };
  
  // Retention
  expiresAt?: Date;
}

// Audit log schema - append-only by design
const auditLogSchema = new mongoose.Schema<IAuditLog>({
  eventType: {
    type: String,
    enum: Object.values(AuditEventType),
    required: true,
    index: true,
  },
  severity: {
    type: String,
    enum: Object.values(AuditSeverity),
    required: true,
    index: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  actor: {
    userId: { type: String, index: true },
    email: String, // Stored as hash
    walletAddress: String, // Stored as partial
    ipAddress: String,
    userAgent: String,
    sessionId: String,
  },
  target: {
    type: { type: String },
    id: String,
    description: String,
  },
  details: {
    action: { type: String, required: true },
    outcome: { type: String, enum: ['success', 'failure'], required: true },
    reason: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  request: {
    requestId: String,
    method: String,
    path: String,
    correlationId: String,
  },
  integrity: {
    hash: { type: String, required: true },
    previousHash: String,
    sequence: { type: Number, required: true, index: true },
  },
  expiresAt: {
    type: Date,
    index: true,
  },
}, {
  // CRITICAL: Disable updates and deletes for immutability
  strict: true,
  timestamps: false, // We manage timestamp ourselves
  collection: 'audit_logs',
});

// Compound indexes for efficient querying
auditLogSchema.index({ 'actor.userId': 1, timestamp: -1 });
auditLogSchema.index({ eventType: 1, timestamp: -1 });
auditLogSchema.index({ severity: 1, timestamp: -1 });
auditLogSchema.index({ 'request.correlationId': 1 });

// TTL index for retention (default 2 years for compliance)
auditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// SECURITY: Prevent modifications to audit logs
auditLogSchema.pre('updateOne', function() {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('updateMany', function() {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('findOneAndUpdate', function() {
  throw new Error('Audit logs are immutable and cannot be updated');
});

auditLogSchema.pre('findOneAndDelete', function() {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

auditLogSchema.pre('deleteOne', function() {
  throw new Error('Audit logs are immutable and cannot be deleted');
});

auditLogSchema.pre('deleteMany', function() {
  // Only allow deletion of expired logs (handled by TTL index)
  const filter = this.getFilter();
  if (!filter.expiresAt || !filter.expiresAt.$lt) {
    throw new Error('Audit logs can only be deleted via TTL expiration');
  }
});

const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

// In-memory sequence counter (backed by database for persistence)
let sequenceCounter = 0;
let lastHash = '';
let initialized = false;

/**
 * Initialize the audit log service
 * Loads the last sequence number and hash from the database
 */
export async function initializeAuditLog(): Promise<void> {
  try {
    const lastEntry = await AuditLog.findOne()
      .sort({ 'integrity.sequence': -1 })
      .select('integrity')
      .lean();
    
    if (lastEntry) {
      sequenceCounter = lastEntry.integrity.sequence;
      lastHash = lastEntry.integrity.hash;
    }
    
    initialized = true;
    logger.info('Audit log service initialized', { 
      lastSequence: sequenceCounter,
      hasChain: !!lastHash 
    });
  } catch (error) {
    logger.error('Failed to initialize audit log service', { 
      error: (error as Error).message 
    });
    // Continue anyway - audit logging should not block app startup
    initialized = true;
  }
}

/**
 * Generate HMAC hash for integrity verification
 */
function generateHash(data: Record<string, unknown>, previousHash: string): string {
  const secret = config.ENCRYPTION_KEY || config.JWT_SECRET || 'audit-log-secret';
  const payload = JSON.stringify(data) + previousHash;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Mask sensitive data for privacy
 */
function maskEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  // Store as hash, not the actual email
  return crypto.createHash('sha256').update(email.toLowerCase()).digest('hex').substring(0, 16);
}

function maskWallet(wallet: string | undefined): string | undefined {
  if (!wallet) return undefined;
  // Show only first 6 and last 4 characters
  if (wallet.length > 10) {
    return `${wallet.substring(0, 6)}...${wallet.substring(wallet.length - 4)}`;
  }
  return wallet;
}

function maskIP(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  // Mask last octet for IPv4, last 64 bits for IPv6
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
    }
  }
  return ip.substring(0, ip.length / 2) + '...';
}

/**
 * Log an audit event
 * This is the main function to record security-relevant events
 */
export async function logAuditEvent(params: {
  eventType: AuditEventType;
  severity?: AuditSeverity;
  actor?: {
    userId?: string;
    email?: string;
    walletAddress?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  };
  target?: {
    type?: string;
    id?: string;
    description?: string;
  };
  action: string;
  outcome: 'success' | 'failure';
  reason?: string;
  metadata?: Record<string, unknown>;
  request?: {
    requestId?: string;
    method?: string;
    path?: string;
    correlationId?: string;
  };
  retentionDays?: number;
}): Promise<void> {
  // Ensure initialized
  if (!initialized) {
    await initializeAuditLog();
  }
  
  try {
    // Increment sequence
    sequenceCounter++;
    
    // Prepare the log entry with masked sensitive data
    const entry = {
      eventType: params.eventType,
      severity: params.severity || AuditSeverity.INFO,
      timestamp: new Date(),
      actor: params.actor ? {
        userId: params.actor.userId,
        email: maskEmail(params.actor.email),
        walletAddress: maskWallet(params.actor.walletAddress),
        ipAddress: maskIP(params.actor.ipAddress),
        userAgent: params.actor.userAgent?.substring(0, 200),
        sessionId: params.actor.sessionId,
      } : undefined,
      target: params.target,
      details: {
        action: params.action,
        outcome: params.outcome,
        reason: params.reason,
        metadata: params.metadata,
      },
      request: params.request,
      integrity: {
        hash: '', // Will be set below
        previousHash: lastHash,
        sequence: sequenceCounter,
      },
      expiresAt: params.retentionDays 
        ? new Date(Date.now() + params.retentionDays * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 730 * 24 * 60 * 60 * 1000), // 2 years default
    };
    
    // Generate integrity hash
    entry.integrity.hash = generateHash(entry, lastHash);
    lastHash = entry.integrity.hash;
    
    // Save to database (append-only)
    await AuditLog.create(entry);
    
    // Also log to standard logger for real-time monitoring
    logger.info('AUDIT', {
      eventType: params.eventType,
      severity: params.severity,
      action: params.action,
      outcome: params.outcome,
      userId: params.actor?.userId,
      requestId: params.request?.requestId,
    });
  } catch (error) {
    // Audit logging failures should not crash the application
    // but should be logged for investigation
    logger.error('Failed to write audit log', {
      error: (error as Error).message,
      eventType: params.eventType,
      action: params.action,
    });
  }
}

/**
 * Verify audit log chain integrity
 * Used for compliance audits to ensure logs haven't been tampered with
 */
export async function verifyAuditLogIntegrity(
  startSequence?: number,
  endSequence?: number
): Promise<{
  valid: boolean;
  checked: number;
  errors: Array<{ sequence: number; error: string }>;
}> {
  const query: Record<string, unknown> = {};
  if (startSequence !== undefined) {
    query['integrity.sequence'] = { $gte: startSequence };
  }
  if (endSequence !== undefined) {
    query['integrity.sequence'] = { 
      ...query['integrity.sequence'] as object,
      $lte: endSequence 
    };
  }
  
  const logs = await AuditLog.find(query)
    .sort({ 'integrity.sequence': 1 })
    .lean();
  
  const errors: Array<{ sequence: number; error: string }> = [];
  let previousHash = '';
  
  for (const log of logs) {
    // Verify chain linkage
    if (log.integrity.previousHash !== previousHash && log.integrity.sequence > 1) {
      errors.push({
        sequence: log.integrity.sequence,
        error: 'Chain break: previousHash mismatch',
      });
    }
    
    // Verify hash integrity
    const logCopy = { ...log };
    const expectedHash = logCopy.integrity.hash;
    logCopy.integrity.hash = '';
    const computedHash = generateHash(logCopy, log.integrity.previousHash || '');
    
    if (computedHash !== expectedHash) {
      errors.push({
        sequence: log.integrity.sequence,
        error: 'Hash mismatch: log entry may have been tampered',
      });
    }
    
    previousHash = log.integrity.hash;
  }
  
  return {
    valid: errors.length === 0,
    checked: logs.length,
    errors,
  };
}

// Service-level pagination limits (defense in depth)
const SERVICE_PAGINATION = {
  MAX_LIMIT: 10000,     // Hard cap at service level
  MAX_SKIP: 100000,     // Maximum offset to prevent DoS
  DEFAULT_LIMIT: 100,
  DEFAULT_SKIP: 0,
} as const;

/**
 * Query audit logs with filtering
 * For compliance reporting and security investigations
 * 
 * SECURITY: Enforces hard caps on limit/skip to prevent DoS attacks
 * even if route-level validation is bypassed
 */
export async function queryAuditLogs(params: {
  userId?: string;
  eventType?: AuditEventType | AuditEventType[];
  severity?: AuditSeverity | AuditSeverity[];
  startDate?: Date;
  endDate?: Date;
  correlationId?: string;
  limit?: number;
  skip?: number;
}): Promise<{
  logs: IAuditLog[];
  total: number;
}> {
  const query: Record<string, unknown> = {};
  
  if (params.userId) {
    query['actor.userId'] = params.userId;
  }
  
  if (params.eventType) {
    query.eventType = Array.isArray(params.eventType) 
      ? { $in: params.eventType }
      : params.eventType;
  }
  
  if (params.severity) {
    query.severity = Array.isArray(params.severity)
      ? { $in: params.severity }
      : params.severity;
  }
  
  if (params.startDate || params.endDate) {
    query.timestamp = {};
    if (params.startDate) {
      (query.timestamp as Record<string, unknown>).$gte = params.startDate;
    }
    if (params.endDate) {
      (query.timestamp as Record<string, unknown>).$lte = params.endDate;
    }
  }
  
  if (params.correlationId) {
    query['request.correlationId'] = params.correlationId;
  }
  
  // SECURITY FIX: Enforce hard caps at service level (defense in depth)
  // Validate and sanitize limit
  let limit = params.limit ?? SERVICE_PAGINATION.DEFAULT_LIMIT;
  if (typeof limit !== 'number' || isNaN(limit) || limit < 1) {
    limit = SERVICE_PAGINATION.DEFAULT_LIMIT;
  }
  limit = Math.min(limit, SERVICE_PAGINATION.MAX_LIMIT);
  
  // Validate and sanitize skip
  let skip = params.skip ?? SERVICE_PAGINATION.DEFAULT_SKIP;
  if (typeof skip !== 'number' || isNaN(skip) || skip < 0) {
    skip = SERVICE_PAGINATION.DEFAULT_SKIP;
  }
  skip = Math.min(skip, SERVICE_PAGINATION.MAX_SKIP);
  
  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip)
      .lean()
      .maxTimeMS(30000), // 30 second timeout for large queries
    AuditLog.countDocuments(query)
      .maxTimeMS(10000), // 10 second timeout for count
  ]);
  
  return { logs, total };
}

export default {
  AuditEventType,
  AuditSeverity,
  initializeAuditLog,
  logAuditEvent,
  verifyAuditLogIntegrity,
  queryAuditLogs,
};
