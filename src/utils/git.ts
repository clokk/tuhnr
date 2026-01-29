/**
 * Git command detection and parsing utilities
 */

import type { ToolUseBlock, ToolResultBlock, ContentBlock } from "../parser/types";

export interface GitCommitInfo {
  hash: string;
  branch: string;
  message: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

/**
 * Check if a tool use block is a git commit command
 */
export function isGitCommitCommand(toolUse: ToolUseBlock): boolean {
  if (toolUse.name !== "Bash") return false;

  const command = (toolUse.input as { command?: string }).command;
  if (!command) return false;

  // Match various git commit patterns
  return /\bgit\s+commit\b/.test(command);
}

/**
 * Check if a tool use block is a git add command
 */
export function isGitAddCommand(toolUse: ToolUseBlock): boolean {
  if (toolUse.name !== "Bash") return false;

  const command = (toolUse.input as { command?: string }).command;
  if (!command) return false;

  return /\bgit\s+add\b/.test(command);
}

/**
 * Check if a tool use block is a git status command
 */
export function isGitStatusCommand(toolUse: ToolUseBlock): boolean {
  if (toolUse.name !== "Bash") return false;

  const command = (toolUse.input as { command?: string }).command;
  if (!command) return false;

  return /\bgit\s+status\b/.test(command);
}

/**
 * Parse git commit result to extract hash and other info
 * Example output: "[main 5ab1b76] Add GitHub repo integration..."
 */
export function parseGitCommitResult(output: string): GitCommitInfo | null {
  // Match: [branch hash] message
  const commitMatch = output.match(/\[(\w+(?:\/\w+)*)\s+([a-f0-9]+)\]\s+(.+?)(?:\n|$)/);
  if (!commitMatch) return null;

  const [, branch, hash, message] = commitMatch;

  // Parse file changes: "13 files changed, 802 insertions(+), 83 deletions(-)"
  const statsMatch = output.match(
    /(\d+)\s+files?\s+changed(?:,\s+(\d+)\s+insertions?\(\+\))?(?:,\s+(\d+)\s+deletions?\(-\))?/
  );

  return {
    hash,
    branch,
    message: message.trim(),
    filesChanged: statsMatch ? parseInt(statsMatch[1], 10) : 0,
    insertions: statsMatch && statsMatch[2] ? parseInt(statsMatch[2], 10) : 0,
    deletions: statsMatch && statsMatch[3] ? parseInt(statsMatch[3], 10) : 0,
  };
}

/**
 * Extract files from git status output
 */
export function parseGitStatusOutput(
  output: string
): { staged: string[]; modified: string[]; untracked: string[] } {
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  const lines = output.split("\n");
  let section = "";

  for (const line of lines) {
    if (line.includes("Changes to be committed")) {
      section = "staged";
    } else if (line.includes("Changes not staged")) {
      section = "modified";
    } else if (line.includes("Untracked files")) {
      section = "untracked";
    } else if (line.trim().startsWith("modified:")) {
      const file = line.replace(/.*modified:\s*/, "").trim();
      if (section === "staged") staged.push(file);
      else modified.push(file);
    } else if (line.trim().startsWith("new file:")) {
      const file = line.replace(/.*new file:\s*/, "").trim();
      staged.push(file);
    } else if (line.trim().startsWith("deleted:")) {
      const file = line.replace(/.*deleted:\s*/, "").trim();
      if (section === "staged") staged.push(file);
      else modified.push(file);
    } else if (section === "untracked" && line.trim() && !line.includes("(")) {
      untracked.push(line.trim());
    }
  }

  return { staged, modified, untracked };
}

/**
 * Check if content blocks contain a successful git commit
 */
export function findGitCommitInBlocks(
  blocks: ContentBlock[]
): { toolUse: ToolUseBlock; toolUseId: string } | null {
  for (const block of blocks) {
    if (block.type === "tool_use" && isGitCommitCommand(block)) {
      return { toolUse: block, toolUseId: block.id };
    }
  }
  return null;
}

/**
 * Extract file path from Read tool use
 */
export function extractReadFilePath(toolUse: ToolUseBlock): string | null {
  if (toolUse.name !== "Read") return null;
  const input = toolUse.input as { file_path?: string };
  return input.file_path || null;
}

/**
 * Extract file path from Edit tool use
 */
export function extractEditFilePath(toolUse: ToolUseBlock): string | null {
  if (toolUse.name !== "Edit") return null;
  const input = toolUse.input as { file_path?: string };
  return input.file_path || null;
}

/**
 * Extract file path from Write tool use
 */
export function extractWriteFilePath(toolUse: ToolUseBlock): string | null {
  if (toolUse.name !== "Write") return null;
  const input = toolUse.input as { file_path?: string };
  return input.file_path || null;
}
