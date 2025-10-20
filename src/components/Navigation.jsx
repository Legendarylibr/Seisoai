import React, { useState, useEffect, useRef } from 'react';
import { Zap, Coins, ChevronDown, Wallet, RefreshCw, CreditCard } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';

const Navigation = ({ activeTab, setActiveTab, tabs, onShowPayment, onShowTokenPayment, onShowStripePayment }) => {
  const { isConnected, address, credits } = useSimpleWallet();
  const [showCreditsDropdown, setShowCreditsDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowCreditsDropdown(false);
      }
    };

    if (showCreditsDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showCreditsDropdown]);

  // Safety check to prevent the error
  if (!tabs || !Array.isArray(tabs)) {
    console.error('Navigation: tabs prop is missing or not an array', { tabs, activeTab, setActiveTab });
    return (
      <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
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
    <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
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

          {/* Credits Dropdown */}
          {isConnected && (
            <div className="hidden md:flex items-center space-x-4">
              {/* Credits Display */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-medium text-white">
                    {credits} credits
                  </span>
                </div>
                
                {/* Credits Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setShowCreditsDropdown(!showCreditsDropdown)}
                    className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
                  >
                    <CreditCard className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-white">Buy Credits</span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${showCreditsDropdown ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {showCreditsDropdown && (
                    <div className="absolute right-0 mt-2 w-64 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg shadow-xl z-50">
                      <div className="p-4">
                        <h3 className="text-sm font-semibold text-white mb-3">Purchase Credits</h3>
                        
                        <div className="space-y-2">
                          <button
                            onClick={() => {
                              setShowCreditsDropdown(false);
                              onShowStripePayment && onShowStripePayment();
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 transition-colors"
                          >
                            <CreditCard className="w-5 h-5 text-green-400" />
                            <div className="text-left">
                              <div className="text-sm font-medium text-white">Pay with Card</div>
                              <div className="text-xs text-gray-400">Visa, Mastercard, etc.</div>
                            </div>
                          </button>
                          
                          <button
                            onClick={() => {
                              setShowCreditsDropdown(false);
                              onShowTokenPayment && onShowTokenPayment();
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 transition-colors"
                          >
                            <Coins className="w-5 h-5 text-purple-400" />
                            <div className="text-left">
                              <div className="text-sm font-medium text-white">Pay with Tokens</div>
                              <div className="text-xs text-gray-400">USDC, USDT, etc.</div>
                            </div>
                          </button>
                          
                          <button
                            onClick={() => {
                              setShowCreditsDropdown(false);
                              onShowPayment && onShowPayment();
                            }}
                            className="w-full flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 border border-white/20 transition-colors"
                          >
                            <Wallet className="w-5 h-5 text-gray-400" />
                            <div className="text-left">
                              <div className="text-sm font-medium text-white">Pay with USDC</div>
                              <div className="text-xs text-gray-400">Direct USDC payment</div>
                            </div>
                          </button>
                        </div>

                        {/* Current Status */}
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-400">Current Credits:</span>
                            <span className="text-purple-400 font-semibold">
                              {credits}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Mobile Credits & Menu */}
          <div className="md:hidden flex items-center gap-2">
            {/* Mobile Credits Display */}
            {isConnected && (
              <div className="flex items-center gap-1 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                <Coins className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-medium text-white">
                  {credits}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navigation;
