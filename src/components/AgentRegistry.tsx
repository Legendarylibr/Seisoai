/**
 * AgentRegistry Component
 * Displays and manages Seisoai's ERC-8004 registered agents
 */
import React, { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, Copy, Check, Bot, Star, Users, Shield, RefreshCw } from 'lucide-react';
import { BTN, PANEL, WIN95, hoverHandlers, WINDOW_TITLE_STYLE } from '../utils/buttonStyles';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import {
  getContractStatus,
  getAgentDefinitions,
  getAgentsByOwner,
  getAgentReputation,
  getChainName,
  getExplorerUrl,
  type ContractStatus,
  type AgentDefinition,
  type RegisteredAgent,
  type AgentReputationSummary,
} from '../services/agentRegistryService';
import logger from '../utils/logger';

interface AgentRegistryProps {
  isOpen: boolean;
  onClose: () => void;
}

const AgentRegistry: React.FC<AgentRegistryProps> = ({ isOpen, onClose }) => {
  const { walletAddress, isConnected } = useSimpleWallet();
  const [status, setStatus] = useState<ContractStatus | null>(null);
  const [definitions, setDefinitions] = useState<AgentDefinition[]>([]);
  const [registeredAgents, setRegisteredAgents] = useState<RegisteredAgent[]>([]);
  const [reputations, setReputations] = useState<Record<number, AgentReputationSummary>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'registered'>('overview');

  // Fetch data on mount
  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [statusData, definitionsData] = await Promise.all([
        getContractStatus(),
        getAgentDefinitions(),
      ]);
      
      setStatus(statusData);
      setDefinitions(definitionsData);

      // If wallet connected, fetch registered agents
      if (walletAddress && statusData.configured) {
        const agents = await getAgentsByOwner(walletAddress);
        setRegisteredAgents(agents);

        // Fetch reputation for each agent
        const repMap: Record<number, AgentReputationSummary> = {};
        for (const agent of agents) {
          const rep = await getAgentReputation(agent.agentId);
          if (rep) {
            repMap[agent.agentId] = rep;
          }
        }
        setReputations(repMap);
      }
    } catch (error) {
      logger.error('Failed to fetch agent registry data', { error: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  // Handle copy to clipboard
  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      logger.error('Failed to copy to clipboard', { error });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        style={WIN95.window}
      >
        {/* Title Bar */}
        <div 
          className="flex items-center justify-between px-2 py-1 cursor-move select-none"
          style={WINDOW_TITLE_STYLE}
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <span className="font-bold text-sm">ERC-8004 Agent Registry</span>
          </div>
          <button
            onClick={onClose}
            style={BTN.base}
            {...hoverHandlers(BTN.base, BTN.hover)}
            className="p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4" style={PANEL}>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-500" />
            </div>
          ) : (
            <>
              {/* Status Panel */}
              <div className="mb-4 p-3" style={{ ...WIN95.window, background: '#c0c0c0' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">Contract Status</span>
                  <span 
                    className={`px-2 py-0.5 text-xs font-bold ${
                      status?.configured ? 'bg-green-500 text-white' : 'bg-yellow-500 text-black'
                    }`}
                  >
                    {status?.configured ? 'CONFIGURED' : 'NOT CONFIGURED'}
                  </span>
                </div>
                
                {status?.configured && (
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Chain:</span>
                      <span className="font-mono">{getChainName(status.chainId!)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Registry:</span>
                      <span className="font-mono text-xs truncate">{status.identityRegistry}</span>
                      <a
                        href={getExplorerUrl(status.chainId!, status.identityRegistry!)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}

                {!status?.configured && (
                  <p className="text-xs text-gray-600 mt-2">
                    Deploy contracts and set ERC8004_* environment variables to enable.
                  </p>
                )}
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-4">
                <button
                  onClick={() => setActiveTab('overview')}
                  style={activeTab === 'overview' ? BTN.active : BTN.base}
                  {...hoverHandlers(
                    activeTab === 'overview' ? BTN.active : BTN.base,
                    BTN.hover
                  )}
                  className="px-4 py-1 text-sm"
                >
                  Agent Definitions
                </button>
                <button
                  onClick={() => setActiveTab('registered')}
                  style={activeTab === 'registered' ? BTN.active : BTN.base}
                  {...hoverHandlers(
                    activeTab === 'registered' ? BTN.active : BTN.base,
                    BTN.hover
                  )}
                  className="px-4 py-1 text-sm"
                >
                  Registered ({registeredAgents.length})
                </button>
              </div>

              {/* Agent Definitions Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    These are the Seisoai AI agents ready to be registered on-chain via ERC-8004.
                  </p>
                  
                  {definitions.map((agent) => (
                    <div 
                      key={agent.id}
                      className="p-3"
                      style={{ ...WIN95.window, background: '#ffffff' }}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Bot className="w-5 h-5 text-purple-600" />
                          <span className="font-bold">{agent.name}</span>
                        </div>
                        <span className={`px-2 py-0.5 text-xs ${
                          agent.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {agent.active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      
                      <p className="text-sm text-gray-600 mb-2">{agent.description}</p>
                      
                      <div className="flex flex-wrap gap-1 mb-2">
                        {agent.supportedTrust.map((trust) => (
                          <span 
                            key={trust}
                            className="px-2 py-0.5 text-xs bg-blue-100 text-blue-800 flex items-center gap-1"
                          >
                            <Shield className="w-3 h-3" />
                            {trust}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => handleCopy(agent.agentURI, `uri-${agent.id}`)}
                          style={BTN.base}
                          {...hoverHandlers(BTN.base, BTN.hover)}
                          className="px-2 py-1 text-xs flex items-center gap-1"
                        >
                          {copied === `uri-${agent.id}` ? (
                            <>
                              <Check className="w-3 h-3" />
                              Copied!
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              Copy URI
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}

                  {definitions.length === 0 && (
                    <p className="text-center text-gray-500 py-8">
                      No agent definitions found.
                    </p>
                  )}
                </div>
              )}

              {/* Registered Agents Tab */}
              {activeTab === 'registered' && (
                <div className="space-y-3">
                  {!isConnected ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-4">Connect your wallet to view registered agents.</p>
                    </div>
                  ) : registeredAgents.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-500">No agents registered to this wallet yet.</p>
                      <p className="text-xs text-gray-400 mt-2">
                        Use the deployment scripts to register your agents on-chain.
                      </p>
                    </div>
                  ) : (
                    registeredAgents.map((agent) => {
                      const rep = reputations[agent.agentId];
                      return (
                        <div 
                          key={agent.agentId}
                          className="p-3"
                          style={{ ...WIN95.window, background: '#ffffff' }}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="flex items-center gap-2">
                                <Bot className="w-5 h-5 text-green-600" />
                                <span className="font-bold">{agent.name}</span>
                                <span className="text-xs text-gray-500">#{agent.agentId}</span>
                              </div>
                            </div>
                            <a
                              href={getExplorerUrl(agent.chainId, agent.owner)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-3">{agent.description}</p>
                          
                          {/* Reputation Stats */}
                          {rep && (
                            <div className="flex gap-4 p-2 bg-gray-50">
                              <div className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-yellow-500" />
                                <span className="text-sm font-bold">
                                  {rep.averageScore.toFixed(1)}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Users className="w-4 h-4 text-blue-500" />
                                <span className="text-sm">
                                  {rep.clientCount} reviewers
                                </span>
                              </div>
                              <div className="text-sm text-gray-500">
                                {rep.feedbackCount} reviews
                              </div>
                            </div>
                          )}
                          
                          {!rep && (
                            <div className="p-2 bg-gray-50 text-sm text-gray-500">
                              No reputation data yet
                            </div>
                          )}

                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => handleCopy(agent.agentRegistry, `reg-${agent.agentId}`)}
                              style={BTN.base}
                              {...hoverHandlers(BTN.base, BTN.hover)}
                              className="px-2 py-1 text-xs flex items-center gap-1"
                            >
                              {copied === `reg-${agent.agentId}` ? (
                                <>
                                  <Check className="w-3 h-3" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  Copy Registry ID
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t flex justify-between items-center" style={{ background: '#c0c0c0' }}>
          <span className="text-xs text-gray-600">
            ERC-8004 Trustless Agents Standard
          </span>
          <button
            onClick={fetchData}
            style={BTN.base}
            {...hoverHandlers(BTN.base, BTN.hover)}
            className="px-3 py-1 text-sm flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgentRegistry;
