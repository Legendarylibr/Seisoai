// Performance optimization utilities

// Cache configuration
const cacheConfig = {
  // Redis cache settings
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD,
    db: 0,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  },
  
  // Cache TTL settings (in seconds)
  ttl: {
    userData: 300,        // 5 minutes
    nftData: 600,         // 10 minutes
    tokenData: 300,       // 5 minutes
    generationHistory: 60, // 1 minute
    paymentHistory: 1800,  // 30 minutes
    metrics: 30           // 30 seconds
  }
};

// Database connection pooling
const dbPoolConfig = {
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0,
  bufferCommands: false
};

// Request optimization
const requestOptimization = {
  // Compression settings
  compression: {
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return true;
    }
  },
  
  // Request timeout
  timeout: 30000, // 30 seconds
  
  // Keep-alive settings
  keepAlive: {
    enabled: true,
    timeout: 5000,
    maxRequests: 1000
  }
};

// Memory optimization
const memoryOptimization = {
  // Garbage collection settings
  gc: {
    enabled: true,
    interval: 60000, // 1 minute
    threshold: 0.8   // Trigger GC when memory usage > 80%
  },
  
  // Memory limits
  limits: {
    maxOldSpaceSize: 1024, // 1GB
    maxNewSpaceSize: 128   // 128MB
  }
};

// Image optimization
const imageOptimization = {
  // Supported formats
  formats: ['jpeg', 'png', 'webp'],
  
  // Quality settings
  quality: {
    jpeg: 85,
    png: 90,
    webp: 80
  },
  
  // Size limits
  limits: {
    maxWidth: 2048,
    maxHeight: 2048,
    maxFileSize: 10 * 1024 * 1024 // 10MB
  },
  
  // Caching
  cache: {
    enabled: true,
    ttl: 3600, // 1 hour
    maxSize: 100 // Max 100 images in cache
  }
};

// API response optimization
const responseOptimization = {
  // Pagination defaults
  pagination: {
    defaultLimit: 20,
    maxLimit: 100,
    defaultPage: 1
  },
  
  // Response compression
  compression: {
    enabled: true,
    level: 6,
    threshold: 1024
  },
  
  // Response caching
  caching: {
    enabled: true,
    ttl: 300, // 5 minutes
    vary: ['Accept-Encoding', 'Authorization']
  }
};

// Database query optimization
const queryOptimization = {
  // Index hints
  indexes: {
    users: ['walletAddress', 'createdAt', 'lastActive'],
    gallery: ['walletAddress', 'timestamp'],
    payments: ['walletAddress', 'timestamp', 'txHash'],
    metrics: ['timestamp', 'endpoint', 'statusCode']
  },
  
  // Query limits
  limits: {
    maxResults: 1000,
    defaultLimit: 20,
    maxAggregationPipeline: 10
  },
  
  // Query timeout
  timeout: 10000 // 10 seconds
};

// Monitoring and metrics
const performanceMonitoring = {
  // Metrics collection
  metrics: {
    enabled: true,
    interval: 5000, // 5 seconds
    retention: 86400 // 24 hours
  },
  
  // Performance thresholds
  thresholds: {
    responseTime: 1000,    // 1 second
    memoryUsage: 0.8,      // 80%
    cpuUsage: 0.8,         // 80%
    errorRate: 0.05        // 5%
  },
  
  // Alerting
  alerts: {
    enabled: true,
    channels: ['email', 'slack', 'webhook']
  }
};

// CDN optimization
const cdnOptimization = {
  // Static assets
  static: {
    enabled: true,
    baseUrl: process.env.CDN_URL,
    versioning: true,
    compression: true
  },
  
  // Image delivery
  images: {
    enabled: true,
    formats: ['webp', 'avif'],
    quality: 80,
    lazy: true
  },
  
  // Caching headers
  headers: {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': true,
    'Last-Modified': true
  }
};

// Bundle optimization
const bundleOptimization = {
  // Code splitting
  splitting: {
    enabled: true,
    chunks: {
      vendor: ['react', 'react-dom'],
      ethers: ['ethers'],
      ui: ['lucide-react']
    }
  },
  
  // Tree shaking
  treeShaking: {
    enabled: true,
    sideEffects: false
  },
  
  // Minification
  minification: {
    enabled: true,
    terser: {
      compress: true,
      mangle: true,
      sourceMap: false
    }
  }
};

// Export all configurations
module.exports = {
  cacheConfig,
  dbPoolConfig,
  requestOptimization,
  memoryOptimization,
  imageOptimization,
  responseOptimization,
  queryOptimization,
  performanceMonitoring,
  cdnOptimization,
  bundleOptimization
};
