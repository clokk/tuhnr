import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCommits } from "@cogcommit/supabase";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use shared getCommits to ensure consistent filtering
    const allCommits = await getCommits(supabase, {
      userId: user.id,
      excludeHidden: true,
      limit: 1000,
    });

    // Filter out 0-turn commits and build project counts
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
