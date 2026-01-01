import React, { useState, useEffect, useRef, memo, useCallback, ReactNode } from 'react';
import { Zap, Coins, ChevronDown, Wallet, RefreshCw, LogOut, CreditCard, Mail, Settings, Clock, type LucideIcon } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import SubscriptionManagement from './SubscriptionManagement';
import { WIN95, BTN, PANEL, TITLEBAR, TEXT } from '../utils/buttonStyles';

// System tray clock component
const SystemClock = memo(function SystemClock() {
  const [time, setTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };
  
  return (
    <div 
      className="hidden lg:flex items-center gap-1 px-2 py-1 text-[10px]"
      style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        color: WIN95.text
      }}
      title={time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
    >
      <Clock className="w-3 h-3" />
      <span className="font-mono">{formatTime(time)}</span>
    </div>
  );
});

interface Tab {
  id: string;
  name: string;
  icon: LucideIcon;
}

interface Win95NavButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
}

// Windows 95 style button component
const Win95NavButton = memo(function Win95NavButton({ children, onClick, disabled, active, className = '' }: Win95NavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-1.5 transition-none select-none ${className}`}
      style={{
        background: active ? WIN95.bgDark : WIN95.buttonFace,
        color: disabled ? WIN95.textDisabled : (active ? WIN95.highlightText : WIN95.text),
        border: 'none',
        boxShadow: active 
          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
          : disabled
            ? `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`
            : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
        cursor: disabled ? 'default' : 'pointer',
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        fontSize: '11px',
        fontWeight: 'bold'
      }}
    >
      {children}
    </button>
  );
});

interface NavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  tabs: Tab[];
  onShowTokenPayment?: () => void;
  onShowStripePayment?: () => void;
}

const Navigation = memo(({ activeTab, setActiveTab, tabs, onShowTokenPayment, onShowStripePayment }: NavigationProps) => {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const isWalletAuth = walletContext.isConnected;
  const isConnected = isEmailAuth || isWalletAuth;
  const address = walletContext.address;
  
  const getCredits = (value: number | undefined | null): number => Math.max(0, Math.floor(Number(value ?? 0) || 0));
  const credits = getCredits(isEmailAuth ? emailContext?.credits : walletContext?.credits);
  const totalCreditsEarned = getCredits(isEmailAuth ? emailContext?.totalCreditsEarned : walletContext?.totalCreditsEarned);
  const isLoading = isEmailAuth ? emailContext.isLoading : walletContext.isLoading;
  
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
  const [showUserDropdown, setShowUserDropdown] = useState<boolean>(false);
  const [showCreditsDropdown, setShowCreditsDropdown] = useState<boolean>(false);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const creditsDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowUserDropdown(false);
      if (creditsDropdownRef.current && !creditsDropdownRef.current.contains(e.target as Node)) setShowCreditsDropdown(false);
    };
    if (showUserDropdown || showCreditsDropdown) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showUserDropdown, showCreditsDropdown]);

  if (!tabs || !Array.isArray(tabs)) {
    return (
      <header className="sticky top-0 z-40" style={{ background: WIN95.bg }}>
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center" style={{ ...PANEL.window, padding: '4px' }}>
                <Zap className="w-6 h-6" style={{ color: WIN95.text }} />
              </div>
              <h1 className="text-xl font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>Seiso AI</h1>
            </div>
            <div className="text-[11px]" style={{ color: '#800000' }}>Navigation Error</div>
          </div>
        </div>
      </header>
    );
  }

  const formatAddr = (addr: string | null): string => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';

  // PERFORMANCE: useCallback for handlers to prevent child re-renders
  const handleRefreshCredits = useCallback(() => {
    isEmailAuth ? emailContext.refreshCredits() : walletContext.fetchCredits(address || '', 3, true);
    setShowCreditsDropdown(false);
  }, [isEmailAuth, emailContext, walletContext, address]);

  const handleSignOut = useCallback(async () => {
    if (isEmailAuth) {
      await emailContext.signOut();
    } else {
      walletContext.disconnectWallet();
    }
  }, [isEmailAuth, emailContext, walletContext]);

  const handleBuyCredits = useCallback(() => {
    isEmailAuth && onShowStripePayment ? onShowStripePayment() : onShowTokenPayment?.();
  }, [isEmailAuth, onShowStripePayment, onShowTokenPayment]);

  return (
    <header className="sticky top-0 z-40" style={{ 
      background: WIN95.bg,
      boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 0 2px 0 ${WIN95.bgDark}`
    }}>
      {/* Title bar */}
      <div 
        className="flex items-center gap-1 lg:gap-2 px-1 lg:px-2 py-0.5 lg:py-1"
        style={TITLEBAR.active}
      >
        <img src="/1d1c7555360a737bb22bbdfc2784655f.png" alt="Seiso AI" className="w-5 h-5 lg:w-6 lg:h-6 rounded-sm object-cover" style={{ imageRendering: 'auto' }} />
        <span className="text-[10px] lg:text-[11px] font-bold tracking-wide">Seiso AI</span>
        <span className="hidden sm:inline text-[9px] lg:text-[10px] opacity-80 ml-1">— Image • Video • Music Generator</span>
        <div className="flex-1" />
        {/* Window control buttons */}
        <div className="flex gap-px">
          <button 
            className="w-4 h-3.5 lg:w-[18px] lg:h-4 flex items-center justify-center text-[8px] lg:text-[9px] font-bold"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              color: WIN95.text,
              lineHeight: 1
            }}
            title="Minimize"
          >
            _
          </button>
          <button 
            className="w-4 h-3.5 lg:w-[18px] lg:h-4 flex items-center justify-center text-[8px] lg:text-[9px] font-bold"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              color: WIN95.text,
              lineHeight: 1
            }}
            title="Maximize"
          >
            □
          </button>
        </div>
      </div>
      
      {/* Menu bar */}
      <div className="px-1 lg:px-2 py-0.5 lg:py-1" style={{ borderBottom: `1px solid ${WIN95.bgDark}` }}>
        <div className="container mx-auto">
          <div className="flex items-center justify-between">
            {/* Desktop Navigation - only show when authenticated */}
            {isConnected && (
              <nav className="hidden md:flex items-center gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <Win95NavButton
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      active={isActive}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.name}</span>
                    </Win95NavButton>
                  );
                })}
              </nav>
            )}

            {/* Desktop Right Section */}
            {isConnected && (
              <div className="hidden md:flex items-center gap-2">
                {/* Wallet Address */}
                {address && (
                  <div 
                    className="flex items-center gap-2 px-2 py-1 text-[10px]"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                  >
                    <Wallet className="w-3 h-3" style={{ color: WIN95.text }} />
                    <span className="font-mono" style={{ color: WIN95.text }}>{formatAddr(address)}</span>
                  </div>
                )}
                
                {/* Email User Dropdown */}
                {isEmailAuth && (
                  <div className="relative" ref={dropdownRef}>
                    <Win95NavButton onClick={() => setShowUserDropdown(!showUserDropdown)}>
                      <Mail className="w-3 h-3" />
                      <span className="text-[10px]">{emailContext.email}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} />
                    </Win95NavButton>
                    {showUserDropdown && (
                      <div 
                        className="absolute right-0 mt-1 w-48 z-50"
                        style={{
                          background: WIN95.bg,
                          border: `1px solid ${WIN95.border.darker}`,
                          boxShadow: `2px 2px 0 ${WIN95.border.darker}`
                        }}
                      >
                        <button 
                          onClick={() => { emailContext.signOut(); setShowUserDropdown(false); }} 
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px]"
                          style={{ 
                            color: WIN95.text, 
                            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' 
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = WIN95.highlight;
                            e.currentTarget.style.color = WIN95.highlightText;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = WIN95.text;
                          }}
                        >
                          <LogOut className="w-4 h-4" />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Credits Dropdown */}
                <div className="relative" ref={creditsDropdownRef}>
                  <Win95NavButton onClick={() => setShowCreditsDropdown(!showCreditsDropdown)}>
                    <Coins className="w-3 h-3" />
                    <span>{isLoading ? '...' : credits} credits</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showCreditsDropdown ? 'rotate-180' : ''}`} />
                  </Win95NavButton>
                  {showCreditsDropdown && (
                    <div 
                      className="absolute right-0 mt-1 w-56 z-50"
                      style={{
                        background: WIN95.bg,
                        border: `1px solid ${WIN95.border.darker}`,
                        boxShadow: `2px 2px 0 ${WIN95.border.darker}`
                      }}
                    >
                      <div className="px-3 py-2" style={{ borderBottom: `1px solid ${WIN95.bgDark}` }}>
                        <div className="flex justify-between text-[10px] mb-1" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                          <span style={{ color: WIN95.textDisabled }}>Current Balance:</span>
                          <span className="font-bold" style={{ color: WIN95.text }}>{credits}</span>
                        </div>
                        <div className="flex justify-between text-[10px]" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                          <span style={{ color: WIN95.textDisabled }}>Total Earned:</span>
                          <span className="font-bold" style={{ color: WIN95.text }}>{totalCreditsEarned}</span>
                        </div>
                      </div>
                      {isEmailAuth && (
                        <button 
                          onClick={() => { setShowSubscriptionManagement(true); setShowCreditsDropdown(false); }} 
                          className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px]"
                          style={{ 
                            color: WIN95.text, 
                            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' 
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = WIN95.highlight;
                            e.currentTarget.style.color = WIN95.highlightText;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                            e.currentTarget.style.color = WIN95.text;
                          }}
                        >
                          <Settings className="w-4 h-4" />
                          <span>Manage Subscription</span>
                        </button>
                      )}
                      <button 
                        onClick={handleRefreshCredits} 
                        className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px]"
                        style={{ 
                          color: WIN95.text, 
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' 
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = WIN95.highlight;
                          e.currentTarget.style.color = WIN95.highlightText;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = WIN95.text;
                        }}
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Refresh Credits</span>
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Buy Credits Button - Emphasized with Win95 blue */}
                <button
                  onClick={handleBuyCredits}
                  className="flex items-center gap-2 px-5 py-2 transition-none select-none"
                  style={{
                    background: 'linear-gradient(180deg, #1084d0 0%, #000080 100%)',
                    color: '#ffffff',
                    border: 'none',
                    boxShadow: `inset 1px 1px 0 #4090e0, inset -1px -1px 0 #000040, 2px 2px 0 ${WIN95.border.darker}`,
                    cursor: 'pointer',
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    textShadow: '1px 1px 0 #000040'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, #2094e0 0%, #0000a0 100%)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, #1084d0 0%, #000080 100%)';
                  }}
                >
                  {isEmailAuth ? <CreditCard className="w-4 h-4" /> : <Coins className="w-4 h-4" />}
                  <span>Buy Credits</span>
                </button>

                {/* Sign Out (wallet users only) */}
                {!isEmailAuth && (
                  <Win95NavButton onClick={walletContext.disconnectWallet}>
                    <LogOut className="w-3 h-3" />
                    <span className="hidden lg:inline">Disconnect</span>
                  </Win95NavButton>
                )}
                
                {/* System Tray Clock */}
                <SystemClock />
              </div>
            )}

            {/* Mobile Menu Button - only show when authenticated */}
            {isConnected && (
              <button 
                onClick={() => setShowMobileMenu(!showMobileMenu)} 
                className="md:hidden p-2"
                style={BTN.base}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: WIN95.text }}>
                  {showMobileMenu ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /> : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
                </svg>
              </button>
            )}

            {/* Mobile Credits & Menu */}
            <div className="md:hidden flex items-center gap-1">
              {isConnected && (
                <>
                  <div 
                    className="flex items-center gap-1 px-2 py-1"
                    style={BTN.base}
                  >
                    <Coins className="w-3 h-3" style={{ color: WIN95.text }} />
                    <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>{isLoading ? '...' : credits}</span>
                    <button 
                      onClick={handleBuyCredits} 
                      className="ml-1 px-2 py-1 flex items-center gap-1"
                      style={{
                        background: 'linear-gradient(180deg, #1084d0 0%, #000080 100%)',
                        color: '#ffffff',
                        border: 'none',
                        boxShadow: 'inset 1px 1px 0 #4090e0, inset -1px -1px 0 #000040',
                        cursor: 'pointer',
                        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}
                    >
                      {isEmailAuth ? <CreditCard className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
                      <span>Buy</span>
                    </button>
                  </div>
                  {/* Sign out button only for wallet users - email users use the dropdown */}
                  {!isEmailAuth && (
                    <button 
                      onClick={handleSignOut} 
                      className="p-1.5"
                      style={BTN.base}
                      title="Disconnect"
                    >
                      <LogOut className="w-3 h-3" style={{ color: WIN95.text }} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Mobile Navigation Menu - only show when authenticated */}
          {showMobileMenu && isConnected && (
            <div className="md:hidden pt-2 mt-2 slide-up" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
              <nav className="flex flex-col gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <Win95NavButton 
                      key={tab.id} 
                      onClick={() => { setActiveTab(tab.id); setShowMobileMenu(false); }}
                      active={isActive}
                      className="w-full justify-start"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{tab.name}</span>
                    </Win95NavButton>
                  );
                })}
                {isEmailAuth && (
                  <>
                    <div style={{ borderTop: `1px solid ${WIN95.bgDark}`, marginTop: '4px', paddingTop: '4px' }} />
                    <Win95NavButton 
                      onClick={() => { setShowSubscriptionManagement(true); setShowMobileMenu(false); }}
                      className="w-full justify-start"
                    >
                      <Settings className="w-4 h-4" />
                      <span>Manage Subscription</span>
                    </Win95NavButton>
                  </>
                )}
              </nav>
            </div>
          )}
        </div>
      </div>

      {isEmailAuth && <SubscriptionManagement isOpen={showSubscriptionManagement} onClose={() => setShowSubscriptionManagement(false)} />}
    </header>
  );
});

export default Navigation;

