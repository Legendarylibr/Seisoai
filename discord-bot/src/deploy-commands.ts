/**
 * Deploy slash commands to Discord
 * Run this script after updating commands: npm run deploy-commands
 */
import { REST, Routes } from 'discord.js';
import { getCommandsData } from './commands/index.js';
import config, { validateConfig } from './config/index.js';
import logger from './utils/logger.js';

async function deployCommands() {
  if (!validateConfig()) {
    process.exit(1);
  }

  const commands = getCommandsData();
  const rest = new REST({ version: '10' }).setToken(config.discord.token);

  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    // Deploy to specific guild for testing (faster)
    if (config.discord.guildId) {
      const data = await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      ) as unknown[];

      logger.info(`Successfully reloaded ${data.length} guild commands.`);
    }

    // Deploy globally (takes up to 1 hour to propagate)
    const globalData = await rest.put(
      Routes.applicationCommands(config.discord.clientId),
      { body: commands }
    ) as unknown[];

    logger.info(`Successfully reloaded ${globalData.length} global commands.`);

  } catch (error) {
    const err = error as Error;
    logger.error('Error deploying commands:', { error: err.message });
    process.exit(1);
  }
}

deployCommands();

