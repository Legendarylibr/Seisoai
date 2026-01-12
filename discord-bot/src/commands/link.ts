/**
 * /link command - Link Discord account to SeisoAI
 * 
 * NOTE: Email lookups use encryption-aware methods to support 
 * encrypted email fields in the database.
 */
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalSubmitInteraction,
  ButtonInteraction
} from 'discord.js';
import DiscordUser from '../database/models/DiscordUser.js';
import { getUserModel, IUser } from '../database/models/User.js';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { buildEmailLookupConditions } from '../utils/encryption.js';
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

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to SeisoAI');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Ensure database is connected
    await ensureConnected();

    const discordId = interaction.user.id;

    // First, try auto-detection from main database
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

    // Check if linked via email/wallet
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

    // Not linked - show options
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔗 Connect Your SeisoAI Account')
      .setDescription('Link your Discord to access your credits and sync your generations across platforms.')
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '🌐 Website (Recommended)',
          value: 'Connect via the SeisoAI website for the easiest setup. Your credits sync automatically!',
          inline: false
        },
        {
          name: '📧 Email',
          value: 'Link using the email on your SeisoAI account.',
          inline: true
        },
        {
          name: '💳 Wallet',
          value: 'Link using your connected wallet address.',
          inline: true
        }
      )
      .setFooter({ text: 'Choose a method below to get started' });

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Connect via Website')
          .setStyle(ButtonStyle.Link)
          .setURL(`${config.urls.website}/settings?connect=discord`)
          .setEmoji('🌐'),
        new ButtonBuilder()
          .setCustomId('link_email_btn')
          .setLabel('Use Email')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('📧'),
        new ButtonBuilder()
          .setCustomId('link_wallet_btn')
          .setLabel('Use Wallet')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('💳')
      );

    const refreshRow = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('link_refresh')
          .setLabel('I\'ve connected on the website')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔄')
      );

    await interaction.editReply({ embeds: [embed], components: [row, refreshRow] });

    logger.info('Link command - showing options', {
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

  if (customId === 'link_email_btn') {
    const modal = new ModalBuilder()
      .setCustomId('link_email_modal')
      .setTitle('Link Email Account');

    const input = new TextInputBuilder()
      .setCustomId('email_input')
      .setLabel('Your SeisoAI Email')
      .setPlaceholder('you@example.com')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(100);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return;
  }

  if (customId === 'link_wallet_btn') {
    const modal = new ModalBuilder()
      .setCustomId('link_wallet_modal')
      .setTitle('Link Wallet Address');

    const input = new TextInputBuilder()
      .setCustomId('wallet_input')
      .setLabel('Your Wallet Address')
      .setPlaceholder('0x... or Solana address')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMinLength(20)
      .setMaxLength(64);

    const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
    modal.addComponents(row);

    await interaction.showModal(modal);
    return;
  }

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
          .setTitle('🔍 No Connection Found Yet')
          .setDescription('Make sure you\'ve clicked **Connect Discord** in your [SeisoAI settings](' + config.urls.website + '/settings) and authorized the connection.')
          .addFields({
            name: '💡 Steps',
            value: '1. Go to SeisoAI website\n2. Log into your account\n3. Go to Settings\n4. Click "Connect Discord"\n5. Authorize in Discord\n6. Click the refresh button again'
          });

        const row = new ActionRowBuilder<ButtonBuilder>()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Open Settings')
              .setStyle(ButtonStyle.Link)
              .setURL(`${config.urls.website}/settings?connect=discord`)
              .setEmoji('🌐'),
            new ButtonBuilder()
              .setCustomId('link_refresh')
              .setLabel('Check Again')
              .setStyle(ButtonStyle.Success)
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

/**
 * Handle modal submission for linking
 */
export async function handleLinkModal(interaction: ModalSubmitInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Ensure database is connected
    await ensureConnected();

    const isEmail = interaction.customId === 'link_email_modal';
    const inputValue = interaction.fields.getTextInputValue(isEmail ? 'email_input' : 'wallet_input');

    // Validate input
    if (isEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(inputValue)) {
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Invalid Email')
          .setDescription('Please enter a valid email address.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    } else {
      // Basic wallet validation
      const isEthAddress = /^0x[a-fA-F0-9]{40}$/.test(inputValue);
      const isSolanaAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(inputValue);
      
      if (!isEthAddress && !isSolanaAddress) {
        const embed = new EmbedBuilder()
          .setColor(0xE74C3C)
          .setTitle('❌ Invalid Wallet Address')
          .setDescription('Please enter a valid Ethereum (0x...) or Solana wallet address.');
        await interaction.editReply({ embeds: [embed] });
        return;
      }
    }

    // Try to find existing SeisoAI user
    const UserModel = getUserModel();
    let mainUser: IMainUser | null = null;

    if (isEmail) {
      // Use encryption-aware email lookup with multiple fallback methods
      const emailConditions = buildEmailLookupConditions(inputValue);
      mainUser = await UserModel.findOne({ $or: emailConditions }) as IMainUser | null;
    } else {
      // Wallet lookup (no encryption needed)
      const walletQuery = { walletAddress: inputValue.startsWith('0x') ? inputValue.toLowerCase() : inputValue };
      mainUser = await UserModel.findOne(walletQuery) as IMainUser | null;
    }

    // Get or create Discord user
    const discordUser = await DiscordUser.findOrCreate({
      id: interaction.user.id,
      username: interaction.user.username,
      discriminator: interaction.user.discriminator,
      avatar: interaction.user.avatar || undefined
    });

    if (mainUser) {
      // Link to existing SeisoAI account
      discordUser.seisoUserId = mainUser.userId;
      if (isEmail) {
        discordUser.email = inputValue.toLowerCase();
      } else {
        discordUser.walletAddress = inputValue.startsWith('0x') ? inputValue.toLowerCase() : inputValue;
      }
      
      // Sync credits from main account
      discordUser.credits = mainUser.credits;
      discordUser.totalCreditsEarned = mainUser.totalCreditsEarned;
      discordUser.totalCreditsSpent = mainUser.totalCreditsSpent;
      
      await discordUser.save();

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Account Linked!')
        .setDescription('Successfully linked to your SeisoAI account.')
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
          { name: '💰 Credits', value: `**${discordUser.credits.toLocaleString()}**`, inline: true },
          { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned.toLocaleString()}`, inline: true }
        )
        .setFooter({ text: 'Start generating with /imagine, /video, /music, or /3d' });

      await interaction.editReply({ embeds: [embed] });

      logger.info('Discord account linked to SeisoAI', {
        discordId: interaction.user.id,
        seisoUserId: mainUser.userId,
        method: isEmail ? 'email' : 'wallet'
      });

    } else {
      // No existing account found
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🔍 Account Not Found')
        .setDescription(`No SeisoAI account found with this ${isEmail ? 'email' : 'wallet'}.`)
        .addFields(
          {
            name: '💡 What to do',
            value: isEmail 
              ? '• Make sure you entered the email you used on SeisoAI\n• Check for typos\n• Try linking via website instead'
              : '• Make sure you entered the correct wallet address\n• Wallet must be connected to your SeisoAI account\n• Try linking via website instead'
          }
        );

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Create Account')
            .setStyle(ButtonStyle.Link)
            .setURL(config.urls.website)
            .setEmoji('🚀'),
          new ButtonBuilder()
            .setLabel('Connect via Website')
            .setStyle(ButtonStyle.Link)
            .setURL(`${config.urls.website}/settings?connect=discord`)
            .setEmoji('🌐')
        );

      await interaction.editReply({ embeds: [embed], components: [row] });

      logger.info('Link attempt - no matching account', {
        discordId: interaction.user.id,
        method: isEmail ? 'email' : 'wallet'
      });
    }

  } catch (error) {
    const err = error as Error;
    logger.error('Link modal error', { error: err.message, stack: err.stack, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Connection Error')
      .setDescription('Unable to link your account. Please try again in a moment.')
      .setFooter({ text: 'If this persists, try connecting via the website instead' });

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

