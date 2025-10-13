// Centralized logging utility for the application
const isDevelopment = import.meta.env.MODE === 'development';
const isProduction = import.meta.env.MODE === 'production';

class Logger {
  constructor(module = 'APP') {
    this.module = module;
  }

  formatMessage(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const moduleTag = `[${this.module}]`;
    const levelTag = `[${level}]`;
    
    if (isDevelopment) {
      return `${timestamp} ${moduleTag} ${levelTag} ${message}`;
    }
    
    return JSON.stringify({
      timestamp,
      module: this.module,
      level,
      message,
      data: Object.keys(data).length > 0 ? data : undefined
    });
  }

  info(message, data = {}) {
    if (isDevelopment) {
      console.log(this.formatMessage('INFO', message, data));
    }
    // In production, you might want to send to a logging service
  }

  warn(message, data = {}) {
    if (isDevelopment) {
      console.warn(this.formatMessage('WARN', message, data));
    }
    // In production, you might want to send to a logging service
  }

  error(message, data = {}) {
    console.error(this.formatMessage('ERROR', message, data));
    // In production, you might want to send to a logging service
  }

  debug(message, data = {}) {
    if (isDevelopment) {
      console.debug(this.formatMessage('DEBUG', message, data));
    }
  }

  // Special method for sensitive data that should never be logged
  secure(message, data = {}) {
    if (isDevelopment) {
      console.log(this.formatMessage('SECURE', message, { ...data, sensitive: true }));
    }
  }
}

// Create logger instances for different modules
export const createLogger = (module) => new Logger(module);

// Default logger
export const logger = new Logger('APP');

// Module-specific loggers
export const walletLogger = new Logger('WALLET');
export const paymentLogger = new Logger('PAYMENT');
export const discountLogger = new Logger('DISCOUNT');
export const generationLogger = new Logger('GENERATION');
export const safetyLogger = new Logger('SAFETY');

export default logger;
