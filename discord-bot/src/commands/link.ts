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
  ModalSubmitInteraction
} from 'discord.js';
import mongoose from 'mongoose';
import DiscordUser from '../database/models/DiscordUser.js';
import User, { ensureUserModel } from '../database/models/User.js';
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
  .setDescription('Link your Discord account to SeisoAI')
  .addSubcommand(subcommand =>
    subcommand
      .setName('auto')
      .setDescription('Auto-detect if your account is already linked via the website')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('email')
      .setDescription('Link with your email address')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('wallet')
      .setDescription('Link with your wallet address')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check your link status')
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'status') {
    await handleStatus(interaction);
    return;
  }

  if (subcommand === 'auto') {
    await handleAutoLink(interaction);
    return;
  }

  // Show modal for email or wallet input
  const modal = new ModalBuilder()
    .setCustomId(`link_${subcommand}_modal`)
    .setTitle(subcommand === 'email' ? 'Link Email Account' : 'Link Wallet');

  const input = new TextInputBuilder()
    .setCustomId(`${subcommand}_input`)
    .setLabel(subcommand === 'email' ? 'Your SeisoAI Email' : 'Your Wallet Address')
    .setPlaceholder(subcommand === 'email' ? 'you@example.com' : '0x... or Solana address')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(subcommand === 'email' ? 5 : 20)
    .setMaxLength(subcommand === 'email' ? 100 : 64);

  const row = new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

/**
 * Auto-detect if user's Discord is already linked via OAuth on the website
 */
