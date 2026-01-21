/**
 * Redis Service
 * Distributed caching and session management
 */
import Redis from 'ioredis';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// Types
interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

// Default TTL values
const DEFAULT_TTL = 3600; // 1 hour
const CACHE_PREFIX = 'seisoai:';

// Redis client singleton
let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<Redis | null> {
  if (!config.REDIS_URL) {
    logger.info('Redis URL not configured - using in-memory caching');
    return null;
  }

  try {
    // Optimize Redis connection for scaling
    // ioredis uses connection pooling internally - each instance maintains a pool
    const redisOptions: Redis.RedisOptions = {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        // Exponential backoff with max 30 second delay
        // Stops retrying after 10 attempts to avoid resource waste
        if (times > 10) {
          return null; // Stop retrying
        }
        const delay = Math.min(times * 100, 30000);
        return delay;
      },
      lazyConnect: true,
      enableReadyCheck: true,
      // Memory optimization: Enable offline queue with limits
      enableOfflineQueue: true,
      offlineQueue: true,
      // Connection optimization - increased timeouts for high load
      connectTimeout: config.isProduction ? 15000 : 10000,
      commandTimeout: config.isProduction ? 10000 : 5000,
      // Connection pool settings for better performance
      keepAlive: 30000,  // Keep connections alive
      // For Redis Cluster/Sentinel support (if using)
      // enableReadyCheck: true,
      // maxRetriesPerRequest: null,  // Set to null for cluster mode
    };

    // If using Redis Sentinel or Cluster, parse the URL accordingly
    // For Sentinel: redis-sentinel://host:port?sentinel=host1:port1,host2:port2
    // For Cluster: redis-cluster://host:port
    if (config.REDIS_URL.includes('sentinel') || config.REDIS_URL.includes('cluster')) {
      // ioredis will automatically detect and configure for Sentinel/Cluster
      logger.info('Using Redis Sentinel/Cluster mode');
    }

    redisClient = new Redis(config.REDIS_URL, redisOptions);

    redisClient.on('connect', () => {
      logger.info('Redis connected');
      isConnected = true;
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
      isConnected = false;
    });

    redisClient.on('close', () => {
      logger.warn('Redis connection closed');
      isConnected = false;
    });

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    const err = error as Error;
    logger.error('Failed to initialize Redis', { error: err.message });
    return null;
  }
}

/**
 * Get Redis client
 */
export function getRedis(): Redis | null {
  return isConnected ? redisClient : null;
}

/**
 * Check if Redis is connected
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    logger.info('Redis connection closed');
  }
}

// ============================================================================
// Distributed Cache Operations
// ============================================================================

/**
 * Set a value in cache
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  options: CacheOptions = {}
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const { ttl = DEFAULT_TTL, prefix = CACHE_PREFIX } = options;
    const fullKey = `${prefix}${key}`;
    const serialized = JSON.stringify(value);

    if (ttl > 0) {
      await client.setex(fullKey, ttl, serialized);
    } else {
      await client.set(fullKey, serialized);
    }

    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis cacheSet error', { key, error: err.message });
    return false;
  }
}

/**
 * Get a value from cache
 */
export async function cacheGet<T>(
  key: string,
  options: CacheOptions = {}
): Promise<T | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const { prefix = CACHE_PREFIX } = options;
    const fullKey = `${prefix}${key}`;
    const value = await client.get(fullKey);

    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis cacheGet error', { key, error: err.message });
    return null;
  }
}

/**
 * Delete a value from cache
 */
export async function cacheDelete(
  key: string,
  options: CacheOptions = {}
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const { prefix = CACHE_PREFIX } = options;
    const fullKey = `${prefix}${key}`;
    await client.del(fullKey);
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis cacheDelete error', { key, error: err.message });
    return false;
  }
}

/**
 * Check if key exists in cache
 */
export async function cacheExists(
  key: string,
  options: CacheOptions = {}
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const { prefix = CACHE_PREFIX } = options;
    const fullKey = `${prefix}${key}`;
    const exists = await client.exists(fullKey);
    return exists === 1;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis cacheExists error', { key, error: err.message });
    return false;
  }
}

// ============================================================================
// Rate Limiting with Redis
// ============================================================================

/**
 * Increment a rate limit counter
 */
export async function rateLimitIncrement(
  key: string,
  windowSeconds: number
): Promise<number> {
  const client = getRedis();
  if (!client) return 0;

  try {
    const fullKey = `${CACHE_PREFIX}ratelimit:${key}`;
    const count = await client.incr(fullKey);
    
    // Set expiry on first increment
    if (count === 1) {
      await client.expire(fullKey, windowSeconds);
    }
    
    return count;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis rateLimitIncrement error', { key, error: err.message });
    return 0;
  }
}

// ============================================================================
// Distributed Locking
// ============================================================================

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
  lockName: string,
  ttlSeconds: number = 30
): Promise<string | null> {
  const client = getRedis();
  if (!client) return null;

  try {
    const lockKey = `${CACHE_PREFIX}lock:${lockName}`;
    const lockValue = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    
    const acquired = await client.set(lockKey, lockValue, 'EX', ttlSeconds, 'NX');
    
    return acquired === 'OK' ? lockValue : null;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis acquireLock error', { lockName, error: err.message });
    return null;
  }
}

/**
 * Release a distributed lock
 */
export async function releaseLock(
  lockName: string,
  lockValue: string
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const lockKey = `${CACHE_PREFIX}lock:${lockName}`;
    
    // Use Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await client.eval(script, 1, lockKey, lockValue);
    return result === 1;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis releaseLock error', { lockName, error: err.message });
    return false;
  }
}

// ============================================================================
// Transaction Deduplication
// ============================================================================

/**
 * Check and set transaction as processed (atomic operation)
 */
export async function markTransactionProcessed(
  txHash: string,
  ttlSeconds: number = 7 * 24 * 60 * 60 // 7 days
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const key = `${CACHE_PREFIX}tx:${txHash}`;
    const result = await client.set(key, Date.now().toString(), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  } catch (error) {
    const err = error as Error;
    logger.error('Redis markTransactionProcessed error', { txHash, error: err.message });
    return false;
  }
}

/**
 * Check if transaction was already processed
 */
export async function isTransactionProcessed(txHash: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    const key = `${CACHE_PREFIX}tx:${txHash}`;
    const exists = await client.exists(key);
    return exists === 1;
  } catch (error) {
    const err = error as Error;
    logger.error('Redis isTransactionProcessed error', { txHash, error: err.message });
    return false;
  }
}

export default {
  initializeRedis,
  getRedis,
  isRedisConnected,
  closeRedis,
  cacheSet,
  cacheGet,
  cacheDelete,
  cacheExists,
  rateLimitIncrement,
  acquireLock,
  releaseLock,
  markTransactionProcessed,
  isTransactionProcessed,
};

