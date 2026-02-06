/**
 * Agent Execution Tracer
 * Lightweight tracing system for agent executions.
 *
 * Records each step of an agentic session or orchestration run:
 *   - LLM calls (model, tokens, latency)
 *   - Tool invocations (tool ID, input summary, result summary, latency)
 *   - Credit usage
 *
 * Traces are stored in MongoDB with a 7-day TTL for debugging.
 */
import mongoose, { type Document, type Model } from 'mongoose';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface TraceSpan {
  /** Span type */
  type: 'llm-call' | 'tool-call' | 'orchestration' | 'error';
  /** Label / description */
  label: string;
  /** Start timestamp */
  startedAt: Date;
  /** Duration in ms */
  durationMs: number;
  /** Metadata */
  meta?: Record<string, unknown>;
}

export interface IAgentTraceData {
  traceId: string;
  /** What triggered this trace */
  source: 'agentic-chat' | 'orchestration' | 'mcp' | 'gateway';
  /** User identifier */
  userId?: string;
  /** Agent ID (if agent-scoped) */
  agentId?: string;
  /** Top-level goal or message */
  goal: string;
  /** LLM model used */
  llmModel?: string;
  /** Individual spans */
  spans: TraceSpan[];
  /** Total credits consumed */
  totalCredits: number;
  /** Total duration */
  totalDurationMs: number;
  /** Whether the overall operation succeeded */
  success: boolean;
  /** Created date (auto-indexed for TTL) */
  createdAt: Date;
}

export type IAgentTrace = IAgentTraceData & Document;

// ============================================================================
// Schema
// ============================================================================

const traceSpanSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['llm-call', 'tool-call', 'orchestration', 'error'] },
  label: { type: String, required: true },
  startedAt: { type: Date, required: true },
  durationMs: { type: Number, required: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { _id: false });

const agentTraceSchema = new mongoose.Schema<IAgentTrace>({
  traceId: { type: String, required: true, unique: true, index: true },
  source: { type: String, required: true, enum: ['agentic-chat', 'orchestration', 'mcp', 'gateway'] },
  userId: { type: String, index: true },
  agentId: { type: String },
  goal: { type: String, required: true },
  llmModel: { type: String },
  spans: { type: [traceSpanSchema], default: [] },
  totalCredits: { type: Number, default: 0 },
  totalDurationMs: { type: Number, default: 0 },
  success: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 60 * 60 }, // 7-day TTL
});

const AgentTrace: Model<IAgentTrace> = mongoose.models.AgentTrace || mongoose.model<IAgentTrace>('AgentTrace', agentTraceSchema);

// ============================================================================
// Tracer API
// ============================================================================

function generateTraceId(): string {
  return `trace_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * In-memory trace builder — accumulates spans, then persists.
 */
export class Tracer {
  readonly traceId: string;
  private source: IAgentTraceData['source'];
  private goal: string;
  private userId?: string;
  private agentId?: string;
  private llmModel?: string;
  private spans: TraceSpan[] = [];
  private totalCredits = 0;
  private startedAt: number;

  constructor(opts: {
    source: IAgentTraceData['source'];
    goal: string;
    userId?: string;
    agentId?: string;
    llmModel?: string;
  }) {
    this.traceId = generateTraceId();
    this.source = opts.source;
    this.goal = opts.goal;
    this.userId = opts.userId;
    this.agentId = opts.agentId;
    this.llmModel = opts.llmModel;
    this.startedAt = Date.now();
  }

  /** Add a completed span */
  addSpan(span: TraceSpan): void {
    this.spans.push(span);
  }

  /** Start a span timer — returns a function to call when done */
  startSpan(type: TraceSpan['type'], label: string): (meta?: Record<string, unknown>) => void {
    const startedAt = new Date();
    const start = Date.now();
    return (meta?: Record<string, unknown>) => {
      this.spans.push({
        type,
        label,
        startedAt,
        durationMs: Date.now() - start,
        meta,
      });
    };
  }

  /** Add credits */
  addCredits(amount: number): void {
    this.totalCredits += amount;
  }

  /** Persist the trace to MongoDB */
  async finish(success: boolean): Promise<string> {
    const totalDurationMs = Date.now() - this.startedAt;
    try {
      await AgentTrace.create({
        traceId: this.traceId,
        source: this.source,
        userId: this.userId,
        agentId: this.agentId,
        goal: this.goal,
        llmModel: this.llmModel,
        spans: this.spans,
        totalCredits: this.totalCredits,
        totalDurationMs,
        success,
      });
      logger.debug('Agent trace saved', { traceId: this.traceId, spans: this.spans.length, totalDurationMs });
    } catch (error) {
      logger.error('Failed to save agent trace', { traceId: this.traceId, error: (error as Error).message });
    }
    return this.traceId;
  }
}

// ============================================================================
// Query API
// ============================================================================

/** Get a trace by ID */
export async function getTrace(traceId: string): Promise<IAgentTrace | null> {
  try {
    return await AgentTrace.findOne({ traceId }).lean<IAgentTrace>();
  } catch {
    return null;
  }
}

/** List recent traces for a user */
export async function getTracesForUser(userId: string, limit = 20): Promise<IAgentTrace[]> {
  try {
    return await AgentTrace.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<IAgentTrace[]>();
  } catch {
    return [];
  }
}

export default { Tracer, getTrace, getTracesForUser };
