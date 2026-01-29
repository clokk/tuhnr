/**
 * Entry processor for Shipchronicle daemon
 * Processes new log entries, detects commits, triggers captures
 */

import { v4 as uuidv4 } from "uuid";
import * as path from "path";
import type { LogEntry, ToolUseBlock, ToolResultBlock } from "../parser/types";
import {
  isUserEntry,
  isAssistantEntry,
  isToolUseBlock,
  isToolResultBlock,
  isTextBlock,
} from "../parser/types";
import type {
  CognitiveCommit,
  Session,
  Turn,
  ToolCall,
  ClosedBy,
} from "../models/types";
import {
  isGitCommitCommand,
  parseGitCommitResult,
  extractReadFilePath,
  extractEditFilePath,
  extractWriteFilePath,
} from "../utils/git";
import type { ShipchronicleDB } from "../storage/db";
import type { ScreenshotCapturer } from "./capturer";
import type { ShipchronicleConfig } from "../config";

export interface ProcessorOptions {
  onCommitClosed?: (commit: CognitiveCommit) => void;
  onScreenshotCaptured?: (path: string, commitId: string) => void;
  captureOnCommit?: boolean;
  verbose?: boolean;
}

interface ProcessorState {
  currentCommitId: string | null;
  currentCommitStartedAt: string | null;
  currentSessionId: string | null;
  turns: Turn[];
  filesRead: Set<string>;
  filesChanged: Set<string>;
  pendingToolCalls: Map<string, ToolUseBlock>;
}

export class EntryProcessor {
  private db: ShipchronicleDB;
  private capturer: ScreenshotCapturer | null;
  private config: ShipchronicleConfig;
  private options: ProcessorOptions;
  private state: ProcessorState;

  constructor(
    db: ShipchronicleDB,
    config: ShipchronicleConfig,
    capturer: ScreenshotCapturer | null,
    options: ProcessorOptions = {}
  ) {
    this.db = db;
    this.capturer = capturer;
    this.config = config;
    this.options = {
      captureOnCommit: true,
      ...options,
    };

    // Initialize or restore state
    this.state = this.initializeState();
  }

  private initializeState(): ProcessorState {
    // Try to restore current commit from DB
    const currentCommitId = this.db.getCurrentCommitId();

    return {
      currentCommitId,
      currentCommitStartedAt: null,
      currentSessionId: null,
      turns: [],
      filesRead: new Set(),
      filesChanged: new Set(),
      pendingToolCalls: new Map(),
    };
  }

  /**
   * Process a batch of new entries from a session file
   */
  processEntries(entries: LogEntry[], sessionFilePath: string): void {
    const sessionId = path.basename(sessionFilePath, ".jsonl");

    // Sort entries by timestamp
    const sorted = [...entries].sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Start new commit if needed
    if (!this.state.currentCommitId && sorted.length > 0) {
      this.startNewCommit(sessionId, sorted[0].timestamp);
    }

    // Update session ID
    this.state.currentSessionId = sessionId;

    for (const entry of sorted) {
      this.processEntry(entry, sessionId);
    }

    // Update last activity
    this.db.updateLastActivity();
  }

  /**
   * Process a single log entry
   */
  private processEntry(entry: LogEntry, sessionId: string): void {
    if (isUserEntry(entry)) {
      this.processUserEntry(entry, sessionId);
    } else if (isAssistantEntry(entry)) {
      this.processAssistantEntry(entry, sessionId);
    }
  }

  /**
   * Process a user entry (could be a message or tool result)
   */
  private processUserEntry(
    entry: Extract<LogEntry, { type: "user" }>,
    sessionId: string
  ): void {
    const content = entry.message.content;

    // Check if this is a tool result
    if (Array.isArray(content)) {
      for (const block of content) {
        if (isToolResultBlock(block)) {
          this.processToolResult(block, entry, sessionId);
        }
      }
      return;
    }

    // Regular user message - create a turn
    const turn: Turn = {
      id: entry.uuid,
      role: "user",
      content: typeof content === "string" ? content : JSON.stringify(content),
      timestamp: entry.timestamp,
    };

    this.state.turns.push(turn);
  }

  /**
   * Process an assistant entry
   */
  private processAssistantEntry(
    entry: Extract<LogEntry, { type: "assistant" }>,
    _sessionId: string
  ): void {
    const content = entry.message.content;
    if (!Array.isArray(content)) return;

    // Extract text content
    const textBlocks = content.filter(isTextBlock);
    const textContent = textBlocks.map((b) => b.text).join("\n");

    // Extract tool uses
    const toolUseBlocks = content.filter(isToolUseBlock);
    const toolCalls: ToolCall[] = [];

    for (const toolUse of toolUseBlocks) {
      // Track pending tool calls
      this.state.pendingToolCalls.set(toolUse.id, toolUse);

      // Track file reads
      const readPath = extractReadFilePath(toolUse);
      if (readPath) {
        this.state.filesRead.add(readPath);
      }

      // Track file edits/writes
      const editPath = extractEditFilePath(toolUse);
      if (editPath) {
        this.state.filesChanged.add(editPath);
      }

      const writePath = extractWriteFilePath(toolUse);
      if (writePath) {
        this.state.filesChanged.add(writePath);
      }

      toolCalls.push({
        id: toolUse.id,
        name: toolUse.name,
        input: toolUse.input,
      });
    }

    // Create turn if there's meaningful content
    if (textContent.trim() || toolCalls.length > 0) {
      const turn: Turn = {
        id: entry.uuid,
        role: "assistant",
        content: textContent,
        timestamp: entry.timestamp,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        triggersVisualUpdate:
          toolCalls.some((tc) => ["Edit", "Write"].includes(tc.name)) ||
          undefined,
      };

      this.state.turns.push(turn);
    }
  }

