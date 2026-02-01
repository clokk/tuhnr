import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project");

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let query = supabase
    .from("cognitive_commits")
    .select(
      `
      id,
      git_hash,
      started_at,
      closed_at,
      closed_by,
      parallel,
      files_read,
      files_changed,
      title,
      project_name,
      source,
      turn_count,
      sessions:cognitive_sessions (
        id,
        started_at,
        ended_at,
        turns:cognitive_turns (id, role, content, timestamp, model, tool_calls)
      )
    `
    )
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .eq("hidden", false)
    .gt("turn_count", 0) // Filter empty commits
    .order("closed_at", { ascending: false });

  if (project) {
    query = query.eq("project_name", project);
  }

  const { data: commits, error } = await query;

  if (error) {
    console.error("Failed to fetch commits:", error);
    return NextResponse.json({ error: "Failed to fetch commits" }, { status: 500 });
  }

  return NextResponse.json({ commits: commits || [] });
}
