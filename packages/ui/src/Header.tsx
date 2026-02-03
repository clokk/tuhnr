"use client";

import React, { useState, useRef, useEffect } from "react";
import { UsageLimitBar } from "./UsageLimitBar";
import { UsagePopover } from "./UsagePopover";
import { StatsPopover } from "./StatsPopover";
import type { UsageData, WeeklySummaryStats } from "@cogcommit/types";

interface ProjectListItem {
  name: string;
  count: number;
}

interface HeaderProps {
  projectName: string;
  isGlobal?: boolean;
  stats?: {
    commitCount: number;
    totalTurns: number;
  };
  // Global mode props
  projects?: ProjectListItem[];
  totalCount?: number;
  selectedProject?: string | null;
  onSelectProject?: (project: string | null) => void;
  // Web dashboard auth props (optional - not used in local dashboard)
  user?: {
    userName: string;
    avatarUrl?: string;
  };
  homeHref?: string;
  settingsHref?: string;
  onSignOut?: () => void;
  // Usage limits
  usage?: UsageData | null;
  usageLoading?: boolean;
  // Weekly summary stats
  weeklySummary?: WeeklySummaryStats | null;
}

export default function Header({
  projectName,
  isGlobal,
  stats,
  projects,
  totalCount,
  selectedProject,
  onSelectProject,
  user,
  homeHref,
  settingsHref,
  onSignOut,
  usage,
  usageLoading,
  weeklySummary,
}: HeaderProps) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showUserMenu]);

  return (
    <header className="bg-bg border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {homeHref && (
            <a href={homeHref} className="text-xl font-bold text-primary hover:text-chronicle-blue transition-colors">
              CogCommit
            </a>
          )}
          <h1 className="text-xl font-semibold text-chronicle-blue">
            {homeHref ? projectName : `Studio: ${projectName}`}
          </h1>

          {/* Project filter dropdown (global mode only) */}
          {isGlobal && projects && projects.length > 0 && onSelectProject && (
            <div className="relative">
              <select
                value={selectedProject || ""}
                onChange={(e) => onSelectProject(e.target.value || null)}
                className="appearance-none bg-panel border border-border rounded-lg px-3 py-1.5 pr-8 text-sm text-primary focus:border-chronicle-blue focus:outline-none cursor-pointer"
              >
                <option value="">All Projects</option>
                {projects.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.count})
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          )}

          {/* Stats popover */}
          <StatsPopover stats={stats} weeklySummary={weeklySummary} />
        </div>

        {/* Usage limits */}
        {usage !== undefined && (
          user ? (
            <UsagePopover
              usage={usage}
              loading={usageLoading}
              upgradeHref="/dashboard/settings"
            />
          ) : (
            <UsageLimitBar usage={usage} loading={usageLoading} compact />
          )
        )}

        {/* User section with dropdown menu (web dashboard only) */}
        {user && (
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.userName}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-panel flex items-center justify-center text-sm font-medium text-primary">
                  {user.userName[0]?.toUpperCase() || "U"}
                </div>
              )}
              <span className="text-primary font-medium">{user.userName}</span>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`text-muted transition-transform ${showUserMenu ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 bg-panel border border-border rounded-lg shadow-lg z-50 py-1 min-w-[180px]">
                {/* View Profile */}
                <a
                  href={`/u/${user.userName}`}
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-primary hover:bg-panel-alt transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  View Profile
                </a>

                {/* Settings */}
                <a
                  href={settingsHref || "/dashboard/settings"}
                  onClick={() => setShowUserMenu(false)}
                  className="flex items-center gap-3 px-4 py-2 text-sm text-primary hover:bg-panel-alt transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Settings
                </a>

                {/* Divider */}
                {onSignOut && <div className="my-1 border-t border-border" />}

                {/* Sign Out */}
                {onSignOut && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onSignOut();
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-400 hover:bg-panel-alt transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Sign Out
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
