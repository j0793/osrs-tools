// OSRS Combat Achievements Tracker - browser version
//
// Loads tasks.json (bundled with this page) and, on request, fetches a
// player's completed task IDs from WikiSync (sync.runescape.wiki - the same
// service RuneLite's WikiSync plugin and the OSRS Wiki use). That only works
// if the player has WikiSync enabled in RuneLite and has opened their Combat
// Achievements interface in-game at least once.

const WIKISYNC_URL = (username) =>
  `https://sync.runescape.wiki/runelite/player/${encodeURIComponent(username)}/STANDARD`;

// sync.runescape.wiki blocks direct cross-origin browser requests (confirmed
// in testing - it 403s with no CORS header for third-party origins, even
// though the underlying API itself has no per-user auth). Route through a
// small proxy instead - see README for how to deploy a free Cloudflare
// Worker for this using wikisync-proxy-worker.js.
const WIKISYNC_PROXY = "https://osrs-ca-tracker.julianj0793.workers.dev"; // e.g. "https://ca-tracker-proxy.yourname.workers.dev"

// Cumulative Combat Achievement points required to claim each reward tier.
// Grandmaster has no points threshold - it requires every task completed.
const TIER_THRESHOLDS = [
  ["Easy", 41],
  ["Medium", 161],
  ["Hard", 419],
  ["Elite", 1075],
  ["Master", 1945],
];

/**
 * Returns { currentTier, totalPoints, nextTier, detail } given a task list
 * where each task has { completed: bool, points: number|null }.
 */
function computeMastery(tasks) {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.completed).length;
  const totalPoints = tasks
    .filter((t) => t.completed)
    .reduce((sum, t) => sum + (t.points || 0), 0);

  let currentTier = "None";
  for (const [tier, threshold] of TIER_THRESHOLDS) {
    if (totalPoints >= threshold) {
      currentTier = tier;
    } else {
      return {
        currentTier,
        totalPoints,
        nextTier: tier,
        detail: `${threshold - totalPoints} pts to ${tier}`,
      };
    }
  }

  if (totalTasks && completedTasks >= totalTasks) {
    return { currentTier: "Grandmaster", totalPoints, nextTier: null, detail: "All tasks complete!" };
  }
  const remaining = totalTasks - completedTasks;
  return {
    currentTier: "Master",
    totalPoints,
    nextTier: "Grandmaster",
    detail: `${remaining} tasks remaining`,
  };
}

/** Filters tasks by search text, tier, boss, and incomplete-only. */
function filterTasks(tasks, { search, tier, boss, incompleteOnly }) {
  const term = (search || "").trim().toLowerCase();
  return tasks.filter((t) => {
    if (term) {
      const haystack = `${t.name} ${t.monster || ""} ${t.description || ""}`.toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    if (tier && tier !== "All" && t.tier !== tier) return false;
    if (boss && boss !== "All" && (t.monster || "-") !== boss) return false;
    if (incompleteOnly && t.completed) return false;
    return true;
  });
}

const TIER_ORDER = { Easy: 1, Medium: 2, Hard: 3, Elite: 4, Master: 5, Grandmaster: 6 };

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    const ta = TIER_ORDER[a.tier] || 99;
    const tb = TIER_ORDER[b.tier] || 99;
    if (ta !== tb) return ta - tb;
    const ma = (a.monster || "").localeCompare(b.monster || "");
    if (ma !== 0) return ma;
    return a.name.localeCompare(b.name);
  });
}

async function fetchWikiSyncCompleted(username) {
  if (!WIKISYNC_PROXY) {
    throw new Error(
      "WikiSync proxy isn't configured yet. Deploy wikisync-proxy-worker.js " +
      "(see README) and set WIKISYNC_PROXY in app.js to its URL."
    );
  }

  const requestUrl = `${WIKISYNC_PROXY}/?username=${encodeURIComponent(username)}`;
  const resp = await fetch(requestUrl, {
    headers: { Accept: "application/json" },
  });
  if (resp.status === 400) {
    throw new Error(
      `No WikiSync data found for '${username}'. They need WikiSync enabled in RuneLite ` +
      `and must have opened their Combat Achievements interface in-game at least once.`
    );
  }
  if (!resp.ok) {
    throw new Error(`WikiSync returned an error (HTTP ${resp.status}).`);
  }
  const data = await resp.json();
  if (!data.combat_achievements) {
    throw new Error(
      `WikiSync has data for '${username}', but no Combat Achievements were included. ` +
      `They may need to reopen the Combat Achievements interface in-game to sync it.`
    );
  }
  return new Set(data.combat_achievements);
}

