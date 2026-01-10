/**
 * Bot Management Service
 * Handles permissions, rate limiting, cleanup, and health checks
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
import config from '../config/index.js';
import logger from '../utils/logger.js';

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
 */
export async function syncCreditsFromMain(discordId: string): Promise<boolean> {
  try {
    const discordUser = await DiscordUser.findOne({ discordId });
    if (!discordUser?.seisoUserId && !discordUser?.email && !discordUser?.walletAddress) {
      return false;
    }

    // Import mongoose to query main User model
    const mongoose = await import('mongoose');
    
    // Build query based on what's linked
    const query: Record<string, unknown> = {};
    if (discordUser.seisoUserId) query.userId = discordUser.seisoUserId;
    else if (discordUser.email) query.email = discordUser.email;
    else if (discordUser.walletAddress) query.walletAddress = discordUser.walletAddress;

    // Try to find main user
    const User = mongoose.default.models.User;
    if (!User) return false;

    const mainUser = await User.findOne(query);
    if (!mainUser) return false;

    // Sync credits
    discordUser.credits = mainUser.credits;
    discordUser.totalCreditsEarned = mainUser.totalCreditsEarned || discordUser.totalCreditsEarned;
    discordUser.totalCreditsSpent = mainUser.totalCreditsSpent || discordUser.totalCreditsSpent;
    await discordUser.save();

    logger.debug('Synced credits from main account', {
      discordId,
      credits: discordUser.credits
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
  // Clean up rate limits every hour
  setInterval(() => {
    const now = Date.now();
    for (const [userId, limit] of rateLimits.entries()) {
      if (now > limit.resetAt) {
        rateLimits.delete(userId);
      }
    }
    logger.debug('Cleaned up expired rate limits');
  }, 60 * 60 * 1000);

  // Clean up cooldowns every 10 minutes
  setInterval(() => {
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
    
    setTimeout(async () => {
      logger.info('Starting weekly channel cleanup');
      const result = await cleanupInactiveChannels(client, 30);
      logger.info('Weekly channel cleanup complete', result);
      scheduleWeeklyCleanup(); // Schedule next cleanup
    }, delay);
  };

  scheduleWeeklyCleanup();
  logger.info('Maintenance tasks scheduled');
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
  createRateLimitEmbed,
  createCooldownEmbed,
  createConcurrentLimitEmbed,
  createMissingPermissionsEmbed,
  startMaintenanceTasks,
  REQUIRED_PERMISSIONS
};