  /**
   * Process a tool result block
   */
  private processToolResult(
    block: ToolResultBlock,
    entry: Extract<LogEntry, { type: "user" }>,
    sessionId: string
  ): void {
    const toolUse = this.state.pendingToolCalls.get(block.tool_use_id);
    if (!toolUse) return;

    // Check if this is a git commit result
    if (isGitCommitCommand(toolUse) && !block.is_error) {
      const commitInfo = parseGitCommitResult(block.content);
      if (commitInfo) {
        // Close current cognitive commit with git hash
        this.closeCurrentCommit(commitInfo.hash, "git_commit", sessionId);

        // Start a new commit
        this.startNewCommit(sessionId, entry.timestamp);
      }
    }

    // Update corresponding tool call with result
    for (const turn of this.state.turns) {
      if (turn.toolCalls) {
        for (const tc of turn.toolCalls) {
          if (tc.id === block.tool_use_id) {
            tc.result = block.content;
            tc.isError = block.is_error;
          }
        }
      }
    }

    // Clean up pending tool call
    this.state.pendingToolCalls.delete(block.tool_use_id);
  }

  /**
   * Start a new cognitive commit
   */
  private startNewCommit(sessionId: string, timestamp: string): void {
    const commitId = uuidv4();
    this.state.currentCommitId = commitId;
    this.state.currentCommitStartedAt = timestamp;
    this.state.currentSessionId = sessionId;
    this.state.turns = [];
    this.state.filesRead = new Set();
    this.state.filesChanged = new Set();
    this.state.pendingToolCalls = new Map();

    // Persist current commit ID
    this.db.setCurrentCommitId(commitId);

    if (this.options.verbose) {
      console.log(`Started new cognitive commit: ${commitId}`);
    }
  }

  /**
   * Close the current cognitive commit
   */
  private async closeCurrentCommit(
    gitHash: string | null,
    closedBy: ClosedBy,
    sessionId: string
  ): Promise<void> {
    if (!this.state.currentCommitId || this.state.turns.length === 0) {
      return;
    }

    const lastTurn = this.state.turns[this.state.turns.length - 1];
    const closedAt = lastTurn?.timestamp || new Date().toISOString();

    // Create session
    const session: Session = {
      id: sessionId,
      startedAt: this.state.currentCommitStartedAt || closedAt,
      endedAt: closedAt,
      turns: [...this.state.turns],
    };

    // Create commit
    const commit: CognitiveCommit = {
      id: this.state.currentCommitId,
      gitHash,
      startedAt: this.state.currentCommitStartedAt || closedAt,
      closedAt,
      closedBy,
      sessions: [session],
      parallel: false,
      filesRead: Array.from(this.state.filesRead),
      filesChanged: Array.from(this.state.filesChanged),
    };

    // Persist to DB
    this.db.insertCommit(commit);

    if (this.options.verbose) {
      console.log(
        `Closed cognitive commit: ${commit.id} (git: ${gitHash || "none"})`
      );
    }

    // Capture screenshot if enabled and this was a git commit
    if (
      this.options.captureOnCommit &&
      this.capturer &&
      closedBy === "git_commit" &&
      this.config.captureEnabled
    ) {
      try {
        const screenshotPath = await this.capturer.captureDevServer(
          this.config.devServerPort
        );

        if (screenshotPath) {
          this.db.createVisual(
            commit.id,
            "screenshot",
            screenshotPath,
            `Auto-captured on commit ${gitHash?.substring(0, 7) || "unknown"}`
          );

          if (this.options.onScreenshotCaptured) {
            this.options.onScreenshotCaptured(screenshotPath, commit.id);
          }

          if (this.options.verbose) {
            console.log(`Screenshot captured: ${screenshotPath}`);
          }
        }
      } catch (error) {
        if (this.options.verbose) {
          console.error(`Screenshot capture failed:`, error);
        }
      }
    }

    // Callback
    if (this.options.onCommitClosed) {
      this.options.onCommitClosed(commit);
    }

    // Clear current commit ID
    this.db.setCurrentCommitId(null);
  }

  /**
   * Force close the current commit (e.g., on shutdown)
   */
  async forceClose(): Promise<void> {
    if (this.state.currentCommitId && this.state.turns.length > 0) {
      await this.closeCurrentCommit(
        null,
        "session_end",
        this.state.currentSessionId || "unknown"
      );
    }
  }

  /**
   * Get current state summary
   */
  getStatus(): {
    hasActiveCommit: boolean;
    currentCommitId: string | null;
    turnCount: number;
    filesRead: number;
    filesChanged: number;
  } {
    return {
      hasActiveCommit: this.state.currentCommitId !== null,
      currentCommitId: this.state.currentCommitId,
      turnCount: this.state.turns.length,
      filesRead: this.state.filesRead.size,
      filesChanged: this.state.filesChanged.size,
    };
  }
}
