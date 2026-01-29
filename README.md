# Shipchronicle

> The chronicle of shipping. Explore how products evolve through human-AI collaboration.

Parse Claude Code session logs to extract **Cognitive Commits** - the work that happens between git commits, including the conversation that shaped it.

## Installation

```bash
npm install
npm run build
npm run build:studio  # Build the web UI
```

## Quick Start

```bash
# Initialize shipchronicle for your project
cd your-project
shipchronicle init

# Import existing Claude sessions
shipchronicle import

# Open the web studio to browse conversations
shipchronicle studio
```

**Or browse ALL your Claude Code history:**

```bash
# Import from all Claude projects
shipchronicle import --global

# View everything in the studio
shipchronicle studio --global
```

## Commands

### Web Studio (Phase 3)

```bash
# Start the web-based curation studio
shipchronicle studio                 # Opens http://localhost:4747

# Custom port
shipchronicle studio --port 3000

# Don't auto-open browser
shipchronicle studio --no-open

# Global mode: view ALL Claude Code history
shipchronicle studio --global
```

### Import Sessions

```bash
# Import sessions from configured Claude project
shipchronicle import

# Import from all Claude Code projects (global history)
shipchronicle import --global

# Clear existing data before importing
shipchronicle import --clear

# Import from specific Claude project
shipchronicle import --claude-path ~/.claude/projects/-Users-you-project
```

### Watch Daemon (Phase 2)

```bash
# Initialize for a project (auto-detects Claude project path)
shipchronicle init

# Start watching for Claude sessions (runs in background)
shipchronicle watch

# Run in foreground with verbose output
shipchronicle watch --foreground --verbose

# Check daemon status and statistics
shipchronicle status

# Stop the daemon
shipchronicle stop

# Manually capture a screenshot
shipchronicle capture

# Capture specific URL
shipchronicle capture --url http://localhost:3000
```

### Parser CLI (Phase 1)

```bash
# List discovered Claude projects
shipchronicle list

# Parse a project
shipchronicle parse ~/.claude/projects/-Users-you-YourProject/

# Parse specific session
shipchronicle parse <path> -s <session-id>

# Output formats: pretty (default), json, summary
shipchronicle parse <path> -o json
```

## What is a Cognitive Commit?

The **Cognitive Commit** is the new unit of work. It captures everything between git commits:

| Git | Cognitive Commit |
|-----|------------------|
| Many file changes → one commit | Many turns → one cognitive commit |
| Commit message = summary | First prompt = intent |
| `git diff` shows what changed | Turns show how it evolved |

**What closes a Cognitive Commit:**
1. **Git commit** - links directly to a hash
2. **Session end** - work done but not committed
3. **Explicit close** - user manually marks boundary

## Example Output

```
╔════════════════════════════════════════════════════════════╗
║  SHIPCHRONICLE: myproject                                  ║
╚════════════════════════════════════════════════════════════╝

📊 Summary
   Cognitive Commits: 3
   Sessions Parsed: 1
   Total Turns: 305

📝 Cognitive Commits

   1. [5ab1b76]
      Closed by: git_commit
      Time: 03:01 AM → 03:38 AM
      Sessions: 1 (152 turns)
      Files changed: 11
```

## How It Works

When the daemon is running, it:

1. **Monitors** Claude Code session files (`.jsonl`) for changes
2. **Detects** git commits in the conversation
3. **Captures** screenshots of your dev server automatically
4. **Persists** cognitive commits to SQLite for later retrieval

Data is stored in `~/.shipchronicle/<project-hash>/`:
- `data.db` - SQLite database with commits, sessions, turns
- `screenshots/` - Auto-captured and manual screenshots

## Roadmap

- **Phase 1:** Parser CLI ✓
- **Phase 2:** Watch daemon + auto-capture screenshots ✓
- **Phase 3:** Web studio for curation ✓
- **Phase 4:** Public viewer at shipchronicle.com

See [docs/vision.md](docs/vision.md) for the full vision.

## License

MIT
