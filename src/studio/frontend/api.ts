/**
 * API client for Shipchronicle Studio
 */

const API_BASE = "/api";

export interface Visual {
  id: string;
  commitId: string;
  type: "screenshot" | "video" | "vercel_preview";
  path: string;
  capturedAt: string;
  caption?: string;
}

export interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
    result?: string;
    isError?: boolean;
  }>;
  triggersVisualUpdate?: boolean;
}

export interface Session {
  id: string;
  startedAt: string;
  endedAt: string;
  turns: Turn[];
}

export interface CognitiveCommit {
  id: string;
  gitHash: string | null;
  startedAt: string;
  closedAt: string;
  closedBy: "git_commit" | "session_end" | "explicit";
  sessions: Session[];
  parallel: boolean;
  filesRead: string[];
  filesChanged: string[];
  title?: string;
  published?: boolean;
  hidden?: boolean;
  displayOrder?: number;
  visuals?: Visual[];
  turnCount?: number;
}

export interface ProjectInfo {
  project: {
    name: string;
    path: string;
  };
  stats: {
    commitCount: number;
    publishedCount: number;
    totalTurns: number;
    visualCount: number;
    firstDate: string | null;
    lastDate: string | null;
  };
}

// Project
export async function fetchProject(): Promise<ProjectInfo> {
  const res = await fetch(`${API_BASE}/project`);
  if (!res.ok) throw new Error("Failed to fetch project");
  return res.json();
}

// Commits
export async function fetchCommits(): Promise<{ commits: CognitiveCommit[] }> {
  const res = await fetch(`${API_BASE}/commits`);
  if (!res.ok) throw new Error("Failed to fetch commits");
  return res.json();
}

export async function fetchCommit(id: string): Promise<{ commit: CognitiveCommit }> {
  const res = await fetch(`${API_BASE}/commits/${id}`);
  if (!res.ok) throw new Error("Failed to fetch commit");
  return res.json();
}

export async function updateCommit(
  id: string,
  updates: Partial<Pick<CognitiveCommit, "title" | "published" | "hidden" | "displayOrder">>
): Promise<{ commit: CognitiveCommit }> {
  const res = await fetch(`${API_BASE}/commits/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update commit");
  return res.json();
}

export async function deleteCommit(id: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/commits/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete commit");
  return res.json();
}

export async function bulkUpdateCommits(
  ids: string[],
  updates: { published?: boolean; hidden?: boolean }
): Promise<{ updated: number }> {
  const res = await fetch(`${API_BASE}/commits/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, updates }),
  });
  if (!res.ok) throw new Error("Failed to bulk update commits");
  return res.json();
}

// Visuals
export function getVisualImageUrl(visualId: string): string {
  return `${API_BASE}/visuals/${visualId}/image`;
}

export async function updateVisual(
  id: string,
  updates: { caption?: string }
): Promise<{ visual: Visual }> {
  const res = await fetch(`${API_BASE}/visuals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error("Failed to update visual");
  return res.json();
}

export async function deleteVisual(
  id: string,
  deleteFile = false
): Promise<{ success: boolean }> {
  const url = deleteFile
    ? `${API_BASE}/visuals/${id}?deleteFile=true`
    : `${API_BASE}/visuals/${id}`;
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete visual");
  return res.json();
}
