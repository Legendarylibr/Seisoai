/**
 * IP Allowlist Middleware
 * Enterprise-grade IP-based access control for sensitive routes
 * 
 * Features:
 * - CIDR notation support
 * - IPv4 and IPv6 support
 * - Environment-based configuration
 * - Audit logging of blocked attempts
 */
import type { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger.js';
import { logAuditEvent, AuditEventType, AuditSeverity } from '../services/auditLog.js';

// IP allowlist from environment
const ADMIN_IP_ALLOWLIST = process.env.ADMIN_IP_ALLOWLIST?.split(',').map(ip => ip.trim()) || [];
const ENABLE_IP_ALLOWLIST = process.env.ENABLE_ADMIN_IP_ALLOWLIST === 'true';

/**
 * Parse CIDR notation to IP range
 */
function parseCIDR(cidr: string): { start: bigint; end: bigint } | null {
  const [ip, prefixStr] = cidr.split('/');
  if (!ip) return null;
  
  const prefix = prefixStr ? parseInt(prefixStr, 10) : (ip.includes(':') ? 128 : 32);
  const isIPv6 = ip.includes(':');
  
  try {
    const ipBigInt = ipToBigInt(ip, isIPv6);
    const maxBits = isIPv6 ? 128n : 32n;
    const hostBits = maxBits - BigInt(prefix);
    const mask = (1n << hostBits) - 1n;
    
    return {
      start: ipBigInt & ~mask,
      end: ipBigInt | mask,
    };
  } catch {
    return null;
  }
}

/**
 * Convert IP address to BigInt for comparison
 */
function ipToBigInt(ip: string, isIPv6: boolean): bigint {
  if (isIPv6) {
    // Expand IPv6 address
    const parts = ip.split(':');
    const fullParts: string[] = [];
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === '') {
        // Handle :: compression
        const missing = 8 - parts.filter(p => p !== '').length;
        for (let j = 0; j < missing + 1; j++) {
          fullParts.push('0000');
        }
      } else {
        fullParts.push(parts[i].padStart(4, '0'));
      }
    }
    
    const hex = fullParts.slice(0, 8).join('');
    return BigInt('0x' + hex);
  } else {
    // IPv4
    const parts = ip.split('.').map(p => parseInt(p, 10));
    return BigInt(
      (parts[0] << 24) +
      (parts[1] << 16) +
      (parts[2] << 8) +
      parts[3]
    );
  }
}

/**
 * Check if IP is in allowlist
 */
function isIPAllowed(clientIP: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  
  // Handle IPv4-mapped IPv6 addresses
  let normalizedIP = clientIP;
  if (clientIP.startsWith('::ffff:')) {
    normalizedIP = clientIP.substring(7);
  }
  
  const isIPv6 = normalizedIP.includes(':');
  
  for (const entry of allowlist) {
    // Exact match
    if (entry === normalizedIP || entry === clientIP) {
      return true;
    }
    
    // CIDR match
    if (entry.includes('/')) {
      const range = parseCIDR(entry);
      if (range) {
        try {
          const ipBigInt = ipToBigInt(normalizedIP, isIPv6);
          if (ipBigInt >= range.start && ipBigInt <= range.end) {
            return true;
          }
        } catch {
          // Invalid IP, continue checking
        }
      }
    }
  }
  
  return false;
}

/**
 * Get client IP from request
 * Handles proxied requests (X-Forwarded-For, X-Real-IP)
 */
function getClientIP(req: Request): string {
  // Trust proxy headers in production
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) 
      ? forwardedFor[0] 
      : forwardedFor.split(',')[0];
    return ips.trim();
  }
  
  const realIP = req.headers['x-real-ip'];
  if (realIP && typeof realIP === 'string') {
    return realIP.trim();
  }
  
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * IP Allowlist Middleware for Admin Routes
 * Blocks requests from non-allowlisted IPs
 */
export function adminIPAllowlist(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if IP allowlisting is disabled
  if (!ENABLE_IP_ALLOWLIST) {
    return next();
  }
  
  const clientIP = getClientIP(req);
  
  if (isIPAllowed(clientIP, ADMIN_IP_ALLOWLIST)) {
    return next();
  }
  
  // Log blocked attempt
  logger.warn('Admin access blocked - IP not in allowlist', {
    ip: clientIP,
    path: req.path,
    method: req.method,
    userAgent: req.headers['user-agent'],
  });
  
  // Audit log the blocked attempt
  logAuditEvent({
    eventType: AuditEventType.AUTHZ_ACCESS_DENIED,
    severity: AuditSeverity.WARNING,
    actor: {
      ipAddress: clientIP,
      userAgent: req.headers['user-agent'],
    },
    action: 'Admin access denied - IP not allowlisted',
    outcome: 'failure',
    reason: `IP ${clientIP} not in admin allowlist`,
    request: {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      correlationId: req.correlationId,
    },
  }).catch(() => {});
  
  // Return 403 with minimal information
  res.status(403).json({
    success: false,
    error: 'Access denied',
  });
}

/**
 * Create custom IP allowlist middleware
 * For routes that need specific IP restrictions
 */
export function createIPAllowlist(
  allowlist: string[],
  options: {
    errorMessage?: string;
    logAttempts?: boolean;
  } = {}
) {
  const { errorMessage = 'Access denied', logAttempts = true } = options;
  
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);
    
    if (isIPAllowed(clientIP, allowlist)) {
      return next();
    }
    
    if (logAttempts) {
      logger.warn('IP allowlist blocked request', {
        ip: clientIP,
        path: req.path,
      });
    }
    
    res.status(403).json({
      success: false,
      error: errorMessage,
    });
  };
}

/**
 * Get current IP allowlist configuration
 * For debugging/monitoring
 */
export function getIPAllowlistConfig(): {
  enabled: boolean;
  allowlist: string[];
} {
  return {
    enabled: ENABLE_IP_ALLOWLIST,
    allowlist: ADMIN_IP_ALLOWLIST,
  };
}

export default adminIPAllowlist;