// ---- DOM wiring (skipped when running under Node for tests) ----
if (typeof document !== "undefined") {
  let allTasks = [];

  const els = {
    usernameInput: document.getElementById("username-input"),
    lookupBtn: document.getElementById("lookup-btn"),
    lookupStatus: document.getElementById("lookup-status"),
    controls: document.getElementById("controls"),
    searchInput: document.getElementById("search-input"),
    tierSelect: document.getElementById("tier-select"),
    bossSelect: document.getElementById("boss-select"),
    incompleteCheckbox: document.getElementById("incomplete-checkbox"),
    progressLabel: document.getElementById("progress-label"),
    masteryBar: document.getElementById("mastery-bar"),
    tableWrap: document.getElementById("table-wrap"),
    tbody: document.getElementById("task-tbody"),
    emptyState: document.getElementById("empty-state"),
  };

  function populateBossFilter(tasks) {
    const bosses = Array.from(new Set(tasks.map((t) => t.monster).filter(Boolean))).sort();
    els.bossSelect.innerHTML = '<option value="All">All bosses</option>';
    for (const b of bosses) {
      const opt = document.createElement("option");
      opt.value = b;
      opt.textContent = b;
      els.bossSelect.appendChild(opt);
    }
  }

  function render() {
    const filtered = sortTasks(
      filterTasks(allTasks, {
        search: els.searchInput.value,
        tier: els.tierSelect.value,
        boss: els.bossSelect.value,
        incompleteOnly: els.incompleteCheckbox.checked,
      })
    );

    els.tbody.innerHTML = "";
    for (const t of filtered) {
      const tr = document.createElement("tr");
      if (t.completed) tr.className = "completed";
      tr.innerHTML = `
        <td class="col-done">${t.completed ? '<span class="check-mark">&#10003;</span>' : ""}</td>
        <td class="col-tier">${t.tier || ""}</td>
        <td class="col-boss">${t.monster || "-"}</td>
        <td class="col-task">${t.name}</td>
        <td class="col-desc">${t.description || ""}</td>
      `;
      els.tbody.appendChild(tr);
    }

    const total = allTasks.length;
    const done = allTasks.filter((t) => t.completed).length;
    const pct = total ? ((done / total) * 100).toFixed(1) : "0.0";
    els.progressLabel.textContent = `${done} / ${total} complete (${pct}%)`;

    const { currentTier, totalPoints, nextTier, detail } = computeMastery(allTasks);
    let masteryText = `Mastery tier: ${currentTier} (${totalPoints} CA points)`;
    if (nextTier) {
      masteryText += ` <span class="next">&rarr; Next: ${nextTier} (${detail})</span>`;
    }
    els.masteryBar.innerHTML = masteryText;
  }

  async function loadTasksJson() {
    const resp = await fetch("tasks.json");
    if (!resp.ok) throw new Error("Couldn't load tasks.json - make sure it's alongside index.html.");
    const raw = await resp.json();
    return raw.map((t) => ({ ...t, completed: false }));
  }

  async function doLookup() {
    const username = els.usernameInput.value.trim();
    if (!username) return;

    els.lookupBtn.disabled = true;
    els.lookupStatus.textContent = "Looking up...";
    els.lookupStatus.className = "status";

    try {
      if (allTasks.length === 0) {
        allTasks = await loadTasksJson();
        populateBossFilter(allTasks);
      }

      const completedIds = await fetchWikiSyncCompleted(username);
      let matched = 0;
      for (const t of allTasks) {
        if (t.task_id !== null && t.task_id !== undefined && completedIds.has(t.task_id)) {
          t.completed = true;
          matched++;
        }
      }

      els.controls.hidden = false;
      els.masteryBar.hidden = false;
      els.tableWrap.hidden = false;
      els.emptyState.hidden = true;
      els.lookupStatus.textContent = `Showing ${username}'s progress (${matched} tasks matched).`;
      render();
    } catch (err) {
      els.lookupStatus.textContent = err.message;
      els.lookupStatus.className = "status error";
    } finally {
      els.lookupBtn.disabled = false;
    }
  }

  els.lookupBtn.addEventListener("click", doLookup);
  els.usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLookup();
  });
  els.searchInput.addEventListener("input", render);
  els.tierSelect.addEventListener("change", render);
  els.bossSelect.addEventListener("change", render);
  els.incompleteCheckbox.addEventListener("change", render);
}

// Export for tests (Node) - harmless in the browser since module is undefined there.
if (typeof module !== "undefined") {
  module.exports = { computeMastery, filterTasks, sortTasks, fetchWikiSyncCompleted };
}
