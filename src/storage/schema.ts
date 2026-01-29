/**
 * SQLite schema definitions for Shipchronicle
 */

export const SCHEMA_VERSION = 2;

export const CREATE_TABLES = `
-- Cognitive commits (persisted)
CREATE TABLE IF NOT EXISTS cognitive_commits (
  id TEXT PRIMARY KEY,
  git_hash TEXT,
  started_at TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  closed_by TEXT NOT NULL,
  parallel INTEGER DEFAULT 0,
  files_read TEXT,
  files_changed TEXT
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  commit_id TEXT REFERENCES cognitive_commits(id),
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL
);

-- Turns (conversation)
CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT,
  timestamp TEXT NOT NULL,
  tool_calls TEXT,
  triggers_visual INTEGER DEFAULT 0
);

-- Visuals (screenshots/previews)
CREATE TABLE IF NOT EXISTS visuals (
  id TEXT PRIMARY KEY,
  commit_id TEXT REFERENCES cognitive_commits(id),
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  caption TEXT
);

-- Daemon state
CREATE TABLE IF NOT EXISTS daemon_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Schema version
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sessions_commit ON sessions(commit_id);
CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id);
CREATE INDEX IF NOT EXISTS idx_visuals_commit ON visuals(commit_id);
CREATE INDEX IF NOT EXISTS idx_commits_git_hash ON cognitive_commits(git_hash);
CREATE INDEX IF NOT EXISTS idx_commits_started ON cognitive_commits(started_at);
`;

export const MIGRATIONS: { version: number; sql: string }[] = [
  // Version 1 is the initial schema, no migration needed
  {
    version: 2,
    sql: `
      -- Add curation fields to cognitive_commits
      ALTER TABLE cognitive_commits ADD COLUMN published INTEGER DEFAULT 0;
      ALTER TABLE cognitive_commits ADD COLUMN hidden INTEGER DEFAULT 0;
      ALTER TABLE cognitive_commits ADD COLUMN display_order INTEGER DEFAULT 0;
      ALTER TABLE cognitive_commits ADD COLUMN title TEXT;
    `,
  },
];

/**
 * Get migration SQL for upgrading from one version to another
 */
export function getMigrationSql(fromVersion: number, toVersion: number): string[] {
  const migrations: string[] = [];

  for (const migration of MIGRATIONS) {
    if (migration.version > fromVersion && migration.version <= toVersion) {
      migrations.push(migration.sql);
    }
  }

  return migrations;
}
