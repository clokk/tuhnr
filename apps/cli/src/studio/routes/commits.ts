/**
 * Commit API routes
 */

import { Hono } from "hono";
import { CogCommitDB } from "../../storage/db";
import type { CognitiveCommit } from "../../models/types";
import { countTurns } from "../../utils/turns";

interface CommitRouteOptions {
  global?: boolean;
}

export function createCommitRoutes(projectPath: string, options: CommitRouteOptions = {}): Hono {
  const app = new Hono();
  const dbOptions = { rawStoragePath: options.global };

  // GET /api/commits - List all commits, optionally filtered by project
  app.get("/", async (c) => {
    const db = new CogCommitDB(projectPath, dbOptions);
    try {
      // Check for project filter
      const projectFilter = c.req.query("project");

      let commits;
      if (projectFilter) {
        commits = db.commits.getByProject(projectFilter);
      } else {
        commits = db.commits.getAll();
      }

      // Filter out empty and warmup commits
      commits = commits.filter((commit) => {
        // Filter out 0-turn commits
        const totalTurns = countTurns(commit.sessions);
        if (totalTurns === 0) return false;

        // Filter out warmup commits (Claude Code internal)
        const firstUserMessage = commit.sessions[0]?.turns[0]?.content || "";
        if (firstUserMessage.toLowerCase().includes("warmup")) return false;

        return true;
      });

      // Add turn count for each commit
      const commitsWithTurnCount = commits.map((commit) => ({
        ...commit,
        turnCount: countTurns(commit.sessions),
      }));

      return c.json({ commits: commitsWithTurnCount });
    } finally {
      db.close();
    }
  });

  // GET /api/commits/:id - Get single commit with full details
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const db = new CogCommitDB(projectPath, dbOptions);

    try {
      const commit = db.commits.get(id);
      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      return c.json({ commit });
    } finally {
      db.close();
    }
  });

  // PATCH /api/commits/:id - Update commit (title, hidden)
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{
      title?: string;
      hidden?: boolean;
      displayOrder?: number;
    }>();

    const db = new CogCommitDB(projectPath, dbOptions);

    try {
      const commit = db.commits.get(id);
      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      const success = db.commits.update(id, body);
      if (!success) {
        return c.json({ error: "No updates provided" }, 400);
      }

      const updated = db.commits.get(id);
      return c.json({ commit: updated });
    } finally {
      db.close();
    }
  });

  // DELETE /api/commits/:id - Delete commit
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const db = new CogCommitDB(projectPath, dbOptions);

    try {
      const commit = db.commits.get(id);
      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      const success = db.commits.delete(id);
      return c.json({ success });
    } finally {
      db.close();
    }
  });

  // POST /api/commits/bulk - Bulk update commits
  app.post("/bulk", async (c) => {
    const body = await c.req.json<{
      ids: string[];
      updates: {
        hidden?: boolean;
      };
    }>();

    if (!body.ids || body.ids.length === 0) {
      return c.json({ error: "No commit IDs provided" }, 400);
    }

    const db = new CogCommitDB(projectPath, dbOptions);

    try {
      const updated = db.commits.bulkUpdate(body.ids, body.updates);
      return c.json({ updated });
    } finally {
      db.close();
    }
  });

  return app;
}
