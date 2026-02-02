import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

interface DbCommitMinimal {
  id: string;
  project_name: string | null;
  sessions?: { turns?: { role: string }[] }[];
}

/**
 * Count meaningful turns (user prompts only)
 */
function countUserTurns(sessions: { turns?: { role: string }[] }[]): number {
  return sessions.reduce(
    (sum, s) => sum + (s.turns?.filter((t) => t.role === "user").length || 0),
    0
  );
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch only id and project_name - minimal data for counting
    // Also fetch session count to filter out 0-turn commits
    const { data: rawCommits, error } = await supabase
      .from("cognitive_commits")
      .select(
        `
        id, project_name,
        sessions!inner (id, turns (id, role))
      `
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("hidden", false);

    if (error) {
      console.error("Failed to fetch projects:", error);
      return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
    }

    // Build project counts, filtering out 0-turn commits
    const projectCounts = new Map<string, number>();
    let totalCount = 0;

    for (const commit of rawCommits || []) {
      // Calculate turn count to filter 0-turn commits (user prompts only)
      const typedCommit = commit as DbCommitMinimal;
      const turnCount = typedCommit.sessions ? countUserTurns(typedCommit.sessions) : 0;

      if (turnCount === 0) continue;

      totalCount++;
      const projectName = (commit as DbCommitMinimal).project_name;
      if (projectName) {
        projectCounts.set(projectName, (projectCounts.get(projectName) || 0) + 1);
      }
    }

    // Convert to array and sort by count descending
    const projects = Array.from(projectCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json(
      { projects, totalCount },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
