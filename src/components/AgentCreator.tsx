/**
 * AgentCreator — Highly intuitive visual wizard for creating custom AI agents
 * Features: template gallery, visual tool cards, drag-drop icon upload,
 * system prompt configuration, live preview, and multimodal support
 */
import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  Bot, ChevronRight, ChevronLeft, Download, Copy, Check, X, Zap, Code, Eye,
  Image, Film, Music, MessageCircle, Layers, Wrench,
  Upload, Sparkles, FileText, Cpu, Globe
} from 'lucide-react';
import { WIN95, BTN, hoverHandlers } from '../utils/buttonStyles';
import { generateSkillMd, getAvailableTools, getDefaultToolsForType, type SkillAgentInput } from '../utils/skillGenerator';
import { createAgent } from '../services/agentRegistryService';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import logger from '../utils/logger';

// Map agent type to relevant UI tabs
const AGENT_TYPE_TABS: Record<string, string[]> = {
  'Image Generation': ['generate'],
  'Video Generation': ['video'],
  'Music Generation': ['music'],
  'Chat/Assistant': ['chat'],
  'Multi-Modal': ['chat', 'generate', 'video', 'music'],
  'Custom': [],
};

// Map agent type to the primary tab to navigate to
const AGENT_TYPE_PRIMARY_TAB: Record<string, string> = {
  'Image Generation': 'generate',
  'Video Generation': 'video',
  'Music Generation': 'music',
  'Chat/Assistant': 'chat',
  'Multi-Modal': 'chat',
  'Custom': 'workbench',
};

interface AgentCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
  onNavigate?: (tab: string) => void;
}

// ── Template definitions ──
const AGENT_TEMPLATES = [
  {
    id: 'image-gen',
    type: 'Image Generation',
    label: 'Image Creator',
    description: 'Generate and edit images with multiple AI models',
    icon: <Image size={24} />,
    gradient: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
    features: ['Text-to-image', 'Image editing', 'Style transfer', 'Upscaling'],
  },
  {
    id: 'video-gen',
    type: 'Video Generation',
    label: 'Video Creator',
    description: 'Create videos from text or images with AI',
    icon: <Film size={24} />,
    gradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)',
    features: ['Text-to-video', 'Image-to-video', 'Lip sync', 'Audio gen'],
  },
  {
    id: 'music-gen',
    type: 'Music Generation',
    label: 'Music Producer',
    description: 'Generate music tracks and sound effects',
    icon: <Music size={24} />,
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    features: ['Music generation', 'Sound effects', 'Multi-genre', 'Custom duration'],
  },
  {
    id: 'chat-assistant',
    type: 'Chat/Assistant',
    label: 'Chat Assistant',
    description: 'AI assistant for prompts and creative planning',
    icon: <MessageCircle size={24} />,
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    features: ['Prompt crafting', 'Creative planning', 'Multi-turn chat', 'Context aware'],
  },
  {
    id: 'multi-modal',
    type: 'Multi-Modal',
    label: 'Multi-Modal Agent',
    description: 'Full-stack creative agent with all capabilities',
    icon: <Layers size={24} />,
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    features: ['Images', 'Videos', 'Music', 'Chat', 'Sound FX'],
  },
  {
    id: 'custom',
    type: 'Custom',
    label: 'Custom Agent',
    description: 'Build from scratch with custom tool selection',
    icon: <Wrench size={24} />,
    gradient: 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)',
    features: ['Pick your tools', 'Custom workflow', 'Flexible config'],
  },
];

// ── Tool category metadata ──
const TOOL_ICONS: Record<string, React.ReactNode> = {
  'image-generation': <Image size={14} />,
  'image-processing': <Sparkles size={14} />,
  'video-generation': <Film size={14} />,
  'music-generation': <Music size={14} />,
  'audio-generation': <Music size={14} />,
  'text-generation': <MessageCircle size={14} />,
};

const TOOL_COLORS: Record<string, string> = {
  'image-generation': '#6366f1',
  'image-processing': '#8b5cf6',
  'video-generation': '#ec4899',
  'music-generation': '#10b981',
  'audio-generation': '#f59e0b',
  'text-generation': '#3b82f6',
};

