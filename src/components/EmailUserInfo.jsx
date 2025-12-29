import React from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw } from 'lucide-react';
import { BTN, PANEL, TEXT } from '../utils/buttonStyles';

const EmailUserInfo = () => {
  const { email, credits, refreshCredits, signOut, isLoading } = useEmailAuth();
  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits) || 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <div className="p-1 rounded" style={BTN.small}>
            <Mail className="w-3 h-3" style={{color:'#000'}} />
          </div>
          <div>
            <h3 className="text-xs font-semibold" style={TEXT.primary}>Signed In</h3>
            <p className="text-xs" style={TEXT.secondary}>{email}</p>
          </div>
        </div>
        <button onClick={signOut} className="p-1 rounded" style={BTN.small} title="Sign Out">
          <LogOut className="w-3 h-3" style={{color:'#000'}} />
        </button>
      </div>

      <div className="space-y-1 pt-1 border-t" style={{borderColor:'#d0d0d0'}}>
        <div className="flex items-center justify-between p-1 rounded" style={PANEL.base}>
          <div className="flex items-center gap-1">
            <Coins className="w-3 h-3" style={{color:'#000'}} />
            <span className="text-xs font-medium" style={TEXT.primary}>Credits:</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-sm" style={TEXT.primary}>{displayCredits}</span>
            <button onClick={refreshCredits} className="p-0.5 rounded" style={BTN.small} title="Refresh credits">
              <RefreshCw className="w-3 h-3" style={{color:'#000'}} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailUserInfo;
