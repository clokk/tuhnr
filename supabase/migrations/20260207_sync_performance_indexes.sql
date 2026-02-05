-- =====================================================
-- Performance Indexes for Sync Operations
-- Note: Not using CONCURRENTLY as it's incompatible with Supabase migrations
-- =====================================================

-- Compound index for filtering user commits by updated_at (pull/push queries)
CREATE INDEX IF NOT EXISTS idx_cognitive_commits_user_updated
  ON cognitive_commits(user_id, updated_at DESC);

-- Index for sessions lookup during commit fetch
CREATE INDEX IF NOT EXISTS idx_sessions_commit_id
  ON sessions(commit_id);

-- Index for turns lookup during session fetch
CREATE INDEX IF NOT EXISTS idx_turns_session_id
  ON turns(session_id);

-- Partial index for non-deleted commits (common filter in queries)
CREATE INDEX IF NOT EXISTS idx_cognitive_commits_user_deleted
  ON cognitive_commits(user_id)
  WHERE deleted_at IS NULL;
