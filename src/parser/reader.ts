/**
 * JSONL file reader for Claude Code session logs
 * Handles streaming of large files (25MB+)
 */

import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";
import type { LogEntry } from "./types";

export interface ReaderOptions {
  onEntry?: (entry: LogEntry) => void;
  onError?: (error: Error, line: string) => void;
}

/**
 * Read all JSONL entries from a file
 */
export async function readJsonlFile(filePath: string): Promise<LogEntry[]> {
  const entries: LogEntry[] = [];

  await streamJsonlFile(filePath, {
    onEntry: (entry) => entries.push(entry),
    onError: (error, line) => {
      console.warn(`Parse error in ${filePath}: ${error.message}`);
    },
  });

  return entries;
}

/**
 * Stream JSONL entries from a file (for large files)
 */
export async function streamJsonlFile(
  filePath: string,
  options: ReaderOptions = {}
): Promise<void> {
  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line) as LogEntry;
      options.onEntry?.(entry);
    } catch (error) {
      options.onError?.(error as Error, line);
    }
  }
}

/**
 * Read entries as an async generator (memory efficient)
 */
export async function* readJsonlStream(
  filePath: string
): AsyncGenerator<LogEntry> {
  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    try {
      yield JSON.parse(line) as LogEntry;
    } catch {
      // Skip malformed lines
    }
  }
}

/**
 * List all session files in a project directory
 */
export function listSessionFiles(projectDir: string): string[] {
  if (!fs.existsSync(projectDir)) {
    throw new Error(`Project directory not found: ${projectDir}`);
  }

  const files = fs.readdirSync(projectDir);
  return files
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => path.join(projectDir, f))
    .sort((a, b) => {
      // Sort by modification time, newest first
      const statA = fs.statSync(a);
      const statB = fs.statSync(b);
      return statB.mtime.getTime() - statA.mtime.getTime();
    });
}

/**
 * Get project name from Claude project path
 * e.g., "-Users-connorleisz-Soteria" -> "Soteria"
 */
export function extractProjectName(projectPath: string): string {
  const dirName = path.basename(projectPath);
  // Format: -Users-username-projectname or similar
  const parts = dirName.split("-");
  return parts[parts.length - 1] || dirName;
}

/**
 * Get session ID from filename
 * e.g., "abc123-def456.jsonl" -> "abc123-def456"
 */
export function extractSessionId(filePath: string): string {
  const filename = path.basename(filePath);
  return filename.replace(".jsonl", "");
}
