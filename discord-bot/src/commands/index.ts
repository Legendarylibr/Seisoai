/**
 * Command Handler Index
 * Exports all commands and provides command collection
 */
import { 
  Collection, 
  SlashCommandBuilder, 
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  ChatInputCommandInteraction 
} from 'discord.js';

import * as imagine from './imagine.js';
import * as video from './video.js';
import * as music from './music.js';
import * as model3d from './3d.js';
import * as credits from './credits.js';
import * as link from './link.js';
import * as help from './help.js';
import * as admin from './admin.js';

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

// Create command collection
export const commands = new Collection<string, Command>();

// Register all commands
const commandModules: Command[] = [
  imagine,
  video,
  music,
  model3d,
  credits,
  link,
  help,
  admin
];

for (const command of commandModules) {
  commands.set(command.data.name, command);
}

// Export individual command handlers for modal/select interactions
export { handleLinkModal } from './link.js';
export { handleHelpSelect } from './help.js';

// Export command data for deployment
export function getCommandsData() {
  return commandModules.map(cmd => cmd.data.toJSON());
}

export default commands;

