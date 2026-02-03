/**
 * Supabase query functions for fetching commits, sessions, and turns
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CognitiveCommit, DbCommit, DbSession, DbTurn, UsageData, QuotaTier } from "@cogcommit/types";
import { FREE_TIER_LIMITS } from "@cogcommit/types";
import {
  transformCommit,
  transformSession,
  transformTurn,
  type DbCommitWithRelations,
  transformCommitWithRelations,
} from "./transforms";

/**
 * Generate a URL-safe random slug (8 characters)
 * Uses crypto.randomUUID() and takes first 8 chars for simplicity
 */
function generateSlug(): string {
  // Use crypto.randomUUID and extract alphanumeric chars
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return uuid.slice(0, 8);
}

/**
 * Options for fetching commits
 */
export interface GetCommitsOptions {
  /** User ID to filter by (required for RLS) */
  userId?: string;
  /** Project name to filter by */
  projectName?: string;
  /** Only include non-hidden commits */
  excludeHidden?: boolean;
  /** Number of commits to return */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Order by field */
  orderBy?: "closed_at" | "started_at" | "updated_at";
  /** Order direction */
  orderDirection?: "asc" | "desc";
}

/**
 * Fetch commits from Supabase
 */
export async function getCommits(
  client: SupabaseClient,
  options: GetCommitsOptions = {}
): Promise<CognitiveCommit[]> {
  const {
    userId,
    projectName,
    excludeHidden = true,
    limit = 50,
    offset = 0,
    orderBy = "closed_at",
    orderDirection = "desc",
  } = options;

  let query = client
    .from("cognitive_commits")
    .select(
      `
      *,
      sessions (
        *,
        turns (*)
      )
    `
    )
    .is("deleted_at", null)
    .order(orderBy, { ascending: orderDirection === "asc" })
    .range(offset, offset + limit - 1);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (projectName) {
    query = query.eq("project_name", projectName);
  }

  if (excludeHidden) {
    query = query.eq("hidden", false);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch commits: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Transform the nested data
  return (data as DbCommitWithRelations[]).map(transformCommitWithRelations);
}

/**
 * Fetch a single commit by ID with all nested data
 */
export async function getCommit(
  client: SupabaseClient,
  commitId: string
): Promise<CognitiveCommit | null> {
  const { data, error } = await client
    .from("cognitive_commits")
    .select(
      `
      *,
      sessions (
        *,
        turns (*)
      )
    `
    )
    .eq("id", commitId)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`Failed to fetch commit: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return transformCommitWithRelations(data as DbCommitWithRelations);
}

/**
 * Fetch commits count
 */
export async function getCommitsCount(
  client: SupabaseClient,
  options: Omit<GetCommitsOptions, "limit" | "offset"> = {}
): Promise<number> {
  const { userId, projectName, excludeHidden = true } = options;

  let query = client
    .from("cognitive_commits")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  if (projectName) {
    query = query.eq("project_name", projectName);
  }

  if (excludeHidden) {
    query = query.eq("hidden", false);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count commits: ${error.message}`);
  }

  return count ?? 0;
}

/**
 * Fetch unique project names for a user
 */
export async function getProjectNames(
  client: SupabaseClient,
  userId?: string
): Promise<string[]> {
  let query = client
    .from("cognitive_commits")
    .select("project_name")
    .is("deleted_at", null)
    .not("project_name", "is", null);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch project names: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // Get unique project names
  const uniqueNames = new Set(
    data
      .map((row) => row.project_name as string)
      .filter((name): name is string => name !== null)
  );

  return Array.from(uniqueNames).sort();
}

/**
 * Update a commit
 */
export async function updateCommit(
  client: SupabaseClient,
  commitId: string,
  updates: Partial<{
    title: string | null;
    published: boolean;
    hidden: boolean;
    displayOrder: number;
  }>
): Promise<CognitiveCommit> {
  const dbUpdates: Partial<DbCommit> = {};

  if (updates.title !== undefined) {
    dbUpdates.title = updates.title;
  }
  if (updates.published !== undefined) {
    dbUpdates.published = updates.published;
  }
  if (updates.hidden !== undefined) {
    dbUpdates.hidden = updates.hidden;
  }
  if (updates.displayOrder !== undefined) {
    dbUpdates.display_order = updates.displayOrder;
  }

  const { data, error } = await client
    .from("cognitive_commits")
    .update(dbUpdates)
    .eq("id", commitId)
    .select(
      `
      *,
      sessions (
        *,
        turns (*)
      )
    `
    )
    .single();

  if (error) {
    throw new Error(`Failed to update commit: ${error.message}`);
  }

  return transformCommitWithRelations(data as DbCommitWithRelations);
}

