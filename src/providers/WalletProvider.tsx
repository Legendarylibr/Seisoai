import React, { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig, isInWalletBrowser } from '../config/wagmi';

// Create a client for react-query
const queryClient = new QueryClient();

interface WalletProviderProps {
  children: ReactNode;
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  // When in a wallet's in-app browser (like Base app), we should reconnect on mount
  // because the wallet is already injected and ready to use
  // On regular browsers, we require fresh connection each visit for security
  const shouldReconnect = isInWalletBrowser;

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount={shouldReconnect}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#000080', // Win95 blue
            accentColorForeground: 'white',
            borderRadius: 'none',
            fontStack: 'system',
          })}
          modalSize="compact"
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default WalletProvider;
