/**
 * /link command - Link Discord account to SeisoAI
 * 
 * SECURE LINKING FLOW:
 * 1. User logs into SeisoAI website and generates a 6-digit code
 * 2. User runs /link code:<6-digit-code> in Discord
 * 3. Bot verifies the code via backend API
 * 4. Accounts are securely linked
 * 
 * This ensures only the owner of a SeisoAI account can link it
 * to their Discord - codes expire in 5 minutes and are single-use.
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ButtonInteraction
} from 'discord.js';
import DiscordUser from '../database/models/DiscordUser.js';
import { getUserModel, IUser } from '../database/models/User.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { ensureConnected } from '../database/index.js';

// Interface for main User model (matches IUser from User model)
interface IMainUser {
  userId?: string;
  email?: string;
  walletAddress?: string;
  discordId?: string;
  discordUsername?: string;
  credits: number;
  totalCreditsEarned: number;
  totalCreditsSpent: number;
}

// Backend API response types
interface VerifyLinkResponse {
  success: boolean;
  error?: string;
  message?: string;
  user?: {
    userId: string;
    email?: string;
    credits: number;
    totalCreditsEarned: number;
    totalCreditsSpent: number;
    walletAddress?: string;
  };
}

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to SeisoAI')
  .addStringOption(option =>
    option
      .setName('code')
      .setDescription('6-digit linking code from the SeisoAI website')
      .setRequired(false)
      .setMinLength(6)
      .setMaxLength(6)
  );

/**
 * Call backend API to verify Discord link code
 */
