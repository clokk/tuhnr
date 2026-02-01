"use client";

import React from "react";
import type { CognitiveCommit, CommitListItem } from "@cogcommit/types";
import CommitCard from "./CommitCard";

// CommitList accepts either full CognitiveCommit[] or lightweight CommitListItem[]
type CommitData = CognitiveCommit | CommitListItem;

interface CommitListProps {
  commits: CommitData[];
  selectedCommitId?: string | null;
  onSelectCommit?: (id: string) => void;
  showProjectBadges?: boolean;
  emptyMessage?: string;
}

export default function CommitList({
  commits,
  selectedCommitId,
  onSelectCommit,
  showProjectBadges = false,
  emptyMessage = "No cognitive commits found.\nStart the daemon to capture commits.",
}: CommitListProps) {
  if (commits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted p-4 text-center whitespace-pre-line">
        {emptyMessage}
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
          onClick={() => onSelectCommit?.(commit.id)}
          showProjectBadge={showProjectBadges}
        />
      ))}
    </div>
  );
}
