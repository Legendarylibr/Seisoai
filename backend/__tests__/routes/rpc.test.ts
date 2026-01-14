/**
 * RPC proxy security tests
 * Tests the RPC method whitelist/blacklist functionality
 */
import { describe, it, expect } from '@jest/globals';

// Whitelist of allowed RPC methods (copied from rpc.ts for testing)
const ALLOWED_RPC_METHODS = new Set([
  'eth_blockNumber',
  'eth_getBalance',
  'eth_getTransactionByHash',
  'eth_getTransactionReceipt',
  'eth_call',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_getBlockByNumber',
  'eth_getBlockByHash',
  'eth_getLogs',
  'eth_chainId',
  'net_version',
  'getBalance',
  'getAccountInfo',
  'getTransaction',
  'getSignaturesForAddress',
  'getSlot',
  'getLatestBlockhash',
  'getTokenAccountBalance',
  'getProgramAccounts'
]);

// Blocked methods
const BLOCKED_RPC_METHODS = new Set([
  'eth_sendTransaction',
  'eth_sendRawTransaction',
  'eth_signTransaction',
  'eth_sign',
  'personal_sign',
  'eth_signTypedData',
  'sendTransaction',
  'simulateTransaction',
  'debug_',
  'admin_',
  'miner_',
  'personal_'
]);

function isMethodAllowed(method: string): boolean {
  const methodLower = method.toLowerCase();
  
  // Check blocked prefixes
  for (const blocked of BLOCKED_RPC_METHODS) {
    if (methodLower === blocked.toLowerCase() || methodLower.startsWith(blocked.toLowerCase())) {
      return false;
    }
  }
  
  // Check whitelist
  return ALLOWED_RPC_METHODS.has(method);
}

describe('RPC Proxy Security', () => {
  describe('Allowed Methods (Read-Only)', () => {
    const allowedMethods = [
      'eth_blockNumber',
      'eth_getBalance',
      'eth_getTransactionByHash',
      'eth_getTransactionReceipt',
      'eth_call',
      'eth_getLogs',
      'eth_chainId',
      'net_version',
      'getBalance',
      'getAccountInfo',
      'getTransaction'
    ];

    allowedMethods.forEach(method => {
      it(`should allow ${method}`, () => {
        expect(isMethodAllowed(method)).toBe(true);
      });
    });
  });

  describe('Blocked Methods (Write/Dangerous)', () => {
    const blockedMethods = [
      'eth_sendTransaction',
      'eth_sendRawTransaction',
      'eth_signTransaction',
      'eth_sign',
      'personal_sign',
      'sendTransaction'
    ];

    blockedMethods.forEach(method => {
      it(`should block ${method}`, () => {
        expect(isMethodAllowed(method)).toBe(false);
      });
    });
  });

  describe('Blocked Method Prefixes', () => {
    const blockedPrefixes = [
      'debug_traceTransaction',
      'debug_anything',
      'admin_addPeer',
      'admin_nodeInfo',
      'miner_start',
      'miner_stop',
      'personal_unlockAccount',
      'personal_newAccount'
    ];

    blockedPrefixes.forEach(method => {
      it(`should block prefix method ${method}`, () => {
        expect(isMethodAllowed(method)).toBe(false);
      });
    });
  });

  describe('Unknown Methods', () => {
    const unknownMethods = [
      'unknown_method',
      'custom_call',
      'my_special_method'
    ];

    unknownMethods.forEach(method => {
      it(`should block unknown method ${method}`, () => {
        expect(isMethodAllowed(method)).toBe(false);
      });
    });
  });

  describe('Case Sensitivity', () => {
    it('should be case-sensitive for whitelist', () => {
      expect(isMethodAllowed('eth_blockNumber')).toBe(true);
      expect(isMethodAllowed('ETH_BLOCKNUMBER')).toBe(false);
    });

    it('should be case-insensitive for blocklist', () => {
      expect(isMethodAllowed('eth_sendTransaction')).toBe(false);
      expect(isMethodAllowed('ETH_SENDTRANSACTION')).toBe(false);
      expect(isMethodAllowed('Eth_SendTransaction')).toBe(false);
    });
  });
});
