import React, { useState, useEffect, useRef } from 'react';
import { Zap, Coins, ChevronDown, Wallet, RefreshCw, LogOut } from 'lucide-react';
// import { CreditCard } from 'lucide-react'; // DISABLED - Stripe disabled
import { useSimpleWallet } from '../contexts/SimpleWalletContext';

  const Navigation = ({ activeTab, setActiveTab, tabs, onShowPayment, onShowTokenPayment }) => {
    // onShowStripePayment prop removed - Stripe disabled
  const { isConnected, address, credits, disconnectWallet } = useSimpleWallet();
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
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-[999997]" style={{ position: 'sticky' }}>
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img src="/1d1c7555360a737bb22bbdfc2784655f.png" alt="Seiso AI" className="w-10 h-10 rounded-xl object-cover" />
            <div>
              <h1 className="text-xl font-bold gradient-text">Seiso AI</h1>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200
                    ${activeTab === tab.id 
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                      : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{tab.name}</span>
                </button>
              );
            })}
          </nav>

          {/* STRIPE DISABLED - Stripe button removed, crypto only
          {!isConnected && (
            <button
              onClick={onShowStripePayment}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium rounded-lg transition-all duration-200 hover:scale-105 shadow-lg"
            >
              <span>💳</span>
              <span className="hidden sm:inline">Buy Credits with Card</span>
              <span className="sm:hidden">Card</span>
            </button>
          )}
          */}

          {/* Credits Dropdown */}
          {isConnected && (
            <div className="hidden md:flex items-center space-x-4">
              {/* Wallet Address Display */}
              <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                <Wallet className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-mono text-gray-300">
                  {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : ''}
                </span>
              </div>

              {/* Credits Display */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">
                    {credits} credits
                  </span>
                </div>
                
                {/* Buy Credits Button - Direct like Generate button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onShowTokenPayment) {
                      onShowTokenPayment();
                    }
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg border border-purple-500/30 transition-colors"
                  style={{ position: 'relative', zIndex: 999998 }}
                >
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">Buy Credits</span>
                </button>
              </div>

              {/* Disconnect Button */}
              <button
                onClick={disconnectWallet}
                className="flex items-center gap-2 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg border border-red-500/30 transition-colors"
                title="Disconnect Wallet"
              >
                <LogOut className="w-4 h-4 text-red-400" />
                <span className="text-sm font-medium text-red-300">Disconnect</span>
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
            {/* STRIPE DISABLED - Mobile stripe button removed
            {!isConnected && (
              <button
                onClick={onShowStripePayment}
                className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white font-medium rounded-lg transition-all duration-200"
              >
                <CreditCard className="w-4 h-4" />
                <span className="text-xs">Card</span>
              </button>
            )}
            */}

            {/* Mobile Credits Display */}
            {isConnected && (
              <>
                <div className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-medium text-white">
                    {credits}
                  </span>
                </div>
                
                {/* Mobile Buy Credits Button - Direct */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onShowTokenPayment) {
                      onShowTokenPayment();
                    }
                  }}
                  className="p-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg border border-purple-500/30 transition-colors"
                  title="Buy Credits"
                  style={{ position: 'relative', zIndex: 999998 }}
                >
                  <Coins className="w-4 h-4 text-purple-400" />
                </button>
                
                <button
                  onClick={disconnectWallet}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg border border-red-500/30 transition-colors"
                  title="Disconnect"
                >
                  <LogOut className="w-4 h-4 text-red-400" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {showMobileMenu && (
          <div className="md:hidden border-t border-white/10 pt-4 mt-4 px-4 pb-4">
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
                      flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200
                      ${activeTab === tab.id 
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }
                    `}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.name}</span>
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
