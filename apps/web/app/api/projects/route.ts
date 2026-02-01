import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { transformCommitWithRelations, type DbCommitWithRelations } from "@cogcommit/supabase";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use explicit relationship aliases that match the database schema
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
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("hidden", false);

    if (error) {
      console.error("Failed to fetch projects:", error);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    // Transform and filter out 0-turn commits, then build project counts
    const allCommits = ((rawCommits as DbCommitWithRelations[]) || []).map(transformCommitWithRelations);

    const projectCounts = new Map<string, number>();
    let totalCount = 0;

    for (const commit of allCommits) {
      const turnCount = commit.turnCount ?? 0;
      if (turnCount === 0) continue;

      totalCount++;
      if (commit.projectName) {
        projectCounts.set(commit.projectName, (projectCounts.get(commit.projectName) || 0) + 1);
      }
    }

    // Convert to array and sort by count descending
    const projects = Array.from(projectCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({ projects, totalCount });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
