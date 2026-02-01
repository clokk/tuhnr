import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { getCommits } from "@cogcommit/supabase";

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
    // Use shared getCommits to ensure consistent filtering
    const allCommits = await getCommits(supabase, {
      userId: user.id,
      projectName: project || undefined,
      excludeHidden: true,
      limit: 1000,
      orderBy: "closed_at",
      orderDirection: "desc",
    });

    // Filter out 0-turn commits
    const commits = allCommits.filter((c) => (c.turnCount ?? 0) > 0);

    return NextResponse.json({ commits });
  } catch (error) {
    console.error("Failed to fetch commits:", error);
    return NextResponse.json({ error: "Failed to fetch commits" }, { status: 500 });
  }
}
