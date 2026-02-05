# Tuhnr CLI

The command-line interface for Tuhnr - track your AI coding sessions.

## Quick Start

```bash
tuhnr start           # One command: init + auth + daemon
```

That's it. Cloud sync is enabled automatically with anonymous auth. Claim your account later:

```bash
tuhnr claim           # Link to GitHub when ready
```

## Project-Scoped vs Global

Tuhnr can run in two modes:

### Per-Project (Recommended for live sync)

Each project directory gets its own daemon with automatic background sync:

```bash
cd ~/my-project
tuhnr start           # Creates .tuhnr/, starts daemon for this project

cd ~/other-project
tuhnr start           # Separate daemon for this project
```

- Creates `.tuhnr/` in the project directory
- Auto-detects matching Claude project path (`~/.claude/projects/-Users-...`)
- Daemon runs in background, syncs automatically
- `tuhnr status` only works from initialized directories

**The daemon is detached** - you can close the terminal and it keeps running. Survives until system restart or `tuhnr stop`.

### Global (Manual sync)

Import and sync all Claude sessions without per-project setup:

```bash
tuhnr import          # Imports ALL Claude projects to ~/.tuhnr/global/data.db
tuhnr push            # Syncs everything to cloud
```

- No per-project initialization needed
- Uses global database at `~/.tuhnr/global/data.db`
- No live daemon - run `tuhnr import && tuhnr push` manually
- Good for one-time backups or if you don't want per-project daemons

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Building

```bash
# From repo root
pnpm build --filter=tuhnr

# Or from this directory
pnpm build
```

This runs two build steps:
1. `tsc` - Compiles TypeScript to `dist/`
2. `vite build` - Bundles the Studio frontend to `dist/studio/`

### Running Locally

```bash
# Run CLI directly
node dist/index.js --help

# Or use pnpm dev from repo root
pnpm dev --filter=tuhnr
```

### Testing the Studio Dashboard

```bash
# Import some data first
node dist/index.js import

# Start the dashboard
node dist/index.js dashboard
```

## Architecture

```
src/
├── index.ts              # CLI entry point
├── commands/             # Command modules (Commander.js)
│   ├── parse.ts          # parse, list, info commands
│   ├── init.ts           # init command
│   ├── start.ts          # start command (unified entry point)
│   ├── claim.ts          # claim command (link anonymous → GitHub)
│   ├── watch.ts          # watch, stop, status, capture
│   ├── studio.ts         # dashboard command
│   ├── import.ts         # import command
│   ├── auth.ts           # login, logout, whoami
│   ├── sync.ts           # push, pull, sync
│   └── config.ts         # config, analytics
├── parser/               # JSONL log parsing
├── storage/              # SQLite database
│   ├── db.ts             # Database wrapper
│   ├── schema.ts         # Schema & migrations
│   └── repositories/     # Data access layer
├── sync/                 # Cloud sync (push/pull)
│   ├── auth.ts           # OAuth + anonymous auth
│   ├── client.ts         # Supabase client wrapper
│   ├── push.ts           # Push to cloud
│   ├── pull.ts           # Pull from cloud
│   ├── queue.ts          # Background sync queue
│   └── types.ts          # Sync types (UserProfile, etc.)
├── studio/               # Local dashboard (React + Hono)
│   ├── server.ts         # Hono API server
│   └── frontend/         # React app (bundled by Vite)
├── daemon/               # Background watcher
├── config/               # Configuration paths
├── models/               # Type definitions
└── utils/                # Utility functions (title generation, etc.)
```

## Database API

Uses the repository pattern for data access:

```typescript
const db = new TuhnrDB(projectPath);

// Commits
db.commits.get(id);
db.commits.getAll();
db.commits.insert(commit);
db.commits.update(id, { title: "New title" });
db.commits.delete(id);

// Sessions & Turns
db.sessions.getForCommit(commitId);
db.turns.getForSession(sessionId);

// Visuals
db.visuals.create(commitId, "screenshot", filePath);
db.visuals.getForCommit(commitId);

// Daemon State
db.daemonState.getLastActivity();
db.daemonState.getCurrentCommitId();
db.daemonState.setFilePosition(filePath, position);
```

---

## Anonymous Auth & Frictionless Onboarding

The `start` command provides zero-friction onboarding with anonymous auth:

```bash
tuhnr start     # init + anonymous auth + daemon in one command
tuhnr claim     # link anonymous account to GitHub (when ready)
```

### How It Works

