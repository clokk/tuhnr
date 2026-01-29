/**
 * Project API routes
 */

import { Hono } from "hono";
import { loadConfig } from "../../config";
import { ShipchronicleDB } from "../../storage/db";

interface ProjectRouteOptions {
  global?: boolean;
}

export function createProjectRoutes(storagePath: string, options: ProjectRouteOptions = {}): Hono {
  const app = new Hono();
  const dbOptions = { rawStoragePath: options.global };

  // GET /api/project - Get project info and stats
  app.get("/", async (c) => {
    const db = new ShipchronicleDB(storagePath, dbOptions);

    try {
      const commits = db.getAllCommits();
      const commitCount = commits.length;

      // Count published commits
      const publishedCount = commits.filter((c) => c.published).length;

      // Count total turns
      const totalTurns = commits.reduce((sum, commit) => {
        return sum + commit.sessions.reduce((s, session) => s + session.turns.length, 0);
      }, 0);

      // Count total visuals
      let visualCount = 0;
      for (const commit of commits) {
        const visuals = db.getVisualsForCommit(commit.id);
        visualCount += visuals.length;
      }

      // Get date range
      const dates = commits.flatMap((c) => [c.startedAt, c.closedAt]);
      const firstDate = dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : null;
      const lastDate = dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)) : null;

      // Get project name
      let projectName: string;
      if (options.global) {
        projectName = "All Claude History";
      } else {
        const config = loadConfig(storagePath);
        projectName = config.projectName;
      }

      return c.json({
        project: {
          name: projectName,
          path: storagePath,
          global: options.global || false,
        },
        stats: {
          commitCount,
          publishedCount,
          totalTurns,
          visualCount,
          firstDate,
          lastDate,
        },
      });
    } finally {
      db.close();
    }
  });

  // GET /api/projects - Get list of distinct projects with counts (global mode only)
  app.get("/projects", async (c) => {
    if (!options.global) {
      return c.json({ projects: [] });
    }

    const db = new ShipchronicleDB(storagePath, dbOptions);

    try {
      const projects = db.getDistinctProjects();
      const totalCount = db.getCommitCount();

      return c.json({
        projects,
        totalCount,
      });
    } finally {
      db.close();
    }
  });

  return app;
}
