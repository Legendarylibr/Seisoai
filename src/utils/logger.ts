import type { LogLevel } from '../types';

// Frontend logging utility
interface LogLevels {
  error: number;
  warn: number;
  info: number;
  debug: number;
}

interface LogData {
  [key: string]: unknown;
}

class Logger {
  private isDevelopment: boolean;
  private logLevel: LogLevel;
  private levels: LogLevels;

  constructor() {
    this.isDevelopment = import.meta.env.DEV;
    this.logLevel = (import.meta.env.VITE_LOG_LEVEL as LogLevel) || 'info';
    
    // Define log levels
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  // Sanitize sensitive data from logs
  private sanitizeData(data: unknown): unknown {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveKeys = [
      'address', 'walletAddress', 'wallet', 'userAddress', 'senderAddress',
      'apiKey', 'api_key', 'apikey', 'secret', 'token', 'password', 'privateKey',
      'txHash', 'transactionHash', 'signature', 'tx', 'transaction', 'txSignature',
      'email', 'emailAddress', 'userEmail',
      'rpcUrl', 'rpc_url', 'endpoint', 'url', 'rpc',
      'paymentAddress', 'paymentWallet', 'payment_address', 'solanaPaymentAddress',
      'linkedWalletAddress', 'addresses', 'publicKey', 'pubkey',
      'clientSecret', 'paymentIntentId', 'sessionId',
      'stack', 'stackTrace', 'trace'  // Prevent exposing internal file paths
    ];
    
    const sanitized: Record<string, unknown> = { ...(data as Record<string, unknown>) };
    
    for (const key in sanitized) {
      const lowerKey = key.toLowerCase();
      
      // Check if key contains sensitive information
      if (sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()))) {
        const value = sanitized[key];
        if (typeof value === 'string' && value.length > 0) {
          // Truncate addresses/hashes to first 6 and last 4 chars
          if (value.length > 10) {
            sanitized[key] = `${value.substring(0, 6)}...${value.substring(value.length - 4)}`;
          } else {
            sanitized[key] = '***';
          }
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = this.sanitizeData(value);
        } else {
          sanitized[key] = '***';
        }
      }
      
      // Recursively sanitize nested objects
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
        sanitized[key] = this.sanitizeData(sanitized[key]);
      }
    }
    
    return sanitized;
  }

  private formatMessage(level: LogLevel, message: string, data: LogData | null = null): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (data) {
      const sanitized = this.sanitizeData(data);
      return `${prefix} ${message} ${JSON.stringify(sanitized)}`;
    }
    return `${prefix} ${message}`;
  }

  error(message: string, data: LogData | null = null): void {
    if (!this.shouldLog('error')) return;
    
    if (this.isDevelopment) {
      console.error(this.formatMessage('error', message, data));
    } else {
      // In production, send to logging service
      this.sendToLoggingService('error', message, data);
    }
  }

  warn(message: string, data: LogData | null = null): void {
    if (!this.shouldLog('warn')) return;
    
    if (this.isDevelopment) {
      console.warn(this.formatMessage('warn', message, data));
    } else {
      this.sendToLoggingService('warn', message, data);
    }
  }

  info(message: string, data: LogData | null = null): void {
    if (!this.shouldLog('info')) return;
    
    if (this.isDevelopment) {
      console.info(this.formatMessage('info', message, data));
    } else {
      this.sendToLoggingService('info', message, data);
    }
  }

  debug(message: string, data: LogData | null = null): void {
    if (!this.shouldLog('debug')) return;
    
    if (this.isDevelopment) {
      console.debug(this.formatMessage('debug', message, data));
    } else {
      this.sendToLoggingService('debug', message, data);
    }
  }

  // Send logs to backend logging endpoint in production
  private async sendToLoggingService(level: LogLevel, message: string, data: LogData | null): Promise<void> {
    try {
      // Dynamically get API URL to avoid circular dependencies
      const { getApiUrl } = await import('./apiConfig');
      const apiUrl = getApiUrl();
      
      // SECURITY: Sanitize data before sending to backend to prevent info leaks
      const sanitizedData = this.sanitizeData(data);
      
      await fetch(`${apiUrl}/api/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          level,
          message,
          data: sanitizedData,
          timestamp: new Date().toISOString(),
          // Only send minimal browser info, not full userAgent which can fingerprint
          browser: navigator.userAgent.split(' ').pop() || 'unknown',
          // Only send path, not full URL which may contain sensitive query params
          path: window.location.pathname
        })
      });
    } catch {
      // Silently fail - don't log errors about logging to avoid recursion
      // and don't expose error details to console in production
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;





