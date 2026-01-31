/**
 * Configuration management for Agentlogs
 * Handles project-level config stored in .agentlogs/config.json
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

export interface AgentlogsConfig {
  projectName: string;
  projectPath: string;
  claudeProjectPath: string;
  devServerPort?: number;
  captureEnabled: boolean;
  storage: "local" | "cloud";
}

const CONFIG_DIR = ".agentlogs";
const CONFIG_FILE = "config.json";
const DAEMON_PID_FILE = "daemon.pid";

/**
 * Get the .agentlogs directory path for a project
 */
export function getConfigDir(projectPath: string): string {
  return path.join(projectPath, CONFIG_DIR);
}

/**
 * Get the config file path for a project
 */
export function getConfigPath(projectPath: string): string {
  return path.join(getConfigDir(projectPath), CONFIG_FILE);
}

/**
 * Get the daemon PID file path for a project
 */
export function getDaemonPidPath(projectPath: string): string {
  return path.join(getConfigDir(projectPath), DAEMON_PID_FILE);
}

/**
 * Check if a project is initialized
 */
export function isInitialized(projectPath: string): boolean {
  return fs.existsSync(getConfigPath(projectPath));
}

/**
 * Load config from project directory
 */
export function loadConfig(projectPath: string): AgentlogsConfig {
  const configPath = getConfigPath(projectPath);

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Project not initialized. Run 'agentlogs init' first.`
    );
  }

  const content = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(content) as AgentlogsConfig;
}

/**
 * Save config to project directory
 */
export function saveConfig(
  projectPath: string,
  config: AgentlogsConfig
): void {
  const configDir = getConfigDir(projectPath);
  const configPath = getConfigPath(projectPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Auto-detect Claude project path from cwd
 * Claude stores projects at ~/.claude/projects/-Users-username-projectname
 */
export function detectClaudeProjectPath(projectPath: string): string | null {
  const home = process.env.HOME || "";
  const claudeProjectsDir = path.join(home, ".claude", "projects");

  if (!fs.existsSync(claudeProjectsDir)) {
    return null;
  }

  // Convert project path to Claude's naming convention
  // /Users/connorleisz/myproject -> -Users-connorleisz-myproject
  const normalizedPath = projectPath.replace(/^\//, "").replace(/\//g, "-");
  const claudeProjectPath = path.join(claudeProjectsDir, `-${normalizedPath}`);

  if (fs.existsSync(claudeProjectPath)) {
    return claudeProjectPath;
  }

  // Try to find matching project in Claude projects dir
  const entries = fs.readdirSync(claudeProjectsDir);
  const projectName = path.basename(projectPath);

  for (const entry of entries) {
    if (entry.endsWith(`-${projectName}`)) {
      const fullPath = path.join(claudeProjectsDir, entry);
      if (fs.statSync(fullPath).isDirectory()) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Detect dev server port from package.json
 */
export function detectDevServerPort(projectPath: string): number | undefined {
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    // Check dev script for port
    const devScript = scripts.dev || scripts.start || "";

    // Common port patterns
    const portMatch = devScript.match(/(?:--port|:|-p)\s*(\d{4})/);
    if (portMatch) {
      return parseInt(portMatch[1], 10);
    }

    // Framework defaults
    if (devScript.includes("next")) return 3000;
    if (devScript.includes("vite")) return 5173;
    if (devScript.includes("astro")) return 4321;
    if (devScript.includes("webpack-dev-server")) return 8080;
    if (devScript.includes("react-scripts")) return 3000;

    return 3000; // Default fallback
  } catch {
    return undefined;
  }
}

/**
 * Initialize a new project config
 */
export function initializeProject(
  projectPath: string,
  options: Partial<AgentlogsConfig> = {}
): AgentlogsConfig {
  const resolvedPath = path.resolve(projectPath);
  const projectName = options.projectName || path.basename(resolvedPath);
  const claudeProjectPath =
    options.claudeProjectPath || detectClaudeProjectPath(resolvedPath);

  if (!claudeProjectPath) {
    throw new Error(
      `Could not detect Claude project path. Please specify with --claude-path`
    );
  }

  const config: AgentlogsConfig = {
    projectName,
    projectPath: resolvedPath,
    claudeProjectPath,
    devServerPort: options.devServerPort || detectDevServerPort(resolvedPath),
    captureEnabled: options.captureEnabled ?? true,
    storage: options.storage || "local",
  };

  saveConfig(resolvedPath, config);

  // Add .agentlogs to .gitignore if not already
  addToGitignore(resolvedPath);

  return config;
}

/**
 * Add .agentlogs to .gitignore
 */
function addToGitignore(projectPath: string): void {
  const gitignorePath = path.join(projectPath, ".gitignore");

  if (!fs.existsSync(gitignorePath)) {
    return;
  }

  const content = fs.readFileSync(gitignorePath, "utf-8");

  if (!content.includes(CONFIG_DIR)) {
    fs.appendFileSync(gitignorePath, `\n# Agentlogs\n${CONFIG_DIR}/\n`);
  }
}

