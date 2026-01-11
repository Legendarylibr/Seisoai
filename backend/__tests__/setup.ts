/**
 * Jest test setup
 * Runs before all tests
 */
import { jest, afterAll } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-32chars';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret-for-testing-32';
process.env.PORT = '3002';
// Set test encryption key (64 hex characters = 256 bits)
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Mock console.log/error in tests to reduce noise
// Uncomment if you want quiet tests:
// jest.spyOn(console, 'log').mockImplementation(() => {});
// jest.spyOn(console, 'error').mockImplementation(() => {});

// Global test timeout
jest.setTimeout(30000);

// Cleanup after all tests
afterAll(async () => {
  // Close any open handles
  await new Promise(resolve => setTimeout(resolve, 500));
});

