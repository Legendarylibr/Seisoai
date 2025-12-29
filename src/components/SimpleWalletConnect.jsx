import React, { useState, memo } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut, Coins, RefreshCw, X, ExternalLink } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';

const WALLETS = [
  { id: 'metamask', name: 'MetaMask', icon: '🦊', type: 'evm' },
  { id: 'walletconnect', name: 'WalletConnect', icon: '🔗', type: 'evm', description: 'Scan with mobile wallet' },
  { id: 'coinbase', name: 'Coinbase', icon: '🔵', type: 'evm' },
  { id: 'rabby', name: 'Rabby', icon: '🐰', type: 'evm' },
  { id: 'phantom-evm', name: 'Phantom', icon: '👻', type: 'evm', description: 'Ethereum & EVM' },
  { id: 'rainbow', name: 'Rainbow', icon: '🌈', type: 'evm' },
  { id: 'trust', name: 'Trust', icon: '🛡️', type: 'evm' },
  { id: 'okx', name: 'OKX', icon: '⭕', type: 'evm' },
  { id: 'bitget', name: 'Bitget', icon: '💼', type: 'evm' },
  { id: 'brave', name: 'Brave', icon: '🦁', type: 'evm' },
  { id: 'frame', name: 'Frame', icon: '🖼️', type: 'evm' },
  { id: 'phantom', name: 'Phantom (SOL)', icon: '👻', type: 'solana' },
  { id: 'solflare', name: 'Solflare', icon: '☀️', type: 'solana' },
];

// Win95 style button
const Win95Btn = ({ children, onClick, disabled, className = '', style = {} }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`transition-none select-none ${className}`}
    style={{
      background: WIN95.buttonFace,
      color: disabled ? WIN95.textDisabled : WIN95.text,
      border: 'none',
      boxShadow: disabled
        ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
        : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
      cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
      ...style
    }}
  >
    {children}
  </button>
);

const ErrorMessageWithLink = memo(({ message }) => {
  if (!message) return null;
  if (!message.includes('|||')) return <span>{message}</span>;
  const [text, linkText, url] = message.split('|||');
  if (!url) return <span>{message}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{text}</span>
      <a 
        href={url} 
        target="_blank" 
        rel="noopener noreferrer" 
        className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold"
        style={{
          background: WIN95.highlight,
          color: WIN95.highlightText,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
        }}
        onClick={e => e.stopPropagation()}
      >
        {linkText}<ExternalLink className="w-3 h-3" />
      </a>
    </span>
  );
});

const WalletOption = memo(({ wallet, onClick, isConnecting, disabled }) => (
  <button 
    onClick={() => onClick(wallet.id)} 
    disabled={isConnecting || disabled} 
    className="w-full p-2 flex items-center gap-3 text-left mb-1"
    style={{
      background: WIN95.buttonFace,
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
      border: 'none',
      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
    }}
    onMouseEnter={(e) => {
      if (!disabled) {
        e.currentTarget.style.background = WIN95.highlight;
        e.currentTarget.style.color = WIN95.highlightText;
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = WIN95.buttonFace;
      e.currentTarget.style.color = WIN95.text;
    }}
  >
    <div className="text-xl">{wallet.icon}</div>
    <div className="flex-1">
      <div className="font-bold text-[11px]" style={{ color: 'inherit' }}>{wallet.name}</div>
      {isConnecting ? (
        <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>Connecting...</div>
      ) : wallet.description && (
        <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>{wallet.description}</div>
      )}
    </div>
    {isConnecting && <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: WIN95.bgDark, borderTopColor: 'transparent' }} />}
  </button>
));

const WalletModal = memo(({ isOpen, onClose, onSelectWallet, isConnecting, connectingWallet, error }) => {
  if (!isOpen) return null;
  const evmWallets = WALLETS.filter(w => w.type === 'evm');
  const solanaWallets = WALLETS.filter(w => w.type === 'solana');

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md overflow-hidden"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 4px 4px 0 ${WIN95.border.darker}`
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Title bar */}
        <div 
          className="flex items-center justify-between px-2 py-1"
          style={{ 
            background: 'linear-gradient(90deg, #000080, #1084d0)',
            color: '#ffffff',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        >
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            <span className="text-[11px] font-bold">Connect Wallet</span>
          </div>
          <Win95Btn onClick={onClose} disabled={isConnecting} className="px-1.5 py-0.5">
            <X className="w-3 h-3" />
          </Win95Btn>
        </div>

        {error && (
          <div 
            className="mx-2 mt-2 p-2 text-[10px]"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              color: '#800000'
            }}
          >
            <ErrorMessageWithLink message={error} />
          </div>
        )}

        <div className="p-2 max-h-[70vh] overflow-y-auto">
          <div className="text-[9px] font-bold mb-1 px-1" style={{ color: WIN95.textDisabled }}>ETHEREUM & EVM CHAINS</div>
          {evmWallets.map(w => (
            <WalletOption 
              key={w.id} 
              wallet={w} 
              onClick={onSelectWallet} 
              isConnecting={isConnecting && connectingWallet === w.id} 
              disabled={isConnecting && connectingWallet !== w.id} 
            />
          ))}
          
          <div className="text-[9px] font-bold mb-1 mt-3 px-1" style={{ color: WIN95.textDisabled }}>SOLANA</div>
          {solanaWallets.map(w => (
            <WalletOption 
              key={w.id} 
              wallet={w} 
              onClick={onSelectWallet} 
              isConnecting={isConnecting && connectingWallet === w.id} 
              disabled={isConnecting && connectingWallet !== w.id} 
            />
          ))}

          <div 
            className="mt-3 p-2 text-[9px]"
            style={{
              background: WIN95.bgLight,
              border: `1px solid ${WIN95.bgDark}`,
              color: WIN95.text,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          >
            <p className="font-bold mb-0.5">💡 Tip</p>
            <p>Select the wallet you have installed. Use <strong>WalletConnect</strong> to connect mobile wallets.</p>
          </div>
        </div>
      </div>
    </div>
  );
});

