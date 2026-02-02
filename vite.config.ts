import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    
    // Buffer polyfill for Solana
    resolve: {
      alias: { buffer: 'buffer/' }
    },
    
    define: {
      global: 'globalThis',
    },
    
    optimizeDeps: {
      include: [
        'buffer', 
        '@solana/web3.js', 
        '@solana/spl-token',
        'bn.js',
        'bs58',
        'borsh',
        'superstruct',
        '@noble/curves',
        '@noble/hashes',
      ],
      exclude: [
        '@walletconnect/ethereum-provider',
        '@ffmpeg/ffmpeg',
        '@ffmpeg/util',
      ],
      esbuildOptions: {
        target: 'es2020',
      },
    },
    
    build: {
      target: 'es2020',
      // Use terser for production - better minification than esbuild
      minify: mode === 'production' ? 'terser' : 'esbuild',
      chunkSizeWarningLimit: 1000,
      // Enable source maps only in development
      sourcemap: mode !== 'production',
      // Terser options for aggressive minification
      terserOptions: mode === 'production' ? {
        compress: {
          drop_console: true,  // Remove console.log in production
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.debug', 'console.info'],
          passes: 2,  // Multiple compression passes
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,  // Remove all comments
        },
      } : undefined,
      commonjsOptions: {
        // Critical: transform CommonJS modules properly to avoid require$$X errors
        transformMixedEsModules: true,
        // Include these patterns for proper CJS handling
        include: [/node_modules/],
      },
      rollupOptions: {
        output: {
          // Optimized chunking strategy for better caching and parallel loading
          manualChunks: (id: string) => {
            // Core React - changes rarely, cache aggressively
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
            // UI components - separate chunk for better caching
            if (id.includes('lucide-react')) return 'vendor-ui';
            // Wallet connections - separate for lazy loading
            if (id.includes('@walletconnect') || id.includes('@web3modal')) return 'vendor-walletconnect';
            // Blockchain libraries - large, separate chunk
            if (id.includes('ethers')) return 'vendor-ethers';
            
            // Solana deps - separate chunk for better code splitting
            if (id.includes('@solana')) {
              return 'vendor-solana';
            }
            
            // Large media processing libraries - lazy load
            if (id.includes('@ffmpeg')) return 'vendor-media';
            
            // Don't chunk other node_modules - let Rollup handle dependency order
            return undefined;
          },
          // Optimized file naming for better CDN caching
          chunkFileNames: mode === 'production' 
            ? 'assets/[name]-[hash:12].js'  // Longer hash for better cache busting
            : 'assets/[name]-[hash:8].js',
          entryFileNames: mode === 'production'
            ? 'assets/[name]-[hash:12].js'
            : 'assets/[name]-[hash:8].js',
          assetFileNames: mode === 'production'
            ? 'assets/[name]-[hash:12].[ext]'
            : 'assets/[name]-[hash:8].[ext]',
          // Optimize chunk size for better parallel loading
          experimentalMinChunkSize: 20000,  // 20KB minimum chunk size
        },
        // Tree-shake aggressively
        treeshake: {
          moduleSideEffects: 'no-external',
          propertyReadSideEffects: false,
        },
      },
    },
    
    server: {
      port: 5173,
      host: true,
      headers: {
        // Use 'same-origin-allow-popups' to enable Coinbase Smart Wallet while maintaining security
        // This allows the Base Account SDK to open popups for wallet authentication
        // See: https://docs.base.org/smart-wallet/quickstart#cross-origin-opener-policy
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        }
      }
    },
    
    preview: {
      port: 4173,
      host: true,
      headers: {
        // Use 'same-origin-allow-popups' to enable Coinbase Smart Wallet
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        }
      }
    },
  };
});
