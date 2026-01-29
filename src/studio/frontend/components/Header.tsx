import React from "react";
import type { ProjectListItem } from "../api";

interface HeaderProps {
  projectName: string;
  isGlobal?: boolean;
  stats?: {
    commitCount: number;
    publishedCount: number;
    totalTurns: number;
    visualCount: number;
  };
  selectedCount: number;
  onPublishSelected: () => void;
  // Global mode props
  projects?: ProjectListItem[];
  totalCount?: number;
  selectedProject?: string | null;
  onSelectProject?: (project: string | null) => void;
}

export default function Header({
  projectName,
  isGlobal,
  stats,
  selectedCount,
  onPublishSelected,
  projects,
  totalCount,
  selectedProject,
  onSelectProject,
}: HeaderProps) {
  return (
    <header className="bg-bg border-b border-zinc-800 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-chronicle-blue">
            Studio: {projectName}
          </h1>

          {/* Project filter dropdown (global mode only) */}
          {isGlobal && projects && projects.length > 0 && onSelectProject && (
            <div className="relative">
              <select
                value={selectedProject || ""}
                onChange={(e) => onSelectProject(e.target.value || null)}
                className="appearance-none bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 pr-8 text-sm text-white focus:border-chronicle-blue focus:outline-none cursor-pointer"
              >
                <option value="">All Projects ({totalCount})</option>
                {projects.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.count})
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                ▼
              </div>
            </div>
          )}

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
