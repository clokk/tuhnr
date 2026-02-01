import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { transformCommitWithRelations, type DbCommitWithRelations } from "@cogcommit/supabase";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: rawCommit, error } = await supabase
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
      .eq("id", id)
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return NextResponse.json({ error: "Commit not found" }, { status: 404 });
      }
      console.error("Failed to fetch commit detail:", error);
      return NextResponse.json({ error: "Failed to fetch commit" }, { status: 500 });
    }

    const commit = transformCommitWithRelations(rawCommit as DbCommitWithRelations);

    return NextResponse.json(
      { commit },
      {
        headers: {
          "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Failed to fetch commit detail:", error);
    return NextResponse.json({ error: "Failed to fetch commit" }, { status: 500 });
  }
}
