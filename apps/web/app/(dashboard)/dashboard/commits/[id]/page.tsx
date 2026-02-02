import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import ConversationView from "@/components/ConversationView";
import { getSourceStyle, formatAbsoluteTime, getProjectColor } from "@cogcommit/ui";
import {
  transformCommitWithRelations,
  type DbCommitWithRelations,
} from "@cogcommit/supabase";

export default async function CommitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: commit, error } = await supabase
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
    .is("deleted_at", null)
    .single();

  if (error || !commit) {
    notFound();
  }

  // Transform from database format to frontend format
  const transformedCommit = transformCommitWithRelations(
    commit as DbCommitWithRelations
  );

  const sourceStyle = getSourceStyle(transformedCommit.source || "claude_code");
  const projectColor = transformedCommit.projectName
    ? getProjectColor(transformedCommit.projectName)
    : null;

  // Flatten all turns from sessions
  const allTurns = transformedCommit.sessions.flatMap((s) => s.turns);
  // Count only user prompts for the turn count metric
  const turnCount = allTurns.filter((t) => t.role === "user").length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border px-6 py-4 bg-panel-alt">
        <div className="flex items-center gap-4 mb-2">
          <Link
            href="/dashboard"
            className="text-muted hover:text-primary transition-colors"
          >
            &larr; Back
          </Link>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span
            className={`px-2 py-0.5 text-xs font-medium rounded ${sourceStyle.bg} ${sourceStyle.text}`}
          >
            {sourceStyle.label}
          </span>

          {transformedCommit.projectName && projectColor && (
            <span
              className={`px-2 py-0.5 text-xs font-medium rounded ${projectColor.bg} ${projectColor.text}`}
            >
              {transformedCommit.projectName}
            </span>
          )}

          {transformedCommit.gitHash ? (
            <span className="font-mono text-chronicle-green text-xs">
              [{transformedCommit.gitHash}]
            </span>
          ) : (
            <span className="font-mono text-chronicle-amber text-xs">
              [uncommitted]
            </span>
          )}

          <span className="text-subtle">|</span>
          <span className="text-muted">{turnCount} turns</span>
          <span className="text-subtle">|</span>
          <span className="text-muted">
            {transformedCommit.filesChanged.length} files changed
          </span>
        </div>

        <h1 className="text-xl font-semibold text-primary mt-2">
          {transformedCommit.title || "Untitled conversation"}
        </h1>

        <p className="text-sm text-muted mt-1">
          {formatAbsoluteTime(transformedCommit.closedAt)}
        </p>
      </header>

      {/* Conversation */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <ConversationView turns={allTurns} />
        </div>
      </div>
    </div>
  );
}
