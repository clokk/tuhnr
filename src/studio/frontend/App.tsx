import React, { useState, useEffect } from "react";
import {
  fetchProject,
  fetchProjects,
  fetchCommits,
  bulkUpdateCommits,
  type ProjectInfo,
  type ProjectListItem,
  type CognitiveCommit,
} from "./api";
import Header from "./components/Header";
import CommitList from "./components/CommitList";
import CommitDetail from "./components/CommitDetail";

export default function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [commits, setCommits] = useState<CognitiveCommit[]>([]);
  const [selectedCommitId, setSelectedCommitId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Global mode state
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

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

      // Clear selection when filter changes
      setSelectedIds(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const selectedCommit = commits.find((c) => c.id === selectedCommitId);

  const handleToggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handlePublishSelected = async () => {
    if (selectedIds.size === 0) return;

    try {
      await bulkUpdateCommits(Array.from(selectedIds), { published: true });
      // Refresh commits
      const { commits: updated } = await fetchCommits(selectedProject || undefined);
      setCommits(updated);
      setSelectedIds(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  };

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
    selectedIds.delete(id);
    setSelectedIds(new Set(selectedIds));
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
    <div className="min-h-screen bg-bg flex flex-col">
      <Header
        projectName={project?.project.name || "Unknown Project"}
        isGlobal={isGlobal}
        stats={project?.stats}
        selectedCount={selectedIds.size}
        onPublishSelected={handlePublishSelected}
        projects={projects}
        totalCount={totalCount}
        selectedProject={selectedProject}
        onSelectProject={handleSelectProject}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Commit List */}
        <div className="w-96 bg-panel border-r border-zinc-800 overflow-y-auto">
          <CommitList
            commits={commits}
            selectedCommitId={selectedCommitId}
            selectedIds={selectedIds}
            onSelectCommit={setSelectedCommitId}
            onToggleSelect={handleToggleSelect}
            showProjectBadges={showProjectBadges}
          />
        </div>

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
