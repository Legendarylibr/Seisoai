import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  // Buffer polyfill for Solana
  resolve: {
    alias: { buffer: 'buffer/' }
  },
  define: {
    global: 'globalThis',
  },
  
  optimizeDeps: {
    include: ['buffer', '@solana/web3.js', '@solana/spl-token'],
    exclude: ['@walletconnect/ethereum-provider'],
  },
  
  build: {
    target: 'es2020',
    minify: 'terser',
    terserOptions: {
      mangle: false,
      keep_fnames: true,
      keep_classnames: true,
    },
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          if (id.includes('lucide-react')) return 'vendor-ui';
          if (id.includes('@walletconnect') || id.includes('@web3modal')) return 'vendor-walletconnect';
          if (id.includes('ethers')) return 'vendor-ethers';
          if (id.includes('@stripe')) return 'vendor-stripe';
          
          // Solana + all deps in one chunk to avoid circular import issues
          if (id.includes('@solana') || 
              id.includes('rpc-websockets') || 
              id.includes('superstruct') ||
              id.includes('bn.js') ||
              id.includes('borsh') ||
              id.includes('bs58') ||
              id.includes('base-x') ||
              id.includes('safe-buffer') ||
              id.includes('buffer/') ||
              id.includes('base64-js') ||
              id.includes('ieee754') ||
              id.includes('jayson') ||
              id.includes('@noble/curves') ||
              id.includes('@noble/hashes')) {
            return 'vendor-solana';
          }
          
          if (id.includes('node_modules')) return 'vendor-misc';
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
});
