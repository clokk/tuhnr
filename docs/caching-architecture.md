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
│  Layer 1: Skeleton Loaders + Lazy Loading                   │
│  "Show list instantly, load details on demand"              │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Server Cache (React cache())                      │
│  "Request-level deduplication"                              │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Client Cache (React Query)                        │
│  "Remember API results in the browser for 5 minutes"        │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Targeted Cache Invalidation                       │
│  "Only refetch what changed"                                │
└─────────────────────────────────────────────────────────────┘
```

Let's explore each layer in detail.

---

## Layer 1: Skeleton Loaders + Lazy Loading Pattern

**Problem:** Fetching all commit data (including full conversations) upfront is slow and wasteful. Users only view one commit at a time, but we were loading everything.

**Solution:** Split data fetching into two tiers:
1. **Lightweight list** - Summary data for the sidebar (~2KB per commit)
2. **Full detail** - Complete sessions/turns loaded lazily when selected (~100KB per commit)

### The Architecture

```
apps/web/app/(dashboard)/dashboard/
├── page.tsx           ← Server component (auth only, no data fetch)
├── DashboardClient.tsx ← Client component (fetches list, lazy-loads detail)
└── loading.tsx        ← Shown during route transitions

apps/web/app/api/commits/
├── route.ts           ← Legacy full commits endpoint (deprecated)
├── list/route.ts      ← NEW: Lightweight list endpoint
└── [id]/
    ├── route.ts       ← PATCH for updates
    └── detail/route.ts ← NEW: Full commit detail endpoint
```

### Why Lightweight List + Lazy Detail?

We moved from fetching all data upfront to a list + detail pattern:

**Before (All Data Upfront):**
```
User refreshes → Server fetches ALL commits with ALL sessions/turns
                 └─── ~100KB × 100 commits = 10MB payload ───┘
```

**After (List + Detail):**
```
User refreshes → Server fetches lightweight list (~200KB for 100 commits)
User clicks commit → Fetch full detail for ONE commit (~100KB)
```

### API Endpoints

**`/api/commits/list`** - Lightweight list for sidebar:

```typescript
// Only fetches summary fields + counts
.select(`
  id, git_hash, started_at, closed_at, closed_by,
  title, project_name, source, parallel, hidden,
  sessions!inner (id, turns (id))
`)
```

Returns `CommitListItem[]` with:
- Basic metadata (id, gitHash, dates, title, projectName)
- Computed `sessionCount` and `turnCount` for display
- No full session/turn content

**`/api/commits/[id]/detail`** - Full detail for viewer:

```typescript
// Fetches everything for one commit
.select(`*, sessions (*, turns (*))`)
.eq("id", id)
.single()
```

Returns full `CognitiveCommit` with all sessions and turns.

### Page Structure

**`page.tsx`** - Only handles authentication:

```tsx
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null; // Layout redirects to login

  // Pass only auth info - NO data fetching here
  return (
    <DashboardClient
      userId={user.id}
      userName={userName}
      avatarUrl={avatarUrl}
    />
  );
}
```

**`DashboardClient.tsx`** - Client component with lazy loading:

```tsx
"use client";

export default function DashboardClient({ userId, userName, avatarUrl }) {
  // Lightweight list for sidebar
  const { data: commits = [], isLoading: isListLoading } = useCommitList({
    project: selectedProject,
  });

  // Full detail loaded lazily when commit is selected
  const { data: selectedCommit, isLoading: isDetailLoading } = useCommitDetail(
    selectedCommitId
  );

  // Show skeleton while list loads
  if (isListLoading) {
    return <DashboardSkeleton />;
  }

  return (
    <Dashboard>
      <CommitList commits={commits} />
      {isDetailLoading ? (
        <DetailSkeleton />
      ) : (
        <ConversationViewer commit={selectedCommit} />
      )}
    </Dashboard>
  );
}
```

### The Skeleton Components

We created reusable skeleton components in the UI package with Framer Motion animations:

**`CommitCardSkeleton.tsx`** - Matches the layout of a real CommitCard with shimmer effect:

```tsx
export default function CommitCardSkeleton() {
  return (
    <motion.div
      variants={cardVariants}
      className="relative rounded-lg p-3 border-l-2 border-subtle bg-bg/50 overflow-hidden"
    >
      <Shimmer />
      <div className="h-5 w-24 bg-subtle/40 rounded animate-pulse" />
      <div className="h-5 w-3/4 bg-subtle/40 rounded mt-1 animate-pulse" />
      {/* ... */}
    </motion.div>
  );
}
```

**`CommitListSkeleton.tsx`** - Renders multiple card skeletons with stagger animation:

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

export default function CommitListSkeleton({ count = 8 }) {
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible">
      {Array.from({ length: count }).map((_, i) => (
        <CommitCardSkeleton key={i} />
      ))}
    </motion.div>
  );
}
```

### Shimmer Effect

