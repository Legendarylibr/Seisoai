// CRITICAL: Buffer polyfill must be imported FIRST before anything else
// This replaces the minimal shim from index.html with the full implementation
import { Buffer } from 'buffer';
(window as Window & { Buffer: typeof Buffer }).Buffer = Buffer;
(globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;

import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from './config/wagmiConfig';
import App from './App';
import './index.css';
import '@rainbow-me/rainbowkit/styles.css';

// Create a client for react-query
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#000080',
            accentColorForeground: 'white',
            borderRadius: 'none',
            fontStack: 'system',
          })}
          modalSize="compact"
        >
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);





