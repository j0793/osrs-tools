# Combat Achievements Tracker — changelog

Reconstructed from the build conversation and the old repo's commit history (`j0793/Combat-Achievement-Tracker`). Dates are when each change was made. Where the conversation didn't record a day, the entry gives the range it falls in. Versions before 1.1.0 were assigned afterwards; the app had no version numbers at the time.

## 1.1.0 — 2026-10-22

Moved into OSRS Tools.

### Added
- "← OSRS Tools" link back to the hub.
- Page icon, so browsers stop requesting a missing `favicon.ico`.
- The desktop app, the scraper and the Cloudflare Worker code are now kept in this repo (`desktop/`, `worker/`). Before, only the web files were committed; the rest lived only in the build conversation.

### Changed
- New address: `https://j0793.github.io/osrs-tools/ca-tracker/`. The old `Combat-Achievement-Tracker` site still works; the README has a redirect page for it.

## 1.0.1 — 2026-08-04

Lookups work on the live site.

### Fixed
- Every lookup failed with "Failed to fetch". `sync.runescape.wiki` answers browser requests from other sites with 403 and no CORS header, so a GitHub Pages page can't call it directly.

### Added
- Cloudflare Worker proxy (`wikisync-proxy-worker.js`): takes `?username=`, fetches WikiSync server-side, returns the JSON with `Access-Control-Allow-Origin: *`. Deployed at `osrs-ca-tracker.julianj0793.workers.dev`.
- `WIKISYNC_PROXY` setting in `app.js`. If it's empty the page says the proxy isn't set up instead of showing a CORS error.

Commit `176f96f` "Added WikiSync proxy URL", 15:51 EDT.

## 1.0.0 — 2026-08-04

Web version on GitHub Pages, so friends can look themselves up without installing anything.

### Added
- Static page (`index.html`, `style.css`, `app.js`) with the bundled `tasks.json`.
- Username lookup against WikiSync; matched tasks show as done.
- Same search, tier, boss and "Show only incomplete" filters, progress count and mastery bar as the desktop app, ported to JavaScript and checked against the same test cases.
- Dark theme with a gold accent.

### Changed
- Read-only: completion comes from WikiSync only. There's no manual check-off and nothing is saved, since each visit is a fresh lookup. The desktop app remains the place for manual tracking.

Commit `57bf09a` "Combat Achievements web tracker", 15:13 EDT.

## 0.4.0 — between 2026-07-30 and 2026-08-04 (desktop)

Pull completion from WikiSync instead of ticking everything by hand.

### Added
- **Sync from WikiSync…** button: asks for a username, reads `sync.runescape.wiki/runelite/player/<name>/STANDARD`, shows how many tasks it would mark, and only ever checks tasks on. It never unchecks anything you marked yourself.
- Scraper captures each row's `data-ca-task-id` as `task_id`, the ID WikiSync uses, and prefers the wiki's `table.ca-tasks`.
- Clear messages for no WikiSync data, no Combat Achievements in the data, and network errors.

### Migration
- `progress.db` gains a `task_id` column in place (`PRAGMA table_info` check). Existing check marks are kept; re-run the scraper once to fill in the IDs.

## 0.3.0 — between 2026-07-30 and 2026-08-04 (desktop)

### Added
- Mastery bar: current tier, total CA points, and how far to the next tier, e.g. "Mastery tier: Medium (161 CA points) → Next: Hard (258 pts to Hard)". Updates on every toggle.
- Thresholds from the OSRS Wiki: Easy 41, Medium 161, Hard 419, Elite 1,075, Master 1,945. Grandmaster counts tasks remaining, since it needs every task.

## 0.2.0 — between 2026-07-30 and 2026-08-04 (desktop)

### Fixed
- The scraper wrote 0 tasks. It took the first `wikitable` on the page, which wasn't the task table. It now picks the table whose header row has Name, Description and Tier, maps columns by header text, and prints what it found. It warns if fewer than 600 tasks come back.

### Notes
- The pip "not on PATH" warning during install is harmless; it only affects helper command-line scripts.
- Since `progress.db` is plain SQLite, it can be analysed in SQL, R (`RSQLite` + dplyr) or pandas without touching the app.

## 0.1.0 — 2026-07-30 (desktop)

First version.

### Added
- `scrape_ca_tasks.py`: pulls the Combat Achievements table from the OSRS Wiki into `tasks.json` (boss, name, description, type, tier, points).
- `combat_tracker.py`: Tkinter window with live search over boss, task and description, tier and boss dropdowns, "Show only incomplete", click or Enter to toggle a task, and an "X / 646 complete" counter.
- Progress saved in SQLite (`progress.db`). Re-running the scraper adds new tasks without losing check marks.
