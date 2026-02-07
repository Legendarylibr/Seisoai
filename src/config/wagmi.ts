import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
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
  // Base is first = default chain
  chains: [base, mainnet, polygon, optimism, arbitrum, bsc],
  // Explicit transports for each chain (uses public RPC endpoints)
  // The wallet will use its own RPC for transactions, these are for reading state
  transports: {
    [base.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [optimism.id]: http(),
    [arbitrum.id]: http(),
    [bsc.id]: http(),
  },
});

// Re-export for convenience
export { WALLETCONNECT_PROJECT_ID };
