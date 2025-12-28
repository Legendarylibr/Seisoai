import React, { useState, useEffect, useRef } from 'react';
import { Zap, Coins, ChevronDown, Wallet, RefreshCw, LogOut, CreditCard, Mail, Settings } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import SubscriptionManagement from './SubscriptionManagement';
import logger from '../utils/logger.js';

  const Navigation = ({ activeTab, setActiveTab, tabs, onShowPayment, onShowTokenPayment, onShowStripePayment }) => {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  // Support both auth methods
  const isConnected = walletContext.isConnected || emailContext.isAuthenticated;
  const isEmailAuth = emailContext.isAuthenticated;
  const address = walletContext.address;
  // Use credits from the active auth method (email or wallet)
  const credits = isEmailAuth ? (emailContext.credits ?? 0) : (walletContext.credits ?? 0);
  const totalCreditsEarned = isEmailAuth ? (emailContext.totalCreditsEarned ?? 0) : (walletContext.totalCreditsEarned ?? 0);
  const disconnectWallet = walletContext.disconnectWallet;
  const signOut = emailContext.signOut;
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showCreditsDropdown, setShowCreditsDropdown] = useState(false);
  const [showSubscriptionManagement, setShowSubscriptionManagement] = useState(false);
  const dropdownRef = useRef(null);
  const creditsDropdownRef = useRef(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowUserDropdown(false);
      }
      if (creditsDropdownRef.current && !creditsDropdownRef.current.contains(event.target)) {
        setShowCreditsDropdown(false);
      }
    };

    if (showUserDropdown || showCreditsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserDropdown, showCreditsDropdown]);

  // Safety check to prevent the error
  if (!tabs || !Array.isArray(tabs)) {
    logger.error('Navigation: tabs prop is missing or not an array', { tabs, activeTab, hasSetActiveTab: !!setActiveTab });
    return (
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold gradient-text">Seiso AI</h1>
              </div>
            </div>
            <div className="text-red-400 text-sm">Navigation Error - Check Console</div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-[999997]" style={{ 
      position: 'sticky',
      background: 'linear-gradient(to bottom, #e8e8f0, #d8d8e8, #d0d0d8)',
      borderBottom: '2px outset #e0e0e8',
      boxShadow: 
        'inset 0 2px 0 rgba(255, 255, 255, 1), ' +
        'inset 0 -2px 0 rgba(0, 0, 0, 0.2), ' +
        '0 4px 8px rgba(0, 0, 0, 0.25), ' +
        '0 2px 4px rgba(0, 0, 0, 0.15)'
    }}>
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 group">
            <div className="rounded transition-all duration-300" style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              padding: '6px',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}>
              <img src="/1d1c7555360a737bb22bbdfc2784655f.png" alt="Seiso AI" className="w-8 h-8 rounded-lg object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ 
                color: '#000000', 
                textShadow: '3px 3px 0 rgba(255, 255, 255, 1), 2px 2px 0 rgba(255, 255, 255, 1), 1px 1px 2px rgba(0, 0, 0, 0.3)'
              }}>Seiso AI</h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all duration-300 group
                    ${activeTab === tab.id 
                      ? '' 
                      : ''
                    }
                    style={activeTab === tab.id ? {
                      background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
                      color: '#000000',
                      border: '2px inset #c0c0c0',
                      boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5), 0 1px 2px rgba(0, 0, 0, 0.2)',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                    } : {
                      color: '#000000',
                      border: '2px outset #f0f0f0',
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}
                    onMouseEnter={(e) => {
                      if (activeTab !== tab.id) {
                        e.target.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                        e.target.style.border = '2px outset #f8f8f8';
                        e.target.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (activeTab !== tab.id) {
                        e.target.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                        e.target.style.border = '2px outset #f0f0f0';
                        e.target.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                      }
                    }}
                  `}
                >
                  <Icon className={`w-4 h-4 transition-transform duration-300 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                  <span className="font-semibold">{tab.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Credits Dropdown */}
          {isConnected && (
            <div className="hidden md:flex items-center space-x-3">
              {/* Wallet Address Display (only if wallet is connected) */}
              {address && (
                <div className="flex items-center gap-2 px-3 py-2 rounded transition-all duration-300" style={{
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                  e.currentTarget.style.border = '2px outset #f8f8f8';
                  e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                  e.currentTarget.style.border = '2px outset #f0f0f0';
                  e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                }}>
                  <Wallet className="w-4 h-4" style={{ color: '#000000' }} />
                  <span className="text-xs font-mono" style={{ color: '#000000' }}>
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                  </span>
                </div>
              )}
              
              {/* Email User Dropdown (for email users) */}
              {isEmailAuth && (
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowUserDropdown(!showUserDropdown)}
                    className="flex items-center gap-2 px-3 py-2 rounded transition-all duration-300"
                    style={{
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      border: '2px outset #f0f0f0',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                    }}
                  >
                    <Mail className="w-4 h-4" style={{ color: '#000000' }} />
                    <span className="text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                      {emailContext.email}
                    </span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${showUserDropdown ? 'rotate-180' : ''}`} style={{ color: '#000000' }} />
                  </button>

                  {/* Dropdown Menu */}
                  {showUserDropdown && (
                    <div className="absolute right-0 mt-2 w-56 rounded z-50 overflow-hidden" style={{
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      border: '2px outset #e8e8e8',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3)'
                    }}>
                      <div className="py-1">
                        <button
                          onClick={() => {
                            signOut();
                            setShowUserDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                          style={{
                            color: '#000000',
                            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'linear-gradient(to bottom, #e8e8e8, #d8d8d8, #d0d0d0)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          <LogOut className="w-4 h-4" style={{ color: '#000000' }} />
                          <span>Sign Out</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Credits Display with Dropdown */}
              <div className="relative" ref={creditsDropdownRef}>
                <button
                  onClick={() => setShowCreditsDropdown(!showCreditsDropdown)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded transition-all duration-200"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                    e.currentTarget.style.border = '2px outset #f8f8f8';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                  }}
                >
                  <Coins className="w-4 h-4" style={{ color: '#000000' }} />
                  <span className="text-sm font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                    {credits} credits
                  </span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showCreditsDropdown ? 'rotate-180' : ''}`} style={{ color: '#000000' }} />
                </button>

                {/* Credits Dropdown Menu */}
                {showCreditsDropdown && (
                  <div className="absolute right-0 mt-2 w-64 rounded z-50 overflow-hidden" style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #e8e8e8',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 4px 8px rgba(0, 0, 0, 0.3)'
                  }}>
                    <div className="py-1">
                      {/* Credit Details Section */}
                      <div className="px-4 py-2.5 border-b" style={{ borderColor: '#d0d0d0' }}>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Current Balance:</span>
                            <span className="text-sm font-bold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{credits}</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Total Earned:</span>
                            <span className="text-sm font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{totalCreditsEarned}</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Manage Subscription - Only show for email users */}
                      {isEmailAuth && (
                        <>
                          <button
                            onClick={() => {
                              setShowSubscriptionManagement(true);
                              setShowCreditsDropdown(false);
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                            style={{
                              color: '#000000',
                              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'linear-gradient(to bottom, #e8e8e8, #d8d8d8, #d0d0d0)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <Settings className="w-4 h-4" style={{ color: '#000000' }} />
                            <span>Manage Subscription</span>
                          </button>
                          <div className="border-t my-1" style={{ borderColor: '#d0d0d0' }}></div>
                        </>
                      )}
                      {/* Refresh Credits */}
                      <button
                        onClick={() => {
                          if (isEmailAuth) {
                            emailContext.refreshCredits();
                          } else {
                            walletContext.fetchCredits(address, 3, true); // Force refresh, skip cache
                          }
                          setShowCreditsDropdown(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                        style={{
                          color: '#000000',
                          textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'linear-gradient(to bottom, #e8e8e8, #d8d8d8, #d0d0d0)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <RefreshCw className="w-4 h-4" style={{ color: '#000000' }} />
                        <span>Refresh Credits</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                
                {/* Buy Credits Button - Show Stripe for email users, Token for wallet users */}
                {isEmailAuth && onShowStripePayment ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onShowStripePayment) {
                        onShowStripePayment();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded transition-all duration-200"
                    style={{ 
                      position: 'relative', 
                      zIndex: 999998,
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      border: '2px outset #f0f0f0',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                      color: '#000000',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.border = '2px inset #c0c0c0';
                      e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    <CreditCard className="w-4 h-4" style={{ color: '#000000' }} />
                    <span className="text-sm font-semibold">Buy Credits</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onShowTokenPayment) {
                        onShowTokenPayment();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 rounded transition-all duration-200"
                    style={{ 
                      position: 'relative', 
                      zIndex: 999998,
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      border: '2px outset #f0f0f0',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                      color: '#000000',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                    onMouseDown={(e) => {
                      e.currentTarget.style.border = '2px inset #c0c0c0';
                      e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                    }}
                    onMouseUp={(e) => {
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                      e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                    }}
                  >
                    <Coins className="w-4 h-4" style={{ color: '#000000' }} />
                    <span className="text-sm font-semibold">Buy Credits</span>
                  </button>
                )}
              </div>

              {/* Sign Out / Disconnect Button (only for wallet users, email users have dropdown) */}
              {!isEmailAuth && (
                <button
                  onClick={disconnectWallet}
                  className="flex items-center gap-2 px-3 py-2 rounded transition-all duration-200"
                  title="Disconnect Wallet"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                    color: '#000000',
                    textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                    e.currentTarget.style.border = '2px outset #f8f8f8';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.3), 0 3px 6px rgba(0, 0, 0, 0.25)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.border = '2px inset #c0c0c0';
                    e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                  }}
                >
                  <LogOut className="w-4 h-4" style={{ color: '#000000' }} />
                  <span className="text-sm font-medium hidden lg:inline" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                    Disconnect
                  </span>
                </button>
              )}
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="md:hidden p-2 rounded transition-all duration-200"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.border = '2px inset #c0c0c0';
              e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
            }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#000000' }}>
              {showMobileMenu ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Mobile Credits & Menu */}
          <div className="md:hidden flex items-center gap-2">
            {isConnected ? (
              <>
                {/* Combined Credits Card with Buy Button - Mobile */}
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded transition-all duration-200"
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}
                >
                  <Coins className="w-4 h-4" style={{ color: '#000000' }} />
                  <span className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>
                    {credits}
                  </span>
                  {/* Buy Credits Button - Show Stripe for email users, Token for wallet users */}
                  {isEmailAuth && onShowStripePayment ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onShowStripePayment) {
                          onShowStripePayment();
                        }
                      }}
                      className="ml-1 px-2 py-1 rounded transition-all duration-200"
                      title="Buy Credits"
                      style={{ 
                        position: 'relative', 
                        zIndex: 999998,
                        background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                        border: '2px outset #f0f0f0',
                        boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.border = '2px inset #c0c0c0';
                        e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.border = '2px outset #f0f0f0';
                        e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                      }}
                    >
                      <CreditCard className="w-3.5 h-3.5" style={{ color: '#000000' }} />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onShowTokenPayment) {
                          onShowTokenPayment();
                        }
                      }}
                      className="ml-1 px-2 py-1 rounded transition-all duration-200"
                      title="Buy Credits"
                      style={{ 
                        position: 'relative', 
                        zIndex: 999998,
                        background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                        border: '2px outset #f0f0f0',
                        boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                      }}
                      onMouseDown={(e) => {
                        e.currentTarget.style.border = '2px inset #c0c0c0';
                        e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.border = '2px outset #f0f0f0';
                        e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                      }}
                    >
                      <Coins className="w-3.5 h-3.5" style={{ color: '#000000' }} />
                    </button>
                  )}
                </div>
                
                <button
                  onClick={isEmailAuth ? signOut : disconnectWallet}
                  className="p-2 rounded transition-all duration-200"
                  title={isEmailAuth ? "Sign Out" : "Disconnect"}
                  style={{
                    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                    border: '2px outset #f0f0f0',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)'
                  }}
                  onMouseDown={(e) => {
                    e.currentTarget.style.border = '2px inset #c0c0c0';
                    e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                  }}
                  onMouseUp={(e) => {
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                    e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
                  }}
                >
                  <LogOut className="w-4 h-4" style={{ color: '#000000' }} />
                </button>
              </>
            ) : null}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {showMobileMenu && (
          <div className="md:hidden border-t pt-4 mt-4 px-4 pb-4 slide-up" style={{ borderColor: '#d0d0d0' }}>
            <nav className="flex flex-col space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMobileMenu(false);
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded transition-all duration-300"
                    style={isActive ? {
                      background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
                      color: '#000000',
                      border: '2px inset #c0c0c0',
                      boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5), 0 1px 2px rgba(0, 0, 0, 0.2)',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                    } : {
                      color: '#000000',
                      border: '2px outset #f0f0f0',
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                        e.currentTarget.style.border = '2px outset #f8f8f8';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                        e.currentTarget.style.border = '2px outset #f0f0f0';
                      }
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: '#000000' }} />
                    <span className="font-semibold">{tab.name}</span>
                  </button>
                );
              })}
              
              {/* Subscription Management for Email Users */}
              {isEmailAuth && (
                <>
                  <div className="border-t my-2" style={{ borderColor: '#d0d0d0' }}></div>
                  <button
                    onClick={() => {
                      setShowSubscriptionManagement(true);
                      setShowMobileMenu(false);
                    }}
                    className="flex items-center gap-3 px-4 py-3 rounded transition-all duration-300"
                    style={{
                      color: '#000000',
                      border: '2px outset #f0f0f0',
                      background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                      textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                      e.currentTarget.style.border = '2px outset #f8f8f8';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                    }}
                  >
                    <Settings className="w-5 h-5" style={{ color: '#000000' }} />
                    <span className="font-semibold">Manage Subscription</span>
                  </button>
                </>
              )}
            </nav>
          </div>
        )}
      </div>

      {/* Subscription Management Modal */}
      {isEmailAuth && (
        <SubscriptionManagement
          isOpen={showSubscriptionManagement}
          onClose={() => setShowSubscriptionManagement(false)}
        />
      )}
    </header>
  );
};

export default Navigation;
