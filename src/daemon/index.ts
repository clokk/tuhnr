/**
 * Shipchronicle Daemon
 * Main daemon module that orchestrates watching, processing, and capturing
 */

import { SessionWatcher, createWatcher } from "./watcher";
import { EntryProcessor } from "./processor";
import { ScreenshotCapturer } from "./capturer";
import { ShipchronicleDB } from "../storage/db";
import {
  loadConfig,
  writeDaemonPid,
  removeDaemonPid,
  isDaemonRunning,
  type ShipchronicleConfig,
} from "../config";
import type { LogEntry } from "../parser/types";

export interface DaemonOptions {
  verbose?: boolean;
  captureEnabled?: boolean;
}

export class ShipchronicleDaemon {
  private config: ShipchronicleConfig;
  private db: ShipchronicleDB;
  private watcher: SessionWatcher | null = null;
  private processor: EntryProcessor;
  private capturer: ScreenshotCapturer | null = null;
  private options: DaemonOptions;
  private isRunning = false;

  constructor(projectPath: string, options: DaemonOptions = {}) {
    this.config = loadConfig(projectPath);
    this.options = options;

    // Initialize storage
    this.db = new ShipchronicleDB(this.config.projectPath);

    // Initialize capturer if enabled
    const captureEnabled =
      options.captureEnabled ?? this.config.captureEnabled;
    if (captureEnabled) {
      this.capturer = new ScreenshotCapturer(this.config.projectPath);
    }

    // Initialize processor
    this.processor = new EntryProcessor(
      this.db,
      this.config,
      this.capturer,
      {
        verbose: options.verbose,
        captureOnCommit: captureEnabled,
        onCommitClosed: (commit) => {
          if (options.verbose) {
            console.log(
              `Cognitive commit closed: ${commit.gitHash || commit.id.substring(0, 8)}`
            );
          }
        },
        onScreenshotCaptured: (path, commitId) => {
          if (options.verbose) {
            console.log(`Screenshot captured for commit ${commitId}: ${path}`);
          }
        },
      }
    );
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("Daemon is already running");
    }

    if (isDaemonRunning(this.config.projectPath)) {
      throw new Error(
        "Another daemon instance is already running for this project"
      );
    }

    // Write PID file
    writeDaemonPid(this.config.projectPath, process.pid);

    // Set up signal handlers
    this.setupSignalHandlers();

    // Create and start watcher
    this.watcher = createWatcher(
      this.config.claudeProjectPath,
      this.db,
      {
        verbose: this.options.verbose,
        onNewEntries: (entries: LogEntry[], filePath: string) => {
          this.processor.processEntries(entries, filePath);
        },
        onError: (error: Error) => {
          console.error("Watcher error:", error);
        },
      }
    );

    this.isRunning = true;

    if (this.options.verbose) {
      console.log(`Daemon started for project: ${this.config.projectName}`);
      console.log(`Watching: ${this.config.claudeProjectPath}`);
      console.log(`PID: ${process.pid}`);
    }
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    if (this.options.verbose) {
      console.log("Stopping daemon...");
    }

    // Force close any pending commit
    await this.processor.forceClose();

    // Stop watcher
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }

    // Close capturer
    if (this.capturer) {
      await this.capturer.close();
      this.capturer = null;
    }

    // Close database
    this.db.close();

    // Remove PID file
    removeDaemonPid(this.config.projectPath);

    this.isRunning = false;

    if (this.options.verbose) {
      console.log("Daemon stopped");
    }
  }

  /**
   * Get daemon status
   */
  getStatus(): {
    running: boolean;
    projectName: string;
    projectPath: string;
    claudeProjectPath: string;
    commitCount: number;
    lastActivity: string | null;
    processorStatus: ReturnType<EntryProcessor["getStatus"]>;
  } {
    return {
      running: this.isRunning,
      projectName: this.config.projectName,
      projectPath: this.config.projectPath,
      claudeProjectPath: this.config.claudeProjectPath,
      commitCount: this.db.getCommitCount(),
      lastActivity: this.db.getLastActivity(),
      processorStatus: this.processor.getStatus(),
    };
  }

  /**
   * Manually trigger a screenshot capture
   */
  async captureScreenshot(url?: string): Promise<string | null> {
    if (!this.capturer) {
      throw new Error("Screenshot capture is not enabled");
    }

    if (url) {
      return this.capturer.captureUrl(url);
    }

    return this.capturer.captureDevServer(this.config.devServerPort);
  }

  /**
   * Get database instance (for CLI status commands)
   */
  getDb(): ShipchronicleDB {
    return this.db;
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const shutdown = async (signal: string) => {
      if (this.options.verbose) {
        console.log(`\nReceived ${signal}, shutting down...`);
      }
      await this.stop();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  }
}

/**
 * Run daemon in foreground
 */
export async function runDaemon(
  projectPath: string,
  options: DaemonOptions = {}
): Promise<void> {
  const daemon = new ShipchronicleDaemon(projectPath, options);
  await daemon.start();

  // Keep process alive
  await new Promise(() => {});
}

export { SessionWatcher, createWatcher } from "./watcher";
export { EntryProcessor } from "./processor";
export { ScreenshotCapturer, captureScreenshot } from "./capturer";
