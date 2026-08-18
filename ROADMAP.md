# Steam Player Intel — Roadmap & Ideas

A living list of where the app could go next. Nothing here is a commitment — it's a
menu of high-value ideas, roughly ordered by impact for a Rust server admin.

## Guiding principles (don't break these)

- **Never fabricate data.** Missing/hidden values are shown as `PRIVATE / UNAVAILABLE`, never guessed.
- **Every value is labeled** with its source, status, and time.
- **Never accuse.** Bans and community/reputation signals are presented as facts or *leads to investigate* — never as proof of cheating, alting, etc.
- **Local-first.** History, cache, and settings live on the user's machine.

## Shipped so far (v0.1.0 → v0.4.0)

- Single-player analysis: identity, account age (calendar-accurate), games/playtime, Rust hours, VAC/game/community bans, profile score, sourced timeline, raw payloads.
- Notes & tags, recent players, favorites, and player comparison.
- Change detection + a per-player **scan-history timeline** built from stored scans.
- **Watchlist monitoring**: background re-scan of favorites every 6h with desktop notifications + optional **Discord webhook** alerts on new bans / privacy flips.
- **Bulk roster screening**: paste many IDs, live progress, sortable table, ban flags, copy-CSV.
- **Cross-reference lookups** (RustBanned, BanSearch, RustWho, SteamID.uk).
- Command palette (Ctrl/Cmd+K), persistent HTTP cache + offline "last known good", experimental BattleMetrics server history.
- Production: auto-update via GitHub Releases, reproducible builds (`npm ci` + committed lockfile), CI-gated tests + typecheck.

---

## Ideas for the future

### Make it smarter (deeper signal)

- **Rust-specific activity tracking** — on each scan, if Rust playtime > 0, record a `rust_observations` row. Then the Rust tab can honestly show "Rust activity first recorded on X" and a Rust-hours-over-time trend, instead of only account-wide scan times.
- **Friend-network ban screening** — pull the player's friends list (`GetFriendList`) and count how many friends carry VAC/game bans (a signal admins use). Surface as a neutral "N of M friends banned," handle private friend lists gracefully, never as an accusation.
- **Source-discrepancy flags** — when Steam and BattleMetrics disagree, call it out explicitly rather than silently choosing one.

### Make it a command center (the differentiator)

- **A "home" dashboard** — recent changes across watched players, favorites, and an API/data-source status tile, so opening the app instantly answers "what's new since last time?".
- **Saved rosters + scheduled re-screens** — save a clan/server list, auto-rescreen on a schedule, and send a Discord/email **digest of only what changed**. (Top pick — see below.)
- **In-app activity feed** — a running log of every alert and detected change over time.

### Make it connected & shareable

- **Import a roster from your server** — pull a BattleMetrics server's current player list (where the token permits) and one-click "screen everyone online right now"; also CSV import.
- **Shareable report packs** — export a roster or single-player report as a self-contained PDF/HTML with source/status labels intact, for handing findings to other admins.
- **More alert channels** — Slack webhook, per-player alert rules, and a daily-digest mode.

### Polish & peace of mind

- **Backup & restore** the local history (export/import the SQLite DB) so an observation record is never lost.
- **Virtualize large tables/lists** (audit F-14) for snappy performance on big rosters/libraries.
- **Windows code signing** (audit F-24) once a certificate is available, to drop the "unknown publisher" SmartScreen warning.
- First-run onboarding wizard; localization.

---

## Suggested next step

**Saved rosters + scheduled re-screen + digest.** It's the natural evolution of the
watchlist and bulk-screen features that already exist, reuses the change-detection and
webhook plumbing, and it's the thing that turns a one-off lookup tool into something an
admin keeps pinned and checks every day.
