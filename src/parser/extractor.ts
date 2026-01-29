/**
 * Cognitive Commit Extractor
 * Extracts cognitive commits from Claude Code session logs
 */

import { v4 as uuidv4 } from "uuid";
import type {
  LogEntry,
  UserLogEntry,
  AssistantLogEntry,
  ContentBlock,
  ToolUseBlock,
  ToolResultBlock,
} from "./types";
import {
  isUserEntry,
  isAssistantEntry,
  isToolUseBlock,
  isToolResultBlock,
  isTextBlock,
} from "./types";
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

interface ParserState {
  currentCommit: Partial<CognitiveCommit> | null;
  currentSession: Partial<Session> | null;
  turns: Turn[];
  filesRead: Set<string>;
  filesChanged: Set<string>;
  pendingToolCalls: Map<string, ToolUseBlock>;
  commits: CognitiveCommit[];
}

/**
 * Extract cognitive commits from a list of log entries
 */
export function extractCognitiveCommits(
  entries: LogEntry[],
  sessionId: string
): CognitiveCommit[] {
  // Sort entries by timestamp
  const sorted = [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const state: ParserState = {
    currentCommit: null,
    currentSession: null,
    turns: [],
    filesRead: new Set(),
    filesChanged: new Set(),
    pendingToolCalls: new Map(),
    commits: [],
  };

  // Initialize first commit
  startNewCommit(state, sessionId, sorted[0]?.timestamp);

  for (const entry of sorted) {
    processEntry(entry, state, sessionId);
  }

  // Close final commit with session end
  closeCurrentCommit(state, null, "session_end", sessionId);

  return state.commits;
}

function startNewCommit(
  state: ParserState,
  sessionId: string,
  timestamp?: string
): void {
  state.currentCommit = {
    id: uuidv4(),
    gitHash: null,
    startedAt: timestamp || new Date().toISOString(),
    closedAt: "",
    closedBy: "session_end",
    sessions: [],
    parallel: false,
    filesRead: [],
    filesChanged: [],
  };

  state.currentSession = {
    id: sessionId,
    startedAt: timestamp || new Date().toISOString(),
    endedAt: "",
    turns: [],
  };

  state.turns = [];
  state.filesRead = new Set();
  state.filesChanged = new Set();
  state.pendingToolCalls = new Map();
}

function closeCurrentCommit(
  state: ParserState,
  gitHash: string | null,
  closedBy: ClosedBy,
  sessionId: string
): void {
  if (!state.currentCommit || !state.currentSession) return;

  // Only save commits that have actual turns
  if (state.turns.length === 0) return;

  const lastTurn = state.turns[state.turns.length - 1];
  const closedAt = lastTurn?.timestamp || new Date().toISOString();

  // Finalize current session
  state.currentSession.endedAt = closedAt;
  state.currentSession.turns = [...state.turns];

  // Finalize commit
  const commit: CognitiveCommit = {
    id: state.currentCommit.id || uuidv4(),
    gitHash,
    startedAt: state.currentCommit.startedAt || closedAt,
    closedAt,
    closedBy,
    sessions: [state.currentSession as Session],
    parallel: false,
    filesRead: Array.from(state.filesRead),
    filesChanged: Array.from(state.filesChanged),
  };

  state.commits.push(commit);

  // Start new commit if this was a git commit (not session end)
  if (closedBy === "git_commit") {
    startNewCommit(state, sessionId, closedAt);
  }
}

function processEntry(
  entry: LogEntry,
  state: ParserState,
  sessionId: string
): void {
  if (isUserEntry(entry)) {
    processUserEntry(entry, state, sessionId);
  } else if (isAssistantEntry(entry)) {
    processAssistantEntry(entry, state, sessionId);
  }
  // Skip progress and file-history entries for now
}

function processUserEntry(
  entry: UserLogEntry,
  state: ParserState,
  sessionId: string
): void {
  const content = entry.message.content;

  // Check if this is a tool result
  if (Array.isArray(content)) {
    for (const block of content) {
      if (isToolResultBlock(block)) {
        processToolResult(block, entry, state, sessionId);
      }
    }
    return;
  }

  // Regular user message
  const turn: Turn = {
    id: entry.uuid,
    role: "user",
    content: typeof content === "string" ? content : JSON.stringify(content),
    timestamp: entry.timestamp,
  };

  state.turns.push(turn);
}

function processAssistantEntry(
  entry: AssistantLogEntry,
  state: ParserState,
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
    // Track pending tool calls to match with results
    state.pendingToolCalls.set(toolUse.id, toolUse);

    // Track file reads
    const readPath = extractReadFilePath(toolUse);
    if (readPath) {
      state.filesRead.add(readPath);
    }

    // Track file edits/writes
    const editPath = extractEditFilePath(toolUse);
    if (editPath) {
      state.filesChanged.add(editPath);
    }

    const writePath = extractWriteFilePath(toolUse);
    if (writePath) {
      state.filesChanged.add(writePath);
    }

    toolCalls.push({
      id: toolUse.id,
      name: toolUse.name,
      input: toolUse.input,
    });
  }

  // Only add turn if there's meaningful content
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

    state.turns.push(turn);
  }
}

