/**
 * Circuit Breaker Service
 * Protects against cascading failures from external services
 */
import CircuitBreaker from 'opossum';
import logger from '../utils/logger.js';

// Types
interface CircuitBreakerOptions {
  timeout?: number;           // Time in ms before a request is considered failed
  errorThresholdPercentage?: number;  // Error percentage to trip circuit
  resetTimeout?: number;      // Time in ms before attempting to close circuit
  volumeThreshold?: number;   // Minimum number of requests before calculating error percentage
  name?: string;              // Name for logging/monitoring
}

interface CircuitStats {
  failures: number;
  successes: number;
  fallbacks: number;
  timeouts: number;
  cacheHits: number;
  state: string;
}

// Store all circuit breakers for monitoring
const circuitBreakers: Map<string, CircuitBreaker<unknown[], unknown>> = new Map();

// Default options
const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  timeout: 30000,           // 30 seconds
  errorThresholdPercentage: 50,
  resetTimeout: 30000,      // 30 seconds
  volumeThreshold: 5,
};

/**
 * Create a circuit breaker for an async function
 */
export function createCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<T, R> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const name = mergedOptions.name || fn.name || 'anonymous';

  const breaker = new CircuitBreaker(fn, {
    timeout: mergedOptions.timeout,
    errorThresholdPercentage: mergedOptions.errorThresholdPercentage,
    resetTimeout: mergedOptions.resetTimeout,
    volumeThreshold: mergedOptions.volumeThreshold,
    name,
  });

  // Event handlers for logging and monitoring
  breaker.on('success', () => {
    logger.debug(`Circuit breaker [${name}] success`);
  });

  breaker.on('timeout', () => {
    logger.warn(`Circuit breaker [${name}] timeout`);
  });

  breaker.on('reject', () => {
    logger.warn(`Circuit breaker [${name}] rejected (circuit open)`);
  });

  breaker.on('open', () => {
    logger.error(`Circuit breaker [${name}] OPENED - stopping requests`);
  });

  breaker.on('halfOpen', () => {
    logger.info(`Circuit breaker [${name}] half-open - testing service`);
  });

  breaker.on('close', () => {
    logger.info(`Circuit breaker [${name}] CLOSED - resuming normal operation`);
  });

  breaker.on('fallback', () => {
    logger.debug(`Circuit breaker [${name}] fallback executed`);
  });

  // Store for monitoring
  circuitBreakers.set(name, breaker as CircuitBreaker<unknown[], unknown>);

  return breaker;
}

/**
 * Get circuit breaker stats for monitoring
 */
export function getCircuitStats(name: string): CircuitStats | null {
  const breaker = circuitBreakers.get(name);
  if (!breaker) return null;

  const stats = breaker.stats;
  return {
    failures: stats.failures,
    successes: stats.successes,
    fallbacks: stats.fallbacks,
    timeouts: stats.timeouts,
    cacheHits: stats.cacheHits,
    state: breaker.opened ? 'open' : breaker.halfOpen ? 'half-open' : 'closed',
  };
}

/**
 * Get all circuit breaker stats
 */
export function getAllCircuitStats(): Record<string, CircuitStats> {
  const allStats: Record<string, CircuitStats> = {};
  
  for (const [name] of circuitBreakers) {
    const stats = getCircuitStats(name);
    if (stats) {
      allStats[name] = stats;
    }
  }
  
  return allStats;
}

/**
 * Force close a circuit breaker (for testing/admin)
 */
export function forceCloseCircuit(name: string): boolean {
  const breaker = circuitBreakers.get(name);
  if (!breaker) return false;
  
  breaker.close();
  logger.info(`Circuit breaker [${name}] force closed`);
  return true;
}

/**
 * Force open a circuit breaker (for testing/maintenance)
 */
export function forceOpenCircuit(name: string): boolean {
  const breaker = circuitBreakers.get(name);
  if (!breaker) return false;
  
  breaker.open();
  logger.info(`Circuit breaker [${name}] force opened`);
  return true;
}

// ============================================================================
// Pre-configured Circuit Breakers for External Services
// ============================================================================

/**
 * Create circuit breaker for FAL.ai API calls
 */
export function createFalCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): CircuitBreaker<T, R> {
  return createCircuitBreaker(fn, {
    name: 'fal-ai',
    timeout: 120000,          // 2 minutes (image generation can be slow)
    errorThresholdPercentage: 60,
    resetTimeout: 60000,      // 1 minute
    volumeThreshold: 3,
  });
}

/**
 * Create circuit breaker for Stripe API calls
 */
export function createStripeCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): CircuitBreaker<T, R> {
  return createCircuitBreaker(fn, {
    name: 'stripe',
    timeout: 30000,           // 30 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5,
  });
}

/**
 * Create circuit breaker for blockchain RPC calls
 */
export function createBlockchainCircuitBreaker<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  chainName: string
): CircuitBreaker<T, R> {
  return createCircuitBreaker(fn, {
    name: `blockchain-${chainName}`,
    timeout: 15000,           // 15 seconds
    errorThresholdPercentage: 60,
    resetTimeout: 20000,      // 20 seconds
    volumeThreshold: 5,
  });
}

export default {
  createCircuitBreaker,
  createFalCircuitBreaker,
  createStripeCircuitBreaker,
  createBlockchainCircuitBreaker,
  getCircuitStats,
  getAllCircuitStats,
  forceCloseCircuit,
  forceOpenCircuit,
};

