# Dashboard Caching Architecture

This document explains how the CogCommit dashboard uses a multi-layer caching strategy to deliver fast, responsive user experiences. If you're new to caching concepts, don't worry—we'll build up from the basics.

## Why Caching Matters

Every time a user loads the dashboard, we need to fetch their commits from the database. Without caching, this means:

1. User clicks refresh
2. Browser sends request to our server
3. Server queries the Supabase database
4. Database processes the query and returns data
5. Server transforms the data and sends it back
6. Browser receives the data and renders it

This round-trip can take 500ms to 2 seconds depending on network conditions and database load. Caching lets us skip some of these steps by remembering data we've already fetched.

## The Four Layers

Our caching strategy has four layers, each solving a different problem:

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: Skeleton Loaders                                  │
│  "Show something instantly while we wait"                   │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Server Cache (React cache())                      │
│  "Request-level deduplication"                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Client Cache (React Query)                        │
│  "Remember API results in the browser for 5 minutes"        │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Cache Invalidation                                │
│  "Clear stale data when things change"                      │
└─────────────────────────────────────────────────────────────┘
```

Let's explore each layer in detail.

---

## Layer 1: Skeleton Loaders

**Problem:** When a page is loading, users see a blank screen. This feels slow and broken.

**Solution:** Show placeholder UI that mimics the real content shape.

### How It Works

Next.js has a special file convention: any file named `loading.tsx` automatically becomes a loading state for that route. When you navigate to `/dashboard`, Next.js shows `loading.tsx` while the page data is being fetched.

```
apps/web/app/(dashboard)/dashboard/
├── page.tsx      ← The actual page (async, fetches data)
└── loading.tsx   ← Shown while page.tsx is loading
```

### The Skeleton Components

We created reusable skeleton components in the UI package:

**`CommitCardSkeleton.tsx`** - Matches the layout of a real CommitCard:

```tsx
export default function CommitCardSkeleton() {
  return (
    <div className="rounded-lg p-3 border-l-2 border-subtle bg-bg/50 animate-pulse">
      {/* Git hash placeholder */}
      <div className="h-5 w-24 bg-subtle/30 rounded" />

      {/* Title placeholder */}
      <div className="h-5 w-3/4 bg-subtle/30 rounded mt-1" />

      {/* Stats placeholder */}
      <div className="flex gap-3 mt-1">
        <div className="h-4 w-16 bg-subtle/30 rounded" />
        <div className="h-4 w-20 bg-subtle/30 rounded" />
      </div>
    </div>
  );
}
```

The key CSS class is `animate-pulse`, which creates a gentle pulsing animation that signals "loading" to users.

**`CommitListSkeleton.tsx`** - Renders multiple card skeletons:

```tsx
export default function CommitListSkeleton({ count = 8 }) {
  return (
    <div className="p-2 space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <CommitCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

### Why This Matters

Skeleton loaders create **perceived performance**. Even if the actual load time is the same, users feel like the app is faster because something happens immediately. Studies show users are more patient when they can see progress.

---

## Layer 2: Server-Side Request Memoization

**Problem:** During a single page render, the same data might be requested multiple times by different components.

**Solution:** Use React's `cache()` to deduplicate requests within a single render.

### How It Works

React provides a `cache()` function that memoizes async functions for the duration of a single request. If the same function is called multiple times with the same arguments during a render, it only executes once.

**`lib/data/commits.ts`:**

```tsx
import { cache } from "react";

export const getCachedCommits = cache(
  async (userId: string, project?: string | null) => {
    const supabase = await createClient();
    const { data } = await supabase
      .from("cognitive_commits")
      .select("*, sessions(*)")
      .eq("user_id", userId);

    return transformAndFilter(data);
  }
);
```

### Why Not `unstable_cache`?

Next.js also provides `unstable_cache` for persistent server-side caching across requests. However, it has a limitation: functions inside `unstable_cache` run in a static context without access to request-specific data like cookies.

Since our Supabase client needs cookies for authentication, we can't use `unstable_cache` directly. Instead, we rely on:

1. **React's `cache()`** for request-level deduplication
2. **React Query** for cross-request caching on the client

### The Request Flow

**Multiple components requesting the same data:**
```
Component A calls getCachedCommits(userId)
  → cache() executes function → Database query → Returns data

Component B calls getCachedCommits(userId)
  → cache() returns memoized result → No database query

Component C calls getCachedCommits(userId)
  → cache() returns memoized result → No database query
```

All three components get the same data from a single database query.

---

## Layer 3: Client-Side Caching

**Problem:** When users navigate away and come back, or switch between projects, they have to wait for fresh API calls.

**Solution:** Cache API responses in the browser with React Query.

### How It Works

React Query is a library that manages server state in React applications. It handles caching, background refetching, and cache invalidation automatically.

**Setting up the provider (`components/providers/QueryProvider.tsx`):**

```tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export default function QueryProvider({ children }) {
  // Create QueryClient inside useState to avoid recreating on every render
  const [queryClient] = useState(
    () => new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,      // 5 minutes
          gcTime: 30 * 60 * 1000,        // 30 minutes
          refetchOnWindowFocus: true,    // Refresh when tab regains focus
        },
      },
    })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### Key Concepts

**Stale Time (5 minutes):** How long data is considered "fresh." During this time, React Query returns cached data without refetching.

**GC Time (30 minutes):** How long unused data stays in memory before being garbage collected.

**Refetch on Window Focus:** When users switch to another tab and come back, React Query checks if data is stale and refetches in the background.

### The useCommits Hook

**`lib/hooks/useCommits.ts`:**

```tsx
// Query keys should be consistent and predictable
export const commitKeys = {
  all: ["commits"],
  list: (project?: string | null) =>
    [...commitKeys.all, "list", { project: project ?? "all" }],
};

export function useCommits({ initialData, project }) {
  return useQuery({
    queryKey: commitKeys.list(project),
    queryFn: async () => {
      const res = await fetch(`/api/commits?project=${project || ""}`);
      return res.json();
    },
    initialData,           // Server-rendered data for instant first paint
    staleTime: 5 * 60 * 1000,
  });
}
```

### Hydration: Server Meets Client

Here's the clever part. The dashboard page fetches data on the server:

```tsx
// page.tsx (server component)
export default async function DashboardPage() {
  const { commits } = await getCachedCommits(user.id);

  return <DashboardView commits={commits} />;
}
```

Then DashboardView (client component) uses that server data as `initialData`:

```tsx
// DashboardView.tsx (client component)
const { data: commits } = useCommits({
  initialData: serverCommits,  // Instantly available, no loading state
  project: selectedProject,
});
```

This means:
1. First render: Server data appears instantly (no loading spinner)
2. React Query takes ownership of that data
3. Future navigations use React Query's cache
4. Background refetches keep data fresh

### Optimistic Updates

When users edit a commit title, we don't wait for the API—we update the UI immediately:

```tsx
export function useUpdateCommitTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commitId, title }) => {
      return fetch(`/api/commits/${commitId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    },

    // Optimistically update before API responds
    onMutate: async ({ commitId, title }) => {
      // Cancel any in-flight refetches
      await queryClient.cancelQueries({ queryKey: commitKeys.all });

      // Snapshot current data for rollback
      const previousData = queryClient.getQueryData(commitKeys.all);

      // Optimistically update the cache
      queryClient.setQueryData(commitKeys.all, (old) =>
        old.map((c) => c.id === commitId ? { ...c, title } : c)
      );

      return { previousData };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      queryClient.setQueryData(commitKeys.all, context.previousData);
    },
  });
}
```

This creates a snappy, app-like feel where changes appear instantly.

---

## Layer 4: Cache Invalidation

**Problem:** Cached data becomes stale when users make changes.

**Solution:** React Query handles cache invalidation automatically through mutations.

### How React Query Manages Staleness

React Query's cache invalidation is built into the mutation flow:

```tsx
export function useUpdateCommitTitle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commitId, title }) => {
      return fetch(`/api/commits/${commitId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
    },

    // After mutation completes (success or failure)
    onSettled: () => {
      // Mark all commit queries as stale and refetch
      queryClient.invalidateQueries({ queryKey: commitKeys.all });
    },
  });
}
```

### The Invalidation Flow

When a user edits a commit title:

```
1. User types new title
2. Optimistic update shows change immediately
3. API request sent to server
4. Server updates database
5. onSettled triggers
6. React Query invalidates all commit queries
7. Background refetch gets fresh data
8. UI updates with confirmed data
```

### Optional: Server-Side Path Revalidation

For cases where you need to force a full page refresh (rare), we provide a server action:

**`lib/data/revalidate.ts`:**

```tsx
"use server";

