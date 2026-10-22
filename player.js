// Hub player panel: skills, levels, XP and gains from Wise Old Man.
// Calls per lookup: 1 GET for the player, 1 GET for gains (cached per period).
// "Update" sends one POST asking Wise Old Man to re-read the hiscores; it's
// rate limited on their side, so the button cools down for 60 s after use.

const WOM = "https://api.wiseoldman.net/v2";
const STORE_KEY = "osrs-tools-hub";
const DEFAULT_NAME = "Snooka";

const SKILLS = [
  ["attack", "combat"], ["strength", "combat"], ["defence", "combat"], ["ranged", "combat"],
  ["prayer", "combat"], ["magic", "combat"], ["hitpoints", "combat"],
  ["mining", "gathering"], ["fishing", "gathering"], ["woodcutting", "gathering"],
  ["farming", "gathering"], ["hunter", "gathering"],
  ["smithing", "artisan"], ["cooking", "artisan"], ["fletching", "artisan"], ["crafting", "artisan"],
  ["herblore", "artisan"], ["firemaking", "artisan"], ["runecrafting", "artisan"], ["construction", "artisan"],
  ["agility", "support"], ["thieving", "support"], ["slayer", "support"], ["sailing", "support"],
];
const CATEGORY = Object.fromEntries(SKILLS);
const ORDER = Object.fromEntries(SKILLS.map(([s], i) => [s, i]));
const TYPE_LABEL = {
  regular: "Main", ironman: "Ironman", hardcore: "Hardcore ironman",
  ultimate: "Ultimate ironman", unknown: "Unknown type",
};

// XP needed for each level, same formula as the game.
const XP_AT = [0, 0];
for (let l = 1, pts = 0; l < 99; l++) {
  pts += Math.floor(l + 300 * Math.pow(2, l / 7));
  XP_AT[l + 1] = Math.floor(pts / 4);
}
const MAX_XP = 200_000_000;
// The wiki names the icon after the in-game skill name, which differs for one skill.
const ICON_NAME = { runecrafting: "Runecraft" };

const fmt = n => Math.round(n).toLocaleString("en-US");
function short(n) {
  const a = Math.abs(n);
  if (a >= 999.5e6) return (n / 1e9).toFixed(2) + "b";
  if (a >= 999.95e3) return (n / 1e6).toFixed(a >= 10e6 ? 1 : 2) + "m";
  if (a >= 1e3) return (n / 1e3).toFixed(a >= 100e3 ? 0 : 1) + "k";
  return String(Math.round(n));
}
const title = s => s[0].toUpperCase() + s.slice(1);
function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function save(patch) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...load(), ...patch })); } catch {}
}

