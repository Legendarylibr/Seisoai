/**
 * /credits command - Check and manage credits
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import DiscordUser from '../database/models/DiscordUser.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('credits')
  .setDescription('Check your credit balance and usage');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Get or create user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    // Calculate generation stats
    const totalGenerations = discordUser.generations.length;
    const imageCount = discordUser.generations.filter((g: { type: string }) => g.type === 'image').length;
    const videoCount = discordUser.generations.filter((g: { type: string }) => g.type === 'video').length;
    const musicCount = discordUser.generations.filter((g: { type: string }) => g.type === 'music').length;
    const model3dCount = discordUser.generations.filter((g: { type: string }) => g.type === '3d').length;

    // Recent generations (last 5)
    const typeEmojiMap: Record<string, string> = { image: '🖼️', video: '🎬', music: '🎵', '3d': '📦' };
    const recentGens = discordUser.generations
      .slice(-5)
      .reverse()
      .map((g: { type: string; prompt: string; creditsUsed: number; timestamp: Date }) => {
        const typeEmoji = typeEmojiMap[g.type] || '📦';
        const date = new Date(g.timestamp).toLocaleDateString();
        return `${typeEmoji} ${g.prompt.substring(0, 30)}... (-${g.creditsUsed}) • ${date}`;
      })
      .join('\n') || 'No recent generations';

    // Credit costs reference
    const creditCosts = `
🖼️ Image: 1-4 credits
🎬 Video: 4-10 credits
🎵 Music: 1-4 credits
📦 3D Model: 2-3 credits
    `.trim();

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('💰 Credit Balance')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { 
          name: '💵 Current Balance', 
          value: `**${discordUser.credits}** credits`, 
          inline: true 
        },
        { 
          name: '📊 Total Earned', 
          value: `${discordUser.totalCreditsEarned}`, 
          inline: true 
        },
        { 
          name: '📈 Total Spent', 
          value: `${discordUser.totalCreditsSpent}`, 
          inline: true 
        },
        {
          name: '📦 Generation Stats',
          value: `Total: ${totalGenerations}\n🖼️ ${imageCount} | 🎬 ${videoCount} | 🎵 ${musicCount} | 📦 ${model3dCount}`,
          inline: false
        },
        {
          name: '🕒 Recent Generations',
          value: recentGens,
          inline: false
        },
        {
          name: '💡 Credit Costs',
          value: creditCosts,
          inline: false
        }
      )
      .setFooter({ text: 'Use /link to connect your SeisoAI account for more credits!' })
      .setTimestamp();

    // Account status
    if (discordUser.seisoUserId || discordUser.email || discordUser.walletAddress) {
      embed.addFields({
        name: '🔗 Account Status',
        value: `✅ Linked to SeisoAI${discordUser.email ? `\n📧 ${discordUser.email}` : ''}${discordUser.walletAddress ? `\n💳 ${discordUser.walletAddress.substring(0, 8)}...` : ''}`,
        inline: false
      });
    } else {
      embed.addFields({
        name: '🔗 Account Status',
        value: '❌ Not linked\nUse `/link` to connect your SeisoAI account',
        inline: false
      });
    }

    // Action buttons
    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Buy Credits')
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.urls.website}?tab=generate`)
          .setEmoji('💳'),
        new ButtonBuilder()
          .setLabel('Visit Website')
          .setStyle(ButtonStyle.Link)
          .setURL(config.urls.website)
          .setEmoji('🌐')
      );

    await interaction.editReply({ embeds: [embed], components: [row] });

    logger.debug('Credits command executed', {
      userId: interaction.user.id,
      credits: discordUser.credits
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Credits command error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Error')
      .setDescription('Failed to retrieve credit information. Please try again.');

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

