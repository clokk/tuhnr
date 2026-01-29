/**
 * Hono server setup for Shipchronicle Studio
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "@hono/node-server/serve-static";
import * as path from "path";
import * as fs from "fs";

import { createCommitRoutes } from "./routes/commits";
import { createVisualRoutes } from "./routes/visuals";
import { createProjectRoutes } from "./routes/project";

export interface ServerOptions {
  global?: boolean;
}

export function createApp(storagePath: string, options: ServerOptions = {}): Hono {
  const app = new Hono();

  // Enable CORS for development
  app.use("*", cors());

  // Mount API routes
  app.route("/api/project", createProjectRoutes(storagePath, options));
  app.route("/api/commits", createCommitRoutes(storagePath));
  app.route("/api/visuals", createVisualRoutes(storagePath));

  // Serve static frontend files
  // In compiled mode, __dirname is dist/studio, but frontend is built to src/studio/frontend/dist
  // We resolve relative to the package root instead
  const packageRoot = path.resolve(__dirname, "../..");
  const distPath = path.join(packageRoot, "src", "studio", "frontend", "dist");

  if (fs.existsSync(distPath)) {
    // Serve built frontend in production
    app.use("/*", serveStatic({ root: distPath }));

    // SPA fallback - serve index.html for all non-API routes
    app.get("*", async (c) => {
      const indexPath = path.join(distPath, "index.html");
      const html = fs.readFileSync(indexPath, "utf-8");
      return c.html(html);
    });
  } else {
    // Development mode - serve a simple HTML that loads from Vite dev server
    app.get("/", (c) => {
      return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shipchronicle Studio</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0c0a09;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    h1 { color: #38bdf8; margin-bottom: 1rem; }
    p { color: #a1a1aa; margin-bottom: 2rem; }
    code {
      background: #18181b;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      display: block;
      margin: 1rem 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Shipchronicle Studio</h1>
    <p>Frontend not built. Run the build command first:</p>
    <code>npm run build:studio</code>
    <p>Or for development with hot reload:</p>
    <code>npm run dev:studio</code>
  </div>
</body>
</html>
      `);
    });
  }

  return app;
}
