/**
 * Log Sanitization Utility
 * Prevents sensitive data from being logged
 */

// Fields that should be redacted in logs
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'key',
  'authorization',
  'apiKey',
  'apikey',
  'api_key',
  'accessToken',
  'refreshToken',
  'jwt',
  'jwtSecret',
  'stripeSecret',
  'webhookSecret',
  'adminSecret',
  'admin_secret',
  'privateKey',
  'private_key',
  'creditCard',
  'credit_card',
  'cvv',
  'ssn',
  'socialSecurityNumber',
  // SECURITY: Additional sensitive fields
  'email',
  'userEmail',
  'user_email',
  'encryptionKey',
  'encryption_key',
  'cookie',
  'sessionId',
  'session_id',
  'discordLinkCode',
  'discordToken',
  'oauthToken',
  'oauth_token',
  'botApiKey',
  'bot_api_key'
];

// Patterns to detect and redact
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /token\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /secret\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /authorization\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  // SECURITY: Email address pattern - redact full emails
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  // SECURITY: Bearer tokens
  /Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi,
  // SECURITY: API keys (common patterns)
  /api[_-]?key\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /x-[a-z]+-api-key\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  // SECURITY: MongoDB connection strings
  /mongodb(\+srv)?:\/\/[^@]+@[^\s]+/gi,
  // SECURITY: Redis connection strings
  /redis:\/\/[^@]*@?[^\s]+/gi,
];

/**
 * Redact sensitive values in an object
 */
export function sanitizeLogObject(obj: unknown, depth: number = 0): unknown {
  if (depth > 10) return '[MAX_DEPTH]';
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    // Check if string contains sensitive patterns
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(obj)) {
        return '[REDACTED]';
      }
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeLogObject(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key indicates sensitive data
      const isSensitive = SENSITIVE_FIELDS.some(field => 
        lowerKey.includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > 100) {
        // Truncate long strings (might contain sensitive data)
        sanitized[key] = value.substring(0, 100) + '...';
      } else {
        sanitized[key] = sanitizeLogObject(value, depth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Mask an email address for logging (show first 2 chars + domain)
 * e.g., "user@example.com" -> "us***@example.com"
 */
function maskEmail(email: string): string {
  const atIndex = email.indexOf('@');
  if (atIndex <= 0) return '[REDACTED_EMAIL]';
  const localPart = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  if (localPart.length <= 2) return localPart + '***' + domain;
  return localPart.substring(0, 2) + '***' + domain;
}

/**
 * Sanitize a log message string
 */
export function sanitizeLogMessage(message: string): string {
  let sanitized = message;
  
  // First, mask emails (special handling to keep partial info for debugging)
  const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  sanitized = sanitized.replace(emailPattern, (match) => maskEmail(match));
  
  // Then handle other sensitive patterns
  const nonEmailPatterns = SENSITIVE_PATTERNS.filter(p => !p.source.includes('@'));
  for (const pattern of nonEmailPatterns) {
    sanitized = sanitized.replace(pattern, (match) => {
      const field = match.split(/[:=]/)[0]?.trim();
      return field ? `${field}=[REDACTED]` : '[REDACTED]';
    });
  }
  
  return sanitized;
}

/**
 * Create a safe logger wrapper that automatically sanitizes logs
 */
export function createSafeLogger(originalLogger: {
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
  debug: (message: string, meta?: unknown) => void;
}) {
  return {
    info: (message: string, meta?: unknown) => {
      const sanitizedMeta = meta ? sanitizeLogObject(meta) : undefined;
      const sanitizedMessage = sanitizeLogMessage(message);
      originalLogger.info(sanitizedMessage, sanitizedMeta);
    },
    warn: (message: string, meta?: unknown) => {
      const sanitizedMeta = meta ? sanitizeLogObject(meta) : undefined;
      const sanitizedMessage = sanitizeLogMessage(message);
      originalLogger.warn(sanitizedMessage, sanitizedMeta);
    },
    error: (message: string, meta?: unknown) => {
      const sanitizedMeta = meta ? sanitizeLogObject(meta) : undefined;
      const sanitizedMessage = sanitizeLogMessage(message);
      originalLogger.error(sanitizedMessage, sanitizedMeta);
    },
    debug: (message: string, meta?: unknown) => {
      const sanitizedMeta = meta ? sanitizeLogObject(meta) : undefined;
      const sanitizedMessage = sanitizeLogMessage(message);
      originalLogger.debug(sanitizedMessage, sanitizedMeta);
    },
  };
}

export default {
  sanitizeLogObject,
  sanitizeLogMessage,
  createSafeLogger
};

