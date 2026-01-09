/**
 * Log Sanitization Utility for Discord Bot
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
  'discordToken',
  'botToken'
];

// Patterns to detect and redact
const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /token\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /secret\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
  /authorization\s*[:=]\s*['"]?[^'",\s}]+['"]?/gi,
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
 * Sanitize a log message string
 */
export function sanitizeLogMessage(message: string): string {
  let sanitized = message;
  
  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      const field = match.split(/[:=]/)[0]?.trim();
      return `${field}=[REDACTED]`;
    });
  }
  
  return sanitized;
}

export default {
  sanitizeLogObject,
  sanitizeLogMessage
};

