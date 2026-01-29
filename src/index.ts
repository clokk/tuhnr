#!/usr/bin/env node
/**
 * Shipchronicle CLI
 * Chronicle of shipping: explore how products evolve through human-AI collaboration
 */

import { Command } from "commander";
import * as path from "path";
import { parseProject, getProjectInfo, discoverProjects } from "./parser/index";
import type { ParseResult, CognitiveCommit } from "./models/types";

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

program.parse();