/**
 * Soft delete a commit (sets deleted_at)
 */
export async function deleteCommit(
  client: SupabaseClient,
  commitId: string
): Promise<void> {
  const { error } = await client
    .from("cognitive_commits")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commitId);

  if (error) {
    throw new Error(`Failed to delete commit: ${error.message}`);
  }
}

/**
 * Get the current user's profile
 */
export async function getUserProfile(
  client: SupabaseClient
): Promise<{ id: string; githubUsername: string } | null> {
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data, error } = await client
    .from("user_profiles")
    .select("id, github_username")
    .eq("id", user.id)
    .single();

  if (error) {
    // Profile might not exist yet
    return null;
  }

  return {
    id: data.id,
    githubUsername: data.github_username,
  };
}

/**
 * Check if a commit is valid (not warmup, has turns)
 */
function isValidCommit(commit: {
  sessions?: Array<{ turns?: Array<{ role?: string; content?: string | null }> }>;
}): boolean {
  const sessions = commit.sessions || [];
  const totalTurns = sessions.reduce((sum, s) => sum + (s.turns?.length || 0), 0);
  if (totalTurns === 0) return false;

  // Check first user turn for warmup
  const firstTurn = sessions[0]?.turns?.[0];
  const firstContent = firstTurn?.content || "";
  if (firstContent.toLowerCase().includes("warmup")) return false;

  return true;
}

/**
 * Get user's usage data (commit count, storage usage, limits)
 */
export async function getUserUsage(
  client: SupabaseClient,
  userId: string
): Promise<UsageData> {
  // Get user's quota settings (if they have a custom tier)
  const { data: quota } = await client
    .from("user_quotas")
    .select("*")
    .eq("user_id", userId)
    .single();

  const tier = (quota?.tier as QuotaTier) || "free";
  const commitLimit = quota?.commit_limit ?? FREE_TIER_LIMITS.commits;
  const storageLimitBytes = quota?.storage_limit_bytes ?? FREE_TIER_LIMITS.storageBytes;

  // Fetch commits with first turn to filter warmup/empty
  // Only fetch minimal fields needed for validation
  const { data: commits } = await client
    .from("cognitive_commits")
    .select(`
      id,
      sessions (
        turns (
          role,
          content
        )
      )
    `)
    .eq("user_id", userId)
    .is("deleted_at", null);

  // Count only valid commits (non-warmup, has turns)
  const validCommits = (commits || []).filter(isValidCommit);
  const commitCount = validCommits.length;

  // Get storage usage via database function (counts all storage, not just valid)
  // This is intentional - storage is consumed regardless of warmup status
  const { data: storageBytes } = await client.rpc("calculate_user_storage", {
    p_user_id: userId,
  });

  return {
    commitCount,
    commitLimit,
    storageUsedBytes: storageBytes ?? 0,
    storageLimitBytes,
    tier,
  };
}

/**
 * Publish a commit (make it publicly accessible)
 * Generates a public_slug if one doesn't exist, sets published=true
 */
export async function publishCommit(
  client: SupabaseClient,
  commitId: string,
  userId: string
): Promise<{ slug: string; url: string }> {
  // First, get the current commit to check if it already has a slug
  const { data: existing, error: fetchError } = await client
    .from("cognitive_commits")
    .select("public_slug")
    .eq("id", commitId)
    .eq("user_id", userId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch commit: ${fetchError.message}`);
  }

  // Use existing slug or generate new one (8 chars, URL-safe)
  const slug = existing?.public_slug || generateSlug();

  // Update the commit
  const { error: updateError } = await client
    .from("cognitive_commits")
    .update({
      public_slug: slug,
      published: true,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitId)
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`Failed to publish commit: ${updateError.message}`);
  }

  return {
    slug,
    url: `/c/${slug}`,
  };
}

/**
 * Unpublish a commit (make it private again)
 * Preserves the public_slug for potential re-publishing
 */
export async function unpublishCommit(
  client: SupabaseClient,
  commitId: string,
  userId: string
): Promise<void> {
  const { error } = await client
    .from("cognitive_commits")
    .update({
      published: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commitId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Failed to unpublish commit: ${error.message}`);
  }
}

