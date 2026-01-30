import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  mainnet,
  polygon,
  optimism,
  arbitrum,
  base,
  bsc,
  avalanche,
  zora,
} from 'wagmi/chains';

// WalletConnect Project ID - same as existing
const WALLETCONNECT_PROJECT_ID = '8e0a0c75ac8c8f6d3ef36a26f2f8f64d';

export const wagmiConfig = getDefaultConfig({
  appName: 'Seiso AI',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [
    mainnet,
    polygon,
    optimism,
    arbitrum,
    base,
    bsc,
    avalanche,
    zora,
  ],
  ssr: false,
});

// Re-export chains for use elsewhere
export const supportedChains = [
  mainnet,
  polygon,
  optimism,
  arbitrum,
  base,
  bsc,
  avalanche,
  zora,
];
