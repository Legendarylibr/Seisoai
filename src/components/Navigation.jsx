import React, { useState, useEffect, useRef } from 'react';
import { Zap, Coins, ChevronDown, Wallet, RefreshCw, LogOut, CreditCard, Mail } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';

  const Navigation = ({ activeTab, setActiveTab, tabs, onShowPayment, onShowTokenPayment, onShowStripePayment }) => {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  // Support both auth methods
  const isConnected = walletContext.isConnected || emailContext.isAuthenticated;
  const isEmailAuth = emailContext.isAuthenticated;
  const address = walletContext.address || emailContext.linkedWalletAddress;
  const credits = walletContext.credits || emailContext.credits;
  const disconnectWallet = walletContext.disconnectWallet;
  const signOut = emailContext.signOut;
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Safety check to prevent the error
  if (!tabs || !Array.isArray(tabs)) {
    console.error('Navigation: tabs prop is missing or not an array', { tabs, activeTab, setActiveTab });
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
    <header className="bg-black/30 backdrop-blur-xl border-b border-white/10 sticky top-0 z-[999997] shadow-lg" style={{ position: 'sticky' }}>
      <div className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 group">
            <div className="p-1.5 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl group-hover:from-purple-500/30 group-hover:to-pink-500/30 transition-all duration-300">
              <img src="/1d1c7555360a737bb22bbdfc2784655f.png" alt="Seiso AI" className="w-8 h-8 rounded-lg object-cover" />
            </div>
            <div>
              <h1 className="text-xl font-bold gradient-text">Seiso AI</h1>
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
                      ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-purple-200 border border-purple-500/40 shadow-lg shadow-purple-500/20' 
                      : 'text-gray-300 hover:text-white hover:bg-white/10 hover:scale-105'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 transition-transform duration-300 ${activeTab === tab.id ? 'scale-110' : 'group-hover:scale-110'}`} />
                  <span className="font-semibold">{tab.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Stripe button for email users or when not connected */}
          {(!isConnected || isEmailAuth) && onShowStripePayment && (
            <button
              onClick={onShowStripePayment}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium rounded-lg transition-all duration-200 hover:scale-105 shadow-lg"
            >
              <CreditCard className="w-4 h-4" />
              <span className="hidden sm:inline">Buy Credits with Card</span>
              <span className="sm:hidden">Card</span>
            </button>
          )}

          {/* Credits Dropdown */}
          {isConnected && (
            <div className="hidden md:flex items-center space-x-3">
              {/* Wallet Address Display (only if wallet is connected) */}
              {address && (
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all duration-300">
                  <Wallet className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-mono text-gray-300">
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                  </span>
                </div>
              )}
              
              {/* Email Display (for email users) */}
              {isEmailAuth && (
                <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all duration-300">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-gray-300">
                    {emailContext.email}
                  </span>
                </div>
              )}

              {/* Credits Display */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold text-white">
                    {credits} credits
                  </span>
                </div>
                
                {/* Buy Credits Button - Show Stripe for email users, Token for wallet users */}
                {isEmailAuth && onShowStripePayment ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onShowStripePayment) {
                        onShowStripePayment();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/30 to-cyan-500/30 hover:from-blue-500/40 hover:to-cyan-500/40 rounded-lg border border-blue-500/40 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-blue-500/25"
                    style={{ position: 'relative', zIndex: 999998 }}
                  >
                    <CreditCard className="w-4 h-4 text-blue-300" />
                    <span className="text-sm font-semibold text-white">Buy Credits</span>
                  </button>
                ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onShowTokenPayment) {
                        onShowTokenPayment();
                      }
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/30 to-pink-500/30 hover:from-purple-500/40 hover:to-pink-500/40 rounded-lg border border-purple-500/40 transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-purple-500/25"
                    style={{ position: 'relative', zIndex: 999998 }}
                  >
                    <Coins className="w-4 h-4 text-purple-300" />
                    <span className="text-sm font-semibold text-white">Buy Credits</span>
                  </button>
                )}
              </div>

              {/* Sign Out / Disconnect Button */}
              <button
                onClick={isEmailAuth ? signOut : disconnectWallet}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg border border-red-500/30 transition-all duration-300 hover:scale-105"
                title={isEmailAuth ? "Sign Out" : "Disconnect Wallet"}
              >
                <LogOut className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-300 hidden lg:inline">
                  {isEmailAuth ? 'Sign Out' : 'Disconnect'}
                </span>
              </button>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className="md:hidden p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-semibold text-white">
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
                      className="ml-1 px-2 py-1 bg-blue-500/30 hover:bg-blue-500/40 rounded border border-blue-500/40 transition-all duration-200"
                      title="Buy Credits"
                      style={{ position: 'relative', zIndex: 999998 }}
                    >
                      <CreditCard className="w-3.5 h-3.5 text-blue-300" />
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onShowTokenPayment) {
                          onShowTokenPayment();
                        }
                      }}
                      className="ml-1 px-2 py-1 bg-purple-500/30 hover:bg-purple-500/40 rounded border border-purple-500/40 transition-all duration-200"
                      title="Buy Credits"
                      style={{ position: 'relative', zIndex: 999998 }}
                    >
                      <Coins className="w-3.5 h-3.5 text-purple-300" />
                    </button>
                  )}
                </div>
                
                <button
                  onClick={isEmailAuth ? signOut : disconnectWallet}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg border border-red-500/30 transition-colors"
                  title={isEmailAuth ? "Sign Out" : "Disconnect"}
                >
                  <LogOut className="w-4 h-4 text-red-400" />
                </button>
              </>
            ) : (
              /* Not connected - Show single buy button */
              <>
                {onShowStripePayment && (
                  <button
                    onClick={onShowStripePayment}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium rounded-lg transition-all duration-200 text-xs"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Buy Credits</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {showMobileMenu && (
          <div className="md:hidden border-t border-white/10 pt-4 mt-4 px-4 pb-4 slide-up">
            <nav className="flex flex-col space-y-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setShowMobileMenu(false);
                    }}
                    className={`
                      flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300
                      ${activeTab === tab.id 
                        ? 'bg-gradient-to-r from-purple-500/30 to-pink-500/30 text-purple-200 border border-purple-500/40 shadow-lg shadow-purple-500/20' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-semibold">{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navigation;
