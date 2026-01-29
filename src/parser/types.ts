/**
 * Types for Claude Code JSONL log entries
 * Located at: ~/.claude/projects/<project-path>/<session-uuid>.jsonl
 */

// Base fields present on all log entries
export interface BaseLogEntry {
  uuid: string;
  parentUuid: string | null;
  timestamp: string; // ISO timestamp
  sessionId: string;
  type: LogEntryType;
  isSidechain: boolean;
  userType: string;
  cwd: string;
  version: string;
  gitBranch?: string;
  slug?: string;
}

export type LogEntryType =
  | "user"
  | "assistant"
  | "progress"
  | "file-history-snapshot"
  | "summary";

// Content blocks that can appear in messages
export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  signature?: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock;

// User message structure
export interface UserMessage {
  role: "user";
  content: string | ContentBlock[];
}

// Assistant message structure
export interface AssistantMessage {
  model?: string;
  id?: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  stop_reason?: string | null;
  stop_sequence?: string | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// Tool result metadata for different tool types
export interface BashToolResult {
  stdout: string;
  stderr: string;
  interrupted: boolean;
  isImage: boolean;
}

export interface ReadToolResult {
  type: "text";
  file: {
    filePath: string;
    content: string;
    numLines: number;
    startLine: number;
    totalLines: number;
  };
}

export interface EditToolResult {
  filePath: string;
  oldString: string;
  newString: string;
}

export interface GlobToolResult {
  filenames: string[];
  durationMs: number;
  numFiles: number;
  truncated: boolean;
}

export type ToolResultMetadata =
  | BashToolResult
  | ReadToolResult
  | EditToolResult
  | GlobToolResult
  | Record<string, unknown>;

// Log entry types
export interface UserLogEntry extends BaseLogEntry {
  type: "user";
  message: UserMessage;
  toolUseResult?: ToolResultMetadata;
  sourceToolAssistantUUID?: string;
  todos?: unknown[];
  thinkingMetadata?: {
    level: string;
    disabled: boolean;
    triggers: unknown[];
  };
}

export interface AssistantLogEntry extends BaseLogEntry {
  type: "assistant";
  message: AssistantMessage;
  requestId?: string;
}

export interface ProgressLogEntry extends BaseLogEntry {
  type: "progress";
  data: {
    message?: unknown;
    normalizedMessages?: unknown[];
    type: string;
    prompt?: string;
    agentId?: string;
  };
  toolUseID?: string;
  parentToolUseID?: string;
}

export interface FileHistorySnapshotEntry extends BaseLogEntry {
  type: "file-history-snapshot";
  messageId: string;
  snapshot: {
    messageId: string;
    trackedFileBackups: Record<
      string,
      {
        backupFileName: string | null;
        version: number;
        backupTime: string;
      }
    >;
    timestamp: string;
  };
  isSnapshotUpdate: boolean;
}

export interface SummaryLogEntry extends BaseLogEntry {
  type: "summary";
  summary?: string;
}

export type LogEntry =
  | UserLogEntry
  | AssistantLogEntry
  | ProgressLogEntry
  | FileHistorySnapshotEntry
  | SummaryLogEntry;

// Type guards
export function isUserEntry(entry: LogEntry): entry is UserLogEntry {
  return entry.type === "user";
}

export function isAssistantEntry(entry: LogEntry): entry is AssistantLogEntry {
  return entry.type === "assistant";
}

export function isProgressEntry(entry: LogEntry): entry is ProgressLogEntry {
  return entry.type === "progress";
}

export function isToolUseBlock(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

export function isToolResultBlock(
  block: ContentBlock
): block is ToolResultBlock {
  return block.type === "tool_result";
}

export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}