import { revalidatePath } from "next/cache";

export async function revalidateDashboard() {
  revalidatePath("/dashboard");
}
```

This clears the Next.js router cache, forcing a fresh server render on the next navigation.

### HTTP Cache Headers

We also set cache headers on API responses for browser/CDN caching:

```tsx
return NextResponse.json(
  { commits },
  {
    headers: {
      "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
    },
  }
);
```

Breaking this down:
- `private` - Only cache in the user's browser, not CDNs (data is user-specific)
- `max-age=60` - Cache is fresh for 60 seconds
- `stale-while-revalidate=300` - For the next 5 minutes, serve stale data while fetching fresh data in the background

---

## How It All Works Together

Let's trace through a complete user journey:

### 1. First Visit
```
User navigates to /dashboard
  → loading.tsx shows skeleton instantly
  → page.tsx calls getCachedCommits()
    → Query database → transform data → return
  → DashboardView renders with server data
  → React Query stores data in client cache (5min staleTime)
```

### 2. Page Refresh
```
User refreshes the page
  → loading.tsx shows skeleton
  → page.tsx calls getCachedCommits()
    → Query database → return fresh data
  → DashboardView renders with new server data
  → React Query updates client cache
```

### 3. Navigate Away and Back (within 5 minutes)
```
User goes to /settings, then back to /dashboard
  → React Query has cached data (still fresh)
  → DashboardView renders instantly (no loading state)
  → No server request needed