The `Shimmer` component provides a subtle animated gradient sweep:

```tsx
export function Shimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute inset-y-0 w-full"
        style={{
          background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.07) 50%, transparent 100%)",
        }}
        initial={{ x: "-100%" }}
        animate={{ x: "100%" }}
        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
      />
    </div>
  );
}
```

### Why This Matters

The lazy loading pattern achieves:
- **50-60% faster initial load** - Sidebar appears much faster
- **Better perceived performance** - Users see content immediately
- **Reduced bandwidth** - Only fetch detail data when needed
- **Smoother scrolling** - Less data in memory

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
          refetchOnWindowFocus: false,   // Disabled to reduce unnecessary refetches
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

**Refetch on Window Focus:** Disabled to prevent unnecessary refetches. Data still refetches when stale and user interacts.

### The Hooks

**`lib/hooks/useCommits.ts`:**

```tsx
// Query keys should be consistent and predictable
export const commitKeys = {
  all: ["commits"],
  lists: () => [...commitKeys.all, "list"],
  list: (project?: string | null) =>
    [...commitKeys.lists(), { project: project ?? "all" }],
  details: () => [...commitKeys.all, "detail"],
  detail: (id: string) => [...commitKeys.details(), id],
};

// Lightweight list for sidebar
export function useCommitList({ project }) {
  return useQuery({
    queryKey: commitKeys.list(project),
    queryFn: async () => {
      const res = await fetch(`/api/commits/list?project=${project || ""}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Full detail for selected commit (lazy loaded)
export function useCommitDetail(commitId: string | null) {
  return useQuery({
    queryKey: commitKeys.detail(commitId ?? ""),
    queryFn: async () => {
      const res = await fetch(`/api/commits/${commitId}/detail`);
      return res.json();
    },
    enabled: !!commitId, // Only fetch when commitId is set
    staleTime: 5 * 60 * 1000,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

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
      await queryClient.cancelQueries({ queryKey: commitKeys.lists() });
      await queryClient.cancelQueries({ queryKey: commitKeys.detail(commitId) });

      // Snapshot current data for rollback
      const previousLists = queryClient.getQueriesData({ queryKey: commitKeys.lists() });
      const previousDetail = queryClient.getQueryData(commitKeys.detail(commitId));

      // Optimistically update both list and detail caches
      queryClient.setQueriesData({ queryKey: commitKeys.lists() }, (old) =>
        old?.map((c) => c.id === commitId ? { ...c, title } : c)
      );
      if (previousDetail) {
        queryClient.setQueryData(commitKeys.detail(commitId), { ...previousDetail, title });
      }

      return { previousLists, previousDetail, commitId };
    },

    // Rollback on error
    onError: (err, variables, context) => {
      // Restore previous data if mutation fails
      for (const [queryKey, data] of context.previousLists) {
        queryClient.setQueryData(queryKey, data);
      }
      if (context.previousDetail) {
        queryClient.setQueryData(commitKeys.detail(context.commitId), context.previousDetail);
      }
    },
  });
}
```

This creates a snappy, app-like feel where changes appear instantly.

---

## Layer 4: Targeted Cache Invalidation

**Problem:** Aggressive cache invalidation (invalidating ALL queries after ANY mutation) causes unnecessary refetches and poor UX.

**Solution:** Targeted invalidation that only refetches what actually changed.

### How Targeted Invalidation Works

Instead of invalidating everything:

```tsx
// ❌ Old approach - invalidates ALL commit queries
onSettled: () => {
  queryClient.invalidateQueries({ queryKey: commitKeys.all });
}
```

We now target specific queries:

```tsx
// ✅ New approach - only invalidates affected queries
onSettled: (_, __, { commitId }) => {
  // Invalidate the specific detail that was modified
  queryClient.invalidateQueries({
    queryKey: commitKeys.detail(commitId),
  });
  // Invalidate lists to update the title in sidebar
  queryClient.invalidateQueries({
    queryKey: commitKeys.lists(),
  });
}
```

### The Invalidation Flow

When a user edits a commit title:

```
1. User types new title
2. Optimistic update shows change immediately in both list and detail
3. API request sent to server
4. Server updates database
5. onSettled triggers
6. React Query invalidates:
   - The specific detail query for that commit
   - All list queries (to update title in sidebar)
