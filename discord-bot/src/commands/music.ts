/**
 * /music command - Music generation using CassetteAI
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  GuildMember,
  Message,
  TextChannel
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import DiscordUser from '../database/models/DiscordUser.js';
import { generateMusic, pollForResult } from '../services/fal.js';
import { getOrCreatePrivateChannel } from '../services/channels.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// Credit calculation based on duration
function calculateMusicCredits(duration: number): number {
  if (duration <= 30) return 1;
  if (duration <= 60) return 2;
  if (duration <= 120) return 3;
  return 4;
}

export const data = new SlashCommandBuilder()
  .setName('music')
  .setDescription('Generate AI music from your prompt')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Describe the music you want to create')
      .setRequired(true)
      .setMaxLength(500)
  )
  .addStringOption(option =>
    option
      .setName('genre')
      .setDescription('Music genre')
      .setRequired(false)
      .addChoices(
        { name: '🎸 Rock', value: 'rock' },
        { name: '🎹 Electronic', value: 'electronic' },
        { name: '🎷 Jazz', value: 'jazz' },
        { name: '🎻 Classical', value: 'classical' },
        { name: '🎤 Hip Hop', value: 'hip-hop' },
        { name: '🎺 Pop', value: 'pop' },
        { name: '🥁 Lo-Fi', value: 'lo-fi' },
        { name: '🎸 Ambient', value: 'ambient' },
        { name: '🎵 Cinematic', value: 'cinematic' },
        { name: '🎶 Chill', value: 'chill' }
      )
  )
  .addIntegerOption(option =>
    option
      .setName('duration')
      .setDescription('Duration in seconds (10-180)')
      .setRequired(false)
      .setMinValue(10)
      .setMaxValue(180)
  )
  .addStringOption(option =>
    option
      .setName('mood')
      .setDescription('Mood of the music')
      .setRequired(false)
      .addChoices(
        { name: '😊 Happy', value: 'happy uplifting' },
        { name: '😢 Sad', value: 'melancholic sad' },
        { name: '⚡ Energetic', value: 'energetic powerful' },
        { name: '😌 Relaxing', value: 'calm relaxing peaceful' },
        { name: '🎭 Dramatic', value: 'dramatic intense' },
        { name: '🌙 Dreamy', value: 'dreamy ethereal' },
        { name: '💪 Motivational', value: 'motivational inspiring' },
        { name: '😎 Cool', value: 'cool smooth' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const prompt = interaction.options.getString('prompt', true);
    const genre = interaction.options.getString('genre') || '';
    const duration = interaction.options.getInteger('duration') || 30;
    const mood = interaction.options.getString('mood') || '';

    // Get or create private channel
    if (!interaction.guild || !interaction.member) {
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Server Required')
        .setDescription('This command must be used in a server, not in DMs.');
      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Try to get private channel, fallback to current channel
    const privateChannel = await getOrCreatePrivateChannel(
      interaction.client,
      interaction.guild,
      interaction.member as GuildMember
    );
    
    // Use private channel if available, otherwise use current channel
    const outputChannel = privateChannel || (interaction.channel as TextChannel);

    // Get or create user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    // Calculate credits
    const creditsRequired = calculateMusicCredits(duration);

    // Check credits
    if (discordUser.credits < creditsRequired) {
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Insufficient Credits')
        .setDescription(`You need **${creditsRequired}** credits but only have **${discordUser.credits}**.`)
        .addFields(
          { name: 'Credit Costs', value: '≤30s: 1 credit\n≤60s: 2 credits\n≤120s: 3 credits\n≤180s: 4 credits' },
          { name: '💡 Get More Credits', value: `Use \`/link\` to connect your SeisoAI account or visit [our website](${config.urls.website}).` }
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Build enhanced prompt
    const promptParts = [prompt];
    if (genre) promptParts.push(`${genre} style`);
    if (mood) promptParts.push(mood);
    const enhancedPrompt = promptParts.join(', ');

    // Notify user about generation
    const isPrivate = privateChannel !== null;
    if (isPrivate) {
      const redirectEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔒 Generating in Private Channel')
        .setDescription(`Your music is being generated in your private channel!`)
        .addFields({
          name: '📍 Go to your channel',
          value: `<#${privateChannel.id}>`
        });
      await interaction.editReply({ embeds: [redirectEmbed] });
    } else {
      const startEmbed = new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('🎵 Generation Started')
        .setDescription('Your music is being generated...');
      await interaction.editReply({ embeds: [startEmbed] });
    }

    // Show processing message
    const processingEmbed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🎵 Generating Music...')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .addFields(
        { name: 'Genre', value: genre || 'Auto', inline: true },
        { name: 'Mood', value: mood || 'Auto', inline: true },
        { name: 'Duration', value: `${duration}s`, inline: true },
        { name: 'Credits', value: `${creditsRequired}`, inline: true }
      )
      .setFooter({ text: 'Music generation takes 10-60 seconds...' });

    const processingMessage: Message = await outputChannel.send({ embeds: [processingEmbed] });

    // Deduct credits upfront
    discordUser.credits -= creditsRequired;
    discordUser.totalCreditsSpent += creditsRequired;
    await discordUser.save();

    // Generate music
    const { requestId, modelPath } = await generateMusic({
      prompt: enhancedPrompt,
      duration,
      genre
    });

    // Poll for result
    const result = await pollForResult<{
      audio_file?: { url?: string; content_type?: string; file_name?: string };
    }>(requestId, modelPath, {
      maxWaitTime: 2 * 60 * 1000, // 2 minutes
      pollInterval: 1000 // Fast polling for music
    });

    // Extract audio URL
    const audioUrl = result.audio_file?.url;

    if (!audioUrl) {
      // Refund credits
      discordUser.credits += creditsRequired;
      discordUser.totalCreditsSpent -= creditsRequired;
      await discordUser.save();
      throw new Error('No audio URL in response');
    }

    // Save to history
    const generationId = uuidv4();
    discordUser.generations.push({
      id: generationId,
      type: 'music',
      prompt: prompt,
      status: 'completed',
      resultUrl: audioUrl,
      creditsUsed: creditsRequired,
      messageId: interaction.id,
      timestamp: new Date()
    });
    discordUser.lastGeneration = new Date();

    if (discordUser.generations.length > 50) {
      discordUser.generations = discordUser.generations.slice(-50);
    }
    await discordUser.save();

    // Send result
    const resultEmbed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🎵 Music Generated!')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .addFields(
        { name: 'Genre', value: genre || 'Auto', inline: true },
        { name: 'Duration', value: `${duration}s`, inline: true },
        { name: 'Credits Used', value: `${creditsRequired}`, inline: true },
        { name: 'Remaining', value: `${discordUser.credits}`, inline: true }
      )
      .setFooter({ text: `Generation ID: ${generationId}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Download Audio')
          .setStyle(ButtonStyle.Link)
          .setURL(audioUrl)
          .setEmoji('🎵')
      );

    await processingMessage.edit({ embeds: [resultEmbed], components: [row] });

    logger.info('Music generated via Discord', {
      userId: interaction.user.id,
      prompt: prompt.substring(0, 50),
      genre,
      duration,
      creditsUsed: creditsRequired
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Music generation error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Generation Failed')
      .setDescription(`Sorry, something went wrong: ${err.message}`)
      .addFields({
        name: '💡 What to do',
        value: 'Try again with a different prompt. If credits were deducted, they will be refunded automatically.'
      });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

