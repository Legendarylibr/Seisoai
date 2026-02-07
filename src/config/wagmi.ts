import '@rainbow-me/rainbowkit/styles.css';
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import { 
  baseAccount,
  injectedWallet,
  metaMaskWallet,
  rainbowWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';
import { createConfig, http } from 'wagmi';
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

// Detect if we're in a wallet's in-app browser (Base app, Coinbase Wallet, etc.)
const isInWalletBrowser = typeof window !== 'undefined' && 
  typeof window.ethereum !== 'undefined' &&
  (window.ethereum.isCoinbaseWallet || 
   window.ethereum.isCoinbaseBrowser ||
   // Base app uses Coinbase Wallet SDK internally
   (window.ethereum.providers?.some((p: { isCoinbaseWallet?: boolean }) => p.isCoinbaseWallet)));

// Chains configuration - Base is first = default chain
const chains = [base, mainnet, polygon, optimism, arbitrum, bsc] as const;

// Custom wallet configuration to prioritize Base Account and injected wallet
// This ensures the Base mobile app's in-app browser works properly
const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [
        // injectedWallet first - auto-detects Base app's in-app browser
        injectedWallet,
        // Base Account (Coinbase Smart Wallet) - works on web
        baseAccount,
      ],
    },
    {
      groupName: 'Popular',
      wallets: [
        metaMaskWallet,
        rainbowWallet,
        walletConnectWallet,
      ],
    },
  ],
  {
    appName: 'Seiso AI',
    projectId: WALLETCONNECT_PROJECT_ID,
  }
);

// Create wagmi config with custom connectors for better Base mobile app support
export const wagmiConfig = createConfig({
  connectors,
  chains,
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
export { WALLETCONNECT_PROJECT_ID, isInWalletBrowser };
