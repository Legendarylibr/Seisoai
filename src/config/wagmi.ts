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
const WALLETCONNECT_PROJECT_ID = '8e0a0c75ac8c8f6d3ef36a26f2f8f64d';

// Use getDefaultConfig which automatically sets up all popular wallets
// including Coinbase Wallet with proper SDK integration
export const wagmiConfig = getDefaultConfig({
  appName: 'Seiso AI',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [base, mainnet, polygon, optimism, arbitrum, bsc],
});

// Re-export for convenience
export { WALLETCONNECT_PROJECT_ID };
