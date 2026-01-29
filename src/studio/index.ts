/**
 * Shipchronicle Studio - Web-based curation interface
 */

import { serve } from "@hono/node-server";
import { createApp } from "./server";
import { loadConfig } from "../config";
import { exec } from "child_process";
import * as path from "path";
import * as fs from "fs";

const DEFAULT_PORT = 4747;

export interface StudioOptions {
  port?: number;
  open?: boolean;
  global?: boolean;
}

export async function startStudio(
  storagePath: string,
  options: StudioOptions = {}
): Promise<void> {
  const port = options.port || DEFAULT_PORT;

  // Get project name
  let projectName: string;
  if (options.global) {
    projectName = "All Claude History";
  } else {
    const config = loadConfig(storagePath);
    projectName = config.projectName;
  }

  // Create the Hono app
  const app = createApp(storagePath, { global: options.global });

  // Start the server
  const server = serve({
    fetch: app.fetch,
    port,
  });

  console.log(`\nShipchronicle Studio`);
  console.log(`${"─".repeat(40)}`);
  console.log(`Mode: ${options.global ? "Global" : "Project"}`);
  console.log(`Project: ${projectName}`);
  console.log(`URL: http://localhost:${port}`);
  console.log(`\nPress Ctrl+C to stop\n`);

  // Open browser if requested
  if (options.open !== false) {
    const url = `http://localhost:${port}`;
    openBrowser(url);
  }

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down studio...");
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\nShutting down studio...");
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

function openBrowser(url: string): void {
  const platform = process.platform;
  let cmd: string;

  switch (platform) {
    case "darwin":
      cmd = `open "${url}"`;
      break;
    case "win32":
      cmd = `start "${url}"`;
      break;
    default:
      cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (error) => {
    if (error) {
      console.log(`Could not open browser automatically. Please visit: ${url}`);
    }
  });
}
