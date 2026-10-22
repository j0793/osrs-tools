"""
OSRS Combat Achievements Tracker (desktop)

A Tkinter desktop app for manually tracking your progress on the
Combat Achievement tasks. Search/filter by boss, tier, or task name,
click a row to toggle it complete, see your mastery tier, and pull
completed tasks from WikiSync.

Requires tasks.json in the same folder (generate it with
scrape_ca_tasks.py first, or copy the one from the web tracker).

Run:
    pip install requests
    python combat_tracker.py
"""
import json
import os
import sqlite3
import sys
import tkinter as tk
from tkinter import ttk, messagebox, simpledialog

import requests

DB_FILE = "progress.db"
TASKS_FILE = "tasks.json"

# WikiSync (sync.runescape.wiki) is the same service RuneLite's WikiSync plugin
# and the OSRS Wiki use to show a player's synced progress. It only has data
# for a player if they've enabled WikiSync in RuneLite and opened their
# Combat Achievements interface at least once since.
WIKISYNC_URL = "https://sync.runescape.wiki/runelite/player/{username}/STANDARD"

TIERS = ["All", "Easy", "Medium", "Hard", "Elite", "Master", "Grandmaster"]

# Cumulative Combat Achievement points required to claim each reward tier
# (points can come from tasks of any tier - these are current OSRS Wiki values).
# Grandmaster has no points threshold - it requires every task completed.
TIER_THRESHOLDS = [
    ("Easy", 41),
    ("Medium", 161),
    ("Hard", 419),
    ("Elite", 1075),
    ("Master", 1945),
]


def compute_mastery(conn):
    """Returns (current_tier, points, next_tier, detail_string)."""
    total_tasks, completed_tasks, total_points = conn.execute(
        "SELECT COUNT(*), COALESCE(SUM(completed), 0), "
        "COALESCE(SUM(CASE WHEN completed = 1 THEN points ELSE 0 END), 0) FROM tasks"
    ).fetchone()

    current_tier = "None"
    for tier, threshold in TIER_THRESHOLDS:
        if total_points >= threshold:
            current_tier = tier
        else:
            remaining = threshold - total_points
            return current_tier, total_points, tier, f"{remaining} pts to {tier}"

    # Met the Master threshold - Grandmaster requires every task done, not points.
    if total_tasks and completed_tasks >= total_tasks:
        return "Grandmaster", total_points, None, "All tasks complete!"
    remaining_tasks = total_tasks - completed_tasks
    return "Master", total_points, "Grandmaster", f"{remaining_tasks} tasks remaining"


def load_tasks_json():
    if not os.path.exists(TASKS_FILE):
        return None
    with open(TASKS_FILE, encoding="utf-8") as f:
        return json.load(f)


