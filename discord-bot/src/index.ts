/**
 * SeisoAI Discord Bot
 * Main entry point - handles client setup and event handling
 */
import {
  Client,
  GatewayIntentBits,
  Events,
  Partials,
  ActivityType,
  EmbedBuilder,
  ChannelType
} from 'discord.js';
import config, { validateConfig } from './config/index.js';
import { connectDatabase, ensureConnected } from './database/index.js';
import commands, { handleLinkButton, handleHelpSelect } from './commands/index.js';
import { getOrCreatePrivateChannel } from './services/channels.js';
import management from './services/management.js';
import DiscordUser from './database/models/DiscordUser.js';
import logger from './utils/logger.js';

// Generation commands that need rate limiting
const GENERATION_COMMANDS = ['imagine', 'video', 'music', '3d'];

// Validate configuration before starting
if (!validateConfig()) {
  logger.error('Invalid configuration. Please check your .env file.');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.Message,
    Partials.User
  ]
});

// Ready event
client.once(Events.ClientReady, async (readyClient) => {
  logger.info(`🤖 Logged in as ${readyClient.user.tag}`);
  logger.info(`📊 Serving ${readyClient.guilds.cache.size} servers`);

  // Set bot presence
  readyClient.user.setPresence({
    activities: [
      {
        name: '/imagine | /video | /music',
        type: ActivityType.Watching
      }
    ],
    status: 'online'
  });

  // Connect to database
  try {
    await connectDatabase();
    logger.info('📦 Database connected');
  } catch (error) {
    logger.error('Failed to connect to database', { error: (error as Error).message });
  }

  // Check permissions in all guilds
  for (const guild of readyClient.guilds.cache.values()) {
    const permCheck = management.checkBotPermissions(guild);
    if (!permCheck.hasAll) {
      logger.warn(`Missing permissions in ${guild.name}`, { 
        guildId: guild.id, 
        missing: permCheck.missing,
        critical: permCheck.critical
      });
    }
  }

  // Start maintenance tasks
  management.startMaintenanceTasks(client);
  logger.info('🔧 Maintenance tasks started');
});

// Slash command handler
client.on(Events.InteractionCreate, async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`Unknown command: ${interaction.commandName}`);
      return;
    }

    // Ensure database is connected before executing commands
    try {
      await ensureConnected();
    } catch (error) {
      logger.error('Database connection error', { error: (error as Error).message });
      const errorEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Database Error')
        .setDescription('Unable to connect to the database. Please try again in a moment.');
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
      return;
    }

    try {
      const userId = interaction.user.id;
      const commandName = interaction.commandName;
      const isGenerationCommand = GENERATION_COMMANDS.includes(commandName);

      // Check bot permissions in guild
      if (interaction.guild) {
        const permCheck = management.checkBotPermissions(interaction.guild);
        if (permCheck.critical) {
          const embed = management.createMissingPermissionsEmbed(permCheck.missing);
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }
      }

      // For generation commands, check rate limits and cooldowns
      if (isGenerationCommand) {
        // Check rate limit
        const rateLimit = management.checkRateLimit(userId);
        if (!rateLimit.allowed) {
          const embed = management.createRateLimitEmbed(rateLimit.resetIn);
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        // Check cooldown
        const cooldown = management.checkCooldown(userId, commandName);
        if (cooldown.onCooldown) {
          const embed = management.createCooldownEmbed(commandName, cooldown.remainingMs);
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        // Check concurrent generation limit
        if (!management.canStartGeneration(userId)) {
          const active = management.getActiveGenerations(userId);
          const embed = management.createConcurrentLimitEmbed(active);
          await interaction.reply({ embeds: [embed], ephemeral: true });
          return;
        }

        // Track generation start
        management.startGeneration(userId);
      }

      logger.debug(`Command executed: /${commandName}`, {
        userId,
        guildId: interaction.guildId,
        channelId: interaction.channelId
      });

      try {
        await command.execute(interaction);
      } finally {
        // Track generation end
        if (isGenerationCommand) {
          management.endGeneration(userId);
        }
      }

    } catch (error) {
      const err = error as Error;
      logger.error(`Command error: /${interaction.commandName}`, {
        error: err.message,
        userId: interaction.user.id
      });

      // End generation tracking on error
      if (GENERATION_COMMANDS.includes(interaction.commandName)) {
        management.endGeneration(interaction.user.id);
      }

      const errorEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Command Error')
        .setDescription('An unexpected error occurred. Please try again.')
        .setFooter({ text: 'If this persists, please contact support.' });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    }
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'help_select') {
      await handleHelpSelect(interaction);
    }
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;

    // Link account buttons
    if (customId.startsWith('link_')) {
      await handleLinkButton(interaction);
      return;
    }

    // Quick generate button from welcome message
    if (customId === 'quick_imagine') {
      await interaction.reply({
        content: '✨ Use `/imagine` followed by your prompt to generate an image!\n\nExample: `/imagine prompt:a magical forest at sunset`',
        ephemeral: true
      });
    }

    // Regenerate buttons
    if (customId.startsWith('regenerate_')) {
      await interaction.reply({
        content: '🔄 To regenerate, use the original command again with the same or modified prompt.',
        ephemeral: true
      });
    }

    // Save to gallery
    if (customId.startsWith('save_')) {
      await interaction.reply({
        content: '💾 Your generation is automatically saved to your history! Use `/credits` to view recent generations.',
        ephemeral: true
      });
    }
  }
});

