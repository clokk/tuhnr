import React, { useState, useEffect } from "react";
import {
  fetchCommit,
  updateCommit,
  deleteCommit as apiDeleteCommit,
  type CognitiveCommit,
} from "../api";
import VisualGallery from "./VisualGallery";
import TurnView from "./TurnView";

interface CommitDetailProps {
  commitId: string;
  onUpdate: (commit: CognitiveCommit) => void;
  onDelete: (id: string) => void;
}

/**
 * Generate a consistent color for a project name
 */
function getProjectColor(name: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  const colors = [
    { bg: "bg-chronicle-purple/20", text: "text-chronicle-purple" },
    { bg: "bg-blue-500/20", text: "text-blue-400" },
    { bg: "bg-emerald-500/20", text: "text-emerald-400" },
    { bg: "bg-orange-500/20", text: "text-orange-400" },
    { bg: "bg-pink-500/20", text: "text-pink-400" },
    { bg: "bg-cyan-500/20", text: "text-cyan-400" },
    { bg: "bg-yellow-500/20", text: "text-yellow-400" },
    { bg: "bg-indigo-500/20", text: "text-indigo-400" },
  ];

  return colors[Math.abs(hash) % colors.length];
}

export default function CommitDetail({
  commitId,
  onUpdate,
  onDelete,
}: CommitDetailProps) {
  const [commit, setCommit] = useState<CognitiveCommit | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchCommit(commitId)
      .then(({ commit }) => {
        setCommit(commit);
        setTitleValue(commit.title || "");
      })
      .finally(() => setLoading(false));
  }, [commitId]);

  if (loading || !commit) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        Loading...
      </div>
    );
  }

  const handleSaveTitle = async () => {
    try {
      const { commit: updated } = await updateCommit(commitId, {
        title: titleValue || undefined,
      });
      setCommit({ ...commit, ...updated });
      onUpdate({ ...commit, ...updated });
      setEditingTitle(false);
    } catch (err) {
      console.error("Failed to update title:", err);
    }
  };

  const handleTogglePublished = async () => {
    try {
      const { commit: updated } = await updateCommit(commitId, {
        published: !commit.published,
      });
      setCommit({ ...commit, ...updated });
      onUpdate({ ...commit, ...updated });
    } catch (err) {
      console.error("Failed to toggle published:", err);
    }
  };

  const handleDelete = async () => {
    try {
      await apiDeleteCommit(commitId);
      onDelete(commitId);
    } catch (err) {
      console.error("Failed to delete commit:", err);
    }
  };

  const handleVisualDelete = (visualId: string) => {
    if (commit.visuals) {
      const updatedVisuals = commit.visuals.filter((v) => v.id !== visualId);
      setCommit({ ...commit, visuals: updatedVisuals });
    }
  };

  const turnCount = commit.sessions.reduce((sum, s) => sum + s.turns.length, 0);
  const projectColor = commit.projectName ? getProjectColor(commit.projectName) : null;

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Header Section */}
      <div className="flex-shrink-0 p-6 pb-4 border-b border-zinc-800 bg-panel-alt">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Project badge + Git hash */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {commit.projectName && projectColor && (
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${projectColor.bg} ${projectColor.text}`}
                >
                  {commit.projectName}
                </span>
              )}
              {commit.gitHash ? (
                <span className="font-mono text-chronicle-green">
                  [{commit.gitHash}]
                </span>
              ) : (
                <span className="font-mono text-chronicle-amber">
                  [uncommitted]
                </span>
              )}
              <span className="text-zinc-500">
                closed by {commit.closedBy.replace("_", " ")}
              </span>
            </div>

            {/* Editable title */}
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  placeholder="Enter a title..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white focus:border-chronicle-blue focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                />
                <button
                  onClick={handleSaveTitle}
                  className="px-3 py-2 bg-chronicle-blue text-black rounded font-medium text-sm hover:bg-chronicle-blue/90"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingTitle(false)}
                  className="px-3 py-2 bg-zinc-700 text-white rounded font-medium text-sm hover:bg-zinc-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <h2
                onClick={() => setEditingTitle(true)}
                className="text-xl font-medium text-white cursor-pointer hover:text-chronicle-blue transition-colors"
              >
                {commit.title || (
                  <span className="text-zinc-500 italic">Click to add title...</span>
                )}
              </h2>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 ml-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={commit.published || false}
                onChange={handleTogglePublished}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-chronicle-green focus:ring-chronicle-green/50"
              />
              <span className="text-sm text-zinc-400">Published</span>
            </label>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 mt-3 text-sm text-zinc-500">
          <span>{turnCount} turns</span>
          <span>{commit.sessions.length} session{commit.sessions.length !== 1 ? "s" : ""}</span>
          <span>{commit.filesChanged.length} files changed</span>
          <span>
            {formatDateTime(commit.startedAt)} - {formatDateTime(commit.closedAt)}
          </span>
        </div>
      </div>

      {/* Scrollable Content Section */}
      <div className="flex-1 overflow-y-auto p-6 pt-4">
        {/* Visuals Gallery */}
        {commit.visuals && commit.visuals.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-white mb-3">Visuals</h3>
            <VisualGallery visuals={commit.visuals} onDelete={handleVisualDelete} />
          </div>
        )}

        {/* Files changed */}
        {commit.filesChanged.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-medium text-white mb-3">Files Changed</h3>
            <div className="bg-zinc-900 rounded-lg p-4">
              <ul className="space-y-1">
                {commit.filesChanged.map((file, i) => (
                  <li key={i} className="font-mono text-sm text-chronicle-amber">
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Conversation */}
        <div>
          <h3 className="text-lg font-medium text-white mb-3">
            Conversation ({turnCount} turns)
          </h3>
          <div className="space-y-4">
            {commit.sessions.map((session) =>
              session.turns.map((turn) => (
                <TurnView key={turn.id} turn={turn} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-panel rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-medium text-white mb-2">Delete Commit?</h3>
            <p className="text-zinc-400 mb-4">
              This will permanently delete this cognitive commit and all associated
              data. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 bg-zinc-700 text-white rounded font-medium hover:bg-zinc-600"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
