# OSRS Tools — repository changelog

Repo-wide changes: structure, shared styles, the hub page. Each tool keeps its own `CHANGELOG.md` for its own versions.

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
