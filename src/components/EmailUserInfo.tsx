import React, { useState, useEffect, useCallback } from 'react';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import { Mail, LogOut, Coins, RefreshCw, User, MessageCircle, Check, X, Loader2, Copy, Key } from 'lucide-react';
import { WIN95, BTN } from '../utils/buttonStyles';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import { getAuthToken } from '../services/emailAuthService';

interface DiscordStatus {
  linked: boolean;
  discord: {
    id: string;
    username: string;
    avatar: string | null;
    linkedAt: string;
  } | null;
}

interface LinkCodeResponse {
  success: boolean;
  code?: string;
  expiresAt?: string;
  expiresIn?: number;
  error?: string;
}

const EmailUserInfo: React.FC = () => {
  const { email, credits, refreshCredits, signOut, isLoading, isAuthenticated } = useEmailAuth();
  const numericCredits = Math.max(0, Math.floor(Number(credits)) || 0);
  const displayCredits = isLoading ? '...' : numericCredits.toString();
  
  const [discordStatus, setDiscordStatus] = useState<DiscordStatus | null>(null);
  const [loadingDiscord, setLoadingDiscord] = useState(false);
  const [unlinkingDiscord, setUnlinkingDiscord] = useState(false);
  
  // Link code state
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkCodeExpiry, setLinkCodeExpiry] = useState<Date | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  
  // Check Discord link status on mount
  useEffect(() => {
    if (isAuthenticated) {
      checkDiscordStatus();
    }
  }, [isAuthenticated]);
  
  const checkDiscordStatus = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      setLoadingDiscord(true);
      const response = await fetch(`${API_URL}/api/auth/discord/status`, {
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
  }, []);
  
  // Generate a linking code for Discord bot
  const handleGenerateLinkCode = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      setGeneratingCode(true);
      setCodeError(null);
      
      const csrfToken = await ensureCSRFToken();
      const response = await fetch(`${API_URL}/api/auth/discord-link-code`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        },
        credentials: 'include'
      });
      
      const data: LinkCodeResponse = await response.json();
      
      if (data.success && data.code) {
        setLinkCode(data.code);
        setLinkCodeExpiry(data.expiresAt ? new Date(data.expiresAt) : null);
      } else {
        setCodeError(data.error || 'Failed to generate code');
      }
    } catch (error) {
      console.error('Failed to generate link code:', error);
      setCodeError('Failed to generate code. Please try again.');
    } finally {
      setGeneratingCode(false);
    }
  }, []);
  
  // Copy code to clipboard
  const handleCopyCode = async () => {
    if (!linkCode) return;
    try {
      await navigator.clipboard.writeText(linkCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = linkCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };
  
  // Clear link code when it expires
  useEffect(() => {
    if (linkCodeExpiry) {
      const timeout = linkCodeExpiry.getTime() - Date.now();
      if (timeout > 0) {
        const timer = setTimeout(() => {
          setLinkCode(null);
          setLinkCodeExpiry(null);
        }, timeout);
        return () => clearTimeout(timer);
      } else {
        setLinkCode(null);
        setLinkCodeExpiry(null);
      }
    }
  }, [linkCodeExpiry]);
  
  const handleUnlinkDiscord = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      setUnlinkingDiscord(true);
      const csrfToken = await ensureCSRFToken();
      const response = await fetch(`${API_URL}/api/auth/unlink-discord`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        },
        credentials: 'include'
      });
      if (response.ok) {
        setDiscordStatus({ linked: false, discord: null });
        setLinkCode(null);
        setLinkCodeExpiry(null);
      }
    } catch (error) {
      console.error('Failed to unlink Discord:', error);
    } finally {
      setUnlinkingDiscord(false);
    }
  }, []);
  
  // Check URL params for Discord OAuth result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const discordResult = params.get('discord');
    const connectDiscord = params.get('connect');
    
    if (discordResult === 'success') {
      checkDiscordStatus();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    // Auto-generate code if redirected from Discord bot
    if (connectDiscord === 'discord' && isAuthenticated && !discordStatus?.linked) {
      handleGenerateLinkCode();
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [isAuthenticated, discordStatus?.linked, checkDiscordStatus, handleGenerateLinkCode]);

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
                color: numericCredits > 0 ? '#008000' : '#800000',
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
          className="p-1.5"
          style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
          }}
        >
          <div className="flex items-center justify-between">
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
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleGenerateLinkCode}
                    disabled={generatingCode}
                    className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold"
                    style={{
                      ...BTN.base,
                      background: '#5865F2',
                      color: '#ffffff'
                    }}
                    title="Get a code to link in Discord"
                  >
                    {generatingCode ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Key className="w-3 h-3" />
                    )}
                    <span>Get Code</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Link code display */}
          {linkCode && !discordStatus?.linked && (
            <div 
              className="mt-2 p-2"
              style={{
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              <div className="text-[9px] mb-1" style={{ color: WIN95.textDisabled }}>
                Run this in Discord: <span style={{ color: WIN95.text, fontFamily: 'monospace' }}>/link code:{linkCode}</span>
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className="flex-1 text-center py-1 font-mono text-lg font-bold tracking-[0.3em]"
                  style={{
                    background: WIN95.inputBg,
                    color: '#000080',
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }}
                >
                  {linkCode}
                </div>
                <button 
                  onClick={handleCopyCode}
                  className="p-1.5"
                  style={BTN.base}
                  title="Copy code"
                >
                  {codeCopied ? (
                    <Check className="w-4 h-4" style={{ color: '#008000' }} />
                  ) : (
                    <Copy className="w-4 h-4" style={{ color: WIN95.text }} />
                  )}
                </button>
              </div>
              <div className="text-[8px] mt-1 text-center" style={{ color: WIN95.textDisabled }}>
                Code expires in 5 minutes
              </div>
            </div>
          )}
          
          {/* Error display */}
          {codeError && (
            <div 
              className="mt-2 p-1.5 text-[9px]"
              style={{
                background: '#ffcccc',
                color: '#800000',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }}
            >
              {codeError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmailUserInfo;