function processToolResult(
  block: ToolResultBlock,
  entry: UserLogEntry,
  state: ParserState,
  sessionId: string
): void {
  const toolUse = state.pendingToolCalls.get(block.tool_use_id);
  if (!toolUse) return;

  // Check if this is a git commit result
  if (isGitCommitCommand(toolUse) && !block.is_error) {
    const commitInfo = parseGitCommitResult(block.content);
    if (commitInfo) {
      // Close current commit with git hash
      closeCurrentCommit(state, commitInfo.hash, "git_commit", sessionId);
    }
  }

  // Update the corresponding tool call with result
  // Find the turn with this tool call and add the result
  for (const turn of state.turns) {
    if (turn.toolCalls) {
      for (const tc of turn.toolCalls) {
        if (tc.id === block.tool_use_id) {
          tc.result = block.content;
          tc.isError = block.is_error;
        }
      }
    }
  }

  // Clean up
  state.pendingToolCalls.delete(block.tool_use_id);
}

/**
 * Merge cognitive commits from multiple sessions
 * Handles parallel Claude sessions
 */
export function mergeCommitsFromSessions(
  sessionCommits: Map<string, CognitiveCommit[]>
): CognitiveCommit[] {
  // Flatten all commits
  const allCommits: CognitiveCommit[] = [];

  for (const commits of sessionCommits.values()) {
    allCommits.push(...commits);
  }

  // Sort by start time
  allCommits.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );

  // Detect overlapping commits (parallel work)
  for (let i = 0; i < allCommits.length; i++) {
    for (let j = i + 1; j < allCommits.length; j++) {
      const a = allCommits[i];
      const b = allCommits[j];

      // Check if commits overlap in time
      const aStart = new Date(a.startedAt).getTime();
      const aEnd = new Date(a.closedAt).getTime();
      const bStart = new Date(b.startedAt).getTime();
      const bEnd = new Date(b.closedAt).getTime();

      if (aStart < bEnd && bStart < aEnd) {
        a.parallel = true;
        b.parallel = true;
      }
    }
  }

  // Group commits by git hash (merge commits to same hash)
  const commitsByHash = new Map<string, CognitiveCommit[]>();

  for (const commit of allCommits) {
    const key = commit.gitHash || `no-hash-${commit.id}`;
    const existing = commitsByHash.get(key) || [];
    existing.push(commit);
    commitsByHash.set(key, existing);
  }

  // Merge commits with same git hash
  const mergedCommits: CognitiveCommit[] = [];

  for (const commits of commitsByHash.values()) {
    if (commits.length === 1) {
      mergedCommits.push(commits[0]);
    } else {
      // Merge multiple commits to same hash
      const merged: CognitiveCommit = {
        id: commits[0].id,
        gitHash: commits[0].gitHash,
        startedAt: commits
          .map((c) => c.startedAt)
          .sort()[0],
        closedAt: commits
          .map((c) => c.closedAt)
          .sort()
          .reverse()[0],
        closedBy: commits[0].closedBy,
        sessions: commits.flatMap((c) => c.sessions),
        parallel: true,
        filesRead: [...new Set(commits.flatMap((c) => c.filesRead))],
        filesChanged: [...new Set(commits.flatMap((c) => c.filesChanged))],
      };
      mergedCommits.push(merged);
    }
  }

  return mergedCommits.sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
}
