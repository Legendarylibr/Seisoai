/**
 * Job Queue Service
 * Background job processing with BullMQ
 */
import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// Types
interface JobData {
  [key: string]: unknown;
}

interface JobResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

type JobProcessor = (job: Job<JobData>) => Promise<JobResult>;

// Queue instances
const queues: Map<string, Queue> = new Map();
const workers: Map<string, Worker> = new Map();
const queueEvents: Map<string, QueueEvents> = new Map();

// Redis connection options
const getConnection = () => {
  if (!config.REDIS_URL) {
    return null;
  }
  
  // Parse Redis URL
  const url = new URL(config.REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
  };
};

/**
 * Create a new job queue
 */
export function createQueue(name: string): Queue | null {
  const connection = getConnection();
  if (!connection) {
    logger.warn(`Cannot create queue [${name}] - Redis not configured`);
    return null;
  }

  if (queues.has(name)) {
    return queues.get(name)!;
  }

  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      // Memory optimization: Reduced job retention to save Redis memory
      removeOnComplete: {
        age: 1800,  // Keep completed jobs for 30 min (reduced from 1 hour)
        count: 100, // Keep last 100 completed jobs (reduced from 1000)
      },
      removeOnFail: {
        age: 43200, // Keep failed jobs for 12 hours (reduced from 24)
        count: 500, // Limit failed job count
      },
    },
  });

  queues.set(name, queue);
  logger.info(`Queue [${name}] created`);
  return queue;
}

/**
 * Create a worker for a queue
 */
export function createWorker(
  queueName: string,
  processor: JobProcessor,
  concurrency: number = 5
): Worker | null {
  const connection = getConnection();
  if (!connection) {
    logger.warn(`Cannot create worker for [${queueName}] - Redis not configured`);
    return null;
  }

  if (workers.has(queueName)) {
    return workers.get(queueName)!;
  }

  const worker = new Worker(
    queueName,
    async (job) => {
      logger.info(`Processing job [${queueName}:${job.id}]`, { data: job.data });
      
      try {
        const result = await processor(job);
        logger.info(`Job [${queueName}:${job.id}] completed`, { result });
        return result;
      } catch (error) {
        const err = error as Error;
        logger.error(`Job [${queueName}:${job.id}] failed`, { error: err.message });
        throw error;
      }
    },
    {
      connection,
      concurrency,
    }
  );

  // Event handlers
  worker.on('completed', (job) => {
    logger.debug(`Job [${queueName}:${job.id}] completed`);
  });

  worker.on('failed', (job, err) => {
    logger.error(`Job [${queueName}:${job?.id}] failed`, { error: err.message });
  });

  worker.on('error', (err) => {
    logger.error(`Worker [${queueName}] error`, { error: err.message });
  });

  workers.set(queueName, worker);
  logger.info(`Worker for [${queueName}] started with concurrency ${concurrency}`);
  return worker;
}

/**
 * Add a job to a queue
 */
export async function addJob(
  queueName: string,
  data: JobData,
  options: {
    priority?: number;
    delay?: number;
    jobId?: string;
  } = {}
): Promise<Job | null> {
  const queue = queues.get(queueName) || createQueue(queueName);
  if (!queue) {
    logger.warn(`Cannot add job - queue [${queueName}] not available`);
    return null;
  }

  try {
    const job = await queue.add(queueName, data, {
      priority: options.priority,
      delay: options.delay,
      jobId: options.jobId,
    });

    logger.info(`Job [${queueName}:${job.id}] added to queue`);
    return job;
  } catch (error) {
    const err = error as Error;
    logger.error(`Failed to add job to [${queueName}]`, { error: err.message });
    return null;
  }
}

/**
 * Get job by ID
 */
export async function getJob(queueName: string, jobId: string): Promise<Job | null> {
  const queue = queues.get(queueName);
  if (!queue) return null;

  try {
    return await queue.getJob(jobId) ?? null;
  } catch {
    return null;
  }
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
} | null> {
  const queue = queues.get(queueName);
  if (!queue) return null;

  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  } catch (error) {
    return null;
  }
}

/**
 * Close all queues and workers
 */
