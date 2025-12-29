import React from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw } from 'lucide-react';
import { WIN95, BTN, PANEL, TEXT } from '../utils/buttonStyles';

const EmailUserInfo = () => {
  const { email, credits, refreshCredits, signOut, isLoading } = useEmailAuth();
  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits) || 0);

  return (
    <div style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div 
            className="p-1"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
            }}
          >
            <Mail className="w-3 h-3" style={{ color: WIN95.text }} />
          </div>
          <div>
            <h3 className="text-[11px] font-bold" style={{ color: WIN95.text }}>Signed In</h3>
            <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>{email}</p>
          </div>
        </div>
        <button 
          onClick={signOut} 
          className="p-1"
          style={{
            background: WIN95.buttonFace,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
            border: 'none',
            cursor: 'pointer'
          }}
          title="Sign Out"
        >
          <LogOut className="w-3 h-3" style={{ color: WIN95.text }} />
        </button>
      </div>

      <div className="pt-1" style={{ borderTop: `1px solid ${WIN95.bgDark}` }}>
        <div 
          className="flex items-center justify-between p-1"
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
              onClick={refreshCredits} 
              className="p-0.5"
              style={{
                background: WIN95.buttonFace,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                border: 'none',
                cursor: 'pointer'
              }}
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
