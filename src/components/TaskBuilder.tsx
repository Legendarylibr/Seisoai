/**
 * TaskBuilder — Claude Cowork-style visual workflow builder
 * 
 * Features:
 * - Natural language goal input with AI planning
 * - Visual DAG task canvas with dependency lines
 * - Task detail panel with auto-generated parameter forms
 * - Live execution with status tracking and output previews
 * - Pre-built workflow templates
 * - Manual task add/remove from tool catalog
 */
import React, { useState, useCallback, useEffect, useReducer, useRef, useMemo } from 'react';
import {
  Sparkles, Play, Plus, ChevronDown,
  Image, Film, Music, Mic, Box, Eye, Wand2, Zap, AlertCircle,
  Check, X, Loader2, Clock, DollarSign, ArrowRight, RotateCcw,
  Settings, ListTree
} from 'lucide-react';
import { WIN95, BTN, PANEL, INPUT, WINDOW_TITLE_STYLE, hoverHandlers } from '../utils/buttonStyles';
import { API_URL, apiFetch } from '../utils/apiConfig';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import logger from '../utils/logger';

// ============================================
// Types
// ============================================

interface ToolSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  credits: number;
  tags: string[];
  executionMode: 'sync' | 'queue';
  inputSchema?: {
    type: string;
    properties: Record<string, SchemaProperty>;
    required: string[];
  };
}

interface SchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: { type: string; enum?: string[] };
}

interface OrchestrationStep {
  stepId: string;
  toolId: string;
  toolName: string;
  input: Record<string, unknown>;
  inputMappings?: Record<string, string>;
  description: string;
}

interface OrchestrationPlan {
  goal: string;
  steps: OrchestrationStep[];
  estimatedCredits: number;
  estimatedDurationSeconds: number;
}

interface StepResult {
  stepId: string;
  toolId: string;
  status: 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  durationMs: number;
}

interface TaskNode extends OrchestrationStep {
  column: number;
  row: number;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: unknown;
  error?: string;
  durationMs?: number;
}

interface WorkflowTemplate {
  id: string;
  goal: string;
  stepCount: number;
  estimatedCredits: number;
}

// ============================================
// State
// ============================================

type Mode = 'idle' | 'planning' | 'editing' | 'executing' | 'completed' | 'failed';

interface TaskBuilderState {
  mode: Mode;
  goal: string;
  plan: OrchestrationPlan | null;
  tasks: TaskNode[];
  selectedTaskId: string | null;
  executionResults: StepResult[];
  availableTools: ToolSummary[];
  templates: WorkflowTemplate[];
  error: string | null;
  totalCreditsUsed: number;
  totalDurationMs: number;
}

type Action =
  | { type: 'SET_GOAL'; goal: string }
  | { type: 'START_PLANNING' }
  | { type: 'PLAN_RECEIVED'; plan: OrchestrationPlan }
  | { type: 'PLAN_ERROR'; error: string }
  | { type: 'SELECT_TASK'; taskId: string | null }
  | { type: 'UPDATE_TASK_INPUT'; taskId: string; key: string; value: unknown }
  | { type: 'REMOVE_TASK'; taskId: string }
  | { type: 'ADD_TASK'; tool: ToolSummary; afterStepId?: string }
  | { type: 'START_EXECUTION' }
  | { type: 'EXECUTION_RESULT'; result: { stepResults: StepResult[]; totalCredits: number; totalDurationMs: number; success: boolean } }
  | { type: 'EXECUTION_ERROR'; error: string }
  | { type: 'SET_TOOLS'; tools: ToolSummary[] }
  | { type: 'SET_TEMPLATES'; templates: WorkflowTemplate[] }
  | { type: 'RESET' };

// ============================================
// DAG Layout
// ============================================

function buildDependencyMap(steps: OrchestrationStep[]): Map<string, Set<string>> {
  const deps = new Map<string, Set<string>>();
  for (const step of steps) {
    const stepDeps = new Set<string>();
    if (step.inputMappings) {
      for (const ref of Object.values(step.inputMappings)) {
        if (typeof ref === 'string' && ref.startsWith('$')) {
          const depStepId = ref.slice(1).split('.')[0];
          if (depStepId && depStepId !== step.stepId) {
            stepDeps.add(depStepId);
          }
        }
      }
    }
    deps.set(step.stepId, stepDeps);
  }
  return deps;
}

function layoutTasks(steps: OrchestrationStep[]): TaskNode[] {
  if (steps.length === 0) return [];
  const deps = buildDependencyMap(steps);

  // Assign columns by topological depth
  const columnMap = new Map<string, number>();
  const resolved = new Set<string>();

  function getDepth(stepId: string, visited: Set<string> = new Set()): number {
    if (columnMap.has(stepId)) return columnMap.get(stepId)!;
    if (visited.has(stepId)) return 0; // circular
    visited.add(stepId);

    const stepDeps = deps.get(stepId) || new Set();
    if (stepDeps.size === 0) return 0;

    let maxDepth = 0;
    for (const dep of stepDeps) {
      maxDepth = Math.max(maxDepth, getDepth(dep, visited) + 1);
    }
    return maxDepth;
  }

  for (const step of steps) {
    columnMap.set(step.stepId, getDepth(step.stepId));
  }

  // Group by column for row assignment
  const columnGroups = new Map<number, string[]>();
  for (const [stepId, col] of columnMap) {
    const group = columnGroups.get(col) || [];
    group.push(stepId);
    columnGroups.set(col, group);
  }

  const taskNodes: TaskNode[] = steps.map(step => {
    const col = columnMap.get(step.stepId) || 0;
    const group = columnGroups.get(col) || [];
    const row = group.indexOf(step.stepId);
    return {
      ...step,
      column: col,
      row,
      status: 'pending' as const,
    };
  });

  return taskNodes;
}

