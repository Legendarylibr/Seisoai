import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeLogObject, sanitizeLogMessage } from './logSanitizer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Tell winston that you want to link the colors
winston.addColors(colors);

// Custom format to sanitize sensitive data
const sanitizeFormat = winston.format((info) => {
  // Sanitize the message
  if (typeof info.message === 'string') {
    info.message = sanitizeLogMessage(info.message);
  }
  // Sanitize any additional metadata
  const sanitized = sanitizeLogObject(info) as Record<string, unknown>;
  return { ...info, ...sanitized };
});

// Production optimization: Reduce log verbosity and file I/O
const isProduction = process.env.NODE_ENV === 'production';

// Define which transports the logger must use
const transports: winston.transport[] = [
  // Console transport - optimized for production (JSON) vs development (colorized)
  new winston.transports.Console({
    format: isProduction
      ? winston.format.combine(
          sanitizeFormat(),
          winston.format.timestamp(),
          winston.format.json()  // Structured logs for log aggregators
        )
      : winston.format.combine(
          sanitizeFormat(),
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
          winston.format.colorize({ all: true }),
          winston.format.printf(
            (info) => `${info.timestamp} ${info.level}: ${info.message}`
          )
        ),
  }),
];

// File transports only in development or when explicitly enabled
// In production, rely on container log aggregation (reduces disk I/O)
if (!isProduction || process.env.ENABLE_FILE_LOGS === 'true') {
  transports.push(
    // File transport for errors
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '10m',     // Reduced from 20m
      maxFiles: '7d',     // Reduced from 14d - saves storage
      format: winston.format.combine(
        sanitizeFormat(),
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
    // File transport for all logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '10m',     // Reduced from 20m
      maxFiles: '7d',     // Reduced from 14d - saves storage
      format: winston.format.combine(
        sanitizeFormat(),
        winston.format.timestamp(),
        winston.format.json()
      ),
    })
  );
}

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,
  // Do not exit on handled exceptions
  exitOnError: false,
});

// Create a stream object with a 'write' function for Morgan HTTP logging
export const loggerStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};

/**
 * Create a logger instance with request context
 * Useful for adding request ID and other context to all logs in a request
 */
export function createContextLogger(context: Record<string, unknown>) {
  return {
    error: (message: string, meta?: Record<string, unknown>) => {
      logger.error(message, { ...context, ...meta });
    },
    warn: (message: string, meta?: Record<string, unknown>) => {
      logger.warn(message, { ...context, ...meta });
    },
    info: (message: string, meta?: Record<string, unknown>) => {
      logger.info(message, { ...context, ...meta });
    },
    http: (message: string, meta?: Record<string, unknown>) => {
      logger.http(message, { ...context, ...meta });
    },
    debug: (message: string, meta?: Record<string, unknown>) => {
      logger.debug(message, { ...context, ...meta });
    },
  };
}

export default logger;
