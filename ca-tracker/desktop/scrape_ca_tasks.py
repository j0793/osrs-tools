"""
Combat Achievements task scraper.

Run this once (and again later if new tasks are added to the game) to
(re)generate tasks.json from the OSRS Wiki's full Combat Achievements table.

Usage:
    pip install requests beautifulsoup4
    python scrape_ca_tasks.py

Produces tasks.json in the same folder, e.g.:
[
  {
    "task_id": 0,
    "monster": "Aberrant Spectre",
    "name": "Noxious Foe",
    "description": "Kill an Aberrant Spectre.",
    "type": "Kill Count",
    "tier": "Easy",
    "points": 1
  },
  ...
]

The web tracker (../index.html) reads the same tasks.json, so copy the new
file up one folder after re-running this.
"""
import json
import re
import sys

import requests
from bs4 import BeautifulSoup

URL = "https://oldschool.runescape.wiki/w/Combat_Achievements/All_tasks"

# Header text (lowercased, substring match) -> field name we want
HEADER_MAP = {
    "monster": "monster",
    "name": "name",
    "description": "description",
    "type": "type",
    "tier": "tier",
}


def _map_columns(table):
    header_row = table.find("tr")
    if header_row is None:
        return {}
    header_cells = header_row.find_all(["th", "td"])
    headers = [c.get_text(strip=True).lower() for c in header_cells]
    col_index = {}
    for i, h in enumerate(headers):
        for key, field in HEADER_MAP.items():
            if key in h and field not in col_index:
                col_index[field] = i
    return col_index


def find_task_table(soup):
    """Return the task table and a dict mapping field name to column index.

    Prefers the table with class "ca-tasks" (what the wiki actually uses for
    this table), falling back to scanning every table's header row for the
    columns we need if that class isn't found (in case the wiki markup changes).
    """
    table = soup.find("table", class_="ca-tasks")
    if table is not None:
        col_index = _map_columns(table)
        if {"name", "description", "tier"}.issubset(col_index):
            return table, col_index

    candidates = soup.find_all("table")
    print(f"Found {len(candidates)} <table> element(s) on the page.")

    for table in candidates:
        col_index = _map_columns(table)
        # We need at minimum name, description, and tier to consider this
        # the right table.
        if {"name", "description", "tier"}.issubset(col_index):
            return table, col_index

    return None, None


def scrape():
    resp = requests.get(URL, headers={"User-Agent": "combat-achievements-tracker/1.0"})
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    table, col_index = find_task_table(soup)
    if table is None:
        print(
            "Couldn't find a table with Name/Description/Tier columns on the page.\n"
            "The wiki layout may have changed - open the URL below in a browser and "
            "check the table headers, then update HEADER_MAP in this script:\n"
            f"  {URL}"
        )
        sys.exit(1)

    print(f"Using table with columns: {col_index}")

    tasks = []
    rows = table.find_all("tr")[1:]  # skip header row
    for row in rows:
        cells = row.find_all(["td", "th"])
        if len(cells) <= max(col_index.values()):
            continue  # short/malformed row (e.g. a section divider)

        def cell_text(field):
            idx = col_index.get(field)
            return cells[idx].get_text(strip=True) if idx is not None else None

        name = cell_text("name")
        description = cell_text("description")
        if not name or not description:
            continue  # skip rows that aren't actual tasks

        monster = cell_text("monster")
        task_type = cell_text("type")
        tier_cell_text = cell_text("tier") or ""

        # This id is what the WikiSync API (sync.runescape.wiki) uses to
        # identify a completed task for a given player - capture it so we
        # can match against that data later.
        raw_task_id = row.get("data-ca-task-id")
        task_id = int(raw_task_id) if raw_task_id is not None and raw_task_id.isdigit() else None

        m = re.match(r"([A-Za-z]+)\s*\((\d+)\s*pt", tier_cell_text)
        if m:
            tier = m.group(1)
            points = int(m.group(2))
        else:
            tier = tier_cell_text or None
            points = None

        tasks.append(
            {
                "task_id": task_id,
                "monster": monster if monster and monster != "N/A" else None,
                "name": name,
                "description": description,
                "type": task_type,
                "tier": tier,
                "points": points,
            }
        )

    return tasks


def main():
    tasks = scrape()
    with open("tasks.json", "w", encoding="utf-8") as f:
        json.dump(tasks, f, indent=2)
    print(f"Wrote {len(tasks)} tasks to tasks.json")
    if len(tasks) < 600:
        print(
            "That's fewer tasks than expected (646 as of writing). "
            "Double check tasks.json, or share the diagnostic output above so we can adjust the script."
        )


if __name__ == "__main__":
    main()