// ============================================
// Reducer
// ============================================

function reducer(state: TaskBuilderState, action: Action): TaskBuilderState {
  switch (action.type) {
    case 'SET_GOAL':
      return { ...state, goal: action.goal, error: null };

    case 'START_PLANNING':
      return { ...state, mode: 'planning', error: null, plan: null, tasks: [], executionResults: [], selectedTaskId: null };

    case 'PLAN_RECEIVED': {
      const tasks = layoutTasks(action.plan.steps);
      return { ...state, mode: 'editing', plan: action.plan, tasks, error: null };
    }

    case 'PLAN_ERROR':
      return { ...state, mode: 'idle', error: action.error };

    case 'SELECT_TASK':
      return { ...state, selectedTaskId: action.taskId };

    case 'UPDATE_TASK_INPUT':
      return {
        ...state,
        tasks: state.tasks.map(t =>
          t.stepId === action.taskId
            ? { ...t, input: { ...t.input, [action.key]: action.value } }
            : t
        ),
      };

    case 'REMOVE_TASK': {
      const filtered = state.tasks.filter(t => t.stepId !== action.taskId);
      // Re-layout after removal
      const reLayouted = layoutTasks(filtered);
      return {
        ...state,
        tasks: reLayouted,
        selectedTaskId: state.selectedTaskId === action.taskId ? null : state.selectedTaskId,
        plan: state.plan ? { ...state.plan, steps: filtered } : null,
      };
    }

    case 'ADD_TASK': {
      const newStepId = `step${state.tasks.length + 1}`;
      const newStep: OrchestrationStep = {
        stepId: newStepId,
        toolId: action.tool.id,
        toolName: action.tool.name,
        input: {},
        description: action.tool.description,
      };
      const allSteps = [...state.tasks, newStep];
      const reLayouted = layoutTasks(allSteps);
      return {
        ...state,
        tasks: reLayouted,
        plan: state.plan
          ? { ...state.plan, steps: allSteps, estimatedCredits: (state.plan.estimatedCredits || 0) + action.tool.credits }
          : { goal: state.goal, steps: allSteps, estimatedCredits: action.tool.credits, estimatedDurationSeconds: 30 },
      };
    }

    case 'START_EXECUTION':
      return {
        ...state,
        mode: 'executing',
        error: null,
        executionResults: [],
        totalCreditsUsed: 0,
        totalDurationMs: 0,
        tasks: state.tasks.map(t => ({ ...t, status: 'running' as const, result: undefined, error: undefined })),
      };

    case 'EXECUTION_RESULT': {
      const resultMap = new Map(action.result.stepResults.map(r => [r.stepId, r]));
      return {
        ...state,
        mode: action.result.success ? 'completed' : 'failed',
        executionResults: action.result.stepResults,
        totalCreditsUsed: action.result.totalCredits,
        totalDurationMs: action.result.totalDurationMs,
        tasks: state.tasks.map(t => {
          const r = resultMap.get(t.stepId);
          if (r) {
            return { ...t, status: r.status, result: r.result, error: r.error, durationMs: r.durationMs };
          }
          return { ...t, status: 'pending' as const };
        }),
      };
    }

    case 'EXECUTION_ERROR':
      return { ...state, mode: 'failed', error: action.error };

    case 'SET_TOOLS':
      return { ...state, availableTools: action.tools };

    case 'SET_TEMPLATES':
      return { ...state, templates: action.templates };

    case 'RESET':
      return { ...initialState, availableTools: state.availableTools, templates: state.templates };

    default:
      return state;
  }
}

const initialState: TaskBuilderState = {
  mode: 'idle',
  goal: '',
  plan: null,
  tasks: [],
  selectedTaskId: null,
  executionResults: [],
  availableTools: [],
  templates: [],
  error: null,
  totalCreditsUsed: 0,
  totalDurationMs: 0,
};

// ============================================
// Helpers
// ============================================

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'image-generation': <Image size={14} />,
  'image-editing': <Image size={14} />,
  'image-processing': <Image size={14} />,
  'video-generation': <Film size={14} />,
  'video-editing': <Film size={14} />,
  'audio-generation': <Music size={14} />,
  'audio-processing': <Mic size={14} />,
  'music-generation': <Music size={14} />,
  '3d-generation': <Box size={14} />,
  'vision': <Eye size={14} />,
  'text': <Wand2 size={14} />,
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: '#c0c0c0', text: '#808080', border: '#808080' },
  running: { bg: '#000080', text: '#ffffff', border: '#000080' },
  completed: { bg: '#008000', text: '#ffffff', border: '#008000' },
  failed: { bg: '#800000', text: '#ffffff', border: '#800000' },
  skipped: { bg: '#808080', text: '#ffffff', border: '#808080' },
};

