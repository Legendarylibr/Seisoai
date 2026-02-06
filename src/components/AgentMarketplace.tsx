/**
 * AgentMarketplace Component
 * Public-facing marketplace page for discovering SeisoAI's AI capabilities
 * Shows all available tools, pricing, API docs, and API key management
 */
import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  Bot, Key, Zap, DollarSign, Code, Copy, Check, Plus,
  Trash2, RefreshCw, ExternalLink, Search, Tag,
  Image, Film, Music, Mic, Box, Eye, Cpu, Wrench, Download
} from 'lucide-react';
import { BTN, PANEL, hoverHandlers, WINDOW_TITLE_STYLE, WIN95 } from '../utils/buttonStyles';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { getCustomAgents, deleteCustomAgent } from '../services/agentRegistryService';
import { API_URL, getAuthToken, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

const AgentCreator = lazy(() => import('./AgentCreator'));

// Types
interface ToolPricing {
  baseUsd: number;
  credits: number;
  perUnit?: {
    usd: number;
    credits: number;
    unitType: string;
  };
}

interface ToolSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  executionMode: 'sync' | 'queue';
  pricing: ToolPricing;
  enabled: boolean;
  version: string;
}

interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  name: string;
  credits: number;
  totalCreditsLoaded: number;
  totalCreditsSpent: number;
  totalRequests: number;
  active: boolean;
  lastUsedAt?: string;
  createdAt: string;
  webhookUrl?: string;
}

interface NewKeyResponse {
  key: string;
  keyPrefix: string;
  name: string;
  credits: number;
}

// Category icons
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'image-generation': <Image size={14} />,
  'image-editing': <Image size={14} />,
  'image-processing': <Image size={14} />,
  'video-generation': <Film size={14} />,
  'video-editing': <Film size={14} />,
  'audio-generation': <Mic size={14} />,
  'audio-processing': <Mic size={14} />,
  'music-generation': <Music size={14} />,
  '3d-generation': <Box size={14} />,
  'vision': <Eye size={14} />,
  'training': <Cpu size={14} />,
  'utility': <Wrench size={14} />,
  'text-generation': <Code size={14} />,
};

// Custom agent type
interface CustomAgent {
  agentId: string;
  name: string;
  description: string;
  type: string;
  tools: string[];
  skillMd?: string;
  createdAt: string;
}