// Guild member join - create profile
client.on(Events.GuildMemberAdd, async (member) => {
  try {
    // Ensure database is connected
    await ensureConnected();
    
    // Create or get the user's Discord profile
    await DiscordUser.findOrCreate({
      id: member.id,
      username: member.user.username,
      discriminator: member.user.discriminator,
      avatar: member.user.avatar || undefined
    });

    logger.info('New member joined', {
      userId: member.id,
      username: member.user.username,
      guildId: member.guild.id
    });

  } catch (error) {
    logger.error('Error handling new member', { error: (error as Error).message });
  }
});

// Bot joins a new guild - check permissions
client.on(Events.GuildCreate, async (guild) => {
  logger.info('Bot joined new guild', { 
    guildId: guild.id, 
    guildName: guild.name,
    memberCount: guild.memberCount 
  });

  // Check permissions
  const permCheck = management.checkBotPermissions(guild);
  if (!permCheck.hasAll) {
    logger.warn(`Missing permissions in new guild ${guild.name}`, {
      guildId: guild.id,
      missing: permCheck.missing,
      critical: permCheck.critical
    });

    // Try to notify guild owner if critical permissions missing
    if (permCheck.critical && guild.ownerId) {
      try {
        const owner = await guild.members.fetch(guild.ownerId);
        const embed = management.createMissingPermissionsEmbed(permCheck.missing);
        embed.setTitle('⚠️ SeisoAI Bot Setup Required');
        embed.setDescription(`Thanks for adding me to **${guild.name}**! I'm missing some permissions needed to work properly.`);
        await owner.send({ embeds: [embed] });
      } catch {
        // Can't DM owner, that's okay
      }
    }
  }
});

// Bot leaves a guild - log it
client.on(Events.GuildDelete, async (guild) => {
  logger.info('Bot left guild', { 
    guildId: guild.id, 
    guildName: guild.name 
  });
});

// Channel deleted - clean up private channel references
client.on(Events.ChannelDelete, async (channel) => {
  if (channel.type !== ChannelType.GuildText) return;

  try {
    // Ensure database is connected
    await ensureConnected();
    
    // Check if this was someone's private channel
    const user = await DiscordUser.findOne({ privateChannelId: channel.id });
    if (user) {
      user.privateChannelId = undefined;
      await user.save();
      logger.info('Cleaned up deleted private channel reference', {
        userId: user.discordId,
        channelId: channel.id
      });
    }
  } catch (error) {
    logger.error('Error cleaning up deleted channel', { error: (error as Error).message });
  }
});

// Guild member leave - optionally clean up their private channel
client.on(Events.GuildMemberRemove, async (member) => {
  try {
    // Ensure database is connected
    await ensureConnected();
    
    const user = await DiscordUser.findOne({ discordId: member.id });
    if (user?.privateChannelId) {
      // Delete their private channel in this guild
      const channel = member.guild.channels.cache.get(user.privateChannelId);
      if (channel) {
        await channel.delete('User left the server');
        user.privateChannelId = undefined;
        await user.save();
        logger.info('Deleted private channel for departed member', {
          userId: member.id,
          channelId: user.privateChannelId
        });
      }
    }
  } catch (error) {
    logger.error('Error handling member leave', { error: (error as Error).message });
  }
});

// Handle direct messages
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;

  // Handle DMs
  if (message.channel.type === ChannelType.DM) {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('👋 Hello!')
      .setDescription('I work best in servers! Use my slash commands to generate amazing AI content.')
      .addFields(
        { name: '🖼️ Images', value: '`/imagine`', inline: true },
        { name: '🎬 Videos', value: '`/video`', inline: true },
        { name: '🎵 Music', value: '`/music`', inline: true },
        { name: '📦 3D Models', value: '`/3d`', inline: true }
      )
      .setFooter({ text: 'Add me to your server to get started!' });

    await message.reply({ embeds: [embed] });
  }
});

// Error handling
client.on(Events.Error, (error) => {
  logger.error('Discord client error', { error: error.message });
});

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection', { error: (error as Error).message });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down...');
  client.destroy();
  process.exit(0);
});

// Login
logger.info('🚀 Starting SeisoAI Discord Bot...');
client.login(config.discord.token);

