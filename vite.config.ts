import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      'buffer'
      // PERFORMANCE: ethers and WalletConnect are lazy-loaded, don't pre-bundle
    ],
    exclude: [
      '@walletconnect/ethereum-provider'
    ],
    esbuildOptions: {
      // Define Buffer globally for esbuild optimization
      define: {
        global: 'globalThis',
      },
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
    target: 'esnext',
    minify: 'terser',
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      output: {
        // PERFORMANCE: Better chunking strategy
        manualChunks: (id: string) => {
          // React core - loaded immediately
          if (id.includes('react-dom') || id.includes('react/')) {
            return 'vendor';
          }
          // UI icons - loaded immediately but separate chunk
          if (id.includes('lucide-react')) {
            return 'ui';
          }
          // WalletConnect - lazy loaded when user clicks wallet connect
          if (id.includes('@walletconnect') || id.includes('w3m-modal') || id.includes('@web3modal')) {
            return 'walletconnect';
          }
          // Ethers - lazy loaded with payment modal
          if (id.includes('ethers')) {
            return 'ethers';
          }
          // Solana - lazy loaded with payment modal
          if (id.includes('@solana')) {
            return 'solana';
          }
        }
      }
    },
    // CDN configuration for production
    assetsDir: 'assets',
    assetsInlineLimit: 4096, // Inline assets smaller than 4kb
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
    cors: true
  }
});

