import React from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw, User } from 'lucide-react';
import { WIN95, BTN, PANEL, TEXT } from '../utils/buttonStyles';

const EmailUserInfo: React.FC = () => {
  const { email, credits, refreshCredits, signOut, isLoading } = useEmailAuth();
  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits) || 0);

  return (
    <div 
      style={{ 
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Title bar */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <User className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold">Account</span>
      </div>
      
      {/* Content */}
      <div className="p-2 space-y-2">
        {/* User info row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div 
              className="p-1.5"
              style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              <Mail className="w-3.5 h-3.5" style={{ color: WIN95.highlight }} />
            </div>
            <div>
              <p className="text-[9px]" style={{ color: WIN95.textDisabled }}>Signed in as</p>
              <p className="text-[10px] font-bold" style={{ color: WIN95.text }}>{email}</p>
            </div>
          </div>
          <button 
            onClick={signOut} 
            className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold"
            style={BTN.base}
            title="Sign Out"
          >
            <LogOut className="w-3 h-3" />
            <span>Sign Out</span>
          </button>
        </div>

        {/* Credits row */}
        <div 
          className="flex items-center justify-between p-1.5"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
          }}
        >
          <div className="flex items-center gap-1.5">
            <Coins className="w-4 h-4" style={{ color: '#808000' }} />
            <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>Credits:</span>
          </div>
          <div className="flex items-center gap-2">
            <span 
              className="font-bold text-[12px] px-2 py-0.5" 
              style={{ 
                color: displayCredits > 0 ? '#008000' : '#800000',
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              {displayCredits}
            </span>
            <button 
              onClick={refreshCredits} 
              className="p-1"
              style={BTN.base}
              title="Refresh credits"
            >
              <RefreshCw className="w-3 h-3" style={{ color: WIN95.text }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailUserInfo;

