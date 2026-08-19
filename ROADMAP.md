# Steam Player Intel — Roadmap & Ideas

A living list of where the app could go next. Nothing here is a commitment — it's a
menu of high-value ideas, roughly ordered by impact for a Rust server admin.

## Guiding principles (don't break these)

- **Never fabricate data.** Missing/hidden values are shown as `PRIVATE / UNAVAILABLE`, never guessed.
- **Every value is labeled** with its source, status, and time.
- **Never accuse.** Bans and community/reputation signals are presented as facts or *leads to investigate* — never as proof of cheating, alting, etc.
- **Local-first.** History, cache, and settings live on the user's machine.

## Shipped so far (v0.1.0 → v0.9.0)

- Single-player analysis: identity, account age (calendar-accurate), games/playtime, Rust hours, VAC/game/community bans, profile score, sourced timeline, raw payloads.
- Notes & tags, recent players, favorites, and player comparison.
- Change detection + a per-player **scan-history timeline**, plus a **Rust playtime-over-time trend** built from stored scans.
- **Friend-network ban screening**: a Friends tab that screens a profile's public friend list for VAC/game/community bans, shown as leads to investigate (private lists handled gracefully).
- **Command center home**: a landing dashboard with tracked/favorite counts and a cross-player **activity feed** of recorded changes, plus a "check favorites now" action.
- **Watchlist monitoring**: background re-scan of favorites every 6h with desktop notifications + optional **Discord webhook** alerts on new bans / privacy flips.
- **Saved rosters + scheduled re-screen**: named lists with a per-roster auto-screen interval that re-checks in the background and posts a **change digest** to Discord.
- **Bulk roster screening**: paste many IDs, live progress, sortable table, ban flags, CSV export.
- **Cross-reference lookups** (RustBanned, BanSearch, RustWho, SteamID.uk); command palette (Ctrl/Cmd+K); persistent HTTP cache + offline "last known good"; experimental BattleMetrics server history.
- **Local data backup & restore** (portable JSON; API keys never included; safe merge that never clobbers existing data).
- Polish: **virtualized tables** for large lists, a **first-run welcome tour**, and **Windows code-signing setup** wired to CI secrets (see `docs/SIGNING.md`).
- Production: auto-update via GitHub Releases, reproducible builds (`npm ci` + committed lockfile), CI-gated tests + typecheck.

---

## Phase 2 — next ideas

Roughly ordered by impact. Same guardrails apply: sourced, labeled, leads-not-verdicts.

### Deeper investigative signal (the core value)

- **Alt-account leads across your own history** — correlate players you've already scanned by shared signals (matching avatar hashes, near-identical vanity/name patterns, overlapping friend lists) and surface them as "possible connections to review." Strictly local, strictly leads, never "this is an alt."
- **Shared-network overlap in Compare** — when comparing two players, show how many friends they have in common and how many of those carry bans. A strong, factual lead for cheater circles.
- **Smurf-indicator panel** — one card listing the factual signals that tend to warrant a second look (young account + high Rust %, private profile, tiny game library, recent purchase date), each labeled as an observation with the profile-score disclaimer front and center.
- **Ban-timing context** — use `DaysSinceLastBan` to place a ban on a timeline relative to account creation and when you first saw the player, presented as a date fact, not a verdict.

### Server-admin workflows

- **"Watch this server" rosters** — tie a saved roster to a server so you can paste its current player list and re-screen the group on a schedule.
- **Screening report PDF** — a clean, printable per-roster report with the non-accusatory flagged summary, good for handing to other admins.
- **Admin note/tag templates** — quick presets like "warned," "temp-banned," "cleared" to standardize how a team annotates players.

### Alerting & automation

- **More channels beyond Discord** — Slack webhook, generic webhook, and optional email (SMTP) digests.
- **Configurable alert rules** — choose which change kinds fire alerts (today it's new bans + privacy flips only) and set quiet hours.
- **Per-roster routing + daily summary** — route roster A to one channel and roster B to another; plus an optional once-a-day roll-up of everything that changed.

### Transparency & trust (leans into the principles)

- **"Show your work" audit view** — one normalized panel listing every field, its source, freshness, and status: a friendlier version of the Raw tab.
- **"Why is this flagged?" explainers** — inline rationale on each activity-feed item and profile-score factor.
- **Data-retention controls** — configurable auto-prune, per-player delete, and export-then-clear.

### UX & platform

- **Global spotlight search** across all scanned players by name, tag, or note.
- **N-way roster compare grid** (more than two players at once).
- **macOS / Linux builds** — the release workflow is Windows-only today; the config already lists dmg/AppImage targets.

### Additional sources (each clearly labeled experimental)

- **SteamRep / community trade-ban lookups** and **public Steam group membership** — surfaced as third-party claims with their source, never folded into the app's own facts.

---

## Suggested next step

**Alt-account / shared-network leads.** It's the highest-leverage extension of what the app
is uniquely good at, it's fully local (no new API keys), and it turns the history the app
already stores into an investigative asset — always as leads to review, never as accusations.

Notes on what needs your input rather than mine: the extra alert channels and third-party
sources need their own keys/webhooks, and macOS/Linux builds are a workflow decision.
Everything else here is buildable as-is.
