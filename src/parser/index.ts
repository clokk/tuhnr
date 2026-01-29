/**
 * Main parser module
 * Orchestrates parsing of Claude Code session logs
 */

import * as path from "path";
import type { ParseResult, CognitiveCommit, ProjectInfo } from "../models/types";
import {
  readJsonlFile,
  listSessionFiles,
  extractProjectName,
  extractSessionId,
} from "./reader";
import { extractCognitiveCommits, mergeCommitsFromSessions } from "./extractor";

export interface ParseOptions {
  sessionId?: string;
  verbose?: boolean;
}

/**
 * Parse all sessions in a project directory
 */
export async function parseProject(
  projectDir: string,
  options: ParseOptions = {}
): Promise<ParseResult> {
  const projectName = extractProjectName(projectDir);
  const parseErrors: string[] = [];

  // Get session files
  let sessionFiles = listSessionFiles(projectDir);

  // Filter to specific session if requested
  if (options.sessionId) {
    sessionFiles = sessionFiles.filter((f) =>
      f.includes(options.sessionId!)
    );
    if (sessionFiles.length === 0) {
      throw new Error(`Session not found: ${options.sessionId}`);
    }
  }

  if (options.verbose) {
    console.log(`Found ${sessionFiles.length} session files`);
  }

  // Parse each session
  const sessionCommits = new Map<string, CognitiveCommit[]>();
  let totalTurns = 0;

  for (const sessionFile of sessionFiles) {
    const sessionId = extractSessionId(sessionFile);

    if (options.verbose) {
      console.log(`Parsing session: ${sessionId}`);
    }

    try {
      const entries = await readJsonlFile(sessionFile);

      if (entries.length === 0) {
        if (options.verbose) {
          console.log(`  Skipping empty session`);
        }
        continue;
      }

      const commits = extractCognitiveCommits(entries, sessionId);
      sessionCommits.set(sessionId, commits);

      // Count turns
      for (const commit of commits) {
        for (const session of commit.sessions) {
          totalTurns += session.turns.length;
        }
      }

      if (options.verbose) {
        console.log(`  Found ${commits.length} cognitive commits`);
      }
    } catch (error) {
      const message = `Error parsing ${sessionFile}: ${(error as Error).message}`;
      parseErrors.push(message);
      if (options.verbose) {
        console.error(`  ${message}`);
      }
    }
  }

  // Merge commits from all sessions
  const cognitiveCommits = mergeCommitsFromSessions(sessionCommits);

  return {
    project: projectName,
    projectPath: projectDir,
    cognitiveCommits,
    totalSessions: sessionCommits.size,
    totalTurns,
    parseErrors,
  };
}

/**
 * Parse a single session file
 */
export async function parseSession(
  sessionFile: string
): Promise<CognitiveCommit[]> {
  const sessionId = extractSessionId(sessionFile);
  const entries = await readJsonlFile(sessionFile);
  return extractCognitiveCommits(entries, sessionId);
}

/**
 * Get info about a project without parsing
 */
export function getProjectInfo(projectDir: string): ProjectInfo {
  const name = extractProjectName(projectDir);
  const sessionFiles = listSessionFiles(projectDir);

  return {
    name,
    path: projectDir,
    sessionFiles,
  };
}

/**
 * Discover Claude projects in the default location
 */
export function discoverProjects(
  claudeDir: string = path.join(
    process.env.HOME || "",
    ".claude",
    "projects"
  )
): string[] {
  const fs = require("fs");

  if (!fs.existsSync(claudeDir)) {
    return [];
  }

  const entries = fs.readdirSync(claudeDir, { withFileTypes: true });
  return entries
    .filter((e: { isDirectory: () => boolean }) => e.isDirectory())
    .map((e: { name: string }) => path.join(claudeDir, e.name));
}

export { readJsonlFile, listSessionFiles, extractProjectName, extractSessionId } from "./reader";
export { extractCognitiveCommits, mergeCommitsFromSessions } from "./extractor";
