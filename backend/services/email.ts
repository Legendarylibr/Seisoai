/**
 * Email Service
 * Handles sending transactional emails (password reset, etc.)
 * 
 * Supports multiple providers:
 * - Resend (recommended)
 * - SMTP (fallback)
 * - Console logging (development)
 */
import crypto from 'crypto';
import logger from '../utils/logger.js';
import config from '../config/env.js';

// Types
interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Email provider configuration
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || 'SeisoAI <noreply@seisoai.com>';
// FRONTEND_URL already has production fallback in config/env.ts
const FRONTEND_URL = config.FRONTEND_URL!;

/**
 * Send email via Resend API
 */
async function sendViaResend(options: EmailOptions): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'Resend API key not configured' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logger.error('Resend API error', { status: response.status, error });
      return { success: false, error: `Email send failed: ${response.status}` };
    }

    const data = await response.json() as { id: string };
    logger.info('Email sent via Resend', { to: options.to, messageId: data.id });
    return { success: true, messageId: data.id };
  } catch (error) {
    const err = error as Error;
    logger.error('Resend send error', { error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Log email to console (development mode)
 */
function sendViaConsole(options: EmailOptions): EmailResult {
  logger.info('=== EMAIL (Development Mode) ===');
  logger.info(`To: ${options.to}`);
  logger.info(`Subject: ${options.subject}`);
  logger.info(`Body: ${options.text || options.html.substring(0, 500)}...`);
  logger.info('================================');
  return { success: true, messageId: `dev-${Date.now()}` };
}

/**
 * Send email using configured provider
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  // Development mode - just log
  if (config.isDevelopment && !RESEND_API_KEY) {
    return sendViaConsole(options);
  }

  // Production - use Resend
  if (RESEND_API_KEY) {
    return sendViaResend(options);
  }

  // No provider configured
  logger.warn('No email provider configured - email not sent', { to: options.to });
  return { success: false, error: 'No email provider configured' };
}

/**
 * Generate secure password reset token
 * Returns: { token: plainToken, hash: hashedToken }
 * Store the hash in DB, send the plain token to user
 */
export function generateResetToken(): { token: string; hash: string } {
  // Generate 32-byte random token
  const token = crypto.randomBytes(32).toString('hex');
  // Hash it for storage (so DB breach doesn't expose tokens)
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
}

/**
 * Hash a reset token for comparison
 */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  email: string,
  resetToken: string,
  userName?: string
): Promise<EmailResult> {
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${resetToken}`;
  const expiryMinutes = 30;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Password Reset</h1>
  </div>
  
  <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hi${userName ? ` ${userName}` : ''},</p>
    
    <p>We received a request to reset your password for your SeisoAI account. Click the button below to create a new password:</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
        Reset Password
      </a>
    </div>
    
    <p style="color: #6b7280; font-size: 14px;">This link will expire in <strong>${expiryMinutes} minutes</strong>.</p>
    
    <p style="color: #6b7280; font-size: 14px;">If you didn't request this password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
    
    <p style="color: #9ca3af; font-size: 12px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${resetUrl}" style="color: #667eea; word-break: break-all;">${resetUrl}</a>
    </p>
  </div>
  
  <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 20px;">
    © ${new Date().getFullYear()} SeisoAI. All rights reserved.
  </p>
</body>
</html>
`;

  const text = `
Password Reset Request

Hi${userName ? ` ${userName}` : ''},

We received a request to reset your password for your SeisoAI account.

Click this link to reset your password:
${resetUrl}

This link will expire in ${expiryMinutes} minutes.

If you didn't request this password reset, you can safely ignore this email.

© ${new Date().getFullYear()} SeisoAI
`;

  return sendEmail({
    to: email,
    subject: '🔐 Reset Your SeisoAI Password',
    html,
    text
  });
}

export default {
  sendEmail,
  generateResetToken,
  hashResetToken,
  sendPasswordResetEmail
};
