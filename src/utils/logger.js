// Frontend logging utility
class Logger {
  constructor() {
    this.isDevelopment = import.meta.env.DEV;
    this.logLevel = import.meta.env.VITE_LOG_LEVEL || 'info';
    
    // Define log levels
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      return `${prefix} ${message} ${JSON.stringify(data)}`;
    }
    return `${prefix} ${message}`;
  }

  error(message, data = null) {
    if (!this.shouldLog('error')) return;
    
    if (this.isDevelopment) {
      console.error(this.formatMessage('error', message, data));
    } else {
      // In production, send to logging service
      this.sendToLoggingService('error', message, data);
    }
  }

  warn(message, data = null) {
    if (!this.shouldLog('warn')) return;
    
    if (this.isDevelopment) {
      console.warn(this.formatMessage('warn', message, data));
    } else {
      this.sendToLoggingService('warn', message, data);
    }
  }

  info(message, data = null) {
    if (!this.shouldLog('info')) return;
    
    if (this.isDevelopment) {
      console.info(this.formatMessage('info', message, data));
    } else {
      this.sendToLoggingService('info', message, data);
    }
  }

  debug(message, data = null) {
    if (!this.shouldLog('debug')) return;
    
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, data));
    } else {
      this.sendToLoggingService('debug', message, data);
    }
  }

  // Send logs to backend logging endpoint in production
  async sendToLoggingService(level, message, data) {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      await fetch(`${API_URL}/api/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level,
          message,
          data,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href
        })
      });
    } catch (error) {
      // Fallback to console if logging service fails
      console.error('Failed to send log to service:', error);
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;