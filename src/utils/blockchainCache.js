// Blockchain data caching utility
class BlockchainCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time-to-live for cache entries
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
  }

  // Set cache entry with TTL
  set(key, value, ttl = this.defaultTTL) {
    const expiry = Date.now() + ttl;
    this.cache.set(key, value);
    this.ttl.set(key, expiry);
  }

  // Get cache entry if not expired
  get(key) {
    const expiry = this.ttl.get(key);
    if (!expiry || Date.now() > expiry) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key);
  }

  // Delete cache entry
  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  // Clear all cache
  clear() {
    this.cache.clear();
    this.ttl.clear();
  }

  // Clean expired entries
  cleanExpired() {
    const now = Date.now();
    for (const [key, expiry] of this.ttl.entries()) {
      if (now > expiry) {
        this.delete(key);
      }
    }
  }

  // Get cache size
  size() {
    return this.cache.size;
  }

  // Cache NFT verification results
  cacheNFTVerification(walletAddress, result) {
    const key = `nft_${walletAddress.toLowerCase()}`;
    this.set(key, result, 10 * 60 * 1000); // 10 minutes TTL
  }

  // Get cached NFT verification
  getCachedNFTVerification(walletAddress) {
    const key = `nft_${walletAddress.toLowerCase()}`;
    return this.get(key);
  }

  // Cache credit balance
  cacheCreditBalance(walletAddress, balance) {
    const key = `credits_${walletAddress.toLowerCase()}`;
    this.set(key, balance, 2 * 60 * 1000); // 2 minutes TTL
  }

  // Get cached credit balance
  getCachedCreditBalance(walletAddress) {
    const key = `credits_${walletAddress.toLowerCase()}`;
    return this.get(key);
  }

  // Cache token balance
  cacheTokenBalance(walletAddress, tokenAddress, balance) {
    const key = `token_${walletAddress.toLowerCase()}_${tokenAddress}`;
    this.set(key, balance, 3 * 60 * 1000); // 3 minutes TTL
  }

  // Get cached token balance
  getCachedTokenBalance(walletAddress, tokenAddress) {
    const key = `token_${walletAddress.toLowerCase()}_${tokenAddress}`;
    return this.get(key);
  }

  // Cache transaction verification
  cacheTransactionVerification(txHash, result) {
    const key = `tx_${txHash}`;
    this.set(key, result, 30 * 60 * 1000); // 30 minutes TTL
  }

  // Get cached transaction verification
  getCachedTransactionVerification(txHash) {
    const key = `tx_${txHash}`;
    return this.get(key);
  }
}

// Create singleton instance
const blockchainCache = new BlockchainCache();

// Clean expired entries every 5 minutes
setInterval(() => {
  blockchainCache.cleanExpired();
}, 5 * 60 * 1000);

export default blockchainCache;
