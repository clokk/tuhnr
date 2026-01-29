/**
 * File system watcher for Claude Code session files
 * Monitors JSONL files for changes and emits new entries
 */

import * as chokidar from "chokidar";
import * as fs from "fs";
import * as readline from "readline";
import type { LogEntry } from "../parser/types";
import type { ShipchronicleDB } from "../storage/db";

export interface WatcherOptions {
  onNewEntries: (entries: LogEntry[], filePath: string) => void;
  onError?: (error: Error) => void;
  verbose?: boolean;
}

export class SessionWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private claudeProjectPath: string;
  private db: ShipchronicleDB;
  private options: WatcherOptions;
  private filePositions: Map<string, number> = new Map();

  constructor(
    claudeProjectPath: string,
    db: ShipchronicleDB,
    options: WatcherOptions
  ) {
    this.claudeProjectPath = claudeProjectPath;
    this.db = db;
    this.options = options;

    // Load saved file positions from DB
    this.loadFilePositions();
  }

  /**
   * Start watching for session file changes
   */
  start(): void {
    if (this.watcher) {
      return;
    }

    const watchPattern = `${this.claudeProjectPath}/*.jsonl`;

    if (this.options.verbose) {
      console.log(`Starting watcher on: ${watchPattern}`);
    }

    this.watcher = chokidar.watch(watchPattern, {
      persistent: true,
      ignoreInitial: false, // Process existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      usePolling: false,
    });

    this.watcher.on("add", (filePath) => this.handleFileAdd(filePath));
    this.watcher.on("change", (filePath) => this.handleFileChange(filePath));
    this.watcher.on("error", (error) => this.handleError(error));

    if (this.options.verbose) {
      this.watcher.on("ready", () => {
        console.log("Watcher ready, monitoring for changes...");
      });
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;

      // Save file positions to DB
      this.saveFilePositions();
    }
  }

  /**
   * Handle new file added
   */
  private async handleFileAdd(filePath: string): Promise<void> {
    if (this.options.verbose) {
      console.log(`New session file detected: ${filePath}`);
    }

    // Read from last known position (or 0 for new files)
    await this.readNewEntries(filePath);
  }

  /**
   * Handle file change
   */
  private async handleFileChange(filePath: string): Promise<void> {
    if (this.options.verbose) {
      console.log(`Session file changed: ${filePath}`);
    }

    await this.readNewEntries(filePath);
  }

  /**
   * Handle watcher error
   */
  private handleError(error: Error): void {
    if (this.options.onError) {
      this.options.onError(error);
    } else {
      console.error("Watcher error:", error);
    }
  }

  /**
   * Read new entries from a file starting from last known position
   */
  private async readNewEntries(filePath: string): Promise<void> {
    try {
      const stats = fs.statSync(filePath);
      const currentSize = stats.size;
      const lastPosition = this.filePositions.get(filePath) || 0;

      // Handle file truncation (file was replaced or rotated)
      if (currentSize < lastPosition) {
        if (this.options.verbose) {
          console.log(`File truncated, reading from start: ${filePath}`);
        }
        this.filePositions.set(filePath, 0);
        await this.readNewEntries(filePath);
        return;
      }

      // No new content
      if (currentSize === lastPosition) {
        return;
      }

      const entries = await this.readEntriesFromPosition(
        filePath,
        lastPosition
      );

      if (entries.length > 0) {
        this.options.onNewEntries(entries, filePath);
      }

      // Update position
      this.filePositions.set(filePath, currentSize);
      this.db.setFilePosition(filePath, currentSize);
    } catch (error) {
      this.handleError(error as Error);
    }
  }

  /**
   * Read JSONL entries from a specific byte position
   */
  private async readEntriesFromPosition(
    filePath: string,
    startPosition: number
  ): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];

    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filePath, {
        encoding: "utf-8",
        start: startPosition,
      });

      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      rl.on("line", (line) => {
        if (!line.trim()) return;

        try {
          const entry = JSON.parse(line) as LogEntry;
          entries.push(entry);
        } catch {
          // Skip malformed lines
          if (this.options.verbose) {
            console.log(`Skipping malformed line in ${filePath}`);
          }
        }
      });

      rl.on("close", () => {
        resolve(entries);
      });

      rl.on("error", reject);
    });
  }

  /**
   * Load file positions from database
   */
  private loadFilePositions(): void {
    // Get all JSONL files in the Claude project directory
    if (!fs.existsSync(this.claudeProjectPath)) {
      return;
    }

    const files = fs.readdirSync(this.claudeProjectPath);
    for (const file of files) {
      if (file.endsWith(".jsonl")) {
        const filePath = `${this.claudeProjectPath}/${file}`;
        const position = this.db.getFilePosition(filePath);
        if (position > 0) {
          this.filePositions.set(filePath, position);
        }
      }
    }
  }

  /**
   * Save file positions to database
   */
  private saveFilePositions(): void {
    for (const [filePath, position] of this.filePositions) {
      this.db.setFilePosition(filePath, position);
    }
  }
}

/**
 * Create and start a session watcher
 */
export function createWatcher(
  claudeProjectPath: string,
  db: ShipchronicleDB,
  options: WatcherOptions
): SessionWatcher {
  const watcher = new SessionWatcher(claudeProjectPath, db, options);
  watcher.start();
  return watcher;
}
