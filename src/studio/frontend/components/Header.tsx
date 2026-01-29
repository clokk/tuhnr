import React from "react";

interface HeaderProps {
  projectName: string;
  stats?: {
    commitCount: number;
    publishedCount: number;
    totalTurns: number;
    visualCount: number;
  };
  selectedCount: number;
  onPublishSelected: () => void;
}

export default function Header({
  projectName,
  stats,
  selectedCount,
  onPublishSelected,
}: HeaderProps) {
  return (
    <header className="bg-bg border-b border-zinc-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-chronicle-blue">
            Studio: {projectName}
          </h1>
          {stats && (
            <div className="flex items-center gap-4 text-sm text-zinc-400">
              <span>{stats.commitCount} commits</span>
              <span className="text-chronicle-green">
                {stats.publishedCount} published
              </span>
              <span>{stats.totalTurns} turns</span>
              <span>{stats.visualCount} visuals</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {selectedCount > 0 && (
            <span className="text-sm text-zinc-400">
              {selectedCount} selected
            </span>
          )}
          <button
            onClick={onPublishSelected}
            disabled={selectedCount === 0}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              selectedCount > 0
                ? "bg-chronicle-blue text-black hover:bg-chronicle-blue/90"
                : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
            }`}
          >
            Publish Selected
          </button>
        </div>
      </div>
    </header>
  );
}
