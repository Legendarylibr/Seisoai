import React from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw } from 'lucide-react';

const EmailUserInfo = ({ onShowStripePayment }) => {
  const { 
    email, 
    credits, 
    refreshCredits,
    signOut,
    isLoading
  } = useEmailAuth();
  
  // Validate credits display
  const displayCredits = typeof credits === 'number' && !isNaN(credits) 
    ? Math.max(0, Math.floor(credits))
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded" style={{ 
            background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
            border: '2px outset #e0e0e0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}>
            <Mail className="w-3 h-3" style={{ color: '#000000' }} />
          </div>
          <div>
            <h3 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Signed In</h3>
            <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>{email}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="p-1 rounded transition-all duration-300"
          style={{
            background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
            border: '2px outset #f0f0f0',
            boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
          }}
          title="Sign Out"
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
              {isLoading ? '...' : displayCredits}
            </span>
            <button
              onClick={refreshCredits}
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
      </div>
    </div>
  );
};

export default EmailUserInfo;

