/**
 * /3d command - 3D model generation using Hunyuan3D V3
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
import { generate3DModel, pollForResult, uploadToFal } from '../services/fal.js';
import { getOrCreatePrivateChannel } from '../services/channels.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('3d')
  .setDescription('Generate a 3D model from an image')
  .addAttachmentOption(option =>
    option
      .setName('image')
      .setDescription('Front view image of the object')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('type')
      .setDescription('Type of 3D model to generate')
      .setRequired(false)
      .addChoices(
        { name: '✨ Normal (Textured)', value: 'Normal' },
        { name: '🎮 Low Poly (Game Ready)', value: 'LowPoly' },
        { name: '📐 Geometry Only', value: 'Geometry' }
      )
  )
  .addIntegerOption(option =>
    option
      .setName('faces')
      .setDescription('Number of faces (40000-1500000)')
      .setRequired(false)
      .setMinValue(40000)
      .setMaxValue(1500000)
  )
  .addBooleanOption(option =>
    option
      .setName('pbr')
      .setDescription('Enable PBR materials (realistic lighting)')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('back_image')
      .setDescription('Optional back view image for better quality')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('left_image')
      .setDescription('Optional left view image')
      .setRequired(false)
  )
  .addAttachmentOption(option =>
    option
      .setName('right_image')
      .setDescription('Optional right view image')
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const imageAttachment = interaction.options.getAttachment('image', true);
    const generateType = (interaction.options.getString('type') || 'Normal') as 'Normal' | 'LowPoly' | 'Geometry';
    const faceCount = interaction.options.getInteger('faces') || 500000;
    const enablePbr = interaction.options.getBoolean('pbr') ?? true;
    const backImageAttachment = interaction.options.getAttachment('back_image');
    const leftImageAttachment = interaction.options.getAttachment('left_image');
    const rightImageAttachment = interaction.options.getAttachment('right_image');

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

    // Calculate credits (Geometry mode is cheaper - no textures)
    const creditsRequired = generateType === 'Geometry' ? 2 : 3;

    // Check credits
    if (discordUser.credits < creditsRequired) {
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Insufficient Credits')
        .setDescription(`You need **${creditsRequired}** credits but only have **${discordUser.credits}**.`)
        .addFields(
          { name: 'Credit Costs', value: 'Normal/LowPoly: 3 credits\nGeometry: 2 credits' },
          { name: '💡 Get More Credits', value: `Use \`/link\` to connect your SeisoAI account or visit [our website](${config.urls.website}).` }
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Upload main image
    let inputImageUrl: string;
    try {
      const response = await fetch(imageAttachment.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      inputImageUrl = await uploadToFal(buffer, imageAttachment.contentType || 'image/png', imageAttachment.name || 'input.png');
    } catch (error) {
      throw new Error('Failed to upload input image');
    }

    // Upload optional images
    let backImageUrl: string | undefined;
    let leftImageUrl: string | undefined;
    let rightImageUrl: string | undefined;

    if (backImageAttachment) {
      try {
        const response = await fetch(backImageAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        backImageUrl = await uploadToFal(buffer, backImageAttachment.contentType || 'image/png', backImageAttachment.name || 'back.png');
      } catch (error) {
        logger.warn('Failed to upload back image', { error: (error as Error).message });
      }
    }

    if (leftImageAttachment) {
      try {
        const response = await fetch(leftImageAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        leftImageUrl = await uploadToFal(buffer, leftImageAttachment.contentType || 'image/png', leftImageAttachment.name || 'left.png');
      } catch (error) {
        logger.warn('Failed to upload left image', { error: (error as Error).message });
      }
    }

    if (rightImageAttachment) {
      try {
        const response = await fetch(rightImageAttachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        rightImageUrl = await uploadToFal(buffer, rightImageAttachment.contentType || 'image/png', rightImageAttachment.name || 'right.png');
      } catch (error) {
        logger.warn('Failed to upload right image', { error: (error as Error).message });
      }
    }

    // Notify user about generation
    const isPrivate = privateChannel !== null;
    if (isPrivate) {
      const redirectEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔒 Generating in Private Channel')
        .setDescription(`Your 3D model is being generated in your private channel!`)
        .addFields({
          name: '📍 Go to your channel',
          value: `<#${privateChannel.id}>`
        });
      await interaction.editReply({ embeds: [redirectEmbed] });
    } else {
      const startEmbed = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle('📦 Generation Started')
        .setDescription('Your 3D model is being generated...');
      await interaction.editReply({ embeds: [startEmbed] });
    }

    // Show processing message
    const processingEmbed = new EmbedBuilder()
      .setColor(0xE67E22)
      .setTitle('📦 Generating 3D Model...')
      .setThumbnail(imageAttachment.url)
      .addFields(
        { name: 'Type', value: generateType, inline: true },
        { name: 'Faces', value: faceCount.toLocaleString(), inline: true },
        { name: 'PBR', value: enablePbr && generateType !== 'Geometry' ? 'Yes' : 'No', inline: true },
        { name: 'Extra Views', value: `${[backImageUrl, leftImageUrl, rightImageUrl].filter(Boolean).length}`, inline: true },
        { name: 'Credits', value: `${creditsRequired}`, inline: true }
      )
      .setFooter({ text: '3D generation takes 3-7 minutes. Please wait...' });

    let processingMessage: Message = await outputChannel.send({ embeds: [processingEmbed] });

    // Deduct credits upfront
    discordUser.credits -= creditsRequired;
    discordUser.totalCreditsSpent += creditsRequired;
    await discordUser.save();

    // Generate 3D model
    const { requestId, modelPath } = await generate3DModel({
      inputImageUrl,
      backImageUrl,
      leftImageUrl,
      rightImageUrl,
      enablePbr: enablePbr && generateType !== 'Geometry',
      faceCount,
      generateType
    });

    // Poll for result with progress updates
    let lastUpdate = Date.now();
    const updateInterval = 60000; // Update every minute

    const result = await pollForResult<{
      model_glb?: { url?: string };
      glb?: { url?: string };
      thumbnail?: { url?: string };
      model_urls?: { 
        glb?: { url?: string }; 
        obj?: { url?: string }; 
        fbx?: { url?: string };
        usdz?: { url?: string };
      };
    }>(requestId, modelPath, {
      maxWaitTime: 7 * 60 * 1000, // 7 minutes
      pollInterval: 5000,
      onProgress: async (status, elapsed) => {
        if (Date.now() - lastUpdate > updateInterval) {
          lastUpdate = Date.now();
          const progressEmbed = new EmbedBuilder()
            .setColor(0xE67E22)
            .setTitle('📦 Generating 3D Model...')
            .setDescription(`**Status:** ${status}\n**Elapsed:** ${Math.round(elapsed / 1000)}s`)
            .setThumbnail(imageAttachment.url)
            .setFooter({ text: '3D generation can take up to 7 minutes...' });
          
          try {
            await processingMessage.edit({ embeds: [progressEmbed] });
          } catch {
            // Ignore edit errors
          }
        }
      }
    });

    // Extract model URL
    const glbUrl = result.model_glb?.url || result.glb?.url || result.model_urls?.glb?.url;
    const thumbnailUrl = result.thumbnail?.url;
    const objUrl = result.model_urls?.obj?.url;

    if (!glbUrl) {
      // Refund credits
      discordUser.credits += creditsRequired;
      discordUser.totalCreditsSpent -= creditsRequired;
      await discordUser.save();
      throw new Error('No 3D model URL in response');
    }

    // Save to history
    const generationId = uuidv4();
    discordUser.generations.push({
      id: generationId,
      type: '3d',
      prompt: `3D Model from image (${generateType})`,
      status: 'completed',
      resultUrl: glbUrl,
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
      .setColor(0xE67E22)
      .setTitle('📦 3D Model Generated!')
      .setDescription('Your 3D model is ready for download!')
      .addFields(
        { name: 'Type', value: generateType, inline: true },
        { name: 'Faces', value: faceCount.toLocaleString(), inline: true },
        { name: 'PBR', value: enablePbr && generateType !== 'Geometry' ? 'Yes' : 'No', inline: true },
        { name: 'Credits Used', value: `${creditsRequired}`, inline: true },
        { name: 'Remaining', value: `${discordUser.credits}`, inline: true }
      )
      .setFooter({ text: `Generation ID: ${generationId} • Model expires in 24 hours` })
      .setTimestamp();

    if (thumbnailUrl) {
      resultEmbed.setThumbnail(thumbnailUrl);
    } else {
      resultEmbed.setThumbnail(imageAttachment.url);
    }

    const buttons: ButtonBuilder[] = [
      new ButtonBuilder()
        .setLabel('Download GLB')
        .setStyle(ButtonStyle.Link)
        .setURL(glbUrl)
        .setEmoji('📦')
    ];

    if (objUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Download OBJ')
          .setStyle(ButtonStyle.Link)
          .setURL(objUrl)
          .setEmoji('🗂️')
      );
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    await processingMessage.edit({ embeds: [resultEmbed], components: [row] });

    logger.info('3D model generated via Discord', {
      userId: interaction.user.id,
      generateType,
      faceCount,
      creditsUsed: creditsRequired
    });

  } catch (error) {
    const err = error as Error;
    logger.error('3D generation error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Generation Failed')
      .setDescription(`Sorry, something went wrong: ${err.message}`)
      .addFields({
        name: '💡 What to do',
        value: 'Make sure your image clearly shows the object from the front. Try with a different image if the issue persists.'
      });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

