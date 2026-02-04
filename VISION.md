# Tuhnr Vision & Direction

> **Tagline:** "The free, fun way to track your AI coding."

## What We're Building

**Duolingo for AI-assisted development.** Track your AI coding journey, level up your shipping, and rep your tool.

Under the hood: Parses session logs from Claude Code (and soon Cursor, Codex, OpenCode) to extract "Cognitive Commits" - the work that happens between git commits. Gamified analytics, faction leaderboards, and streaks make it fun to track your progress.

## The Core Insight

User sentiment is embedded in the conversation itself. We don't need external quality metrics - we can infer success/failure from how the conversation flows.

```
Task start → Turns → Resolution
                      ↓
              Happy (moves on) or Unhappy (iterates/rejects)
```

## Branding & Positioning

### Why "Tuhnr"

| Aspect | CogCommit (old) | Tuhnr |
|--------|-----------------|-------|
| Framing | "GitHub for AI conversations" | "Duolingo for AI development" |
| Energy | Technical, serious | Warm, approachable |
| CLI | `cogcommit push` (12 chars) | `tuhnr push` (5 chars) |

**The meaning:**
- **Tuning your AI collaboration** - optimizing how you work with AI tools
- **Getting "in tune"** - harmony between you and your AI assistant
- **Tuner = someone who adjusts for optimal performance**

### Visual Identity: The Flame

The logo is a **candle with a T** - the flame sits atop a stylized T that forms the candle body.

| Element | Meaning |
|---------|---------|
| **Flame** | Streaks ("keep the flame alive"), warmth, progress |
| **T as candle** | Tuhnr initial, the thing you're keeping lit |
| **Burnt orange** | Primary accent (#e07b39), warm but dusty |

**The candle metaphor:**
- Your coding streak is a flame you keep alive
- Miss a day, the flame goes out
- Duolingo-style psychology, but with a candle instead of an owl

### Messaging

**Hero tagline:**
> "The free, fun way to track your AI coding."

**For developers:**
> "Keep your shipping streak alive."

**For technical contexts:**
> "The open source AI coding tracker. Works with Claude Code, Cursor, OpenCode, and more."

---

## Go-To-Market: Faction Wars

Turn user acquisition into a game. Tool communities compete on total commits.

```
Live Leaderboard
──────────────────────────────────
🥇 Claude Code    12,847 commits
🥈 Cursor          9,234 commits
🥉 OpenCode        4,521 commits
   Codex           2,103 commits
   Windsurf        1,847 commits
──────────────────────────────────
```

### Why This Works

| Traditional launch | Faction wars launch |
|-------------------|---------------------|
| "Track your AI coding" | "Rep your tool" |
| Personal utility | Tribal identity |
| Requires explaining value | Self-explanatory |
| Passive signup | Active recruitment |

**Zero skill floor:** Vibe coders count the same as 10x engineers.

**Built-in virality:** "Claude Code is behind, we need signups" spreads organically.

**Tool communities market for you:** Claude Discord, Cursor subreddit, etc.

---

## Business Model: Data Platform

**The reframe:** Tuhnr is a data platform, not a traditional SaaS tool.

| Traditional SaaS | Data Platform (Tuhnr) |
|-----------------|------------------------|
| Users pay for value | Users contribute data |
| Revenue = success metric | Data volume + engagement = success metric |
| Monetize users directly | Monetize via enterprise, API, acquisition |

### Why Free is Strategic

1. **Data collection > individual revenue** - every paywall is friction against the moat
2. **Free should be generous** - unlimited sync, no caps
3. **Stats drive engagement, not gates** - progress bars are achievements, not limits
4. **Enterprise is the revenue path** - teams pay, individuals contribute data

### Individual Tier (Free)

No limits. Maximum data collection.

- Unlimited cloud sync
- Full personal analytics
- Faction wars participation
- Whales leaderboard eligibility

### Enterprise/Teams Tier ($$$)

- Team analytics dashboard
- Cross-member insights and benchmarks
- Compliance/audit logs
- SSO and admin controls
- API access

---

## Strategic Position: Neutral Third Party

Tuhnr occupies a unique position the AI labs can't fill themselves.

**Why Anthropic won't build this:**
- Collecting data from Cursor/Codex users looks like spying on competitors
- They're incentivized to keep users in their ecosystem

**Why OpenAI/Cursor won't build this:**
- Same problem in reverse
- Each lab wants lock-in, not interoperability

**Tuhnr as Switzerland:**
- Neutral party that aggregates across all tools
- Users trust a third party for cross-tool analytics
- The only place this cross-tool data can exist

This is a structural moat, not just a feature moat.

---

## Analytics Vision

### MVP Analytics (Current)

| Metric | Implementation |
|--------|----------------|
| Turns per commit | Count turns in each commit |
| Simple sentiment | Keyword matching for approval/rejection |
| Dashboard summary | "This week: 12 commits, avg 4.2 turns" |
| Per-commit indicators | Visual badge: smooth vs struggled |

### Future Analytics

| Metric | Why it matters |
|--------|----------------|
| First-prompt success rate | % of tasks resolved in 1-2 turns |
| Rejection frequency | Learn what prompts lead to mistakes |
| Tool call patterns | Heavy reads = exploring, heavy edits = implementing |
| "Stuck" detection | Flag when spinning wheels |

### Leaderboards & Network Effects

**Prompt-based leaderboards:**

| Leaderboard | Metric |
|-------------|--------|
| Refactoring | Turns to completion |
| Debugging | First-prompt success rate |
| Feature implementation | Rejection rate |

**What this enables:**
- "Best prompts for React debugging" - ranked by community data
- "Your refactoring efficiency vs average"
- "Trending prompt patterns this week"

**Network effects:**
- More users → better prompt rankings → more value → more users
- This is the flywheel that makes the platform defensible

---

## Multi-Platform Support

Currently Claude Code only. Future support for:
- Cursor
- GitHub Copilot Chat
- OpenCode
- Codex CLI
- Other AI coding assistants

Claude Code is the beachhead - best logs, growing fast, known deeply.

---

## What Could Kill This

Keep these visible. Solve them or die.

- **Cold start problem** - Leaderboards need users
- **Distribution** - Dev tools are hard to market
- **Will insights be interesting?** - What if the data is noise?
- **Multi-tool maintenance** - Each tool has different log formats
- **Privacy tightrope** - One breach and trust is gone
- **Execution risk** - Ship fast, iterate on feedback

---

## Technical Notes

- Input files: `~/.claude/projects/<project-path>/<session-uuid>.jsonl`
- Local storage: `~/.tuhnr/global/data.db`
- Auth tokens: `~/.tuhnr/auth.json`
- Session files can be large (25MB+) - use streaming
- Git commits detected from Bash tool calls containing `git commit`
