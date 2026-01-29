/**
 * SQLite database wrapper for Shipchronicle
 */

import Database from "better-sqlite3";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { CREATE_TABLES, SCHEMA_VERSION, getMigrationSql } from "./schema";
import { ensureStorageDir } from "../config";
import type {
  CognitiveCommit,
  Session,
  Turn,
  Visual,
} from "../models/types";

const DB_FILE = "data.db";

export interface DBOptions {
  /** If true, use the path directly as storage dir (don't hash it) */
  rawStoragePath?: boolean;
}

export class ShipchronicleDB {
  private db: Database.Database;
  private projectPath: string;

  constructor(projectPath: string, options: DBOptions = {}) {
    this.projectPath = projectPath;

    // For global mode, the path is already the storage directory
    let storageDir: string;
    if (options.rawStoragePath) {
      storageDir = projectPath;
      if (!require("fs").existsSync(storageDir)) {
        require("fs").mkdirSync(storageDir, { recursive: true });
      }
    } else {
      storageDir = ensureStorageDir(projectPath);
    }

    const dbPath = path.join(storageDir, DB_FILE);

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initialize();
  }

  private initialize(): void {
    // Create tables
    this.db.exec(CREATE_TABLES);

    // Check schema version
    const versionRow = this.db
      .prepare("SELECT version FROM schema_version LIMIT 1")
      .get() as { version: number } | undefined;

    const currentVersion = versionRow?.version || 0;

    if (currentVersion < SCHEMA_VERSION) {
      // Run migrations
      const migrations = getMigrationSql(currentVersion, SCHEMA_VERSION);
      for (const sql of migrations) {
        this.db.exec(sql);
      }

      // Update version
      this.db
        .prepare(
          "INSERT OR REPLACE INTO schema_version (version) VALUES (?)"
        )
        .run(SCHEMA_VERSION);
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  // ============================================
  // Cognitive Commits
  // ============================================

  /**
   * Insert a cognitive commit
   */
  insertCommit(commit: CognitiveCommit): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cognitive_commits
      (id, git_hash, started_at, closed_at, closed_by, parallel, files_read, files_changed, published, hidden, display_order, title, project_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      commit.id,
      commit.gitHash,
      commit.startedAt,
      commit.closedAt,
      commit.closedBy,
      commit.parallel ? 1 : 0,
      JSON.stringify(commit.filesRead),
      JSON.stringify(commit.filesChanged),
      commit.published ? 1 : 0,
      commit.hidden ? 1 : 0,
      commit.displayOrder || 0,
      commit.title || null,
      commit.projectName || null
    );

    // Insert sessions
    for (const session of commit.sessions) {
      this.insertSession(session, commit.id);
    }
  }

  /**
   * Get a cognitive commit by ID
   */
  getCommit(id: string): CognitiveCommit | null {
    const row = this.db
      .prepare("SELECT * FROM cognitive_commits WHERE id = ?")
      .get(id) as CommitRow | undefined;

    if (!row) return null;

    return this.rowToCommit(row);
  }

  /**
   * Get a cognitive commit by git hash
   */
  getCommitByGitHash(gitHash: string): CognitiveCommit | null {
    const row = this.db
      .prepare("SELECT * FROM cognitive_commits WHERE git_hash = ?")
      .get(gitHash) as CommitRow | undefined;

    if (!row) return null;

    return this.rowToCommit(row);
  }

  /**
   * Get all cognitive commits
   */
  getAllCommits(): CognitiveCommit[] {
    const rows = this.db
      .prepare("SELECT * FROM cognitive_commits ORDER BY closed_at DESC")
      .all() as CommitRow[];

    return rows.map((row) => this.rowToCommit(row));
  }

  /**
   * Get recent commits
   */
  getRecentCommits(limit: number = 10): CognitiveCommit[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM cognitive_commits ORDER BY closed_at DESC LIMIT ?"
      )
      .all(limit) as CommitRow[];

    return rows.map((row) => this.rowToCommit(row));
  }

  /**
   * Get commit count
   */
  getCommitCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM cognitive_commits")
      .get() as { count: number };

