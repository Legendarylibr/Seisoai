import React, { ReactNode } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { AlertCircle, Shield, ExternalLink, RefreshCw } from 'lucide-react';
import AuthPrompt from './AuthPrompt';

interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode | null;
}

// Token Gate Prompt Component
const TokenGatePrompt: React.FC = () => {
  const { tokenGateStatus, tokenGateConfig, refreshTokenGate, address } = useSimpleWallet();
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshTokenGate();
    setIsRefreshing(false);
  };

  // Get the DEX/marketplace URL for the token
  const getTokenUrl = () => {
    if (!tokenGateConfig) return '#';
    // Base chain - use BaseScan and Uniswap
    if (tokenGateConfig.chainId === '8453') {
      return `https://basescan.org/token/${tokenGateConfig.contractAddress}`;
    }
    return `https://etherscan.io/token/${tokenGateConfig.contractAddress}`;
  };

  const getDexUrl = () => {
    if (!tokenGateConfig) return '#';
    // Base chain - use Uniswap on Base
    if (tokenGateConfig.chainId === '8453') {
      return `https://app.uniswap.org/swap?chain=base&outputCurrency=${tokenGateConfig.contractAddress}`;
    }
    return `https://app.uniswap.org/swap?outputCurrency=${tokenGateConfig.contractAddress}`;
  };

  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="max-w-md w-full">
        {/* Windows 98 style window */}
        <div style={{ 
          border: '2px solid',
          borderColor: '#dfdfdf #404040 #404040 #dfdfdf',
          backgroundColor: '#c0c0c0'
        }}>
          {/* Title bar */}
          <div style={{ 
            background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
            padding: '2px 4px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <Shield className="w-4 h-4 text-white" />
            <span style={{ 
              color: 'white', 
              fontWeight: 'bold', 
              fontSize: '11px',
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}>
              Token Gate - Access Required
            </span>
          </div>
          
          {/* Content */}
          <div style={{ padding: '16px' }}>
            <div className="text-center mb-4">
              <Shield className="w-12 h-12 mx-auto mb-3" style={{ color: '#000080' }} />
              <h3 style={{ 
                fontSize: '14px', 
                fontWeight: 'bold',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                color: '#000000',
                marginBottom: '8px'
              }}>
                Access Restricted
              </h3>
              <p style={{ 
                fontSize: '11px',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                color: '#404040'
              }}>
                This platform requires holding <strong>{tokenGateConfig?.tokenName || 'tokens'}</strong> on {tokenGateConfig?.chainName || 'Base'} to access.
              </p>
            </div>

            {/* Status box */}
            <div style={{
              border: '2px solid',
              borderColor: '#404040 #dfdfdf #dfdfdf #404040',
              backgroundColor: '#ffffff',
              padding: '12px',
              marginBottom: '12px'
            }}>
              <div style={{ 
                fontSize: '11px',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}>
                <div className="flex justify-between">
                  <span style={{ color: '#404040' }}>Your Wallet:</span>
                  <span style={{ color: '#000000', fontFamily: 'monospace', fontSize: '10px' }}>
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#404040' }}>Your Balance:</span>
                  <span style={{ color: tokenGateStatus.hasAccess ? '#008000' : '#800000', fontWeight: 'bold' }}>
                    {tokenGateStatus.balance.toLocaleString()} {tokenGateConfig?.symbol || 'tokens'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#404040' }}>Required:</span>
                  <span style={{ color: '#000000' }}>
                    {tokenGateStatus.requiredBalance} {tokenGateConfig?.symbol || 'tokens'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: '#404040' }}>Network:</span>
                  <span style={{ color: '#000080' }}>{tokenGateConfig?.chainName || 'Base'}</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <a
                href={getDexUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  backgroundColor: '#c0c0c0',
                  border: '2px solid',
                  borderColor: '#dfdfdf #404040 #404040 #dfdfdf',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  color: '#000000'
                }}
              >
                <ExternalLink className="w-3 h-3" />
                Buy {tokenGateConfig?.symbol || 'Tokens'} on Uniswap
              </a>
              
              <a
                href={getTokenUrl()}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  backgroundColor: '#c0c0c0',
                  border: '2px solid',
                  borderColor: '#dfdfdf #404040 #404040 #dfdfdf',
                  cursor: 'pointer',
                  textDecoration: 'none',
                  color: '#000000'
                }}
              >
                <ExternalLink className="w-3 h-3" />
                View Contract on BaseScan
              </a>

              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '11px',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  backgroundColor: '#c0c0c0',
                  border: '2px solid',
                  borderColor: '#dfdfdf #404040 #404040 #dfdfdf',
                  cursor: isRefreshing ? 'wait' : 'pointer',
                  opacity: isRefreshing ? 0.7 : 1
                }}
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Checking...' : 'Refresh Balance'}
              </button>
            </div>

            {/* Contract info */}
            <div style={{ 
              marginTop: '12px',
              padding: '8px',
              backgroundColor: '#ffffcc',
              border: '1px solid #cccc00',
              fontSize: '10px',
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              color: '#666600'
            }}>
              <strong>Contract:</strong> {tokenGateConfig?.contractAddress?.slice(0, 10)}...{tokenGateConfig?.contractAddress?.slice(-8)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const AuthGuard: React.FC<AuthGuardProps> = ({ children, fallback = null }) => {
  const walletContext = useSimpleWallet();
  
  // Wallet-only authentication
  const isConnected = walletContext.isConnected;
  const address = walletContext.address;
  const isLoading = walletContext.isLoading;
  const error = walletContext.error;
  const tokenGateStatus = walletContext.tokenGateStatus;
  const tokenGateConfig = walletContext.tokenGateConfig;

  // PERFORMANCE: Only show loading spinner if it's been loading for a while
  // This prevents flash of loading state for fast connections
  // For very fast loads (<100ms), skip the spinner entirely
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center" style={{ animationDelay: '100ms', animation: 'fadeIn 0.15s ease-out 100ms forwards', opacity: 0 }}>
          <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-2" style={{ borderColor: '#000080', borderTopColor: 'transparent' }}></div>
          <p className="text-[11px]" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-red-400 mb-2">Connection Error</h3>
          <p className="text-gray-400 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="btn-primary"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Check if wallet is connected
  if (!isConnected || !address) {
    // Show wallet connection prompt when not authenticated
    return fallback || <AuthPrompt />;
  }

  // Check token gate - only if enabled
  if (tokenGateConfig?.enabled) {
    // Show loading while checking token gate
    if (tokenGateStatus.isLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <div className="text-center">
            <Shield className="w-8 h-8 mx-auto mb-2 animate-pulse" style={{ color: '#000080' }} />
            <p className="text-[11px]" style={{ color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Verifying token holdings...
            </p>
          </div>
        </div>
      );
    }

    // Show token gate prompt if no access
    if (!tokenGateStatus.hasAccess) {
      return <TokenGatePrompt />;
    }
  }

  // User is authenticated and has token gate access
  return <div className="h-full">{children}</div>;
};

export default AuthGuard;





