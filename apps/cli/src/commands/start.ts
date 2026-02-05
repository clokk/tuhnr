/**
 * Start command - Simplified entry point for tuhnr
 * Combines init, anonymous auth, and daemon startup into one command
 */

import { Command } from "commander";
import { spawn } from "child_process";
import {
  isInitialized,
  initializeProject,
  isDaemonRunning,
  readDaemonPid,
} from "../config";
import { isAuthenticated, getCurrentUser } from "../sync/client";
import { ensureAuthenticated } from "../sync/auth";
import { TuhnrDB } from "../storage/db";
import { TuhnrDaemon } from "../daemon";
import { getSyncQueue } from "../sync/queue";

export function registerStartCommand(program: Command): void {
  program
    .command("start")
    .description("Start tracking your AI coding journey")
    .option("-v, --verbose", "Show verbose output")
    .option("--no-sync", "Disable cloud sync")
    .option("-f, --foreground", "Run in foreground")
    .action(async (options) => {
      try {
        const projectPath = process.cwd();

        // Step 1: Initialize if needed
        if (!isInitialized(projectPath)) {
          console.log("Setting up tuhnr for this project...\n");
          try {
            await initializeProject(projectPath, {});
          } catch (initError) {
            console.error(`Setup failed: ${(initError as Error).message}`);
            console.error("\nHint: Make sure you're in a directory where you use Claude Code.");
            process.exit(1);
          }
        }

        // Step 2: Check if daemon already running
        if (isDaemonRunning(projectPath)) {
          const pid = readDaemonPid(projectPath);
          console.log(`Already running (PID: ${pid})`);
          console.log("Use 'tuhnr status' to check status");
          return;
        }

        // Step 3: Ensure authenticated (anonymous if needed)
        if (options.sync !== false) {
          const user = await ensureAuthenticated();
          if (user) {
            if (user.isAnonymous) {
              console.log("Cloud insights enabled (anonymous mode)");
              console.log("Run 'tuhnr claim' later to link to your GitHub\n");
            } else {
              console.log(`Cloud insights enabled (${user.githubUsername})\n`);
            }
          } else {
            console.log("Cloud insights unavailable (continuing without sync)\n");
          }
        }

        // Step 4: Start daemon
        if (options.foreground) {
          // Foreground mode - run directly
          console.log("Starting in foreground (Ctrl+C to stop)...\n");

          const db = new TuhnrDB(projectPath);
          const syncEnabled = isAuthenticated() && options.sync !== false;
          const syncQueue = syncEnabled
            ? getSyncQueue(db, { continuousSync: true, verbose: options.verbose })
            : undefined;

          const daemon = new TuhnrDaemon(projectPath, {
            verbose: options.verbose,
            captureEnabled: true,
            syncQueue,
          });

          await daemon.start();

          const status = daemon.getStatus();
          console.log(`Watching: ${status.claudeProjectPath}`);
          console.log(`Commits tracked: ${status.commitCount}`);
          if (syncEnabled) {
            console.log("Background sync: enabled");
          }
          console.log("\nKeep your flame alive!");

          // Keep process alive
          await new Promise(() => {});
        } else {
          // Background mode - spawn detached
          const args = ["start", "--foreground"];
          if (options.verbose) args.push("--verbose");
          if (options.sync === false) args.push("--no-sync");

          const child = spawn(process.execPath, [process.argv[1], ...args], {
            detached: true,
            stdio: "ignore",
            cwd: projectPath,
          });

          child.unref();

          console.log(`Started! (PID: ${child.pid})`);
          console.log("\nYour AI coding is now being tracked.");
          console.log("Use 'tuhnr status' to check progress");
          console.log("Use 'tuhnr stop' to stop tracking");
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
