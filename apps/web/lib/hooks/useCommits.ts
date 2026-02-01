"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CognitiveCommit } from "@cogcommit/types";

interface ProjectListItem {
  name: string;
  count: number;
}

interface CommitsResponse {
  commits: CognitiveCommit[];
}

// Query key factory for type-safe, consistent keys
export const commitKeys = {
  all: ["commits"] as const,
  list: (project?: string | null) =>
    [...commitKeys.all, "list", { project: project ?? "all" }] as const,
};

export const projectKeys = {
  all: ["projects"] as const,
};

interface UseCommitsOptions {
  initialData?: CognitiveCommit[];
  project?: string | null;
}

/**
 * Hook for fetching and caching commits with React Query.
 * Supports initial server data for instant hydration.
 */
export function useCommits({ initialData, project }: UseCommitsOptions = {}) {
  return useQuery({
    queryKey: commitKeys.list(project),
    queryFn: async (): Promise<CognitiveCommit[]> => {
      const url = project
        ? `/api/commits?project=${encodeURIComponent(project)}`
        : "/api/commits";
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("Failed to fetch commits");
      }
      const data: CommitsResponse = await res.json();
      return data.commits;
    },
    initialData,
    // 5 minute stale time for commits list
    staleTime: 5 * 60 * 1000,
  });
}

interface UpdateTitleVariables {
  commitId: string;
  title: string | null;
}

/**
 * Mutation hook for updating commit titles with optimistic updates.
 */
export function useUpdateCommitTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commitId, title }: UpdateTitleVariables) => {
      const res = await fetch(`/api/commits/${commitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) {
        throw new Error("Failed to update title");
      }
      return res.json();
    },
    // Optimistic update
    onMutate: async ({ commitId, title }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: commitKeys.all });

      // Snapshot all commit list queries
      const previousQueries = queryClient.getQueriesData<CognitiveCommit[]>({
        queryKey: commitKeys.all,
      });

      // Optimistically update all queries containing this commit
      queryClient.setQueriesData<CognitiveCommit[]>(
        { queryKey: commitKeys.all },
        (old) => {
          if (!old) return old;
          return old.map((commit) =>
            commit.id === commitId
              ? { ...commit, title: title || undefined }
              : commit
          );
        }
      );

      return { previousQueries };
    },
    // Rollback on error
    onError: (err, variables, context) => {
      if (context?.previousQueries) {
        for (const [queryKey, data] of context.previousQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
    },
    // Always refetch after error or success
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: commitKeys.all });
    },
  });
}

interface ProjectsResponse {
  projects: ProjectListItem[];
  totalCount: number;
}

/**
 * Hook for fetching projects list with React Query.
 */
export function useProjects() {
  return useQuery({
    queryKey: projectKeys.all,
    queryFn: async (): Promise<ProjectsResponse> => {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        throw new Error("Failed to fetch projects");
      }
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
