/**
 * Security Alerts Service
 * Sends real-time notifications for security events via Discord webhook
 * 
 * Events monitored:
 * - Failed login attempts (threshold exceeded)
 * - Account lockouts
 * - Password reset requests
 * - Suspicious payment activity
 * - Admin actions
 * - Rate limit violations
 */
import logger from '../utils/logger.js';
import config, { PRODUCTION_URL } from '../config/env.js';

// Discord webhook URL for security alerts
const SECURITY_WEBHOOK_URL = process.env.SECURITY_DISCORD_WEBHOOK;

// Alert severity levels
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Alert types
export enum AlertType {
  FAILED_LOGIN = 'failed_login',
  ACCOUNT_LOCKOUT = 'account_lockout',
  PASSWORD_RESET = 'password_reset',
  SUSPICIOUS_PAYMENT = 'suspicious_payment',
  ADMIN_ACTION = 'admin_action',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  BRUTE_FORCE_ATTEMPT = 'brute_force_attempt',
  INVALID_TOKEN = 'invalid_token',
  UNAUTHORIZED_ACCESS = 'unauthorized_access'
}

interface AlertData {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userId?: string;
  email?: string;
}

// Color codes for Discord embeds
const SEVERITY_COLORS: Record<AlertSeverity, number> = {
  [AlertSeverity.LOW]: 0x3498db,      // Blue
  [AlertSeverity.MEDIUM]: 0xf39c12,   // Yellow/Orange
  [AlertSeverity.HIGH]: 0xe74c3c,     // Red
  [AlertSeverity.CRITICAL]: 0x8e44ad  // Purple
};

// Emoji for severity
const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  [AlertSeverity.LOW]: 'ℹ️',
  [AlertSeverity.MEDIUM]: '⚠️',
  [AlertSeverity.HIGH]: '🚨',
  [AlertSeverity.CRITICAL]: '🔴'
};

// Rate limiting for alerts to prevent spam
const alertRateLimit = new Map<string, number>();
const ALERT_COOLDOWN_MS = 60000; // 1 minute cooldown per unique alert key

/**
 * Check if alert should be rate limited
 */
function shouldRateLimit(alertKey: string): boolean {
  const now = Date.now();
  const lastSent = alertRateLimit.get(alertKey);
  
  if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) {
    return true;
  }
  
  alertRateLimit.set(alertKey, now);
  return false;
}

/**
 * Clean up old rate limit entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of alertRateLimit.entries()) {
    if (now - timestamp > ALERT_COOLDOWN_MS * 5) {
      alertRateLimit.delete(key);
    }
  }
}, 300000); // Clean every 5 minutes

/**
 * Send security alert to Discord webhook
 */
export async function sendSecurityAlert(data: AlertData): Promise<boolean> {
  // Skip if webhook not configured
  if (!SECURITY_WEBHOOK_URL) {
    // Log locally instead
    logger.warn('Security alert (webhook not configured)', {
      type: data.type,
      severity: data.severity,
      title: data.title,
      ...data.metadata
    });
    return false;
  }

  // Rate limit check
  const alertKey = `${data.type}:${data.ip || 'unknown'}:${data.userId || 'unknown'}`;
  if (shouldRateLimit(alertKey)) {
    logger.debug('Security alert rate limited', { alertKey });
    return false;
  }

  try {
    const embed = {
      title: `${SEVERITY_EMOJI[data.severity]} ${data.title}`,
      description: data.description,
      color: SEVERITY_COLORS[data.severity],
      fields: [
        {
          name: 'Type',
          value: data.type.replace(/_/g, ' ').toUpperCase(),
          inline: true
        },
        {
          name: 'Severity',
          value: data.severity.toUpperCase(),
          inline: true
        },
        {
          name: 'Environment',
          value: config.isProduction ? '🔴 PRODUCTION' : '🟢 Development',
          inline: true
        }
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: 'SeisoAI Security Monitor'
      }
    };

    // Add optional fields
    if (data.ip) {
      embed.fields.push({ name: 'IP Address', value: `\`${data.ip}\``, inline: true });
    }
    if (data.userId) {
      embed.fields.push({ name: 'User ID', value: `\`${data.userId.substring(0, 20)}...\``, inline: true });
    }
    if (data.email) {
      // Mask email for privacy
      const masked = data.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
      embed.fields.push({ name: 'Email', value: masked, inline: true });
    }

    // Add metadata fields
    if (data.metadata) {
      for (const [key, value] of Object.entries(data.metadata)) {
        if (embed.fields.length < 25) { // Discord limit
          embed.fields.push({
            name: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '),
            value: String(value).substring(0, 1024),
            inline: true
          });
        }
      }
    }

    const response = await fetch(SECURITY_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'SeisoAI Security',
        avatar_url: `${PRODUCTION_URL}/logo.png`,
        embeds: [embed]
      })
    });

    if (!response.ok) {
      logger.error('Failed to send security alert to Discord', { status: response.status });
      return false;
    }

    logger.info('Security alert sent to Discord', { type: data.type, severity: data.severity });
    return true;
  } catch (error) {
    const err = error as Error;
    logger.error('Error sending security alert', { error: err.message });
    return false;
  }
}

