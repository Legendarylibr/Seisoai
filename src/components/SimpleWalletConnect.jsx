import React, { useState } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut, Coins, RefreshCw, X, ExternalLink } from 'lucide-react';

// Component to render error messages with install links
// Format: "Message text|||Link Text|||URL" or just plain text
const ErrorMessageWithLink = ({ message }) => {
  if (!message) return null;
  
  // Check for our special format: TEXT|||LINK_TEXT|||URL
  if (message.includes('|||')) {
    const parts = message.split('|||');
    if (parts.length === 3) {
      const [text, linkText, url] = parts;
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span>{text}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1 rounded font-bold transition-all hover:opacity-80 hover:scale-105"
            style={{ 
              background: 'linear-gradient(to bottom, #3b82f6, #2563eb)',
              color: '#ffffff',
              textDecoration: 'none',
              fontSize: '0.9em',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
              border: '1px solid #1d4ed8'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {linkText}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </span>
      );
    }
  }
  
  // Plain message without link
  return <span>{message}</span>;
};

const WalletOption = ({ name, icon, description, onClick, isConnecting, disabled }) => (
  <button
    onClick={onClick}
    disabled={isConnecting || disabled}
    className="w-full p-3 rounded-lg transition-all duration-200 flex items-center gap-3 text-left hover:scale-102 mb-2"
    style={{
      background: 'linear-gradient(to bottom, #f8f8f8, #e8e8e8)',
      border: '2px outset #e8e8e8',
      boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer'
    }}
  >
    <div className="text-2xl">{icon}</div>
    <div className="flex-1">
      <div className="font-semibold text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
        {name}
      </div>
      {isConnecting ? (
        <div className="text-xs" style={{ color: '#666' }}>Connecting...</div>
      ) : description ? (
        <div className="text-xs" style={{ color: '#888' }}>{description}</div>
      ) : null}
    </div>
    {isConnecting && (
      <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin"></div>
    )}
  </button>
);

const WalletModal = ({ isOpen, onClose, onSelectWallet, isConnecting, connectingWallet, error }) => {
  if (!isOpen) return null;

  const wallets = [
    { id: 'metamask', name: 'MetaMask', icon: '🦊', type: 'evm' },
    { id: 'walletconnect', name: 'WalletConnect', icon: '🔗', type: 'evm', description: 'Scan with mobile wallet' },
    { id: 'coinbase', name: 'Coinbase Wallet', icon: '🔵', type: 'evm' },
    { id: 'rabby', name: 'Rabby Wallet', icon: '🐰', type: 'evm' },
    { id: 'phantom-evm', name: 'Phantom', icon: '👻', type: 'evm', description: 'Ethereum & EVM' },
    { id: 'rainbow', name: 'Rainbow Wallet', icon: '🌈', type: 'evm' },
    { id: 'trust', name: 'Trust Wallet', icon: '🛡️', type: 'evm' },
    { id: 'okx', name: 'OKX Wallet', icon: '⭕', type: 'evm' },
    { id: 'bitget', name: 'Bitget Wallet', icon: '💼', type: 'evm' },
    { id: 'brave', name: 'Brave Wallet', icon: '🦁', type: 'evm' },
    { id: 'frame', name: 'Frame', icon: '🖼️', type: 'evm' },
    { id: 'phantom', name: 'Phantom', icon: '👻', type: 'solana', description: 'Solana' },
    { id: 'solflare', name: 'Solflare', icon: '☀️', type: 'solana' },
  ];

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ 
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)'
      }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md rounded-lg shadow-2xl overflow-hidden"
        style={{
          background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
          border: '3px outset #f0f0f0',
          boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 0.9), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 10px 40px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between p-4 border-b-2"
          style={{ 
            background: 'linear-gradient(to bottom, #e8e8e8, #d8d8d8)',
            borderColor: '#c0c0c0'
          }}
        >
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5" style={{ color: '#000000' }} />
            <h2 className="text-lg font-bold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              Connect Wallet
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={isConnecting}
            className="p-1 rounded transition-all duration-200"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)',
              opacity: isConnecting ? 0.5 : 1
            }}
          >
            <X className="w-4 h-4" style={{ color: '#000000' }} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div 
            className="mx-4 mt-4 p-3 rounded text-sm"
            style={{
              background: 'linear-gradient(to bottom, #fee2e2, #fecaca)',
              border: '2px inset #fca5a5',
              color: '#991b1b'
            }}
          >
            <ErrorMessageWithLink message={error} />
          </div>
        )}

        {/* Wallet Options */}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            {/* EVM Wallets */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold mb-2 px-1" style={{ color: '#666', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                ETHEREUM & EVM CHAINS
              </h3>
              {wallets.filter(w => w.type === 'evm').map(wallet => (
                <WalletOption
                  key={wallet.id}
                  name={wallet.name}
                  icon={wallet.icon}
                  description={wallet.description}
                  onClick={() => onSelectWallet(wallet.id)}
                  isConnecting={isConnecting && connectingWallet === wallet.id}
                  disabled={isConnecting && connectingWallet !== wallet.id}
                />
              ))}
            </div>

            {/* Solana Wallets */}
            <div>
              <h3 className="text-xs font-semibold mb-2 px-1" style={{ color: '#666', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                SOLANA
              </h3>
              {wallets.filter(w => w.type === 'solana').map(wallet => (
                <WalletOption
                  key={wallet.id}
                  name={wallet.name}
                  icon={wallet.icon}
                  description={wallet.description}
                  onClick={() => onSelectWallet(wallet.id)}
                  isConnecting={isConnecting && connectingWallet === wallet.id}
                  disabled={isConnecting && connectingWallet !== wallet.id}
                />
              ))}
            </div>
          </div>

          {/* Info */}
          <div 
            className="mt-4 p-3 rounded text-xs"
            style={{
              background: 'linear-gradient(to bottom, #fff8dc, #ffeaa7)',
              border: '2px inset #e0e0e0',
              color: '#666'
            }}
          >
            <p className="font-semibold mb-1" style={{ color: '#000000' }}>💡 Tip</p>
            <p>Select the wallet you have installed. Use <strong>WalletConnect</strong> to connect mobile wallets by scanning a QR code.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Wallet names and icons mapping
const WALLET_INFO = {
  metamask: { name: 'MetaMask', icon: '🦊' },
  walletconnect: { name: 'WalletConnect', icon: '🔗' },
  coinbase: { name: 'Coinbase', icon: '🔵' },
  rabby: { name: 'Rabby', icon: '🐰' },
  'phantom-evm': { name: 'Phantom', icon: '👻' },
  rainbow: { name: 'Rainbow', icon: '🌈' },
  trust: { name: 'Trust', icon: '🛡️' },
  okx: { name: 'OKX', icon: '⭕' },
  bitget: { name: 'Bitget', icon: '💼' },
  brave: { name: 'Brave', icon: '🦁' },
  frame: { name: 'Frame', icon: '🖼️' },
  phantom: { name: 'Phantom (SOL)', icon: '👻' },
  solflare: { name: 'Solflare', icon: '☀️' },
};

const SimpleWalletConnect = () => {
  const {
    isConnected,
    address,
    credits,
    isLoading,
    error,
    connectWallet,
    disconnectWallet,
    fetchCredits,
    isNFTHolder,
    connectedWalletId
  } = useSimpleWallet();

  const [showModal, setShowModal] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(null);
  const [modalError, setModalError] = useState(null);

  const formatAddress = (addr) => {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleSelectWallet = async (walletId) => {
    setConnectingWallet(walletId);
    setModalError(null);
    try {
      await connectWallet(walletId);
      setShowModal(false);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setConnectingWallet(null);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setModalError(null);
    setConnectingWallet(null);
  };

  const connectedWalletInfo = connectedWalletId ? WALLET_INFO[connectedWalletId] : null;

  if (!isConnected) {
    return (
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="p-1 rounded" style={{ 
            background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
            border: '2px outset #e0e0e0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}>
            <Wallet className="w-3 h-3" style={{ color: '#000000' }} />
          </div>
          <h3 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Connect Wallet</h3>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          disabled={isLoading}
          className="w-full btn-primary flex items-center justify-center gap-1.5 py-1.5 text-xs"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </>
          )}
        </button>

        {error && (
          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400 slide-up">
            <ErrorMessageWithLink message={error} />
          </div>
        )}

        <WalletModal
          isOpen={showModal}
          onClose={handleCloseModal}
          onSelectWallet={handleSelectWallet}
          isConnecting={isLoading}
          connectingWallet={connectingWallet}
          error={modalError}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded text-lg" style={{ 
            background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
            border: '2px outset #e0e0e0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}>
            {connectedWalletInfo?.icon || <Wallet className="w-3 h-3" style={{ color: '#000000' }} />}
          </div>
          <div>
            <h3 className="text-xs font-semibold flex items-center gap-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              {connectedWalletInfo?.name || 'Connected'}
            </h3>
            <p className="text-xs font-mono" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>{formatAddress(address)}</p>
          </div>
        </div>
        <button
          onClick={disconnectWallet}
          className="p-1 rounded transition-all duration-300"
          style={{
            background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
            border: '2px outset #f0f0f0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}
          title="Disconnect"
        >
          <LogOut className="w-3 h-3" style={{ color: '#000000' }} />
        </button>
      </div>

      <div className="space-y-1 pt-1 border-t" style={{ borderColor: '#d0d0d0' }}>
        <div className="flex items-center justify-between p-1 rounded" style={{ 
          background: 'linear-gradient(to bottom, #f5f5f5, #eeeeee)',
          border: '1px solid #d0d0d0'
        }}>
          <div className="flex items-center gap-1">
            <Coins className="w-3 h-3" style={{ color: '#000000' }} />
            <span className="text-xs font-medium" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Credits:</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
              {isLoading ? '...' : (typeof credits === 'number' && !isNaN(credits) ? Math.max(0, Math.floor(credits)) : 0)}
            </span>
            <button
              onClick={() => fetchCredits(address)}
              className="p-0.5 rounded transition-all duration-300"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
              }}
              title="Refresh credits"
            >
              <RefreshCw className="w-3 h-3" style={{ color: '#000000' }} />
            </button>
          </div>
        </div>
        
        {/* Pricing Info */}
        <div className="text-xs p-1 rounded" style={{ 
          background: 'linear-gradient(to bottom, #f5f5f5, #eeeeee)',
          border: '1px solid #d0d0d0',
          color: '#1a1a1a'
        }}>
          <div className="flex items-center justify-between">
            <span className="text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Pricing:</span>
            <span className="font-semibold text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>${isNFTHolder ? '0.06' : '0.15'}/credit</span>
          </div>
          {isNFTHolder && (
            <div className="flex items-center gap-1 text-xs mt-1 pt-1 border-t" style={{ 
              borderColor: '#d0d0d0',
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
            }}>
              <span>✨</span>
              <span className="font-medium">NFT Holder Discount</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleWalletConnect;
