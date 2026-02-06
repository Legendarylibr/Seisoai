/**
 * AgentCreator — 4-step wizard for creating custom AI agents with SKILL.md generation
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Bot, ChevronRight, ChevronLeft, Download, Copy, Check, X, Zap, Code, Eye } from 'lucide-react';
import { WIN95, BTN, hoverHandlers } from '../utils/buttonStyles';
import { generateSkillMd, getAvailableTools, getDefaultToolsForType, type SkillAgentInput } from '../utils/skillGenerator';
import { createAgent } from '../services/agentRegistryService';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import logger from '../utils/logger';

interface AgentCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: () => void;
}

const AGENT_TYPES = [
  'Image Generation',
  'Video Generation',
  'Music Generation',
  'Chat/Assistant',
  'Multi-Modal',
  'Custom',
];

const STEPS = ['Identity', 'Capabilities', 'SKILL.md', 'Review'];
const font = 'Tahoma, "MS Sans Serif", sans-serif';
const monoFont = '"Consolas", "Courier New", monospace';

const AgentCreator: React.FC<AgentCreatorProps> = ({ isOpen, onClose, onCreated }) => {
  const { address } = useSimpleWallet();
  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createdAgentURI, setCreatedAgentURI] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  // Step 1 — Identity
  const [agentName, setAgentName] = useState('');
  const [agentDescription, setAgentDescription] = useState('');
  const [agentType, setAgentType] = useState('Image Generation');
  const [agentIcon, setAgentIcon] = useState('');

  // Step 2 — Capabilities
  const [selectedTools, setSelectedTools] = useState<string[]>(
    getDefaultToolsForType('Image Generation')
  );

  // Step 3 — SKILL.md
  const [editedSkillMd, setEditedSkillMd] = useState('');
  const [skillMdGenerated, setSkillMdGenerated] = useState(false);

  const availableTools = useMemo(() => getAvailableTools(), []);

  // When agent type changes, update default tools
  const handleTypeChange = useCallback((newType: string) => {
    setAgentType(newType);
    setSelectedTools(getDefaultToolsForType(newType));
  }, []);

  const toggleTool = useCallback((toolId: string) => {
    setSelectedTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  }, []);

  // Generate SKILL.md when entering step 3
  const agentInput: SkillAgentInput = useMemo(() => ({
    name: agentName || 'My Agent',
    description: agentDescription || 'A custom AI agent',
    type: agentType,
    tools: selectedTools,
  }), [agentName, agentDescription, agentType, selectedTools]);

  const generatedSkillMd = useMemo(() => generateSkillMd(agentInput), [agentInput]);

  const handleNextStep = useCallback(() => {
    if (step === 2 && !skillMdGenerated) {
      setEditedSkillMd(generatedSkillMd);
      setSkillMdGenerated(true);
    }
    setStep((s) => Math.min(s + 1, 3));
  }, [step, skillMdGenerated, generatedSkillMd]);

  const handlePrevStep = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const canProceed = useMemo(() => {
    switch (step) {
      case 0: return agentName.trim().length > 0 && agentDescription.trim().length > 0;
      case 1: return selectedTools.length > 0;
      case 2: return true;
      case 3: return true;
      default: return false;
    }
  }, [step, agentName, agentDescription, selectedTools]);

  const handleCreate = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      const result = await createAgent({
        name: agentName,
        description: agentDescription,
        type: agentType,
        image: agentIcon || undefined,
        tools: selectedTools,
        skillMd: editedSkillMd || generatedSkillMd,
      });

      if (result) {
        setCreateSuccess(true);
        setCreatedAgentURI(result.agentURI);
        onCreated?.();
      }
    } catch (error) {
      logger.error('Failed to create agent', { error });
    } finally {
      setIsCreating(false);
    }
  }, [isCreating, agentName, agentDescription, agentType, agentIcon, selectedTools, editedSkillMd, generatedSkillMd, onCreated]);

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
      // Fallback
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
    // Reset state
    setStep(0);
    setAgentName('');
    setAgentDescription('');
    setAgentType('Image Generation');
    setAgentIcon('');
    setSelectedTools(getDefaultToolsForType('Image Generation'));
    setEditedSkillMd('');
    setSkillMdGenerated(false);
    setCreateSuccess(false);
    setCreatedAgentURI('');
    setIsCreating(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] flex flex-col win95-window-open"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 8px rgba(0,0,0,0.4)`,
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
          <span className="text-[12px] font-bold flex-1">Create Agent — Step {step + 1} of {STEPS.length}</span>
          <button
            onClick={handleClose}
            className="w-5 h-5 flex items-center justify-center text-[10px] font-bold"
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

        {/* Step Indicator */}
        <div className="flex gap-0 px-3 pt-2 flex-shrink-0">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className="flex-1 text-center py-1 text-[10px] font-bold"
              style={{
                fontFamily: font,
                background: i === step ? WIN95.bg : WIN95.bgDark,
                color: i === step ? WIN95.text : WIN95.textDisabled,
                boxShadow: i === step
                  ? `inset 1px 1px 0 ${WIN95.border.light}, inset -1px 0 0 ${WIN95.border.darker}`
                  : 'none',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {createSuccess ? (
            /* ===== SUCCESS STATE ===== */
            <div className="text-center space-y-4">
              <div className="w-12 h-12 mx-auto rounded-full flex items-center justify-center" style={{ background: 'var(--win95-info-green)' }}>
                <Check className="w-6 h-6" style={{ color: 'var(--win95-success-text)' }} />
              </div>
              <h3 className="text-base font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                Agent Created!
              </h3>
              <p className="text-[11px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                Your agent "{agentName}" is ready. Download the SKILL.md file to use it in Cursor.
              </p>

              {/* Agent URI */}
              <div
                className="p-2 text-left"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  fontFamily: monoFont,
                  fontSize: '9px',
                  color: WIN95.text,
                  wordBreak: 'break-all',
                }}
              >
                {createdAgentURI.slice(0, 120)}...
              </div>

              <div className="flex gap-2 justify-center">
                <button
                  onClick={handleDownloadSkillMd}
                  className="flex items-center gap-2 px-4 py-2 text-[11px] font-bold generate-btn"
                  style={{ fontFamily: font, border: 'none', cursor: 'pointer' }}
                >
                  <Download className="w-4 h-4" />
                  Download SKILL.md
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
                Place the file in <code style={{ fontFamily: monoFont }}>.cursor/skills/your-agent/SKILL.md</code> to use in Cursor
              </p>
            </div>
          ) : step === 0 ? (
            /* ===== STEP 1: IDENTITY ===== */
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Agent Name *
                </label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value.slice(0, 64))}
                  placeholder="My Image Agent"
                  className="w-full p-2 text-[11px]"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                    border: 'none',
                    color: WIN95.text,
                    fontFamily: font,
                    outline: 'none',
                  }}
                />
                <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>{agentName.length}/64</span>
              </div>

              {/* Description */}
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Description *
                </label>
                <textarea
                  value={agentDescription}
                  onChange={(e) => setAgentDescription(e.target.value.slice(0, 256))}
                  placeholder="AI agent that generates high-quality images using multiple models..."
                  rows={3}
                  className="w-full p-2 text-[11px] resize-none"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                    border: 'none',
                    color: WIN95.text,
                    fontFamily: font,
                    outline: 'none',
                  }}
                />
                <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>{agentDescription.length}/256</span>
              </div>

              {/* Agent Type */}
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Agent Type
                </label>
                <select
                  value={agentType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className="w-full p-2 text-[11px]"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    border: 'none',
                    color: WIN95.text,
                    fontFamily: font,
                    outline: 'none',
                  }}
                >
                  {AGENT_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Icon URL */}
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Icon URL <span style={{ color: WIN95.textDisabled, fontWeight: 'normal' }}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={agentIcon}
                  onChange={(e) => setAgentIcon(e.target.value)}
                  placeholder="https://example.com/icon.png"
                  className="w-full p-2 text-[11px]"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                    border: 'none',
                    color: WIN95.text,
                    fontFamily: font,
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          ) : step === 1 ? (
            /* ===== STEP 2: CAPABILITIES ===== */
            <div className="space-y-3">
              <p className="text-[11px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                Select the tools your agent can use. All tools route through Seiso's API with x402 payment.
              </p>
              <div className="space-y-1">
                {availableTools.map((tool) => {
                  const isSelected = selectedTools.includes(tool.id);
                  return (
                    <label
                      key={tool.id}
                      className="flex items-start gap-2 p-2 cursor-pointer select-none"
                      style={{
                        background: isSelected ? 'var(--win95-info-green)' : 'transparent',
                        fontFamily: font,
                      }}
                      onClick={() => toggleTool(tool.id)}
                    >
                      <div
                        className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{
                          background: WIN95.inputBg,
                          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                        }}
                      >
                        {isSelected && (
                          <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold" style={{ color: WIN95.text }}>
                          {tool.name}
                        </div>
                        <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                          {tool.description} — {tool.usdPrice}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                {selectedTools.length} tool{selectedTools.length !== 1 ? 's' : ''} selected
              </p>
            </div>
          ) : step === 2 ? (
            /* ===== STEP 3: SKILL.MD PREVIEW ===== */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code className="w-4 h-4" style={{ color: WIN95.highlight }} />
                  <span className="text-[11px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                    SKILL.md Preview
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={handleDownloadSkillMd}
                    className="flex items-center gap-1 px-2 py-1 text-[10px]"
                    style={{ ...BTN.base, fontFamily: font }}
                    {...hoverHandlers}
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                  <button
                    onClick={() => handleCopy(editedSkillMd || generatedSkillMd, 'skill')}
                    className="flex items-center gap-1 px-2 py-1 text-[10px]"
                    style={{ ...BTN.base, fontFamily: font }}
                    {...hoverHandlers}
                  >
                    {copied === 'skill' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied === 'skill' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <textarea
                value={editedSkillMd || generatedSkillMd}
                onChange={(e) => setEditedSkillMd(e.target.value)}
                className="w-full p-3 text-[10px] resize-none"
                rows={18}
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                  border: 'none',
                  color: WIN95.text,
                  fontFamily: monoFont,
                  outline: 'none',
                  lineHeight: 1.5,
                }}
              />

              <p className="text-[9px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                Place this file in <code style={{ fontFamily: monoFont }}>.cursor/skills/{agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'my-agent'}/SKILL.md</code> to use this agent in Cursor.
                You can edit the content above before downloading.
              </p>
            </div>
          ) : (
            /* ===== STEP 4: REVIEW ===== */
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4" style={{ color: WIN95.highlight }} />
                <span className="text-[11px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                  Review Your Agent
                </span>
              </div>

              {/* Summary Card */}
              <div
                className="p-3 space-y-2"
                style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                }}
              >
                <div className="flex justify-between text-[11px]" style={{ fontFamily: font }}>
                  <span style={{ color: WIN95.textDisabled }}>Name:</span>
                  <span className="font-bold" style={{ color: WIN95.text }}>{agentName}</span>
                </div>
                <div className="flex justify-between text-[11px]" style={{ fontFamily: font }}>
                  <span style={{ color: WIN95.textDisabled }}>Type:</span>
                  <span className="font-bold" style={{ color: WIN95.text }}>{agentType}</span>
                </div>
                <div className="flex justify-between text-[11px]" style={{ fontFamily: font }}>
                  <span style={{ color: WIN95.textDisabled }}>Tools:</span>
                  <span className="font-bold" style={{ color: WIN95.text }}>{selectedTools.length} selected</span>
                </div>
                <div className="flex justify-between text-[11px]" style={{ fontFamily: font }}>
                  <span style={{ color: WIN95.textDisabled }}>Owner:</span>
                  <span className="font-mono text-[10px]" style={{ color: WIN95.text }}>
                    {address ? `${address.slice(0, 6)}...${address.slice(-4)}` : 'Not connected'}
                  </span>
                </div>
                <div className="pt-2 border-t" style={{ borderColor: WIN95.bgDark }}>
                  <span className="text-[10px]" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                    {agentDescription}
                  </span>
                </div>
              </div>

              {/* Tools List */}
              <div>
                <span className="text-[10px] font-bold block mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Selected Tools:
                </span>
                <div className="flex flex-wrap gap-1">
                  {selectedTools.map((toolId) => (
                    <span
                      key={toolId}
                      className="px-2 py-0.5 text-[9px]"
                      style={{
                        background: WIN95.bgDark,
                        color: WIN95.highlightText,
                        fontFamily: font,
                      }}
                    >
                      {toolId}
                    </span>
                  ))}
                </div>
              </div>

              {/* SKILL.md included note */}
              <div
                className="p-2 flex items-center gap-2"
                style={{
                  background: 'var(--win95-info-green)',
                  fontFamily: font,
                }}
              >
                <Check className="w-3.5 h-3.5" style={{ color: 'var(--win95-success-text)' }} />
                <span className="text-[10px]" style={{ color: WIN95.text }}>
                  SKILL.md file will be included with your agent
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer — Navigation Buttons */}
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
              {step === 0 ? (
                <>Cancel</>
              ) : (
                <>
                  <ChevronLeft className="w-3 h-3" />
                  Back
                </>
              )}
            </button>

            {step < 3 ? (
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
                Next
                <ChevronRight className="w-3 h-3" />
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
