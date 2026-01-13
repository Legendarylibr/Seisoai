/**
 * Bot Management Service
 * Handles permissions, rate limiting, cleanup, and health checks
 * 
 * NOTE: Email lookups use encryption-aware methods to support 
 * encrypted email fields in the database.
 */
import {
  Client,
  Guild,
  TextChannel,
  PermissionFlagsBits,
  ChannelType,
  GuildMember,
  EmbedBuilder
} from 'discord.js';
import DiscordUser from '../database/models/DiscordUser.js';
import User, { ensureUserModel } from '../database/models/User.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { buildEmailLookupConditions } from '../utils/encryption.js';

// Rate limit tracking
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 10; // 10 generations per minute

// Active generations tracking
const activeGenerations = new Map<string, number>();
const MAX_CONCURRENT_GENERATIONS = 3;

// Cooldown tracking (per command type)
const cooldowns = new Map<string, Map<string, number>>();
const COOLDOWN_TIMES: Record<string, number> = {
  imagine: 5000,    // 5 seconds
  video: 30000,     // 30 seconds (long generation)
  music: 10000,     // 10 seconds
  '3d': 30000       // 30 seconds (long generation)
};

// Track maintenance intervals for cleanup
const maintenanceIntervals: NodeJS.Timeout[] = [];
const maintenanceTimeouts: NodeJS.Timeout[] = [];

/**
 * Required bot permissions for full functionality
 */
export const REQUIRED_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageThreads
];

/**
 * Check if the bot has all required permissions in a guild
 */
export function checkBotPermissions(guild: Guild): { 
  hasAll: boolean; 
  missing: string[];
  critical: boolean;
} {
  const botMember = guild.members.cache.get(guild.client.user!.id);
  if (!botMember) {
    return { hasAll: false, missing: ['Bot not in guild'], critical: true };
  }

  const permissions = botMember.permissions;
  const missing: string[] = [];

  const permissionNames: Record<string, string> = {
    [PermissionFlagsBits.ViewChannel.toString()]: 'View Channels',
    [PermissionFlagsBits.SendMessages.toString()]: 'Send Messages',
    [PermissionFlagsBits.SendMessagesInThreads.toString()]: 'Send Messages in Threads',
    [PermissionFlagsBits.EmbedLinks.toString()]: 'Embed Links',
    [PermissionFlagsBits.AttachFiles.toString()]: 'Attach Files',
    [PermissionFlagsBits.ReadMessageHistory.toString()]: 'Read Message History',
    [PermissionFlagsBits.UseExternalEmojis.toString()]: 'Use External Emojis',
    [PermissionFlagsBits.ManageChannels.toString()]: 'Manage Channels',
    [PermissionFlagsBits.ManageThreads.toString()]: 'Manage Threads'
  };

  for (const perm of REQUIRED_PERMISSIONS) {
    if (!permissions.has(perm)) {
      missing.push(permissionNames[perm.toString()] || perm.toString());
    }
  }

  // Critical = missing permissions needed for basic operation
  const criticalPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks
  ];
  const critical = criticalPerms.some(p => !permissions.has(p));

  return { hasAll: missing.length === 0, missing, critical };
}

/**
 * Check rate limit for a user
 */
export function checkRateLimit(userId: string): { 
  allowed: boolean; 
  remaining: number; 
  resetIn: number;
} {
  const now = Date.now();
  const userLimit = rateLimits.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetIn: RATE_LIMIT_WINDOW };
  }

  if (userLimit.count >= RATE_LIMIT_MAX) {
    return { 
      allowed: false, 
      remaining: 0, 
      resetIn: userLimit.resetAt - now 
    };
  }

  userLimit.count++;
  return { 
    allowed: true, 
    remaining: RATE_LIMIT_MAX - userLimit.count, 
    resetIn: userLimit.resetAt - now 
  };
}

/**
 * Check if user is on cooldown for a specific command
 */
export function checkCooldown(userId: string, command: string): {
  onCooldown: boolean;
  remainingMs: number;
} {
  const commandCooldowns = cooldowns.get(command) || new Map();
  const lastUsed = commandCooldowns.get(userId) || 0;
  const cooldownTime = COOLDOWN_TIMES[command] || 5000;
  const now = Date.now();

  if (now - lastUsed < cooldownTime) {
    return { 
      onCooldown: true, 
      remainingMs: cooldownTime - (now - lastUsed) 
    };
  }

  // Update cooldown
  commandCooldowns.set(userId, now);
  cooldowns.set(command, commandCooldowns);

  return { onCooldown: false, remainingMs: 0 };
}

/**
 * Check if user can start a new generation (concurrent limit)
 */
export function canStartGeneration(userId: string): boolean {
  const active = activeGenerations.get(userId) || 0;
  return active < MAX_CONCURRENT_GENERATIONS;
}

/**
 * Track generation start
 */
export function startGeneration(userId: string): void {
  const current = activeGenerations.get(userId) || 0;
  activeGenerations.set(userId, current + 1);
}

/**
 * Track generation end
 */
export function endGeneration(userId: string): void {
  const current = activeGenerations.get(userId) || 0;
  activeGenerations.set(userId, Math.max(0, current - 1));
}