def init_db(conn, tasks):
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER,
            monster TEXT,
            name TEXT UNIQUE,
            description TEXT,
            type TEXT,
            tier TEXT,
            points INTEGER,
            completed INTEGER DEFAULT 0
        )
        """
    )
    # Migrate older databases (created before task_id existed) in place.
    existing_cols = {row[1] for row in conn.execute("PRAGMA table_info(tasks)")}
    if "task_id" not in existing_cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN task_id INTEGER")

    for t in tasks:
        conn.execute(
            """
            INSERT INTO tasks (task_id, monster, name, description, type, tier, points)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                task_id=excluded.task_id,
                monster=excluded.monster,
                description=excluded.description,
                type=excluded.type,
                tier=excluded.tier,
                points=excluded.points
            """,
            (
                t.get("task_id"),
                t.get("monster"),
                t["name"],
                t.get("description"),
                t.get("type"),
                t.get("tier"),
                t.get("points"),
            ),
        )
    conn.commit()


def fetch_wikisync_completed(username):
    """Returns the set of task_ids WikiSync reports as complete for username.

    Raises ValueError with a human-readable message on any failure
    (bad username, no synced data, network error, etc).
    """
    url = WIKISYNC_URL.format(username=username)
    try:
        resp = requests.get(url, headers={"User-Agent": "combat-achievements-tracker/1.0"}, timeout=10)
    except requests.RequestException as e:
        raise ValueError(f"Couldn't reach WikiSync: {e}")

    if resp.status_code == 400:
        raise ValueError(
            f"No WikiSync data found for '{username}'.\n\n"
            "They need to have WikiSync enabled in RuneLite and have opened "
            "their Combat Achievements interface in-game at least once."
        )
    if not resp.ok:
        raise ValueError(f"WikiSync returned an error (HTTP {resp.status_code}).")

    data = resp.json()
    completed = data.get("combat_achievements")
    if completed is None:
        raise ValueError(
            f"WikiSync has data for '{username}', but no Combat Achievements "
            "were included. They may need to reopen the Combat Achievements "
            "interface in-game to sync it."
        )
    return set(completed)


class TrackerApp(tk.Tk):
    def __init__(self, conn):
        super().__init__()
        self.conn = conn
        self.title("OSRS Combat Achievements Tracker")
        self.geometry("1050x650")

        self._build_widgets()
        self.refresh()

    def _build_widgets(self):
        top = ttk.Frame(self, padding=8)
        top.pack(fill="x")

        ttk.Label(top, text="Search:").pack(side="left")
        self.search_var = tk.StringVar()
        self.search_var.trace_add("write", lambda *_: self.refresh())
        ttk.Entry(top, textvariable=self.search_var, width=30).pack(side="left", padx=(4, 16))

        ttk.Label(top, text="Tier:").pack(side="left")
        self.tier_var = tk.StringVar(value="All")
        tier_box = ttk.Combobox(top, textvariable=self.tier_var, values=TIERS, state="readonly", width=12)
        tier_box.pack(side="left", padx=(4, 16))
        tier_box.bind("<<ComboboxSelected>>", lambda *_: self.refresh())

        ttk.Label(top, text="Boss:").pack(side="left")
        self.boss_var = tk.StringVar(value="All")
        self.boss_box = ttk.Combobox(top, textvariable=self.boss_var, state="readonly", width=22)
        self.boss_box.pack(side="left", padx=(4, 16))
        self.boss_box.bind("<<ComboboxSelected>>", lambda *_: self.refresh())

        self.show_incomplete_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            top, text="Show only incomplete", variable=self.show_incomplete_var,
            command=self.refresh
        ).pack(side="left", padx=(0, 16))

        ttk.Button(top, text="Sync from WikiSync...", command=self._open_sync_dialog).pack(side="left")

        self.progress_label = ttk.Label(top, text="", font=("Segoe UI", 10, "bold"))
        self.progress_label.pack(side="right")

        mastery_bar = ttk.Frame(self, padding=(8, 0, 8, 8))
        mastery_bar.pack(fill="x")
        self.mastery_label = ttk.Label(mastery_bar, text="", font=("Segoe UI", 11, "bold"))
        self.mastery_label.pack(side="left")

        cols = ("done", "tier", "monster", "name", "description")
        self.tree = ttk.Treeview(self, columns=cols, show="headings", selectmode="browse")
        headings = {
            "done": ("Done", 50),
            "tier": ("Tier", 90),
            "monster": ("Boss", 160),
            "name": ("Task", 220),
            "description": ("Description", 480),
        }
        for c, (text, width) in headings.items():
            self.tree.heading(c, text=text)
            self.tree.column(c, width=width, anchor="w")
        self.tree.column("done", anchor="center")

        vsb = ttk.Scrollbar(self, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=vsb.set)
        self.tree.pack(side="left", fill="both", expand=True, padx=(8, 0), pady=8)
        vsb.pack(side="left", fill="y", pady=8)

        self.tree.bind("<Button-1>", self._on_click)
        self.tree.bind("<Return>", self._on_toggle_key)

        self._load_boss_list()

    def _load_boss_list(self):
        cur = self.conn.execute(
            "SELECT DISTINCT monster FROM tasks WHERE monster IS NOT NULL ORDER BY monster"
        )
        bosses = [r[0] for r in cur.fetchall()]
        self.boss_box["values"] = ["All"] + bosses

    def _query(self):
        clauses = []
        params = []

        search = self.search_var.get().strip()
        if search:
            clauses.append("(name LIKE ? OR monster LIKE ? OR description LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like, like])

        tier = self.tier_var.get()
        if tier != "All":
            clauses.append("tier = ?")
            params.append(tier)

        boss = self.boss_var.get()
        if boss != "All":
            clauses.append("monster = ?")
            params.append(boss)

        if self.show_incomplete_var.get():
            clauses.append("completed = 0")

        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        order = """
            ORDER BY CASE tier
                WHEN 'Easy' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Hard' THEN 3
                WHEN 'Elite' THEN 4 WHEN 'Master' THEN 5 WHEN 'Grandmaster' THEN 6
                ELSE 7 END, monster, name
        """
        sql = f"SELECT id, monster, name, description, tier, completed FROM tasks {where} {order}"
        return self.conn.execute(sql, params).fetchall()

    def refresh(self):
        for row in self.tree.get_children():
            self.tree.delete(row)

        rows = self._query()
        for task_id, monster, name, description, tier, completed in rows:
            mark = "✓" if completed else ""
            self.tree.insert(
                "", "end", iid=str(task_id),
                values=(mark, tier, monster or "-", name, description),
            )

        total = self.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        done = self.conn.execute("SELECT COUNT(*) FROM tasks WHERE completed = 1").fetchone()[0]
        pct = (done / total * 100) if total else 0
        self.progress_label.config(text=f"{done} / {total} complete ({pct:.1f}%)")

        current_tier, points, next_tier, detail = compute_mastery(self.conn)
        text = f"Mastery tier: {current_tier}  ({points} CA points)"
        if next_tier:
            text += f"   →   Next: {next_tier} ({detail})"
        self.mastery_label.config(text=text)

    def _toggle(self, item_id):
        cur = self.conn.execute("SELECT completed FROM tasks WHERE id = ?", (item_id,))
        row = cur.fetchone()
        if row is None:
            return
        new_val = 0 if row[0] else 1
        self.conn.execute("UPDATE tasks SET completed = ? WHERE id = ?", (new_val, item_id))
        self.conn.commit()
        self.refresh()

    def _on_click(self, event):
        item_id = self.tree.identify_row(event.y)
        if item_id:
            self._toggle(int(item_id))

    def _on_toggle_key(self, event):
        sel = self.tree.selection()
        if sel:
            self._toggle(int(sel[0]))

    def _open_sync_dialog(self):
        username = simpledialog.askstring(
            "Sync from WikiSync",
            "OSRS username to look up:\n"
            "(They must have WikiSync enabled in RuneLite and have opened\n"
            "their Combat Achievements interface at least once.)",
            parent=self,
        )
        if not username:
            return

        # Only tasks we can match by task_id can be synced - older
        # tasks.json files generated before this feature won't have it.
        unmatched = self.conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE task_id IS NULL"
        ).fetchone()[0]

        try:
            completed_ids = fetch_wikisync_completed(username)
        except ValueError as e:
            messagebox.showerror("Sync failed", str(e))
            return

        cur = self.conn.execute(
            "SELECT id FROM tasks WHERE task_id IN ({})".format(
                ",".join("?" * len(completed_ids))
            ) if completed_ids else "SELECT id FROM tasks WHERE 0",
            list(completed_ids),
        )
        matched_ids = [r[0] for r in cur.fetchall()]

        if not matched_ids:
            messagebox.showinfo(
                "Sync",
                f"WikiSync has data for '{username}', but none of it matched "
                "tasks in your local database. Try re-running scrape_ca_tasks.py "
                "to pick up task IDs, then sync again.",
            )
            return

        newly_marked = self.conn.execute(
            "SELECT COUNT(*) FROM tasks WHERE id IN ({}) AND completed = 0".format(
                ",".join("?" * len(matched_ids))
            ),
            matched_ids,
        ).fetchone()[0]

        confirm_msg = (
            f"WikiSync shows {len(matched_ids)} completed tasks for '{username}' "
            f"({newly_marked} not already checked off here).\n\n"
            "This will mark those as complete. It will NOT uncheck anything "
            "already marked complete locally. Continue?"
        )
        if not messagebox.askyesno("Confirm sync", confirm_msg):
            return

        self.conn.executemany(
            "UPDATE tasks SET completed = 1 WHERE id = ?",
            [(i,) for i in matched_ids],
        )
        self.conn.commit()
        self.refresh()

        note = ""
        if unmatched:
            note = f"\n\nNote: {unmatched} tasks in your database have no task_id " \
                   "(re-run scrape_ca_tasks.py to fix this) and were skipped."
        messagebox.showinfo(
            "Sync complete",
            f"Marked {newly_marked} task(s) as complete based on WikiSync data for '{username}'.{note}",
        )


def main():
    tasks = load_tasks_json()
    if tasks is None:
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror(
            "tasks.json not found",
            "Couldn't find tasks.json.\n\n"
            "Run scrape_ca_tasks.py first to generate it from the OSRS Wiki, "
            "then launch this app again.",
        )
        sys.exit(1)

    conn = sqlite3.connect(DB_FILE)
    init_db(conn, tasks)

    app = TrackerApp(conn)
    app.mainloop()
    conn.close()


if __name__ == "__main__":
    main()