    return row.count;
  }

  /**
   * Get distinct project names with commit counts
   */
  getDistinctProjects(): { name: string; count: number }[] {
    const rows = this.db
      .prepare(`
        SELECT project_name as name, COUNT(*) as count
        FROM cognitive_commits
        WHERE project_name IS NOT NULL
        GROUP BY project_name
        ORDER BY count DESC
      `)
      .all() as { name: string; count: number }[];

    return rows;
  }

  /**
   * Get commits filtered by project name
   */
  getCommitsByProject(projectName: string): CognitiveCommit[] {
    const rows = this.db
      .prepare("SELECT * FROM cognitive_commits WHERE project_name = ? ORDER BY closed_at DESC")
      .all(projectName) as CommitRow[];

    return rows.map((row) => this.rowToCommit(row));
  }

  /**
   * Update a cognitive commit (for curation)
   */
  updateCommit(
    id: string,
    updates: Partial<Pick<CognitiveCommit, "title" | "published" | "hidden" | "displayOrder">>
  ): boolean {
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title || null);
    }
    if (updates.published !== undefined) {
      fields.push("published = ?");
      values.push(updates.published ? 1 : 0);
    }
    if (updates.hidden !== undefined) {
      fields.push("hidden = ?");
      values.push(updates.hidden ? 1 : 0);
    }
    if (updates.displayOrder !== undefined) {
      fields.push("display_order = ?");
      values.push(updates.displayOrder);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE cognitive_commits SET ${fields.join(", ")} WHERE id = ?`
    );
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Delete a cognitive commit and all related data
   */
  deleteCommit(id: string): boolean {
    // Delete in order due to foreign key relationships
    const sessions = this.getSessionsForCommit(id);
    for (const session of sessions) {
      this.db.prepare("DELETE FROM turns WHERE session_id = ?").run(session.id);
    }
    this.db.prepare("DELETE FROM sessions WHERE commit_id = ?").run(id);
    this.db.prepare("DELETE FROM visuals WHERE commit_id = ?").run(id);
    const result = this.db
      .prepare("DELETE FROM cognitive_commits WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  /**
   * Bulk update commits (for batch publish)
   */
  bulkUpdateCommits(
    ids: string[],
    updates: Partial<Pick<CognitiveCommit, "published" | "hidden">>
  ): number {
    let updated = 0;
    for (const id of ids) {
      if (this.updateCommit(id, updates)) {
        updated++;
      }
    }
    return updated;
  }

  private rowToCommit(row: CommitRow): CognitiveCommit {
    const sessions = this.getSessionsForCommit(row.id);

    return {
      id: row.id,
      gitHash: row.git_hash,
      startedAt: row.started_at,
      closedAt: row.closed_at,
      closedBy: row.closed_by as CognitiveCommit["closedBy"],
      parallel: row.parallel === 1,
      filesRead: JSON.parse(row.files_read || "[]"),
      filesChanged: JSON.parse(row.files_changed || "[]"),
      sessions,
      // Curation fields
      title: row.title || undefined,
      published: row.published === 1,
      hidden: row.hidden === 1,
      displayOrder: row.display_order || 0,
      // Global mode field
      projectName: row.project_name || undefined,
    };
  }

  // ============================================
  // Sessions
  // ============================================

  /**
   * Insert a session
   */
  insertSession(session: Session, commitId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions
      (id, commit_id, started_at, ended_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(session.id, commitId, session.startedAt, session.endedAt);

    // Insert turns
    for (const turn of session.turns) {
      this.insertTurn(turn, session.id);
    }
  }

  /**
   * Get sessions for a commit
   */
  getSessionsForCommit(commitId: string): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions WHERE commit_id = ? ORDER BY started_at")
      .all(commitId) as SessionRow[];

    return rows.map((row) => this.rowToSession(row));
  }

  private rowToSession(row: SessionRow): Session {
    const turns = this.getTurnsForSession(row.id);

    return {
      id: row.id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      turns,
    };
  }

  // ============================================
  // Turns
  // ============================================

  /**
   * Insert a turn
   */
  insertTurn(turn: Turn, sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO turns
      (id, session_id, role, content, timestamp, tool_calls, triggers_visual)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      turn.id,
      sessionId,
      turn.role,
      turn.content,
      turn.timestamp,
      turn.toolCalls ? JSON.stringify(turn.toolCalls) : null,
      turn.triggersVisualUpdate ? 1 : 0
    );
  }

  /**
   * Get turns for a session
   */
  getTurnsForSession(sessionId: string): Turn[] {
    const rows = this.db
      .prepare("SELECT * FROM turns WHERE session_id = ? ORDER BY timestamp")
      .all(sessionId) as TurnRow[];

    return rows.map((row) => this.rowToTurn(row));
  }

  private rowToTurn(row: TurnRow): Turn {
    return {
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content || "",
      timestamp: row.timestamp,
      toolCalls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      triggersVisualUpdate: row.triggers_visual === 1 ? true : undefined,
    };
  }

  // ============================================
  // Visuals
  // ============================================

  /**
   * Insert a visual
   */
  insertVisual(visual: Visual): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO visuals
      (id, commit_id, type, path, captured_at, caption)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      visual.id,
      visual.commitId,
      visual.type,
      visual.path,
      visual.capturedAt,
      visual.caption || null
    );
  }

  /**
   * Get visuals for a commit
   */
  getVisualsForCommit(commitId: string): Visual[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM visuals WHERE commit_id = ? ORDER BY captured_at"
      )
      .all(commitId) as VisualRow[];

    return rows.map((row) => ({
      id: row.id,
      commitId: row.commit_id,
      type: row.type as Visual["type"],
      path: row.path,
      capturedAt: row.captured_at,
      caption: row.caption || undefined,
    }));
  }

  /**
   * Create a visual record
   */
  createVisual(
    commitId: string,
    type: Visual["type"],
    filePath: string,
    caption?: string
  ): Visual {
    const visual: Visual = {
      id: uuidv4(),
      commitId,
      type,
      path: filePath,
      capturedAt: new Date().toISOString(),
      caption,
    };

    this.insertVisual(visual);
    return visual;
  }

  /**
   * Get a visual by ID
   */
  getVisual(id: string): Visual | null {
    const row = this.db
      .prepare("SELECT * FROM visuals WHERE id = ?")
      .get(id) as VisualRow | undefined;

    if (!row) return null;

    return {
      id: row.id,
      commitId: row.commit_id,
      type: row.type as Visual["type"],
      path: row.path,
      capturedAt: row.captured_at,
      caption: row.caption || undefined,
    };
  }

  /**
   * Update a visual (for caption editing)
   */
  updateVisual(id: string, updates: { caption?: string }): boolean {
    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (updates.caption !== undefined) {
      fields.push("caption = ?");
      values.push(updates.caption || null);
    }

    if (fields.length === 0) return false;

    values.push(id);
    const stmt = this.db.prepare(
      `UPDATE visuals SET ${fields.join(", ")} WHERE id = ?`
    );
    const result = stmt.run(...values);
    return result.changes > 0;
  }

  /**
   * Delete a visual
   */
  deleteVisual(id: string): boolean {
    const result = this.db.prepare("DELETE FROM visuals WHERE id = ?").run(id);
    return result.changes > 0;
  }

  // ============================================
  // Daemon State
  // ============================================

  /**
   * Get daemon state value
   */
  getDaemonState(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM daemon_state WHERE key = ?")
      .get(key) as { value: string } | undefined;

    return row?.value || null;
  }

  /**
   * Set daemon state value
   */
  setDaemonState(key: string, value: string): void {
    this.db
      .prepare("INSERT OR REPLACE INTO daemon_state (key, value) VALUES (?, ?)")
      .run(key, value);
  }

  /**
   * Delete daemon state value
   */
  deleteDaemonState(key: string): void {
    this.db.prepare("DELETE FROM daemon_state WHERE key = ?").run(key);
  }

  /**
   * Get last activity timestamp
   */
  getLastActivity(): string | null {
    return this.getDaemonState("last_activity");
  }

  /**
   * Update last activity timestamp
   */
  updateLastActivity(): void {
    this.setDaemonState("last_activity", new Date().toISOString());
  }

  /**
   * Get file position for incremental reading
   */
  getFilePosition(filePath: string): number {
    const value = this.getDaemonState(`file_pos:${filePath}`);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Set file position for incremental reading
   */
  setFilePosition(filePath: string, position: number): void {
    this.setDaemonState(`file_pos:${filePath}`, position.toString());
  }

  /**
   * Get current commit ID (the one being worked on)
   */
  getCurrentCommitId(): string | null {
    return this.getDaemonState("current_commit_id");
  }

  /**
   * Set current commit ID
   */
  setCurrentCommitId(commitId: string | null): void {
    if (commitId) {
      this.setDaemonState("current_commit_id", commitId);
    } else {
      this.deleteDaemonState("current_commit_id");
    }
  }
}

// Row type interfaces for SQLite results
interface CommitRow {
  id: string;
  git_hash: string | null;
  started_at: string;
  closed_at: string;
  closed_by: string;
  parallel: number;
  files_read: string | null;
  files_changed: string | null;
  // Curation fields (v2)
  published: number;
  hidden: number;
  display_order: number;
  title: string | null;
  // Global mode field (v3)
  project_name: string | null;
}

interface SessionRow {
  id: string;
  commit_id: string;
  started_at: string;
  ended_at: string;
}

interface TurnRow {
  id: string;
  session_id: string;
  role: string;
  content: string | null;
  timestamp: string;
  tool_calls: string | null;
  triggers_visual: number;
}

interface VisualRow {
  id: string;
  commit_id: string;
  type: string;
  path: string;
  captured_at: string;
  caption: string | null;
}
