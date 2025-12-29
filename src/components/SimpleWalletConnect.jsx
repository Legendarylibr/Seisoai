import React, { useState, memo } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { Wallet, LogOut, Coins, RefreshCw, X, ExternalLink } from 'lucide-react';
import { BTN, PANEL, TEXT } from '../utils/buttonStyles';

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

// PERFORMANCE: Memoized presentational components
const ErrorMessageWithLink = memo(({ message }) => {
  if (!message) return null;
  if (!message.includes('|||')) return <span>{message}</span>;
  const [text, linkText, url] = message.split('|||');
  if (!url) return <span>{message}</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>{text}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-3 py-1 rounded font-bold hover:opacity-80" style={{background:'linear-gradient(to bottom,#3b82f6,#2563eb)', color:'#fff', border:'1px solid #1d4ed8'}} onClick={e => e.stopPropagation()}>
        {linkText}<ExternalLink className="w-3.5 h-3.5" />
      </a>
    </span>
  );
});

const WalletOption = memo(({ wallet, onClick, isConnecting, disabled }) => (
  <button onClick={() => onClick(wallet.id)} disabled={isConnecting || disabled} className="w-full p-3 rounded-lg flex items-center gap-3 text-left mb-2" style={{...BTN.small, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer'}}>
    <div className="text-2xl">{wallet.icon}</div>
    <div className="flex-1">
      <div className="font-semibold text-sm" style={TEXT.primary}>{wallet.name}</div>
      {isConnecting ? <div className="text-xs" style={TEXT.muted}>Connecting...</div> : wallet.description && <div className="text-xs" style={TEXT.muted}>{wallet.description}</div>}
    </div>
    {isConnecting && <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />}
  </button>
));

const WalletModal = memo(({ isOpen, onClose, onSelectWallet, isConnecting, connectingWallet, error }) => {
  if (!isOpen) return null;
  const evmWallets = WALLETS.filter(w => w.type === 'evm');
  const solanaWallets = WALLETS.filter(w => w.type === 'solana');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)'}} onClick={onClose}>
      <div className="w-full max-w-md rounded-lg shadow-2xl overflow-hidden" style={{background:'linear-gradient(to bottom,#f0f0f0,#e0e0e0)', border:'3px outset #f0f0f0'}} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b-2" style={{background:'linear-gradient(to bottom,#e8e8e8,#d8d8d8)', borderColor:'#c0c0c0'}}>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5" style={{color:'#000'}} />
            <h2 className="text-lg font-bold" style={TEXT.primary}>Connect Wallet</h2>
          </div>
          <button onClick={onClose} disabled={isConnecting} className="p-1 rounded" style={{...BTN.small, opacity: isConnecting ? 0.5 : 1}}><X className="w-4 h-4" style={{color:'#000'}} /></button>
        </div>
        {error && <div className="mx-4 mt-4 p-3 rounded text-sm" style={{background:'linear-gradient(to bottom,#fee2e2,#fecaca)', border:'2px inset #fca5a5', color:'#991b1b'}}><ErrorMessageWithLink message={error} /></div>}
        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <h3 className="text-xs font-semibold mb-2 px-1" style={TEXT.muted}>ETHEREUM & EVM CHAINS</h3>
          {evmWallets.map(w => <WalletOption key={w.id} wallet={w} onClick={onSelectWallet} isConnecting={isConnecting && connectingWallet === w.id} disabled={isConnecting && connectingWallet !== w.id} />)}
          <h3 className="text-xs font-semibold mb-2 mt-4 px-1" style={TEXT.muted}>SOLANA</h3>
          {solanaWallets.map(w => <WalletOption key={w.id} wallet={w} onClick={onSelectWallet} isConnecting={isConnecting && connectingWallet === w.id} disabled={isConnecting && connectingWallet !== w.id} />)}
          <div className="mt-4 p-3 rounded text-xs" style={{background:'linear-gradient(to bottom,#fff8dc,#ffeaa7)', border:'2px inset #e0e0e0', color:'#666'}}>
            <p className="font-semibold mb-1" style={{color:'#000'}}>💡 Tip</p>
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
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="p-1 rounded" style={BTN.small}><Wallet className="w-3 h-3" style={{color:'#000'}} /></div>
          <h3 className="text-xs font-semibold" style={TEXT.primary}>Connect Wallet</h3>
        </div>
        <button onClick={() => setShowModal(true)} disabled={isLoading} className="w-full btn-primary flex items-center justify-center gap-1.5 py-1.5 text-xs">
          {isLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Connecting...</span></> : <><Wallet className="w-4 h-4" /><span>Connect Wallet</span></>}
        </button>
        {error && <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400"><ErrorMessageWithLink message={error} /></div>}
        <WalletModal isOpen={showModal} onClose={closeModal} onSelectWallet={handleSelectWallet} isConnecting={isLoading} connectingWallet={connectingWallet} error={modalError} />
      </div>
    );
  }

  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits) || 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded text-lg" style={BTN.small}>{walletInfo?.icon || <Wallet className="w-3 h-3" style={{color:'#000'}} />}</div>
          <div>
            <h3 className="text-xs font-semibold" style={TEXT.primary}>{walletInfo?.name || 'Connected'}</h3>
            <p className="text-xs font-mono" style={TEXT.secondary}>{formatAddr(address)}</p>
          </div>
        </div>
        <button onClick={disconnectWallet} className="p-1 rounded" style={BTN.small} title="Disconnect"><LogOut className="w-3 h-3" style={{color:'#000'}} /></button>
      </div>
      <div className="space-y-1 pt-1 border-t" style={{borderColor:'#d0d0d0'}}>
        <div className="flex items-center justify-between p-1 rounded" style={PANEL.base}>
          <div className="flex items-center gap-1"><Coins className="w-3 h-3" style={{color:'#000'}} /><span className="text-xs font-medium" style={TEXT.primary}>Credits:</span></div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm" style={TEXT.primary}>{displayCredits}</span>
            <button onClick={() => fetchCredits(address)} className="p-0.5 rounded" style={BTN.small} title="Refresh"><RefreshCw className="w-3 h-3" style={{color:'#000'}} /></button>
          </div>
        </div>
        <div className="text-xs p-1 rounded" style={PANEL.base}>
          <div className="flex items-center justify-between">
            <span style={TEXT.secondary}>Pricing:</span>
            <span className="font-semibold" style={TEXT.primary}>${isNFTHolder ? '0.06' : '0.15'}/credit</span>
          </div>
          {isNFTHolder && <div className="flex items-center gap-1 text-xs mt-1 pt-1 border-t" style={{borderColor:'#d0d0d0', ...TEXT.secondary}}>✨ <span className="font-medium">NFT Holder Discount</span></div>}
        </div>
      </div>
    </div>
  );
};

export default SimpleWalletConnect;