7. Background refetch gets fresh data
8. UI updates with confirmed data
```

### What Changed

| Before | After |
|--------|-------|
| Invalidate ALL commit queries | Invalidate only affected detail + lists |
| Refetch everything | Refetch only what changed |
| Poor UX with many commits | Smooth UX at any scale |

### HTTP Cache Headers

We also set cache headers on API responses aligned with React Query's staleTime:

```tsx
return NextResponse.json(
  { commits },
  {
    headers: {
      "Cache-Control": "private, max-age=300, stale-while-revalidate=600",
    },
  }
);
```

Breaking this down:
- `private` - Only cache in the user's browser, not CDNs (data is user-specific)
- `max-age=300` - Cache is fresh for 5 minutes (matches React Query staleTime)
- `stale-while-revalidate=600` - For the next 10 minutes, serve stale data while fetching fresh data in the background

---

## How It All Works Together

Let's trace through a complete user journey:

### 1. First Visit / Hard Refresh
```
User navigates to /dashboard
  → Middleware checks for auth cookie (fast, no API call)
  → Server renders page with DashboardClient
  → Browser receives HTML, hydrates
  → DashboardClient shows skeleton immediately (isListLoading = true)
  → React Query fetches /api/commits/list in background
  → List data arrives, sidebar renders (~200KB for 100 commits)
  → First commit auto-selected
  → React Query fetches /api/commits/[id]/detail for selected commit
  → Detail arrives, conversation viewer renders (~100KB for one commit)
```

### 2. User Selects Different Commit
```
User clicks different commit in sidebar
  → selectedCommitId changes
  → React Query checks cache for that commit's detail
  → If cached: renders immediately
  → If not cached: shows detail skeleton, fetches detail
  → Detail arrives, conversation viewer updates
```

### 3. Navigate Away and Back (within 5 minutes)
```
User goes to /settings, then back to /dashboard
  → React Query has cached list data (still fresh)
  → React Query has cached detail for last selected commit
  → DashboardClient renders instantly (no loading state)
  → No API requests needed
```

### 4. User Edits a Title
```
User changes a commit title
  → useUpdateCommitTitle fires
  → UI updates immediately in both list and detail (optimistic update)
  → API call happens in background
  → Server updates database
  → Mutation's onSettled triggers targeted invalidation
  → Background refetch gets fresh data for affected queries only
```

### 5. Switch Projects
```
User selects different project from dropdown
  → selectedProject changes
  → React Query checks cache for that project's list
  → If cached: renders immediately
  → If not cached: fetches list for that project
  → First commit in filtered list auto-selected
  → Detail fetched for new selected commit
```

---

## Middleware Optimization

The middleware is optimized to avoid blocking the page render:

```tsx
export async function updateSession(request: NextRequest) {
  // Quick check: does a session cookie exist? (no API call)
  const hasSessionCookie = request.cookies.has("sb-access-token") ||
    Array.from(request.cookies.getAll()).some(c => c.name.includes("auth-token"));

  // Only redirect if NO cookie exists
  if (isProtectedRoute && !hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Full auth verification happens in the layout, not middleware
  return response;
}
```

This ensures the page can start rendering immediately while auth verification happens in parallel.

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

### 2. Forgetting to Invalidate Both List and Detail
When modifying a commit, remember to invalidate both:
- The detail query (for the conversation viewer)
- The list queries (for the sidebar)

### 3. Using Wrong Endpoint
- Use `/api/commits/list` for sidebar data (lightweight)
- Use `/api/commits/[id]/detail` for full commit data (lazy loaded)
- The legacy `/api/commits` endpoint is deprecated

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
| `packages/ui/src/CommitCardSkeleton.tsx` | Single card skeleton with shimmer |
| `packages/ui/src/CommitListSkeleton.tsx` | List of card skeletons with stagger |
| `packages/ui/src/Shimmer.tsx` | Reusable shimmer animation component |
| `packages/types/src/index.ts` | Shared types including `CommitListItem` |
| `apps/web/app/(dashboard)/dashboard/page.tsx` | Server component (auth only) |
| `apps/web/app/(dashboard)/dashboard/DashboardClient.tsx` | Client component with lazy loading |
| `apps/web/app/(dashboard)/dashboard/loading.tsx` | Route transition loading state |
| `apps/web/app/api/commits/list/route.ts` | Lightweight list endpoint |
| `apps/web/app/api/commits/[id]/detail/route.ts` | Full detail endpoint |
| `apps/web/app/api/commits/[id]/route.ts` | PATCH endpoint for updates |
| `apps/web/app/api/projects/route.ts` | Projects list endpoint |
| `apps/web/lib/data/commits.ts` | Server-cached data fetching |
| `apps/web/lib/data/revalidate.ts` | Cache invalidation actions |
| `apps/web/components/providers/QueryProvider.tsx` | React Query setup |
| `apps/web/lib/hooks/useCommits.ts` | Client-side data hooks |

---

## Performance Summary

| Optimization | Impact |
|--------------|--------|
| Lightweight list endpoint | 50-60% faster initial load |
| Lazy-loaded detail | Reduced initial payload by ~95% |
| Targeted cache invalidation | Smoother UX, fewer refetches |
| Aligned cache settings | Consistent caching behavior |
| Disabled refetchOnWindowFocus | Fewer unnecessary network requests |

**Combined result**: Dashboard load time reduced from ~15 seconds to under 2 seconds.

---

## Further Reading

- [Next.js Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
- [React Query Documentation](https://tanstack.com/query/latest/docs/react/overview)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [HTTP Cache-Control Headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
