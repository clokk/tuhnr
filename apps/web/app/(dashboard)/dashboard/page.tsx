import { createClient } from "@/lib/supabase/server";
import DashboardView from "@/components/DashboardView";
import { transformCommitWithRelations, type DbCommitWithRelations } from "@cogcommit/supabase";

interface ProjectListItem {
  name: string;
  count: number;
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userName =
    user?.user_metadata?.user_name ||
    user?.user_metadata?.preferred_username ||
    user?.email?.split("@")[0] ||
    "User";

  // Fetch all commits with full session/turn data
  // Using explicit relationship aliases that match the database schema
  const { data: rawCommits, error } = await supabase
    .from("cognitive_commits")
    .select(
      `
      *,
      sessions:cognitive_sessions (
        *,
        turns:cognitive_turns (*)
      )
    `
    )
    .eq("user_id", user?.id)
    .is("deleted_at", null)
    .eq("hidden", false)
    .order("closed_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch commits:", error);
  }

  // Transform using shared function and filter out 0-turn commits
  const allCommits = ((rawCommits as DbCommitWithRelations[]) || []).map(transformCommitWithRelations);
  const commits = allCommits.filter((c) => (c.turnCount ?? 0) > 0);

  // Build projects list from filtered commits
  const projectCounts = new Map<string, number>();

  for (const commit of commits) {
    if (commit.projectName) {
      projectCounts.set(commit.projectName, (projectCounts.get(commit.projectName) || 0) + 1);
    }
  }

  // Convert to array and sort by count descending
  const projects: ProjectListItem[] = Array.from(projectCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const totalCount = commits.length;

  return (
    <DashboardView
      commits={commits}
      userName={userName}
      projects={projects}
      totalCount={totalCount}
    />
  );
}
