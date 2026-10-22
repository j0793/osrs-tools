// app.js — views and flow. Reads prices through api.js, math through calc.js,
// signals through rules.js, and saves everything you enter through store.js.
//
// Flow:  Events (pick a baseline) → Screener (find dips) → Item (check history, run scenarios)
//        → Baskets (group items, write a thesis, set rules) → Portfolio (log buys, watch P/L)
//        → sell → Journal (review what went right or wrong).

import * as api from "./api.js";
import * as C from "./calc.js";
import * as R from "./rules.js";
import * as S from "./store.js";

// ---------------------------------------------------------------- state
let state = S.hasSaved() ? S.load() : S.starterState();
const persist = () => { if (!S.save(state)) setStatus("Could not save — browser storage is full or blocked.", true); };
if (!S.hasSaved()) persist();

const market = {
  items: [], byId: new Map(), byName: new Map(),
  latest: new Map(), base: null, recent: null,
  baseDate: null, loadedAt: null, loading: false, error: null,
};
const series = new Map(); // `${id}:${lookback}` → points
const ui = {
  q: "", sort: "pct", dir: 1, onlyDown: true, minVol: 0, showAll: false,
  lookback: "30d", sellingId: null, resetArmed: false, useWhatIf: false, check: null,
};

const view = document.getElementById("view");
const statusEl = document.getElementById("status");

