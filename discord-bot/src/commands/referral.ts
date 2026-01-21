/**
 * /referral command - View and share referral code
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
import crypto from 'crypto';

// Referral configuration
const REFERRAL_CODE_LENGTH = 8;
const REFERRER_CREDITS = 5;
const REFEREE_BONUS_CREDITS = 0;

/**
 * Generate a unique referral code
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const randomBytes = crypto.randomBytes(REFERRAL_CODE_LENGTH);
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

export const data = new SlashCommandBuilder()
  .setName('referral')
  .setDescription('View your referral code and invite friends')
  .addSubcommand(subcommand =>
    subcommand
      .setName('code')
      .setDescription('Get your referral code and share link')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stats')
      .setDescription('View your referral statistics')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('leaderboard')
      .setDescription('See top referrers')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const subcommand = interaction.options.getSubcommand();
    
    // Get or create user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    switch (subcommand) {
      case 'code':
        await handleCodeCommand(interaction, discordUser);
        break;
      case 'stats':
        await handleStatsCommand(interaction, discordUser);
        break;
      case 'leaderboard':
        await handleLeaderboardCommand(interaction);
        break;
      default:
        await handleCodeCommand(interaction, discordUser);
    }

  } catch (error) {
    const err = error as Error;
    logger.error('Referral command error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('Error')
      .setDescription('Failed to process referral command. Please try again.');

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle /referral code subcommand
 */
async function handleCodeCommand(
  interaction: ChatInputCommandInteraction, 
  discordUser: any
): Promise<void> {
  // Get or generate referral code
  let referralCode = discordUser.referralCode;
  
  if (!referralCode) {
    // Generate new code
    referralCode = generateReferralCode();
    discordUser.referralCode = referralCode;
    await discordUser.save();
  }
  
  const shareUrl = `${config.urls.website}?ref=${referralCode}`;
  
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle('Your Referral Code')
    .setDescription('Share your code with friends and earn credits!')
    .addFields(
      {
        name: 'Your Code',
        value: `\`\`\`${referralCode}\`\`\``,
        inline: false
      },
      {
        name: 'Share Link',
        value: `[${shareUrl}](${shareUrl})`,
        inline: false
      },
      {
        name: 'How It Works',
        value: `You get **${REFERRER_CREDITS} credits** for each friend who signs up\n` +
               `Your friend gets the standard **10 credits** on signup\n` +
               `No limit on referrals - invite as many as you want!`,
        inline: false
      }
    )
    .setFooter({ text: 'Share on social media for even more reach!' })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setLabel('Share on Twitter')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Join me on SeisoAI! Create amazing AI images, videos, and music. Use my code: ${referralCode}`)}&url=${encodeURIComponent(shareUrl)}`)
        .setEmoji('🐦'),
      new ButtonBuilder()
        .setLabel('Visit Website')
        .setStyle(ButtonStyle.Link)
        .setURL(shareUrl)
        .setEmoji('🌐')
    );

  await interaction.editReply({ embeds: [embed], components: [row] });
  
  logger.debug('Referral code command executed', {
    userId: interaction.user.id,
    referralCode
  });
}

/**
 * Handle /referral stats subcommand
 */
async function handleStatsCommand(
  interaction: ChatInputCommandInteraction,
  discordUser: any
): Promise<void> {
  const referralCount = discordUser.referralCount || 0;
  const referralCreditsEarned = discordUser.referralCreditsEarned || 0;
  const referralCode = discordUser.referralCode || 'Not generated yet';
  
  // Calculate potential earnings
  const potentialNext10 = 10 * REFERRER_CREDITS;
  
  const embed = new EmbedBuilder()
    .setColor(0x3498DB)
    .setTitle('Your Referral Statistics')
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {
        name: 'Your Code',
        value: `\`${referralCode}\``,
        inline: true
      },
      {
        name: 'Total Referrals',
        value: `**${referralCount}** friends`,
        inline: true
      },
      {
        name: 'Credits Earned',
        value: `**${referralCreditsEarned}** credits`,
        inline: true
      },
      {
        name: 'Keep Growing!',
        value: `Refer 10 more friends to earn **${potentialNext10}** more credits!\n` +
               `Share your code: \`${referralCode}\``,
        inline: false
      }
    )
    .setFooter({ text: 'Use /referral code to get your share link' })
    .setTimestamp();

  // Progress bar for referrals
  const progress = Math.min(referralCount, 10);
  const progressBar = '█'.repeat(progress) + '░'.repeat(10 - progress);
  
  embed.addFields({
    name: 'Progress to Next Milestone',
    value: `\`${progressBar}\` ${referralCount}/10`,
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });
  
  logger.debug('Referral stats command executed', {
    userId: interaction.user.id,
    referralCount,
    creditsEarned: referralCreditsEarned
  });
}

/**
 * Handle /referral leaderboard subcommand
 */
async function handleLeaderboardCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  // Get top referrers
  const topReferrers = await DiscordUser.find({ referralCount: { $gt: 0 } })
    .sort({ referralCount: -1 })
    .limit(10)
    .select('discordId discordUsername referralCount referralCreditsEarned');
  
  if (topReferrers.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xF39C12)
      .setTitle('Referral Leaderboard')
      .setDescription('No referrals yet! Be the first to invite friends and claim the top spot.')
      .setFooter({ text: 'Use /referral code to start inviting friends' });
    
    await interaction.editReply({ embeds: [embed] });
    return;
  }
  
  // Build leaderboard
  const medals = ['🥇', '🥈', '🥉'];
  const leaderboardText = topReferrers.map((user, index) => {
    const medal = medals[index] || `${index + 1}.`;
    const isCurrentUser = user.discordId === interaction.user.id;
    const username = isCurrentUser ? '**You**' : (user.discordUsername || 'Unknown');
    return `${medal} ${username} - ${user.referralCount} referrals (${user.referralCreditsEarned} credits)`;
  }).join('\n');
  
  // Find current user's rank
  const currentUserRank = topReferrers.findIndex(u => u.discordId === interaction.user.id) + 1;
  
  const embed = new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('Referral Leaderboard')
    .setDescription(leaderboardText)
    .setFooter({ 
      text: currentUserRank > 0 
        ? `Your rank: #${currentUserRank}` 
        : 'Start referring to appear on the leaderboard!' 
    })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('refresh_leaderboard')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄'),
      new ButtonBuilder()
        .setLabel('Get Your Code')
        .setStyle(ButtonStyle.Link)
        .setURL(`${config.urls.website}?tab=referral`)
        .setEmoji('🔗')
    );

  await interaction.editReply({ embeds: [embed], components: [row] });
  
  logger.debug('Referral leaderboard command executed', {
    userId: interaction.user.id,
    topReferrersCount: topReferrers.length
  });
}
