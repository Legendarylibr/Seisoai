/**
 * MongoDB Retry utility tests
 */
import { describe, it, expect } from '@jest/globals';
import { withRetry, isRetryableError } from '../../utils/mongoRetry.js';

// Simple mock function for testing
function createMockFn<T>() {
  const calls: unknown[][] = [];
  let mockImpl: (() => Promise<T>) | null = null;
  const implementations: (() => Promise<T>)[] = [];
  
  const fn = async (...args: unknown[]): Promise<T> => {
    calls.push(args);
    if (implementations.length > 0) {
      const impl = implementations.shift()!;
      return impl();
    }
    if (mockImpl) {
      return mockImpl();
    }
    throw new Error('No implementation');
  };
  
  fn.mockResolvedValue = (value: T) => {
    mockImpl = () => Promise.resolve(value);
    return fn;
  };
  
  fn.mockRejectedValue = (error: Error) => {
    mockImpl = () => Promise.reject(error);
    return fn;
  };
  
  fn.mockResolvedValueOnce = (value: T) => {
    implementations.push(() => Promise.resolve(value));
    return fn;
  };
  
  fn.mockRejectedValueOnce = (error: Error) => {
    implementations.push(() => Promise.reject(error));
    return fn;
  };
  
  fn.calls = calls;
  
  return fn;
}

describe('MongoDB Retry Utility', () => {
  describe('isRetryableError()', () => {
    it('should identify plan executor errors as retryable', () => {
      const error = new Error('Plan executor error during findAndModify');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify write conflict errors as retryable', () => {
      const error = new Error('WriteConflict error');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should identify network errors as retryable', () => {
      const errors = [
        new Error('network error'),
        new Error('socket exception'),
        new Error('connection reset'),
        new Error('ECONNRESET'),
      ];
      
      errors.forEach(error => {
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should identify transient transaction errors as retryable', () => {
      const error = new Error('TransientTransactionError');
      expect(isRetryableError(error)).toBe(true);
    });

    it('should not identify validation errors as retryable', () => {
      const error = new Error('ValidationError: email is required');
      expect(isRetryableError(error)).toBe(false);
    });

    it('should not identify duplicate key errors as retryable', () => {
      const error = new Error('E11000 duplicate key error');
      expect(isRetryableError(error)).toBe(false);
    });
  });

  describe('withRetry()', () => {
    it('should execute operation successfully on first try', async () => {
      const operation = createMockFn<string>().mockResolvedValue('success');
      
      const result = await withRetry(operation, { operation: 'test' });
      
      expect(result).toBe('success');
      expect(operation.calls.length).toBe(1);
    });

    it('should retry on retryable errors', async () => {
      const operation = createMockFn<string>()
        .mockRejectedValueOnce(new Error('plan executor error'))
        .mockResolvedValue('success on retry');
      
      const result = await withRetry(operation, { 
        operation: 'test',
        maxRetries: 3,
        baseDelayMs: 10
      });
      
      expect(result).toBe('success on retry');
      expect(operation.calls.length).toBe(2);
    });

    it('should not retry on non-retryable errors', async () => {
      const operation = createMockFn<string>()
        .mockRejectedValue(new Error('ValidationError'));
      
      await expect(withRetry(operation, { 
        operation: 'test',
        maxRetries: 3
      })).rejects.toThrow('ValidationError');
      
      expect(operation.calls.length).toBe(1);
    });

    it('should throw after max retries exceeded', async () => {
      const operation = createMockFn<string>()
        .mockRejectedValue(new Error('plan executor error'));
      
      await expect(withRetry(operation, { 
        operation: 'test',
        maxRetries: 2,
        baseDelayMs: 10
      })).rejects.toThrow('plan executor error');
      
      expect(operation.calls.length).toBe(3); // Initial + 2 retries
    });

    it('should use exponential backoff with jitter', async () => {
      const operation = createMockFn<string>()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      await withRetry(operation, { 
        operation: 'test',
        maxRetries: 3,
        baseDelayMs: 50,
        maxDelayMs: 500
      });
      const elapsed = Date.now() - startTime;
      
      // Should have waited at least some time due to backoff
      // First retry: ~50ms, Second retry: ~100ms
      // With jitter, total should be at least 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100);
      expect(operation.calls.length).toBe(3);
    });

    it('should respect maxDelayMs cap', async () => {
      const operation = createMockFn<string>()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      await withRetry(operation, { 
        operation: 'test',
        maxRetries: 5,
        baseDelayMs: 1000,
        maxDelayMs: 50 // Cap at 50ms
      });
      const elapsed = Date.now() - startTime;
      
      // Even with high baseDelay, should be capped at 50ms per retry
      // 3 retries * 50ms max = 150ms max (plus jitter)
      expect(elapsed).toBeLessThan(500);
    });
  });
});