async function wom(path, method = "GET") {
  const r = await fetch(WOM + path, { method });
  if (r.status === 404) throw Object.assign(new Error("not-tracked"), { code: 404 });
  if (r.status === 429) throw new Error("Wise Old Man is rate limiting lookups. Wait a minute and try again.");
  if (!r.ok) {
    let msg = `Wise Old Man returned HTTP ${r.status}.`;
    try { const j = await r.json(); if (j.message) msg = j.message; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

const saved = load();
const S = {
  name: saved.name || DEFAULT_NAME,
  period: saved.period || "week",
  sort: saved.sort || "game",
  cat: saved.cat || "all",
  gainedOnly: !!saved.gainedOnly,
  player: null,
  gains: {},      // period -> gains data
};

const $ = id => document.getElementById(id);

function status(text, kind = "") {
  const el = $("p-status");
  el.textContent = text;
  el.className = "p-status " + kind;
}

async function lookup(name) {
  S.name = name.trim();
  if (!S.name) return;
  save({ name: S.name });
  S.player = null; S.gains = {};
  status("Looking up…");
  $("p-track").hidden = true;
  try {
    S.player = await wom(`/players/${encodeURIComponent(S.name)}`);
    await loadGains();
    status("");
  } catch (e) {
    if (e.code === 404) {
      status(`${S.name} isn't tracked on Wise Old Man yet.`, "warn");
      $("p-track").hidden = false;
    } else status(e.message, "err");
  }
  render();
}

async function loadGains() {
  if (S.gains[S.period]) return;
  S.gains[S.period] = (await wom(`/players/${encodeURIComponent(S.name)}/gained?period=${S.period}`)).data;
}

async function update() {
  const btn = $("p-update");
  btn.disabled = true;
  status("Asking Wise Old Man to re-read the hiscores…");
  try {
    S.player = await wom(`/players/${encodeURIComponent(S.name)}`, "POST");
    S.gains = {};
    await loadGains();
    $("p-track").hidden = true;
    status("Updated.", "ok");
  } catch (e) {
    status(e.code === 404 ? "That name isn't on the hiscores." : e.message, "err");
  }
  render();
  setTimeout(() => { btn.disabled = false; }, 60_000);
}

function skillRows() {
  const skills = S.player?.latestSnapshot?.data?.skills || {};
  const gained = S.gains[S.period]?.skills || {};
  return Object.keys(skills)
    .filter(k => k !== "overall")
    .map(k => {
      const s = skills[k];
      const xp = Math.max(0, s.experience);
      const level = s.level || 1;
      const g = gained[k] || {};
      return {
        key: k, cat: CATEGORY[k] || "support", level, xp, rank: s.rank,
        xpGained: g.experience?.gained || 0,
        lvlGained: g.level?.gained || 0,
      };
    });
}

function progress(r) {
  if (r.level >= 99) return { pct: r.xp / MAX_XP, text: r.xp >= MAX_XP ? "200m reached" : `${short(MAX_XP - r.xp)} xp to 200m` };
  const lo = XP_AT[r.level], hi = XP_AT[r.level + 1];
  return { pct: (r.xp - lo) / (hi - lo), text: `${short(Math.max(0, hi - r.xp))} xp to ${r.level + 1}` };
}

function tile(r) {
  const p = progress(r);
  const el = document.createElement("article");
  el.className = `skill cat-${r.cat}` + (r.level >= 99 ? " maxed" : "") + (r.xpGained > 0 ? " gained" : "");
  el.innerHTML = `
    <div class="s-top">
      <img alt="" width="21" height="21" loading="lazy">
      <span class="s-name"></span>
      <em class="s-up num"></em><b class="s-lvl num"></b>
    </div>
    <div class="s-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><i></i></div>
    <div class="s-foot num"><span class="s-xp"></span><span class="s-gain"></span></div>
    <div class="s-next num"></div>`;
  const img = el.querySelector("img");
  img.src = `https://oldschool.runescape.wiki/images/${ICON_NAME[r.key] || title(r.key)}_icon.png`;
  img.onerror = () => img.remove();
  el.querySelector(".s-name").textContent = title(r.key);
  el.querySelector(".s-lvl").textContent = r.level;
  const pct = Math.min(100, Math.max(0, p.pct * 100));
  el.querySelector(".s-bar i").style.width = pct.toFixed(1) + "%";
  el.querySelector(".s-bar").setAttribute("aria-valuenow", pct.toFixed(0));
  el.querySelector(".s-xp").textContent = fmt(r.xp);
  el.querySelector(".s-gain").textContent = r.xpGained > 0 ? `+${short(r.xpGained)}` : "";
  const up = el.querySelector(".s-up");
  if (r.lvlGained > 0) { up.textContent = `▲${r.lvlGained}`; up.title = `+${r.lvlGained} level${r.lvlGained > 1 ? "s" : ""}`; }
  else up.remove();
  el.querySelector(".s-next").textContent = p.text;
  el.title = `${title(r.key)}: rank ${r.rank > 0 ? fmt(r.rank) : "unranked"}`;
  return el;
}

function render() {
  for (const b of document.querySelectorAll("[data-period]")) b.classList.toggle("on", b.dataset.period === S.period);
  for (const b of document.querySelectorAll("[data-cat]")) b.classList.toggle("on", b.dataset.cat === S.cat);
  $("p-sort").value = S.sort;
  $("p-gained").checked = S.gainedOnly;
  $("p-name").value = S.name;

  const has = !!S.player;
  $("p-body").hidden = !has;
  $("p-update").hidden = !has;
  if (!has) { $("p-who").textContent = "Player"; $("p-meta").textContent = ""; return; }

  const pl = S.player;
  $("p-who").textContent = pl.displayName || S.name;
  $("p-meta").textContent = [TYPE_LABEL[pl.type] || title(pl.type || "unknown"),
    pl.updatedAt ? `stats from ${ago(pl.updatedAt)}` : ""].filter(Boolean).join(" · ");

  const rows = skillRows();
  const ov = pl.latestSnapshot?.data?.skills?.overall || {};
  const og = S.gains[S.period]?.skills?.overall || {};
  const totalLevel = ov.level > 0 ? ov.level : rows.reduce((t, r) => t + r.level, 0);
  const top = [...rows].sort((a, b) => b.xpGained - a.xpGained)[0];
  const maxed = rows.filter(r => r.level >= 99).length;
  const periodWord = { day: "today", week: "this week", month: "this month", year: "this year" }[S.period];

  $("p-sum").innerHTML = "";
  const tiles = [
    ["Total level", fmt(totalLevel), `${maxed} of ${rows.length} at 99`],
    ["Total XP", short(Math.max(0, ov.experience || 0)), ov.rank > 0 ? `rank ${fmt(ov.rank)}` : "unranked"],
    [`Gained ${periodWord}`, (og.experience?.gained > 0 ? "+" : "") + short(og.experience?.gained || 0) + " xp",
      og.level?.gained > 0 ? `+${og.level.gained} levels` : "no level-ups"],
    ["Most gained", top && top.xpGained > 0 ? title(top.key) : "—",
      top && top.xpGained > 0 ? `+${short(top.xpGained)} xp` : "nothing tracked yet"],
  ];
  for (const [k, v, sub] of tiles) {
    const d = document.createElement("div");
    d.className = "sum";
    d.innerHTML = `<span class="label"></span><b class="num"></b><small class="muted"></small>`;
    d.children[0].textContent = k; d.children[1].textContent = v; d.children[2].textContent = sub;
    $("p-sum").append(d);
  }

  let shown = rows.filter(r => (S.cat === "all" || r.cat === S.cat) && (!S.gainedOnly || r.xpGained > 0));
  const by = {
    game: (a, b) => (ORDER[a.key] ?? 99) - (ORDER[b.key] ?? 99),
    level: (a, b) => b.level - a.level || b.xp - a.xp,
    xp: (a, b) => b.xp - a.xp,
    gained: (a, b) => b.xpGained - a.xpGained || (ORDER[a.key] ?? 99) - (ORDER[b.key] ?? 99),
  }[S.sort];
  shown.sort(by);

  const grid = $("p-grid");
  grid.replaceChildren(...shown.map(tile));
  $("p-empty").hidden = shown.length > 0;
  $("p-empty").textContent = S.gainedOnly ? `No XP gained ${periodWord} in these skills.` : "No skills match.";
}

function wire() {
  $("p-form").addEventListener("submit", e => { e.preventDefault(); lookup($("p-name").value); });
  $("p-update").addEventListener("click", update);
  $("p-track").addEventListener("click", update);
  for (const b of document.querySelectorAll("[data-period]")) {
    b.addEventListener("click", async () => {
      S.period = b.dataset.period; save({ period: S.period });
      if (S.player) {
        try { await loadGains(); status(""); } catch (e) { status(e.message, "err"); }
      }
      render();
    });
  }
  for (const b of document.querySelectorAll("[data-cat]")) {
    b.addEventListener("click", () => { S.cat = b.dataset.cat; save({ cat: S.cat }); render(); });
  }
  $("p-sort").addEventListener("change", e => { S.sort = e.target.value; save({ sort: S.sort }); render(); });
  $("p-gained").addEventListener("change", e => { S.gainedOnly = e.target.checked; save({ gainedOnly: S.gainedOnly }); render(); });
}

wire();
render();
lookup(S.name);
