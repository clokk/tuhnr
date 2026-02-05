#!/usr/bin/env node
/**
 * Tuhnr CLI
 * Track your AI coding sessions
 */

import { Command } from "commander";
import {
  registerParseCommands,
  registerInitCommand,
  registerWatchCommands,
  registerStartCommand,
  registerClaimCommand,
  registerStudioCommand,
  registerImportCommand,
  registerAuthCommands,
  registerSyncCommands,
  registerConfigCommands,
  registerCloudCommands,
  registerStatsCommand,
  registerExportCommand,
  registerSearchCommand,
  registerPruneCommand,
} from "./commands";

const program = new Command();

program
  .name("tuhnr")
  .description("Track your AI coding sessions")
  .version("0.1.0");

// Register all commands
registerParseCommands(program);
registerInitCommand(program);
registerWatchCommands(program);
registerStartCommand(program);
registerClaimCommand(program);
registerStudioCommand(program);
registerImportCommand(program);
registerAuthCommands(program);
registerSyncCommands(program);
registerConfigCommands(program);
registerCloudCommands(program);
registerStatsCommand(program);
registerExportCommand(program);
registerSearchCommand(program);
registerPruneCommand(program);

program.parse();
