/**
 * Visual API routes
 */

import { Hono } from "hono";
import * as fs from "fs";
import * as path from "path";
import { ShipchronicleDB } from "../../storage/db";

interface VisualRouteOptions {
  global?: boolean;
}

export function createVisualRoutes(projectPath: string, options: VisualRouteOptions = {}): Hono {
  const app = new Hono();
  const dbOptions = { rawStoragePath: options.global };

  // GET /api/visuals/:id/image - Serve screenshot file
  app.get("/:id/image", async (c) => {
    const id = c.req.param("id");
    const db = new ShipchronicleDB(projectPath, dbOptions);

    try {
      const visual = db.getVisual(id);
      if (!visual) {
        return c.json({ error: "Visual not found" }, 404);
      }

      // Check if file exists
      if (!fs.existsSync(visual.path)) {
        return c.json({ error: "Image file not found" }, 404);
      }

      // Read and return the image
      const imageBuffer = fs.readFileSync(visual.path);
      const ext = path.extname(visual.path).toLowerCase();

      let contentType = "image/png";
      if (ext === ".jpg" || ext === ".jpeg") {
        contentType = "image/jpeg";
      } else if (ext === ".gif") {
        contentType = "image/gif";
      } else if (ext === ".webp") {
        contentType = "image/webp";
      }

      c.header("Content-Type", contentType);
      c.header("Cache-Control", "public, max-age=31536000");

      return c.body(imageBuffer);
    } finally {
      db.close();
    }
  });

  // GET /api/visuals/:id - Get visual metadata
  app.get("/:id", async (c) => {
    const id = c.req.param("id");
    const db = new ShipchronicleDB(projectPath, dbOptions);

    try {
      const visual = db.getVisual(id);
      if (!visual) {
        return c.json({ error: "Visual not found" }, 404);
      }

      return c.json({ visual });
    } finally {
      db.close();
    }
  });

  // PATCH /api/visuals/:id - Update visual (caption)
  app.patch("/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<{ caption?: string }>();

    const db = new ShipchronicleDB(projectPath, dbOptions);

    try {
      const visual = db.getVisual(id);
      if (!visual) {
        return c.json({ error: "Visual not found" }, 404);
      }

      const success = db.updateVisual(id, body);
      if (!success) {
        return c.json({ error: "No updates provided" }, 400);
      }

      const updated = db.getVisual(id);
      return c.json({ visual: updated });
    } finally {
      db.close();
    }
  });

  // DELETE /api/visuals/:id - Delete visual
  app.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const db = new ShipchronicleDB(projectPath, dbOptions);

    try {
      const visual = db.getVisual(id);
      if (!visual) {
        return c.json({ error: "Visual not found" }, 404);
      }

      // Optionally delete the file too
      const deleteFile = c.req.query("deleteFile") === "true";
      if (deleteFile && fs.existsSync(visual.path)) {
        fs.unlinkSync(visual.path);
      }

      const success = db.deleteVisual(id);
      return c.json({ success });
    } finally {
      db.close();
    }
  });

  return app;
}
