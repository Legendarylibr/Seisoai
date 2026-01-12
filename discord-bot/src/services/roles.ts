/**
 * Role Management Service
 * Handles verified role based on user credits
 */
import { Client, Guild, GuildMember } from 'discord.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import DiscordUser, { IDiscordUser } from '../database/models/DiscordUser.js';

/**
 * Check if a user should have the verified role (has credits)
 */
export function shouldHaveVerifiedRole(user: IDiscordUser): boolean {
  return user.credits > 0;
}

/**
 * Update a user's verified role based on their credits
 */
export async function updateVerifiedRole(
  client: Client,
  discordId: string,
  hasCredits: boolean
): Promise<boolean> {
  const roleId = config.discord.verifiedRoleId;
  const guildId = config.discord.guildId;

  if (!roleId || !guildId) {
    logger.debug('Verified role or guild not configured, skipping role update');
    return false;
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn('Guild not found for role update', { guildId });
      return false;
    }

    const member = await guild.members.fetch(discordId).catch(() => null);
    if (!member) {
      logger.debug('Member not found in guild', { discordId, guildId });
      return false;
    }

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      logger.warn('Verified role not found', { roleId });
      return false;
    }

    const hasRole = member.roles.cache.has(roleId);

    if (hasCredits && !hasRole) {
      // Grant verified role
      await member.roles.add(role, 'User has credits');
      logger.info('Granted verified role', { discordId, roleId });
      return true;
    } else if (!hasCredits && hasRole) {
      // Remove verified role
      await member.roles.remove(role, 'User has no credits');
      logger.info('Removed verified role', { discordId, roleId });
      return true;
    }

    return false; // No change needed
  } catch (error) {
    const err = error as Error;
    logger.error('Error updating verified role', { 
      error: err.message, 
      discordId 
    });
    return false;
  }
}

/**
 * Sync verified role for a user based on their current credits
 */
export async function syncUserRole(
  client: Client,
  discordUser: IDiscordUser
): Promise<void> {
  const hasCredits = shouldHaveVerifiedRole(discordUser);
  await updateVerifiedRole(client, discordUser.discordId, hasCredits);
}

/**
 * Sync verified roles for all users in the guild
 */
export async function syncAllRoles(client: Client): Promise<{ updated: number; total: number }> {
  const guildId = config.discord.guildId;
  const roleId = config.discord.verifiedRoleId;

  if (!roleId || !guildId) {
    logger.debug('Verified role or guild not configured, skipping sync');
    return { updated: 0, total: 0 };
  }

  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.warn('Guild not found for role sync', { guildId });
      return { updated: 0, total: 0 };
    }

    // Get all Discord users from database
    const users = await DiscordUser.find({});
    let updated = 0;

    for (const user of users) {
      const hasCredits = shouldHaveVerifiedRole(user);
      const changed = await updateVerifiedRole(client, user.discordId, hasCredits);
      if (changed) updated++;
    }

    logger.info('Synced verified roles', { updated, total: users.length });
    return { updated, total: users.length };
  } catch (error) {
    const err = error as Error;
    logger.error('Error syncing all roles', { error: err.message });
    return { updated: 0, total: 0 };
  }
}

/**
 * Check if a member has access to main chat
 */
export function hasMainChatAccess(member: GuildMember): boolean {
  const roleId = config.discord.verifiedRoleId;
  
  if (!roleId) {
    // If no verified role configured, allow everyone
    return true;
  }

  return member.roles.cache.has(roleId);
}

/**
 * Check if a channel is the main chat channel
 */
export function isMainChatChannel(channelId: string): boolean {
  const mainChatId = config.discord.mainChatChannelId;
  return mainChatId ? channelId === mainChatId : false;
}

export default {
  shouldHaveVerifiedRole,
  updateVerifiedRole,
  syncUserRole,
  syncAllRoles,
  hasMainChatAccess,
  isMainChatChannel
};
