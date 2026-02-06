/**
 * AgentMarketplace → Agent Workbench
 * The app's home — build agents, wire capabilities, ship with an API key.
 * Follows the same Win95 window/panel/status-bar patterns as VideoGenerator & ChatAssistant.
 */
import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Bot, Key, Zap, Copy, Check, Plus, ChevronDown,
  Trash2, Download, Shield,
  Image, Film, Music, Mic, Box, Eye, Cpu, Wrench, Code,
  ExternalLink, Terminal, Layers, Activity,
  Play, Globe, Hash
} from 'lucide-react';
import { BTN, PANEL, WIN95, hoverHandlers, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { getCustomAgents, deleteCustomAgent } from '../services/agentRegistryService';
import { API_URL, getAuthToken, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

const AgentCreator = lazy(() => import('./AgentCreator'));

// ── Types ──
interface ToolSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  executionMode: 'sync' | 'queue';
  pricing: { baseUsd: number; credits: number; perUnit?: { usd: number; credits: number; unitType: string } };
  enabled: boolean;
  version: string;
}
interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  name: string;
  credits: number;
  totalCreditsSpent: number;
  totalRequests: number;
  active: boolean;
  lastUsedAt?: string;
  createdAt: string;
  webhookUrl?: string;
}
interface CustomAgent {
  agentId: string;
  name: string;
  description: string;
  type: string;
  tools: string[];
  skillMd?: string;
  createdAt: string;
}

// ── Constants ──
const CATEGORY_META: Record<string, { icon: React.ReactNode; color: string; tab: string }> = {
  'image-generation':  { icon: <Image size={13} />,  color: '#6366f1', tab: 'generate' },
  'image-editing':     { icon: <Image size={13} />,  color: '#8b5cf6', tab: 'generate' },
  'image-processing':  { icon: <Image size={13} />,  color: '#a78bfa', tab: 'generate' },
  'video-generation':  { icon: <Film size={13} />,   color: '#ec4899', tab: 'video' },
  'video-editing':     { icon: <Film size={13} />,   color: '#f472b6', tab: 'video' },
  'audio-generation':  { icon: <Mic size={13} />,    color: '#f59e0b', tab: 'chat' },
  'audio-processing':  { icon: <Mic size={13} />,    color: '#d97706', tab: 'chat' },
  'music-generation':  { icon: <Music size={13} />,  color: '#10b981', tab: 'music' },
  '3d-generation':     { icon: <Box size={13} />,    color: '#06b6d4', tab: 'chat' },
  'vision':            { icon: <Eye size={13} />,    color: '#0ea5e9', tab: 'chat' },
  'training':          { icon: <Cpu size={13} />,    color: '#ef4444', tab: 'training' },
  'utility':           { icon: <Wrench size={13} />, color: '#78716c', tab: 'chat' },
  'text-generation':   { icon: <Code size={13} />,   color: '#22d3ee', tab: 'chat' },
};

const font = 'Tahoma, "MS Sans Serif", sans-serif';
const mono = '"Consolas", "Courier New", monospace';

// ── Helpers ──
const catLabel = (c: string) => c.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
const relTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
};

// ── Win95 Group Box ──
function GroupBox({ title, icon, children, className = '', actions }: {
  title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`relative ${className}`} style={{ border: `1px solid ${WIN95.border.dark}`, padding: '12px 10px 10px', marginTop: 8 }}>
      <div className="absolute flex items-center gap-1.5" style={{
        top: -8, left: 8, background: WIN95.bg, padding: '0 4px',
        fontSize: 10, fontWeight: 'bold', color: WIN95.text, fontFamily: font,
      }}>
        {icon}
        {title}
        {actions && <span className="ml-2">{actions}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Stat Chip ──
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5" style={PANEL.sunken}>
      <span style={{ color: WIN95.textDisabled }}>{icon}</span>
      <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>{label}</span>
      <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: mono }}>{value}</span>
    </div>
  );
}

// ── Component ──
interface AgentMarketplaceProps {
  onNavigate?: (tab: string) => void;
}

