/**
 * /link command - Link Discord account to SeisoAI
 * 
 * SECURE LINKING FLOW:
 * 1. User logs into SeisoAI website and generates a 6-digit code
 * 2. User runs /link code:<6-digit-code> in Discord
 * 3. Bot verifies the code via backend API
 * 4. Accounts are securely linked
 * 
 * This ensures only the owner of a SeisoAI account can link it
 * to their Discord - codes expire in 5 minutes and are single-use.
 * 
 * SECURITY FEATURES:
 * - Rate limiting: 5 attempts per 5 minutes per user
 * - Exponential backoff on network failures
 * - Cooldown after failed attempts
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction
} from 'discord.js';
import DiscordUser from '../database/models/DiscordUser.js';
import { getUserModel, IUser } from '../database/models/User.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { ensureConnected } from '../database/index.js';

// ============================================================================
// Rate Limiting for Link Command
// ============================================================================

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blockedUntil?: number;
}

// Rate limit: 5 attempts per 5 minutes per user
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000; // 15 minute block after exceeding

// In-memory rate limit store (cleared on bot restart)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of rateLimitStore.entries()) {
    // Remove entries that are past the window and not blocked
    if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS && (!entry.blockedUntil || now > entry.blockedUntil)) {
      rateLimitStore.delete(userId);
    }
  }
}, 60 * 1000); // Clean every minute

/**
 * Check rate limit for a user
 * Returns { allowed: boolean, remainingAttempts: number, blockedUntil?: number }
 */
function checkRateLimit(userId: string): { allowed: boolean; remainingAttempts: number; blockedUntil?: number; retryAfterMs?: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry) {
    return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS };
  }

  // Check if user is blocked
  if (entry.blockedUntil && now < entry.blockedUntil) {
    return {
      allowed: false,
      remainingAttempts: 0,
      blockedUntil: entry.blockedUntil,
      retryAfterMs: entry.blockedUntil - now
    };
  }

  // Check if window has passed (reset)
  if (now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.delete(userId);
    return { allowed: true, remainingAttempts: RATE_LIMIT_MAX_ATTEMPTS };
  }

  // Check attempts within window
  const remaining = RATE_LIMIT_MAX_ATTEMPTS - entry.attempts;
  return {
    allowed: remaining > 0,
    remainingAttempts: Math.max(0, remaining),
    retryAfterMs: remaining <= 0 ? (entry.firstAttempt + RATE_LIMIT_WINDOW_MS) - now : undefined
  };
}

/**
 * Record an attempt for rate limiting
 */
function recordAttempt(userId: string, success: boolean): void {
  const now = Date.now();
  const entry = rateLimitStore.get(userId);

  if (!entry || now - entry.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitStore.set(userId, {
      attempts: 1,
      firstAttempt: now,
      lastAttempt: now
    });
    return;
  }

  // Update existing entry
  entry.attempts++;
  entry.lastAttempt = now;

  // Block user if they exceeded attempts and failed
  if (!success && entry.attempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    entry.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    logger.warn('User blocked from /link due to rate limit', {
      userId,
      attempts: entry.attempts,
      blockedUntil: new Date(entry.blockedUntil).toISOString()
    });
  }

  rateLimitStore.set(userId, entry);
}

// Interface for main User model (matches IUser from User model)
interface IMainUser {
  userId?: string;
  email?: string;
  walletAddress?: string;
  discordId?: string;
  discordUsername?: string;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
}

// Backend API response types
interface VerifyLinkResponse {
  success: boolean;
  error?: string;
  message?: string;
  user?: {
    userId: string;
    email?: string;
    credits: number;
    totalCreditsEarned: number;
    totalCreditsSpent: number;
    walletAddress?: string;
  };
}

// ============================================================================
// Retry with Exponential Backoff
// ============================================================================

interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with exponential backoff retry
 * Only retries on network errors, not on HTTP errors (4xx, 5xx)
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    initialDelayMs = 500,
    maxDelayMs = 5000,
    backoffMultiplier = 2
  } = retryOptions;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(10000) // 10 second timeout per request
      });
      return response;
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        break;
      }

      // Only retry on network errors (fetch failures), not HTTP errors
      const isNetworkError = lastError.name === 'TypeError' || 
                             lastError.name === 'AbortError' ||
                             lastError.message.includes('fetch');

      if (!isNetworkError) {
        throw lastError;
      }

      logger.warn('Fetch failed, retrying...', {
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: lastError.message
      });

      await sleep(delay);
      delay = Math.min(delay * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to SeisoAI')
  .addStringOption(option =>
    option
      .setName('code')
      .setDescription('8-character linking code from the SeisoAI website')
      .setRequired(false)
      .setMinLength(6)  // Support both legacy 6-digit and new 8-char codes
      .setMaxLength(8)
  );

/**
 * Call backend API to verify Discord link code
 * SECURITY: Uses API key authentication to prevent unauthorized access
 * RELIABILITY: Uses exponential backoff retry for network failures
 */
async function verifyLinkCode(
  code: string,
  discordId: string,
  discordUsername: string
): Promise<VerifyLinkResponse> {
  const apiUrl = process.env.API_URL || config.urls.website;
  const botApiKey = process.env.DISCORD_BOT_API_KEY;
  
  // SECURITY: Ensure API key is configured and meets minimum length
  if (!botApiKey || botApiKey.length < 32) {
    logger.error('DISCORD_BOT_API_KEY not configured or too short - cannot verify link codes');
    return {
      success: false,
      error: 'Bot configuration error. Please contact support.'
    };
  }
  
  try {
    const response = await fetchWithRetry(
      `${apiUrl}/api/auth/verify-discord-link`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bot-API-Key': botApiKey
        },
        body: JSON.stringify({
          code,
          discordId,
          discordUsername
        })
      },
      {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 3000
      }
    );

    const data = await response.json() as VerifyLinkResponse;
    return data;
  } catch (error) {
    const err = error as Error;
    logger.error('API call to verify-discord-link failed after retries', { 
      error: err.message,
      discordId 
    });
    return {
      success: false,
      error: 'Unable to connect to SeisoAI servers. Please try again in a moment.'
    };
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Try to connect to database, but don't fail if it's unavailable
    let dbAvailable = false;
    try {
      await ensureConnected();
      dbAvailable = true;
    } catch (dbError) {
      logger.warn('Database unavailable for link command, continuing with API-only mode', {
        error: (dbError as Error).message
      });
    }

    const discordId = interaction.user.id;
    const code = interaction.options.getString('code');

    // If a code was provided, verify it
    if (code) {
      // SECURITY: Check rate limit before processing code verification
      const rateLimit = checkRateLimit(discordId);
      if (!rateLimit.allowed) {
        const retryMinutes = Math.ceil((rateLimit.retryAfterMs || 0) / 60000);
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('⏳ Too Many Attempts')
          .setDescription('You\'ve made too many link attempts. Please wait before trying again.')
          .addFields({
            name: '⏰ Try again in',
            value: `${retryMinutes} minute${retryMinutes !== 1 ? 's' : ''}`
          })
          .setFooter({ text: 'This limit helps protect your account' });

        await interaction.editReply({ embeds: [embed] });
        
        logger.warn('Rate limited /link attempt', {
          discordId,
          remainingAttempts: rateLimit.remainingAttempts,
          blockedUntil: rateLimit.blockedUntil ? new Date(rateLimit.blockedUntil).toISOString() : null
        });
        return;
      }

      // SECURITY FIX: Validate code format (8 alphanumeric OR legacy 6 digits)
      const isValidCode = /^[A-Z2-9]{8}$/i.test(code) || /^\d{6}$/.test(code);
      if (!isValidCode) {
        // Record failed attempt (invalid format)
        recordAttempt(discordId, false);
        
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Invalid Code')
          .setDescription('Please enter a valid 8-character code from the SeisoAI website.')
          .addFields({
            name: '💡 How to get a code',
            value: `1. Go to [SeisoAI Settings](${config.urls.website}/settings)\n2. Click "Link Discord"\n3. Copy the 8-character code\n4. Run \`/link code:XXXXXXXX\``
          });

        await interaction.editReply({ embeds: [embed] });
        return;
      }
      
      // Normalize code to uppercase for consistent matching
      const normalizedCode = code.toUpperCase();

      // Call backend API to verify the code (use normalized code)
      const result = await verifyLinkCode(
        normalizedCode,
        discordId,
        interaction.user.username
      );

      if (result.success && result.user) {
        // Record successful attempt (clears rate limit)
        recordAttempt(discordId, true);
        
        // Sync to local DiscordUser for quick access (if DB available)
        if (dbAvailable) {
          try {
            const discordUser = await DiscordUser.findOrCreate({
              id: interaction.user.id,
              username: interaction.user.username,
              discriminator: interaction.user.discriminator,
              avatar: interaction.user.avatar || undefined
            });

            discordUser.seisoUserId = result.user.userId;
            if (result.user.email) discordUser.email = result.user.email;
            if (result.user.walletAddress) discordUser.walletAddress = result.user.walletAddress;
            discordUser.credits = result.user.credits;
            discordUser.totalCreditsEarned = result.user.totalCreditsEarned;
            discordUser.totalCreditsSpent = result.user.totalCreditsSpent;
            await discordUser.save();
          } catch (dbSyncError) {
            logger.warn('Failed to sync Discord user to local DB', {
              error: (dbSyncError as Error).message
            });
          }
        }

        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Account Linked Successfully!')
          .setDescription('Your Discord is now connected to your SeisoAI account.')
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: '💰 Credits', value: `**${result.user.credits.toLocaleString()}**`, inline: true },
            { name: '📊 Total Earned', value: `${result.user.totalCreditsEarned.toLocaleString()}`, inline: true },
            { name: '📈 Total Spent', value: `${result.user.totalCreditsSpent.toLocaleString()}`, inline: true }
          )
          .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

        if (result.user.email) {
          const maskedEmail = result.user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
          embed.addFields({ name: '📧 Email', value: maskedEmail, inline: true });
        }

        if (result.user.walletAddress) {
          const addr = result.user.walletAddress;
          embed.addFields({ 
            name: '💳 Wallet', 
            value: `\`${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}\``, 
            inline: true 
          });
        }

        await interaction.editReply({ embeds: [embed] });

        logger.info('Discord account linked via code', {
          discordId,
          seisoUserId: result.user.userId
        });
        return;
      } else {
        // Record failed attempt for rate limiting
        recordAttempt(discordId, false);
        
        // Check remaining attempts
        const newRateLimit = checkRateLimit(discordId);
        
        // Code verification failed
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Link Failed')
          .setDescription(result.error || 'Unable to verify the code.')
          .addFields({
            name: '💡 What to do',
            value: `• Make sure you copied the code correctly\n• Codes expire after 5 minutes\n• Generate a new code at [SeisoAI Settings](${config.urls.website}/settings)`
          });

        // Warn user if approaching rate limit
        if (newRateLimit.remainingAttempts <= 2 && newRateLimit.remainingAttempts > 0) {
          embed.addFields({
            name: '⚠️ Rate Limit Warning',
            value: `You have ${newRateLimit.remainingAttempts} attempt${newRateLimit.remainingAttempts !== 1 ? 's' : ''} remaining before temporary lockout.`
          });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    // No code provided - check if already linked or show instructions
    // Only check DB if available
    if (dbAvailable) {
      try {
        const UserModel = getUserModel();
        const mainUser = await UserModel.findOne({ discordId }) as IMainUser | null;
        const discordUser = await DiscordUser.findOne({ discordId });

        // If already linked via OAuth, show success
        if (mainUser) {
          // Sync local Discord user data
          const linkedUser = discordUser ?? await DiscordUser.findOrCreate({
            id: interaction.user.id,
            username: interaction.user.username,
            discriminator: interaction.user.discriminator,
            avatar: interaction.user.avatar || undefined
          });

          linkedUser.seisoUserId = mainUser.userId;
          if (mainUser.email) linkedUser.email = mainUser.email;
          if (mainUser.walletAddress) linkedUser.walletAddress = mainUser.walletAddress;
          linkedUser.credits = mainUser.credits;
          linkedUser.totalCreditsEarned = mainUser.totalCreditsEarned;
          linkedUser.totalCreditsSpent = mainUser.totalCreditsSpent;
          await linkedUser.save();

          const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('✅ Account Already Linked!')
            .setDescription('Your Discord is connected to your SeisoAI account.')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
              { name: '💰 Credits', value: `**${linkedUser.credits.toLocaleString()}**`, inline: true },
              { name: '📊 Total Earned', value: `${linkedUser.totalCreditsEarned.toLocaleString()}`, inline: true },
              { name: '📈 Total Spent', value: `${linkedUser.totalCreditsSpent.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

          if (mainUser.email) {
            const maskedEmail = mainUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
            embed.addFields({ name: '📧 Email', value: maskedEmail, inline: true });
          }

          if (mainUser.walletAddress) {
            const addr = mainUser.walletAddress;
            embed.addFields({ 
              name: '💳 Wallet', 
              value: `\`${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}\``, 
              inline: true 
            });
          }

          await interaction.editReply({ embeds: [embed] });
          return;
        }

        // Check if linked via local storage
        if (discordUser?.seisoUserId) {
          const embed = new EmbedBuilder()
            .setColor(0x2ECC71)
            .setTitle('✅ Account Linked!')
            .setDescription('Your Discord is connected to SeisoAI.')
            .setThumbnail(interaction.user.displayAvatarURL())
            .addFields(
              { name: '💰 Credits', value: `**${discordUser.credits.toLocaleString()}**`, inline: true },
              { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned.toLocaleString()}`, inline: true }
            )
            .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

          await interaction.editReply({ embeds: [embed] });
          return;
        }
      } catch (dbLookupError) {
        logger.warn('Failed to check link status in DB', {
          error: (dbLookupError as Error).message
        });
      }
    }

    // Not linked - show secure linking instructions
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗 Link Your SeisoAI Account')
      .setDescription('Connect your Discord to access your credits and sync your generations across platforms.')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 How to Link (Secure)',
          value: `**1.** Go to [SeisoAI Settings](${config.urls.website}/settings)\n**2.** Log in to your account\n**3.** Click "**Link Discord**" to get a code\n**4.** Run \`/link code:XXXXXX\` here`,
          inline: false
        },
        {
          name: '🔒 Why use a code?',
          value: 'Codes verify you own the SeisoAI account, keeping your credits safe.',
          inline: false
        },
        {
          name: '🆕 New to SeisoAI?',
          value: `[Create an account](${config.urls.website}) to get started with free credits!`,
          inline: false
        }
      )
      .setFooter({ text: 'Codes expire in 5 minutes • Generate a new one anytime' });

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Get Link Code')
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.urls.website}/settings?connect=discord`)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setLabel('Create Account')
          .setStyle(ButtonStyle.Link)
          .setURL(config.urls.website)
          .setEmoji('🆕')
      );

    const refreshRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('link_refresh')
          .setLabel('Check Link Status')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄')
      );

    await interaction.editReply({ embeds: [embed], components: [row, refreshRow] });

    logger.info('Link command - showing secure link instructions', {
      discordId,
      username: interaction.user.username
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Link command error', { error: err.message, stack: err.stack, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Connection Error')
      .setDescription('Unable to check your account status. Please try again in a moment.')
      .setFooter({ text: 'If this persists, contact support' });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle link button interactions
 */
export async function handleLinkButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'link_refresh') {
    await interaction.deferUpdate();

    try {
      await ensureConnected();

      const discordId = interaction.user.id;
      const UserModel = getUserModel();
      const mainUser = await UserModel.findOne({ discordId }) as IMainUser | null;

      if (mainUser) {
        // Found! Sync the accounts
        const discordUser = await DiscordUser.findOrCreate({
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator,
          avatar: interaction.user.avatar || undefined
        });

        discordUser.seisoUserId = mainUser.userId;
        if (mainUser.email) discordUser.email = mainUser.email;
        if (mainUser.walletAddress) discordUser.walletAddress = mainUser.walletAddress;
        discordUser.credits = mainUser.credits;
        discordUser.totalCreditsEarned = mainUser.totalCreditsEarned;
        discordUser.totalCreditsSpent = mainUser.totalCreditsSpent;
        await discordUser.save();

        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Account Connected!')
          .setDescription('Your Discord is now linked to your SeisoAI account.')
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: '💰 Credits', value: `**${discordUser.credits.toLocaleString()}**`, inline: true },
            { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned.toLocaleString()}`, inline: true }
          )
          .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

        await interaction.editReply({ embeds: [embed], components: [] });

        logger.info('Refreshed and linked Discord account', {
          discordId,
          seisoUserId: mainUser.userId
        });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('🔍 Not Linked Yet')
          .setDescription('To link your account, you need to get a code from the website.')
          .addFields({
            name: '📋 How to Link',
            value: `**1.** Go to [SeisoAI Settings](${config.urls.website}/settings)\n**2.** Log in and click "**Link Discord**"\n**3.** Copy the 6-digit code\n**4.** Run \`/link code:XXXXXX\` here`
          });

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Get Link Code')
              .setStyle(ButtonStyle.Link)
              .setURL(`${config.urls.website}/settings?connect=discord`)
              .setEmoji('🔗'),
            new ButtonBuilder()
              .setCustomId('link_refresh')
              .setLabel('Check Again')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🔄')
          );

        await interaction.editReply({ embeds: [embed], components: [row] });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Link refresh error', { error: err.message, userId: interaction.user.id });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Error')
        .setDescription('Unable to check your account. Please try again.');

      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  }
}

// Note: handleLinkModal has been removed - we now use secure code-based linking only
// The old email/wallet modal flow was insecure (no ownership verification)