```

### 4. User Edits a Title
```
User changes a commit title
  → useUpdateCommitTitle fires
  → UI updates immediately (optimistic update)
  → API call happens in background
  → Server updates database
  → Mutation's onSettled invalidates React Query cache
  → Background refetch gets fresh data from server
```

### 5. Window Focus After 5+ Minutes
```
User switches to another tab, comes back after 6 minutes
  → React Query detects data is stale
  → Shows cached data immediately
  → Triggers background refetch
  → UI updates silently when fresh data arrives
```

---

## Common Gotchas

### 1. Cache Key Mismatch
If your cache keys don't match exactly, you'll get cache misses:

```tsx
// These are DIFFERENT cache keys:
commitKeys.list("my-project")
commitKeys.list("My-Project")  // Different case = different key
```

Always normalize inputs (lowercase, trim whitespace) before using them in keys.

### 2. Forgetting to Invalidate
If you add a new mutation that modifies data, remember to:
1. Call `revalidateUserCommits()` in the API route
2. Call `queryClient.invalidateQueries()` in the mutation

### 3. Initial Data Type Mismatch
The `initialData` you pass to `useQuery` must match the return type of `queryFn`:

```tsx
// queryFn returns CognitiveCommit[]
useQuery({
  queryFn: async () => fetchCommits(),  // Returns CognitiveCommit[]
  initialData: serverCommits,            // Must also be CognitiveCommit[]
});
```

### 4. Stale Closure in Callbacks
When using callbacks in mutations, capture current values:

```tsx
// Wrong - selectedCommitId might be stale
const handleTitleChange = () => {
  mutate({ commitId: selectedCommitId, title: newTitle });
};

// Right - include in dependency array
const handleTitleChange = useCallback(() => {
  mutate({ commitId: selectedCommitId, title: newTitle });
}, [selectedCommitId, mutate]);
```

---

## File Reference

| File | Purpose |
|------|---------|
| `packages/ui/src/CommitCardSkeleton.tsx` | Single card skeleton |
| `packages/ui/src/CommitListSkeleton.tsx` | List of card skeletons |
| `apps/web/app/(dashboard)/dashboard/loading.tsx` | Page-level loading state |
| `apps/web/lib/data/commits.ts` | Server-cached data fetching |
| `apps/web/lib/data/revalidate.ts` | Cache invalidation actions |
| `apps/web/components/providers/QueryProvider.tsx` | React Query setup |
| `apps/web/lib/hooks/useCommits.ts` | Client-side data hooks |

---

## Further Reading

- [Next.js Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
- [React Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [HTTP Cache-Control Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