/**
 * Get storage directory for a project
 * Uses a hash of the project path for the directory name
 */
export function getStorageDir(projectPath: string): string {
  const home = process.env.HOME || "";
  const hash = crypto
    .createHash("md5")
    .update(projectPath)
    .digest("hex")
    .substring(0, 12);
  return path.join(home, ".agentlogs", hash);
}

/**
 * Ensure storage directory exists
 */
export function ensureStorageDir(projectPath: string): string {
  const storageDir = getStorageDir(projectPath);

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  return storageDir;
}

/**
 * Write daemon PID file
 */
export function writeDaemonPid(projectPath: string, pid: number): void {
  const pidPath = getDaemonPidPath(projectPath);
  const configDir = getConfigDir(projectPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(pidPath, pid.toString());
}

/**
 * Read daemon PID file
 */
export function readDaemonPid(projectPath: string): number | null {
  const pidPath = getDaemonPidPath(projectPath);

  if (!fs.existsSync(pidPath)) {
    return null;
  }

  const content = fs.readFileSync(pidPath, "utf-8").trim();
  const pid = parseInt(content, 10);

  return isNaN(pid) ? null : pid;
}

/**
 * Remove daemon PID file
 */
export function removeDaemonPid(projectPath: string): void {
  const pidPath = getDaemonPidPath(projectPath);

  if (fs.existsSync(pidPath)) {
    fs.unlinkSync(pidPath);
  }
}

/**
 * Check if daemon is running
 */
export function isDaemonRunning(projectPath: string): boolean {
  const pid = readDaemonPid(projectPath);

  if (!pid) {
    return false;
  }

  try {
    // Signal 0 just checks if process exists
    process.kill(pid, 0);
    return true;
  } catch {
    // Process doesn't exist, clean up stale PID file
    removeDaemonPid(projectPath);
    return false;
  }
}

/**
 * Get global storage directory for all Claude history
 */
export function getGlobalStorageDir(): string {
  const home = process.env.HOME || "";
  return path.join(home, ".agentlogs", "global");
}

/**
 * Ensure global storage directory exists
 */
export function ensureGlobalStorageDir(): string {
  const storageDir = getGlobalStorageDir();

  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  return storageDir;
}

/**
 * Discover all Claude Code projects
 */
export function discoverAllClaudeProjects(): string[] {
  const home = process.env.HOME || "";
  const claudeProjectsDir = path.join(home, ".claude", "projects");

  if (!fs.existsSync(claudeProjectsDir)) {
    return [];
  }

  const entries = fs.readdirSync(claudeProjectsDir);
  const projects: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(claudeProjectsDir, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      // Check if it has any .jsonl files
      const files = fs.readdirSync(fullPath);
      if (files.some((f) => f.endsWith(".jsonl"))) {
        projects.push(fullPath);
      }
    }
  }

  return projects;
}

/**
 * Get project name from Claude project path
 * e.g., -Users-connorleisz-connor-portfolio -> connor-portfolio
 *
 * Claude encodes paths by replacing / with - and adding leading -.
 * This is lossy for hyphenated directory names, so we check the filesystem.
 */
export function getProjectNameFromClaudePath(claudePath: string): string {
  const basename = path.basename(claudePath);

  // Try to match macOS pattern: -Users-{username}-{rest}
  const macMatch = basename.match(/^-Users-([^-]+)-(.+)$/);
  if (macMatch) {
    const username = macMatch[1];
    const rest = macMatch[2];
    const basePath = `/Users/${username}`;

    // Try progressively joining segments with hyphens to find existing path
    const segments = rest.split("-");
    for (let i = segments.length; i >= 1; i--) {
      const projectName = segments.slice(0, i).join("-");
      const testPath = path.join(basePath, projectName);
      if (fs.existsSync(testPath) && fs.statSync(testPath).isDirectory()) {
        return projectName;
      }
    }
    // Fallback: return last segment
    return segments[segments.length - 1];
  }

  // Try Linux pattern: -home-{username}-{rest}
  const linuxMatch = basename.match(/^-home-([^-]+)-(.+)$/);
  if (linuxMatch) {
    const username = linuxMatch[1];
    const rest = linuxMatch[2];
    const basePath = `/home/${username}`;

    const segments = rest.split("-");
    for (let i = segments.length; i >= 1; i--) {
      const projectName = segments.slice(0, i).join("-");
      const testPath = path.join(basePath, projectName);
      if (fs.existsSync(testPath) && fs.statSync(testPath).isDirectory()) {
        return projectName;
      }
    }
    return segments[segments.length - 1];
  }

  // Fallback for other patterns (e.g., -Users-username with no project)
  const parts = basename.split("-").filter(Boolean);
  return parts[parts.length - 1] || basename;
}