/**
 * Result type for public commit fetch including author info
 */
export interface PublicCommitResult {
  commit: CognitiveCommit;
  author: {
    username: string;
    avatarUrl?: string;
  };
}

/**
 * Result type for public profile fetch
 */
export interface PublicProfileResult {
  profile: {
    username: string;
    avatarUrl?: string;
  };
  commits: CognitiveCommit[];
  stats: {
    publicCommitCount: number;
    totalPrompts: number;
  };
}

/**
 * Fetch a public user profile by username (no auth required)
 * Returns null if user not found or has no public commits
 *
 * Requires RLS policy on user_profiles allowing reads for users with published commits.
 */
export async function getPublicProfile(
  client: SupabaseClient,
  username: string,
  options: { limit?: number; offset?: number } = {}
): Promise<PublicProfileResult | null> {
  const { limit = 20, offset = 0 } = options;

  // Find user by username
  const { data: profile, error: profileError } = await client
    .from("user_profiles")
    .select("id, github_username")
    .eq("github_username", username)
    .single();

  if (profileError || !profile) {
    console.error("Profile query error:", profileError);
    return null;
  }

  // Construct avatar URL from GitHub username
  const avatarUrl = `https://github.com/${profile.github_username}.png`;

  // Fetch public commits for this user
  const { data: commits, error: commitsError } = await client
    .from("cognitive_commits")
    .select(
      `
      *,
      sessions (
        *,
        turns (*)
      )
    `
    )
    .eq("user_id", profile.id)
    .eq("published", true)
    .is("deleted_at", null)
    .order("closed_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (commitsError) {
    console.error("Commits query error:", commitsError);
    return null;
  }

  // If no public commits, return null
  if (!commits || commits.length === 0) {
    return null;
  }

  // Get total count of public commits
  const { count: publicCommitCount } = await client
    .from("cognitive_commits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("published", true)
    .is("deleted_at", null);

  // Calculate total prompts
  const totalPrompts = (commits as DbCommitWithRelations[]).reduce((sum, commit) => {
    const sessions = commit.sessions || [];
    return sum + sessions.reduce((s, sess) => s + (sess.turns?.length || 0), 0);
  }, 0);

  return {
    profile: {
      username: profile.github_username,
      avatarUrl,
    },
    commits: (commits as DbCommitWithRelations[]).map(transformCommitWithRelations),
    stats: {
      publicCommitCount: publicCommitCount || 0,
      totalPrompts,
    },
  };
}

/**
 * Fetch a public commit by its slug (no auth required)
 * Returns null if not found or not published
 */
export async function getPublicCommit(
  client: SupabaseClient,
  slug: string
): Promise<PublicCommitResult | null> {
  // Fetch commit with sessions/turns (no user_profiles join - requires separate RLS)
  const { data, error } = await client
    .from("cognitive_commits")
    .select(
      `
      *,
      sessions (
        *,
        turns (*)
      )
    `
    )
    .eq("public_slug", slug)
    .eq("published", true)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`Failed to fetch public commit: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  // Try to fetch author info separately (may fail due to RLS, that's ok)
  let authorUsername = "Anonymous";
  let authorAvatarUrl: string | undefined;

  try {
    const { data: profile } = await client
      .from("user_profiles")
      .select("github_username")
      .eq("id", data.user_id)
      .single();

    if (profile) {
      authorUsername = profile.github_username || "Anonymous";
      // Construct avatar URL from GitHub username
      authorAvatarUrl = `https://github.com/${profile.github_username}.png`;
    }
  } catch {
    // RLS blocks access - use defaults
  }

  return {
    commit: transformCommitWithRelations(data as DbCommitWithRelations),
    author: {
      username: authorUsername,
      avatarUrl: authorAvatarUrl,
    },
  };
}
