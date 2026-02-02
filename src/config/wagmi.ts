import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { 
  mainnet, 
  polygon, 
  optimism, 
  arbitrum, 
  base,
  bsc 
} from 'wagmi/chains';

// WalletConnect Project ID - Get your own at https://cloud.walletconnect.com/
// This is a public demo ID that may have rate limits
const WALLETCONNECT_PROJECT_ID = '5bbba194489bd3a0a98d143c57a90575';

// Use getDefaultConfig which automatically sets up all popular wallets
// including Coinbase Wallet with proper SDK integration
export const wagmiConfig = getDefaultConfig({
  appName: 'Seiso AI',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [base, mainnet, polygon, optimism, arbitrum, bsc],
});

// Re-export for convenience
export { WALLETCONNECT_PROJECT_ID };