const STEPS = ['Template', 'Identity', 'Tools', 'Configure', 'Review'];
const font = 'Tahoma, "MS Sans Serif", sans-serif';
const monoFont = '"Consolas", "Courier New", monospace';

const AgentCreator: React.FC<AgentCreatorProps> = ({ isOpen, onClose, onCreated, onNavigate }) => {
  const { address } = useSimpleWallet();
  const { preferences, updatePreference } = useUserPreferences();
  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createdAgentURI, setCreatedAgentURI] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');

  // Step 0 — Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Step 1 — Identity
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentType, setAgentType] = useState('Image Generation');
  const [agentIcon, setAgentIcon] = useState('');
  const [agentIconPreview, setAgentIconPreview] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Step 2 — Tools
  const [selectedTools, setSelectedTools] = useState<string[]>(
    getDefaultToolsForType('Image Generation')
  );

  // Step 3 — Configuration (SKILL.md + system prompt)
  const [editedSkillMd, setEditedSkillMd] = useState('');
  const [skillMdGenerated, setSkillMdGenerated] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [showSkillEditor, setShowSkillEditor] = useState(false);

  const iconInputRef = useRef<HTMLInputElement>(null);
  const availableTools = useMemo(() => getAvailableTools(), []);

  // When template is selected
  const handleTemplateSelect = useCallback((templateId: string) => {
    const template = AGENT_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    setSelectedTemplate(templateId);
    setAgentType(template.type);
    setSelectedTools(getDefaultToolsForType(template.type));
    // Pre-fill name suggestion
    if (!agentName) {
      setAgentName(`My ${template.label}`);
    }
    if (!agentDescription) {
      setAgentDescription(template.description);
    }
  }, [agentName, agentDescription]);

  const toggleTool = useCallback((toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  }, []);

  // Icon drag-and-drop handlers
  const handleIconDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === 'string') {
          setAgentIconPreview(result);
          setAgentIcon(result);
        }
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const handleIconFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result;
        if (typeof result === 'string') {
          setAgentIconPreview(result);
          setAgentIcon(result);
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);

  // Generate SKILL.md
  const agentInput: SkillAgentInput = useMemo(() => ({
    name: agentName || 'My Agent',
    description: agentDescription || 'A custom AI agent',
    type: agentType,
    tools: selectedTools,
  }), [agentName, agentDescription, agentType, selectedTools]);

  const generatedSkillMd = useMemo(() => generateSkillMd(agentInput), [agentInput]);

  const handleNextStep = useCallback(() => {
    if (step === 3 && !skillMdGenerated) {
      setEditedSkillMd(generatedSkillMd);
      setSkillMdGenerated(true);
    }
    setStep((s) => Math.min(s + 1, 4));
  }, [step, skillMdGenerated, generatedSkillMd]);

  const handlePrevStep = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return selectedTemplate !== null;
      case 1: return agentName.trim().length > 0 && agentDescription.trim().length > 0;
      case 2: return selectedTools.length > 0;
      case 3: return true;
      case 4: return true;
      default: return false;
    }
  }, [step, selectedTemplate, agentName, agentDescription, selectedTools]);

  // Auto-enable relevant UI tabs for the agent type
  const enableAgentTabs = useCallback(() => {
    const tabsToEnable = AGENT_TYPE_TABS[agentType] || [];
    if (tabsToEnable.length === 0) return;
    
    const currentTabs = new Set(preferences.enabledTabs);
    let changed = false;
    for (const tab of tabsToEnable) {
      if (!currentTabs.has(tab)) {
        currentTabs.add(tab);
        changed = true;
      }
    }
    if (changed) {
      updatePreference('enabledTabs', Array.from(currentTabs));
    }
  }, [agentType, preferences.enabledTabs, updatePreference]);

  const handleCreate = useCallback(async () => {
    if (isCreating) return;
    setCreateError('');

    // Check wallet connection before attempting
    if (!address) {
      setCreateError('Please connect your wallet first to create an agent.');
      return;
    }

    setIsCreating(true);

    try {
      const result = await createAgent({
        name: agentName,
        description: agentDescription,
        type: agentType,
        image: agentIcon || undefined,
        tools: selectedTools,
        skillMd: editedSkillMd || generatedSkillMd,
        systemPrompt: systemPrompt || undefined,
        walletAddress: address || undefined,
      });

      setCreateSuccess(true);
      setCreatedAgentURI(result.agentURI);
      // Auto-enable relevant tabs so the user can access them
      enableAgentTabs();
      onCreated?.();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to create agent. Please try again.';
      setCreateError(msg);
      logger.error('Failed to create agent', { error });
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, address, agentName, agentDescription, agentType, agentIcon, selectedTools, editedSkillMd, generatedSkillMd, systemPrompt, onCreated, enableAgentTabs]);

  const handleDownloadSkillMd = useCallback(() => {
    const content = editedSkillMd || generatedSkillMd;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'SKILL.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [editedSkillMd, generatedSkillMd]);

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    }
  }, []);

  const handleClose = useCallback(() => {
    setStep(0);
    setSelectedTemplate(null);
    setAgentName('');
    setAgentDescription('');
    setAgentType('Image Generation');
    setAgentIcon('');
    setAgentIconPreview('');
    setSelectedTools(getDefaultToolsForType('Image Generation'));
    setEditedSkillMd('');
    setSkillMdGenerated(false);
    setSystemPrompt('');
    setShowSkillEditor(false);
    setCreateSuccess(false);
    setCreatedAgentURI('');
    setIsCreating(false);
    setCreateError('');
    onClose();
  }, [onClose]);

  // Navigate to the agent's primary UI tab
  const handleGoToStudio = useCallback(() => {
    let primaryTab = AGENT_TYPE_PRIMARY_TAB[agentType] || 'workbench';

    // For Custom agents (or workbench), derive the best tab from selected tools
    if (primaryTab === 'workbench' && selectedTools.length > 0) {
      const toolTabMap: Record<string, string> = {
        'image': 'generate',
        'video': 'video',
        'music': 'music',
        'audio': 'music',
        'text': 'chat',
      };
      for (const toolId of selectedTools) {
        const prefix = toolId.split('.')[0];
        if (toolTabMap[prefix]) {
          primaryTab = toolTabMap[prefix];
          break;
        }
      }
    }

    // Enable all tabs the agent's tools need
    enableAgentTabs();
    // Also enable tabs derived from specific tools for Custom agents
    const currentTabs = new Set(preferences.enabledTabs);
    const toolPrefixToTab: Record<string, string> = {
      'image': 'generate',
      'video': 'video',
      'music': 'music',
      'audio': 'music',
      'text': 'chat',
    };
    let changed = false;
    for (const toolId of selectedTools) {
      const prefix = toolId.split('.')[0];
      const tab = toolPrefixToTab[prefix];
      if (tab && !currentTabs.has(tab)) {
        currentTabs.add(tab);
        changed = true;
      }
    }
    if (changed) {
      updatePreference('enabledTabs', Array.from(currentTabs));
    }

    // Small delay to let preferences propagate before navigating
    setTimeout(() => {
      onNavigate?.(primaryTab);
      handleClose();
    }, 50);
  }, [agentType, selectedTools, enableAgentTabs, preferences.enabledTabs, updatePreference, onNavigate, handleClose]);

  if (!isOpen) return null;

  const activeTemplate = AGENT_TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[92vh] flex flex-col win95-window-open"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 12px rgba(0,0,0,0.5)`,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
          style={{
            background: 'var(--win95-active-title)',
            color: '#ffffff',
            fontFamily: font,
          }}
        >
          <Bot className="w-4 h-4" />
          <span className="text-[12px] font-bold flex-1">
            {createSuccess ? 'Agent Created!' : `Create Agent — ${STEPS[step]}`}
          </span>
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              color: WIN95.text,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Progress Bar */}
        {!createSuccess && (
          <div className="flex items-center px-3 pt-2 pb-1 flex-shrink-0 gap-0.5">
            {STEPS.map((label, i) => (
              <React.Fragment key={label}>
                <div className="flex items-center gap-1">
                  <div
                    className="w-5 h-5 flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                    style={{
                      background: i <= step
                        ? i === step ? 'var(--win95-highlight)' : 'var(--win95-info-green)'
                        : WIN95.bgDark,
                      color: i <= step ? '#fff' : WIN95.textDisabled,
                      borderRadius: '50%',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {i < step ? <Check className="w-3 h-3" /> : i + 1}
                  </div>
                  <span
                    className="text-[9px] font-bold hidden sm:block"
                    style={{
                      color: i === step ? WIN95.text : WIN95.textDisabled,
                      fontFamily: font,
                    }}
                  >
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-1" style={{
                    background: i < step ? 'var(--win95-highlight)' : WIN95.bgDark,
                    transition: 'background 0.2s ease',
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {createSuccess ? (
            /* ===== SUCCESS ===== */
            <div className="text-center space-y-4">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full animate-ping" style={{ background: 'var(--win95-info-green)', opacity: 0.2 }} />
                <div className="relative w-16 h-16 rounded-full flex items-center justify-center" style={{ background: 'var(--win95-info-green)' }}>
                  <Check className="w-8 h-8" style={{ color: 'var(--win95-success-text)' }} />
                </div>
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                  {agentName} is Ready!
                </h3>
                <p className="text-[11px] mt-1" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                  Your agent has been created and registered. Download the SKILL.md file to use it in Cursor.
                </p>
              </div>

              {/* Agent URI */}
              <div className="p-2 text-left" style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                fontFamily: monoFont, fontSize: 9, color: WIN95.text, wordBreak: 'break-all',
              }}>
                {createdAgentURI.slice(0, 120)}...
              </div>

              {/* Selected tools summary */}
              <div className="flex flex-wrap gap-1 justify-center">
                {selectedTools.map((toolId) => {
                  const tool = availableTools.find(t => t.id === toolId);
                  const color = tool ? (TOOL_COLORS[tool.category] || '#6b7280') : '#6b7280';
                  return (
                    <span
                      key={toolId}
                      className="flex items-center gap-1 px-2 py-0.5 text-[9px]"
                      style={{
                        background: WIN95.bgDark,
                        color: WIN95.text,
                        fontFamily: font,
                        borderLeft: `3px solid ${color}`,
                      }}
                    >
                      {tool?.name || toolId}
                    </span>
                  );
                })}
              </div>

              {/* Primary CTA: Use Agent */}
              {onNavigate && (
                <button
                  onClick={handleGoToStudio}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 text-[12px] font-bold generate-btn w-full sm:w-auto mx-auto"
                  style={{ fontFamily: font, border: 'none', cursor: 'pointer' }}
                >
                  <Sparkles className="w-4 h-4" />
                  {AGENT_TYPE_PRIMARY_TAB[agentType] !== 'workbench'
                    ? `Open ${agentType.replace('Generation', '').replace('Chat/', '')} Studio`
                    : 'Use Agent Now'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}

              <div className="flex gap-2 justify-center flex-wrap">
                <button
                  onClick={handleDownloadSkillMd}
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold"
                  style={{ ...BTN.base, fontFamily: font }}
                  {...hoverHandlers}
                >
                  <Download className="w-4 h-4" /> Download SKILL.md
                </button>
                <button
                  onClick={() => handleCopy(createdAgentURI, 'uri')}
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold"
                  style={{ ...BTN.base, fontFamily: font }}
                  {...hoverHandlers}
                >
                  {copied === 'uri' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === 'uri' ? 'Copied' : 'Copy URI'}
                </button>
                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold"
                  style={{ ...BTN.base, fontFamily: font }}
                  {...hoverHandlers}
                >
                  Done
                </button>
              </div>

              <p className="text-[9px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                Place in <code style={{ fontFamily: monoFont }}>.cursor/skills/{agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'my-agent'}/SKILL.md</code>
              </p>
            </div>
          ) : step === 0 ? (
            /* ===== STEP 0: TEMPLATE GALLERY ===== */
            <div className="space-y-3">
              <div>
                <h3 className="text-[13px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                  Choose a Template
                </h3>
                <p className="text-[10px] mt-0.5" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                  Start with a template to pre-configure tools, or build custom from scratch.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {AGENT_TEMPLATES.map((template) => {
                  const isSelected = selectedTemplate === template.id;
                  return (
                    <button
                      key={template.id}
                      onClick={() => handleTemplateSelect(template.id)}
                      className="p-3 text-left transition-all group"
                      style={{
                        background: isSelected ? 'var(--win95-info-green)' : WIN95.inputBg,
                        boxShadow: isSelected
                          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}, 0 0 0 2px var(--win95-highlight)`
                          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: font,
                      }}
                    >
                      {/* Icon */}
                      <div
                        className="w-10 h-10 flex items-center justify-center mb-2"
                        style={{
                          background: template.gradient,
                          color: '#fff',
                          borderRadius: 6,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        }}
                      >
                        {template.icon}
                      </div>

                      {/* Info */}
                      <div className="text-[11px] font-bold mb-0.5" style={{ color: WIN95.text }}>
                        {template.label}
                      </div>
                      <div className="text-[9px] mb-2 line-clamp-2" style={{ color: WIN95.textDisabled }}>
                        {template.description}
                      </div>

                      {/* Feature tags */}
                      <div className="flex flex-wrap gap-0.5">
                        {template.features.slice(0, 3).map((f) => (
                          <span key={f} className="px-1 py-0.5 text-[7px]" style={{
                            background: WIN95.bgDark,
                            color: WIN95.textDisabled,
                          }}>
                            {f}
                          </span>
                        ))}
                        {template.features.length > 3 && (
                          <span className="px-1 py-0.5 text-[7px]" style={{ color: WIN95.textDisabled }}>
                            +{template.features.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                          style={{ background: 'var(--win95-highlight)', color: '#fff' }}>
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : step === 1 ? (
            /* ===== STEP 1: IDENTITY ===== */
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                {/* Icon upload area */}
                <div className="flex-shrink-0">
                  <label className="block text-[10px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                    Icon
                  </label>
                  <div
                    className="relative w-20 h-20 flex items-center justify-center cursor-pointer transition-all"
                    style={{
                      background: isDragging ? 'var(--win95-info-green)' : agentIconPreview ? 'transparent' : WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                      border: isDragging ? `2px dashed var(--win95-highlight)` : `2px dashed ${WIN95.bgDark}`,
                    }}
                    onClick={() => iconInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleIconDrop}
                  >
                    {agentIconPreview ? (
                      <img src={agentIconPreview} alt="Agent icon" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-center">
                        <Upload className="w-5 h-5 mx-auto mb-0.5" style={{ color: WIN95.textDisabled }} />
                        <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>
                          Drop or click
                        </span>
                      </div>
                    )}
                    {agentIconPreview && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgentIcon('');
                          setAgentIconPreview('');
                        }}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 flex items-center justify-center"
                        style={{ background: WIN95.errorText || '#d32f2f', color: '#fff', border: 'none', cursor: 'pointer', borderRadius: '50%', fontSize: 8 }}
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                  <input
                    ref={iconInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
                    onChange={handleIconFileSelect}
                    className="hidden"
                  />
                </div>

                {/* Name + type */}
                <div className="flex-1 space-y-3 min-w-0">
                  <div>
                    <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                      Agent Name *
                    </label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value.slice(0, 64))}
                      placeholder="My Image Agent"
                      className="w-full p-2 text-[12px]"
                      style={{
                        background: WIN95.inputBg,
                        boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                        border: 'none', color: WIN95.text, fontFamily: font, outline: 'none',
                      }}
                    />
                    <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>{agentName.length}/64</span>
                  </div>

                  {/* Selected template badge */}
                  {activeTemplate && (
                    <div className="flex items-center gap-2 px-2 py-1.5" style={{
                      background: 'var(--win95-info-green)',
                    }}>
                      <div className="w-5 h-5 flex items-center justify-center" style={{
                        background: activeTemplate.gradient, color: '#fff', borderRadius: 3, fontSize: 0,
                      }}>
                        {React.cloneElement(activeTemplate.icon as React.ReactElement, { size: 12 })}
                      </div>
                      <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: font }}>
                        {activeTemplate.label}
                      </span>
                      <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>template</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Description *
                </label>
                <textarea
                  value={agentDescription}
                  onChange={(e) => setAgentDescription(e.target.value.slice(0, 256))}
                  placeholder="What does your agent do? Describe its purpose and capabilities..."
                  rows={3}
                  className="w-full p-2 text-[11px] resize-none"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                    border: 'none', color: WIN95.text, fontFamily: font, outline: 'none',
                  }}
                />
                <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>{agentDescription.length}/256</span>
              </div>

              {/* Or paste icon URL */}
              <div>
                <label className="block text-[10px] mb-1" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                  Or paste icon URL
                </label>
                <input
                  type="text"
                  value={agentIcon.startsWith('data:') ? '' : agentIcon}
                  onChange={(e) => {
                    setAgentIcon(e.target.value);
                    setAgentIconPreview(e.target.value);
                  }}
                  placeholder="https://example.com/icon.png"
                  className="w-full p-1.5 text-[10px]"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    border: 'none', color: WIN95.text, fontFamily: font, outline: 'none',
                  }}
                />
              </div>
            </div>
          ) : step === 2 ? (
            /* ===== STEP 2: VISUAL TOOL SELECTION ===== */
            <div className="space-y-3">
              <div>
                <h3 className="text-[12px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                  Select Capabilities
                </h3>
                <p className="text-[10px] mt-0.5" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                  Choose the tools your agent can use. All tools route through Seiso&apos;s API with x402 payment.
                </p>
              </div>

              {/* Visual tool cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableTools.map((tool) => {
                  const isSelected = selectedTools.includes(tool.id);
                  const color = TOOL_COLORS[tool.category] || '#6b7280';
                  const icon = TOOL_ICONS[tool.category] || <Zap size={14} />;

                  return (
                    <button
                      key={tool.id}
                      onClick={() => toggleTool(tool.id)}
                      className="p-2.5 text-left transition-all group relative"
                      style={{
                        background: isSelected ? 'var(--win95-info-green)' : WIN95.inputBg,
                        boxShadow: isSelected
                          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: font,
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {/* Tool icon */}
                        <div className="w-8 h-8 flex items-center justify-center flex-shrink-0 mt-0.5" style={{
                          background: isSelected ? color : WIN95.bgDark,
                          color: isSelected ? '#fff' : color,
                          borderRadius: 4,
                          transition: 'all 0.2s ease',
                        }}>
                          {icon}
                        </div>

                        {/* Tool info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold truncate" style={{ color: WIN95.text }}>
                              {tool.name}
                            </span>
                            {isSelected && (
                              <Check className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--win95-success-text)' }} />
                            )}
                          </div>
                          <div className="text-[9px] mt-0.5 line-clamp-1" style={{ color: WIN95.textDisabled }}>
                            {tool.description}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[8px] px-1 py-0.5 font-bold" style={{
                              background: WIN95.bgDark,
                              color: WIN95.text,
                              fontFamily: monoFont,
                            }}>
                              {tool.usdPrice}
                            </span>
                            <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>
                              {tool.category.split('-').join(' ')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Selection summary */}
              <div className="flex items-center justify-between px-2 py-1.5" style={{ background: WIN95.bgDark }}>
                <span className="text-[10px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                  {selectedTools.length} tool{selectedTools.length !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={() => {
                    if (selectedTools.length === availableTools.length) {
                      setSelectedTools([]);
                    } else {
                      setSelectedTools(availableTools.map(t => t.id));
                    }
                  }}
                  className="text-[9px] px-2 py-0.5"
                  style={{ ...BTN.small, cursor: 'pointer', fontFamily: font }}
                  {...hoverHandlers}
                >
                  {selectedTools.length === availableTools.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
            </div>
          ) : step === 3 ? (
            /* ===== STEP 3: CONFIGURATION ===== */
            <div className="space-y-4">
              {/* System Prompt */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Cpu className="w-3.5 h-3.5" style={{ color: WIN95.highlight }} />
                  <label className="text-[11px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                    System Prompt
                  </label>
                  <span className="text-[9px] px-1.5 py-0.5" style={{ background: WIN95.bgDark, color: WIN95.textDisabled }}>
                    optional
                  </span>
                </div>
                <p className="text-[9px] mb-1.5" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                  Define your agent&apos;s personality, instructions, and behavior. This prompt guides how the agent responds.
                </p>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={`You are a creative AI assistant specializing in ${agentType.toLowerCase()}. You help users by...\n\nGuidelines:\n- Be concise and helpful\n- Suggest improvements to prompts\n- Explain your creative choices`}
                  rows={5}
                  className="w-full p-2.5 text-[11px] resize-none"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                    border: 'none', color: WIN95.text, fontFamily: font, outline: 'none', lineHeight: 1.6,
                  }}
                />
              </div>

              {/* SKILL.md Section */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" style={{ color: WIN95.highlight }} />
                    <span className="text-[11px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                      SKILL.md
                    </span>
                    <span className="text-[9px]" style={{ color: 'var(--win95-success-text)' }}>
                      auto-generated
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setShowSkillEditor(!showSkillEditor)}
                      className="flex items-center gap-1 px-2 py-1 text-[9px]"
                      style={{ ...BTN.small, fontFamily: font, cursor: 'pointer' }}
                      {...hoverHandlers}
                    >
                      <Code className="w-3 h-3" />
                      {showSkillEditor ? 'Hide' : 'Edit'}
                    </button>
                    <button
                      onClick={handleDownloadSkillMd}
                      className="flex items-center gap-1 px-2 py-1 text-[9px]"
                      style={{ ...BTN.small, fontFamily: font, cursor: 'pointer' }}
                      {...hoverHandlers}
                    >
                      <Download className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleCopy(editedSkillMd || generatedSkillMd, 'skill')}
                      className="flex items-center gap-1 px-2 py-1 text-[9px]"
                      style={{ ...BTN.small, fontFamily: font, cursor: 'pointer' }}
                      {...hoverHandlers}
                    >
                      {copied === 'skill' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {showSkillEditor ? (
                  <textarea
                    value={editedSkillMd || generatedSkillMd}
                    onChange={(e) => setEditedSkillMd(e.target.value)}
                    className="w-full p-3 text-[10px] resize-none"
                    rows={14}
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                      border: 'none', color: WIN95.text, fontFamily: monoFont, outline: 'none', lineHeight: 1.5,
                    }}
                  />
                ) : (
                  <div className="p-2.5 flex items-center gap-2" style={{
                    background: 'var(--win95-info-green)',
                  }}>
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--win95-success-text)' }} />
                    <div>
                      <div className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: font }}>
                        SKILL.md will be auto-generated
                      </div>
                      <div className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                        Includes {selectedTools.length} tool definitions, endpoints, pricing, and examples
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Integration hint */}
              <div className="p-2 flex items-start gap-2" style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`,
              }}>
                <Globe className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: WIN95.highlight }} />
                <div>
                  <div className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: font }}>
                    Multimodal Integration
                  </div>
                  <div className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                    Your agent supports MCP, OpenAPI, and x402 payment protocols out of the box. Access via API, Cursor, or any MCP-compatible client.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ===== STEP 4: REVIEW ===== */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4" style={{ color: WIN95.highlight }} />
                <span className="text-[12px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                  Review Your Agent
                </span>
              </div>

              {/* Agent Preview Card */}
              <div className="p-3" style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              }}>
                <div className="flex items-start gap-3">
                  {/* Agent icon */}
                  <div className="w-14 h-14 flex items-center justify-center flex-shrink-0" style={{
                    background: agentIconPreview ? 'transparent' : (activeTemplate?.gradient || WIN95.highlight),
                    color: '#fff',
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}>
                    {agentIconPreview ? (
                      <img src={agentIconPreview} alt={agentName} className="w-full h-full object-cover" />
                    ) : (
                      <Bot className="w-7 h-7" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold" style={{ color: WIN95.text, fontFamily: font }}>
                      {agentName}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] px-1.5 py-0.5 font-bold" style={{
                        background: WIN95.highlight,
                        color: WIN95.highlightText,
                      }}>
                        {agentType}
                      </span>
                      <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                        {selectedTools.length} tools
                      </span>
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                      {agentDescription}
                    </p>
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2" style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`,
                }}>
                  <div className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>Owner</div>
                  <div className="text-[10px] font-bold mt-0.5" style={{ color: WIN95.text, fontFamily: monoFont }}>
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
                  </div>
                </div>
                <div className="p-2" style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`,
                }}>
                  <div className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>Protocol</div>
                  <div className="text-[10px] font-bold mt-0.5" style={{ color: WIN95.text, fontFamily: font }}>
                    x402 + MCP + OpenAPI
                  </div>
                </div>
              </div>

              {/* Tools List */}
              <div>
                <span className="text-[10px] font-bold block mb-1.5" style={{ fontFamily: font, color: WIN95.text }}>
                  Selected Tools:
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedTools.map((toolId) => {
                    const tool = availableTools.find(t => t.id === toolId);
                    const color = tool ? (TOOL_COLORS[tool.category] || '#6b7280') : '#6b7280';
                    return (
                      <span
                        key={toolId}
                        className="flex items-center gap-1 px-2 py-0.5 text-[9px]"
                        style={{
                          background: WIN95.bgDark,
                          color: WIN95.text,
                          fontFamily: font,
                          borderLeft: `3px solid ${color}`,
                        }}
                      >
                        {tool?.name || toolId}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* System prompt summary */}
              {systemPrompt && (
                <div className="p-2" style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}`,
                }}>
                  <div className="text-[9px] font-bold mb-0.5" style={{ color: WIN95.text, fontFamily: font }}>
                    System Prompt:
                  </div>
                  <div className="text-[9px] line-clamp-3" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                    {systemPrompt}
                  </div>
                </div>
              )}

              {/* Includes SKILL.md */}
              <div className="p-2 flex items-center gap-2" style={{ background: 'var(--win95-info-green)' }}>
                <Check className="w-3.5 h-3.5" style={{ color: 'var(--win95-success-text)' }} />
                <span className="text-[10px]" style={{ color: WIN95.text, fontFamily: font }}>
                  SKILL.md file will be included with your agent
                </span>
              </div>

              {/* Wallet connection warning */}
              {!address && (
                <div className="p-2.5 flex items-center gap-2" style={{
                  background: '#fff3cd',
                  border: `2px solid #f59e0b`,
                }}>
                  <Zap className="w-4 h-4 flex-shrink-0" style={{ color: '#d97706' }} />
                  <div>
                    <div className="text-[10px] font-bold" style={{ color: '#92400e', fontFamily: font }}>
                      Wallet Not Connected
                    </div>
                    <div className="text-[9px]" style={{ color: '#a16207', fontFamily: font }}>
                      Connect your wallet before creating an agent. Your wallet address is used to identify and manage your agents.
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {createError && (
                <div className="p-2.5 flex items-center gap-2" style={{
                  background: '#fef2f2',
                  border: `2px solid ${WIN95.errorText || '#dc2626'}`,
                }}>
                  <X className="w-4 h-4 flex-shrink-0" style={{ color: WIN95.errorText || '#dc2626' }} />
                  <div>
                    <div className="text-[10px] font-bold" style={{ color: '#991b1b', fontFamily: font }}>
                      Creation Failed
                    </div>
                    <div className="text-[9px]" style={{ color: '#b91c1c', fontFamily: font }}>
                      {createError}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — Navigation */}
        {!createSuccess && (
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{ borderTop: `1px solid ${WIN95.bgDark}` }}
          >
            <button
              onClick={step === 0 ? handleClose : handlePrevStep}
              className="flex items-center gap-1 px-4 py-2 text-[11px] font-bold"
              style={{ ...BTN.base, fontFamily: font }}
              {...hoverHandlers}
            >
              {step === 0 ? 'Cancel' : (
                <><ChevronLeft className="w-3 h-3" /> Back</>
              )}
            </button>

            {step < 4 ? (
              <button
                onClick={handleNextStep}
                disabled={!canProceed}
                className="flex items-center gap-1 px-4 py-2 text-[11px] font-bold"
                style={{
                  ...(canProceed ? BTN.base : BTN.disabled),
                  fontFamily: font,
                  cursor: canProceed ? 'pointer' : 'default',
                }}
                {...(canProceed ? hoverHandlers : {})}
              >
                Next <ChevronRight className="w-3 h-3" />
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={isCreating || !canProceed}
                className="flex items-center gap-2 px-5 py-2 text-[12px] font-bold generate-btn"
                style={{
                  fontFamily: font,
                  border: 'none',
                  cursor: isCreating ? 'wait' : 'pointer',
                  opacity: isCreating ? 0.7 : 1,
                }}
              >
                <Zap className="w-4 h-4" />
                {isCreating ? 'Creating...' : 'Create Agent'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentCreator;