const AgentMarketplace: React.FC<AgentMarketplaceProps> = ({ onNavigate }) => {
  const { isConnected, address } = useSimpleWallet();
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyCredits, setNewKeyCredits] = useState(10);
  const [createdKeyRaw, setCreatedKeyRaw] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);
  const [capFilter, setCapFilter] = useState('');

  // ── Data fetching ──
  const fetchTools = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/gateway/tools`);
      const d = await r.json();
      if (d.success) setTools(d.tools || []);
    } catch (e) { logger.error('Fetch tools failed', { error: e }); }
  }, []);

  const fetchApiKeys = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;
    try {
      const r = await fetch(`${API_URL}/api-keys`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.success) setApiKeys(d.keys || []);
    } catch (e) { logger.error('Fetch keys failed', { error: e }); }
  }, []);

  const fetchCustomAgents = useCallback(async () => {
    if (!address) return;
    try {
      const agents = await getCustomAgents(address);
      setCustomAgents(agents as unknown as CustomAgent[]);
    } catch (e) { logger.error('Fetch agents failed', { error: e }); }
  }, [address]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([fetchTools(), isConnected ? fetchApiKeys() : Promise.resolve(), isConnected ? fetchCustomAgents() : Promise.resolve()])
      .finally(() => setIsLoading(false));
  }, [fetchTools, fetchApiKeys, fetchCustomAgents, isConnected]);

  // ── Derived ──
  const toolsByCategory = useMemo(() => {
    const m: Record<string, ToolSummary[]> = {};
    const q = capFilter.toLowerCase();
    for (const t of tools) {
      if (q && !t.name.toLowerCase().includes(q) && !t.category.includes(q) && !t.tags.some(tag => tag.includes(q))) continue;
      (m[t.category] ??= []).push(t);
    }
    return m;
  }, [tools, capFilter]);

  const categories = useMemo(() => Object.keys(toolsByCategory).sort(), [toolsByCategory]);
  const activeKeys = useMemo(() => apiKeys.filter(k => k.active), [apiKeys]);
  const totalRequests = useMemo(() => apiKeys.reduce((s, k) => s + k.totalRequests, 0), [apiKeys]);
  const filteredToolCount = useMemo(() => Object.values(toolsByCategory).reduce((s, arr) => s + arr.length, 0), [toolsByCategory]);

  // ── Actions ──
  const copy = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    try {
      await ensureCSRFToken();
      const token = getAuthToken();
      const r = await fetch(`${API_URL}/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        credentials: 'include',
        body: JSON.stringify({ name: newKeyName.trim(), credits: newKeyCredits }),
      });
      const d = await r.json();
      if (d.success) {
        setCreatedKeyRaw(d.apiKey.key);
        setNewKeyName('');
        setNewKeyCredits(10);
        setShowNewKey(false);
        fetchApiKeys();
      }
    } catch (e) { logger.error('Create key failed', { error: e }); }
    finally { setIsCreatingKey(false); }
  };

  const handleRevokeKey = async (keyId: string) => {
    try {
      await ensureCSRFToken();
      const token = getAuthToken();
      await fetch(`${API_URL}/api-keys/${keyId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
      fetchApiKeys();
    } catch (e) { logger.error('Revoke key failed', { error: e }); }
  };

  const handleDeleteAgent = useCallback(async (agentId: string) => {
    if (await deleteCustomAgent(agentId)) setCustomAgents(prev => prev.filter(a => a.agentId !== agentId));
  }, []);

  const handleDownloadSkill = useCallback((agent: CustomAgent) => {
    if (!agent.skillMd) return;
    const blob = new Blob([agent.skillMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${agent.name.replace(/\s+/g, '-').toLowerCase()}-SKILL.md`; a.click();
    URL.revokeObjectURL(url);
  }, []);

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ fontFamily: font, background: WIN95.bg }}>
        <div className="text-center p-6" style={PANEL.base}>
          <div className="w-6 h-6 mx-auto mb-2 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: WIN95.highlight, borderTopColor: 'transparent' }} />
          <p className="text-[10px] font-bold" style={{ color: WIN95.text }}>Loading Workbench</p>
          <p className="text-[9px] mt-0.5" style={{ color: WIN95.textDisabled }}>Fetching capabilities...</p>
        </div>
      </div>
    );
  }

  const curlExample = `curl -X POST ${window.location.origin}/api/gateway/invoke/image.generate.flux-pro \\
  -H "X-API-Key: sk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"a neon city at dusk"}'`;

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: font }}>

      {/* ═══ TITLE BAR ═══ */}
      <div className="flex items-center gap-2 px-2 py-1 flex-shrink-0" style={WINDOW_TITLE_STYLE}>
        <Bot size={12} />
        <span className="text-[11px] flex-1">Agent Workbench</span>
        <button
          onClick={() => setShowCreator(true)}
          className="flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold"
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            cursor: 'pointer',
            fontFamily: font,
            borderRadius: 0,
          }}
        >
          <Plus size={9} /> New Agent
        </button>
      </div>

      {/* ═══ DASHBOARD STATS ═══ */}
      <div className="flex items-center gap-1 px-2 py-1.5 flex-shrink-0 flex-wrap" style={{ background: WIN95.bg, borderBottom: `1px solid ${WIN95.border.dark}` }}>
        <Stat icon={<Zap size={9} />} label="Tools" value={tools.length} />
        <Stat icon={<Bot size={9} />} label="Agents" value={customAgents.length} />
        <Stat icon={<Key size={9} />} label="Keys" value={activeKeys.length} />
        <Stat icon={<Activity size={9} />} label="Requests" value={totalRequests.toLocaleString()} />
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: isConnected ? WIN95.successText : WIN95.errorText }} />
          <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-3 py-2 space-y-1" style={{ background: WIN95.bg }}>

        {/* ── YOUR AGENTS ── */}
        <GroupBox
          title="Your Agents"
          icon={<Layers size={10} style={{ color: WIN95.highlight }} />}
          actions={
            customAgents.length > 0 ? (
              <button onClick={() => setShowCreator(true)} className="text-[8px] px-1.5 py-0.5" style={BTN.small} {...hoverHandlers}>
                <Plus size={8} />
              </button>
            ) : undefined
          }
        >
          {!isConnected ? (
            <div className="py-3 text-center">
              <Shield size={16} className="mx-auto mb-1.5" style={{ color: WIN95.textDisabled }} />
              <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Connect wallet to build agents</p>
            </div>
          ) : customAgents.length === 0 ? (
            <div className="py-4 text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 mb-2" style={{
                ...PANEL.sunken,
                borderRadius: 0,
              }}>
                <Bot size={20} style={{ color: WIN95.textDisabled }} />
              </div>
              <p className="text-[10px] font-bold mb-0.5" style={{ color: WIN95.text }}>No agents yet</p>
              <p className="text-[9px] mb-2.5 max-w-xs mx-auto" style={{ color: WIN95.textDisabled }}>
                Create an agent to bundle capabilities, generate a SKILL.md, and export it for use in any framework.
              </p>
              <button
                onClick={() => setShowCreator(true)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold generate-btn"
                style={{ border: 'none', cursor: 'pointer', fontFamily: font }}
              >
                <Plus size={10} /> Build Your First Agent
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
              {customAgents.map(agent => (
                <div key={agent.agentId} className="p-2 flex items-start gap-2" style={PANEL.sunken}>
                  <div className="w-7 h-7 flex items-center justify-center flex-shrink-0" style={{
                    background: WIN95.highlight,
                    color: WIN95.highlightText,
                  }}>
                    <Bot size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold truncate" style={{ color: WIN95.text }}>{agent.name}</span>
                      <span className="text-[8px] px-1 flex-shrink-0" style={{ background: WIN95.bgDark, color: WIN95.textDisabled }}>{agent.type}</span>
                    </div>
                    <p className="text-[9px] mt-0.5 line-clamp-1" style={{ color: WIN95.textDisabled }}>{agent.description}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>
                        <Hash size={7} className="inline" /> {agent.tools?.length || 0} tools
                      </span>
                      <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>&middot; {relTime(agent.createdAt)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    {agent.skillMd && (
                      <button onClick={() => handleDownloadSkill(agent)} className="p-1" style={BTN.small} title="Export SKILL.md" {...hoverHandlers}>
                        <Download size={9} />
                      </button>
                    )}
                    <button onClick={() => handleDeleteAgent(agent.agentId)} className="p-1" style={BTN.small} title="Delete agent" {...hoverHandlers}>
                      <Trash2 size={9} style={{ color: WIN95.errorText }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GroupBox>

        {/* ── CAPABILITIES ── */}
        <GroupBox
          title={`Capabilities — ${filteredToolCount} tool${filteredToolCount !== 1 ? 's' : ''}`}
          icon={<Zap size={10} style={{ color: WIN95.highlight }} />}
          actions={
            <div className="relative">
              <input
                type="text"
                placeholder="filter..."
                value={capFilter}
                onChange={e => setCapFilter(e.target.value)}
                className="pl-1.5 pr-1 py-0.5 text-[8px] w-20"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`,
                  border: 'none', color: WIN95.text, fontFamily: font, outline: 'none',
                }}
              />
            </div>
          }
        >
          {categories.length === 0 ? (
            <p className="text-[9px] py-2 text-center" style={{ color: WIN95.textDisabled }}>No tools match filter</p>
          ) : (
            <div className="space-y-0.5 mt-1">
              {categories.map(cat => {
                const catTools = toolsByCategory[cat];
                const meta = CATEGORY_META[cat] || { icon: <Zap size={13} />, color: WIN95.highlight, tab: 'chat' };
                const isOpen = expandedCat === cat;
                return (
                  <div key={cat}>
                    {/* Category header */}
                    <button
                      onClick={() => setExpandedCat(isOpen ? null : cat)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left group"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: font }}
                    >
                      <span className="flex items-center justify-center w-5 h-5 flex-shrink-0"
                        style={{ background: meta.color, color: '#fff', fontSize: 0 }}>
                        {meta.icon}
                      </span>
                      <span className="flex-1 text-[10px] font-bold" style={{ color: WIN95.text }}>
                        {catLabel(cat)}
                      </span>
                      <span className="text-[8px] font-bold px-1.5 py-0.5" style={{
                        background: isOpen ? WIN95.highlight : WIN95.bgDark,
                        color: isOpen ? WIN95.highlightText : WIN95.textDisabled,
                      }}>
                        {catTools.length}
                      </span>
                      <ChevronDown size={10} style={{
                        color: WIN95.textDisabled,
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease',
                      }} />
                    </button>

                    {/* Expanded tool list */}
                    {isOpen && (
                      <div className="ml-2 mr-1 mb-1 border-l-2 pl-2 space-y-0.5"
                        style={{ borderColor: meta.color }}>
                        {catTools.map(tool => (
                          <div key={tool.id} className="flex items-center gap-1.5 px-1.5 py-1"
                            style={{ background: WIN95.inputBg, boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}` }}>
                            <div className="flex-1 min-w-0">
                              <div className="text-[9px] font-bold truncate" style={{ color: WIN95.text }}>{tool.name}</div>
                              <div className="text-[8px] truncate" style={{ color: WIN95.textDisabled }}>{tool.description}</div>
                            </div>
                            <span className="text-[8px] font-bold px-1 py-0.5 flex-shrink-0"
                              style={{ background: WIN95.bgDark, color: WIN95.text, fontFamily: mono }}>
                              {tool.pricing.credits}cr
                            </span>
                            <button onClick={() => copy(tool.id, tool.id)}
                              className="p-0.5 flex-shrink-0" style={{ ...BTN.small, cursor: 'pointer' }}
                              title={`Copy: ${tool.id}`} {...hoverHandlers}>
                              {copied === tool.id ? <Check size={9} style={{ color: WIN95.successText }} /> : <Copy size={9} />}
                            </button>
                            {onNavigate && meta.tab && (
                              <button onClick={() => onNavigate(meta.tab)}
                                className="p-0.5 flex-shrink-0" style={{ ...BTN.small, cursor: 'pointer' }}
                                title="Try it" {...hoverHandlers}>
                                <Play size={9} style={{ color: meta.color }} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </GroupBox>

        {/* ── API ACCESS ── */}
        <GroupBox
          title="API Access"
          icon={<Key size={10} style={{ color: WIN95.highlight }} />}
          actions={
            isConnected && !showNewKey ? (
              <button onClick={() => setShowNewKey(true)} className="text-[8px] px-1.5 py-0.5 flex items-center gap-0.5"
                style={BTN.small} {...hoverHandlers}>
                <Plus size={8} /> Key
              </button>
            ) : undefined
          }
        >
          {!isConnected ? (
            <div className="py-3 text-center">
              <Key size={16} className="mx-auto mb-1.5" style={{ color: WIN95.textDisabled }} />
              <p className="text-[10px]" style={{ color: WIN95.textDisabled }}>Connect wallet to create API keys</p>
            </div>
          ) : (
            <div className="space-y-1.5 mt-1">
              {/* New key form */}
              {showNewKey && (
                <div className="flex items-center gap-1.5 p-1.5" style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, 0 0 0 1px ${WIN95.highlight}`,
                }}>
                  <input type="text" placeholder="key name" value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)} maxLength={64} autoFocus
                    className="flex-1 px-1.5 py-1 text-[9px]"
                    style={{ background: '#fff', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`, border: 'none', color: WIN95.text, fontFamily: font, outline: 'none' }}
                  />
                  <input type="number" value={newKeyCredits}
                    onChange={e => setNewKeyCredits(Math.max(0, parseInt(e.target.value) || 0))}
                    min={0} className="w-14 px-1.5 py-1 text-[9px] text-right"
                    style={{ background: '#fff', boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`, border: 'none', color: WIN95.text, fontFamily: mono, outline: 'none' }}
                    title="Credits to load"
                  />
                  <button onClick={handleCreateKey} disabled={!newKeyName.trim() || isCreatingKey}
                    className="px-2 py-1 text-[9px] font-bold generate-btn"
                    style={{ border: 'none', cursor: newKeyName.trim() && !isCreatingKey ? 'pointer' : 'default', fontFamily: font, opacity: newKeyName.trim() && !isCreatingKey ? 1 : 0.5 }}>
                    {isCreatingKey ? '...' : 'Create'}
                  </button>
                  <button onClick={() => { setShowNewKey(false); setNewKeyName(''); }}
                    className="px-1.5 py-1 text-[9px]" style={{ ...BTN.small, cursor: 'pointer' }} {...hoverHandlers}>
                    Cancel
                  </button>
                </div>
              )}

              {/* Created key alert */}
              {createdKeyRaw && (
                <div className="p-2" style={{ background: WIN95.bg, border: `2px solid ${WIN95.successText}` }}>
                  <div className="flex items-center gap-1 mb-1">
                    <Check size={10} style={{ color: WIN95.successText }} />
                    <span className="text-[9px] font-bold" style={{ color: WIN95.successText }}>Key created — copy now, shown once</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <code className="flex-1 text-[8px] px-1.5 py-1 select-all" style={{
                      background: WIN95.inputBg, color: WIN95.text,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`, wordBreak: 'break-all', fontFamily: mono,
                    }}>
                      {createdKeyRaw}
                    </code>
                    <button onClick={() => copy(createdKeyRaw, 'raw-key')} className="p-1" style={{ ...BTN.small, cursor: 'pointer' }} {...hoverHandlers}>
                      {copied === 'raw-key' ? <Check size={10} style={{ color: WIN95.successText }} /> : <Copy size={10} />}
                    </button>
                  </div>
                  <button onClick={() => setCreatedKeyRaw('')} className="mt-1 text-[8px] underline"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: WIN95.textDisabled }}>
                    dismiss
                  </button>
                </div>
              )}

              {/* Key list */}
              {activeKeys.length === 0 && !showNewKey && (
                <p className="text-[9px] py-1 text-center" style={{ color: WIN95.textDisabled }}>No API keys — create one to get started</p>
              )}
              {activeKeys.map(k => (
                <div key={k.id} className="flex items-center gap-1.5 px-2 py-1" style={PANEL.sunken}>
                  <Key size={9} style={{ color: WIN95.textDisabled }} />
                  <span className="text-[9px] font-bold truncate" style={{ color: WIN95.text }}>{k.name}</span>
                  <code className="text-[8px]" style={{ color: WIN95.textDisabled, fontFamily: mono }}>{k.keyPrefix}...</code>
                  <div className="flex-1" />
                  <span className="text-[8px] font-bold" style={{ color: WIN95.text, fontFamily: mono }}>{k.credits.toFixed(1)}cr</span>
                  <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>{k.totalRequests} req</span>
                  {k.lastUsedAt && <span className="text-[7px]" style={{ color: WIN95.textDisabled }}>{relTime(k.lastUsedAt)}</span>}
                  <button onClick={() => handleRevokeKey(k.id)} className="p-0.5" style={{ ...BTN.small, cursor: 'pointer' }} title="Revoke" {...hoverHandlers}>
                    <Trash2 size={8} style={{ color: WIN95.errorText }} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </GroupBox>

        {/* ── QUICK INTEGRATE ── */}
        <GroupBox title="Quick Integrate" icon={<Terminal size={10} style={{ color: WIN95.highlight }} />}>
          <div className="mt-1 relative">
            <pre className="text-[8px] sm:text-[9px] p-2 overflow-x-auto" style={{
              ...PANEL.sunken, color: WIN95.text, fontFamily: mono,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7,
            }}>
              {curlExample}
            </pre>
            <button onClick={() => copy(curlExample, 'curl')}
              className="absolute top-2.5 right-2.5 p-1" style={{ ...BTN.small, cursor: 'pointer' }} {...hoverHandlers}>
              {copied === 'curl' ? <Check size={9} style={{ color: WIN95.successText }} /> : <Copy size={9} />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {[
              { href: '/api/gateway', label: 'Gateway', icon: <Globe size={8} /> },
              { href: '/api/gateway/mcp-manifest', label: 'MCP', icon: <Bot size={8} /> },
              { href: '/api/gateway/schema', label: 'OpenAPI', icon: <Code size={8} /> },
              { href: '/api/docs', label: 'Docs', icon: <ExternalLink size={8} /> },
            ].map(link => (
              <a key={link.label} href={`${window.location.origin}${link.href}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold no-underline"
                style={{ ...BTN.base, color: WIN95.text }} {...hoverHandlers}>
                {link.icon} {link.label}
              </a>
            ))}
          </div>
        </GroupBox>

      </div>

      {/* ═══ STATUS BAR ═══ */}
      <div className="flex items-center gap-0.5 px-1 py-0.5 flex-shrink-0" style={{ background: WIN95.bg, borderTop: `1px solid ${WIN95.border.light}` }}>
        <div className="flex-1 px-1.5 py-0.5 text-[8px] truncate" style={{
          ...PANEL.sunken, color: WIN95.textDisabled,
        }}>
          {isConnected
            ? `${address?.slice(0, 6)}...${address?.slice(-4)} — ${customAgents.length} agent${customAgents.length !== 1 ? 's' : ''}, ${activeKeys.length} key${activeKeys.length !== 1 ? 's' : ''}`
            : 'Connect wallet to unlock agent builder & API keys'}
        </div>
        <div className="px-1.5 py-0.5 text-[8px]" style={{ ...PANEL.sunken, color: WIN95.textDisabled }}>
          {tools.length} capabilities
        </div>
        <div className="px-1.5 py-0.5 text-[8px] font-bold" style={{ ...PANEL.sunken, color: WIN95.text }}>
          SeisoAI
        </div>
      </div>

      {/* ═══ AGENT CREATOR MODAL ═══ */}
      {showCreator && (
        <Suspense fallback={null}>
          <AgentCreator isOpen={showCreator} onClose={() => setShowCreator(false)} onCreated={() => fetchCustomAgents()} />
        </Suspense>
      )}
    </div>
  );
};

export default AgentMarketplace;
