# OSRS Tools — repository changelog

Repo-wide changes: structure, shared styles, the hub page. Each tool keeps its own `CHANGELOG.md` for its own versions.

## 2026-10-24

### Changed
- `foundry-tracker` updated to v1.1.0 (choose the mithril/adamant bar split). See its changelog.

## 2026-10-22 (market analyzer 1.0)

### Changed
- `market-analyzer` set to v1.0.0 and status `live`. See its changelog.

## 2026-10-22 (readme)

### Removed
- "Publishing on GitHub Pages" section from the root README. `.nojekyll` is now listed under Structure instead.
- Redirect instructions for the old `Combat-Achievement-Tracker` site from `ca-tracker/README.md`; the old repo is retired.
- "after publishing" from the market analyzer README's first-run heading.

## 2026-10-22 (hub player panel)

### Added
- Player panel on the hub, below the tools: every skill's level, XP, progress to the next level (or to 200m once 99), and XP gained over a Day, Week, Month or Year. Includes summary tiles (total level, total XP, gained, most gained), filters by skill type, a sort, and "Gained only".
- Data from Wise Old Man (`player.js`). A lookup costs two requests, and each new period costs one more; periods are cached. **Update** asks Wise Old Man to re-read the hiscores, then waits 60 s before it can be used again.
- The username, period, filter and sort are remembered in the browser (`osrs-tools-hub`). Defaults to Snooka.

## 2026-10-22 (imports)

### Added
- `ca-tracker/` imported at v1.1.0 from `j0793/Combat-Achievement-Tracker`, plus the desktop app, scraper and proxy worker that were never committed there. History from 2026-07-30.
- `foundry-tracker/` imported at v1.0.0 from the Claude artifact "Giants' Foundry Planner". History from 2026-10-20.

### Changed
- Both tools set to `live` in `tools.json`; the foundry tool is listed as "Giants' Foundry Planner" (folder name unchanged).
- README structure updated for the `desktop/` and `worker/` folders.

## 2026-10-22 (later)

### Changed
- `market-analyzer` updated to v0.5.0 (thesis direction and editing, holding sales graded in the Journal). See its changelog.
- `market-analyzer` updated to v0.4.0 (basket chart and trend, edit/rename, weighting, multi-add). See its changelog.
- `market-analyzer` updated to v0.3.0 (screener direction filter, rotation recovery input). See its changelog.
- `market-analyzer` updated to v0.2.0 (cash ledger). See its changelog.

## 2026-10-22

### Added
- Hub page (`index.html`) that lists every tool from `tools.json`.
- Changelog viewer (`changelog.html`) for the repo and for each tool.
- Shared theme (`shared/theme.css`) used by the hub and all tools.
- `market-analyzer/` scaffold, v0.1.0.
- Placeholder folders for `ca-tracker/` and `foundry-tracker/`, pending import.
