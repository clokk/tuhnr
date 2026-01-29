import React, { useState, useEffect } from "react";
import {
  fetchProject,
  fetchCommits,
  bulkUpdateCommits,
  type ProjectInfo,
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
      const { commits: updated } = await fetchCommits();
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

  if (loading) {
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
        stats={project?.stats}
        selectedCount={selectedIds.size}
        onPublishSelected={handlePublishSelected}
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
          />
        </div>

        {/* Right Panel - Commit Detail */}
        <div className="flex-1 bg-panel-alt overflow-y-auto">
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