// ============================================================================
// Convenience Functions for Common Alerts
// ============================================================================

/**
 * Alert: Account locked due to failed login attempts
 */
export async function alertAccountLockout(
  email: string,
  ip: string,
  failedAttempts: number
): Promise<void> {
  await sendSecurityAlert({
    type: AlertType.ACCOUNT_LOCKOUT,
    severity: AlertSeverity.HIGH,
    title: 'Account Locked',
    description: `Account locked after ${failedAttempts} failed login attempts.`,
    email,
    ip,
    metadata: {
      failed_attempts: failedAttempts,
      lockout_duration: '30 minutes'
    }
  });
}

/**
 * Alert: Password reset requested
 */
export async function alertPasswordReset(
  email: string,
  ip: string,
  userId?: string
): Promise<void> {
  await sendSecurityAlert({
    type: AlertType.PASSWORD_RESET,
    severity: AlertSeverity.MEDIUM,
    title: 'Password Reset Requested',
    description: 'A password reset was requested for this account.',
    email,
    ip,
    userId
  });
}

/**
 * Alert: Suspicious payment activity
 */
export async function alertSuspiciousPayment(
  userId: string,
  ip: string,
  reason: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await sendSecurityAlert({
    type: AlertType.SUSPICIOUS_PAYMENT,
    severity: AlertSeverity.HIGH,
    title: 'Suspicious Payment Activity',
    description: reason,
    userId,
    ip,
    metadata
  });
}

/**
 * Alert: Admin action performed
 */
export async function alertAdminAction(
  action: string,
  adminIp: string,
  targetUserId?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await sendSecurityAlert({
    type: AlertType.ADMIN_ACTION,
    severity: AlertSeverity.MEDIUM,
    title: 'Admin Action',
    description: action,
    ip: adminIp,
    userId: targetUserId,
    metadata
  });
}

/**
 * Alert: Brute force attack detected
 */
export async function alertBruteForce(
  ip: string,
  endpoint: string,
  requestCount: number
): Promise<void> {
  await sendSecurityAlert({
    type: AlertType.BRUTE_FORCE_ATTEMPT,
    severity: AlertSeverity.CRITICAL,
    title: 'Brute Force Attack Detected',
    description: `Excessive requests detected from single IP.`,
    ip,
    metadata: {
      endpoint,
      request_count: requestCount,
      time_window: '15 minutes'
    }
  });
}

/**
 * Alert: Rate limit exceeded
 */
export async function alertRateLimitExceeded(
  ip: string,
  endpoint: string,
  userId?: string
): Promise<void> {
  await sendSecurityAlert({
    type: AlertType.RATE_LIMIT_EXCEEDED,
    severity: AlertSeverity.LOW,
    title: 'Rate Limit Exceeded',
    description: `Rate limit exceeded for endpoint.`,
    ip,
    userId,
    metadata: { endpoint }
  });
}

export default {
  sendSecurityAlert,
  alertAccountLockout,
  alertPasswordReset,
  alertSuspiciousPayment,
  alertAdminAction,
  alertBruteForce,
  alertRateLimitExceeded,
  AlertSeverity,
  AlertType
};
