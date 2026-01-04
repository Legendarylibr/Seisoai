/**
 * Type declarations for opossum circuit breaker
 */
declare module 'opossum' {
  import { EventEmitter } from 'events';

  interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    volumeThreshold?: number;
    name?: string;
    group?: string;
    rollingCountTimeout?: number;
    rollingCountBuckets?: number;
    rollingPercentilesEnabled?: boolean;
    capacity?: number;
    errorFilter?: (err: Error) => boolean;
    cache?: boolean;
    cacheTTL?: number;
    cacheGetKey?: (...args: unknown[]) => string;
    cacheTransport?: unknown;
    abortController?: AbortController;
    enableSnapshots?: boolean;
    rotateBucketController?: unknown;
    allowWarmUp?: boolean;
  }

  interface CircuitBreakerStats {
    failures: number;
    successes: number;
    fallbacks: number;
    timeouts: number;
    cacheHits: number;
    cacheMisses: number;
    rejects: number;
    latencyMean: number;
    latencyTimes: number[];
    percentiles: Record<number, number>;
  }

  class CircuitBreaker<TArgs extends unknown[], TResult> extends EventEmitter {
    constructor(
      action: (...args: TArgs) => Promise<TResult>,
      options?: CircuitBreakerOptions
    );

    readonly name: string;
    readonly group: string;
    readonly enabled: boolean;
    readonly pendingClose: boolean;
    readonly closed: boolean;
    readonly opened: boolean;
    readonly halfOpen: boolean;
    readonly isShutdown: boolean;
    readonly status: { stats: CircuitBreakerStats };
    readonly stats: CircuitBreakerStats;
    readonly warmUp: boolean;
    readonly volumeThreshold: number;

    fire(...args: TArgs): Promise<TResult>;
    call(...args: TArgs): Promise<TResult>;
    clearCache(): void;
    close(): void;
    open(): void;
    shutdown(): void;
    enable(): void;
    disable(): void;
    fallback(func: (...args: TArgs) => TResult | Promise<TResult>): this;
    healthCheck(func: () => Promise<unknown>, interval?: number): void;

    on(event: 'success', listener: (result: TResult, latencyMs: number) => void): this;
    on(event: 'timeout', listener: (latencyMs: number) => void): this;
    on(event: 'reject', listener: () => void): this;
    on(event: 'open', listener: () => void): this;
    on(event: 'halfOpen', listener: () => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'fallback', listener: (result: TResult) => void): this;
    on(event: 'failure', listener: (error: Error, latencyMs: number) => void): this;
    on(event: 'semaphoreLocked', listener: () => void): this;
    on(event: 'healthCheckFailed', listener: (error: Error) => void): this;
    on(event: 'shutdown', listener: () => void): this;
    on(event: 'cacheHit', listener: () => void): this;
    on(event: 'cacheMiss', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export = CircuitBreaker;
}