/**
 * Get user's active generation count
 */
export function getActiveGenerations(userId: string): number {
  return activeGenerations.get(userId) || 0;
}

/**
 * Clean up inactive private channels (older than specified days)
 */
export async function cleanupInactiveChannels(
  client: Client, 
  inactiveDays: number = 30
): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;
  const cutoffDate = new Date(Date.now() - inactiveDays * 24 * 60 * 60 * 1000);

  try {
    // Find users with private channels who haven't generated recently
    const inactiveUsers = await DiscordUser.find({
      privateChannelId: { $exists: true, $ne: null },
      $or: [
        { lastGeneration: { $lt: cutoffDate } },
        { lastGeneration: { $exists: false } }
      ]
    });

    for (const user of inactiveUsers) {
      try {
        // Find the channel in any guild
        for (const guild of client.guilds.cache.values()) {
          const channel = guild.channels.cache.get(user.privateChannelId!);
          if (channel && channel.type === ChannelType.GuildText) {
            // Check if channel is truly inactive (no recent messages)
            const messages = await (channel as TextChannel).messages.fetch({ limit: 1 });
            const lastMessage = messages.first();
            
            if (!lastMessage || lastMessage.createdAt < cutoffDate) {
              await channel.delete('Inactive private channel cleanup');
              user.privateChannelId = undefined;
              await user.save();
              deleted++;
              logger.info('Deleted inactive private channel', {
                userId: user.discordId,
                channelId: channel.id
              });
            }
            break;
          }
        }
      } catch (error) {
        errors++;
        logger.warn('Failed to cleanup channel', {
          userId: user.discordId,
          error: (error as Error).message
        });
      }
    }
  } catch (error) {
    logger.error('Channel cleanup failed', { error: (error as Error).message });
    errors++;
  }

  return { deleted, errors };
}

/**
 * Validate and repair private channel reference
 */
export async function validatePrivateChannel(
  client: Client,
  userId: string
): Promise<TextChannel | null> {
  const user = await DiscordUser.findOne({ discordId: userId });
  if (!user?.privateChannelId) return null;

  // Try to find the channel
  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.get(user.privateChannelId);
    if (channel && channel.type === ChannelType.GuildText) {
      return channel as TextChannel;
    }
  }

  // Channel doesn't exist anymore, clear the reference
  user.privateChannelId = undefined;
  await user.save();
  logger.info('Cleared stale private channel reference', { userId });
  
  return null;
}

/**
 * Sync credits from main SeisoAI user to Discord user
 * Also checks for OAuth-linked accounts
 */
export async function syncCreditsFromMain(discordId: string): Promise<boolean> {
  try {
    let discordUser = await DiscordUser.findOne({ discordId });
    
    // Ensure User model is registered before using it
    const UserModel = ensureUserModel();

    // First, check if there's an OAuth-linked account (by discordId in main User)
    let mainUser = await UserModel.findOne({ discordId });
    
    // If not OAuth-linked, try other identifiers
    if (!mainUser && discordUser) {
      if (discordUser.seisoUserId) {
        // Direct userId lookup
        mainUser = await UserModel.findOne({ userId: discordUser.seisoUserId });
      } else if (discordUser.email) {
        // Use encryption-aware email lookup with multiple fallback methods
        const emailConditions = buildEmailLookupConditions(discordUser.email);
        mainUser = await UserModel.findOne({ $or: emailConditions });
      } else if (discordUser.walletAddress) {
        // Direct wallet lookup (no encryption needed)
        mainUser = await UserModel.findOne({ walletAddress: discordUser.walletAddress });
      }
    }

    if (!mainUser) return false;

    // Create Discord user if doesn't exist
    if (!discordUser) {
      discordUser = new DiscordUser({
        discordId,
        discordUsername: 'Unknown',
        credits: 0,
        totalCreditsEarned: 0,
        totalCreditsSpent: 0,
        generations: [],
        settings: { notifyOnComplete: true, autoThread: true }
      });
    }

    // Sync from main account
    discordUser.seisoUserId = mainUser.userId;
    if (mainUser.email) discordUser.email = mainUser.email;
    if (mainUser.walletAddress) discordUser.walletAddress = mainUser.walletAddress;
    discordUser.credits = mainUser.credits;
    discordUser.totalCreditsEarned = mainUser.totalCreditsEarned || discordUser.totalCreditsEarned;
    discordUser.totalCreditsSpent = mainUser.totalCreditsSpent || discordUser.totalCreditsSpent;
    await discordUser.save();

    logger.debug('Synced credits from main account', {
      discordId,
      credits: discordUser.credits,
      wasOAuthLinked: !!mainUser.discordId
    });

    return true;
  } catch (error) {
    logger.error('Failed to sync credits', { 
      discordId, 
      error: (error as Error).message 
    });
    return false;
  }
}

/**
 * Auto-detect and sync OAuth-linked account before generation
 * Returns the Discord user with synced credits
 */
