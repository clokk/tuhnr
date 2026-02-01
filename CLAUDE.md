# Agentlogs

Parses Claude Code session logs into **Cognitive Commits** — the unit of work between git commits, showing the conversation that shaped the code.

## Architecture

Four-layer design:

| Layer | Location | Purpose |
|-------|----------|---------|
| Parser | `src/parser/` | Reads JSONL logs from `~/.claude/projects/`, extracts cognitive commits via state machine |
| Storage | `src/storage/` | SQLite with migrations (currently v6), supports global and project modes |
| Sync | `src/sync/` | Cloud sync with Supabase — GitHub OAuth, push/pull commits to cloud |
| Studio | `src/studio/` | React frontend + Hono API for browsing and curating commits |

## Data Model

### CognitiveCommit

```typescript
{
  id: string;              // UUID
  gitHash: string | null;  // Links to git commit (if closed by commit)
  closedBy: "git_commit" | "session_end" | "explicit";
  startedAt: Date;
  closedAt: Date;
  sessions: Session[];     // Supports parallel Claude sessions
  parallel: boolean;       // True if sessions overlapped
  filesRead: string[];     // Paths only
  filesChanged: string[];  // Paths with diffs
  source: ConversationSource; // Agent that produced the conversation
}

// Supported sources (currently only claude_code is implemented)
type ConversationSource = "claude_code" | "cursor" | "antigravity" | "codex" | "opencode";
```

### Commit Closure

A cognitive commit closes when:
1. **Git commit** — Natural boundary, links directly to hash
2. **Session end** — Work done but uncommitted (exploratory, abandoned)
3. **Explicit close** — User manually marks boundary

### Storage Paths

- **Global mode**: `~/.agentlogs/global/data.db` — all projects in one DB
- **Project mode**: `~/.shipchronicle/<hash>/data.db` — project-scoped by path hash

### Cloud Sync

Follows git/github model — local CLI syncs to Supabase cloud backend:

```bash
agentlogs login              # GitHub OAuth (opens browser)
agentlogs logout             # Clear local tokens
agentlogs whoami             # Show current user
agentlogs push               # Push pending commits to cloud
agentlogs pull               # Pull new commits from cloud
agentlogs sync --status      # Show sync state
```

Auth tokens stored in `~/.agentlogs/auth.json`. Each commit has sync metadata:
- `cloud_id` — UUID in cloud database
- `sync_status` — pending | synced | conflict | error
- `cloud_version` / `local_version` — for conflict detection

See `docs/cloud-architecture.md` for full architecture details.

---

## Critical: Flexbox Scroll Bug

**This is the most common issue when working on Studio UI.**

Flexbox layouts with `overflow-y-auto` children won't create independent scroll contexts if the root can expand. The whole page scrolls instead of individual panels.

### Root Cause

Using `min-h-screen` on the root allows content to expand beyond viewport, causing page-level scroll instead of panel-level scroll.

### The Fix

```tsx
// Root - fixed to viewport, no page scroll
<div className="h-screen bg-bg flex flex-col overflow-hidden">
  <Header />
  <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
    {/* Left panel - resizable, collapsible */}
    <div style={{ width: sidebarCollapsed ? 48 : sidebarWidth }}>...</div>
    {/* Resizer */}
    <div className="w-1 cursor-col-resize" />
    {/* Right panel */}
    <div className="flex-1 overflow-hidden">
      <DetailView />
    </div>
  </div>
</div>
```

**Key rules:**
- Root: `h-screen overflow-hidden` (NOT `min-h-screen`)
- Flex containers: `style={{ minHeight: 0 }}` to allow children to shrink
- Scroll containers: `style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto' }}`

---

## Studio Layout Features

### Resizable Sidebar
- Drag the divider between sidebar and conversation to resize (200-600px)
- Width persisted to `localStorage` key: `agentlogs-sidebar-width`

### Collapsible Sidebar
- Click chevron button to collapse/expand
- Collapsed state shows mini commit indicators (48px strip)
- State persisted to `localStorage` key: `agentlogs-sidebar-collapsed`

### Font Size Controls
- Located in navigation bar at bottom of conversation
- Sizes: 12, 14, 16, 18, 20px (default: 16px)
- Persisted to `localStorage` key: `agentlogs-font-size`

### Tool-Only Groups
- Consecutive assistant turns with only tool calls (no text) are grouped
- Displayed as a single compact row with all tools as clickable pills
- Click any tool to expand its input/result details
- Component: `src/studio/frontend/components/ToolOnlyGroup.tsx`

### Item-Based Navigation
- `j/k` navigates by visual "items" (tool groups count as 1)
- `J/K` skips to next/prev user message
- Navigation bar shows item position with fixed-width counter
- Raw turn count still shown in header stats for accuracy

### Export Features
- **Per-turn copy**: Hover over any turn to reveal copy button, copies turn content + tool summaries
- **Export dropdown**: In header, offers Download as Markdown, Download as Plain Text, Copy to Clipboard
- Utilities in `src/studio/frontend/utils/export.ts`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/parser/extractor.ts` | Core parsing state machine — extracts commits from log entries |
| `src/parser/types.ts` | Log entry type definitions matching Claude Code JSONL format |
| `src/storage/schema.ts` | Database schema + migrations (v6 includes sync metadata) |
| `src/storage/db.ts` | Database operations, handles global vs project mode |
| `src/sync/auth.ts` | GitHub OAuth PKCE flow for cloud authentication |
| `src/sync/client.ts` | Supabase client wrapper, token management |
| `src/sync/push.ts` | Push local commits to cloud |
| `src/sync/pull.ts` | Pull cloud commits to local |
| `src/studio/frontend/App.tsx` | Main React app layout with split pane |
| `src/studio/frontend/components/CommitDetail.tsx` | Detail view — item navigation, tool grouping |
| `src/studio/frontend/components/CommitList.tsx` | Left sidebar commit list |
| `src/studio/frontend/components/ToolOnlyGroup.tsx` | Grouped display for consecutive tool-only turns |
| `src/studio/frontend/utils/export.ts` | Export formatters + clipboard/download helpers |
| `src/studio/server.ts` | Hono API server |
| `src/index.ts` | CLI entry point with all commands |
| `docs/cloud-architecture.md` | Cloud sync architecture and implementation status |
| `docs/style-guide.md` | Design system + known UI fixes |
| `docs/vision.md` | Full product roadmap and architecture decisions |

---

## Design System

### Colors

| Token | Usage |
|-------|-------|
| `--chronicle-blue` | Primary action, links, current selection |
| `--chronicle-green` | Git hashes, success states, committed work |
| `--chronicle-amber` | File changed indicators, uncommitted work |
| `--chronicle-purple` | Parallel session indicators |

### Fonts

| Font | Usage |
|------|-------|
| **Inter** | UI text, conversation content |
| **JetBrains Mono** | Git hashes, file paths, code, timestamps |

### Patterns

- Committed commits: `border-chronicle-green`
- Uncommitted work: `border-chronicle-amber`
- User messages: `bg-chronicle-blue/5 border-l-2 border-chronicle-blue`
- Assistant messages: `bg-panel`
