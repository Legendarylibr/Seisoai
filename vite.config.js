import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['ethers']
  },
  resolve: {
    alias: {
      // Ensure ethers resolves correctly
      'ethers': 'ethers'
    }
  },
  build: {
    // Production build optimizations
    target: 'esnext',
    minify: 'terser',
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          ethers: ['ethers'],
          ui: ['lucide-react']
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
        configure: (proxy, options) => {
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error:', err);
            // Try alternative ports if the default fails
            const alternativePorts = [3001, 3002, 3003, 3004, 3005];
            for (const port of alternativePorts) {
              try {
                proxy.target = `http://localhost:${port}`;
                break;
              } catch (e) {
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
})