1. **`tuhnr start`** checks if project is initialized, runs init if needed
2. If not authenticated, creates anonymous Supabase account automatically
3. Starts daemon with cloud sync enabled
4. User can sync commits immediately without GitHub OAuth

### Anonymous → Claimed Flow

```
Anonymous account created → commits synced with anonymous user_id
                                      ↓
                            tuhnr claim (GitHub OAuth)
                                      ↓
                     Same user_id persists → all data claimed
```

**Key insight:** Supabase anonymous users get real UUIDs. When claiming via `linkIdentity()`, the user_id stays the same. No data migration needed.

### Key Functions (sync/auth.ts)

| Function | Purpose |
|----------|---------|
| `signInAnonymously()` | Creates anonymous account, saves tokens with `isAnonymous: true` |
| `ensureAuthenticated()` | Returns existing user or creates anonymous one |
| `claimAccount()` | Opens GitHub OAuth, links identity, updates `isAnonymous: false` |

### UserProfile Type

```typescript
interface UserProfile {
  id: string;
  githubUsername: string;  // "anon-abc12345" for anonymous
  githubId: string;        // "" for anonymous
  analyticsOptIn: boolean;
  isAnonymous?: boolean;   // true for anonymous users
  createdAt: string;
  updatedAt: string;
}
```

### Supabase Dashboard Requirement

Anonymous sign-ins must be enabled:
- Dashboard → Authentication → Providers → Anonymous Sign-ins → Enable

---

## Cloud Sync Commands

### Free Tier Limits

Cloud sync has usage limits:
- **250 commits** synced to cloud
- **50 MB storage**

Local usage is unlimited. When pushing, only the most recent commits sync up to the limit.

**What's automatically filtered:**
- Warmup sessions (Claude Code internal)
- Commits with no turns (empty)

These don't count against your limit and aren't synced to cloud.

### Push Options

The `push` command now automatically imports from Claude Code before pushing to cloud:

```bash
# Import from Claude and push to cloud (default behavior)
tuhnr push

# Verbose mode (shows each commit, disables progress bar)
tuhnr push --verbose

# Preview what would be pushed
tuhnr push --dry-run

# Force re-push all commits (resets sync status)
tuhnr push --force

# Retry previously failed commits
tuhnr push --retry

# Skip import step (push existing commits only)
tuhnr push --skip-import
```

### Cloud Management

```bash
# Delete all your cloud data (requires confirmation)
tuhnr cloud clear

# Skip confirmation (for scripts)
tuhnr cloud clear --yes
```

## Import Command

The import command reads Claude Code session logs and converts them to cognitive commits in the local database.

Use `tuhnr push` to both import and push to cloud, or `tuhnr import` for local-only import.

### Smart Project Detection

Commits are automatically assigned to projects based on where file operations actually occurred, not just where the Claude session was started. This handles the common case of starting a session in one directory but working on files in another project.

**How it works:**
- File reads: 1 point each
- File edits/writes: 3 points each
- Highest-scoring project wins
- Falls back to Claude session directory if no file operations

**Example:** A session started in `claudeverse` but with most edits in `tuhnr` will be correctly tagged as a `tuhnr` commit.

### Import Options

```bash
tuhnr import                   # Import all Claude Code projects (default)
tuhnr import --project         # Import current project only (requires init)
tuhnr import --clear           # Clear existing commits before importing
tuhnr import --redetect        # Re-run project detection on existing commits
```

### Re-detecting Projects

If you have existing commits with incorrect project assignments, use `--redetect` to re-run the smart detection algorithm:

```bash
tuhnr import --redetect
```

This scans all existing commits and updates their project assignments based on the file operations recorded in each commit.

---

## Data Management Commands

### Statistics

```bash
tuhnr stats                    # Overall statistics
tuhnr stats --project myproj   # Project-specific stats
tuhnr stats --json             # JSON output
```

### Export

```bash
tuhnr export                           # JSON to stdout
tuhnr export -o backup.json            # Save to file
tuhnr export --format=markdown         # Markdown format
tuhnr export --project myproj --limit 10
```

### Search

```bash
tuhnr search "keyword"                 # Search all content
tuhnr search "error" --project myproj  # Filter by project
tuhnr search "API" --limit 50          # Limit results
```

### Prune

```bash
tuhnr prune --before 30d --dry-run     # Preview deletions
tuhnr prune --before 2024-01-01        # Delete before date
tuhnr prune --before 7d --project old  # Project-specific
tuhnr prune --before 90d --yes         # Skip confirmation
```

## Publishing

```bash
# Build and publish to npm
pnpm build
npm publish
```

The package is published as `tuhnr` on npm.
