#!/usr/bin/env node
/**
 * Shipchronicle CLI
 * Chronicle of shipping: explore how products evolve through human-AI collaboration
 */

import { Command } from "commander";
import * as path from "path";
import { spawn } from "child_process";
import { parseProject, getProjectInfo, discoverProjects } from "./parser/index";
import type { ParseResult, CognitiveCommit } from "./models/types";
import {
  initializeProject,
  loadConfig,
  isInitialized,
  readDaemonPid,
  isDaemonRunning,
  removeDaemonPid,
  getStorageDir,
  detectClaudeProjectPath,
  getGlobalStorageDir,
  ensureGlobalStorageDir,
  discoverAllClaudeProjects,
  getProjectNameFromClaudePath,
} from "./config";
import { ShipchronicleDB } from "./storage/db";
import { ShipchronicleDaemon } from "./daemon";
import { captureScreenshot } from "./daemon/capturer";
import { getBestCaptureUrl } from "./utils/server-detect";
import { startStudio } from "./studio";

const program = new Command();

program
  .name("shipchronicle")
  .description("Chronicle of shipping: parse Claude Code session logs")
  .version("0.1.0");

program
  .command("parse [projectPath]")
  .description("Parse Claude Code session logs and extract cognitive commits")
  .option("-s, --session <id>", "Parse specific session ID only")
  .option("-o, --output <format>", "Output format: json | pretty | summary", "pretty")
  .option("-v, --verbose", "Show verbose output")
  .action(async (projectPath: string | undefined, options) => {
    try {
      // Resolve project path
      let resolvedPath: string;

      if (!projectPath) {
        // Default to current directory's Claude project
        const cwd = process.cwd();
        const projectName = path.basename(cwd);
        resolvedPath = path.join(
          process.env.HOME || "",
          ".claude",
          "projects",
          `-Users-${process.env.USER}-${projectName}`
        );
      } else if (projectPath.startsWith("~")) {
        resolvedPath = projectPath.replace("~", process.env.HOME || "");
      } else {
        resolvedPath = path.resolve(projectPath);
      }

      if (options.verbose) {
        console.log(`Parsing project: ${resolvedPath}\n`);
      }

      const result = await parseProject(resolvedPath, {
        sessionId: options.session,
        verbose: options.verbose,
      });

      outputResult(result, options.output);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("list")
  .description("List discovered Claude projects")
  .action(() => {
    const projects = discoverProjects();

    if (projects.length === 0) {
      console.log("No Claude projects found in ~/.claude/projects/");
      return;
    }

    console.log("Discovered Claude projects:\n");

    for (const projectPath of projects) {
      const info = getProjectInfo(projectPath);
      console.log(`  ${info.name}`);
      console.log(`    Path: ${info.path}`);
      console.log(`    Sessions: ${info.sessionFiles.length}`);
      console.log();
    }
  });

program
  .command("info <projectPath>")
  .description("Show info about a project")
  .action((projectPath: string) => {
    try {
      const resolvedPath = projectPath.startsWith("~")
        ? projectPath.replace("~", process.env.HOME || "")
        : path.resolve(projectPath);

      const info = getProjectInfo(resolvedPath);

      console.log(`Project: ${info.name}`);
      console.log(`Path: ${info.path}`);
      console.log(`Sessions: ${info.sessionFiles.length}`);
      console.log();

      if (info.sessionFiles.length > 0) {
        console.log("Session files:");
        for (const file of info.sessionFiles.slice(0, 10)) {
          console.log(`  - ${path.basename(file)}`);
        }
        if (info.sessionFiles.length > 10) {
          console.log(`  ... and ${info.sessionFiles.length - 10} more`);
        }
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

function outputResult(result: ParseResult, format: string): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(result, null, 2));
      break;

    case "summary":
      outputSummary(result);
      break;

    case "pretty":
    default:
      outputPretty(result);
      break;
  }
}

function outputSummary(result: ParseResult): void {
  console.log(`Project: ${result.project}`);
  console.log(`Cognitive Commits: ${result.cognitiveCommits.length}`);
  console.log(`Sessions: ${result.totalSessions}`);
  console.log(`Total Turns: ${result.totalTurns}`);

  if (result.parseErrors.length > 0) {
    console.log(`Parse Errors: ${result.parseErrors.length}`);
  }

  // Git commit stats
  const withHash = result.cognitiveCommits.filter((c) => c.gitHash);
  console.log(`Git Commits Captured: ${withHash.length}`);

  // Parallel work
  const parallel = result.cognitiveCommits.filter((c) => c.parallel);
  if (parallel.length > 0) {
    console.log(`Parallel Work Detected: ${parallel.length} commits`);
  }
}

function outputPretty(result: ParseResult): void {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║  SHIPCHRONICLE: ${result.project.padEnd(42)}║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  console.log(`📊 Summary`);
  console.log(`   Cognitive Commits: ${result.cognitiveCommits.length}`);
  console.log(`   Sessions Parsed: ${result.totalSessions}`);
  console.log(`   Total Turns: ${result.totalTurns}`);
  console.log();

  if (result.cognitiveCommits.length === 0) {
    console.log("No cognitive commits found.");
    return;
  }

  console.log(`📝 Cognitive Commits\n`);

  for (let i = 0; i < result.cognitiveCommits.length; i++) {
    const commit = result.cognitiveCommits[i];
    outputCommit(commit, i + 1);
  }

  if (result.parseErrors.length > 0) {
    console.log(`\n⚠️  Parse Errors (${result.parseErrors.length}):`);
    for (const error of result.parseErrors) {
      console.log(`   - ${error}`);
    }
  }
}

function outputCommit(commit: CognitiveCommit, index: number): void {
  const hash = commit.gitHash ? `[${commit.gitHash}]` : "[no commit]";
  const parallel = commit.parallel ? " ⚡ parallel" : "";

  console.log(`   ${index}. ${hash}${parallel}`);
  console.log(`      Closed by: ${commit.closedBy}`);
  console.log(`      Time: ${formatTimestamp(commit.startedAt)} → ${formatTimestamp(commit.closedAt)}`);

  // Sessions
  const totalTurns = commit.sessions.reduce((sum, s) => sum + s.turns.length, 0);
  console.log(`      Sessions: ${commit.sessions.length} (${totalTurns} turns)`);

  // Files
  if (commit.filesRead.length > 0) {
    console.log(`      Files read: ${commit.filesRead.length}`);
  }
  if (commit.filesChanged.length > 0) {
    console.log(`      Files changed: ${commit.filesChanged.length}`);
    for (const file of commit.filesChanged.slice(0, 5)) {
      console.log(`        - ${path.basename(file)}`);
    }
    if (commit.filesChanged.length > 5) {
      console.log(`        ... and ${commit.filesChanged.length - 5} more`);
    }
  }

  console.log();
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// ============================================
// New Phase 2 Commands: init, watch, stop, status, capture
// ============================================

program
  .command("init")
  .description("Initialize shipchronicle for this project")
  .option("-n, --name <name>", "Project name (defaults to directory name)")
  .option("-c, --claude-path <path>", "Claude project path (auto-detected if not specified)")
  .option("-p, --port <port>", "Dev server port", parseInt)
  .option("--no-capture", "Disable screenshot capture")
  .action(async (options) => {
    try {
      const projectPath = process.cwd();

      if (isInitialized(projectPath)) {
        console.log("Project already initialized.");
        const config = loadConfig(projectPath);
        console.log(`\nCurrent config:`);
        console.log(`  Project: ${config.projectName}`);
        console.log(`  Claude path: ${config.claudeProjectPath}`);
        console.log(`  Dev server port: ${config.devServerPort || "auto-detect"}`);
        console.log(`  Capture enabled: ${config.captureEnabled}`);
        return;
      }

      // Validate Claude project path
      const claudePath = options.claudePath || detectClaudeProjectPath(projectPath);
      if (!claudePath) {
        console.error("Could not detect Claude project path.");
        console.error("Please specify with --claude-path option.");
        console.error("\nHint: Claude projects are stored at ~/.claude/projects/");
        process.exit(1);
      }

      const config = initializeProject(projectPath, {
        projectName: options.name,
        claudeProjectPath: claudePath,
        devServerPort: options.port,
        captureEnabled: options.capture !== false,
      });

      console.log(`Initialized shipchronicle for: ${config.projectName}`);
      console.log(`\nConfig created at: .shipchronicle/config.json`);
      console.log(`\nSettings:`);
      console.log(`  Claude path: ${config.claudeProjectPath}`);
      console.log(`  Dev server port: ${config.devServerPort || "auto-detect"}`);
      console.log(`  Capture enabled: ${config.captureEnabled}`);
      console.log(`\nStorage directory: ${getStorageDir(projectPath)}`);
      console.log(`\nNext steps:`);
      console.log(`  1. Start your dev server`);
      console.log(`  2. Run: shipchronicle watch`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("watch")
  .description("Start watching for Claude sessions")
  .option("-p, --port <port>", "Dev server port override", parseInt)
  .option("-v, --verbose", "Show verbose output")
  .option("--no-capture", "Disable screenshot capture")
  .option("-f, --foreground", "Run in foreground (default is background)")
  .action(async (options) => {
    try {
      const projectPath = process.cwd();

      if (!isInitialized(projectPath)) {
        console.error("Project not initialized. Run 'shipchronicle init' first.");
        process.exit(1);
      }

      if (isDaemonRunning(projectPath)) {
        const pid = readDaemonPid(projectPath);
        console.log(`Daemon already running (PID: ${pid})`);
        console.log("Use 'shipchronicle stop' to stop it first.");
        process.exit(1);
      }

      if (options.foreground) {
        // Run in foreground
        console.log("Starting daemon in foreground (Ctrl+C to stop)...\n");

        const daemon = new ShipchronicleDaemon(projectPath, {
          verbose: options.verbose,
          captureEnabled: options.capture !== false,
        });

        await daemon.start();

        const status = daemon.getStatus();
        console.log(`Watching: ${status.claudeProjectPath}`);
        console.log(`Commits captured so far: ${status.commitCount}`);
        console.log("\nListening for Claude Code sessions...");

        // Keep process alive
        await new Promise(() => {});
      } else {
        // Run in background using spawn
        const args = ["watch", "--foreground"];
        if (options.verbose) args.push("--verbose");
        if (options.capture === false) args.push("--no-capture");
        if (options.port) args.push("--port", options.port.toString());

        const child = spawn(process.execPath, [__filename, ...args], {
          detached: true,
          stdio: "ignore",
          cwd: projectPath,
        });

        child.unref();

        console.log(`Daemon started in background (PID: ${child.pid})`);
        console.log("Use 'shipchronicle status' to check status");
        console.log("Use 'shipchronicle stop' to stop the daemon");
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop the watch daemon")
  .action(async () => {
    try {
      const projectPath = process.cwd();

      if (!isInitialized(projectPath)) {
        console.error("Project not initialized.");
        process.exit(1);
      }

      const pid = readDaemonPid(projectPath);

      if (!pid) {
        console.log("No daemon running (no PID file found).");
        return;
      }

      if (!isDaemonRunning(projectPath)) {
        console.log("Daemon not running (stale PID file removed).");
        return;
      }

      // Send SIGTERM
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Sent SIGTERM to daemon (PID: ${pid})`);

        // Wait for process to exit
        let attempts = 0;
        while (attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            process.kill(pid, 0);
            attempts++;
          } catch {
            // Process no longer exists
            break;
          }
        }

        // Clean up PID file if still exists
        removeDaemonPid(projectPath);
        console.log("Daemon stopped.");
      } catch (error) {
        console.error(`Failed to stop daemon: ${(error as Error).message}`);
        removeDaemonPid(projectPath);
        process.exit(1);
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show daemon status")
  .action(async () => {
    try {
      const projectPath = process.cwd();

      if (!isInitialized(projectPath)) {
        console.error("Project not initialized. Run 'shipchronicle init' first.");
        process.exit(1);
      }

      const config = loadConfig(projectPath);
      const running = isDaemonRunning(projectPath);
      const pid = readDaemonPid(projectPath);

      console.log(`\nShipchronicle Status`);
      console.log(`${"─".repeat(40)}`);
      console.log(`Project: ${config.projectName}`);
      console.log(`Status: ${running ? "Running" : "Stopped"}`);

      if (running && pid) {
        console.log(`PID: ${pid}`);
      }

      // Open DB to get stats
      const db = new ShipchronicleDB(projectPath);
      const commitCount = db.getCommitCount();
      const lastActivity = db.getLastActivity();
      db.close();

      console.log(`\nStatistics:`);
      console.log(`  Commits captured: ${commitCount}`);

      if (lastActivity) {
        const lastDate = new Date(lastActivity);
        const ago = getTimeAgo(lastDate);
        console.log(`  Last activity: ${ago}`);
      } else {
        console.log(`  Last activity: Never`);
      }

      console.log(`\nConfiguration:`);
      console.log(`  Claude path: ${config.claudeProjectPath}`);
      console.log(`  Dev server port: ${config.devServerPort || "auto-detect"}`);
      console.log(`  Capture enabled: ${config.captureEnabled}`);
      console.log(`  Storage: ${getStorageDir(projectPath)}`);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("capture")
  .description("Manually capture a screenshot")
  .option("-u, --url <url>", "URL to capture (auto-detects dev server if not specified)")
  .option("-o, --output <path>", "Output file path")
  .action(async (options) => {
    try {
      const projectPath = process.cwd();

      if (!isInitialized(projectPath)) {
        console.error("Project not initialized. Run 'shipchronicle init' first.");
        process.exit(1);
      }

      const config = loadConfig(projectPath);

      let url = options.url;
      if (!url) {
        url = await getBestCaptureUrl(projectPath, config.devServerPort);
        if (!url) {
          console.error("No dev server detected.");
          console.error("Start your dev server or specify URL with --url option.");
          process.exit(1);
        }
        console.log(`Detected dev server at: ${url}`);
      }

      console.log(`Capturing screenshot...`);

      const outputPath = options.output || path.join(
        getStorageDir(projectPath),
        "screenshots",
        `manual-${Date.now()}.png`
      );

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      const fs = require("fs");
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await captureScreenshot(url, outputPath);

      console.log(`Screenshot saved: ${outputPath}`);

      // If daemon is running and we have a current commit, attach the visual
      if (isDaemonRunning(projectPath)) {
        const db = new ShipchronicleDB(projectPath);
        const currentCommitId = db.getCurrentCommitId();
        if (currentCommitId) {
          db.createVisual(currentCommitId, "screenshot", outputPath, "Manual capture");
          console.log(`Attached to commit: ${currentCommitId.substring(0, 8)}`);
        }
        db.close();
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
  }
  if (diffHours > 0) {
    return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  }
  if (diffMins > 0) {
    return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  }
  return "Just now";
}

// ============================================
// Phase 3: Studio Command
// ============================================

program
  .command("studio")
  .description("Start the web-based curation studio")
  .option("-p, --port <port>", "Port to run on", parseInt)
  .option("--no-open", "Don't auto-open browser")
  .option("-g, --global", "Global mode: view all Claude Code history")
  .action(async (options) => {
    try {
      let storagePath: string;

      if (options.global) {
        // Global mode - use global storage directory
        storagePath = ensureGlobalStorageDir();
        console.log("Starting studio in global mode...");
      } else {
        // Project mode - require initialization
        const projectPath = process.cwd();

        if (!isInitialized(projectPath)) {
          console.error("Project not initialized. Run 'shipchronicle init' first.");
          console.error("Or use --global flag to view all Claude Code history.");
          process.exit(1);
        }

        storagePath = projectPath;
      }

      await startStudio(storagePath, {
        port: options.port,
        open: options.open !== false,
        global: options.global,
      });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program
  .command("import")
  .description("Import parsed sessions into the database")
  .option("-c, --claude-path <path>", "Claude project path to import from")
  .option("-g, --global", "Import all Claude Code projects into global history")
  .option("--clear", "Clear existing commits before importing")
  .action(async (options) => {
    try {
      let storagePath: string;
      let claudePaths: string[];

      if (options.global) {
        // Global mode - import from all Claude projects
        storagePath = ensureGlobalStorageDir();
        claudePaths = discoverAllClaudeProjects();

        console.log(`Found ${claudePaths.length} Claude Code projects\n`);

        if (claudePaths.length === 0) {
          console.log("No Claude Code projects found.");
          return;
        }
      } else {
        // Project mode
        const projectPath = process.cwd();

        if (!isInitialized(projectPath)) {
          console.error("Project not initialized. Run 'shipchronicle init' first.");
          console.error("Or use --global flag to import all Claude Code history.");
          process.exit(1);
        }

        storagePath = projectPath;
        const config = loadConfig(projectPath);
        claudePaths = [options.claudePath || config.claudeProjectPath];
      }

      // Open database
      const db = new ShipchronicleDB(storagePath, { rawStoragePath: options.global });

      // Optionally clear existing commits
      if (options.clear) {
        console.log("Clearing existing commits...");
        const existingCommits = db.getAllCommits();
        for (const commit of existingCommits) {
          db.deleteCommit(commit.id);
        }
        console.log();
      }

      let totalImported = 0;
      let totalSkipped = 0;

      for (const claudePath of claudePaths) {
        const projectName = getProjectNameFromClaudePath(claudePath);
        console.log(`Importing: ${projectName}`);
        console.log(`  Path: ${claudePath}`);

        // Parse the sessions
        const result = await parseProject(claudePath, { verbose: false });

        if (result.cognitiveCommits.length === 0) {
          console.log("  No commits found\n");
          continue;
        }

        console.log(`  Found ${result.cognitiveCommits.length} commits, ${result.totalTurns} turns`);

        // Import commits
        let imported = 0;
        let skipped = 0;

        for (const commit of result.cognitiveCommits) {
          // Check if commit already exists
          const existing = db.getCommit(commit.id) ||
            (commit.gitHash ? db.getCommitByGitHash(commit.gitHash) : null);

          if (existing) {
            skipped++;
            continue;
          }

          // Set project name for global mode
          if (options.global) {
            commit.projectName = projectName;
          }

          db.insertCommit(commit);
          imported++;
        }

        console.log(`  Imported: ${imported}, Skipped: ${skipped}\n`);
        totalImported += imported;
        totalSkipped += skipped;
      }

      db.close();

      console.log("─".repeat(40));
      console.log(`Total imported: ${totalImported} commits`);
      if (totalSkipped > 0) {
        console.log(`Total skipped: ${totalSkipped} (already exist)`);
      }
      console.log();

      if (options.global) {
        console.log("Import complete! Run 'shipchronicle studio --global' to view.");
      } else {
        console.log("Import complete! Run 'shipchronicle studio' to view.");
      }
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