async function verifyLinkCode(
  code: string,
  discordId: string,
  discordUsername: string
): Promise<VerifyLinkResponse> {
  const apiUrl = process.env.API_URL || config.urls.website;
  
  try {
    const response = await fetch(`${apiUrl}/api/auth/verify-discord-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        code,
        discordId,
        discordUsername
      })
    });

    const data = await response.json() as VerifyLinkResponse;
    return data;
  } catch (error) {
    const err = error as Error;
    logger.error('API call to verify-discord-link failed', { error: err.message });
    return {
      success: false,
      error: 'Unable to connect to SeisoAI servers. Please try again.'
    };
  }
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Ensure database is connected
    await ensureConnected();

    const discordId = interaction.user.id;
    const code = interaction.options.getString('code');

    // If a code was provided, verify it
    if (code) {
      // Validate code format
      if (!/^\d{6}$/.test(code)) {
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Invalid Code')
          .setDescription('Please enter a valid 6-digit code from the SeisoAI website.')
          .addFields({
            name: '💡 How to get a code',
            value: `1. Go to [SeisoAI Settings](${config.urls.website}/settings)\n2. Click "Link Discord"\n3. Copy the 6-digit code\n4. Run \`/link code:XXXXXX\``
          });

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // Call backend API to verify the code
      const result = await verifyLinkCode(
        code,
        discordId,
        interaction.user.username
      );

      if (result.success && result.user) {
        // Sync to local DiscordUser for quick access
        const discordUser = await DiscordUser.findOrCreate({
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator,
          avatar: interaction.user.avatar || undefined
        });

        discordUser.seisoUserId = result.user.userId;
        if (result.user.email) discordUser.email = result.user.email;
        if (result.user.walletAddress) discordUser.walletAddress = result.user.walletAddress;
        discordUser.credits = result.user.credits;
        discordUser.totalCreditsEarned = result.user.totalCreditsEarned;
        discordUser.totalCreditsSpent = result.user.totalCreditsSpent;
        await discordUser.save();

        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Account Linked Successfully!')
          .setDescription('Your Discord is now connected to your SeisoAI account.')
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: '💰 Credits', value: `**${discordUser.credits.toLocaleString()}**`, inline: true },
            { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned.toLocaleString()}`, inline: true },
            { name: '📈 Total Spent', value: `${discordUser.totalCreditsSpent.toLocaleString()}`, inline: true }
          )
          .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

        if (result.user.email) {
          const maskedEmail = result.user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
          embed.addFields({ name: '📧 Email', value: maskedEmail, inline: true });
        }

        if (result.user.walletAddress) {
          const addr = result.user.walletAddress;
          embed.addFields({ 
            name: '💳 Wallet', 
            value: `\`${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}\``, 
            inline: true 
          });
        }

        await interaction.editReply({ embeds: [embed] });

        logger.info('Discord account linked via code', {
          discordId,
          seisoUserId: result.user.userId
        });
        return;
      } else {
        // Code verification failed
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Link Failed')
          .setDescription(result.error || 'Unable to verify the code.')
          .addFields({
            name: '💡 What to do',
            value: `• Make sure you copied the code correctly\n• Codes expire after 5 minutes\n• Generate a new code at [SeisoAI Settings](${config.urls.website}/settings)`
          });

        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    // No code provided - check if already linked or show instructions
    const UserModel = getUserModel();
    const mainUser = await UserModel.findOne({ discordId }) as IMainUser | null;
    const discordUser = await DiscordUser.findOne({ discordId });

    // If already linked via OAuth, show success
    if (mainUser) {
      // Sync local Discord user data
      const linkedUser = discordUser ?? await DiscordUser.findOrCreate({
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator,
        avatar: interaction.user.avatar || undefined
      });

      linkedUser.seisoUserId = mainUser.userId;
      if (mainUser.email) linkedUser.email = mainUser.email;
      if (mainUser.walletAddress) linkedUser.walletAddress = mainUser.walletAddress;
      linkedUser.credits = mainUser.credits;
      linkedUser.totalCreditsEarned = mainUser.totalCreditsEarned;
      linkedUser.totalCreditsSpent = mainUser.totalCreditsSpent;
      await linkedUser.save();

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Account Already Linked!')
        .setDescription('Your Discord is connected to your SeisoAI account.')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '💰 Credits', value: `**${linkedUser.credits.toLocaleString()}**`, inline: true },
          { name: '📊 Total Earned', value: `${linkedUser.totalCreditsEarned.toLocaleString()}`, inline: true },
          { name: '📈 Total Spent', value: `${linkedUser.totalCreditsSpent.toLocaleString()}`, inline: true }
        )
        .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

      if (mainUser.email) {
        const maskedEmail = mainUser.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        embed.addFields({ name: '📧 Email', value: maskedEmail, inline: true });
      }

      if (mainUser.walletAddress) {
        const addr = mainUser.walletAddress;
        embed.addFields({ 
          name: '💳 Wallet', 
          value: `\`${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}\``, 
          inline: true 
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Check if linked via local storage
    if (discordUser?.seisoUserId) {
      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Account Linked!')
        .setDescription('Your Discord is connected to SeisoAI.')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '💰 Credits', value: `**${discordUser.credits.toLocaleString()}**`, inline: true },
          { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned.toLocaleString()}`, inline: true }
        )
        .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // Not linked - show secure linking instructions
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗 Link Your SeisoAI Account')
      .setDescription('Connect your Discord to access your credits and sync your generations across platforms.')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '📋 How to Link (Secure)',
          value: `**1.** Go to [SeisoAI Settings](${config.urls.website}/settings)\n**2.** Log in to your account\n**3.** Click "**Link Discord**" to get a code\n**4.** Run \`/link code:XXXXXX\` here`,
          inline: false
        },
        {
          name: '🔒 Why use a code?',
          value: 'Codes verify you own the SeisoAI account, keeping your credits safe.',
          inline: false
        },
        {
          name: '🆕 New to SeisoAI?',
          value: `[Create an account](${config.urls.website}) to get started with free credits!`,
          inline: false
        }
      )
      .setFooter({ text: 'Codes expire in 5 minutes • Generate a new one anytime' });

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Get Link Code')
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.urls.website}/settings?connect=discord`)
          .setEmoji('🔗'),
        new ButtonBuilder()
          .setLabel('Create Account')
          .setStyle(ButtonStyle.Link)
          .setURL(config.urls.website)
          .setEmoji('🆕')
      );

    const refreshRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('link_refresh')
          .setLabel('Check Link Status')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔄')
      );

    await interaction.editReply({ embeds: [embed], components: [row, refreshRow] });

    logger.info('Link command - showing secure link instructions', {
      discordId,
      username: interaction.user.username
    });

  } catch (error) {
    const err = error as Error;
    logger.error('Link command error', { error: err.message, stack: err.stack, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Connection Error')
      .setDescription('Unable to check your account status. Please try again in a moment.')
      .setFooter({ text: 'If this persists, contact support' });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

/**
 * Handle link button interactions
 */
export async function handleLinkButton(interaction: ButtonInteraction): Promise<void> {
  const customId = interaction.customId;

  if (customId === 'link_refresh') {
    await interaction.deferUpdate();

    try {
      await ensureConnected();

      const discordId = interaction.user.id;
      const UserModel = getUserModel();
      const mainUser = await UserModel.findOne({ discordId }) as IMainUser | null;

      if (mainUser) {
        // Found! Sync the accounts
        const discordUser = await DiscordUser.findOrCreate({
          id: interaction.user.id,
          username: interaction.user.username,
          discriminator: interaction.user.discriminator,
          avatar: interaction.user.avatar || undefined
        });

        discordUser.seisoUserId = mainUser.userId;
        if (mainUser.email) discordUser.email = mainUser.email;
        if (mainUser.walletAddress) discordUser.walletAddress = mainUser.walletAddress;
        discordUser.credits = mainUser.credits;
        discordUser.totalCreditsEarned = mainUser.totalCreditsEarned;
        discordUser.totalCreditsSpent = mainUser.totalCreditsSpent;
        await discordUser.save();

        const embed = new EmbedBuilder()
          .setColor(0x2ECC71)
          .setTitle('✅ Account Connected!')
          .setDescription('Your Discord is now linked to your SeisoAI account.')
          .setThumbnail(interaction.user.displayAvatarURL())
          .addFields(
            { name: '💰 Credits', value: `**${discordUser.credits.toLocaleString()}**`, inline: true },
            { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned.toLocaleString()}`, inline: true }
          )
          .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

        await interaction.editReply({ embeds: [embed], components: [] });

        logger.info('Refreshed and linked Discord account', {
          discordId,
          seisoUserId: mainUser.userId
        });
      } else {
        const embed = new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('🔍 Not Linked Yet')
          .setDescription('To link your account, you need to get a code from the website.')
          .addFields({
            name: '📋 How to Link',
            value: `**1.** Go to [SeisoAI Settings](${config.urls.website}/settings)\n**2.** Log in and click "**Link Discord**"\n**3.** Copy the 6-digit code\n**4.** Run \`/link code:XXXXXX\` here`
          });

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Get Link Code')
              .setStyle(ButtonStyle.Link)
              .setURL(`${config.urls.website}/settings?connect=discord`)
              .setEmoji('🔗'),
            new ButtonBuilder()
              .setCustomId('link_refresh')
              .setLabel('Check Again')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji('🔄')
          );

        await interaction.editReply({ embeds: [embed], components: [row] });
      }
    } catch (error) {
      const err = error as Error;
      logger.error('Link refresh error', { error: err.message, userId: interaction.user.id });

      const errorEmbed = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('❌ Error')
        .setDescription('Unable to check your account. Please try again.');

      await interaction.editReply({ embeds: [errorEmbed], components: [] });
    }
  }
}

// Note: handleLinkModal has been removed - we now use secure code-based linking only
// The old email/wallet modal flow was insecure (no ownership verification)

