import React, { useState, useEffect } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw, User, MessageCircle, Check, X, Loader2 } from 'lucide-react';
import { WIN95, BTN, PANEL, TEXT } from '../utils/buttonStyles';
import { apiBaseUrl } from '../services/apiConfig';

interface DiscordStatus {
  linked: boolean;
  discord: {
    id: string;
    username: string;
    avatar: string | null;
    linkedAt: string;
  } | null;
}

const EmailUserInfo: React.FC = () => {
  const { email, credits, refreshCredits, signOut, isLoading, token } = useEmailAuth();
  const displayCredits = isLoading ? '...' : Math.max(0, Math.floor(credits) || 0);
  
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [loadingDiscord, setLoadingDiscord] = useState(false);
  const [unlinkingDiscord, setUnlinkingDiscord] = useState(false);
  
  // Check Discord link status on mount
  useEffect(() => {
    if (token) {
      checkDiscordStatus();
    }
  }, [token]);
  
  const checkDiscordStatus = async () => {
    if (!token) return;
    try {
      setLoadingDiscord(true);
      const response = await fetch(`${apiBaseUrl}/api/auth/discord/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setDiscordStatus(data);
      }
    } catch (error) {
      console.error('Failed to check Discord status:', error);
    } finally {
      setLoadingDiscord(false);
    }
  };
  
  const handleConnectDiscord = () => {
    // Redirect to Discord OAuth - the backend will handle the rest
    window.location.href = `${apiBaseUrl}/api/auth/discord`;
  };
  
  const handleUnlinkDiscord = async () => {
    if (!token) return;
    try {
      setUnlinkingDiscord(true);
      const response = await fetch(`${apiBaseUrl}/api/auth/discord`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.ok) {
        setDiscordStatus({ linked: false, discord: null });
      }
    } catch (error) {
      console.error('Failed to unlink Discord:', error);
    } finally {
      setUnlinkingDiscord(false);
    }
  };
  
  // Check URL params for Discord OAuth result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discordResult = params.get('discord');
    if (discordResult === 'success') {
      checkDiscordStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

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
        
        {/* Discord connection row */}
        <div 
          className="flex items-center justify-between p-1.5"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
          }}
        >
          <div className="flex items-center gap-1.5">
            <MessageCircle className="w-4 h-4" style={{ color: '#5865F2' }} />
            <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>Discord:</span>
          </div>
          <div className="flex items-center gap-2">
            {loadingDiscord ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: WIN95.text }} />
            ) : discordStatus?.linked && discordStatus.discord ? (
              <>
                <div className="flex items-center gap-1.5">
                  <Check className="w-3 h-3" style={{ color: '#008000' }} />
                  <span 
                    className="text-[10px] px-1.5 py-0.5" 
                    style={{ 
                      color: WIN95.text,
                      background: WIN95.bg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                    }}
                  >
                    {discordStatus.discord.username}
                  </span>
                </div>
                <button 
                  onClick={handleUnlinkDiscord}
                  disabled={unlinkingDiscord}
                  className="p-1"
                  style={BTN.base}
                  title="Disconnect Discord"
                >
                  {unlinkingDiscord ? (
                    <Loader2 className="w-3 h-3 animate-spin" style={{ color: WIN95.text }} />
                  ) : (
                    <X className="w-3 h-3" style={{ color: '#800000' }} />
                  )}
                </button>
              </>
            ) : (
              <button 
                onClick={handleConnectDiscord}
                className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold"
                style={{
                  ...BTN.base,
                  background: '#5865F2',
                  color: '#ffffff'
                }}
                title="Connect Discord to use the bot"
              >
                <MessageCircle className="w-3 h-3" />
                <span>Connect</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailUserInfo;

