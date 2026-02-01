import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { transformCommitWithRelations, type DbCommitWithRelations } from "@cogcommit/supabase";

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

  try {
    let query = supabase
      .from("cognitive_commits")
      .select(
        `
        *,
        sessions (
          *,
          turns (*)
        )
      `
      )
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .eq("hidden", false)
      .order("closed_at", { ascending: false });

    if (project) {
      query = query.eq("project_name", project);
    }

    const { data: rawCommits, error } = await query;

    if (error) {
      console.error("Failed to fetch commits:", error);
      return NextResponse.json({ error: "Failed to fetch commits" }, { status: 500 });
    }

    // Transform using shared function and filter out 0-turn and warmup commits
    const allCommits = ((rawCommits as DbCommitWithRelations[]) || []).map(transformCommitWithRelations);
    const commits = allCommits.filter((c) => {
      // Filter out 0-turn commits
      if ((c.turnCount ?? 0) === 0) return false;
      // Filter out warmup commits (first user message contains "warmup")
      const firstUserMessage = c.sessions[0]?.turns[0]?.content || "";
      if (firstUserMessage.toLowerCase().includes("warmup")) return false;
      return true;
    });

    return NextResponse.json({ commits });
  } catch (error) {
    console.error("Failed to fetch commits:", error);
    return NextResponse.json({ error: "Failed to fetch commits" }, { status: 500 });
  }
}
