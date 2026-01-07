import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'buffer',
      // Pre-bundle Solana to avoid circular dependency issues
      '@solana/web3.js',
      '@solana/spl-token',
      '@solana/buffer-layout',
      '@solana/buffer-layout-utils'
    ],
    exclude: [
      '@walletconnect/ethereum-provider'
    ],
    // Force re-optimization when dependencies change
    force: false,
    esbuildOptions: {
      // Define Buffer globally for esbuild optimization
      define: {
        global: 'globalThis',
      },
      // Ensure proper handling of Solana dependencies
      target: 'es2020',
      // Keep function names to prevent minification issues with dynamic imports
      keepNames: true,
    }
  },
  resolve: {
    alias: {
      // Add Buffer polyfill for Solana
      buffer: 'buffer/'
    }
  },
  define: {
    // Make Buffer available globally for Solana
    global: 'globalThis',
  },
  build: {
    // Production build optimizations
    target: 'es2020',
    // Use terser for minification - esbuild breaks Solana spl-token internal references
    minify: 'terser',
    terserOptions: {
      // Keep function names and class names to prevent Solana library breakage
      keep_fnames: true,
      keep_classnames: true,
      mangle: {
        // Don't mangle properties that might break library internals
        reserved: ['createTransferInstruction', 'createAssociatedTokenAccountInstruction', 'getAssociatedTokenAddressSync'],
      },
    },
    sourcemap: false, // Disable sourcemaps in production for smaller bundles
    cssCodeSplit: true, // Enable CSS code splitting
    cssMinify: true, // Minify CSS
    reportCompressedSize: false, // Faster builds by skipping gzip size report
    chunkSizeWarningLimit: 1000, // Increase limit for vendor chunks
    // Keep function names for Solana SPL token functions - prevents minification issues
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    
    rollupOptions: {
      output: {
        // PERFORMANCE: Better chunking strategy
        manualChunks: (id: string) => {
          // React core - loaded immediately
          if (id.includes('react-dom') || id.includes('react/')) {
            return 'vendor-react';
          }
          // UI icons - loaded immediately but separate chunk
          if (id.includes('lucide-react')) {
            return 'vendor-ui';
          }
          // WalletConnect - lazy loaded when user clicks wallet connect
          if (id.includes('@walletconnect') || id.includes('w3m-modal') || id.includes('@web3modal')) {
            return 'vendor-walletconnect';
          }
          // Ethers - lazy loaded with payment modal
          if (id.includes('ethers')) {
            return 'vendor-ethers';
          }
          // Solana and its dependencies - keep together to avoid circular dep issues
          // Include common Solana sub-dependencies in the same chunk
          if (id.includes('@solana') || 
              id.includes('rpc-websockets') || 
              id.includes('superstruct') ||
              id.includes('bn.js') ||
              id.includes('borsh') ||
              id.includes('bs58') ||
              id.includes('jayson') ||
              id.includes('@noble/curves') ||
              id.includes('@noble/hashes')) {
            return 'vendor-solana';
          }
          // Stripe - lazy loaded with payment
          if (id.includes('@stripe') || id.includes('stripe')) {
            return 'vendor-stripe';
          }
          // Other large dependencies
          if (id.includes('node_modules')) {
            // Group smaller deps together
            return 'vendor-misc';
          }
        },
        // Compact chunk file names
        chunkFileNames: 'assets/[name]-[hash:8].js',
        entryFileNames: 'assets/[name]-[hash:8].js',
        assetFileNames: 'assets/[name]-[hash:8].[ext]',
      },
      // Tree-shake for smaller bundles but preserve Solana library internals
      treeshake: {
        moduleSideEffects: (id) => {
          // Don't tree-shake Solana libraries - they have complex internal dependencies
          if (id.includes('@solana')) return true;
          if (id.includes('spl-token')) return true;
          return true; // Keep side effects for all modules
        },
        // Don't assume pure module calls - Solana libs have side effects
        tryCatchDeoptimization: true,
      },
    },
    // CDN configuration for production
    assetsDir: 'assets',
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb as base64
  },
  // CDN configuration
  base: process.env.NODE_ENV === 'production' 
    ? process.env.VITE_CDN_URL || '/' 
    : '/',
  // Server configuration for development
  server: {
    port: 5173,
    host: true,
    cors: true,
    strictPort: false, // Allow Vite to find an available port
    // Headers required for SharedArrayBuffer (used by FFmpeg.wasm for audio extraction)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Proxy error:', err);
            // Try alternative ports if the default fails
            const alternativePorts = [3001, 3002, 3003, 3004, 3005];
            for (const port of alternativePorts) {
              try {
                (proxy as { target?: string }).target = `http://localhost:${port}`;
                break;
              } catch {
                continue;
              }
            }
          });
        }
      }
    }
  },
  // Preview configuration for production testing
  preview: {
    port: 4173,
    host: true,
    cors: true,
    // Headers required for SharedArrayBuffer (used by FFmpeg.wasm for audio extraction)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Enable build caching
  cacheDir: 'node_modules/.vite',
});
