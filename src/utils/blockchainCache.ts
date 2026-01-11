// Blockchain data caching utility

interface NFTVerificationResult {
  verified: boolean;
  collections?: string[];
  timestamp?: number;
}

interface TransactionVerificationResult {
  verified: boolean;
  amount?: number;
  sender?: string;
  recipient?: string;
}

class BlockchainCache {
  private cache: Map<string, unknown>;
  private ttl: Map<string, number>; // Time-to-live for cache entries
  private defaultTTL: number;
  private maxSize: number;

  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes default TTL
    this.maxSize = 500; // Limit cache size to prevent memory leaks in browser
  }

  // Set cache entry with TTL
  set<T>(key: string, value: T, ttl: number = this.defaultTTL): void {
    // Evict old entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }
    
    const expiry = Date.now() + ttl;
    this.cache.set(key, value);
    this.ttl.set(key, expiry);
  }

  // Evict oldest/expired entries when cache is full
  private evictOldest(): void {
    const now = Date.now();
    let evicted = 0;
    const targetEvictions = Math.ceil(this.maxSize * 0.2); // Evict 20% when full

    // First pass: remove expired entries
    for (const [key, expiry] of this.ttl.entries()) {
      if (now > expiry) {
        this.delete(key);
        evicted++;
        if (evicted >= targetEvictions) return;
      }
    }

    // Second pass: remove oldest entries
    const keysIterator = this.cache.keys();
    while (evicted < targetEvictions) {
      const result = keysIterator.next();
      if (result.done) break;
      this.delete(result.value);
      evicted++;
    }
  }

  // Get cache entry if not expired
  get<T>(key: string): T | null {
    const expiry = this.ttl.get(key);
    if (!expiry || Date.now() > expiry) {
      this.delete(key);
      return null;
    }
    return this.cache.get(key) as T;
  }

  // Delete cache entry
  delete(key: string): void {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  // Clear all cache
  clear(): void {
    this.cache.clear();
    this.ttl.clear();
  }

  // Clean expired entries
  cleanExpired(): void {
    const now = Date.now();
    for (const [key, expiry] of this.ttl.entries()) {
      if (now > expiry) {
        this.delete(key);
      }
    }
  }

  // Get cache size
  size(): number {
    return this.cache.size;
  }

  // Cache NFT verification results
  cacheNFTVerification(walletAddress: string, result: NFTVerificationResult): void {
    const key = `nft_${walletAddress.toLowerCase()}`;
    this.set(key, result, 10 * 60 * 1000); // 10 minutes TTL
  }

  // Get cached NFT verification
  getCachedNFTVerification(walletAddress: string): NFTVerificationResult | null {
    const key = `nft_${walletAddress.toLowerCase()}`;
    return this.get<NFTVerificationResult>(key);
  }

  // Cache credit balance
  cacheCreditBalance(walletAddress: string, balance: number): void {
    const key = `credits_${walletAddress.toLowerCase()}`;
    this.set(key, balance, 2 * 60 * 1000); // 2 minutes TTL
  }

  // Get cached credit balance
  getCachedCreditBalance(walletAddress: string): number | null {
    const key = `credits_${walletAddress.toLowerCase()}`;
    return this.get<number>(key);
  }

  // Cache token balance
  cacheTokenBalance(walletAddress: string, tokenAddress: string, balance: string): void {
    const key = `token_${walletAddress.toLowerCase()}_${tokenAddress}`;
    this.set(key, balance, 3 * 60 * 1000); // 3 minutes TTL
  }

  // Get cached token balance
  getCachedTokenBalance(walletAddress: string, tokenAddress: string): string | null {
    const key = `token_${walletAddress.toLowerCase()}_${tokenAddress}`;
    return this.get<string>(key);
  }

  // Cache transaction verification
  cacheTransactionVerification(txHash: string, result: TransactionVerificationResult): void {
    const key = `tx_${txHash}`;
    this.set(key, result, 30 * 60 * 1000); // 30 minutes TTL
  }

  // Get cached transaction verification
  getCachedTransactionVerification(txHash: string): TransactionVerificationResult | null {
    const key = `tx_${txHash}`;
    return this.get<TransactionVerificationResult>(key);
  }
}

// Create singleton instance
const blockchainCache = new BlockchainCache();

// Clean expired entries every 5 minutes
setInterval(() => {
  blockchainCache.cleanExpired();
}, 5 * 60 * 1000);

export default blockchainCache;





