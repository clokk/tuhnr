-- =====================================================
-- RLS Policy Optimization: Cache auth.uid() per statement
-- This change alone can improve RLS performance by up to 99%
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security
-- =====================================================

-- cognitive_commits: Drop and recreate with optimized check
DROP POLICY IF EXISTS "Users can access own commits" ON cognitive_commits;
CREATE POLICY "Users can access own commits"
  ON cognitive_commits FOR ALL
  USING (user_id = (SELECT auth.uid()));

-- sessions: RLS policy for user access (joins to commits)
DROP POLICY IF EXISTS "Users can access own sessions" ON sessions;
CREATE POLICY "Users can access own sessions"
  ON sessions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM cognitive_commits
      WHERE cognitive_commits.id = sessions.commit_id
        AND cognitive_commits.user_id = (SELECT auth.uid())
    )
  );

-- turns: RLS policy for user access (joins through sessions → commits)
DROP POLICY IF EXISTS "Users can access own turns" ON turns;
CREATE POLICY "Users can access own turns"
  ON turns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sessions
      JOIN cognitive_commits ON cognitive_commits.id = sessions.commit_id
      WHERE sessions.id = turns.session_id
        AND cognitive_commits.user_id = (SELECT auth.uid())
    )
  );

-- user_quotas: Update existing policy
DROP POLICY IF EXISTS "users_read_own_quota" ON user_quotas;
CREATE POLICY "users_read_own_quota" ON user_quotas
  FOR SELECT USING (user_id = (SELECT auth.uid()));
