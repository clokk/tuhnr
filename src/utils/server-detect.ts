/**
 * Dev server detection utilities
 * Detects running development servers for screenshot capture
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";

// Common dev server ports
const COMMON_PORTS = [3000, 5173, 8080, 4321, 8000, 4200, 5000, 3001];

export interface ServerInfo {
  port: number;
  url: string;
  responding: boolean;
}

/**
 * Check if a server is responding on a given port
 */
export function checkPort(port: number, host: string = "localhost"): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host,
        port,
        method: "HEAD",
        timeout: 1000,
      },
      (res) => {
        resolve(res.statusCode !== undefined);
      }
    );

    req.on("error", () => {
      resolve(false);
    });

    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

/**
 * Detect running dev server on common ports
 */
export async function detectDevServer(
  preferredPort?: number
): Promise<ServerInfo | null> {
  // Check preferred port first
  if (preferredPort) {
    const responding = await checkPort(preferredPort);
    if (responding) {
      return {
        port: preferredPort,
        url: `http://localhost:${preferredPort}`,
        responding: true,
      };
    }
  }

  // Check common ports
  for (const port of COMMON_PORTS) {
    const responding = await checkPort(port);
    if (responding) {
      return {
        port,
        url: `http://localhost:${port}`,
        responding: true,
      };
    }
  }

  return null;
}

/**
 * Detect dev server port from package.json
 */
export function detectPortFromPackageJson(projectPath: string): number | null {
  const packageJsonPath = path.join(projectPath, "package.json");

  if (!fs.existsSync(packageJsonPath)) {
    return null;
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
    if (devScript.includes("angular")) return 4200;
    if (devScript.includes("svelte")) return 5173;
    if (devScript.includes("nuxt")) return 3000;
    if (devScript.includes("remix")) return 3000;

    return 3000; // Default fallback
  } catch {
    return null;
  }
}

/**
 * Get the best URL to capture for a project
 */
export async function getBestCaptureUrl(
  projectPath: string,
  configPort?: number
): Promise<string | null> {
  // Priority: config port > package.json port > common ports
  const portFromConfig = configPort;
  const portFromPackageJson = detectPortFromPackageJson(projectPath);

  const preferredPort = portFromConfig || portFromPackageJson || undefined;

  const server = await detectDevServer(preferredPort);

  if (server) {
    return server.url;
  }

  return null;
}

/**
 * Wait for a server to become available
 */
export async function waitForServer(
  port: number,
  maxWaitMs: number = 5000,
  pollIntervalMs: number = 500
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const responding = await checkPort(port);
    if (responding) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}
