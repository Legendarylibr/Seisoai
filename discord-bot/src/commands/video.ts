/**
 * /video command - Video generation using Veo 3.1
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import DiscordUser from '../database/models/DiscordUser.js';
import { generateVideo, pollForResult, uploadToFal } from '../services/fal.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

// Credit calculation based on duration and audio
function calculateVideoCredits(duration: string, hasAudio: boolean): number {
  const baseCredits: Record<string, number> = {
    '4s': 4,
    '6s': 6,
    '8s': 8
  };
  let credits = baseCredits[duration] || 8;
  if (hasAudio) credits += 2;
  return credits;
}

export const data = new SlashCommandBuilder()
  .setName('video')
  .setDescription('Generate an AI video from your prompt')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Describe the video you want to create')
      .setRequired(true)
      .setMaxLength(500)
  )
  .addStringOption(option =>
    option
      .setName('mode')
      .setDescription('Video generation mode')
      .setRequired(false)
      .addChoices(
        { name: '📝 Text to Video', value: 'text-to-video' },
        { name: '🖼️ Image to Video', value: 'image-to-video' },
        { name: '🎬 First & Last Frame', value: 'first-last-frame' }
      )
  )
  .addStringOption(option =>
    option
      .setName('duration')
      .setDescription('Video duration')
      .setRequired(false)
      .addChoices(
        { name: '⚡ 4 seconds', value: '4s' },
        { name: '⏱️ 6 seconds', value: '6s' },
        { name: '🎬 8 seconds', value: '8s' }
      )
  )
  .addStringOption(option =>
    option
      .setName('aspect')
      .setDescription('Aspect ratio')
      .setRequired(false)
      .addChoices(
        { name: '🖥️ Landscape (16:9)', value: '16:9' },
        { name: '📱 Portrait (9:16)', value: '9:16' }
      )
  )
  .addStringOption(option =>
    option
      .setName('resolution')
      .setDescription('Video resolution')
      .setRequired(false)
      .addChoices(
        { name: '📺 720p (Fast)', value: '720p' },
        { name: '🎬 1080p (Quality)', value: '1080p' }
      )
  )
  .addBooleanOption(option =>
    option
      .setName('audio')
      .setDescription('Generate audio (+2 credits)')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('first_frame')
      .setDescription('First frame image (for image-to-video or first-last-frame mode)')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('last_frame')
      .setDescription('Last frame image (for first-last-frame mode)')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const prompt = interaction.options.getString('prompt', true);
    const mode = (interaction.options.getString('mode') || 'text-to-video') as 'text-to-video' | 'image-to-video' | 'first-last-frame';
    const duration = (interaction.options.getString('duration') || '8s') as '4s' | '6s' | '8s';
    const aspect = interaction.options.getString('aspect') || '16:9';
    const resolution = (interaction.options.getString('resolution') || '720p') as '720p' | '1080p';
    const generateAudio = interaction.options.getBoolean('audio') ?? true;
    const firstFrameAttachment = interaction.options.getAttachment('first_frame');
    const lastFrameAttachment = interaction.options.getAttachment('last_frame');

    // Validate mode requirements
    if (mode === 'image-to-video' && !firstFrameAttachment) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ Missing First Frame')
        .setDescription('Image-to-video mode requires a first frame image. Please attach one using the `first_frame` option.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (mode === 'first-last-frame' && (!firstFrameAttachment || !lastFrameAttachment)) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ Missing Frames')
        .setDescription('First-last-frame mode requires both first and last frame images.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Get or create user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    // Calculate credits
    const creditsRequired = calculateVideoCredits(duration, generateAudio);

    // Check credits
    if (discordUser.credits < creditsRequired) {
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Insufficient Credits')
        .setDescription(`You need **${creditsRequired}** credits but only have **${discordUser.credits}**.`)
        .addFields(
          { name: 'Cost Breakdown', value: `Duration: ${duration} (${creditsRequired - (generateAudio ? 2 : 0)} credits)\nAudio: ${generateAudio ? 'Yes (+2 credits)' : 'No'}` },
          { name: '💡 Get More Credits', value: `Use \`/link\` to connect your SeisoAI account or visit [our website](${config.urls.website}).` }
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Upload frames if provided
    let firstFrameUrl: string | undefined;
    let lastFrameUrl: string | undefined;

    if (firstFrameAttachment) {
      try {
        const response = await fetch(firstFrameAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        firstFrameUrl = await uploadToFal(buffer, firstFrameAttachment.contentType || 'image/png', firstFrameAttachment.name || 'first-frame.png');
      } catch (error) {
        logger.warn('Failed to upload first frame', { error: (error as Error).message });
        throw new Error('Failed to upload first frame image');
      }
    }

    if (lastFrameAttachment) {
      try {
        const response = await fetch(lastFrameAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        lastFrameUrl = await uploadToFal(buffer, lastFrameAttachment.contentType || 'image/png', lastFrameAttachment.name || 'last-frame.png');
      } catch (error) {
        logger.warn('Failed to upload last frame', { error: (error as Error).message });
        throw new Error('Failed to upload last frame image');
      }
    }

    // Show processing message
    const processingEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('🎬 Generating Video...')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .addFields(
        { name: 'Mode', value: mode, inline: true },
        { name: 'Duration', value: duration, inline: true },
        { name: 'Resolution', value: resolution, inline: true },
        { name: 'Audio', value: generateAudio ? 'Yes' : 'No', inline: true },
        { name: 'Credits', value: `${creditsRequired}`, inline: true }
      )
      .setFooter({ text: 'Video generation takes 2-5 minutes. Please wait...' });

    await interaction.editReply({ embeds: [processingEmbed] });

    // Deduct credits upfront
    discordUser.credits -= creditsRequired;
    discordUser.totalCreditsSpent += creditsRequired;
    await discordUser.save();

    // Generate video
    const { requestId, modelPath } = await generateVideo({
      prompt,
      mode,
      duration,
      aspectRatio: aspect,
      resolution,
      generateAudio,
      firstFrameUrl,
      lastFrameUrl
    });

    // Poll for result with progress updates
    let lastUpdate = Date.now();
    const updateInterval = 30000; // Update every 30 seconds

    const result = await pollForResult<{
      video?: { url?: string; content_type?: string };
      data?: { video?: { url?: string } };
      output?: { video?: { url?: string } };
    }>(requestId, modelPath, {
      maxWaitTime: 10 * 60 * 1000, // 10 minutes
      pollInterval: 3000,
      onProgress: async (status, elapsed) => {
        if (Date.now() - lastUpdate > updateInterval) {
          lastUpdate = Date.now();
          const progressEmbed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('🎬 Generating Video...')
            .setDescription(`**Status:** ${status}\n**Elapsed:** ${Math.round(elapsed / 1000)}s`)
            .setFooter({ text: 'Almost there! Please wait...' });
          
          try {
            await interaction.editReply({ embeds: [progressEmbed] });
          } catch {
            // Ignore edit errors
          }
        }
      }
    });

    // Extract video URL
    const videoUrl = result.video?.url || result.data?.video?.url || result.output?.video?.url;

    if (!videoUrl) {
      // Refund credits
      discordUser.credits += creditsRequired;
      discordUser.totalCreditsSpent -= creditsRequired;
      await discordUser.save();
      throw new Error('No video URL in response');
    }

    // Save to history
    const generationId = uuidv4();
    discordUser.generations.push({
      id: generationId,
      type: 'video',
      prompt: prompt,
      status: 'completed',
      resultUrl: videoUrl,
      creditsUsed: creditsRequired,
      messageId: interaction.id,
      timestamp: new Date()
    });

    if (discordUser.generations.length > 50) {
      discordUser.generations = discordUser.generations.slice(-50);
    }
    await discordUser.save();

    // Send result
    const resultEmbed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('🎬 Video Generated!')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .addFields(
        { name: 'Duration', value: duration, inline: true },
        { name: 'Resolution', value: resolution, inline: true },
        { name: 'Audio', value: generateAudio ? 'Yes' : 'No', inline: true },
        { name: 'Credits Used', value: `${creditsRequired}`, inline: true },
        { name: 'Remaining', value: `${discordUser.credits}`, inline: true }
      )
      .setFooter({ text: `Generation ID: ${generationId}` })
      .setTimestamp();

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Download Video')
          .setStyle(ButtonStyle.Link)
          .setURL(videoUrl)
          .setEmoji('📥')
      );

    await interaction.editReply({ embeds: [resultEmbed], components: [row] });

    logger.info('Video generated via Discord', {
      userId: interaction.user.id,
      prompt: prompt.substring(0, 50),
      mode,
      duration,
      creditsUsed: creditsRequired
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Video generation error', { error: err.message, userId: interaction.user.id });

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

