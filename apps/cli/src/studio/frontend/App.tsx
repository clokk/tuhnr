import React, { useState, useEffect, useCallback } from "react";
import {
  fetchProject,
  fetchProjects,
  fetchCommits,
  type ProjectInfo,
  type ProjectListItem,
  type CognitiveCommit,
} from "./api";
import { Header, CommitList, useResizable, SidebarHeader } from "@cogcommit/ui";
import CommitDetail from "./components/CommitDetail";

// localStorage keys
const SIDEBAR_WIDTH_KEY = "cogcommit-sidebar-width";
const SIDEBAR_COLLAPSED_KEY = "cogcommit-sidebar-collapsed";

// Default and constraint values
const DEFAULT_SIDEBAR_WIDTH = 384;
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 600;
const COLLAPSED_WIDTH = 48;

export default function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [commits, setCommits] = useState<CognitiveCommit[]>([]);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global mode state
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Sidebar collapse state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  // Resizable sidebar
  const { width: sidebarWidth, isDragging, handleMouseDown } = useResizable(
    DEFAULT_SIDEBAR_WIDTH,
    MIN_SIDEBAR_WIDTH,
    MAX_SIDEBAR_WIDTH,
    SIDEBAR_WIDTH_KEY
  );

  // Persist collapsed state
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next.toString());
      return next;
    });
  }, []);

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const [projectData, commitsData] = await Promise.all([
          fetchProject(),
          fetchCommits(),
        ]);
        setProject(projectData);
        setCommits(commitsData.commits);

        // If global mode, also fetch projects list
        if (projectData.project.global) {
          const projectsData = await fetchProjects();
          setProjects(projectsData.projects);
          setTotalCount(projectsData.totalCount);
        }

        // Select first commit by default
        if (commitsData.commits.length > 0) {
          setSelectedCommitId(commitsData.commits[0].id);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Handle project filter change
  const handleSelectProject = async (projectName: string | null) => {
    setSelectedProject(projectName);
    setLoading(true);

    try {
      const commitsData = await fetchCommits(projectName || undefined);
      setCommits(commitsData.commits);

      // Select first commit in filtered list
      if (commitsData.commits.length > 0) {
        setSelectedCommitId(commitsData.commits[0].id);
      } else {
        setSelectedCommitId(null);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedCommit = commits.find((c) => c.id === selectedCommitId);

  const handleCommitUpdate = (updated: CognitiveCommit) => {
    setCommits((prev) =>
      prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
    );
  };

  const handleCommitDelete = (id: string) => {
    setCommits((prev) => prev.filter((c) => c.id !== id));
    if (selectedCommitId === id) {
      setSelectedCommitId(commits[0]?.id || null);
    }
  };

  const isGlobal = project?.project.global || false;
  // Show project badges when in global mode and not filtering by a specific project
  const showProjectBadges = isGlobal && !selectedProject;

  if (loading && !project) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen app-root flex flex-col overflow-hidden">
      <Header
        projectName={project?.project.name || "Unknown Project"}
        isGlobal={isGlobal}
        stats={project?.stats}
        projects={projects}
        totalCount={totalCount}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
      />

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {/* Left Panel - Commit List */}
        <div
          className="bg-panel border-r border-zinc-800 flex flex-col transition-[width] duration-200"
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
                  <span className="text-xs text-zinc-500 mt-1">+{commits.length - 20}</span>
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
                <CommitList
                  commits={commits}
                  selectedCommitId={selectedCommitId}
                  onSelectCommit={setSelectedCommitId}
                  showProjectBadges={showProjectBadges}
                />
              </div>
            </div>
          )}
        </div>

        {/* Resizer */}
        {!sidebarCollapsed && (
          <div
            onMouseDown={handleMouseDown}
            className={`w-1 cursor-col-resize transition-colors flex-shrink-0 ${
              isDragging ? "bg-chronicle-blue" : "bg-zinc-800 hover:bg-chronicle-blue"
            }`}
          />
        )}

        {/* Right Panel - Commit Detail */}
        <div className="flex-1 bg-panel-alt overflow-hidden">
          {selectedCommit ? (
            <CommitDetail
              commitId={selectedCommit.id}
              onUpdate={handleCommitUpdate}
              onDelete={handleCommitDelete}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              Select a commit to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
