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
import { connectDatabase } from './database/index.js';
import commands, { handleLinkModal, handleHelpSelect } from './commands/index.js';
import { getOrCreatePrivateChannel } from './services/channels.js';
import DiscordUser from './database/models/DiscordUser.js';
import logger from './utils/logger.js';

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

    try {
      logger.debug(`Command executed: /${interaction.commandName}`, {
        userId: interaction.user.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId
      });

      await command.execute(interaction);

    } catch (error) {
      const err = error as Error;
      logger.error(`Command error: /${interaction.commandName}`, {
        error: err.message,
        userId: interaction.user.id
      });

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

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('link_')) {
      await handleLinkModal(interaction);
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

// Guild member join - offer private channel
client.on(Events.GuildMemberAdd, async (member) => {
  try {
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

