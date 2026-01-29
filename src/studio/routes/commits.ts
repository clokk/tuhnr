/**
 * Commit API routes
 */

import { Hono } from "hono";
import { ShipchronicleDB } from "../../storage/db";
import type { CognitiveCommit } from "../../models/types";

export function createCommitRoutes(projectPath: string): Hono {
  const app = new Hono();

  // GET /api/commits - List all commits
  app.get("/", async (c) => {
    const db = new ShipchronicleDB(projectPath);
    try {
      const commits = db.getAllCommits();

      // Get visuals for each commit
      const commitsWithVisuals = commits.map((commit) => {
        const visuals = db.getVisualsForCommit(commit.id);
        return {
          ...commit,
          visuals,
          turnCount: commit.sessions.reduce((sum, s) => sum + s.turns.length, 0),
        };
      });

      return c.json({ commits: commitsWithVisuals });
    } finally {
      db.close();
    }
  });

  // GET /api/commits/:id - Get single commit with full details
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const db = new ShipchronicleDB(projectPath);

    try {
      const commit = db.getCommit(id);
      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      const visuals = db.getVisualsForCommit(id);

      return c.json({
        commit: {
          ...commit,
          visuals,
        },
      });
    } finally {
      db.close();
    }
  });

  // PATCH /api/commits/:id - Update commit (title, published, hidden)
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{
      title?: string;
      published?: boolean;
      hidden?: boolean;
      displayOrder?: number;
    }>();

    const db = new ShipchronicleDB(projectPath);

    try {
      const commit = db.getCommit(id);
      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      const success = db.updateCommit(id, body);
      if (!success) {
        return c.json({ error: "No updates provided" }, 400);
      }

      const updated = db.getCommit(id);
      return c.json({ commit: updated });
    } finally {
      db.close();
    }
  });

  // DELETE /api/commits/:id - Delete commit
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const db = new ShipchronicleDB(projectPath);

    try {
      const commit = db.getCommit(id);
      if (!commit) {
        return c.json({ error: "Commit not found" }, 404);
      }

      const success = db.deleteCommit(id);
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
        published?: boolean;
        hidden?: boolean;
      };
    }>();

    if (!body.ids || body.ids.length === 0) {
      return c.json({ error: "No commit IDs provided" }, 400);
    }

    const db = new ShipchronicleDB(projectPath);

    try {
      const updated = db.bulkUpdateCommits(body.ids, body.updates);
      return c.json({ updated });
    } finally {
      db.close();
    }
  });

  return app;
}
