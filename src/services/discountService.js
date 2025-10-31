// Discount calculation service for NFT and token-based benefits
import { checkMultipleNFTs } from './nftService.js';
import { checkMultipleTokens } from './tokenService.js';
import { discountLogger as log } from '../utils/logger.js';

// Base cost configuration - dynamic pricing
const BASE_COST_PER_CREDIT = 0.15; // $0.15 per credit for regular users
const NFT_HOLDER_COST_PER_CREDIT = 0.06; // $0.06 per credit for NFT collection holders
const CREDITS_PER_GENERATION = 1; // 1 credit per image generation

// Cache configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const cache = new Map();

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100;
const rateLimitMap = new Map();

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Discount configuration - this would typically come from a backend API
const DISCOUNT_CONFIG = {
  // NFT-based discounts
  nftDiscounts: [
    // Your NFT Collection 1 - Ethereum L1
    {
      id: 'your-nft-holders-1',
      name: 'Your NFT Collection 1',
      description: '50% discount for NFT holders',
      contractAddress: '0x8e84dcAF616c3E04ed45d3e0912B81e7283a48DA',
      chainId: '1',
      type: 'erc721',
      discountType: 'percentage',
      discountValue: 50,
      minBalance: 1,
      appliesTo: ['image_generation', 'batch_processing']
    },
    // Your NFT Collection 2 - Base
    {
      id: 'your-nft-holders-2',
      name: 'Your NFT Collection 2',
      description: '40% discount for NFT holders',
      contractAddress: '0x1E71eA45FB939C92045FF32239a8922395eeb31B',
      chainId: '8453',
      type: 'erc721',
      discountType: 'percentage',
      discountValue: 40,
      minBalance: 1,
      appliesTo: ['image_generation', 'batch_processing']
    }
  ],
  
  // Token-based discounts
  tokenDiscounts: [
    {
      id: 'cult-holders',
      name: '$CULT Holders',
      description: '30% discount for holding 500k+ $CULT tokens',
      contractAddress: '0x0000000000c5dc95539589fbD24BE07c6C14eCa4',
      chainId: '1',
      type: 'erc20',
      discountType: 'percentage',
      discountValue: 30,
      minBalance: '500000',
      appliesTo: ['image_generation', 'batch_processing']
    }
  ],
  
  // Solana-based discounts
  solanaDiscounts: [  ]
};

// Utility functions
/**
 * Generate cache key for discount calculation
 * @param {string} walletAddress - The wallet address
 * @param {string} serviceType - The service type
 * @returns {string} - Cache key
 */
const generateCacheKey = (walletAddress, serviceType) => {
  return `discount:${walletAddress.toLowerCase()}:${serviceType}`;
};

/**
 * Check if cache entry is valid
 * @param {Object} cacheEntry - The cache entry
 * @returns {boolean} - Whether cache entry is valid
 */
const isCacheValid = (cacheEntry) => {
  return cacheEntry && (Date.now() - cacheEntry.timestamp) < CACHE_TTL;
};

/**
 * Get cached discount result
 * @param {string} walletAddress - The wallet address
 * @param {string} serviceType - The service type
 * @returns {Object|null} - Cached result or null
 */
const getCachedResult = (walletAddress, serviceType) => {
  const key = generateCacheKey(walletAddress, serviceType);
  const cached = cache.get(key);
  
  if (isCacheValid(cached)) {
    log.debug('Cache hit', { key, walletAddress, serviceType });
    return cached.data;
  }
  
  if (cached) {
    cache.delete(key);
    log.debug('Cache expired', { key });
  }
  
  return null;
};

/**
 * Set cached discount result
 * @param {string} walletAddress - The wallet address
 * @param {string} serviceType - The service type
 * @param {Object} result - The result to cache
 */
const setCachedResult = (walletAddress, serviceType, result) => {
  const key = generateCacheKey(walletAddress, serviceType);
  cache.set(key, {
    data: result,
    timestamp: Date.now()
  });
  log.debug('Result cached', { key, walletAddress, serviceType });
};

/**
 * Check rate limit for wallet address
 * @param {string} walletAddress - The wallet address
 * @returns {boolean} - Whether request is allowed
 */
const checkRateLimit = (walletAddress) => {
  const now = Date.now();
  const key = walletAddress.toLowerCase();
  const requests = rateLimitMap.get(key) || [];
  
  // Remove old requests outside the window
  const validRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
  
  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    log.warn('Rate limit exceeded', { walletAddress, requestCount: validRequests.length });
    return false;
  }
  
  // Add current request
  validRequests.push(now);
  rateLimitMap.set(key, validRequests);
  
  return true;
};

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {Array} args - Arguments for the function
 * @param {number} retries - Number of retries left
 * @returns {Promise} - Result of the function
 */
