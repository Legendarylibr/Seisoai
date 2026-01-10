/**
 * /admin command - Bot administration for server admins
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} from 'discord.js';
import management from '../services/management.js';
import DiscordUser from '../database/models/DiscordUser.js';
import logger from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Bot administration commands (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check bot status and permissions')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('cleanup')
      .setDescription('Clean up inactive private channels')
      .addIntegerOption(option =>
        option
          .setName('days')
          .setDescription('Delete channels inactive for this many days (default: 30)')
          .setRequired(false)
          .setMinValue(7)
          .setMaxValue(90)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View bot usage statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reset-channel')
      .setDescription('Reset a user\'s private channel')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user whose channel to reset')
          .setRequired(true)
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case 'status':
      await handleStatus(interaction);
      break;
    case 'cleanup':
      await handleCleanup(interaction);
      break;
    case 'stats':
      await handleStats(interaction);
      break;
    case 'reset-channel':
      await handleResetChannel(interaction);
      break;
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild) {
    await interaction.editReply({ content: 'This command can only be used in a server.' });
    return;
  }

  const permCheck = management.checkBotPermissions(interaction.guild);
  
  const embed = new EmbedBuilder()
    .setColor(permCheck.hasAll ? 0x2ECC71 : (permCheck.critical ? 0xE74C3C : 0xFFA500))
    .setTitle('🤖 Bot Status')
    .setThumbnail(interaction.client.user?.displayAvatarURL() || '')
    .addFields(
      { 
        name: '📊 Server Stats', 
        value: `Members: ${interaction.guild.memberCount}\nChannels: ${interaction.guild.channels.cache.size}`,
        inline: true 
      },
      { 
        name: '🌐 Global Stats', 
        value: `Servers: ${interaction.client.guilds.cache.size}\nUptime: ${formatUptime(interaction.client.uptime || 0)}`,
        inline: true 
      }
    );

  if (permCheck.hasAll) {
    embed.addFields({
      name: '✅ Permissions',
      value: 'All required permissions granted',
      inline: false
    });
  } else {
    embed.addFields({
      name: `${permCheck.critical ? '❌' : '⚠️'} Missing Permissions`,
      value: permCheck.missing.map(p => `• ${p}`).join('\n'),
      inline: false
    });
  }

  // Count private channels in this guild
  const privateChannelCategory = interaction.guild.channels.cache.find(
    c => c.type === ChannelType.GuildCategory && c.name === 'SeisoAI Private'
  );
  
  if (privateChannelCategory) {
    const privateChannels = interaction.guild.channels.cache.filter(
      c => c.parentId === privateChannelCategory.id && c.type === ChannelType.GuildText
    );
    embed.addFields({
      name: '🔒 Private Channels',
      value: `${privateChannels.size} active private channels`,
      inline: true
    });
  }

  // Ping/latency
  embed.addFields({
    name: '📡 Latency',
    value: `API: ${interaction.client.ws.ping}ms`,
    inline: true
  });

  embed.setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleCleanup(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const days = interaction.options.getInteger('days') || 30;

  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('🧹 Cleaning Up Inactive Channels...')
    .setDescription(`Removing private channels inactive for ${days}+ days...`);

  await interaction.editReply({ embeds: [embed] });

  const result = await management.cleanupInactiveChannels(interaction.client, days);

  const resultEmbed = new EmbedBuilder()
    .setColor(result.errors > 0 ? 0xFFA500 : 0x2ECC71)
    .setTitle('🧹 Cleanup Complete')
    .addFields(
      { name: '✅ Deleted', value: `${result.deleted} channels`, inline: true },
      { name: '❌ Errors', value: `${result.errors}`, inline: true }
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [resultEmbed] });

  logger.info('Admin cleanup executed', {
    adminId: interaction.user.id,
    guildId: interaction.guildId,
    days,
    result
  });
}

async function handleStats(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get aggregate stats
    const totalUsers = await DiscordUser.countDocuments();
    const linkedUsers = await DiscordUser.countDocuments({
      $or: [
        { seisoUserId: { $exists: true, $ne: null } },
        { email: { $exists: true, $ne: null } },
        { walletAddress: { $exists: true, $ne: null } }
      ]
    });

    // Aggregate generation stats
    const genStats = await DiscordUser.aggregate([
      {
        $project: {
          imageCount: {
            $size: {
              $filter: {
                input: '$generations',
                as: 'gen',
                cond: { $eq: ['$$gen.type', 'image'] }
              }
            }
          },
          videoCount: {
            $size: {
              $filter: {
                input: '$generations',
                as: 'gen',
                cond: { $eq: ['$$gen.type', 'video'] }
              }
            }
          },
          musicCount: {
            $size: {
              $filter: {
                input: '$generations',
                as: 'gen',
                cond: { $eq: ['$$gen.type', 'music'] }
              }
            }
          },
          model3dCount: {
            $size: {
              $filter: {
                input: '$generations',
                as: 'gen',
                cond: { $eq: ['$$gen.type', '3d'] }
              }
            }
          },
          totalCreditsSpent: 1
        }
      },
      {
        $group: {
          _id: null,
          totalImages: { $sum: '$imageCount' },
          totalVideos: { $sum: '$videoCount' },
          totalMusic: { $sum: '$musicCount' },
          total3D: { $sum: '$model3dCount' },
          totalCreditsSpent: { $sum: '$totalCreditsSpent' }
        }
      }
    ]);

    const stats = genStats[0] || {
      totalImages: 0,
      totalVideos: 0,
      totalMusic: 0,
      total3D: 0,
      totalCreditsSpent: 0
    };

    const totalGenerations = stats.totalImages + stats.totalVideos + stats.totalMusic + stats.total3D;

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📊 Bot Statistics')
      .addFields(
        { 
          name: '👥 Users', 
          value: `Total: ${totalUsers}\nLinked: ${linkedUsers}`,
          inline: true 
        },
        { 
          name: '🎨 Generations', 
          value: `Total: ${totalGenerations}`,
          inline: true 
        },
        { 
          name: '💰 Credits', 
          value: `Spent: ${stats.totalCreditsSpent}`,
          inline: true 
        },
        {
          name: '📈 By Type',
          value: `🖼️ Images: ${stats.totalImages}\n🎬 Videos: ${stats.totalVideos}\n🎵 Music: ${stats.totalMusic}\n📦 3D Models: ${stats.total3D}`,
          inline: false
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    logger.error('Stats command error', { error: (error as Error).message });
    await interaction.editReply({ content: 'Failed to retrieve statistics.' });
  }
}

async function handleResetChannel(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('user', true);

  try {
    const discordUser = await DiscordUser.findOne({ discordId: targetUser.id });
    
    if (!discordUser?.privateChannelId) {
      await interaction.editReply({ content: `${targetUser.username} doesn't have a private channel.` });
      return;
    }

    // Try to delete the channel
    if (interaction.guild) {
      const channel = interaction.guild.channels.cache.get(discordUser.privateChannelId);
      if (channel) {
        await channel.delete('Admin reset');
      }
    }

    // Clear the reference
    discordUser.privateChannelId = undefined;
    await discordUser.save();

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('✅ Channel Reset')
      .setDescription(`Private channel for ${targetUser.username} has been reset. A new one will be created on their next generation.`);

    await interaction.editReply({ embeds: [embed] });

    logger.info('Admin reset user channel', {
      adminId: interaction.user.id,
      targetUserId: targetUser.id,
      guildId: interaction.guildId
    });

  } catch (error) {
    logger.error('Reset channel error', { error: (error as Error).message });
    await interaction.editReply({ content: 'Failed to reset channel.' });
  }
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

