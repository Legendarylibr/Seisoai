/**
 * /imagine command - Image generation
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  TextChannel,
  ThreadChannel,
  AttachmentBuilder,
  GuildMember
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import DiscordUser from '../database/models/DiscordUser.js';
import { generateImage, uploadToFal } from '../services/fal.js';
import { getOrCreatePrivateChannel, createGenerationThread, sendGenerationResult } from '../services/channels.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('imagine')
  .setDescription('Generate AI images from text or edit existing images')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('What you want to create (e.g., "a sunset over mountains")')
      .setRequired(true)
      .setMaxLength(500)
  )
  .addAttachmentOption(option =>
    option
      .setName('image')
      .setDescription('Optional: Image to edit or use as reference')
      .setRequired(false)
  )
  .addStringOption(option =>
    option
      .setName('model')
      .setDescription('Which AI model to use (auto-selected if not specified)')
      .setRequired(false)
      .addChoices(
        { name: '⚡ FLUX - Fast & balanced', value: 'flux' },
        { name: '✨ FLUX 2 - Best quality & text', value: 'flux-2' },
        { name: '🍌 Nano Banana - Premium creative', value: 'nano-banana-pro' },
        { name: '🎨 Qwen - Extract layers from image', value: 'qwen-image-layered' }
      )
  )
  .addStringOption(option =>
    option
      .setName('style')
      .setDescription('Visual style preset')
      .setRequired(false)
      .addChoices(
        { name: '🎨 Artistic', value: 'artistic' },
        { name: '📷 Photorealistic', value: 'photorealistic' },
        { name: '🎭 Anime', value: 'anime' },
        { name: '🖼️ Digital Art', value: 'digital-art' },
        { name: '🌅 Cinematic', value: 'cinematic' },
        { name: '✏️ Sketch', value: 'sketch' },
        { name: '🎮 3D Render', value: '3d-render' },
        { name: '🌸 Fantasy', value: 'fantasy' }
      )
  )
  .addStringOption(option =>
    option
      .setName('aspect')
      .setDescription('Image shape')
      .setRequired(false)
      .addChoices(
        { name: '🖥️ Wide (16:9)', value: '16:9' },
        { name: '📱 Tall (9:16)', value: '9:16' },
        { name: '⬜ Square (1:1)', value: '1:1' },
        { name: '📺 Standard (4:3)', value: '4:3' }
      )
  )
  .addIntegerOption(option =>
    option
      .setName('count')
      .setDescription('How many images to generate (1-4)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(4)
  );

// Calculate credits based on model
function calculateImageCredits(model: string, count: number): number {
  const creditsPerImage: Record<string, number> = {
    'flux': 0.6,
    'flux-multi': 0.6,
    'flux-2': 0.3,
    'nano-banana-pro': 1.25,
    'qwen-image-layered': 0.3
  };
  
  const baseCredits = creditsPerImage[model] || 0.6;
  return Math.ceil(baseCredits * count * 10) / 10; // Round to 1 decimal place
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const prompt = interaction.options.getString('prompt', true);
    const style = interaction.options.getString('style') || '';
    const aspect = interaction.options.getString('aspect') || '16:9';
    const userModel = interaction.options.getString('model') as 'flux' | 'flux-2' | 'nano-banana-pro' | 'qwen-image-layered' | null;
    const image = interaction.options.getAttachment('image');
    const count = interaction.options.getInteger('count') || 1;

    // Get or create user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    // Get or create private channel for the user
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

    // Smart model selection: auto-detect based on context
    let finalModel: 'flux' | 'flux-multi' | 'flux-2' | 'nano-banana-pro' | 'qwen-image-layered';
    
    if (userModel) {
      // User explicitly chose a model
      finalModel = userModel;
    } else if (image) {
      // Has image - default to flux for editing
      finalModel = 'flux';
    } else {
      // No image - default to flux for text-to-image
      finalModel = 'flux';
    }
    
    // Validate model selection for layer extraction
    if (finalModel === 'qwen-image-layered' && !image) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('⚠️ Image Required')
        .setDescription('Qwen Layers requires an image to extract layers from. Please attach an image.');

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Calculate credits based on model
    const creditsRequired = calculateImageCredits(finalModel, count);

    // Check credits
    if (discordUser.credits < creditsRequired) {
      const embed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Insufficient Credits')
        .setDescription(`You need **${creditsRequired}** credits but only have **${discordUser.credits}**.`)
        .addFields(
          { name: '💡 Get More Credits', value: `Use \`/link\` to connect your SeisoAI account or visit [our website](${config.urls.website}) to purchase credits.` }
        );

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Build enhanced prompt with style
    const stylePrompts: Record<string, string> = {
      'artistic': 'artistic style, masterful brushwork, vibrant colors,',
      'photorealistic': 'photorealistic, 8k resolution, detailed, professional photography,',
      'anime': 'anime style, vibrant colors, detailed anime art,',
      'digital-art': 'digital art, trending on artstation, highly detailed,',
      'cinematic': 'cinematic lighting, movie still, dramatic atmosphere,',
      'sketch': 'pencil sketch, detailed linework, artistic sketch,',
      '3d-render': '3D render, octane render, volumetric lighting, highly detailed,',
      'fantasy': 'fantasy art, magical atmosphere, ethereal, mystical,'
    };

    const enhancedPrompt = style 
      ? `${stylePrompts[style] || ''} ${prompt}`
      : prompt;

    // Upload image if provided
    let imageUrl: string | undefined;
    let imageUrls: string[] | undefined;
    
    if (image) {
      try {
        const response = await fetch(image.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        const uploadedUrl = await uploadToFal(buffer, image.contentType || 'image/png', image.name || 'image.png');
        imageUrl = uploadedUrl;
      } catch (error) {
        logger.warn('Failed to upload image', { error: (error as Error).message });
        throw new Error('Failed to upload image');
      }
    }

    // Notify user about generation
    const isPrivate = privateChannel !== null;
    if (isPrivate) {
      const redirectEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🔒 Generating in Private Channel')
        .setDescription(`Your image is being generated in your private channel!`)
        .addFields({
          name: '📍 Go to your channel',
          value: `<#${privateChannel.id}>`
        });
      await interaction.editReply({ embeds: [redirectEmbed] });
    } else {
      const startEmbed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✨ Generation Started')
        .setDescription('Your image is being generated...');
      await interaction.editReply({ embeds: [startEmbed] });
    }

    // Show processing message
    const processingEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('⚙️ Generating Image...')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .addFields(
        { name: 'Style', value: style || 'None', inline: true },
        { name: 'Aspect', value: aspect, inline: true },
        { name: 'Model', value: finalModel, inline: true },
        { name: 'Count', value: `${count}`, inline: true },
        { name: 'Image', value: image ? 'Yes' : 'No', inline: true }
      )
      .setFooter({ text: 'This may take 10-30 seconds...' });

    const processingMessage = await outputChannel.send({ embeds: [processingEmbed] });

    // Generate images
    const result = await generateImage({
      prompt: enhancedPrompt,
      model: finalModel as 'flux' | 'flux-multi' | 'flux-2' | 'nano-banana-pro' | 'qwen-image-layered',
      aspectRatio: aspect,
      numImages: count,
      imageUrl,
      imageUrls
    });

    if (!result.images || result.images.length === 0) {
      throw new Error('No images generated');
    }

    // Deduct credits
    discordUser.credits -= creditsRequired;
    discordUser.totalCreditsSpent += creditsRequired;
    
    // Add to generation history
    const generationId = uuidv4();
    discordUser.generations.push({
      id: generationId,
      type: 'image',
      prompt: prompt,
      status: 'completed',
      resultUrl: result.images[0],
      creditsUsed: creditsRequired,
      messageId: interaction.id,
      timestamp: new Date()
    });
    discordUser.lastGeneration = new Date();

    // Keep only last 50 generations
    if (discordUser.generations.length > 50) {
      discordUser.generations = discordUser.generations.slice(-50);
    }

    await discordUser.save();

    // Create result embed
    const resultEmbed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('✨ Image Generated!')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .setImage(result.images[0])
      .addFields(
        { name: 'Credits Used', value: `${creditsRequired}`, inline: true },
        { name: 'Remaining', value: `${discordUser.credits}`, inline: true },
        { name: 'Model', value: finalModel, inline: true }
      )
      .setFooter({ text: `Generation ID: ${generationId}` })
      .setTimestamp();

    // If multiple images, create embeds for each
    const embeds = [resultEmbed];
    
    if (result.images.length > 1) {
      for (let i = 1; i < result.images.length; i++) {
        const additionalEmbed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle(`Image ${i + 1}/${result.images.length}`)
          .setImage(result.images[i]);
        embeds.push(additionalEmbed);
      }
    }

    // Update the processing message in private channel with results
    await processingMessage.edit({ embeds });

    logger.info('Image generated via Discord', {
      userId: interaction.user.id,
      prompt: prompt.substring(0, 50),
      model: finalModel,
      count,
      creditsUsed: creditsRequired,
      hasImage: !!image
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Image generation error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Generation Failed')
      .setDescription(`Sorry, something went wrong: ${err.message}`)
      .addFields({
        name: '💡 What to do',
        value: 'Try again with a different prompt or contact support if the issue persists.'
      });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

