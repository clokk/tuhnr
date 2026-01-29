/**
 * Output types for Shipchronicle
 * Represents the structured cognitive commit data
 */

export type ClosedBy = "git_commit" | "session_end" | "explicit";

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: string;
  isError?: boolean;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  triggersVisualUpdate?: boolean;
}

export interface Session {
  id: string;
  label?: string;
  startedAt: string;
  endedAt: string;
  turns: Turn[];
}

export interface CognitiveCommit {
  id: string;
  gitHash: string | null;
  startedAt: string;
  closedAt: string;
  closedBy: ClosedBy;
  sessions: Session[];
  parallel: boolean;
  filesRead: string[];
  filesChanged: string[];
}

export interface ParseResult {
  project: string;
  projectPath: string;
  cognitiveCommits: CognitiveCommit[];
  totalSessions: number;
  totalTurns: number;
  parseErrors: string[];
}

export interface ProjectInfo {
  name: string;
  path: string;
  sessionFiles: string[];
}

export interface Visual {
  id: string;
  commitId: string;
  type: "screenshot" | "video" | "vercel_preview";
  path: string;
  capturedAt: string;
  caption?: string;
}