const AgentMarketplace: React.FC = () => {
  const { isConnected, address } = useSimpleWallet();
  const [activeTab, setActiveTab] = useState<'tools' | 'api-keys' | 'docs'>('tools');
  const [tools, setTools] = useState<ToolSummary[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copied, setCopied] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyCredits, setNewKeyCredits] = useState(10);
  const [newKeyWebhook, setNewKeyWebhook] = useState('');
  const [createdKey, setCreatedKey] = useState<NewKeyResponse | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  // Agent Creator state
  const [showAgentCreator, setShowAgentCreator] = useState(false);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);

  // Fetch custom agents
  const fetchCustomAgents = useCallback(async () => {
    if (!address) return;
    try {
      const agents = await getCustomAgents(address);
      setCustomAgents(agents as unknown as CustomAgent[]);
    } catch (error) {
      logger.error('Failed to fetch custom agents', { error });
    }
  }, [address]);

  const handleDeleteAgent = useCallback(async (agentId: string) => {
    const success = await deleteCustomAgent(agentId);
    if (success) {
      setCustomAgents((prev) => prev.filter((a) => a.agentId !== agentId));
    }
  }, []);

  const handleDownloadSkillMd = useCallback((agent: CustomAgent) => {
    if (!agent.skillMd) return;
    const blob = new Blob([agent.skillMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Fetch tools from gateway
  const fetchTools = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/gateway/tools`);
      const data = await response.json();
      if (data.success) {
        setTools(data.tools || []);
      }
    } catch (error) {
      logger.error('Failed to fetch tools', { error });
    }
  }, []);

  // Fetch API keys
  const fetchApiKeys = useCallback(async () => {
    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/api-keys`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setApiKeys(data.keys || []);
      }
    } catch (error) {
      logger.error('Failed to fetch API keys', { error });
    }
  }, []);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetchTools(),
      isConnected ? fetchApiKeys() : Promise.resolve(),
      isConnected ? fetchCustomAgents() : Promise.resolve(),
    ]).finally(() => setIsLoading(false));
  }, [fetchTools, fetchApiKeys, fetchCustomAgents, isConnected]);

  // Create API key
  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);

    try {
      await ensureCSRFToken();
      const token = getAuthToken();
      const response = await fetch(`${API_URL}/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          name: newKeyName.trim(),
          credits: newKeyCredits,
          webhookUrl: newKeyWebhook.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setCreatedKey({
          key: data.apiKey.key,
          keyPrefix: data.apiKey.keyPrefix,
          name: data.apiKey.name,
          credits: data.apiKey.credits,
        });
        setNewKeyName('');
        setNewKeyCredits(10);
        setNewKeyWebhook('');
        fetchApiKeys();
      }
    } catch (error) {
      logger.error('Failed to create API key', { error });
    } finally {
      setIsCreatingKey(false);
    }
  };

  // Revoke API key
  const handleRevokeKey = async (keyId: string) => {
    try {
      await ensureCSRFToken();
      const token = getAuthToken();
      await fetch(`${API_URL}/api-keys/${keyId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
        credentials: 'include',
      });
      fetchApiKeys();
    } catch (error) {
      logger.error('Failed to revoke API key', { error });
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  // Filter tools
  const filteredTools = tools.filter(tool => {
    const matchesSearch = !searchQuery ||
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Get unique categories
  const categories = ['all', ...Array.from(new Set(tools.map(t => t.category)))];

  const tabs = [
    { id: 'tools' as const, label: 'Tools', icon: <Zap size={12} /> },
    { id: 'api-keys' as const, label: 'API Keys', icon: <Key size={12} /> },
    { id: 'docs' as const, label: 'Quick Start', icon: <Code size={12} /> },
  ];

  return (
    <div className="h-full flex flex-col p-2 sm:p-4 overflow-auto" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      {/* Window */}
      <div className="max-w-6xl mx-auto w-full" style={{ ...PANEL.window }}>
        {/* Title Bar */}
        <div className="flex items-center justify-between px-2 py-1" style={WINDOW_TITLE_STYLE}>
          <div className="flex items-center gap-1.5">
            <Bot size={14} />
            <span className="text-[12px] font-bold">Agent Marketplace</span>
          </div>
          <span className="text-[10px] opacity-80">{tools.length} tools available</span>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-0 px-2 pt-1 items-end" style={{ background: 'var(--win95-bg)' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold"
              style={{
                background: activeTab === tab.id ? 'var(--win95-bg)' : 'var(--win95-bg-dark)',
                color: activeTab === tab.id ? 'var(--win95-text)' : 'var(--win95-text-disabled)',
                boxShadow: activeTab === tab.id
                  ? 'inset 1px 1px 0 var(--win95-border-light), inset -1px 0 0 var(--win95-border-darker), 0 1px 0 var(--win95-bg)'
                  : 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)',
                border: 'none',
                cursor: 'pointer',
                marginBottom: activeTab === tab.id ? '-1px' : '0',
                zIndex: activeTab === tab.id ? 1 : 0,
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          {isConnected && (
            <button
              onClick={() => setShowAgentCreator(true)}
              className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold mb-0.5 generate-btn"
              style={{
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              }}
            >
              <Plus size={12} />
              Create Agent
            </button>
          )}
        </div>

        {/* Content Area */}
        <div className="p-3" style={{ background: 'var(--win95-bg)', minHeight: '400px' }}>

          {/* TOOLS TAB */}
          {activeTab === 'tools' && (
            <div>
              {/* Search & Filter Bar */}
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <div className="flex-1 relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2" style={{ color: 'var(--win95-text-disabled)' }} />
                  <input
                    type="text"
                    placeholder="Search tools..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-6 pr-2 py-1 text-[11px]"
                    style={{
                      background: 'var(--win95-input-bg)',
                      boxShadow: 'inset 1px 1px 0 var(--win95-border-dark), inset -1px -1px 0 var(--win95-border-light)',
                      border: 'none',
                      color: 'var(--win95-text)',
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                    }}
                  />
                </div>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="px-2 py-1 text-[11px]"
                  style={{
                    ...BTN.base,
                    cursor: 'pointer',
                  }}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat === 'all' ? 'All Categories' : cat.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    </option>
                  ))}
                </select>
              </div>

              {/* Tools Grid */}
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw size={16} className="animate-spin mr-2" style={{ color: 'var(--win95-text-disabled)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--win95-text-disabled)' }}>Loading tools...</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {filteredTools.map(tool => (
                    <div
                      key={tool.id}
                      className="p-2"
                      style={{
                        ...PANEL.base,
                        borderBottom: '2px solid var(--win95-border-darker)',
                      }}
                    >
                      {/* Tool Header */}
                      <div className="flex items-start gap-1.5 mb-1">
                        <span className="mt-0.5 flex-shrink-0" style={{ color: 'var(--win95-highlight)' }}>
                          {CATEGORY_ICONS[tool.category] || <Zap size={14} />}
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-[11px] font-bold truncate" style={{ color: 'var(--win95-text)' }}>
                            {tool.name}
                          </h3>
                          <p className="text-[9px] line-clamp-2 mt-0.5" style={{ color: 'var(--win95-text-disabled)' }}>
                            {tool.description}
                          </p>
                        </div>
                      </div>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-0.5 mb-1.5">
                        {tool.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="flex items-center gap-0.5 px-1 text-[8px]"
                            style={{
                              background: 'var(--win95-bg-dark)',
                              color: 'var(--win95-text-disabled)',
                            }}
                          >
                            <Tag size={7} />
                            {tag}
                          </span>
                        ))}
                      </div>

                      {/* Pricing */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <DollarSign size={10} style={{ color: 'var(--win95-success-text)' }} />
                          <span className="text-[10px] font-bold" style={{ color: 'var(--win95-text)' }}>
                            {tool.pricing.credits} {tool.pricing.credits === 1 ? 'credit' : 'credits'}
                          </span>
                          {tool.pricing.perUnit && (
                            <span className="text-[9px]" style={{ color: 'var(--win95-text-disabled)' }}>
                              (+{tool.pricing.perUnit.credits}/{tool.pricing.perUnit.unitType})
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] px-1" style={{
                          background: tool.executionMode === 'sync' ? 'var(--win95-highlight)' : 'var(--win95-bg-dark)',
                          color: tool.executionMode === 'sync' ? '#fff' : 'var(--win95-text)',
                        }}>
                          {tool.executionMode === 'sync' ? 'instant' : 'async'}
                        </span>
                      </div>

                      {/* Tool ID (copyable) */}
                      <div className="mt-1.5 flex items-center gap-1">
                        <code className="text-[9px] flex-1 truncate px-1 py-0.5" style={{
                          background: 'var(--win95-input-bg)',
                          color: 'var(--win95-text-disabled)',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-dark)',
                        }}>
                          {tool.id}
                        </code>
                        <button
                          onClick={() => copyToClipboard(tool.id, tool.id)}
                          className="p-0.5"
                          style={{ ...BTN.small, cursor: 'pointer', border: 'none' }}
                          title="Copy tool ID"
                        >
                          {copied === tool.id ? <Check size={10} /> : <Copy size={10} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && filteredTools.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-[11px]" style={{ color: 'var(--win95-text-disabled)' }}>No tools match your search</p>
                </div>
              )}
            </div>
          )}

          {/* API KEYS TAB */}
          {activeTab === 'api-keys' && (
            <div>
              {!isConnected ? (
                <div className="text-center py-8" style={{ ...PANEL.sunken }}>
                  <Key size={24} className="mx-auto mb-2" style={{ color: 'var(--win95-text-disabled)' }} />
                  <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--win95-text)' }}>Sign in to manage API keys</p>
                  <p className="text-[10px]" style={{ color: 'var(--win95-text-disabled)' }}>
                    Create API keys to let your agents access SeisoAI tools programmatically
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Create New Key Form */}
                  <div className="p-2" style={PANEL.base}>
                    <h3 className="text-[11px] font-bold mb-2 flex items-center gap-1" style={{ color: 'var(--win95-text)' }}>
                      <Plus size={12} /> Create New API Key
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                      <input
                        type="text"
                        placeholder="Key name (e.g., my-agent)"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        maxLength={100}
                        className="px-2 py-1 text-[11px]"
                        style={{
                          background: 'var(--win95-input-bg)',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-dark), inset -1px -1px 0 var(--win95-border-light)',
                          border: 'none',
                          color: 'var(--win95-text)',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Credits to allocate"
                        value={newKeyCredits}
                        onChange={(e) => setNewKeyCredits(Math.max(0, parseInt(e.target.value) || 0))}
                        min={0}
                        className="px-2 py-1 text-[11px]"
                        style={{
                          background: 'var(--win95-input-bg)',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-dark), inset -1px -1px 0 var(--win95-border-light)',
                          border: 'none',
                          color: 'var(--win95-text)',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        }}
                      />
                      <input
                        type="text"
                        placeholder="Webhook URL (optional)"
                        value={newKeyWebhook}
                        onChange={(e) => setNewKeyWebhook(e.target.value)}
                        className="px-2 py-1 text-[11px]"
                        style={{
                          background: 'var(--win95-input-bg)',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-dark), inset -1px -1px 0 var(--win95-border-light)',
                          border: 'none',
                          color: 'var(--win95-text)',
                          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                        }}
                      />
                    </div>
                    <button
                      onClick={handleCreateKey}
                      disabled={!newKeyName.trim() || isCreatingKey}
                      className="px-3 py-1 text-[11px] font-bold"
                      style={newKeyName.trim() && !isCreatingKey ? BTN.base : BTN.disabled}
                      {...(newKeyName.trim() && !isCreatingKey ? hoverHandlers : {})}
                    >
                      {isCreatingKey ? 'Creating...' : 'Create Key'}
                    </button>
                  </div>

                  {/* Newly Created Key Display */}
                  {createdKey && (
                    <div className="p-2" style={{ background: 'var(--win95-bg)', border: '2px solid var(--win95-highlight)' }}>
                      <p className="text-[11px] font-bold mb-1" style={{ color: 'var(--win95-highlight)' }}>
                        Key Created - Copy it now! It won't be shown again.
                      </p>
                      <div className="flex items-center gap-1">
                        <code className="flex-1 text-[10px] px-2 py-1 select-all" style={{
                          background: 'var(--win95-input-bg)',
                          color: 'var(--win95-text)',
                          boxShadow: 'inset 1px 1px 0 var(--win95-border-dark)',
                          wordBreak: 'break-all',
                        }}>
                          {createdKey.key}
                        </code>
                        <button
                          onClick={() => copyToClipboard(createdKey.key, 'new-key')}
                          className="p-1 flex-shrink-0"
                          style={{ ...BTN.small, cursor: 'pointer', border: 'none' }}
                        >
                          {copied === 'new-key' ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <button
                        onClick={() => setCreatedKey(null)}
                        className="mt-1 px-2 py-0.5 text-[10px]"
                        style={{ ...BTN.small, cursor: 'pointer', border: 'none' }}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {/* Existing Keys */}
                  <div>
                    <h3 className="text-[11px] font-bold mb-1.5 flex items-center gap-1" style={{ color: 'var(--win95-text)' }}>
                      <Key size={12} /> Your API Keys ({apiKeys.length})
                    </h3>
                    {apiKeys.length === 0 ? (
                      <p className="text-[10px] text-center py-4" style={{ ...PANEL.sunken, color: 'var(--win95-text-disabled)' }}>
                        No API keys yet. Create one above to get started.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {apiKeys.map(key => (
                          <div key={key.id} className="flex items-center justify-between p-2" style={PANEL.base}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold" style={{ color: 'var(--win95-text)' }}>{key.name}</span>
                                <code className="text-[9px]" style={{ color: 'var(--win95-text-disabled)' }}>{key.keyPrefix}...</code>
                                <span className={`text-[8px] px-1 ${key.active ? '' : 'line-through'}`} style={{
                                  background: key.active ? 'var(--win95-highlight)' : 'var(--win95-bg-dark)',
                                  color: key.active ? '#fff' : 'var(--win95-text-disabled)',
                                }}>
                                  {key.active ? 'active' : 'revoked'}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5">
                                <span className="text-[9px]" style={{ color: 'var(--win95-text-disabled)' }}>
                                  Credits: <b style={{ color: 'var(--win95-text)' }}>{key.credits.toFixed(1)}</b>
                                </span>
                                <span className="text-[9px]" style={{ color: 'var(--win95-text-disabled)' }}>
                                  Requests: <b style={{ color: 'var(--win95-text)' }}>{key.totalRequests}</b>
                                </span>
                                <span className="text-[9px]" style={{ color: 'var(--win95-text-disabled)' }}>
                                  Spent: <b style={{ color: 'var(--win95-text)' }}>{key.totalCreditsSpent.toFixed(1)}</b>
                                </span>
                                {key.lastUsedAt && (
                                  <span className="text-[9px]" style={{ color: 'var(--win95-text-disabled)' }}>
                                    Last used: {new Date(key.lastUsedAt).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>
                            {key.active && (
                              <button
                                onClick={() => handleRevokeKey(key.id)}
                                className="p-1 ml-2 flex-shrink-0"
                                style={{ ...BTN.small, cursor: 'pointer', border: 'none' }}
                                title="Revoke key"
                              >
                                <Trash2 size={12} style={{ color: 'var(--win95-error-text)' }} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* DOCS TAB */}
          {activeTab === 'docs' && (
            <div className="space-y-3">
              {/* Quick Start */}
              <div className="p-2" style={PANEL.base}>
                <h3 className="text-[12px] font-bold mb-2" style={{ color: 'var(--win95-text)' }}>
                  Quick Start - Invoke a Tool
                </h3>
                <div className="relative">
                  <pre className="text-[10px] p-2 overflow-x-auto" style={{
                    background: 'var(--win95-input-bg)',
                    color: 'var(--win95-text)',
                    boxShadow: 'inset 1px 1px 0 var(--win95-border-dark)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}>
{`curl -X POST ${window.location.origin}/api/gateway/invoke/image.generate.flux-pro-kontext \\
  -H "X-API-Key: sk_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "a cute robot painting"}'`}
                  </pre>
                  <button
                    onClick={() => copyToClipboard(
                      `curl -X POST ${window.location.origin}/api/gateway/invoke/image.generate.flux-pro-kontext \\\n  -H "X-API-Key: sk_live_your_key_here" \\\n  -H "Content-Type: application/json" \\\n  -d '{"prompt": "a cute robot painting"}'`,
                      'curl'
                    )}
                    className="absolute top-1 right-1 p-0.5"
                    style={{ ...BTN.small, cursor: 'pointer', border: 'none' }}
                  >
                    {copied === 'curl' ? <Check size={10} /> : <Copy size={10} />}
                  </button>
                </div>
              </div>

              {/* Authentication Methods */}
              <div className="p-2" style={PANEL.base}>
                <h3 className="text-[12px] font-bold mb-2" style={{ color: 'var(--win95-text)' }}>
                  Authentication Methods
                </h3>
                <div className="space-y-2">
                  <div className="p-1.5" style={PANEL.sunken}>
                    <p className="text-[11px] font-bold" style={{ color: 'var(--win95-highlight)' }}>1. API Key (Recommended for agents)</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--win95-text-disabled)' }}>
                      Add <code style={{ background: 'var(--win95-bg-dark)', padding: '0 2px' }}>X-API-Key: sk_live_...</code> header. Credits deducted from key balance.
                    </p>
                  </div>
                  <div className="p-1.5" style={PANEL.sunken}>
                    <p className="text-[11px] font-bold" style={{ color: 'var(--win95-text)' }}>2. x402 Pay-Per-Request</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--win95-text-disabled)' }}>
                      Pay with USDC on Base. No account needed. Include <code style={{ background: 'var(--win95-bg-dark)', padding: '0 2px' }}>payment-signature</code> header.
                    </p>
                  </div>
                  <div className="p-1.5" style={PANEL.sunken}>
                    <p className="text-[11px] font-bold" style={{ color: 'var(--win95-text)' }}>3. JWT Bearer Token</p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--win95-text-disabled)' }}>
                      For authenticated users. Add <code style={{ background: 'var(--win95-bg-dark)', padding: '0 2px' }}>Authorization: Bearer &lt;jwt&gt;</code> header.
                    </p>
                  </div>
                </div>
              </div>

              {/* Webhook Setup */}
              <div className="p-2" style={PANEL.base}>
                <h3 className="text-[12px] font-bold mb-2" style={{ color: 'var(--win95-text)' }}>
                  Webhook Callbacks
                </h3>
                <p className="text-[10px] mb-1.5" style={{ color: 'var(--win95-text-disabled)' }}>
                  Receive results automatically when async jobs complete. Set a webhook URL on your API key or pass it per-request.
                </p>
                <pre className="text-[10px] p-2 overflow-x-auto" style={{
                  background: 'var(--win95-input-bg)',
                  color: 'var(--win95-text)',
                  boxShadow: 'inset 1px 1px 0 var(--win95-border-dark)',
                  whiteSpace: 'pre-wrap',
                }}>
{`// Per-request webhook
{
  "prompt": "a sunset over mountains",
  "webhookUrl": "https://your-agent.com/webhook"
}

// Your webhook receives:
{
  "event": "generation.completed",
  "requestId": "gw-123456",
  "toolId": "image.generate.flux-pro-kontext",
  "data": { "result": { "images": [...] } }
}`}
                </pre>
              </div>

              {/* Endpoints */}
              <div className="p-2" style={PANEL.base}>
                <h3 className="text-[12px] font-bold mb-2" style={{ color: 'var(--win95-text)' }}>
                  API Endpoints
                </h3>
                <div className="space-y-1">
                  {[
                    { method: 'GET', path: '/api/gateway/tools', desc: 'List all tools' },
                    { method: 'GET', path: '/api/gateway/tools/:id', desc: 'Tool details + schema' },
                    { method: 'GET', path: '/api/gateway/price/:id', desc: 'Calculate price' },
                    { method: 'POST', path: '/api/gateway/invoke/:id', desc: 'Invoke a tool' },
                    { method: 'POST', path: '/api/gateway/batch', desc: 'Batch invoke (max 10)' },
                    { method: 'GET', path: '/api/gateway/jobs/:id', desc: 'Check async job status' },
                    { method: 'GET', path: '/api/gateway/jobs/:id/result', desc: 'Get async result' },
                    { method: 'POST', path: '/api/gateway/orchestrate', desc: 'AI-planned pipeline' },
                    { method: 'GET', path: '/api/gateway/mcp-manifest', desc: 'MCP tool listing' },
                  ].map((ep, i) => (
                    <div key={i} className="flex items-center gap-2 py-0.5 px-1" style={{ borderBottom: '1px solid var(--win95-bg-dark)' }}>
                      <span className="text-[9px] font-bold px-1 flex-shrink-0" style={{
                        background: ep.method === 'GET' ? 'var(--win95-highlight)' : '#808000',
                        color: '#fff',
                        minWidth: '32px',
                        textAlign: 'center',
                      }}>
                        {ep.method}
                      </span>
                      <code className="text-[10px] flex-1" style={{ color: 'var(--win95-text)' }}>{ep.path}</code>
                      <span className="text-[9px] flex-shrink-0" style={{ color: 'var(--win95-text-disabled)' }}>{ep.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Links */}
              <div className="flex gap-2">
                <a
                  href={`${window.location.origin}/api/gateway`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold no-underline"
                  style={{ ...BTN.base }}
                  {...hoverHandlers}
                >
                  <ExternalLink size={10} /> Gateway API
                </a>
                <a
                  href={`${window.location.origin}/api/gateway/mcp-manifest`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold no-underline"
                  style={{ ...BTN.base }}
                  {...hoverHandlers}
                >
                  <Bot size={10} /> MCP Manifest
                </a>
                <a
                  href={`${window.location.origin}/api/docs`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold no-underline"
                  style={{ ...BTN.base }}
                  {...hoverHandlers}
                >
                  <Code size={10} /> OpenAPI Docs
                </a>
              </div>
            </div>
          )}
          {/* MY AGENTS SECTION */}
          {isConnected && customAgents.length > 0 && (
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid var(--win95-bg-dark)` }}>
              <div className="flex items-center gap-2 mb-2">
                <Bot size={14} style={{ color: WIN95.highlight }} />
                <span className="text-[12px] font-bold" style={{ color: WIN95.text }}>
                  My Agents ({customAgents.length})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {customAgents.map((agent) => (
                  <div
                    key={agent.agentId}
                    className="p-3"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <div>
                        <div className="text-[11px] font-bold" style={{ color: WIN95.text }}>
                          {agent.name}
                        </div>
                        <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                          {agent.type} — {agent.tools?.length || 0} tools
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {agent.skillMd && (
                          <button
                            onClick={() => handleDownloadSkillMd(agent)}
                            className="p-1"
                            style={{ ...BTN.base }}
                            title="Download SKILL.md"
                            {...hoverHandlers}
                          >
                            <Download size={10} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteAgent(agent.agentId)}
                          className="p-1"
                          style={{ ...BTN.base }}
                          title="Delete agent"
                          {...hoverHandlers}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    </div>
                    <p className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                      {agent.description?.slice(0, 80)}{agent.description?.length > 80 ? '...' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Agent Creator Modal */}
      {showAgentCreator && (
        <Suspense fallback={null}>
          <AgentCreator
            isOpen={showAgentCreator}
            onClose={() => setShowAgentCreator(false)}
            onCreated={() => {
              fetchCustomAgents();
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default AgentMarketplace;