export async function ensureUserSynced(discordId: string, username: string): Promise<typeof DiscordUser.prototype | null> {
  try {
    // Try to sync from main database first
    await syncCreditsFromMain(discordId);
    
    // Get or create the Discord user
    const discordUser = await DiscordUser.findOrCreate({
      id: discordId,
      username,
      discriminator: '0',
      avatar: undefined
    });
    
    return discordUser;
  } catch (error) {
    logger.error('Failed to ensure user synced', {
      discordId,
      error: (error as Error).message
    });
    return null;
  }
}

/**
 * Create rate limit exceeded embed
 */
export function createRateLimitEmbed(resetIn: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('⏱️ Slow Down!')
    .setDescription(`You're generating too fast. Please wait **${Math.ceil(resetIn / 1000)}** seconds.`)
    .addFields({
      name: '💡 Tip',
      value: 'You can generate up to 10 times per minute.'
    });
}

/**
 * Create cooldown embed
 */
export function createCooldownEmbed(command: string, remainingMs: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('⏳ Cooldown Active')
    .setDescription(`Please wait **${Math.ceil(remainingMs / 1000)}** seconds before using \`/${command}\` again.`);
}

/**
 * Create concurrent limit embed
 */
export function createConcurrentLimitEmbed(active: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('🔄 Generation Limit Reached')
    .setDescription(`You have **${active}** generation(s) in progress.`)
    .addFields({
      name: '💡 What to do',
      value: `Wait for your current generation(s) to complete. Maximum ${MAX_CONCURRENT_GENERATIONS} concurrent generations allowed.`
    });
}

/**
 * Create missing permissions embed
 */
export function createMissingPermissionsEmbed(missing: string[]): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('⚠️ Missing Permissions')
    .setDescription('The bot is missing some permissions needed to work properly.')
    .addFields({
      name: '🔧 Missing Permissions',
      value: missing.map(p => `• ${p}`).join('\n')
    }, {
      name: '💡 How to Fix',
      value: 'Ask a server admin to update the bot\'s role permissions or re-invite the bot with the correct permissions.'
    });
}

/**
 * Run periodic maintenance tasks
 */
export function startMaintenanceTasks(client: Client): void {
  // Clear any existing intervals/timeouts
  stopMaintenanceTasks();

  // Clean up rate limits every hour
  const rateLimitInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, limit] of rateLimits.entries()) {
      if (now > limit.resetAt) {
        rateLimits.delete(userId);
      }
    }
    logger.debug('Cleaned up expired rate limits');
  }, 60 * 60 * 1000);
  maintenanceIntervals.push(rateLimitInterval);

  // Clean up cooldowns every 10 minutes
  const cooldownInterval = setInterval(() => {
    const now = Date.now();
    for (const [command, userCooldowns] of cooldowns.entries()) {
      const cooldownTime = COOLDOWN_TIMES[command] || 5000;
      for (const [userId, lastUsed] of userCooldowns.entries()) {
        if (now - lastUsed > cooldownTime * 2) {
          userCooldowns.delete(userId);
        }
      }
    }
    logger.debug('Cleaned up expired cooldowns');
  }, 10 * 60 * 1000);
  maintenanceIntervals.push(cooldownInterval);

  // Clean up inactive channels weekly (Sunday at 3 AM)
  const scheduleWeeklyCleanup = () => {
    const now = new Date();
    const nextSunday = new Date(now);
    nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
    nextSunday.setHours(3, 0, 0, 0);
    
    if (nextSunday <= now) {
      nextSunday.setDate(nextSunday.getDate() + 7);
    }

    const delay = nextSunday.getTime() - now.getTime();
    
    const timeout = setTimeout(async () => {
      logger.info('Starting weekly channel cleanup');
      const result = await cleanupInactiveChannels(client, 30);
      logger.info('Weekly channel cleanup complete', result);
      scheduleWeeklyCleanup(); // Schedule next cleanup
    }, delay);
    maintenanceTimeouts.push(timeout);
  };

  scheduleWeeklyCleanup();
  logger.info('Maintenance tasks scheduled');
}

/**
 * Stop all maintenance tasks (for graceful shutdown)
 */
export function stopMaintenanceTasks(): void {
  // Clear all intervals
  for (const interval of maintenanceIntervals) {
    clearInterval(interval);
  }
  maintenanceIntervals.length = 0;

  // Clear all timeouts
  for (const timeout of maintenanceTimeouts) {
    clearTimeout(timeout);
  }
  maintenanceTimeouts.length = 0;

  // Clear in-memory caches
  rateLimits.clear();
  cooldowns.clear();
  activeGenerations.clear();

  logger.debug('Maintenance tasks stopped and caches cleared');
}

export default {
  checkBotPermissions,
  checkRateLimit,
  checkCooldown,
  canStartGeneration,
  startGeneration,
  endGeneration,
  getActiveGenerations,
  cleanupInactiveChannels,
  validatePrivateChannel,
  syncCreditsFromMain,
  ensureUserSynced,
  createRateLimitEmbed,
  createCooldownEmbed,
  createConcurrentLimitEmbed,
  createMissingPermissionsEmbed,
  startMaintenanceTasks,
  stopMaintenanceTasks,
  REQUIRED_PERMISSIONS
};

