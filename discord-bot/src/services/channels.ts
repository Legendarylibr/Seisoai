/**
 * Channel Management Service
 * Handles private channels and threads for users
 */
import { 
  Client, 
  Guild, 
  TextChannel, 
  ThreadChannel,
  ChannelType,
  PermissionFlagsBits,
  GuildMember,
  Message,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import DiscordUser, { IDiscordUser } from '../database/models/DiscordUser.js';

/**
 * Create or get a user's private channel
 */
export async function getOrCreatePrivateChannel(
  client: Client,
  guild: Guild,
  member: GuildMember
): Promise<TextChannel | null> {
  try {
    // Check if user already has a private channel
    const discordUser = await DiscordUser.findOne({ discordId: member.id });
    
    if (discordUser?.privateChannelId) {
      const existingChannel = guild.channels.cache.get(discordUser.privateChannelId);
      if (existingChannel && existingChannel.type === ChannelType.GuildText) {
        return existingChannel as TextChannel;
      }
    }

    // Get or create the private channels category
    let category = guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && 
           (c.id === config.discord.privateChannelCategoryId || c.name === 'SeisoAI Private')
    );

    if (!category) {
      category = await guild.channels.create({
        name: 'SeisoAI Private',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: client.user!.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
          }
        ]
      });
      logger.info('Created private channels category', { categoryId: category.id });
    }

    // Create private channel for user
    const channelName = `gen-${member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    
    const privateChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Private generation channel for ${member.user.username}`,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles
          ],
        },
        {
          id: client.user!.id,
          allow: [
            PermissionFlagsBits.ViewChannel, 
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.AttachFiles
          ],
        }
      ]
    });

    // Update user's private channel ID
    await DiscordUser.findOneAndUpdate(
      { discordId: member.id },
      { privateChannelId: privateChannel.id },
      { upsert: true }
    );

    logger.info('Created private channel', { 
      userId: member.id, 
      channelId: privateChannel.id 
    });

    // Send welcome message
    await sendWelcomeMessage(privateChannel, member);

    return privateChannel;
  } catch (error) {
    const err = error as Error;
    logger.error('Error creating private channel', { 
      error: err.message, 
      userId: member.id 
    });
    return null;
  }
}

/**
 * Send welcome message to new private channel
 */
