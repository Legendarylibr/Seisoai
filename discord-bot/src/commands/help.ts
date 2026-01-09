/**
 * /help command - Show bot help and documentation
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Get help with SeisoAI bot commands')
  .addStringOption(option =>
    option
      .setName('command')
      .setDescription('Get detailed help for a specific command')
      .setRequired(false)
      .addChoices(
        { name: '🖼️ imagine - Generate images', value: 'imagine' },
        { name: '🎬 video - Generate videos', value: 'video' },
        { name: '🎵 music - Generate music', value: 'music' },
        { name: '📦 3d - Generate 3D models', value: '3d' },
        { name: '💰 credits - Check balance', value: 'credits' },
        { name: '🔗 link - Link account', value: 'link' }
      )
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const specificCommand = interaction.options.getString('command');

  if (specificCommand) {
    await showCommandHelp(interaction, specificCommand);
    return;
  }

  await showGeneralHelp(interaction);
}

async function showGeneralHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('🤖 SeisoAI Bot Help')
    .setDescription('Welcome to SeisoAI! Generate stunning AI images, videos, music, and 3D models right from Discord.')
    .addFields(
      {
        name: '🖼️ /imagine',
        value: 'Generate AI images from text prompts\n`/imagine prompt:a beautiful sunset over mountains`',
        inline: false
      },
      {
        name: '🎬 /video',
        value: 'Create AI videos (4-8 seconds)\n`/video prompt:a cat playing piano`',
        inline: false
      },
      {
        name: '🎵 /music',
        value: 'Generate AI music (10-180 seconds)\n`/music prompt:upbeat electronic dance track`',
        inline: false
      },
      {
        name: '📦 /3d',
        value: 'Create 3D models from images\n`/3d image:[attachment]`',
        inline: false
      },
      {
        name: '💰 /credits',
        value: 'Check your credit balance and usage statistics',
        inline: true
      },
      {
        name: '🔗 /link',
        value: 'Link your SeisoAI account to sync credits',
        inline: true
      }
    )
    .addFields(
      {
        name: '📊 Credit Costs',
        value: '```\n🖼️ Image:  1-4 credits\n🎬 Video:  4-10 credits\n🎵 Music:  1-4 credits\n📦 3D:     2-3 credits\n```',
        inline: false
      }
    )
    .setFooter({ text: 'Use /help command:[name] for detailed help' })
    .setTimestamp();

  const row = new ActionRowBuilder<StringSelectMenuBuilder>()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_select')
        .setPlaceholder('Select a command for detailed help')
        .addOptions(
          { label: '🖼️ Image Generation', value: 'imagine', description: 'Learn about /imagine command' },
          { label: '🎬 Video Generation', value: 'video', description: 'Learn about /video command' },
          { label: '🎵 Music Generation', value: 'music', description: 'Learn about /music command' },
          { label: '📦 3D Model Generation', value: '3d', description: 'Learn about /3d command' },
          { label: '💰 Credits', value: 'credits', description: 'Learn about credits' },
          { label: '🔗 Account Linking', value: 'link', description: 'Learn about account linking' }
        )
    );

  await interaction.reply({ embeds: [embed], components: [row] });
}

async function showCommandHelp(interaction: ChatInputCommandInteraction | StringSelectMenuInteraction, command: string): Promise<void> {
  const embeds: Record<string, EmbedBuilder> = {
    imagine: new EmbedBuilder()
      .setColor(0x3498DB)
      .setTitle('🖼️ /imagine - Image Generation')
      .setDescription('Generate stunning AI images from your text descriptions.')
      .addFields(
        {
          name: '📝 Basic Usage',
          value: '`/imagine prompt:your description here`',
          inline: false
        },
        {
          name: '🎨 Options',
          value: [
            '**prompt** (required) - Describe your image',
            '**style** - Preset style (artistic, photorealistic, anime, etc.)',
            '**aspect** - Aspect ratio (16:9, 9:16, 1:1, etc.)',
            '**model** - AI model (flux, flux-2, nano-banana-pro)',
            '**reference** - Reference image for style transfer',
            '**count** - Number of images (1-4)'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 Tips',
          value: [
            '• Be specific and descriptive in your prompts',
            '• Use style presets for consistent results',
            '• FLUX-2 is slower but higher quality',
            '• Reference images help maintain style consistency'
          ].join('\n'),
          inline: false
        },
        {
          name: '💰 Cost',
          value: '1 credit per image',
          inline: true
        }
      ),

    video: new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('🎬 /video - Video Generation')
      .setDescription('Create AI-generated videos using Veo 3.1.')
      .addFields(
        {
          name: '📝 Basic Usage',
          value: '`/video prompt:describe your video`',
          inline: false
        },
        {
          name: '🎥 Modes',
          value: [
            '**text-to-video** - Generate from text only',
            '**image-to-video** - Animate a single image',
            '**first-last-frame** - Control start and end frames'
          ].join('\n'),
          inline: false
        },
        {
          name: '⚙️ Options',
          value: [
            '**duration** - 4s, 6s, or 8s',
            '**aspect** - 16:9 or 9:16',
            '**resolution** - 720p or 1080p',
            '**audio** - Generate with audio (+2 credits)',
            '**first_frame** - Starting frame image',
            '**last_frame** - Ending frame image'
          ].join('\n'),
          inline: false
        },
        {
          name: '💰 Cost',
          value: '4-10 credits (varies by duration and audio)',
          inline: true
        }
      ),

    music: new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle('🎵 /music - Music Generation')
      .setDescription('Generate original AI music using CassetteAI.')
      .addFields(
        {
          name: '📝 Basic Usage',
          value: '`/music prompt:describe your music`',
          inline: false
        },
        {
          name: '🎵 Options',
          value: [
            '**prompt** (required) - Describe the music',
            '**genre** - Music genre preset',
            '**duration** - Length in seconds (10-180)',
            '**mood** - Mood preset (happy, sad, energetic, etc.)'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 Tips',
          value: [
            '• Describe instruments, tempo, and atmosphere',
            '• Combine genre and mood for better results',
            '• Shorter durations generate faster'
          ].join('\n'),
          inline: false
        },
        {
          name: '💰 Cost',
          value: '1-4 credits based on duration',
          inline: true
        }
      ),

    '3d': new EmbedBuilder()
      .setColor(0xE67E22)
      .setTitle('📦 /3d - 3D Model Generation')
      .setDescription('Create 3D models from images using Hunyuan3D V3.')
      .addFields(
        {
          name: '📝 Basic Usage',
          value: '`/3d image:[attach your image]`',
          inline: false
        },
        {
          name: '⚙️ Options',
          value: [
            '**image** (required) - Front view of the object',
            '**type** - Normal, LowPoly, or Geometry',
            '**faces** - Polygon count (40K-1.5M)',
            '**pbr** - Enable realistic materials',
            '**back_image** - Optional back view',
            '**left_image** - Optional left view',
            '**right_image** - Optional right view'
          ].join('\n'),
          inline: false
        },
        {
          name: '💡 Tips',
          value: [
            '• Use clear, well-lit front view images',
            '• Multiple views improve quality significantly',
            '• LowPoly is great for games',
            '• Models expire after 24 hours - download promptly!'
          ].join('\n'),
          inline: false
        },
        {
          name: '💰 Cost',
          value: '2-3 credits (Geometry is cheaper)',
          inline: true
        }
      ),

    credits: new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('💰 Credits System')
      .setDescription('Credits are used for all generations.')
      .addFields(
        {
          name: '📊 Credit Costs',
          value: '```\n🖼️ Image:  1 credit each\n🎬 Video:  4-10 credits\n🎵 Music:  1-4 credits\n📦 3D:     2-3 credits\n```',
          inline: false
        },
        {
          name: '🎁 Getting Credits',
          value: [
            '• Link your SeisoAI account to sync credits',
            '• Purchase credits on the website',
            '• Subscription plans include monthly credits'
          ].join('\n'),
          inline: false
        },
        {
          name: '📈 Check Balance',
          value: 'Use `/credits` to see your balance and history',
          inline: false
        }
      ),

    link: new EmbedBuilder()
      .setColor(0x1ABC9C)
      .setTitle('🔗 Account Linking')
      .setDescription('Link your Discord to your SeisoAI account to sync credits.')
      .addFields(
        {
          name: '📝 Commands',
          value: [
            '`/link email` - Link with your SeisoAI email',
            '`/link wallet` - Link with your wallet address',
            '`/link status` - Check your link status'
          ].join('\n'),
          inline: false
        },
        {
          name: '✨ Benefits',
          value: [
            '• Sync credits between Discord and website',
            '• Access your gallery from both platforms',
            '• Unified generation history'
          ].join('\n'),
          inline: false
        }
      )
  };

  const embed = embeds[command] || embeds.imagine;
  embed.setFooter({ text: `SeisoAI Bot • ${config.urls.website}` });
  embed.setTimestamp();

  if (interaction.isStringSelectMenu()) {
    await interaction.update({ embeds: [embed] });
  } else {
    await interaction.reply({ embeds: [embed] });
  }
}

/**
 * Handle help select menu interaction
 */
export async function handleHelpSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const command = interaction.values[0];
  await showCommandHelp(interaction, command);
}