// ---------------------------------------------------------------- formatting
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function gp(n) {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(2) + "b";
  if (a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "m";
  if (a >= 1e4) return s + (a / 1e3).toFixed(1) + "k";
  return s + Math.round(a).toLocaleString();
}
const exact = n => (n == null ? "" : Math.round(n).toLocaleString() + " gp");
const pct = (n, d = 1) => (n == null || !isFinite(n) ? "—" : (n > 0 ? "+" : "") + n.toFixed(d) + "%");
const tone = n => (n == null ? "" : n > 0 ? "up" : n < 0 ? "down" : "");
const today = () => new Date().toISOString().slice(0, 10);
const num = v => (v === "" || v == null ? null : Number(String(v).replace(/[, _]/g, "").replace(/k$/i, "e3").replace(/m$/i, "e6").replace(/b$/i, "e9")));
const chip = sig => `<span class="chip sig-${sig}">${esc(R.SIGNAL_LABEL[sig] || sig)}</span>`;

function setStatus(msg, isErr = false) {
  statusEl.innerHTML = isErr ? `<span class="err">${esc(msg)}</span>` : esc(msg);
}

// ---------------------------------------------------------------- price lookups
const item = id => market.byId.get(id);
const nameOf = id => item(id)?.name || `#${id}`;
const quote = id => market.latest.get(id);
const nowMid = id => C.midPrice(quote(id));
const nowSell = id => quote(id)?.low || nowMid(id);      // instant-sell: what you'd get selling right now
const basePrice = id => market.base?.get(id)?.price ?? null;
const whatIf = id => (ui.useWhatIf && state.whatIf[id] > 0 ? state.whatIf[id] : null);
const priceForIndex = id => whatIf(id) ?? nowMid(id);
function volRatio(id) {
  const b = market.base?.get(id)?.hourlyVolume, r = market.recent?.get(id)?.hourlyVolume;
  return b > 0 && r != null ? r / b : null;
}

function baselineInfo() {
  const ev = state.events.find(e => e.id === state.settings.activeEventId);
  const d = new Date((ev ? ev.date : today()) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - (ev ? state.settings.baselineDaysBefore : 7));
  return { date: d.toISOString().slice(0, 10), event: ev || null };
}

// ---------------------------------------------------------------- loading
async function loadMarket() {
  market.loading = true; market.error = null;
  const { date, event } = baselineInfo();
  setStatus("Loading prices…");
  try {
    const [items, latest, base, recent] = await Promise.all([
      api.mapping(), api.latest(), api.baselineForDay(date), api.recentHours(4),
    ]);
    market.items = items;
    market.byId = new Map(items.map(i => [i.id, i]));
    market.byName = new Map(items.map(i => [i.name.toLowerCase(), i]));
    market.latest = latest; market.base = base; market.recent = recent;
    market.baseDate = date; market.loadedAt = new Date();
    resolveNames();
    fillDatalist();
    setStatus(`Prices loaded ${market.loadedAt.toLocaleTimeString()} · baseline ${date}` +
      (event ? ` (day before “${event.name}”)` : " (7 days ago — pick an event in Events)"));
  } catch (e) {
    market.error = e;
    setStatus(`Could not load prices: ${e.message}. If this keeps happening, the API may be blocking browser requests — see README → "If prices don't load".`, true);
  } finally {
    market.loading = false;
    render();
  }
}

/** Link names you typed (e.g. the liquidation list) to item ids once the item list is loaded. */
function resolveNames() {
  let changed = false;
  for (const b of state.baskets) for (const m of b.members) {
    if (m.itemId == null && m.name) {
      const hit = market.byName.get(m.name.toLowerCase());
      if (hit) { m.itemId = hit.id; m.name = hit.name; changed = true; }
    }
  }
  if (changed) persist();
}

function fillDatalist() {
  const dl = document.getElementById("item-names");
  if (dl.childElementCount) return;
  dl.innerHTML = market.items.map(i => `<option value="${esc(i.name)}"></option>`).join("");
}

function itemByName(name) {
  return market.byName.get(String(name || "").trim().toLowerCase()) || null;
}

// ---------------------------------------------------------------- rules context
function basketCalc(b, opts = {}) {
  const priceFn = opts.whatIf ? priceForIndex : nowMid;
  return C.basketIndex(b.members.filter(m => m.itemId != null), priceFn, basePrice);
}
function openPosition(itemId) { return state.positions.find(p => p.itemId === itemId && p.qty > 0); }

const ctx = {
  metric(target, m) {
    if (target.kind === "basket") {
      const b = state.baskets.find(x => x.id === target.id);
      if (!b) return null;
      const { index } = basketCalc(b);
      if (m === "index") return index;
      if (m === "pct_vs_base") return index == null ? null : index - 100;
      return null; // basket trend: not built yet
    }
    const id = target.id;
    if (m === "price") return nowMid(id);
    if (m === "pct_vs_base") return C.pctChange(nowMid(id), basePrice(id));
    if (m === "vol_ratio") return volRatio(id);
    if (m === "roi") { const p = openPosition(id); return p ? C.positionPnL(p, nowSell(id))?.roi ?? null : null; }
    if (m === "trend") {
      const pts = series.get(`${id}:7d`) || series.get(`${id}:30d`);
      return pts ? C.trendPctPerDay(pts.slice(-28).map(x => ({ t: x.t, p: x.p }))) : null;
    }
    return null;
  },
};
const allRules = () => [
  ...state.theses.filter(t => t.status !== "closed").flatMap(R.rulesFromThesis),
  ...state.rules,
];
const evaluate = () => R.evaluateAll(allRules(), ctx);

// ---------------------------------------------------------------- router
function route() {
  const [name, arg] = (location.hash.slice(1) || "screener").split("/");
  return { name, arg: arg ? decodeURIComponent(arg) : null };
}

function render() {
  const { name, arg } = route();
  const tab = { item: "screener", basket: "baskets" }[name] || name;
  document.querySelectorAll("[data-tab]").forEach(a =>
    a.dataset.tab === tab ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  const views = { screener, item: itemView, baskets, basket: basketView, portfolio, journal, events, settings };
  view.innerHTML = (views[name] || screener)(arg);
  if (name === "item") drawChart(Number(arg));
}
window.addEventListener("hashchange", () => { ui.sellingId = null; render(); window.scrollTo(0, 0); });

function needsPrices() {
  if (market.loading || (!market.loadedAt && !market.error)) return `<div class="empty">Loading prices…</div>`;
  if (market.error) return `<div class="empty">Prices didn't load. <button data-act="reload">Try again</button></div>`;
  return null;
}

// ================================================================ SCREENER
function screener() {
  const wait = needsPrices();
  const { date, event } = baselineInfo();
  const head = `
    <div class="view-head">
      <div><h2>Screener</h2>
        <p>Every traded item against your baseline (${esc(date)}${event ? `, day before ${esc(event.name)}` : ""}). Price is the mid of the latest instant buy and sell.</p></div>
      <button data-act="reload">Refresh prices</button>
    </div>`;
  if (wait) return head + wait;

  const { signalFor } = evaluate();
  const minPrice = state.settings.minPrice || 0;
  const q = ui.q.trim().toLowerCase();
  let rows = [];
  for (const it of market.items) {
    const now = nowMid(it.id);
    if (!(now > 0) || now < minPrice) continue;
    if (q && !it.name.toLowerCase().includes(q)) continue;
    const base = basePrice(it.id);
    const chg = C.pctChange(now, base);
    if (ui.onlyDown && !(chg < 0)) continue;
    const vr = volRatio(it.id);
    if (ui.minVol > 0 && !(vr >= ui.minVol)) continue;
    rows.push({ it, now, base, chg, rise: C.riseNeeded(now, base), vr, cap: C.capacityPer4h(it.limit, now), be: C.breakEvenSell(quote(it.id)?.low || now, it.id), sig: signalFor("item", it.id) });
  }
  const key = { name: r => r.it.name, price: r => r.now, pct: r => r.chg ?? 999, vol: r => r.vr ?? -1, cap: r => r.cap ?? -1 }[ui.sort];
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * ui.dir; });
  const total = rows.length;
  if (!ui.showAll) rows = rows.slice(0, 150);

  const th = (k, label, cls = "") => `<th class="sortable ${cls}" data-act="sort" data-key="${k}">${label}${ui.sort === k ? (ui.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
  return head + `
    <div class="panel stack">
      <div class="row">
        <label>Search<input id="f-q" value="${esc(ui.q)}" placeholder="Item name"></label>
        <label>Min price<input id="f-minprice" value="${gp(minPrice)}" size="8"></label>
        <label>Min volume ×<input id="f-minvol" type="number" step="0.1" min="0" value="${ui.minVol}" style="width:6em"></label>
        <label style="flex-direction:row;align-items:center;gap:6px"><input id="f-down" type="checkbox" ${ui.onlyDown ? "checked" : ""}> Only below baseline</label>
      </div>
      <p class="note">Volume × compares the last 4 hours to the baseline day (1.0 = normal). Break-even is the sell price that recovers the current instant-sell price after tax.</p>
    </div>
    <div class="table-wrap" style="margin-top:12px"><table>
      <thead><tr>${th("name", "Item")}${th("price", "Price", "num")}${th("pct", "vs base", "num")}<th class="num">Rise to base</th>${th("vol", "Vol ×", "num")}<th class="num">Limit</th>${th("cap", "Gold / 4h", "num")}<th class="num">Break-even</th><th>Signal</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><a href="#item/${r.it.id}">${esc(r.it.name)}</a></td>
        <td class="num" title="${exact(r.now)}">${gp(r.now)}</td>
        <td class="num ${tone(r.chg)}">${pct(r.chg)}</td>
        <td class="num">${pct(r.rise)}</td>
        <td class="num">${r.vr == null ? "—" : r.vr.toFixed(2)}</td>
        <td class="num">${r.it.limit ?? "—"}</td>
        <td class="num">${gp(r.cap)}</td>
        <td class="num" title="${exact(r.be)}">${gp(r.be)}</td>
        <td>${r.sig !== "hold" ? chip(r.sig) : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">No items match these filters.</td></tr>`}
      </tbody></table></div>
    <p class="note" style="margin-top:8px">${total.toLocaleString()} items match${total > 150 && !ui.showAll ? ` · showing 150 · <a href="#" data-act="showall">show all</a>` : ""}</p>`;
}

// ================================================================ ITEM
function itemView(arg) {
  const id = Number(arg);
  const wait = needsPrices(); if (wait) return wait;
  const it = item(id); if (!it) return `<div class="empty">Unknown item.</div>`;
  const q = quote(id) || {}, now = nowMid(id), base = basePrice(id), chg = C.pctChange(now, base);
  const pos = openPosition(id);
  const pnl = pos ? C.positionPnL(pos, nowSell(id)) : null;
  const entry = q.low || now;
  const scen = base ? C.recoveryScenarios({ entry, qty: 1, current: now, baseline: base, itemId: id }) : [];
  const inBaskets = state.baskets.filter(b => b.members.some(m => m.itemId === id));
  return `
    <div class="view-head">
      <div><a href="#screener">← Screener</a><h2>${esc(it.name)}</h2>
        <p>${inBaskets.length ? "In " + inBaskets.map(b => `<a href="#basket/${b.id}">${esc(b.name)}</a>`).join(", ") : "Not in a basket yet"}</p></div>
      <div class="row">
        <select id="add-basket">${state.baskets.map(b => `<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select>
        <button data-act="add-to-basket" data-id="${id}">Add to basket</button>
      </div>
    </div>
    <div class="panel figures">
      ${fig("Instant buy", gp(q.high), exact(q.high))}${fig("Instant sell", gp(q.low), exact(q.low))}
      ${fig("Baseline", gp(base), exact(base))}${fig("vs baseline", pct(chg), "", tone(chg))}
      ${fig("Rise to baseline", pct(C.riseNeeded(now, base)))}${fig("Volume ×", volRatio(id)?.toFixed(2) ?? "—")}
      ${fig("Buy limit / 4h", it.limit ?? "—")}${fig("Gold / 4h", gp(C.capacityPer4h(it.limit, now)))}
    </div>
    <div class="panel" style="margin-top:16px">
      <div class="row" style="justify-content:space-between"><h3>Price history</h3>
        <div class="row">${["7d", "30d", "6m", "1y"].map(l => `<button data-act="lookback" data-l="${l}" ${ui.lookback === l ? 'class="primary"' : ""}>${l}</button>`).join("")}</div></div>
      <div id="chart"><p class="note">Loading history…</p></div>
      <p class="note">Gold dashed line: baseline. Blue lines: your events. Green dots: your buys, red: your sells.</p>
    </div>
    <div class="grid-2" style="margin-top:16px">
      <div class="panel stack">
        <h3>Recovery scenarios</h3>
        <p class="note">Buying 1 at the instant-sell price (${gp(entry)}) and selling after the price recovers part of the drop to baseline. After tax.</p>
        ${base ? `<div class="table-wrap"><table><thead><tr><th>Recovers</th><th class="num">Sell at</th><th class="num">Tax</th><th class="num">P/L</th><th class="num">ROI</th></tr></thead>
        <tbody>${scen.map(s => `<tr><td>${s.fraction * 100}%</td><td class="num">${gp(s.sell)}</td><td class="num">${gp(s.tax)}</td><td class="num ${tone(s.pnl)}">${gp(s.pnl)}</td><td class="num ${tone(s.roi)}">${pct(s.roi)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="note">No baseline price for this item on ${esc(market.baseDate)}.</p>`}
        <label class="row" style="flex-direction:column;align-items:start">What-if price (used in basket views with what-if on)
          <span class="row"><input id="whatif" value="${state.whatIf[id] ? gp(state.whatIf[id]) : ""}" placeholder="e.g. 450m"><button data-act="save-whatif" data-id="${id}">Save</button></span></label>
      </div>
      <div class="panel stack">
        <h3>${pos ? "Your position" : "Log a buy"}</h3>
        ${pos ? `<div class="figures">${fig("Quantity", pos.qty.toLocaleString())}${fig("Avg cost", gp(pos.avgCost), exact(pos.avgCost))}${fig("Break-even", gp(C.breakEvenSell(pos.avgCost, id)))}${fig("P/L if sold now", gp(pnl?.pnl), "", tone(pnl?.pnl))}${fig("ROI", pct(pnl?.roi), "", tone(pnl?.roi))}</div>` : ""}
        <form data-form="buy" data-id="${id}" class="row">
          <label>Quantity<input name="qty" required inputmode="numeric" style="width:7em"></label>
          <label>Price each<input name="price" required value="${gp(entry)}" style="width:8em"></label>
          <label>Date<input name="date" type="date" value="${today()}"></label>
          <label>Thesis<select name="thesis"><option value="">None</option>${state.theses.filter(t => t.status !== "closed").map(t => `<option value="${t.id}" ${pos?.thesisId === t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select></label>
          <button class="primary">Log buy</button>
        </form>
        <p class="note">Logging only records what you did in game. It doesn't place offers.</p>
      </div>
    </div>`;
}
const fig = (label, v, title = "", cls = "") => `<div class="figure"><span class="label">${esc(label)}</span><span class="v ${cls}" title="${esc(title)}">${v}</span></div>`;

async function drawChart(id) {
  const box = document.getElementById("chart");
  if (!box) return;
  const key = `${id}:${ui.lookback}`;
  try {
    if (!series.has(key)) series.set(key, await api.timeseries(id, ui.lookback));
    if (route().arg != String(id)) return; // navigated away
    const pts = series.get(key).filter(p => p.p > 0);
    if (pts.length < 2) { box.innerHTML = `<p class="note">Not enough trades to draw a chart.</p>`; return; }
    const fills = state.positions.filter(p => p.itemId === id).flatMap(p => p.fills.map(f => ({ t: Date.parse(f.date) / 1000, p: f.price, kind: "buy" })));
    const sells = state.trades.filter(t => t.itemId === id).map(t => ({ t: Date.parse(t.closedAt) / 1000, p: t.sellPrice, kind: "sell" }));
    box.innerHTML = svgChart(pts, { baseline: basePrice(id), events: state.events, marks: [...fills, ...sells] });
  } catch (e) {
    box.innerHTML = `<p class="note danger">History didn't load: ${esc(e.message)}</p>`;
  }
}

function svgChart(pts, { baseline, events, marks }) {
  const W = 800, H = 260, L = 64, Rr = 12, T = 14, B = 28;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const vals = pts.map(p => p.p).concat(baseline > 0 ? [baseline] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const padY = (hi - lo) * 0.08 || hi * 0.05; lo -= padY; hi += padY;
  const x = t => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - Rr);
  const y = p => T + (1 - (p - lo) / (hi - lo || 1)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.p).toFixed(1)}`).join("");
  const area = `${line}L${x(t1).toFixed(1)},${H - B}L${x(t0).toFixed(1)},${H - B}Z`;
  let g = "";
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4, yy = y(v).toFixed(1);
    g += `<line class="grid" x1="${L}" x2="${W - Rr}" y1="${yy}" y2="${yy}"/><text x="${L - 6}" y="${yy}" text-anchor="end" dominant-baseline="middle">${gp(v)}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const t = t0 + ((t1 - t0) * i) / 4, d = new Date(t * 1000);
    g += `<text x="${x(t).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? "start" : i === 4 ? "end" : "middle"}">${d.getUTCMonth() + 1}/${d.getUTCDate()}</text>`;
  }
  const ev = events.map(e => ({ ...e, t: Date.parse(e.date + "T00:00:00Z") / 1000 })).filter(e => e.t >= t0 && e.t <= t1)
    .map(e => `<line class="event" x1="${x(e.t).toFixed(1)}" x2="${x(e.t).toFixed(1)}" y1="${T}" y2="${H - B}"/><text class="event-label" x="${(x(e.t) + 4).toFixed(1)}" y="${T + 10}">${esc(e.name.slice(0, 24))}</text>`).join("");
  const bl = baseline > 0 && baseline >= lo && baseline <= hi ? `<line class="baseline" x1="${L}" x2="${W - Rr}" y1="${y(baseline).toFixed(1)}" y2="${y(baseline).toFixed(1)}"/>` : "";
  const mk = marks.filter(m => m.t >= t0 && m.t <= t1 + 86400 && m.p >= lo && m.p <= hi)
    .map(m => `<circle class="${m.kind}" cx="${x(Math.min(m.t, t1)).toFixed(1)}" cy="${y(m.p).toFixed(1)}" r="4.5"><title>${m.kind} ${gp(m.p)}</title></circle>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Price history">${g}<path class="area" d="${area}"/>${ev}${bl}<path class="price" d="${line}"/>${mk}</svg>`;
}

// ================================================================ BASKETS
function baskets() {
  const wait = needsPrices();
  const { signalFor } = market.loadedAt ? evaluate() : { signalFor: () => "hold" };
  return `
    <div class="view-head"><div><h2>Baskets</h2>
      <p>Groups of related items you define. Each basket gets an index (100 = baseline), your theses, and rules that turn into signals.</p></div></div>
    ${wait && !market.error ? wait : ""}
    <div class="table-wrap"><table>
      <thead><tr><th>Basket</th><th>Type</th><th class="num">Items</th><th class="num">Index</th><th class="num">Value now</th><th>Open theses</th><th>Signal</th></tr></thead>
      <tbody>${state.baskets.map(b => {
        const c = market.loadedAt ? basketCalc(b) : {};
        const th = state.theses.filter(t => t.basketId === b.id && t.status !== "closed").length;
        return `<tr><td><a href="#basket/${b.id}">${esc(b.name)}</a></td><td>${b.kind === "holdings" ? "Holdings" : "Watch"}</td>
          <td class="num">${b.members.length}</td><td class="num ${tone(c.index - 100)}">${c.index?.toFixed(1) ?? "—"}</td>
          <td class="num">${c.valueNow ? gp(c.valueNow) : "—"}</td><td>${th || "—"}</td><td>${chip(signalFor("basket", b.id))}</td></tr>`;
      }).join("") || `<tr><td colspan="7" class="muted">No baskets yet.</td></tr>`}</tbody></table></div>
    <form data-form="new-basket" class="panel row" style="margin-top:16px">
      <label>New basket<input name="name" required placeholder="e.g. Melee gear vs new raid"></label>
      <label>Type<select name="kind"><option value="watch">Watch — items you might buy</option><option value="holdings">Holdings — items you own</option></select></label>
      <button class="primary">Create</button>
    </form>`;
}

function basketView(id) {
  const b = state.baskets.find(x => x.id === id);
  if (!b) return `<div class="empty">Basket not found. <a href="#baskets">All baskets</a></div>`;
  const wait = needsPrices();
  const live = !!market.loadedAt;
  const c = live ? basketCalc(b) : {};
  const cw = live ? basketCalc(b, { whatIf: true }) : {};
  const ev = live ? evaluate() : null;
  const memberIds = new Set(b.members.map(m => m.itemId).filter(Boolean));
  const relevant = ev ? ev.results.filter(r => (r.rule.target.kind === "basket" && r.rule.target.id === b.id) || (r.rule.target.kind === "item" && memberIds.has(r.rule.target.id))) : [];
  const theses = state.theses.filter(t => t.basketId === b.id);
  const holdings = b.kind === "holdings";
  const resolved = b.members.filter(m => m.itemId != null);

  return `
    <div class="view-head">
      <div><a href="#baskets">← Baskets</a><h2>${esc(b.name)}</h2><p>${esc(b.notes || (holdings ? "Items you own." : "Items you're watching."))}</p></div>
      <div class="row">${ev ? chip(ev.signalFor("basket", b.id)) : ""}<button data-act="del-basket" data-id="${b.id}" class="danger">Delete basket</button></div>
    </div>
    ${wait && !market.error ? wait : ""}
    <div class="panel figures">
      ${fig("Index now", c.index?.toFixed(1) ?? "—", "100 = baseline", tone(c.index - 100))}
      ${fig("Index with what-if", ui.useWhatIf ? cw.index?.toFixed(1) ?? "—" : "off", "", tone(cw.index - 100))}
      ${fig("Priced items", `${c.covered ?? 0} / ${b.members.length}`)}
      ${holdings ? fig("Value now (mid)", gp(c.valueNow)) + fig("Value at baseline", gp(c.valueBase)) + fig("If sold now, after tax", gp(resolved.reduce((a, m) => a + C.netProceeds(nowSell(m.itemId) || 0, m.qty || 0, m.itemId), 0))) : ""}
    </div>
    <label class="row" style="margin:10px 0;align-items:center;gap:6px"><input type="checkbox" id="f-whatif" ${ui.useWhatIf ? "checked" : ""}> Use my what-if prices</label>

    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Now</th><th class="num">Baseline</th><th class="num">vs base</th><th class="num">What-if</th><th class="num">Vol ×</th><th></th></tr></thead>
      <tbody>${b.members.map((m, i) => {
        const ok = m.itemId != null;
        const now = ok ? nowMid(m.itemId) : null, base = ok ? basePrice(m.itemId) : null;
        return `<tr>
          <td>${ok ? `<a href="#item/${m.itemId}">${esc(m.name || nameOf(m.itemId))}</a>` : `<span class="danger" title="Name didn't match an item">${esc(m.name)} — fix name:</span> <input data-fix="${i}" list="item-names" placeholder="Exact item name">`}</td>
          <td class="num"><input data-qty="${i}" value="${m.qty ?? ""}" inputmode="numeric" style="width:5em"></td>
          <td class="num">${gp(now)}</td><td class="num">${gp(base)}</td>
          <td class="num ${tone(C.pctChange(now, base))}">${pct(C.pctChange(now, base))}</td>
          <td class="num">${ok && state.whatIf[m.itemId] ? gp(state.whatIf[m.itemId]) : "—"}</td>
          <td class="num">${ok ? volRatio(m.itemId)?.toFixed(2) ?? "—" : "—"}</td>
          <td><button data-act="rm-member" data-b="${b.id}" data-i="${i}" aria-label="Remove">✕</button></td></tr>`;
      }).join("") || `<tr><td colspan="8" class="muted">No items yet. Add some below.</td></tr>`}</tbody></table></div>
    <form data-form="add-member" data-b="${b.id}" class="row" style="margin-top:10px">
      <label>Add item<input name="name" list="item-names" required placeholder="Start typing an item name"></label>
      <label>Qty${holdings ? "" : " (optional)"}<input name="qty" inputmode="numeric" style="width:6em"></label>
      <button>Add</button>
    </form>
    <p class="note">Items with a quantity are weighted by their baseline value in the index. Items without one count equally.</p>

    ${holdings ? rotationPanel(b) : ""}

    <section class="stack" style="margin-top:24px">
      <h3>Theses</h3>
      ${theses.map(thesisCard).join("") || `<p class="note">No thesis yet. Write down what you expect this basket to do and why — the app turns your levels into signals and grades the call later.</p>`}
      <details class="panel"><summary>Write a thesis</summary>${thesisForm(b)}</details>
    </section>

    <section class="stack" style="margin-top:24px">
      <h3>Rules and signals</h3>
      ${relevant.map(r => `<div class="panel">
        <div class="row" style="justify-content:space-between"><strong>${esc(r.rule.name)}</strong>
          <span class="row">${r.fired ? chip(r.rule.signal) : `<span class="chip sig-hold">Not firing</span>`}${r.rule.auto ? `<span class="chip muted">From thesis</span>` : `<button data-act="rm-rule" data-id="${r.rule.id}">Delete</button>`}</span></div>
        <ul class="checks">${r.details.map(d => `<li class="${d.missing ? "missing" : d.pass ? "pass" : "fail"}">${esc(R.METRICS[d.metric]?.label || d.metric)} ${esc(d.op)} ${esc(d.value)}${d.value2 != null ? "–" + esc(d.value2) : ""} · now ${d.actual == null ? "no data" : (+d.actual).toFixed(2)}</li>`).join("")}</ul>
      </div>`).join("") || `<p class="note">No rules for this basket yet.</p>`}
      <details class="panel"><summary>Add a custom rule</summary>${ruleForm(b)}</details>
    </section>`;
}

function thesisCard(t) {
  const ev = state.events.find(e => e.id === t.eventId);
  const trades = state.trades.filter(x => x.thesisId === t.id);
  const st = C.tradeStats(trades);
  return `<div class="panel stack">
    <div class="row" style="justify-content:space-between"><strong>${esc(t.title)}</strong>
      <span class="row"><span class="chip">${esc(S.DIP_TYPES[t.dipType]?.split(" — ")[0] || t.dipType)}</span><span class="chip ${t.status === "closed" ? "muted" : "sig-watch"}">${t.status === "closed" ? "Closed" : "Open"}</span></span></div>
    <div class="figures">${fig("Entry ≤", t.entryIndex ?? "—")}${fig("Target ≥", t.targetIndex ?? "—")}${fig("Invalidation ≤", t.invalidationIndex ?? "—")}${fig("Review by", t.reviewDate || "—")}${fig("Trades", st.n)}${fig("Realized P/L", st.n ? gp(st.pnl) : "—", "", tone(st.pnl))}</div>
    ${ev ? `<p class="note">Event: ${esc(ev.name)} (${esc(ev.date)})</p>` : ""}
    ${t.expectation ? `<p><span class="label">Expect</span><br>${esc(t.expectation)}</p>` : ""}
    ${t.reasoning ? `<p><span class="label">Why</span><br>${esc(t.reasoning)}</p>` : ""}
    ${t.status === "closed"
      ? `<p><span class="label">Verdict</span><br>${esc(t.verdict?.result || "")} — ${esc(t.verdict?.note || "")}</p>`
      : `<form data-form="close-thesis" data-id="${t.id}" class="row">
          <label>Verdict<select name="result"><option>Right</option><option>Partly right</option><option>Wrong</option></select></label>
          <label style="flex:1">What happened<input name="note" placeholder="Compared with what you expected"></label>
          <button>Close thesis</button></form>`}
  </div>`;
}

function thesisForm(b) {
  return `<form data-form="new-thesis" data-b="${b.id}" class="stack" style="margin-top:10px">
    <div class="row">
      <label style="flex:1">Title<input name="title" required placeholder="e.g. Melee gear dumped to fund raid entry"></label>
      <label>Dip type<select name="dipType">${Object.entries(S.DIP_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <label>Event<select name="eventId"><option value="">None</option>${state.events.map(e => `<option value="${e.id}" ${e.id === state.settings.activeEventId ? "selected" : ""}>${esc(e.name)}</option>`).join("")}</select></label>
    </div>
    <label>What you expect<textarea name="expectation" placeholder="e.g. Index back to 95+ within 4–6 weeks once the raid rush settles"></textarea></label>
    <label>Why<textarea name="reasoning" placeholder="What you know about the update and these items"></textarea></label>
    <div class="row">
      <label>Entry: index ≤<input name="entryIndex" type="number" step="0.5" style="width:6em" placeholder="75"></label>
      <label>Target: index ≥<input name="targetIndex" type="number" step="0.5" style="width:6em" placeholder="95"></label>
      <label>Invalidation: index ≤<input name="invalidationIndex" type="number" step="0.5" style="width:6em" placeholder="60"></label>
      <label>Review by<input name="reviewDate" type="date"></label>
      <button class="primary">Save thesis</button>
    </div>
    <p class="note">Levels are basket index values: 100 = baseline, 75 = 25% below it. Each level becomes a rule automatically.</p>
  </form>`;
}

function ruleForm(b) {
  const targets = [`<option value="basket:${b.id}">This basket</option>`,
    ...b.members.filter(m => m.itemId).map(m => `<option value="item:${m.itemId}">${esc(m.name)}</option>`)];
  return `<form data-form="new-rule" class="stack" style="margin-top:10px">
    <div class="row">
      <label style="flex:1">Name<input name="name" required placeholder="e.g. Dump is over"></label>
      <label>Applies to<select name="target">${targets.join("")}</select></label>
      <label>Signal<select name="signal">${R.SIGNALS.map(s => `<option value="${s}">${R.SIGNAL_LABEL[s]}</option>`).join("")}</select></label>
    </div>
    ${[0, 1].map(i => `<div class="row">
      <label>${i ? "And (optional)" : "When"}<select name="metric${i}">${i ? '<option value="">—</option>' : ""}${Object.entries(R.METRICS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("")}</select></label>
      <label>is<select name="op${i}">${R.OP_LIST.map(o => `<option>${o}</option>`).join("")}</select></label>
      <label>value<input name="value${i}" style="width:7em" ${i ? "" : "required"}></label>
      <label>and (for between)<input name="value2_${i}" style="width:7em"></label></div>`).join("")}
    <div><button class="primary">Add rule</button></div>
    <p class="note">Trend needs the item's history loaded once (open its page). Basket trend isn't built yet.</p>
  </form>`;
}

function rotationPanel(b) {
  const sellable = b.members.filter(m => m.itemId);
  if (!sellable.length || !market.loadedAt) return "";
  const r = ui.rotation;
  let table = "";
  if (r && r.basketId === b.id) {
    const h = sellable.find(m => m.itemId === r.holdId), target = itemByName(r.targetName);
    if (h && target && nowMid(target.id) && basePrice(target.id) && basePrice(h.itemId)) {
      const rows = C.rotationScenario({
        hold: { itemId: h.itemId, qty: h.qty || 1, current: nowSell(h.itemId), baseline: basePrice(h.itemId) },
        target: { itemId: target.id, current: quote(target.id)?.high || nowMid(target.id), baseline: basePrice(target.id) },
      });
      if (rows[0].units < 1) {
        table = `<p class="note danger">Selling ${h.qty || 1} × ${esc(h.name)} brings in ${gp(rows[0].proceeds)} after tax, which isn't enough for one ${esc(target.name)} at ${gp(quote(target.id)?.high || nowMid(target.id))}. Raise the quantity or pick another item.</p>`;
      } else
      table = `<p class="note">Sell ${h.qty || 1} × ${esc(h.name)} now → ${gp(rows[0].proceeds)} after tax → ${rows[0].units.toLocaleString()} × ${esc(target.name)} at instant buy. Both assumed to recover the same share of their drop. ${target.limit ? `Buy limit: ${target.limit} per 4h, so filling takes about ${Math.ceil(rows[0].units / target.limit) * 4}h.` : ""}</p>
      <div class="table-wrap"><table><thead><tr><th>Both recover</th><th class="num">Keep holding</th><th class="num">Rotate</th><th class="num">Edge</th></tr></thead>
      <tbody>${rows.map(x => `<tr><td>${x.fraction * 100}%</td><td class="num">${gp(x.keepValue)}</td><td class="num">${gp(x.rotateValue)}</td><td class="num ${tone(x.edge)}">${gp(x.edge)}</td></tr>`).join("")}</tbody></table></div>`;
    } else table = `<p class="note">Need current and baseline prices for both items.</p>`;
  }
  return `<section class="panel stack" style="margin-top:24px"><h3>Rotation calculator</h3>
    <p class="note">Should you sell something you hold and buy something that dipped harder?</p>
    <form data-form="rotation" data-b="${b.id}" class="row">
      <label>Sell<select name="hold">${sellable.map(m => `<option value="${m.itemId}" ${r?.holdId === m.itemId ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select></label>
      <label>Buy<input name="target" list="item-names" required value="${esc(r?.targetName || "")}"></label>
      <button>Compare</button></form>${table}</section>`;
}

// ================================================================ PORTFOLIO
function portfolio() {
  const wait = needsPrices();
  const live = !!market.loadedAt;
  const open = state.positions.filter(p => p.qty > 0);
  const ev = live ? evaluate() : null;
  let cost = 0, net = 0;
  const rows = open.map(p => {
    const sell = live ? nowSell(p.itemId) : null;
    const r = sell ? C.positionPnL(p, sell) : null;
    cost += p.qty * p.avgCost; if (r) net += r.net;
    return { p, sell, r, thesis: state.theses.find(t => t.id === p.thesisId) };
  });
  const realized = state.trades.reduce((a, t) => a + t.pnl, 0);
  const capital = state.settings.capital || 0;
  return `
    <div class="view-head"><div><h2>Portfolio</h2><p>Open positions valued at the instant-sell price (what you'd get selling right now), after tax.</p></div></div>
    ${wait && !market.error ? wait : ""}
    <div class="panel figures">
      ${fig("Capital", gp(capital))}${fig("Deployed", gp(cost))}${fig("Free", gp(capital - cost + realized))}
      ${fig("Value if sold now", live ? gp(net) : "—")}${fig("Unrealized P/L", live ? gp(net - cost) : "—", "", tone(net - cost))}${fig("Realized P/L", gp(realized), "", tone(realized))}
    </div>
    <div class="table-wrap" style="margin-top:16px"><table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Avg cost</th><th class="num">Sell now</th><th class="num">Break-even</th><th class="num">P/L</th><th class="num">ROI</th><th class="num">Days</th><th>Thesis</th><th>Signal</th><th></th></tr></thead>
      <tbody>${rows.map(({ p, sell, r, thesis }) => `<tr>
        <td><a href="#item/${p.itemId}">${esc(p.name)}</a></td><td class="num">${p.qty.toLocaleString()}</td>
        <td class="num" title="${exact(p.avgCost)}">${gp(p.avgCost)}</td><td class="num">${gp(sell)}</td>
        <td class="num">${gp(C.breakEvenSell(p.avgCost, p.itemId))}</td>
        <td class="num ${tone(r?.pnl)}">${gp(r?.pnl)}</td><td class="num ${tone(r?.roi)}">${pct(r?.roi)}</td>
        <td class="num">${C.daysBetween(p.openedAt, today())}</td>
        <td>${thesis ? `<a href="#basket/${thesis.basketId}">${esc(thesis.title)}</a>` : "—"}</td>
        <td>${ev ? chip(ev.signalFor("item", p.itemId)) : ""}</td>
        <td><button data-act="sell" data-id="${p.id}">Sell</button></td></tr>
        ${ui.sellingId === p.id ? `<tr><td colspan="11"><form data-form="sell" data-id="${p.id}" class="row">
          <label>Quantity<input name="qty" value="${p.qty}" inputmode="numeric" style="width:7em"></label>
          <label>Price each<input name="price" value="${gp(sell)}" style="width:8em"></label>
          <label>Date<input name="date" type="date" value="${today()}"></label>
          <button class="primary">Log sell</button><button type="button" data-act="cancel-sell">Cancel</button></form></td></tr>` : ""}`).join("")
        || `<tr><td colspan="11" class="muted">No open positions. Log a buy from any item's page.</td></tr>`}</tbody></table></div>
    <p class="note" style="margin-top:8px">Holdings you already own (like your liquidation list) live in <a href="#baskets">Baskets</a> as a Holdings basket.</p>`;
}

// ================================================================ JOURNAL
function journal() {
  const trades = [...state.trades].sort((a, b) => b.closedAt.localeCompare(a.closedAt));
  const all = C.tradeStats(trades);
  const byDip = C.tradeStats(trades, t => t.dipType);
  const byCause = C.tradeStats(trades.filter(t => t.review?.cause), t => t.review.cause);
  const statRows = (obj, labels) => Object.entries(obj).map(([k, s]) => `<tr><td>${esc(labels[k]?.split(" — ")[0] || k)}</td><td class="num">${s.n}</td><td class="num">${s.winRate?.toFixed(0) ?? "—"}%</td><td class="num ${tone(s.pnl)}">${gp(s.pnl)}</td><td class="num ${tone(s.roi)}">${pct(s.roi)}</td><td class="num">${s.avgHoldDays?.toFixed(1) ?? "—"}</td></tr>`).join("");
  const statTable = (title, obj, labels) => `<div class="stack"><h3>${title}</h3><div class="table-wrap"><table><thead><tr><th></th><th class="num">Trades</th><th class="num">Win rate</th><th class="num">P/L</th><th class="num">ROI</th><th class="num">Avg days</th></tr></thead><tbody>${statRows(obj, labels) || `<tr><td colspan="6" class="muted">No data yet.</td></tr>`}</tbody></table></div></div>`;
  const pending = trades.filter(t => !t.review?.cause).length;
  return `
    <div class="view-head"><div><h2>Journal</h2><p>Every sell, what you expected, what happened, and why. This is where the app learns from you.</p></div></div>
    <div class="panel figures">
      ${fig("Closed trades", all.n)}${fig("Win rate", all.n ? all.winRate.toFixed(0) + "%" : "—")}${fig("Total P/L", all.n ? gp(all.pnl) : "—", "", tone(all.pnl))}
      ${fig("ROI", pct(all.roi))}${fig("Avg hold", all.n ? all.avgHoldDays.toFixed(1) + " days" : "—")}${fig("Need review", pending)}
    </div>
    <div class="grid-2" style="margin-top:16px">${statTable("By dip type", byDip, S.DIP_TYPES)}${statTable("By main cause", byCause, S.MISTAKE_CAUSES)}</div>
    <section class="stack" style="margin-top:24px"><h3>Trades</h3>
      ${trades.map(t => `<details class="panel" ${!t.review?.cause ? "open" : ""}>
        <summary>${esc(t.closedAt)} · ${esc(t.name)} × ${t.qty.toLocaleString()} · <span class="${tone(t.pnl)}">${gp(t.pnl)} (${pct(t.roi)})</span> · ${t.holdDays} days ${!t.review?.cause ? '<span class="chip sig-watch">Needs review</span>' : ""}</summary>
        <p class="note">Bought at ${gp(t.buyAvg)}, sold at ${gp(t.sellPrice)}, tax ${gp(t.tax)}. ${t.thesisId ? "Thesis: " + esc(state.theses.find(x => x.id === t.thesisId)?.title || "deleted") : "No thesis."}</p>
        <form data-form="review" data-id="${t.id}" class="stack">
          <div class="grid-2"><label>What you expected<textarea name="expected">${esc(t.review?.expected)}</textarea></label>
          <label>What actually happened<textarea name="actual">${esc(t.review?.actual)}</textarea></label>
          <label>What went right<textarea name="right">${esc(t.review?.right)}</textarea></label>
          <label>What went wrong<textarea name="wrong">${esc(t.review?.wrong)}</textarea></label></div>
          <div class="row"><label>Main cause<select name="cause"><option value="">Choose…</option>${Object.entries(S.MISTAKE_CAUSES).map(([k, v]) => `<option value="${k}" ${t.review?.cause === k ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>
          <button class="primary">Save review</button></div>
        </form></details>`).join("") || `<p class="note">No closed trades yet. Sells you log in Portfolio show up here for review.</p>`}
    </section>`;
}

// ================================================================ EVENTS
function events() {
  const list = [...state.events].sort((a, b) => b.date.localeCompare(a.date));
  return `
    <div class="view-head"><div><h2>Events</h2>
      <p>Game updates that move the market. The active event sets the screener's baseline: ${state.settings.baselineDaysBefore} day(s) before its date.</p></div></div>
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Update</th><th>Type</th><th>Notes</th><th>Baseline</th><th></th></tr></thead>
      <tbody>${list.map(e => `<tr><td class="mono">${esc(e.date)}</td><td>${esc(e.name)}</td><td><span class="chip">${esc(S.EVENT_TYPES[e.type] || e.type)}</span></td>
        <td style="white-space:normal;min-width:16em">${esc(e.notes)}</td>
        <td>${state.settings.activeEventId === e.id ? '<span class="chip sig-buy_zone">Active</span>' : `<button data-act="use-event" data-id="${e.id}">Use</button>`}</td>
        <td><button data-act="del-event" data-id="${e.id}" aria-label="Delete">✕</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">No events yet. Add the update you're trading around.</td></tr>`}</tbody></table></div>
    <form data-form="new-event" class="panel stack" style="margin-top:16px">
      <div class="row">
        <label>Date<input name="date" type="date" required value="${today()}"></label>
        <label style="flex:1">Update name<input name="name" required placeholder="Name of the update"></label>
        <label>Type<select name="type">${Object.entries(S.EVENT_TYPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      </div>
      <label>Notes<textarea name="notes" placeholder="What it added, what it competes with, what you expect it to do to prices"></textarea></label>
      <div class="row"><label style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="active" checked> Use as baseline</label><button class="primary">Add event</button></div>
    </form>`;
}

// ================================================================ SETTINGS
function settings() {
  return `
    <div class="view-head"><div><h2>Settings</h2><p>Your data is saved in this browser only. Export it to back up or move to another device.</p></div></div>
    <div class="grid-2">
      <form data-form="settings" class="panel stack"><h3>Numbers</h3>
        <label>Trading capital<input name="capital" value="${gp(state.settings.capital)}"></label>
        <label>Baseline = days before event<input name="days" type="number" min="0" max="30" value="${state.settings.baselineDaysBefore}"></label>
        <button class="primary">Save</button></form>
      <div class="panel stack"><h3>Backup</h3>
        <p class="note">Export downloads one JSON file with everything: events, baskets, theses, rules, positions and trades.</p>
        <div class="row"><button data-act="export">Export data</button>
          <label class="btn">Import data<input type="file" id="import-file" accept="application/json" hidden></label></div>
        <p class="note">Importing replaces what's in this browser.</p>
        <button data-act="reset" class="danger">${ui.resetArmed ? "Click again to erase everything" : "Erase all data"}</button></div>
      <div class="panel stack"><h3>Data check</h3>
        <p class="note">Shows the field names the price API returns. Run this first after publishing; if a number in the app is blank, compare these names with the pick() lists in js/api.js.</p>
        <button data-act="datacheck">Run data check</button>
        ${ui.check ? `<pre class="mono">${esc(JSON.stringify(ui.check, null, 2))}</pre>` : ""}</div>
    </div>`;
}

// ================================================================ ACTIONS
const actions = {
  reload() { series.clear(); loadMarket(); },
  sort(el) { const k = el.dataset.key; ui.dir = ui.sort === k ? -ui.dir : 1; ui.sort = k; render(); },
  showall(el, e) { e.preventDefault(); ui.showAll = true; render(); },
  lookback(el) { ui.lookback = el.dataset.l; render(); },
  "add-to-basket"(el) {
    const b = state.baskets.find(x => x.id === document.getElementById("add-basket").value);
    const id = Number(el.dataset.id);
    if (!b || b.members.some(m => m.itemId === id)) return;
    b.members.push({ itemId: id, name: nameOf(id), qty: null, note: "" }); persist(); render();
  },
  "save-whatif"(el) {
    const v = num(document.getElementById("whatif").value), id = Number(el.dataset.id);
    if (v > 0) state.whatIf[id] = v; else delete state.whatIf[id];
    persist(); render();
  },
  "rm-member"(el) {
    const b = state.baskets.find(x => x.id === el.dataset.b); b.members.splice(Number(el.dataset.i), 1); persist(); render();
  },
  "del-basket"(el) {
    if (el.dataset.armed !== "1") { el.dataset.armed = "1"; el.textContent = "Click again to delete"; return; }
    state.baskets = state.baskets.filter(b => b.id !== el.dataset.id);
    state.theses = state.theses.filter(t => t.basketId !== el.dataset.id);
    persist(); location.hash = "#baskets";
  },
  "rm-rule"(el) { state.rules = state.rules.filter(r => r.id !== el.dataset.id); persist(); render(); },
  sell(el) { ui.sellingId = el.dataset.id; render(); },
  "cancel-sell"() { ui.sellingId = null; render(); },
  "use-event"(el) { state.settings.activeEventId = el.dataset.id; persist(); loadMarket(); },
  "del-event"(el) {
    state.events = state.events.filter(e => e.id !== el.dataset.id);
    if (state.settings.activeEventId === el.dataset.id) state.settings.activeEventId = null;
    persist(); loadMarket();
  },
  export() {
    const blob = new Blob([S.exportJSON(state)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `ge-analyzer-${today()}.json` });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  reset() {
    if (!ui.resetArmed) { ui.resetArmed = true; render(); return; }
    ui.resetArmed = false; state = S.starterState(); persist(); resolveNames(); render();
  },
  async datacheck() { ui.check = { running: true }; render(); ui.check = await api.dataCheck(); render(); },
};

const forms = {
  buy(f, d) {
    const id = Number(f.dataset.id), qty = num(d.qty), price = num(d.price);
    if (!(qty > 0) || !(price > 0)) return setStatus("Enter a quantity and price.", true);
    let p = openPosition(id);
    if (!p) { p = { id: S.uid("p_"), itemId: id, name: nameOf(id), qty: 0, avgCost: 0, fills: [], openedAt: d.date || today(), thesisId: null, notes: "" }; state.positions.push(p); }
    Object.assign(p, C.addFill(p, qty, price));
    p.fills.push({ date: d.date || today(), qty, price });
    if (d.thesis) p.thesisId = d.thesis;
    persist(); setStatus(`Logged buy: ${qty.toLocaleString()} × ${nameOf(id)} at ${gp(price)}.`); render();
  },
  sell(f, d) {
    const p = state.positions.find(x => x.id === f.dataset.id);
    const qty = Math.min(num(d.qty), p.qty), price = num(d.price);
    if (!(qty > 0) || !(price > 0)) return setStatus("Enter a quantity and price.", true);
    const r = C.closeTrade(p, qty, price);
    const thesis = state.theses.find(t => t.id === p.thesisId);
    state.trades.push({
      id: S.uid("t_"), positionId: p.id, itemId: p.itemId, name: p.name, ...r,
      openedAt: p.openedAt, closedAt: d.date || today(), holdDays: C.daysBetween(p.openedAt, d.date || today()),
      thesisId: p.thesisId, dipType: thesis?.dipType || "unset", review: {},
    });
    p.qty -= qty;
    ui.sellingId = null; persist();
    setStatus(`Logged sell: ${gp(r.pnl)} P/L. Review it in the Journal.`); render();
  },
  "new-basket"(f, d) {
    const b = { id: S.uid("b_"), name: d.name.trim(), kind: d.kind, members: [], notes: "" };
    state.baskets.push(b); persist(); location.hash = `#basket/${b.id}`;
  },
  "add-member"(f, d) {
    const b = state.baskets.find(x => x.id === f.dataset.b), it = itemByName(d.name);
    if (!it) return setStatus(`No item named “${d.name}”. Pick one from the list.`, true);
    if (!b.members.some(m => m.itemId === it.id)) b.members.push({ itemId: it.id, name: it.name, qty: num(d.qty), note: "" });
    persist(); render();
  },
  "new-thesis"(f, d) {
    state.theses.push({
      id: S.uid("th_"), basketId: f.dataset.b, eventId: d.eventId || null, title: d.title.trim(), dipType: d.dipType,
      expectation: d.expectation, reasoning: d.reasoning,
      entryIndex: num(d.entryIndex), targetIndex: num(d.targetIndex), invalidationIndex: num(d.invalidationIndex),
      reviewDate: d.reviewDate || null, status: "open", createdAt: today(), closedAt: null, verdict: null,
    });
    persist(); render();
  },
  "close-thesis"(f, d) {
    const t = state.theses.find(x => x.id === f.dataset.id);
    t.status = "closed"; t.closedAt = today(); t.verdict = { result: d.result, note: d.note };
    persist(); render();
  },
  "new-rule"(f, d) {
    const [kind, id] = d.target.split(":");
    const conds = [0, 1].filter(i => d[`metric${i}`] && d[`value${i}`] !== "").map(i => ({
      metric: d[`metric${i}`], op: d[`op${i}`], value: num(d[`value${i}`]), value2: d[`value2_${i}`] ? num(d[`value2_${i}`]) : undefined,
    }));
    const bad = conds.find(c => !R.METRICS[c.metric].targets.includes(kind));
    if (bad) return setStatus(`${R.METRICS[bad.metric].label} doesn't apply to ${kind === "item" ? "an item" : "a basket"}.`, true);
    state.rules.push({ id: S.uid("r_"), name: d.name.trim(), target: { kind, id: kind === "item" ? Number(id) : id }, signal: d.signal, conditions: conds, enabled: true });
    persist(); render();
  },
  rotation(f, d) { ui.rotation = { basketId: f.dataset.b, holdId: Number(d.hold), targetName: d.target }; render(); },
  review(f, d) {
    const t = state.trades.find(x => x.id === f.dataset.id);
    t.review = { expected: d.expected, actual: d.actual, right: d.right, wrong: d.wrong, cause: d.cause };
    persist(); setStatus("Review saved."); render();
  },
  "new-event"(f, d) {
    const e = { id: S.uid("e_"), date: d.date, name: d.name.trim(), type: d.type, notes: d.notes };
    state.events.push(e);
    if (d.active) state.settings.activeEventId = e.id;
    persist(); d.active ? loadMarket() : render();
  },
  settings(f, d) {
    state.settings.capital = num(d.capital) || 0;
    const days = Math.max(0, Math.min(30, Number(d.days) || 0));
    const changed = days !== state.settings.baselineDaysBefore;
    state.settings.baselineDaysBefore = days;
    persist(); setStatus("Settings saved."); changed ? loadMarket() : render();
  },
};

view.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (el && actions[el.dataset.act]) actions[el.dataset.act](el, e);
});
view.addEventListener("submit", e => {
  const f = e.target.closest("form[data-form]");
  if (!f) return;
  e.preventDefault();
  const d = Object.fromEntries(new FormData(f));
  forms[f.dataset.form]?.(f, d);
});
view.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "f-q") { ui.q = t.value; render(); }
  else if (t.id === "f-minprice") { state.settings.minPrice = num(t.value) || 0; persist(); render(); }
  else if (t.id === "f-minvol") { ui.minVol = Number(t.value) || 0; render(); }
  else if (t.id === "f-down") { ui.onlyDown = t.checked; render(); }
  else if (t.id === "f-whatif") { ui.useWhatIf = t.checked; render(); }
  else if (t.dataset.qty != null) {
    const b = state.baskets.find(x => x.id === route().arg);
    b.members[Number(t.dataset.qty)].qty = num(t.value); persist(); render();
  } else if (t.dataset.fix != null) {
    const b = state.baskets.find(x => x.id === route().arg), it = itemByName(t.value);
    if (!it) return setStatus(`No item named “${t.value}”.`, true);
    Object.assign(b.members[Number(t.dataset.fix)], { itemId: it.id, name: it.name }); persist(); render();
  } else if (t.id === "import-file" && t.files[0]) {
    t.files[0].text().then(txt => {
      try { state = S.importJSON(txt); persist(); resolveNames(); setStatus("Data imported."); loadMarket(); }
      catch (err) { setStatus(err.message, true); }
    });
  }
});

// ---------------------------------------------------------------- start
render();
loadMarket();