async function sendWelcomeMessage(channel: TextChannel, member: GuildMember): Promise<void> {
  const welcomeEmbed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🎨 Welcome to Your SeisoAI Studio!')
    .setDescription(`Hey ${member.displayName}! This is your private generation space.`)
    .addFields(
      {
        name: '🖼️ Image Generation',
        value: '`/imagine` - Create stunning AI images',
        inline: true
      },
      {
        name: '🎬 Video Generation',
        value: '`/video` - Generate AI videos',
        inline: true
      },
      {
        name: '🎵 Music Generation',
        value: '`/music` - Create AI music',
        inline: true
      },
      {
        name: '📦 3D Model Generation',
        value: '`/3d` - Create 3D models from images',
        inline: true
      },
      {
        name: '💰 Check Credits',
        value: '`/credits` - View your balance',
        inline: true
      },
      {
        name: '🔗 Link Account',
        value: '`/link` - Connect your SeisoAI account',
        inline: true
      }
    )
    .setFooter({ text: 'Use /help for detailed command information' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Visit Website')
        .setStyle(ButtonStyle.Link)
        .setURL(config.urls.website)
        .setEmoji('🌐'),
      new ButtonBuilder()
        .setCustomId('quick_imagine')
        .setLabel('Quick Generate')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✨')
    );

  await channel.send({ embeds: [welcomeEmbed], components: [row] });
}

/**
 * Create a generation thread for a specific request
 */
export async function createGenerationThread(
  channel: TextChannel,
  type: 'image' | 'video' | 'music' | '3d',
  prompt: string,
  userId: string
): Promise<ThreadChannel | null> {
  try {
    const typeEmojis = {
      image: '🖼️',
      video: '🎬',
      music: '🎵',
      '3d': '📦'
    };

    const truncatedPrompt = prompt.length > 50 
      ? prompt.substring(0, 47) + '...' 
      : prompt;

    const thread = await channel.threads.create({
      name: `${typeEmojis[type]} ${truncatedPrompt}`,
      autoArchiveDuration: 1440, // 24 hours
      reason: `Generation request by ${userId}`
    });

    logger.debug('Created generation thread', { 
      threadId: thread.id, 
      type, 
      userId 
    });

    return thread;
  } catch (error) {
    const err = error as Error;
    logger.error('Error creating generation thread', { error: err.message });
    return null;
  }
}

/**
 * Send generation status update
 */
export async function sendStatusUpdate(
  channel: TextChannel | ThreadChannel,
  status: 'queued' | 'processing' | 'completed' | 'failed',
  details?: {
    progress?: number;
    queuePosition?: number;
    eta?: string;
    error?: string;
    resultUrl?: string;
    resultType?: 'image' | 'video' | 'music' | '3d';
  }
): Promise<Message | null> {
  try {
    const statusEmojis = {
      queued: '⏳',
      processing: '⚙️',
      completed: '✅',
      failed: '❌'
    };

    const statusColors = {
      queued: 0xFFA500,
      processing: 0x3498DB,
      completed: 0x2ECC71,
      failed: 0xE74C3C
    };

    const embed = new EmbedBuilder()
      .setColor(statusColors[status])
      .setTitle(`${statusEmojis[status]} Generation ${status.charAt(0).toUpperCase() + status.slice(1)}`);

    if (details?.progress !== undefined) {
      const progressBar = createProgressBar(details.progress);
      embed.addFields({ name: 'Progress', value: progressBar, inline: false });
    }

    if (details?.queuePosition !== undefined) {
      embed.addFields({ 
        name: 'Queue Position', 
        value: `#${details.queuePosition}`, 
        inline: true 
      });
    }

    if (details?.eta) {
      embed.addFields({ name: 'ETA', value: details.eta, inline: true });
    }

    if (details?.error) {
      embed.addFields({ name: 'Error', value: details.error, inline: false });
    }

    if (details?.resultUrl && status === 'completed') {
      if (details.resultType === 'image') {
        embed.setImage(details.resultUrl);
      } else {
        embed.addFields({ 
          name: 'Result', 
          value: `[Download](${details.resultUrl})`, 
          inline: false 
        });
      }
    }

    return await channel.send({ embeds: [embed] });
  } catch (error) {
    const err = error as Error;
    logger.error('Error sending status update', { error: err.message });
    return null;
  }
}

/**
 * Create a visual progress bar
 */
function createProgressBar(progress: number): string {
  const filled = Math.round(progress / 5);
  const empty = 20 - filled;
  return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress}%`;
}

/**
 * Send generation result
 */
export async function sendGenerationResult(
  channel: TextChannel | ThreadChannel,
  type: 'image' | 'video' | 'music' | '3d',
  result: {
    url: string;
    prompt: string;
    creditsUsed: number;
    remainingCredits: number;
    thumbnailUrl?: string;
  }
): Promise<Message | null> {
  try {
    const typeEmojis = {
      image: '🖼️',
      video: '🎬',
      music: '🎵',
      '3d': '📦'
    };

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle(`${typeEmojis[type]} Generation Complete!`)
      .setDescription(`**Prompt:** ${result.prompt.substring(0, 200)}...`)
      .addFields(
        { name: 'Credits Used', value: `${result.creditsUsed}`, inline: true },
        { name: 'Remaining', value: `${result.remainingCredits}`, inline: true }
      )
      .setTimestamp();

    if (type === 'image') {
      embed.setImage(result.url);
    } else if (result.thumbnailUrl) {
      embed.setThumbnail(result.thumbnailUrl);
    }

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Download')
          .setStyle(ButtonStyle.Link)
          .setURL(result.url)
          .setEmoji('📥'),
        new ButtonBuilder()
          .setCustomId(`regenerate_${type}`)
          .setLabel('Regenerate')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId(`save_${type}`)
          .setLabel('Save to Gallery')
          .setStyle(ButtonStyle.Success)
          .setEmoji('💾')
      );

    return await channel.send({ embeds: [embed], components: [row] });
  } catch (error) {
    const err = error as Error;
    logger.error('Error sending generation result', { error: err.message });
    return null;
  }
}

export default {
  getOrCreatePrivateChannel,
  createGenerationThread,
  sendStatusUpdate,
  sendGenerationResult
};