function getCategoryIcon(category: string): React.ReactNode {
  return CATEGORY_ICONS[category] || <Zap size={14} />;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getOutputPreview(result: unknown): { type: 'image' | 'audio' | 'video' | 'text' | 'unknown'; url?: string; text?: string } {
  if (!result || typeof result !== 'object') return { type: 'unknown' };
  const r = result as Record<string, unknown>;

  // Check for image URLs
  if (r.images && Array.isArray(r.images) && r.images.length > 0) {
    const img = r.images[0] as Record<string, unknown>;
    return { type: 'image', url: (img.url || img.content_type) as string };
  }
  if (r.image && typeof r.image === 'object') {
    return { type: 'image', url: ((r.image as Record<string, unknown>).url) as string };
  }

  // Check for audio
  if (r.audio_file && typeof r.audio_file === 'object') {
    return { type: 'audio', url: ((r.audio_file as Record<string, unknown>).url) as string };
  }
  if (r.audio && typeof r.audio === 'object') {
    return { type: 'audio', url: ((r.audio as Record<string, unknown>).url) as string };
  }

  // Check for video
  if (r.video && typeof r.video === 'object') {
    return { type: 'video', url: ((r.video as Record<string, unknown>).url) as string };
  }

  // Check for text output
  if (r.output && typeof r.output === 'string') {
    return { type: 'text', text: r.output as string };
  }
  if (r.text && typeof r.text === 'string') {
    return { type: 'text', text: r.text as string };
  }

  return { type: 'unknown' };
}

// ============================================
// Sub-Components
// ============================================

/** Status badge for task cards */
const StatusBadge: React.FC<{ status: TaskNode['status'] }> = ({ status }) => {
  const colors = STATUS_COLORS[status];
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock size={10} />,
    running: <Loader2 size={10} className="animate-spin" />,
    completed: <Check size={10} />,
    failed: <X size={10} />,
    skipped: <ArrowRight size={10} />,
  };

  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {icons[status]}
      {status}
    </span>
  );
};

/** Output preview thumbnail */
const OutputPreview: React.FC<{ result: unknown }> = ({ result }) => {
  const preview = getOutputPreview(result);
  if (preview.type === 'unknown') return null;

  return (
    <div
      className="mt-1 p-1"
      style={{ ...PANEL.sunken, maxHeight: 120, overflow: 'hidden' }}
    >
      {preview.type === 'image' && preview.url && (
        <img src={preview.url} alt="Output" className="w-full h-auto max-h-[100px] object-contain" />
      )}
      {preview.type === 'audio' && preview.url && (
        <audio controls src={preview.url} className="w-full h-6" style={{ maxHeight: 28 }} />
      )}
      {preview.type === 'video' && preview.url && (
        <video controls src={preview.url} className="w-full h-auto max-h-[100px]" />
      )}
      {preview.type === 'text' && preview.text && (
        <p className="text-[9px] leading-tight truncate" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {preview.text.slice(0, 200)}
        </p>
      )}
    </div>
  );
};

