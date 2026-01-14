/**
 * Security alerts service tests
 */
import { describe, it, expect } from '@jest/globals';
import { AlertSeverity, AlertType } from '../../services/securityAlerts.js';

describe('Security Alerts Service', () => {
  describe('AlertSeverity enum', () => {
    it('should have all expected severity levels', () => {
      expect(AlertSeverity.LOW).toBe('low');
      expect(AlertSeverity.MEDIUM).toBe('medium');
      expect(AlertSeverity.HIGH).toBe('high');
      expect(AlertSeverity.CRITICAL).toBe('critical');
    });
  });

  describe('AlertType enum', () => {
    it('should have all expected alert types', () => {
      expect(AlertType.FAILED_LOGIN).toBe('failed_login');
      expect(AlertType.ACCOUNT_LOCKOUT).toBe('account_lockout');
      expect(AlertType.PASSWORD_RESET).toBe('password_reset');
      expect(AlertType.SUSPICIOUS_PAYMENT).toBe('suspicious_payment');
      expect(AlertType.ADMIN_ACTION).toBe('admin_action');
      expect(AlertType.RATE_LIMIT_EXCEEDED).toBe('rate_limit_exceeded');
      expect(AlertType.BRUTE_FORCE_ATTEMPT).toBe('brute_force_attempt');
      expect(AlertType.INVALID_TOKEN).toBe('invalid_token');
      expect(AlertType.UNAUTHORIZED_ACCESS).toBe('unauthorized_access');
    });
  });

  describe('Alert severity ordering', () => {
    it('should have correct severity hierarchy', () => {
      const severities = [
        AlertSeverity.LOW,
        AlertSeverity.MEDIUM,
        AlertSeverity.HIGH,
        AlertSeverity.CRITICAL
      ];
      
      expect(severities.length).toBe(4);
      expect(severities[0]).toBe('low');
      expect(severities[3]).toBe('critical');
    });
  });
});