const SimpleWalletConnect = () => {
  const { isConnected, address, credits, isLoading, error, connectWallet, disconnectWallet, fetchCredits, isNFTHolder, connectedWalletId } = useSimpleWallet();
  const [showModal, setShowModal] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState(null);
  const [modalError, setModalError] = useState(null);

  const formatAddr = addr => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';
  const walletInfo = WALLETS.find(w => w.id === connectedWalletId);

  const handleSelectWallet = async (walletId) => {
    setConnectingWallet(walletId);
    setModalError(null);
    try { await connectWallet(walletId); setShowModal(false); } 
    catch (err) { setModalError(err.message); } 
    finally { setConnectingWallet(null); }
  };

  const closeModal = () => { setShowModal(false); setModalError(null); setConnectingWallet(null); };

  if (!isConnected) {
    return (
      <div style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
        <div className="flex items-center gap-1.5 mb-1.5">
          <div 
            className="p-1"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
            }}
          >
            <Wallet className="w-3 h-3" style={{ color: WIN95.text }} />
          </div>
          <h3 className="text-[11px] font-bold" style={{ color: WIN95.text }}>Connect Wallet</h3>
        </div>
        <Win95Btn 
          onClick={() => setShowModal(true)} 
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-bold"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: WIN95.bgDark, borderTopColor: 'transparent' }} />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <Wallet className="w-4 h-4" />
              <span>Connect Wallet</span>
            </>
          )}
        </Win95Btn>
        {error && (
          <div 
            className="mt-2 p-2 text-[10px]"
            style={{
              background: WIN95.inputBg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              color: '#800000'
            }}
          >
            <ErrorMessageWithLink message={error} />
          </div>
        )}
        <WalletModal isOpen={showModal} onClose={closeModal} onSelectWallet={handleSelectWallet} isConnecting={isLoading} connectingWallet={connectingWallet} error={modalError} />
      </div>
    );
  }

  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits) || 0);

  return (
    <div style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div 
            className="p-1 text-lg"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
            }}
          >
            {walletInfo?.icon || <Wallet className="w-3 h-3" style={{ color: WIN95.text }} />}
          </div>
          <div>
            <h3 className="text-[11px] font-bold" style={{ color: WIN95.text }}>{walletInfo?.name || 'Connected'}</h3>
            <p className="text-[10px] font-mono" style={{ color: WIN95.textDisabled }}>{formatAddr(address)}</p>
          </div>
        </div>
        <button 
          onClick={disconnectWallet} 
          className="p-1"
          style={{
            background: WIN95.buttonFace,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
            border: 'none',
            cursor: 'pointer'
          }}
          title="Disconnect"
        >
          <LogOut className="w-3 h-3" style={{ color: WIN95.text }} />
        </button>
      </div>

      <div className="pt-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
        <div 
          className="flex items-center justify-between p-1 mb-1"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
          }}
        >
          <div className="flex items-center gap-1">
            <Coins className="w-3 h-3" style={{ color: WIN95.text }} />
            <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>Credits:</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-[11px]" style={{ color: WIN95.text }}>{displayCredits}</span>
            <button 
              onClick={() => fetchCredits(address)} 
              className="p-0.5"
              style={{
                background: WIN95.buttonFace,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                border: 'none',
                cursor: 'pointer'
              }}
              title="Refresh"
            >
              <RefreshCw className="w-3 h-3" style={{ color: WIN95.text }} />
            </button>
          </div>
        </div>

        <div 
          className="text-[9px] p-1"
          style={{
            background: WIN95.bgLight,
            border: `1px solid ${WIN95.bgDark}`,
            color: WIN95.text
          }}
        >
          <div className="flex items-center justify-between">
            <span style={{ color: WIN95.textDisabled }}>Pricing:</span>
            <span className="font-bold">${isNFTHolder ? '0.06' : '0.15'}/credit</span>
          </div>
          {isNFTHolder && (
            <div className="flex items-center gap-1 text-[9px] mt-1 pt-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
              ✨ <span className="font-bold">NFT Holder Discount</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SimpleWalletConnect;
