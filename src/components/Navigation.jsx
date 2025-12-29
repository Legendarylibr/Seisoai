import React, { useState, useEffect, useRef, memo, useCallback } from 'react';
import { Zap, Coins, ChevronDown, Wallet, RefreshCw, LogOut, CreditCard, Mail, Settings } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import SubscriptionManagement from './SubscriptionManagement';
import { BTN, PANEL, TEXT, hoverHandlers, pressHandlers } from '../utils/buttonStyles';

// PERFORMANCE: Memoized reusable button
const NavButton = memo(({ children, onClick, disabled, style, className = '', ...props }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`flex items-center gap-2 px-3 py-2 rounded transition-all ${className}`}
    style={{ ...BTN.base, ...style }}
    {...hoverHandlers}
    {...props}
  >
    {children}
  </button>
));

const Navigation = memo(({ activeTab, setActiveTab, tabs, onShowTokenPayment, onShowStripePayment }) => {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isWalletAuth = walletContext.isConnected;
  const isConnected = isEmailAuth || isWalletAuth;
  const address = walletContext.address;
  
  const getCredits = (value) => Math.max(0, Math.floor(Number(value ?? 0) || 0));
  const credits = getCredits(isEmailAuth ? emailContext?.credits : walletContext?.credits);
  const totalCreditsEarned = getCredits(isEmailAuth ? emailContext?.totalCreditsEarned : walletContext?.totalCreditsEarned);
  const isLoading = isEmailAuth ? emailContext.isLoading : walletContext.isLoading;
  
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showCreditsDropdown, setShowCreditsDropdown] = useState(false);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState(false);
  const dropdownRef = useRef(null);
  const creditsDropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowUserDropdown(false);
      if (creditsDropdownRef.current && !creditsDropdownRef.current.contains(e.target)) setShowCreditsDropdown(false);
    };
    if (showUserDropdown || showCreditsDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserDropdown, showCreditsDropdown]);

  if (!tabs || !Array.isArray(tabs)) {
    return (
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-blue-500 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-bold gradient-text">Seiso AI</h1>
            </div>
            <div className="text-red-400 text-sm">Navigation Error</div>
          </div>
        </div>
      </header>
    );
  }

  const formatAddr = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';

  // PERFORMANCE: useCallback for handlers to prevent child re-renders
  const handleRefreshCredits = useCallback(() => {
    isEmailAuth ? emailContext.refreshCredits() : walletContext.fetchCredits(address, 3, true);
    setShowCreditsDropdown(false);
  }, [isEmailAuth, emailContext, walletContext, address]);

  const handleSignOut = useCallback(() => {
    isEmailAuth ? emailContext.signOut() : walletContext.disconnectWallet();
  }, [isEmailAuth, emailContext, walletContext]);

  const handleBuyCredits = useCallback(() => {
    isEmailAuth && onShowStripePayment ? onShowStripePayment() : onShowTokenPayment?.();
  }, [isEmailAuth, onShowStripePayment, onShowTokenPayment]);

  return (
    <header className="sticky top-0 z-[999997]" style={{ 
      background: 'linear-gradient(to bottom, #e8e8f4, #d8d8ec, #c8c8dc)',
      borderBottom: '2px outset #d0d0e0',
      boxShadow: 'inset 0 2px 0 rgba(255,255,255,1), 0 4px 12px rgba(0,0,0,0.2)'
    }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{
        background: 'linear-gradient(90deg, #00b8a9 0%, #3b82f6 50%, #f59e0b 100%)',
        opacity: 0.6
      }} />
      
      <div className="container mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 group">
            <div className="rounded-lg p-1.5" style={{...BTN.base, padding: '6px'}}>
              <img src="/1d1c7555360a737bb22bbdfc2784655f.png" alt="Seiso AI" className="w-8 h-8 rounded-md object-cover" />
            </div>
            <h1 className="text-xl font-bold tracking-wide" style={{ 
              fontFamily: "'VT323', monospace",
              ...TEXT.primary,
              textShadow: '0 0 10px rgba(0,212,255,0.3), 2px 2px 0 rgba(255,255,255,1)'
            }}>SEISO AI</h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all group"
                  style={isActive ? BTN.active : BTN.base}
                  {...(isActive ? {} : hoverHandlers)}
                >
                  <Icon className={`w-4 h-4 transition-transform ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                  <span className="font-semibold">{tab.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Desktop Right Section */}
          {isConnected && (
            <div className="hidden md:flex items-center space-x-3">
              {/* Wallet Address */}
              {address && (
                <div className="flex items-center gap-2 px-3 py-2 rounded" style={BTN.base} {...hoverHandlers}>
                  <Wallet className="w-4 h-4" style={{color:'#000'}} />
                  <span className="text-xs font-mono" style={{color:'#000'}}>{formatAddr(address)}</span>
                </div>
              )}
              
              {/* Email User Dropdown */}
              {isEmailAuth && (
                <div className="relative" ref={dropdownRef}>
                  <button onClick={() => setShowUserDropdown(!showUserDropdown)} className="flex items-center gap-2 px-3 py-2 rounded" style={BTN.base} {...hoverHandlers}>
                    <Mail className="w-4 h-4" style={{color:'#000'}} />
                    <span className="text-xs" style={TEXT.primary}>{emailContext.email}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} style={{color:'#000'}} />
                  </button>
                  {showUserDropdown && (
                    <div className="absolute right-0 mt-2 w-56 rounded z-50 overflow-hidden" style={PANEL.card}>
                      <button onClick={() => { emailContext.signOut(); setShowUserDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-100" style={TEXT.primary}>
                        <LogOut className="w-4 h-4" style={{color:'#000'}} />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Credits Dropdown */}
              <div className="relative" ref={creditsDropdownRef}>
                <button onClick={() => setShowCreditsDropdown(!showCreditsDropdown)} className="flex items-center gap-1.5 px-3 py-2 rounded" style={BTN.base} {...hoverHandlers}>
                  <Coins className="w-4 h-4" style={{color:'#000'}} />
                  <span className="text-sm font-semibold" style={TEXT.primary}>{isLoading ? '...' : credits} credits</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showCreditsDropdown ? 'rotate-180' : ''}`} style={{color:'#000'}} />
                </button>
                {showCreditsDropdown && (
                  <div className="absolute right-0 mt-2 w-64 rounded z-50 overflow-hidden" style={PANEL.card}>
                    <div className="px-4 py-2.5 border-b" style={{borderColor:'#d0d0d0'}}>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={TEXT.secondary}>Current Balance:</span>
                        <span className="font-bold" style={TEXT.primary}>{credits}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span style={TEXT.secondary}>Total Earned:</span>
                        <span className="font-semibold" style={TEXT.primary}>{totalCreditsEarned}</span>
                      </div>
                    </div>
                    {isEmailAuth && (
                      <button onClick={() => { setShowSubscriptionManagement(true); setShowCreditsDropdown(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-100" style={TEXT.primary}>
                        <Settings className="w-4 h-4" style={{color:'#000'}} />
                        <span>Manage Subscription</span>
                      </button>
                    )}
                    <button onClick={handleRefreshCredits} className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-100" style={TEXT.primary}>
                      <RefreshCw className="w-4 h-4" style={{color:'#000'}} />
                      <span>Refresh Credits</span>
                    </button>
                  </div>
                )}
              </div>
              
              {/* Buy Credits Button */}
              <button onClick={handleBuyCredits} className="flex items-center gap-2 px-4 py-2 rounded" style={{...BTN.base, zIndex: 999998}} {...pressHandlers}>
                {isEmailAuth ? <CreditCard className="w-4 h-4" style={{color:'#000'}} /> : <Coins className="w-4 h-4" style={{color:'#000'}} />}
                <span className="text-sm font-semibold">Buy Credits</span>
              </button>

              {/* Sign Out (wallet users only) */}
              {!isEmailAuth && (
                <button onClick={walletContext.disconnectWallet} className="flex items-center gap-2 px-3 py-2 rounded" style={BTN.base} {...pressHandlers} title="Disconnect Wallet">
                  <LogOut className="w-4 h-4" style={{color:'#000'}} />
                  <span className="text-sm font-medium hidden lg:inline" style={TEXT.primary}>Disconnect</span>
                </button>
              )}
            </div>
          )}

          {/* Mobile Menu Button */}
          <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="md:hidden p-2 rounded" style={BTN.base} {...pressHandlers}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{color:'#000'}}>
              {showMobileMenu ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>

          {/* Mobile Credits & Menu */}
          <div className="md:hidden flex items-center gap-2">
            {isConnected && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 rounded" style={BTN.base}>
                  <Coins className="w-4 h-4" style={{color:'#000'}} />
                  <span className="text-xs font-semibold" style={TEXT.primary}>{isLoading ? '...' : credits}</span>
                  <button onClick={handleBuyCredits} className="ml-1 px-2 py-1 rounded" style={{...BTN.small, zIndex: 999998}}>
                    {isEmailAuth ? <CreditCard className="w-3.5 h-3.5" style={{color:'#000'}} /> : <Coins className="w-3.5 h-3.5" style={{color:'#000'}} />}
                  </button>
                </div>
                <button onClick={handleSignOut} className="p-2 rounded" style={BTN.base} title={isEmailAuth ? "Sign Out" : "Disconnect"}>
                  <LogOut className="w-4 h-4" style={{color:'#000'}} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {showMobileMenu && (
          <div className="md:hidden border-t pt-4 mt-4 px-4 pb-4 slide-up" style={{borderColor:'#d0d0d0'}}>
            <nav className="flex flex-col space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => { setActiveTab(tab.id); setShowMobileMenu(false); }} className="flex items-center gap-3 px-4 py-3 rounded" style={isActive ? BTN.active : BTN.base} {...(isActive ? {} : hoverHandlers)}>
                    <Icon className="w-5 h-5" style={{color:'#000'}} />
                    <span className="font-semibold">{tab.name}</span>
                  </button>
                );
              })}
              {isEmailAuth && (
                <>
                  <div className="border-t my-2" style={{borderColor:'#d0d0d0'}} />
                  <button onClick={() => { setShowSubscriptionManagement(true); setShowMobileMenu(false); }} className="flex items-center gap-3 px-4 py-3 rounded" style={BTN.base} {...hoverHandlers}>
                    <Settings className="w-5 h-5" style={{color:'#000'}} />
                    <span className="font-semibold">Manage Subscription</span>
                  </button>
                </>
              )}
            </nav>
          </div>
        )}
      </div>

      {isEmailAuth && <SubscriptionManagement isOpen={showSubscriptionManagement} onClose={() => setShowSubscriptionManagement(false)} />}
    </header>
  );
});

export default Navigation;
