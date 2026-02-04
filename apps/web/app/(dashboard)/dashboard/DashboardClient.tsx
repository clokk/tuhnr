"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Header,
  CommitList,
  CommitListSkeleton,
  useResizable,
  ConversationViewer,
  SidebarHeader,
  Shimmer,
} from "@cogcommit/ui";
import { useCommitList, useCommitDetail, useUpdateCommitTitle, usePublishCommit, useUnpublishCommit, useProjects, useUsage, useCommitAnalytics } from "@/lib/hooks/useCommits";
import { createClient } from "@/lib/supabase/client";

interface DashboardClientProps {
  userId: string;
  userName: string;
  avatarUrl?: string;
}

// localStorage keys
const SIDEBAR_WIDTH_KEY = "cogcommit-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "cogcommit-sidebar-collapsed";

// Default and constraint values
const DEFAULT_SIDEBAR_WIDTH = 384;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const COLLAPSED_WIDTH = 48;

export default function DashboardClient({
  userId,
  userName,
  avatarUrl,
}: DashboardClientProps) {
  // Project filter state
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  // Sentiment filter state
  const [selectedSentiment, setSelectedSentiment] = useState<string | null>(null);

  // React Query for lightweight commit list
  const {
    data: commits = [],
    isFetching: isListFetching,
    isLoading: isListLoading,
  } = useCommitList({
    project: selectedProject,
    sentiment: selectedSentiment,
  });

  // React Query for projects
  const { data: projectsData } = useProjects();
  const projects = projectsData?.projects ?? [];
  const totalCount = projectsData?.totalCount ?? 0;
  const weeklySummary = projectsData?.weeklySummary;

  // React Query for usage limits
  const { data: usage, isLoading: isUsageLoading } = useUsage();

  // Mutation for title updates with optimistic updates
  const updateTitleMutation = useUpdateCommitTitle();

  // Mutations for publish/unpublish
  const publishMutation = usePublishCommit();
  const unpublishMutation = useUnpublishCommit();

  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);

  // React Query for full commit detail (lazy loaded on selection)
  const {
    data: selectedCommit,
    isLoading: isDetailLoading,
  } = useCommitDetail(selectedCommitId);

  // Select first commit when commits load
  useEffect(() => {
    if (commits.length > 0 && !selectedCommitId) {
      setSelectedCommitId(commits[0].id);
    }
  }, [commits, selectedCommitId]);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  // Handle title change for a commit using mutation
  const handleTitleChange = useCallback(
    async (newTitle: string) => {
      if (!selectedCommitId) return;

      try {
        await updateTitleMutation.mutateAsync({
          commitId: selectedCommitId,
          title: newTitle || null,
        });
      } catch (err) {
        console.error("Failed to update title:", err);
        throw err;
      }
    },
    [selectedCommitId, updateTitleMutation]
  );

  // Handle publish for a commit
  const handlePublish = useCallback(async () => {
    if (!selectedCommitId) throw new Error("No commit selected");
    return publishMutation.mutateAsync(selectedCommitId);
  }, [selectedCommitId, publishMutation]);

  // Handle unpublish for a commit
  const handleUnpublish = useCallback(async () => {
    if (!selectedCommitId) throw new Error("No commit selected");
    await unpublishMutation.mutateAsync(selectedCommitId);
  }, [selectedCommitId, unpublishMutation]);

  // Analytics loading function
  const loadAnalytics = useCommitAnalytics();

  // Handle project selection
  const handleSelectProject = useCallback((project: string | null) => {
    setSelectedProject(project);
    setSelectedCommitId(null); // Reset selection when changing projects
  }, []);

  // Handle sentiment selection
  const handleSelectSentiment = useCallback((sentiment: string | null) => {
    setSelectedSentiment(sentiment);
    setSelectedCommitId(null); // Reset selection when changing sentiment filter
  }, []);

  // Router for navigation after sign out
  const router = useRouter();

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }, [router]);

  // Update selected commit when commits change
  useEffect(() => {
    if (commits.length > 0 && selectedCommitId && !commits.find((c) => c.id === selectedCommitId)) {
      setSelectedCommitId(commits[0].id);
    } else if (commits.length === 0) {
      setSelectedCommitId(null);
    }
  }, [commits, selectedCommitId]);

  // Show loading state
  const loading = isListLoading;

  // Resizable sidebar
  const { width: sidebarWidth, isDragging, handleMouseDown } = useResizable(
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    SIDEBAR_WIDTH_KEY
  );

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next.toString());
      }
      return next;
    });
  }, []);

  // Show project badges when not filtering by a specific project
  const showProjectBadges = !selectedProject;

  // Calculate total turns for stats from list data
  const totalTurns = commits.reduce((sum, c) => sum + (c.turnCount || 0), 0);

  // Full page loading state
  if (loading) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-bg">
        {/* Header skeleton */}
        <div className="h-14 border-b border-border bg-panel flex items-center justify-between px-4 relative overflow-hidden">
          <Shimmer />
          <div className="flex items-center gap-4">
            <div className="h-6 w-6 bg-subtle/40 rounded animate-pulse" />
            <div className="h-5 w-32 bg-subtle/40 rounded animate-pulse" />
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-24 bg-subtle/40 rounded animate-pulse" />
            <div className="h-8 w-8 bg-subtle/40 rounded-full animate-pulse" />
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {/* Left Panel skeleton */}
          <div className="bg-panel border-r border-border flex flex-col" style={{ width: 384 }}>
            <div className="h-10 border-b border-border flex items-center justify-between px-3 relative overflow-hidden">
              <Shimmer />
              <div className="flex items-center gap-2">
                <div className="h-4 w-16 bg-subtle/40 rounded animate-pulse" />
                <div className="h-5 w-8 bg-subtle/40 rounded-full animate-pulse" />
              </div>
              <div className="h-6 w-6 bg-subtle/40 rounded animate-pulse" />
            </div>
            <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
              <CommitListSkeleton count={8} showProjectBadges={true} />
            </div>
          </div>

          {/* Resizer placeholder */}
          <div className="w-1 bg-panel flex-shrink-0" />

          {/* Right Panel skeleton */}
          <div className="flex-1 bg-panel-alt overflow-hidden flex flex-col">
            <div className="h-16 border-b border-border flex items-center justify-between px-6 relative overflow-hidden">
              <Shimmer />
              <div className="flex-1">
                <div className="h-6 w-64 bg-subtle/40 rounded mb-2 animate-pulse" />
                <div className="h-4 w-48 bg-subtle/40 rounded animate-pulse" />
              </div>
            </div>
            <div className="flex-1 p-6 space-y-4 overflow-auto">
              <div className="flex gap-3">
                <div className="h-8 w-8 bg-subtle/40 rounded-full flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-subtle/40 rounded animate-pulse" />
                  <div className="h-20 w-full bg-subtle/40 rounded-lg animate-pulse" />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="h-8 w-8 bg-subtle/40 rounded-full flex-shrink-0 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-20 bg-subtle/40 rounded animate-pulse" />
                  <div className="h-32 w-full bg-subtle/40 rounded-lg animate-pulse" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-bg">
      {/* Header */}
      <Header
        projectName="Cloud"
        isGlobal={true}
        stats={{ commitCount: commits.length, totalTurns }}
        projects={projects}
        totalCount={totalCount}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
        selectedSentiment={selectedSentiment}
        onSelectSentiment={handleSelectSentiment}
        homeHref="/"
        user={{ userName, avatarUrl }}
        settingsHref="/dashboard/settings"
        onSignOut={handleSignOut}
        usage={usage}
        usageLoading={isUsageLoading}
        weeklySummary={weeklySummary}
      />

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left Panel - Commit List */}
        <div
          className="bg-panel border-r border-border flex flex-col transition-[width] duration-200"
          style={{ width: sidebarCollapsed ? COLLAPSED_WIDTH : sidebarWidth }}
        >
          {sidebarCollapsed ? (
            // Collapsed mini view
            <div className="flex flex-col h-full">
              <SidebarHeader
                title="Commits"
                count={commits.length}
                collapsed={true}
                onToggle={toggleSidebar}
              />
              <div className="flex-1 flex flex-col items-center pt-2 gap-1 overflow-y-auto">
                {commits.slice(0, 20).map((commit) => (
                  <button
                    key={commit.id}
                    onClick={() => setSelectedCommitId(commit.id)}
                    className={`w-8 h-8 rounded flex items-center justify-center text-xs font-mono transition-colors ${
                      selectedCommitId === commit.id
                        ? "bg-chronicle-blue text-black"
                        : commit.gitHash
                        ? "bg-chronicle-green/20 text-chronicle-green hover:bg-chronicle-green/30"
                        : "bg-chronicle-amber/20 text-chronicle-amber hover:bg-chronicle-amber/30"
                    }`}
                    title={commit.title || commit.gitHash || "Uncommitted"}
                  >
                    {commit.gitHash ? commit.gitHash.slice(0, 2) : "?"}
                  </button>
                ))}
                {commits.length > 20 && (
                  <span className="text-xs text-muted mt-1">+{commits.length - 20}</span>
                )}
              </div>
            </div>
          ) : (
            // Expanded view with collapse button
            <div className="flex flex-col h-full">
              <SidebarHeader
                title="Commits"
                count={commits.length}
                collapsed={false}
                onToggle={toggleSidebar}
              />
              <div className="flex-1 overflow-y-auto" style={{ scrollbarGutter: "stable" }}>
                {isListFetching && commits.length === 0 ? (
                  <CommitListSkeleton count={8} showProjectBadges={showProjectBadges} />
                ) : (
                  <CommitList
                    commits={commits}
                    selectedCommitId={selectedCommitId}
                    onSelectCommit={setSelectedCommitId}
                    showProjectBadges={showProjectBadges}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resizer */}
        {!sidebarCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className={`w-1 cursor-col-resize transition-colors flex-shrink-0 ${
              isDragging ? "bg-chronicle-blue" : "bg-panel hover:bg-chronicle-blue"
            }`}
          />
        )}

        {/* Right Panel - Commit Detail */}
        <div className="flex-1 bg-panel-alt overflow-hidden flex flex-col">
          {selectedCommitId && isDetailLoading ? (
            // Loading state for detail panel
            <div className="flex-1 flex flex-col">
              <div className="h-16 border-b border-border flex items-center justify-between px-6 relative overflow-hidden">
                <Shimmer />
                <div className="flex-1">
                  <div className="h-6 w-64 bg-subtle/40 rounded mb-2 animate-pulse" />
                  <div className="h-4 w-48 bg-subtle/40 rounded animate-pulse" />
                </div>
              </div>
              <div className="flex-1 p-6 space-y-4 overflow-auto">
                <div className="flex gap-3">
                  <div className="h-8 w-8 bg-subtle/40 rounded-full flex-shrink-0 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 bg-subtle/40 rounded animate-pulse" />
                    <div className="h-20 w-full bg-subtle/40 rounded-lg animate-pulse" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="h-8 w-8 bg-subtle/40 rounded-full flex-shrink-0 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-20 bg-subtle/40 rounded animate-pulse" />
                    <div className="h-32 w-full bg-subtle/40 rounded-lg animate-pulse" />
                  </div>
                </div>
              </div>
            </div>
          ) : selectedCommit ? (
            <ConversationViewer
              commit={selectedCommit}
              onTitleChange={handleTitleChange}
              onPublish={handlePublish}
              onUnpublish={handleUnpublish}
              onLoadAnalytics={loadAnalytics}
              username={userName}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted">
              {commits.length === 0 ? (
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-panel flex items-center justify-center">
                    <svg className="w-8 h-8 text-subtle" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-medium text-primary mb-2">No commits yet</h2>
                  <p className="text-muted max-w-md mx-auto mb-6">
                    Install the CogCommit CLI and sync your Claude Code conversations to see them here.
                  </p>
                  <a href="/docs" className="inline-flex px-4 py-2 bg-chronicle-blue text-black rounded-lg font-medium hover:bg-chronicle-blue/90 transition-colors">
                    Get Started
                  </a>
                </div>
              ) : (
                "Select a commit to view details"
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
