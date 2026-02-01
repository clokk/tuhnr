import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get all non-empty commits with project names
  const { data, error } = await supabase
    .from("cognitive_commits")
    .select("project_name")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .eq("hidden", false)
    .gt("turn_count", 0) // Only count non-empty commits
    .not("project_name", "is", null);

  if (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }

  // Group by project name and count
  const projectCounts = new Map<string, number>();
  let totalCount = 0;

  for (const row of data || []) {
    const name = row.project_name as string;
    projectCounts.set(name, (projectCounts.get(name) || 0) + 1);
    totalCount++;
  }

  // Convert to array and sort by count descending
  const projects = Array.from(projectCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ projects, totalCount });
}
