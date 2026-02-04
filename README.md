# Tuhnr

> The free, fun way to track your AI coding.

**Duolingo for AI-assisted development.** Track your AI coding journey, level up your shipping, and rep your tool.

## What It Does

Parses session logs from Claude Code (and soon Cursor, Codex, OpenCode) to extract "Cognitive Commits" - the work that happens between git commits. Gamified analytics, faction leaderboards, and streaks make it fun to track your progress.

```bash
tuhnr push      # import + sync to cloud
tuhnr stats     # see your progress
tuhnr dashboard # browse locally
```

## Web Platform

Visit [tuhnr.com](https://tuhnr.com) to browse your synced cognitive commits in the cloud.

## CLI Installation

```bash
npm install -g tuhnr
```

## Quick Start

```bash
# Authenticate with GitHub
tuhnr login

# Import from Claude Code and push to cloud (one command!)
tuhnr push

# Open the local dashboard
tuhnr dashboard
```

## Commands

### Push (Import + Sync)

```bash
tuhnr push                # Import from Claude + push to cloud
tuhnr push --skip-import  # Push existing commits only
tuhnr push --dry-run      # Preview what would be pushed
tuhnr push --force        # Re-sync all commits
tuhnr push --retry        # Retry failed pushes
```

### Import (Local Only)

```bash
tuhnr import              # Import all Claude Code projects
tuhnr import --clear      # Clear existing data first
tuhnr import --redetect   # Re-run project detection
```

### Dashboard

```bash
tuhnr dashboard           # Start local dashboard
tuhnr dashboard --port 3000
```

### Cloud Sync

```bash
tuhnr login               # GitHub OAuth
tuhnr logout              # Clear tokens
tuhnr whoami              # Show current user
tuhnr pull                # Pull from cloud
tuhnr sync                # Bidirectional sync
```

### Data Management

```bash
tuhnr stats                              # View statistics
tuhnr stats --project myproject --json

tuhnr export --format=json -o backup.json
tuhnr export --format=markdown

tuhnr search "error handling"
tuhnr search "API" --project myproject

tuhnr prune --before 30d --dry-run
```

## What is a Cognitive Commit?

The **Cognitive Commit** captures the work between git commits:

| Git | Cognitive Commit |
|-----|------------------|
| Many file changes → one commit | Many turns → one cognitive commit |
| Commit message = summary | First prompt = intent |
| `git diff` shows what changed | Turns show how it evolved |

**What closes a Cognitive Commit:**
1. **Git commit** - links directly to a hash
2. **Session end** - work done but not committed
3. **Explicit close** - user manually marks boundary

## Monorepo Structure

```
tuhnr/
├── apps/
│   ├── cli/                 # CLI tool (npm: tuhnr)
│   └── web/                 # Next.js web platform
├── packages/
│   ├── types/               # Shared TypeScript types
│   ├── supabase/            # Supabase client & queries
│   └── ui/                  # Shared UI components
└── docs/                    # Documentation
```

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
git clone https://github.com/clokk/tuhnr.git
cd tuhnr
pnpm install
pnpm build
```

### Running Locally

```bash
# CLI development
pnpm dev --filter=tuhnr

# Web development
pnpm dev --filter=web
```

## Data Storage

- `~/.tuhnr/global/data.db` - SQLite database
- `~/.tuhnr/auth.json` - Authentication tokens

## License

MIT