const retryWithBackoff = async (fn, args, retries = MAX_RETRIES) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (retries > 0) {
      const delay = RETRY_DELAY * (MAX_RETRIES - retries + 1);
      log.warn(`Retrying in ${delay}ms`, { retriesLeft: retries - 1, error: error.message });
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, args, retries - 1);
    }
    throw error;
  }
};

/**
 * Validate discount configuration object
 * @param {Object} discount - The discount configuration
 * @returns {Object} - Validation result
 */
const validateDiscountConfig = (discount) => {
  const requiredFields = ['id', 'name', 'description', 'contractAddress', 'chainId', 'type', 'discountType', 'discountValue', 'minBalance', 'appliesTo'];
  const errors = [];
  
  for (const field of requiredFields) {
    if (!discount[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }
  
  if (discount.discountType === 'percentage' && (discount.discountValue < 0 || discount.discountValue > 100)) {
    errors.push('Percentage discount must be between 0 and 100');
  }
  
  const minBalance = parseFloat(discount.minBalance);
  if (isNaN(minBalance) || minBalance < 0) {
    errors.push('Minimum balance must be a non-negative number');
  }
  
  if (!Array.isArray(discount.appliesTo) || discount.appliesTo.length === 0) {
    errors.push('appliesTo must be a non-empty array');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Clean up expired cache entries
 */
const cleanupCache = () => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (!isCacheValid(entry)) {
      cache.delete(key);
    }
  }
  log.debug('Cache cleanup completed', { remainingEntries: cache.size });
};

/**
 * Clean up expired rate limit entries
 */
const cleanupRateLimit = () => {
  const now = Date.now();
  for (const [key, requests] of rateLimitMap.entries()) {
    const validRequests = requests.filter(timestamp => now - timestamp < RATE_LIMIT_WINDOW);
    if (validRequests.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, validRequests);
    }
  }
  log.debug('Rate limit cleanup completed', { remainingEntries: rateLimitMap.size });
};

// Set up periodic cleanup
const cacheCleanupInterval = setInterval(cleanupCache, CACHE_TTL);
const rateLimitCleanupInterval = setInterval(cleanupRateLimit, RATE_LIMIT_WINDOW);

// Cleanup function for module reloading
export const cleanup = () => {
  clearInterval(cacheCleanupInterval);
  clearInterval(rateLimitCleanupInterval);
  cache.clear();
  rateLimitMap.clear();
  log.info('Discount service cleanup completed');
};

/**
 * Calculate discount for a wallet based on NFT and token holdings
 * @param {string} walletAddress - The wallet address to check
 * @param {string} serviceType - The service type (image_generation, batch_processing, etc.)
 * @param {Object} providers - Object with chainId as key and provider as value
 * @returns {Promise<Object>} - Discount information
 */
export const calculateDiscount = async (walletAddress, serviceType, providers) => {
  // Input validation
  if (!walletAddress || typeof walletAddress !== 'string') {
    throw new Error('Invalid wallet address provided');
  }
  if (!serviceType || typeof serviceType !== 'string') {
    throw new Error('Invalid service type provided');
  }
  if (!providers || typeof providers !== 'object') {
    throw new Error('Invalid providers object provided');
  }

  // Check rate limit
  if (!checkRateLimit(walletAddress)) {
    log.warn('Rate limit exceeded for wallet', { walletAddress });
    return {
      hasDiscount: false,
      discountPercentage: 0,
      isFree: false,
      appliedDiscounts: [],
      totalCredits: BASE_COST_CREDITS,
      error: 'Rate limit exceeded'
    };
  }

  // Check cache first
  const cachedResult = getCachedResult(walletAddress, serviceType);
  if (cachedResult) {
    log.info('Returning cached discount result', { walletAddress, serviceType });
    return cachedResult;
  }

  log.info('Calculating discount for wallet', { walletAddress, serviceType });

  try {
    const allDiscounts = [
      ...DISCOUNT_CONFIG.nftDiscounts,
      ...DISCOUNT_CONFIG.tokenDiscounts,
      ...DISCOUNT_CONFIG.solanaDiscounts
    ];
    
    // Filter discounts that apply to the service type
    const applicableDiscounts = allDiscounts.filter(discount => 
      discount.appliesTo.includes(serviceType)
    );
    
    // Calculate base cost based on NFT collection ownership
    let isNFTHolder = false;
    let costPerCredit = BASE_COST_PER_CREDIT;
    
    // Check if user owns any NFT collections
    const nftContracts = applicableDiscounts
      .filter(d => d.type === 'erc721' || d.type === 'erc1155' || d.type === 'solana')
      .map(d => ({
        address: d.contractAddress,
        chainId: d.chainId,
        type: d.type
      }));
    
    if (nftContracts.length > 0) {
      try {
        const nftResults = await retryWithBackoff(checkMultipleNFTs, [walletAddress, nftContracts, providers]);
        isNFTHolder = nftResults.some(result => result.balance > 0);
        if (isNFTHolder) {
          costPerCredit = NFT_HOLDER_COST_PER_CREDIT;
        }
      } catch (error) {
        log.warn('Failed to check NFT holdings for pricing', { error: error.message, walletAddress });
      }
    }
    
    if (applicableDiscounts.length === 0) {
      return {
        hasDiscount: false,
        discountPercentage: 0,
        isFree: false,
        appliedDiscounts: [],
        totalCredits: CREDITS_PER_GENERATION,
        costPerCredit: costPerCredit,
        isNFTHolder: isNFTHolder
      };
    }
    
    // Check NFT holdings with retry logic for discount calculation
    const nftContractsForDiscounts = applicableDiscounts
      .filter(d => d.type === 'erc721' || d.type === 'erc1155' || d.type === 'solana')
      .map(d => ({
        address: d.contractAddress,
        chainId: d.chainId,
        type: d.type
      }));
    
    let nftResults = [];
    if (nftContractsForDiscounts.length > 0) {
      try {
        nftResults = await retryWithBackoff(checkMultipleNFTs, [walletAddress, nftContractsForDiscounts, providers]);
        log.debug('NFT check completed', { contractCount: nftContractsForDiscounts.length, resultsCount: nftResults.length });
      } catch (error) {
        log.error('Failed to check NFT holdings after retries', { error: error.message, walletAddress });
        nftResults = [];
      }
    }
    
    // Check token holdings with retry logic
    const tokenContracts = applicableDiscounts
      .filter(d => d.type === 'erc20' || d.type === 'spl')
      .map(d => ({
        address: d.contractAddress,
        chainId: d.chainId,
        type: d.type
      }));
    
    let tokenResults = [];
    if (tokenContracts.length > 0) {
      try {
        tokenResults = await retryWithBackoff(checkMultipleTokens, [walletAddress, tokenContracts, providers]);
        log.debug('Token check completed', { contractCount: tokenContracts.length, resultsCount: tokenResults.length });
      } catch (error) {
        log.error('Failed to check token holdings after retries', { error: error.message, walletAddress });
        tokenResults = [];
      }
    }
    
    // Find applicable discounts
    const appliedDiscounts = [];
    let maxDiscountPercentage = 0;
    let isFree = false;
    
    for (const discount of applicableDiscounts) {
      let hasRequiredHoldings = false;
      
      if (discount.type === 'erc721' || discount.type === 'erc1155' || discount.type === 'solana') {
        const nftResult = nftResults.find(r => r.contractAddress === discount.contractAddress);
        if (nftResult && nftResult.owns && parseInt(nftResult.balance) >= discount.minBalance) {
          hasRequiredHoldings = true;
        }
      } else if (discount.type === 'erc20' || discount.type === 'spl') {
        const tokenResult = tokenResults.find(r => r.contractAddress === discount.contractAddress);
        if (tokenResult && parseFloat(tokenResult.formattedBalance) >= parseFloat(discount.minBalance)) {
          hasRequiredHoldings = true;
        }
      }
      
      if (hasRequiredHoldings) {
        appliedDiscounts.push({
          ...discount,
          applied: true
        });
        
        if (discount.discountType === 'free') {
          isFree = true;
          maxDiscountPercentage = 100;
        } else if (discount.discountType === 'percentage') {
          maxDiscountPercentage = Math.max(maxDiscountPercentage, discount.discountValue);
        }
      }
    }
    
    const result = {
      hasDiscount: appliedDiscounts.length > 0,
      discountPercentage: maxDiscountPercentage,
      isFree,
      appliedDiscounts,
      totalCredits: isFree ? 0 : CREDITS_PER_GENERATION,
      costPerCredit: costPerCredit,
      isNFTHolder: isNFTHolder
    };

    // Cache the result
    setCachedResult(walletAddress, serviceType, result);
    
    log.info('Discount calculation completed', { 
      walletAddress, 
      serviceType, 
      hasDiscount: result.hasDiscount, 
      discountPercentage: result.discountPercentage,
      appliedDiscountsCount: appliedDiscounts.length
    });

    return result;
  } catch (error) {
    log.error('Error calculating discount', { error: error.message, walletAddress, serviceType });
    const errorResult = {
      hasDiscount: false,
      discountPercentage: 0,
      isFree: false,
      appliedDiscounts: [],
      totalCredits: CREDITS_PER_GENERATION,
      costPerCredit: BASE_COST_PER_CREDIT,
      isNFTHolder: false,
      error: error.message
    };
    
    // Cache error result for a shorter time to prevent repeated failures
    setCachedResult(walletAddress, serviceType, errorResult);
    
    return errorResult;
  }
};

/**
 * Get available discount configurations
 * @returns {Object} - All discount configurations
 */
export const getDiscountConfig = () => {
  return DISCOUNT_CONFIG;
};

/**
 * Get base cost configuration
 * @returns {Object} - Base cost configuration
 */
export const getBaseCost = () => {
  return {
    creditsPerGeneration: CREDITS_PER_GENERATION,
    costPerCredit: BASE_COST_PER_CREDIT,
    nftHolderCostPerCredit: NFT_HOLDER_COST_PER_CREDIT
  };
};

/**
 * Add a new discount configuration
 * @param {Object} discount - The discount configuration to add
 * @param {string} type - The type of discount (nft, token, solana)
 * @returns {Object} - Result of the operation
 */
export const addDiscountConfig = (discount, type) => {
  // Validate discount configuration
  const validation = validateDiscountConfig(discount);
  if (!validation.isValid) {
    log.error('Invalid discount configuration', { errors: validation.errors, discount });
    return {
      success: false,
      errors: validation.errors
    };
  }

  // Check for duplicate ID
  const allDiscounts = [
    ...DISCOUNT_CONFIG.nftDiscounts,
    ...DISCOUNT_CONFIG.tokenDiscounts,
    ...DISCOUNT_CONFIG.solanaDiscounts
  ];
  
  if (allDiscounts.some(d => d.id === discount.id)) {
    const error = `Discount with ID '${discount.id}' already exists`;
    log.error('Duplicate discount ID', { id: discount.id });
    return {
      success: false,
      errors: [error]
    };
  }

  try {
    if (type === 'nft') {
      DISCOUNT_CONFIG.nftDiscounts.push(discount);
    } else if (type === 'token') {
      DISCOUNT_CONFIG.tokenDiscounts.push(discount);
    } else if (type === 'solana') {
      DISCOUNT_CONFIG.solanaDiscounts.push(discount);
    } else {
      const error = `Invalid discount type: ${type}`;
      log.error('Invalid discount type', { type });
      return {
        success: false,
        errors: [error]
      };
    }

    log.info('Discount configuration added', { id: discount.id, type, name: discount.name });
    return {
      success: true,
      discount
    };
  } catch (error) {
    log.error('Error adding discount configuration', { error: error.message, discount });
    return {
      success: false,
      errors: [error.message]
    };
  }
};

/**
 * Remove a discount configuration
 * @param {string} discountId - The ID of the discount to remove
 * @param {string} type - The type of discount (nft, token, solana)
 * @returns {Object} - Result of the operation
 */
export const removeDiscountConfig = (discountId, type) => {
  try {
    let removed = false;
    
    if (type === 'nft') {
      const initialLength = DISCOUNT_CONFIG.nftDiscounts.length;
      DISCOUNT_CONFIG.nftDiscounts = DISCOUNT_CONFIG.nftDiscounts.filter(d => d.id !== discountId);
      removed = DISCOUNT_CONFIG.nftDiscounts.length < initialLength;
    } else if (type === 'token') {
      const initialLength = DISCOUNT_CONFIG.tokenDiscounts.length;
      DISCOUNT_CONFIG.tokenDiscounts = DISCOUNT_CONFIG.tokenDiscounts.filter(d => d.id !== discountId);
      removed = DISCOUNT_CONFIG.tokenDiscounts.length < initialLength;
    } else if (type === 'solana') {
      const initialLength = DISCOUNT_CONFIG.solanaDiscounts.length;
      DISCOUNT_CONFIG.solanaDiscounts = DISCOUNT_CONFIG.solanaDiscounts.filter(d => d.id !== discountId);
      removed = DISCOUNT_CONFIG.solanaDiscounts.length < initialLength;
    } else {
      const error = `Invalid discount type: ${type}`;
      log.error('Invalid discount type for removal', { type });
      return {
        success: false,
        errors: [error]
      };
    }

    if (removed) {
      log.info('Discount configuration removed', { id: discountId, type });
      return {
        success: true,
        removed: true
      };
    } else {
      log.warn('Discount configuration not found for removal', { id: discountId, type });
      return {
        success: false,
        errors: [`Discount with ID '${discountId}' not found`]
      };
    }
  } catch (error) {
    log.error('Error removing discount configuration', { error: error.message, discountId, type });
    return {
      success: false,
      errors: [error.message]
    };
  }
};

/**
 * Check if a wallet has free access
 * @param {string} walletAddress - The wallet address to check
 * @param {string} serviceType - The service type
 * @param {Object} providers - Object with chainId as key and provider as value
 * @returns {Promise<boolean>} - Whether wallet has free access
 */
export const hasFreeAccess = async (walletAddress, serviceType, providers) => {
  const discount = await calculateDiscount(walletAddress, serviceType, providers);
  return discount.isFree;
};

/**
 * Get discount information for display
 * @param {string} walletAddress - The wallet address to check
 * @param {string} serviceType - The service type
 * @param {Object} providers - Object with chainId as key and provider as value
 * @returns {Promise<Object>} - Formatted discount information for UI
 */
export const getDiscountInfo = async (walletAddress, serviceType, providers) => {
  const discount = await calculateDiscount(walletAddress, serviceType, providers);
  
  if (!discount.hasDiscount) {
    return {
      message: 'No discounts available',
      type: 'none'
    };
  }
  
  if (discount.isFree) {
    return {
      message: 'Free access granted!',
      type: 'free',
      appliedDiscounts: discount.appliedDiscounts
    };
  }
  
  return {
    message: `${discount.discountPercentage}% discount applied`,
    type: 'percentage',
    discountPercentage: discount.discountPercentage,
    appliedDiscounts: discount.appliedDiscounts
  };
};

/**
 * Get cache statistics
 * @returns {Object} - Cache statistics
 */
export const getCacheStats = () => {
  return {
    size: cache.size,
    maxSize: 1000, // Configurable limit
    ttl: CACHE_TTL,
    entries: Array.from(cache.keys())
  };
};

/**
 * Clear cache
 * @param {string} pattern - Optional pattern to clear specific entries
 * @returns {Object} - Result of the operation
 */
export const clearCache = (pattern = null) => {
  try {
    if (pattern) {
      const regex = new RegExp(pattern);
      let cleared = 0;
      for (const key of cache.keys()) {
        if (regex.test(key)) {
          cache.delete(key);
          cleared++;
        }
      }
      log.info('Cache cleared with pattern', { pattern, cleared });
      return {
        success: true,
        cleared,
        pattern
      };
    } else {
      const size = cache.size;
      cache.clear();
      log.info('Cache cleared completely', { cleared: size });
      return {
        success: true,
        cleared: size
      };
    }
  } catch (error) {
    log.error('Error clearing cache', { error: error.message, pattern });
    return {
      success: false,
      errors: [error.message]
    };
  }
};

/**
 * Get rate limit statistics
 * @returns {Object} - Rate limit statistics
 */
export const getRateLimitStats = () => {
  return {
    activeWallets: rateLimitMap.size,
    windowMs: RATE_LIMIT_WINDOW,
    maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
    wallets: Array.from(rateLimitMap.keys())
  };
};

/**
 * Reset rate limit for a specific wallet
 * @param {string} walletAddress - The wallet address to reset
 * @returns {Object} - Result of the operation
 */
export const resetRateLimit = (walletAddress) => {
  try {
    const key = walletAddress.toLowerCase();
    const hadLimit = rateLimitMap.has(key);
    rateLimitMap.delete(key);
    
    log.info('Rate limit reset', { walletAddress, hadLimit });
    return {
      success: true,
      hadLimit,
      walletAddress
    };
  } catch (error) {
    log.error('Error resetting rate limit', { error: error.message, walletAddress });
    return {
      success: false,
      errors: [error.message]
    };
  }
};

/**
 * Validate all discount configurations
 * @returns {Object} - Validation results
 */
export const validateAllDiscounts = () => {
  const allDiscounts = [
    ...DISCOUNT_CONFIG.nftDiscounts,
    ...DISCOUNT_CONFIG.tokenDiscounts,
    ...DISCOUNT_CONFIG.solanaDiscounts
  ];
  
  const results = {
    total: allDiscounts.length,
    valid: 0,
    invalid: 0,
    errors: []
  };
  
  for (const discount of allDiscounts) {
    const validation = validateDiscountConfig(discount);
    if (validation.isValid) {
      results.valid++;
    } else {
      results.invalid++;
      results.errors.push({
        id: discount.id,
        errors: validation.errors
      });
    }
  }
  
  log.info('Discount validation completed', results);
  return results;
};
