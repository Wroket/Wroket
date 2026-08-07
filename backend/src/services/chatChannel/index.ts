/**
 * Shared chat-channel socle — identity, task actions, slash commands, adapter types.
 */

export type {
  ChatActionResult,
  ChatChannelAdapter,
  ChatIdentityResult,
  ChatTaskAction,
} from "./types";
export { CHAT_ACTION_IDS } from "./types";
export { resolveUserFromChatEmail } from "./resolveUser";
export {
  actionIdToTaskAction,
  parseButtonValue,
  runTaskAction,
} from "./taskActions";
export {
  handleSlashText,
  slashHelpText,
  slashHelpTextForPrefix,
} from "./slashCommands";