/** Single task card in the DAG canvas */
const TaskCard: React.FC<{
  task: TaskNode;
  isSelected: boolean;
  onClick: () => void;
  onRemove: () => void;
  canRemove: boolean;
}> = ({ task, isSelected, onClick, onRemove, canRemove }) => {
  const colors = STATUS_COLORS[task.status];
  const icon = getCategoryIcon(task.toolId.split('.')[0] + '-' + (task.toolId.includes('generate') ? 'generation' : task.toolId.split('.')[1]));

  // Try to find a matching category icon
  const catKey = Object.keys(CATEGORY_ICONS).find(k => task.toolId.startsWith(k.split('-')[0]));
  const taskIcon = catKey ? CATEGORY_ICONS[catKey] : getCategoryIcon(task.toolId);

  return (
    <div
      className="relative cursor-pointer select-none"
      style={{
        width: 200,
        minHeight: 80,
        background: WIN95.bg,
        boxShadow: isSelected
          ? `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 0 0 0 2px #000080`
          : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 2px 2px 0 rgba(0,0,0,0.15)`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
      }}
      onClick={onClick}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-1.5 py-0.5"
        style={{
          background: isSelected ? 'var(--win95-active-title)' : 'var(--win95-inactive-title)',
          color: isSelected ? '#ffffff' : WIN95.textDisabled,
        }}
      >
        <div className="flex items-center gap-1 min-w-0">
          {taskIcon}
          <span className="text-[10px] font-bold truncate">{task.stepId}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <StatusBadge status={task.status} />
          {canRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="w-3.5 h-3.5 flex items-center justify-center text-[9px] hover:bg-red-700 hover:text-white"
              style={{
                background: WIN95.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              }}
            >
              <X size={8} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-1.5 space-y-1">
        <p className="text-[10px] font-bold leading-tight truncate" style={{ color: WIN95.text }}>
          {task.toolName}
        </p>
        <p className="text-[9px] leading-tight line-clamp-2" style={{ color: WIN95.textDisabled }}>
          {task.description}
        </p>

        {/* Input mappings chips */}
        {task.inputMappings && Object.keys(task.inputMappings).length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {Object.entries(task.inputMappings).map(([key, ref]) => (
              <span
                key={key}
                className="px-1 py-0.5 text-[8px] font-mono"
                style={{ background: '#ffffcc', color: '#333', border: '1px solid #ccc' }}
                title={`${key} = ${ref}`}
              >
                {ref.length > 20 ? ref.slice(0, 18) + '..' : ref}
              </span>
            ))}
          </div>
        )}

        {/* Duration on completed */}
        {task.durationMs !== undefined && task.status !== 'pending' && (
          <div className="flex items-center gap-1 text-[9px]" style={{ color: WIN95.textDisabled }}>
            <Clock size={8} />
            {formatDuration(task.durationMs)}
          </div>
        )}

        {/* Error message */}
        {task.error && (
          <p className="text-[9px] leading-tight" style={{ color: WIN95.errorText || '#800000' }}>
            {task.error}
          </p>
        )}

        {/* Output preview */}
        {task.result && <OutputPreview result={task.result} />}
      </div>
    </div>
  );
};

/** Connection line between tasks (SVG) */
const ConnectionLines: React.FC<{ tasks: TaskNode[]; containerRef: React.RefObject<HTMLDivElement | null> }> = ({ tasks, containerRef }) => {
  const [lines, setLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number }>>([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const newLines: typeof lines = [];

    const deps = buildDependencyMap(tasks);

    for (const task of tasks) {
      const taskDeps = deps.get(task.stepId) || new Set();
      for (const depId of taskDeps) {
        const sourceEl = container.querySelector(`[data-step-id="${depId}"]`);
        const targetEl = container.querySelector(`[data-step-id="${task.stepId}"]`);
        if (sourceEl && targetEl) {
          const containerRect = container.getBoundingClientRect();
          const sourceRect = sourceEl.getBoundingClientRect();
          const targetRect = targetEl.getBoundingClientRect();

          newLines.push({
            x1: sourceRect.right - containerRect.left,
            y1: sourceRect.top + sourceRect.height / 2 - containerRect.top,
            x2: targetRect.left - containerRect.left,
            y2: targetRect.top + targetRect.height / 2 - containerRect.top,
          });
        }
      }
    }

    setLines(newLines);
  }, [tasks, containerRef]);

  if (lines.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      <defs>
        <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
          <polygon points="0 0, 8 3, 0 6" fill="#000080" />
        </marker>
      </defs>
      {lines.map((line, i) => {
        const midX = (line.x1 + line.x2) / 2;
        return (
          <path
            key={i}
            d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`}
            fill="none"
            stroke="#000080"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            markerEnd="url(#arrowhead)"
            opacity={0.6}
          />
        );
      })}
    </svg>
  );
};