async function handleAutoLink(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Ensure database is connected
    await ensureConnected();

    const discordId = interaction.user.id;

    // Check if already linked in our Discord database
    let discordUser = await DiscordUser.findOne({ discordId });

    // Check main SeisoAI database for OAuth-linked accounts
    // Ensure User model is registered before using it
    const UserModel = ensureUserModel();
    const mainUser = await UserModel.findOne({ discordId });

    if (mainUser) {
      // Found! Link the accounts
      const linkedUser = discordUser ?? await DiscordUser.findOrCreate({
        id: interaction.user.id,
        username: interaction.user.username,
        discriminator: interaction.user.discriminator,
        avatar: interaction.user.avatar || undefined
      });

      // Sync data from main account
      linkedUser.seisoUserId = mainUser.userId;
      if (mainUser.email) linkedUser.email = mainUser.email;
      if (mainUser.walletAddress) linkedUser.walletAddress = mainUser.walletAddress;
      linkedUser.credits = mainUser.credits;
      linkedUser.totalCreditsEarned = mainUser.totalCreditsEarned;
      linkedUser.totalCreditsSpent = mainUser.totalCreditsSpent;
      await linkedUser.save();

      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('✅ Account Found & Linked!')
        .setDescription('Your Discord was already connected via the SeisoAI website. Credits synced!')
        .addFields(
          { name: '💰 Credits', value: `${linkedUser.credits}`, inline: true },
          { name: '📊 Total Earned', value: `${linkedUser.totalCreditsEarned}`, inline: true }
        )
        .setFooter({ text: 'You\'re all set! Start generating with /imagine' });

      await interaction.editReply({ embeds: [embed] });

      logger.info('Auto-linked Discord account from OAuth', {
        discordId,
        seisoUserId: mainUser.userId
      });
    } else {
      // No OAuth link found
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🔍 No Linked Account Found')
        .setDescription('Your Discord isn\'t connected to a SeisoAI account yet.')
        .addFields(
          {
            name: '🌐 Option 1: Link via Website (Recommended)',
            value: `1. Go to [SeisoAI](${config.urls.website})\n2. Log in to your account\n3. Click "Connect Discord" in settings\n4. Authorize the connection\n5. Run \`/link auto\` again!`
          },
          {
            name: '📧 Option 2: Link Manually',
            value: '`/link email` - Link with your SeisoAI email\n`/link wallet` - Link with your wallet address'
          }
        );

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Open SeisoAI')
            .setStyle(ButtonStyle.Link)
            .setURL(config.urls.website)
            .setEmoji('🌐')
        );

      await interaction.editReply({ embeds: [embed], components: [row] });
    }
  } catch (error) {
    const err = error as Error;
    logger.error('Auto-link error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Error')
      .setDescription('Failed to check for linked account.');

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    // Ensure database is connected
    await ensureConnected();

    // First try auto-detection from main database
    // Ensure User model is registered before using it
    const UserModel = ensureUserModel();
    const mainUser = await UserModel.findOne({ discordId: interaction.user.id });
    
    let discordUser = await DiscordUser.findOne({ discordId: interaction.user.id });

    // If found in main DB but not synced locally, sync it
    if (mainUser && discordUser && !discordUser.seisoUserId) {
      discordUser.seisoUserId = mainUser.userId;
      discordUser.credits = mainUser.credits;
      discordUser.totalCreditsEarned = mainUser.totalCreditsEarned;
      discordUser.totalCreditsSpent = mainUser.totalCreditsSpent;
      await discordUser.save();
    }

    if (!discordUser) {
      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📋 Link Status')
        .setDescription('You haven\'t linked any accounts yet.')
        .addFields({
          name: '🔗 How to Link',
          value: '`/link auto` - Auto-detect if linked via website\n`/link email` - Link with your SeisoAI email\n`/link wallet` - Link with your wallet address'
        });

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor(0x2ECC71)
      .setTitle('📋 Link Status')
      .setThumbnail(interaction.user.displayAvatarURL());

    if (discordUser.seisoUserId) {
      embed.addFields({ 
        name: '🆔 SeisoAI ID', 
        value: `\`${discordUser.seisoUserId}\``, 
        inline: true 
      });
    }

    if (discordUser.email) {
      embed.addFields({ 
        name: '📧 Email', 
        value: discordUser.email, 
        inline: true 
      });
    }

    if (discordUser.walletAddress) {
      const addr = discordUser.walletAddress;
      embed.addFields({ 
        name: '💳 Wallet', 
        value: `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`, 
        inline: true 
      });
    }

    embed.addFields(
      { name: '💰 Credits', value: `${discordUser.credits}`, inline: true },
      { name: '📊 Earned', value: `${discordUser.totalCreditsEarned}`, inline: true },
      { name: '📈 Spent', value: `${discordUser.totalCreditsSpent}`, inline: true }
    );

    if (!discordUser.seisoUserId && !discordUser.email && !discordUser.walletAddress) {
      embed.setColor(0xFFA500);
      embed.setDescription('❌ No accounts linked');
    } else {
      embed.setDescription('✅ Account linked successfully!');
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    const err = error as Error;
    logger.error('Link status error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Error')
      .setDescription('Failed to retrieve link status.');

    await interaction.editReply({ embeds: [errorEmbed] });
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
    // Ensure User model is registered before using it
    const UserModel = ensureUserModel();
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
        .setDescription(`Successfully linked to your SeisoAI account.`)
        .addFields(
          { name: '💰 Credits Synced', value: `${discordUser.credits}`, inline: true },
          { name: '📊 Total Earned', value: `${discordUser.totalCreditsEarned}`, inline: true }
        )
        .setFooter({ text: 'Your credits are now synced between Discord and the website!' });

      await interaction.editReply({ embeds: [embed] });

      logger.info('Discord account linked to SeisoAI', {
        discordId: interaction.user.id,
        seisoUserId: mainUser.userId,
        method: isEmail ? 'email' : 'wallet'
      });

    } else {
      // No existing account - store the link info for future
      if (isEmail) {
        discordUser.email = inputValue.toLowerCase();
      } else {
        discordUser.walletAddress = inputValue.startsWith('0x') ? inputValue.toLowerCase() : inputValue;
      }
      await discordUser.save();

      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📝 Link Saved')
        .setDescription(`No SeisoAI account found with this ${isEmail ? 'email' : 'wallet'}.`)
        .addFields(
          {
            name: '🔗 What\'s Next?',
            value: `1. Visit [SeisoAI](${config.urls.website}) and create an account\n2. Use the same ${isEmail ? 'email' : 'wallet'} to sign up\n3. Your accounts will be automatically linked!`
          },
          {
            name: '💡 Current Credits',
            value: `You have **${discordUser.credits}** credits available to use now.`
          }
        );

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setLabel('Create Account')
            .setStyle(ButtonStyle.Link)
            .setURL(config.urls.website)
            .setEmoji('🚀')
        );

      await interaction.editReply({ embeds: [embed], components: [row] });

      logger.info('Discord link saved (no existing account)', {
        discordId: interaction.user.id,
        method: isEmail ? 'email' : 'wallet'
      });
    }

  } catch (error) {
    const err = error as Error;
    logger.error('Link modal error', { error: err.message, userId: interaction.user.id });

    const errorEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('❌ Link Failed')
      .setDescription(`Something went wrong: ${err.message}`);

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