export async function closeAll(): Promise<void> {
  logger.info('Closing all queues and workers...');

  // Close workers first
  for (const [name, worker] of workers) {
    await worker.close();
    logger.debug(`Worker [${name}] closed`);
  }
  workers.clear();

  // Close queue events
  for (const [name, events] of queueEvents) {
    await events.close();
    logger.debug(`QueueEvents [${name}] closed`);
  }
  queueEvents.clear();

  // Close queues
  for (const [name, queue] of queues) {
    await queue.close();
    logger.debug(`Queue [${name}] closed`);
  }
  queues.clear();

  logger.info('All queues and workers closed');
}

// ============================================================================
// Pre-defined Job Queues
// ============================================================================

// Queue names
export const QUEUES = {
  IMAGE_GENERATION: 'image-generation',
  VIDEO_GENERATION: 'video-generation',
  MUSIC_GENERATION: 'music-generation',
  PAYMENT_VERIFICATION: 'payment-verification',
  EMAIL_NOTIFICATION: 'email-notification',
  WEBHOOK_DELIVERY: 'webhook-delivery',
  CLEANUP: 'cleanup',
} as const;

// ============================================================================
// Worker Processors
// ============================================================================

/** Webhook delivery worker — POST JSON to a URL with retries */
const webhookProcessor: JobProcessor = async (job) => {
  const { url, payload, secret } = job.data as {
    url: string;
    payload: Record<string, unknown>;
    secret?: string;
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (secret) {
    // HMAC signature for webhook verification
    const crypto = await import('crypto');
    const body = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    headers['X-Webhook-Signature'] = sig;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
  }

  return { success: true, data: { status: response.status } };
};

/** Payment verification worker — verify on-chain payments */
const paymentVerificationProcessor: JobProcessor = async (job) => {
  const { txHash, network, expectedAmount } = job.data as {
    txHash: string;
    network: string;
    expectedAmount?: number;
  };
  logger.info('Payment verification job', { txHash, network, expectedAmount });
  // Placeholder: actual verification would check on-chain
  return { success: true, data: { txHash, verified: true } };
};

/** Cleanup worker — remove expired data */
const cleanupProcessor: JobProcessor = async (job) => {
  const { type } = job.data as { type: string };
  logger.info('Cleanup job', { type });

  if (type === 'expired-generations') {
    // In a real implementation, delete old generation records from MongoDB
    const mongoose = await import('mongoose');
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
    try {
      const Generation = mongoose.default.model('Generation');
      const result = await Generation.deleteMany({ createdAt: { $lt: cutoff }, status: 'completed' });
      return { success: true, data: { deletedCount: (result as { deletedCount?: number }).deletedCount || 0 } };
    } catch {
      return { success: true, data: { deletedCount: 0, note: 'Model not found or empty' } };
    }
  }

  return { success: true, data: { type, note: 'no-op' } };
};

/**
 * Initialize standard queues and start workers
 */
export function initializeQueues(): void {
  const connection = getConnection();
  if (!connection) {
    logger.info('Job queues disabled - Redis not configured');
    return;
  }

  // Create standard queues
  Object.values(QUEUES).forEach(queueName => {
    createQueue(queueName);
  });

  // Start workers
  createWorker(QUEUES.WEBHOOK_DELIVERY, webhookProcessor, 3);
  createWorker(QUEUES.PAYMENT_VERIFICATION, paymentVerificationProcessor, 2);
  createWorker(QUEUES.CLEANUP, cleanupProcessor, 1);

  logger.info('Job queues and workers initialized');
}

/**
 * Schedule a webhook delivery
 */
export async function scheduleWebhook(
  url: string,
  payload: Record<string, unknown>,
  secret?: string,
  delay?: number,
): Promise<Job | null> {
  return addJob(QUEUES.WEBHOOK_DELIVERY, { url, payload, secret }, { delay });
}

/**
 * Schedule a cleanup job
 */
export async function scheduleCleanup(type: string, delay = 0): Promise<Job | null> {
  return addJob(QUEUES.CLEANUP, { type }, { delay, jobId: `cleanup-${type}-${Date.now()}` });
}

export default {
  createQueue,
  createWorker,
  addJob,
  getJob,
  getQueueStats,
  closeAll,
  initializeQueues,
  scheduleWebhook,
  scheduleCleanup,
  QUEUES,
};