/** Task detail panel (sidebar) */
const TaskDetailPanel: React.FC<{
  task: TaskNode;
  toolDetail: ToolSummary | null;
  onUpdateInput: (key: string, value: unknown) => void;
  onClose: () => void;
}> = ({ task, toolDetail, onUpdateInput, onClose }) => {
  const schema = toolDetail?.inputSchema;

  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 300,
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
      }}
    >
      {/* Title */}
      <div className="flex items-center justify-between px-2 py-1" style={WINDOW_TITLE_STYLE}>
        <div className="flex items-center gap-1">
          <Settings size={12} />
          <span className="text-[10px]">{task.stepId} - {task.toolName}</span>
        </div>
        <button
          onClick={onClose}
          className="w-4 h-4 flex items-center justify-center text-[10px] font-bold"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
            color: WIN95.text,
          }}
        >
          x
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Tool info */}
        <div className="p-1.5" style={PANEL.sunken}>
          <p className="text-[10px] font-bold" style={{ color: WIN95.text }}>{task.toolName}</p>
          <p className="text-[9px] mt-0.5" style={{ color: WIN95.textDisabled }}>{task.description}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] px-1" style={{ background: '#e0e0ff', color: '#000080' }}>{task.toolId}</span>
            <StatusBadge status={task.status} />
          </div>
        </div>

        {/* Input mappings */}
        {task.inputMappings && Object.keys(task.inputMappings).length > 0 && (
          <div>
            <p className="text-[10px] font-bold mb-1" style={{ color: WIN95.text }}>Data Flow (from previous steps)</p>
            <div className="space-y-0.5">
              {Object.entries(task.inputMappings).map(([key, ref]) => (
                <div key={key} className="flex items-center gap-1 p-1 text-[9px]" style={PANEL.sunken}>
                  <span className="font-bold" style={{ color: WIN95.text }}>{key}</span>
                  <ArrowRight size={8} style={{ color: WIN95.textDisabled }} />
                  <span className="font-mono" style={{ color: '#000080' }}>{ref}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parameters form */}
        <div>
          <p className="text-[10px] font-bold mb-1" style={{ color: WIN95.text }}>Parameters</p>
          {schema ? (
            <div className="space-y-1.5">
              {Object.entries(schema.properties).map(([key, prop]) => {
                const isRequired = schema.required?.includes(key);
                // Skip params that are mapped from other steps
                if (task.inputMappings && key in task.inputMappings) return null;

                const value = task.input[key] ?? prop.default ?? '';

                return (
                  <div key={key}>
                    <label className="text-[9px] font-bold block mb-0.5" style={{ color: WIN95.text }}>
                      {key}
                      {isRequired && <span style={{ color: '#800000' }}> *</span>}
                    </label>
                    <p className="text-[8px] mb-0.5" style={{ color: WIN95.textDisabled }}>{prop.description}</p>

                    {prop.enum ? (
                      <select
                        value={String(value)}
                        onChange={(e) => onUpdateInput(key, e.target.value)}
                        className="w-full p-0.5 text-[10px]"
                        style={{ ...INPUT.base }}
                      >
                        <option value="">-- select --</option>
                        {prop.enum.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : prop.type === 'boolean' ? (
                      <label className="flex items-center gap-1 text-[10px]" style={{ color: WIN95.text }}>
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => onUpdateInput(key, e.target.checked)}
                        />
                        {key}
                      </label>
                    ) : prop.type === 'number' || prop.type === 'integer' ? (
                      <input
                        type="number"
                        value={String(value)}
                        min={prop.minimum}
                        max={prop.maximum}
                        onChange={(e) => onUpdateInput(key, parseFloat(e.target.value) || 0)}
                        className="w-full p-0.5 text-[10px]"
                        style={{ ...INPUT.base }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={String(value)}
                        onChange={(e) => onUpdateInput(key, e.target.value)}
                        className="w-full p-0.5 text-[10px]"
                        placeholder={prop.description}
                        style={{ ...INPUT.base }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-2" style={PANEL.sunken}>
              <p className="text-[9px] text-center" style={{ color: WIN95.textDisabled }}>
                Loading tool schema...
              </p>
            </div>
          )}
        </div>

        {/* Output preview */}
        {task.result && (
          <div>
            <p className="text-[10px] font-bold mb-1" style={{ color: WIN95.text }}>Output</p>
            <OutputPreview result={task.result} />
          </div>
        )}

        {/* Error */}
        {task.error && (
          <div className="p-1.5" style={{ background: WIN95.errorBg || '#ffcccc' }}>
            <p className="text-[9px] font-bold" style={{ color: WIN95.errorText || '#800000' }}>
              <AlertCircle size={10} className="inline mr-1" />
              {task.error}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

/** Add task dropdown */
const AddTaskDropdown: React.FC<{
  tools: ToolSummary[];
  onAdd: (tool: ToolSummary) => void;
}> = ({ tools, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return tools;
    const q = search.toLowerCase();
    return tools.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q))
    );
  }, [tools, search]);

  // Group by category
  const grouped = useMemo(() => {
    const groups = new Map<string, ToolSummary[]>();
    for (const tool of filtered) {
      const existing = groups.get(tool.category) || [];
      existing.push(tool);
      groups.set(tool.category, existing);
    }
    return groups;
  }, [filtered]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold"
        style={{ ...BTN.base }}
        {...hoverHandlers}
      >
        <Plus size={10} />
        Add Task
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 z-50"
          style={{
            width: 280,
            maxHeight: 350,
            background: WIN95.bg,
            boxShadow: `2px 2px 0 ${WIN95.border.darker}, inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
          }}
        >
          {/* Search */}
          <div className="p-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tools..."
              className="w-full p-1 text-[10px]"
              style={{ ...INPUT.base }}
              autoFocus
            />
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
            {Array.from(grouped.entries()).map(([category, categoryTools]) => (
              <div key={category}>
                <div className="px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: WIN95.bgDark, color: WIN95.highlightText }}>
                  {getCategoryIcon(category)} {category.replace(/-/g, ' ')}
                </div>
                {categoryTools.map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => { onAdd(tool); setIsOpen(false); setSearch(''); }}
                    className="w-full text-left px-2 py-1 hover:bg-blue-900 hover:text-white text-[10px] flex items-center justify-between"
                    style={{ color: WIN95.text }}
                  >
                    <span className="truncate">{tool.name}</span>
                    <span className="text-[8px] ml-1 flex-shrink-0" style={{ color: WIN95.textDisabled }}>
                      {tool.credits} cr
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {grouped.size === 0 && (
              <p className="p-2 text-center text-[10px]" style={{ color: WIN95.textDisabled }}>
                No tools found
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// Main Component
// ============================================

const TaskBuilder: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { isConnected, credits } = useSimpleWallet();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Fetch available tools on mount
  useEffect(() => {
    const fetchTools = async () => {
      try {
        const res = await apiFetch(`${API_URL}/api/gateway/tools`);
        if (res.ok) {
          const data = await res.json();
          if (data.tools) {
            dispatch({ type: 'SET_TOOLS', tools: data.tools });
          }
        }
      } catch (err) {
        logger.error('Failed to fetch tools', err);
      }
    };

    const fetchTemplates = async () => {
      try {
        const res = await apiFetch(`${API_URL}/api/gateway/workflows`);
        if (res.ok) {
          const data = await res.json();
          if (data.workflows) {
            dispatch({ type: 'SET_TEMPLATES', templates: data.workflows });
          }
        }
      } catch (err) {
        logger.error('Failed to fetch templates', err);
      }
    };

    fetchTools();
    fetchTemplates();
  }, []);

  // Fetch detailed tool schema when a task is selected
  const [selectedToolDetail, setSelectedToolDetail] = useState<ToolSummary | null>(null);
  useEffect(() => {
    if (!state.selectedTaskId) {
      setSelectedToolDetail(null);
      return;
    }
    const task = state.tasks.find(t => t.stepId === state.selectedTaskId);
    if (!task) return;

    const fetchDetail = async () => {
      try {
        const res = await apiFetch(`${API_URL}/api/gateway/tools/${task.toolId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.tool) setSelectedToolDetail(data.tool);
        }
      } catch (err) {
        logger.error('Failed to fetch tool detail', err);
      }
    };
    fetchDetail();
  }, [state.selectedTaskId, state.tasks]);

  // Plan with AI
  const handlePlan = useCallback(async () => {
    if (!state.goal.trim()) return;
    dispatch({ type: 'START_PLANNING' });

    try {
      const res = await apiFetch(`${API_URL}/api/gateway/orchestrate/plan`, {
        method: 'POST',
        body: JSON.stringify({ goal: state.goal }),
      });
      const data = await res.json();
      if (data.success && data.plan) {
        dispatch({ type: 'PLAN_RECEIVED', plan: data.plan });
      } else {
        dispatch({ type: 'PLAN_ERROR', error: data.error || 'Failed to generate plan' });
      }
    } catch (err) {
      dispatch({ type: 'PLAN_ERROR', error: (err as Error).message });
    }
  }, [state.goal]);

  // Load template
  const handleLoadTemplate = useCallback(async (templateId: string) => {
    dispatch({ type: 'SET_GOAL', goal: `Execute workflow: ${templateId}` });
    dispatch({ type: 'START_PLANNING' });
    setShowTemplates(false);

    try {
      const res = await apiFetch(`${API_URL}/api/gateway/workflows/${templateId}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        // Build a plan from the template response
        const plan: OrchestrationPlan = data.plan || {
          goal: templateId,
          steps: data.stepResults?.map((r: StepResult, i: number) => ({
            stepId: r.stepId || `step${i + 1}`,
            toolId: r.toolId,
            toolName: r.toolId,
            input: {},
            description: `Step ${i + 1}`,
          })) || [],
          estimatedCredits: data.totalCredits || 0,
          estimatedDurationSeconds: 30,
        };
        dispatch({ type: 'PLAN_RECEIVED', plan });
      } else {
        dispatch({ type: 'PLAN_ERROR', error: data.error || 'Failed to load template' });
      }
    } catch (err) {
      dispatch({ type: 'PLAN_ERROR', error: (err as Error).message });
    }
  }, []);

  // Execute plan
  const handleExecute = useCallback(async () => {
    if (!state.plan || state.tasks.length === 0) return;
    dispatch({ type: 'START_EXECUTION' });

    const planToExecute: OrchestrationPlan = {
      ...state.plan,
      steps: state.tasks.map(t => ({
        stepId: t.stepId,
        toolId: t.toolId,
        toolName: t.toolName,
        input: t.input,
        inputMappings: t.inputMappings,
        description: t.description,
      })),
    };

    try {
      const res = await apiFetch(`${API_URL}/api/gateway/orchestrate/execute`, {
        method: 'POST',
        body: JSON.stringify({ plan: planToExecute }),
      });
      const data = await res.json();
      if (data.stepResults) {
        dispatch({
          type: 'EXECUTION_RESULT',
          result: {
            stepResults: data.stepResults,
            totalCredits: data.totalCredits || 0,
            totalDurationMs: data.totalDurationMs || 0,
            success: data.success,
          },
        });
      } else {
        dispatch({ type: 'EXECUTION_ERROR', error: data.error || 'Execution failed' });
      }
    } catch (err) {
      dispatch({ type: 'EXECUTION_ERROR', error: (err as Error).message });
    }
  }, [state.plan, state.tasks]);

  // Calculate columns for the canvas layout
  const maxColumn = useMemo(() => Math.max(0, ...state.tasks.map(t => t.column)), [state.tasks]);

  const selectedTask = useMemo(
    () => state.tasks.find(t => t.stepId === state.selectedTaskId) || null,
    [state.tasks, state.selectedTaskId]
  );

  const estimatedCredits = useMemo(() => {
    if (state.plan) return state.plan.estimatedCredits;
    return state.tasks.reduce((sum, t) => {
      const tool = state.availableTools.find(at => at.id === t.toolId);
      return sum + (tool?.credits || 0);
    }, 0);
  }, [state.plan, state.tasks, state.availableTools]);

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
      {/* Window chrome */}
      <div
        className="flex flex-col"
        style={{
          height: '100%',
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
        }}
      >
        {/* Title bar */}
        <div className="flex items-center justify-between px-2 py-1" style={WINDOW_TITLE_STYLE}>
          <div className="flex items-center gap-1.5">
            <ListTree size={14} />
            <span className="text-[11px] font-bold">Workflow Builder</span>
            {state.mode !== 'idle' && (
              <span className="text-[9px] opacity-80 ml-1">
                [{state.mode}]
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[9px]">
            {state.tasks.length > 0 && (
              <>
                <span className="flex items-center gap-0.5">
                  <DollarSign size={9} />
                  {state.mode === 'completed' ? state.totalCreditsUsed : estimatedCredits} credits
                </span>
                <span className="flex items-center gap-0.5">
                  <Clock size={9} />
                  {state.mode === 'completed'
                    ? formatDuration(state.totalDurationMs)
                    : `~${state.plan?.estimatedDurationSeconds || '?'}s`}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-1.5 px-2 py-1 flex-wrap"
          style={{
            background: WIN95.bg,
            borderBottom: `1px solid ${WIN95.border.dark}`,
          }}
        >
          {/* Goal Input */}
          <div className="flex-1 min-w-[200px] flex items-center gap-1">
            <input
              type="text"
              value={state.goal}
              onChange={(e) => dispatch({ type: 'SET_GOAL', goal: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && handlePlan()}
              placeholder="Describe your creative goal... e.g. 'Create a music video with AI visuals'"
              className="flex-1 p-1 text-[10px]"
              style={{ ...INPUT.base }}
              disabled={state.mode === 'executing'}
            />
            <button
              onClick={handlePlan}
              disabled={!state.goal.trim() || state.mode === 'planning' || state.mode === 'executing'}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold whitespace-nowrap"
              style={{
                ...(state.mode === 'planning' ? BTN.disabled : BTN.base),
                background: state.mode === 'planning' ? BTN.disabled.background : '#2d8a2d',
                color: state.mode === 'planning' ? BTN.disabled.color : '#ffffff',
              }}
              {...(state.mode !== 'planning' ? hoverHandlers : {})}
            >
              {state.mode === 'planning' ? (
                <><Loader2 size={10} className="animate-spin" /> Planning...</>
              ) : (
                <><Sparkles size={10} /> Plan with AI</>
              )}
            </button>
          </div>

          {/* Template button */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold"
              style={{ ...BTN.base }}
              {...hoverHandlers}
            >
              <ChevronDown size={10} />
              Templates
            </button>
            {showTemplates && (
              <div
                className="absolute top-full right-0 mt-1 z-50"
                style={{
                  width: 240,
                  background: WIN95.bg,
                  boxShadow: `2px 2px 0 ${WIN95.border.darker}, inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                }}
              >
                <div className="px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ background: WIN95.bgDark, color: WIN95.highlightText }}>
                  Pre-built Workflows
                </div>
                {state.templates.length > 0 ? state.templates.map(tmpl => (
                  <button
                    key={tmpl.id}
                    onClick={() => handleLoadTemplate(tmpl.id)}
                    className="w-full text-left px-2 py-1.5 hover:bg-blue-900 hover:text-white text-[10px] flex items-center justify-between"
                    style={{ color: WIN95.text, borderBottom: `1px solid ${WIN95.border.dark}` }}
                  >
                    <div>
                      <span className="font-bold">{tmpl.id.replace(/-/g, ' ')}</span>
                      <span className="block text-[8px]" style={{ color: WIN95.textDisabled }}>
                        {tmpl.stepCount} steps
                      </span>
                    </div>
                    <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>
                      ~{tmpl.estimatedCredits} cr
                    </span>
                  </button>
                )) : (
                  <p className="p-2 text-center text-[9px]" style={{ color: WIN95.textDisabled }}>
                    No templates available
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Add task */}
          {(state.mode === 'editing' || state.mode === 'idle') && state.availableTools.length > 0 && (
            <AddTaskDropdown
              tools={state.availableTools}
              onAdd={(tool) => dispatch({ type: 'ADD_TASK', tool })}
            />
          )}

          {/* Execute button */}
          {state.mode === 'editing' && state.tasks.length > 0 && (
            <button
              onClick={handleExecute}
              className="flex items-center gap-1 px-3 py-1 text-[10px] font-bold"
              style={{
                ...BTN.base,
                background: '#000080',
                color: '#ffffff',
              }}
              {...hoverHandlers}
            >
              <Play size={10} />
              Execute ({estimatedCredits} credits)
            </button>
          )}

          {/* Reset button */}
          {state.mode !== 'idle' && state.mode !== 'planning' && state.mode !== 'executing' && (
            <button
              onClick={() => dispatch({ type: 'RESET' })}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold"
              style={{ ...BTN.base }}
              {...hoverHandlers}
            >
              <RotateCcw size={10} />
              New
            </button>
          )}
        </div>

        {/* Error banner */}
        {state.error && (
          <div
            className="flex items-center gap-2 px-2 py-1 text-[10px]"
            style={{ background: WIN95.errorBg || '#ffcccc', color: WIN95.errorText || '#800000' }}
          >
            <AlertCircle size={12} />
            <span className="font-bold">{state.error}</span>
            <button
              onClick={() => dispatch({ type: 'SET_GOAL', goal: state.goal })}
              className="ml-auto text-[9px] underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Main content area */}
        <div className="flex-1 flex min-h-0">
          {/* Canvas */}
          <div className="flex-1 overflow-auto p-3 relative" style={{ background: WIN95.windowContentBg || WIN95.inputBg }} ref={canvasRef}>
            {state.mode === 'idle' && state.tasks.length === 0 && (
              /* Empty state */
              <div className="h-full flex items-center justify-center">
                <div className="text-center max-w-md p-6" style={{ ...PANEL.base }}>
                  <ListTree size={48} className="mx-auto mb-3" style={{ color: WIN95.textDisabled }} />
                  <p className="text-[12px] font-bold mb-2" style={{ color: WIN95.text }}>
                    Workflow Builder
                  </p>
                  <p className="text-[10px] mb-4" style={{ color: WIN95.textDisabled }}>
                    Describe a creative goal and let AI break it into executable tasks.
                    Each task uses one of the available AI tools (image gen, video gen, music, voice, etc.)
                    and outputs flow automatically between steps.
                  </p>
                  <div className="space-y-2">
                    <p className="text-[9px] font-bold" style={{ color: WIN95.text }}>Try something like:</p>
                    {[
                      'Create a talking AI avatar from a portrait photo',
                      'Generate a music video with matching visuals',
                      'Create a character and generate 3 pose variations',
                      'Generate a promotional video with voiceover',
                    ].map((example, i) => (
                      <button
                        key={i}
                        onClick={() => { dispatch({ type: 'SET_GOAL', goal: example }); }}
                        className="block w-full text-left px-2 py-1 text-[10px] hover:bg-blue-900 hover:text-white"
                        style={{ color: '#000080', ...PANEL.sunken }}
                      >
                        &quot;{example}&quot;
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {state.mode === 'planning' && (
              /* Planning spinner */
              <div className="h-full flex items-center justify-center">
                <div className="text-center p-6" style={PANEL.base}>
                  <Loader2 size={32} className="mx-auto mb-3 animate-spin" style={{ color: '#000080' }} />
                  <p className="text-[11px] font-bold" style={{ color: WIN95.text }}>Planning workflow...</p>
                  <p className="text-[9px] mt-1" style={{ color: WIN95.textDisabled }}>
                    AI is analyzing your goal and selecting the right tools
                  </p>
                </div>
              </div>
            )}

            {/* DAG Task Canvas */}
            {state.tasks.length > 0 && (
              <div className="relative" style={{ minHeight: 200 }}>
                {/* Connection lines */}
                <ConnectionLines tasks={state.tasks} containerRef={canvasRef} />

                {/* Task cards in columns */}
                <div className="flex gap-8 items-start" style={{ minWidth: (maxColumn + 1) * 232 }}>
                  {Array.from({ length: maxColumn + 1 }, (_, colIdx) => {
                    const columnTasks = state.tasks.filter(t => t.column === colIdx);
                    if (columnTasks.length === 0) return null;

                    return (
                      <div key={colIdx} className="flex flex-col gap-4 items-center">
                        {/* Column header */}
                        <div
                          className="text-[8px] font-bold uppercase px-2 py-0.5 w-full text-center"
                          style={{ color: WIN95.textDisabled }}
                        >
                          {colIdx === 0 ? 'Start' : colIdx === maxColumn ? 'Final' : `Stage ${colIdx + 1}`}
                        </div>

                        {columnTasks.map(task => (
                          <div key={task.stepId} data-step-id={task.stepId}>
                            <TaskCard
                              task={task}
                              isSelected={state.selectedTaskId === task.stepId}
                              onClick={() => dispatch({ type: 'SELECT_TASK', taskId: task.stepId === state.selectedTaskId ? null : task.stepId })}
                              onRemove={() => dispatch({ type: 'REMOVE_TASK', taskId: task.stepId })}
                              canRemove={state.mode === 'editing'}
                            />
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>

                {/* Execution summary */}
                {(state.mode === 'completed' || state.mode === 'failed') && (
                  <div
                    className="mt-6 p-3 flex items-center justify-between"
                    style={{
                      ...PANEL.base,
                      borderTop: `2px solid ${state.mode === 'completed' ? '#008000' : '#800000'}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      {state.mode === 'completed' ? (
                        <Check size={16} style={{ color: '#008000' }} />
                      ) : (
                        <AlertCircle size={16} style={{ color: '#800000' }} />
                      )}
                      <span className="text-[11px] font-bold" style={{ color: WIN95.text }}>
                        {state.mode === 'completed' ? 'Workflow completed successfully!' : 'Workflow completed with errors'}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px]" style={{ color: WIN95.textDisabled }}>
                      <span>{state.tasks.filter(t => t.status === 'completed').length}/{state.tasks.length} tasks completed</span>
                      <span>{state.totalCreditsUsed} credits used</span>
                      <span>{formatDuration(state.totalDurationMs)}</span>
                    </div>
                  </div>
                )}

                {/* Executing indicator */}
                {state.mode === 'executing' && (
                  <div className="mt-6 p-3 flex items-center gap-3" style={PANEL.base}>
                    <Loader2 size={16} className="animate-spin" style={{ color: '#000080' }} />
                    <span className="text-[11px] font-bold" style={{ color: WIN95.text }}>
                      Executing workflow...
                    </span>
                    <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                      Tasks are running. This may take a few minutes for video/music generation.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail Panel */}
          {selectedTask && (
            <TaskDetailPanel
              task={selectedTask}
              toolDetail={selectedToolDetail}
              onUpdateInput={(key, value) =>
                dispatch({ type: 'UPDATE_TASK_INPUT', taskId: selectedTask.stepId, key, value })
              }
              onClose={() => dispatch({ type: 'SELECT_TASK', taskId: null })}
            />
          )}
        </div>

        {/* Status bar */}
        <div
          className="flex items-center justify-between px-2 py-0.5 text-[9px]"
          style={{
            background: WIN95.bg,
            borderTop: `1px solid ${WIN95.border.dark}`,
            color: WIN95.textDisabled,
          }}
        >
          <span>
            {state.tasks.length > 0
              ? `${state.tasks.length} tasks | ${state.availableTools.length} tools available`
              : `${state.availableTools.length} tools available`}
          </span>
          <span>
            {isConnected ? `${credits ?? '?'} credits available` : 'Connect wallet to execute'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TaskBuilder;
