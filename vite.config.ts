import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Get Stripe key from either process.env (Railway) or loaded env file
  const stripeKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || env.VITE_STRIPE_PUBLISHABLE_KEY || '';
  
  console.log(`[vite.config] VITE_STRIPE_PUBLISHABLE_KEY is ${stripeKey ? 'SET' : 'NOT SET'} (length: ${stripeKey.length})`);
  
  return {
    plugins: [react()],
    
    // Buffer polyfill for Solana
    resolve: {
      alias: { buffer: 'buffer/' }
    },
    
    define: {
      global: 'globalThis',
      // Explicitly define Stripe key to ensure it's available at build time
      'import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY': JSON.stringify(stripeKey),
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
      exclude: ['@walletconnect/ethereum-provider'],
      esbuildOptions: {
        target: 'es2020',
      },
    },
    
    build: {
      target: 'es2020',
      // Use esbuild instead of terser - better handles CJS/ESM interop
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000,
      commonjsOptions: {
        // Critical: transform CommonJS modules properly to avoid require$$X errors
        transformMixedEsModules: true,
        // Include these patterns for proper CJS handling
        include: [/node_modules/],
      },
      rollupOptions: {
        output: {
          // Disable manual chunking for Solana - let Rollup handle it to avoid circular dep issues
          manualChunks: (id: string) => {
            if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
            if (id.includes('lucide-react')) return 'vendor-ui';
            if (id.includes('@walletconnect') || id.includes('@web3modal')) return 'vendor-walletconnect';
            if (id.includes('ethers')) return 'vendor-ethers';
            if (id.includes('@stripe')) return 'vendor-stripe';
            
            // Let Solana deps be bundled naturally - don't force them into a single chunk
            // The circular dependency issue was caused by forcing them together incorrectly
            if (id.includes('@solana')) {
              return 'vendor-solana';
            }
            
            // Don't chunk other node_modules - let Rollup handle dependency order
            return undefined;
          },
          chunkFileNames: 'assets/[name]-[hash:8].js',
          entryFileNames: 'assets/[name]-[hash:8].js',
          assetFileNames: 'assets/[name]-[hash:8].[ext]',
        },
      },
    },
    
    server: {
      port: 5173,
      host: true,
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
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
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
  };
});
