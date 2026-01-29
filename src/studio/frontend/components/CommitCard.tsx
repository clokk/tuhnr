import React from "react";
import { type CognitiveCommit } from "../api";

interface CommitCardProps {
  commit: CognitiveCommit;
  isSelected: boolean;
  isChecked: boolean;
  onClick: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
  thumbnailUrl?: string;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function CommitCard({
  commit,
  isSelected,
  isChecked,
  onClick,
  onToggleCheck,
  thumbnailUrl,
}: CommitCardProps) {
  const hasGitHash = !!commit.gitHash;
  const borderColor = hasGitHash ? "border-chronicle-green" : "border-chronicle-amber";
  const turnCount = commit.turnCount || commit.sessions.reduce((sum, s) => sum + s.turns.length, 0);

  return (
    <div
      onClick={onClick}
      className={`relative rounded-lg p-3 cursor-pointer transition-all border-l-2 ${borderColor} ${
        isSelected
          ? "bg-zinc-800/80 ring-1 ring-chronicle-blue/50"
          : "bg-zinc-900/50 hover:bg-zinc-800/50"
      }`}
    >
      <div className="flex gap-3">
        {/* Checkbox */}
        <div className="flex items-start pt-0.5">
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => {}}
            onClick={onToggleCheck}
            className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-chronicle-blue focus:ring-chronicle-blue/50 cursor-pointer"
          />
        </div>

        {/* Thumbnail */}
        {thumbnailUrl && (
          <div className="flex-shrink-0 w-16 h-12 rounded overflow-hidden bg-zinc-800">
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {/* Git hash or status */}
            {commit.gitHash ? (
              <span className="font-mono text-sm text-chronicle-green">
                [{commit.gitHash.substring(0, 7)}]
              </span>
            ) : (
              <span className="font-mono text-sm text-chronicle-amber">
                [uncommitted]
              </span>
            )}

            {/* Published badge */}
            {commit.published && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-chronicle-green/20 text-chronicle-green">
                published
              </span>
            )}

            {/* Parallel indicator */}
            {commit.parallel && (
              <span className="text-chronicle-purple text-xs" title="Parallel sessions">
                ||
              </span>
            )}
          </div>

          {/* Title or first user message */}
          <div className="text-sm text-zinc-300 mt-1 truncate">
            {commit.title || getFirstUserMessage(commit) || "No content"}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
            <span>{turnCount} turns</span>
            <span>{commit.sessions.length} session{commit.sessions.length !== 1 ? "s" : ""}</span>
            {commit.visuals && commit.visuals.length > 0 && (
              <span>{commit.visuals.length} visual{commit.visuals.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Time */}
          <div className="text-xs text-zinc-600 mt-1">
            {formatTime(commit.startedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function getFirstUserMessage(commit: CognitiveCommit): string | null {
  for (const session of commit.sessions) {
    for (const turn of session.turns) {
      if (turn.role === "user" && turn.content) {
        const content = turn.content.trim();
        return content.length > 60 ? content.substring(0, 60) + "..." : content;
      }
    }
  }
  return null;
}
