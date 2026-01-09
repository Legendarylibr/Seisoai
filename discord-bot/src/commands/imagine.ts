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
  AttachmentBuilder
} from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import DiscordUser from '../database/models/DiscordUser.js';
import { generateImage, uploadToFal } from '../services/fal.js';
import { createGenerationThread, sendGenerationResult } from '../services/channels.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('imagine')
  .setDescription('Generate an AI image from your prompt')
  .addStringOption(option =>
    option
      .setName('prompt')
      .setDescription('Describe the image you want to create')
      .setRequired(true)
      .setMaxLength(500)
  )
  .addStringOption(option =>
    option
      .setName('style')
      .setDescription('Style preset for the image')
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
      .setDescription('Aspect ratio of the image')
      .setRequired(false)
      .addChoices(
        { name: '🖥️ Landscape (16:9)', value: '16:9' },
        { name: '📱 Portrait (9:16)', value: '9:16' },
        { name: '⬜ Square (1:1)', value: '1:1' },
        { name: '📺 Wide (4:3)', value: '4:3' },
        { name: '📸 Tall (3:4)', value: '3:4' }
      )
  )
  .addStringOption(option =>
    option
      .setName('model')
      .setDescription('AI model to use')
      .setRequired(false)
      .addChoices(
        { name: '⚡ FLUX Kontext (Fast)', value: 'flux' },
        { name: '✨ FLUX 2 (High Quality)', value: 'flux-2' },
        { name: '🍌 Nano Banana Pro (Creative)', value: 'nano-banana-pro' }
      )
  )
  .addAttachmentOption(option =>
    option
      .setName('reference')
      .setDescription('Reference image for style transfer or editing')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option
      .setName('count')
      .setDescription('Number of images to generate (1-4)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(4)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  try {
    const prompt = interaction.options.getString('prompt', true);
    const style = interaction.options.getString('style') || '';
    const aspect = interaction.options.getString('aspect') || '16:9';
    const model = interaction.options.getString('model') as 'flux' | 'flux-2' | 'nano-banana-pro' || 'flux';
    const reference = interaction.options.getAttachment('reference');
    const count = interaction.options.getInteger('count') || 1;

    // Get or create user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    // Calculate credits
    const creditsRequired = count * config.credits.image;

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

    // Upload reference image if provided
    let imageUrl: string | undefined;
    if (reference) {
      try {
        const response = await fetch(reference.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        imageUrl = await uploadToFal(buffer, reference.contentType || 'image/png', reference.name || 'reference.png');
      } catch (error) {
        logger.warn('Failed to upload reference image', { error: (error as Error).message });
      }
    }

    // Show processing message
    const processingEmbed = new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('⚙️ Generating Image...')
      .setDescription(`**Prompt:** ${prompt.substring(0, 200)}${prompt.length > 200 ? '...' : ''}`)
      .addFields(
        { name: 'Style', value: style || 'None', inline: true },
        { name: 'Aspect', value: aspect, inline: true },
        { name: 'Model', value: model, inline: true },
        { name: 'Count', value: `${count}`, inline: true }
      )
      .setFooter({ text: 'This may take 10-30 seconds...' });

    await interaction.editReply({ embeds: [processingEmbed] });

    // Generate images
    const result = await generateImage({
      prompt: enhancedPrompt,
      model,
      aspectRatio: aspect,
      numImages: count,
      imageUrl
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
        { name: 'Model', value: model, inline: true }
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

    await interaction.editReply({ embeds });

    logger.info('Image generated via Discord', {
      userId: interaction.user.id,
      prompt: prompt.substring(0, 50),
      model,
      count,
      creditsUsed: creditsRequired
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

