/**
 * Logger utility for Discord bot
 * Uses winston for structured logging with sanitization and daily rotation
 */
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeLogObject, sanitizeLogMessage } from './logSanitizer.js';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

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

// Define which transports the logger must use
const transports: winston.transport[] = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      sanitizeFormat(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
      winston.format.colorize({ all: true }),
      winston.format.printf(
        (info) => `[${info.timestamp}] [DISCORD-BOT] ${info.level}: ${info.message}`
      )
    ),
  }),
  // File transport for errors
  new DailyRotateFile({
    filename: path.join(logsDir, 'discord-error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    maxSize: '20m',
    maxFiles: '14d',
    format: winston.format.combine(
      sanitizeFormat(),
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
  // File transport for all logs
  new DailyRotateFile({
    filename: path.join(logsDir, 'discord-combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: winston.format.combine(
      sanitizeFormat(),
      winston.format.timestamp(),
      winston.format.json()
    ),
  }),
];

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  transports,
  // Do not exit on handled exceptions
  exitOnError: false,
});

export default logger;

