import React from "react";
import { type CognitiveCommit, getVisualImageUrl } from "../api";
import CommitCard from "./CommitCard";

interface CommitListProps {
  commits: CognitiveCommit[];
  selectedCommitId: string | null;
  selectedIds: Set<string>;
  onSelectCommit: (id: string) => void;
  onToggleSelect: (id: string) => void;
  showProjectBadges?: boolean;
}

export default function CommitList({
  commits,
  selectedCommitId,
  selectedIds,
  onSelectCommit,
  onToggleSelect,
  showProjectBadges = false,
}: CommitListProps) {
  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500 p-4">
        No cognitive commits found.
        <br />
        Start the daemon to capture commits.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      {commits.map((commit) => (
        <CommitCard
          key={commit.id}
          commit={commit}
          isSelected={selectedCommitId === commit.id}
          isChecked={selectedIds.has(commit.id)}
          onClick={() => onSelectCommit(commit.id)}
          onToggleCheck={(e) => {
            e.stopPropagation();
            onToggleSelect(commit.id);
          }}
          thumbnailUrl={
            commit.visuals && commit.visuals[0]
              ? getVisualImageUrl(commit.visuals[0].id)
              : undefined
          }
          showProjectBadge={showProjectBadges}
        />
      ))}
    </div>
  );
}
