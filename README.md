# OSRS Tools

Personal Old School RuneScape tools, hosted on GitHub Pages.

## Structure

```
osrs-tools/
├── index.html          Hub page: lists every tool from tools.json
├── changelog.html      Renders the repo or a tool's CHANGELOG.md (?tool=<id>)
├── tools.json          Tool registry: name, folder, status, version, last update
├── CHANGELOG.md        Repo-wide changes
├── shared/theme.css    Shared look for the hub and every tool
├── market-analyzer/    GE Market Analyzer
├── ca-tracker/         Combat Achievements Tracker
│   ├── desktop/        Original Tkinter app and the wiki scraper (archived, still runs)
│   └── worker/         Cloudflare Worker that relays WikiSync lookups (copy for the record)
└── foundry-tracker/    Giants' Foundry Planner
```

Every tool folder has its own `index.html`, `README.md` and `CHANGELOG.md`.

Tools that were built before this repo existed have changelogs reconstructed from their build conversations and old commits, with dates and the versions assigned afterwards.

## Versioning and changelogs

- Each tool uses semantic versions: `MAJOR.MINOR.PATCH`.
  - PATCH: bug fix, no behavior change you would notice.
  - MINOR: new feature or view, old data still works.
  - MAJOR: a change that breaks saved data or how the tool works.
- When a tool changes: add an entry at the top of its `CHANGELOG.md`, bump `version` and `updated` in `tools.json`, and commit with a message that names the tool, e.g. `market-analyzer: add basket index chart (v0.2.0)`.
- Git history is the full revision record. The changelogs are the readable summary.
- Retiring a tool: set its status to `archived` in `tools.json`. Leave the folder so old versions stay viewable.

Status values in `tools.json`: `scaffold`, `live`, `pending-import`, `archived`.

## Publishing on GitHub Pages

1. Create a repository named `osrs-tools` and upload these files to the `main` branch, keeping the folders.
2. Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, folder `/ (root)`.
3. The hub will be at `https://j0793.github.io/osrs-tools/`.

The empty `.nojekyll` file tells Pages to serve the files as they are.

## Running locally

The pages load JSON and Markdown with `fetch`, which browsers block for `file://` pages. From the repo folder run:

```
python -m http.server 8000
```

then open `http://localhost:8000/`.
