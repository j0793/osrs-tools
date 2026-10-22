// store.js — everything you enter lives here, saved in this browser only.
// Nothing is sent anywhere. Use Export / Import (Settings) to back up or
// move your data to another device.
//
// Schema v3 — bump SCHEMA_VERSION and add a step to migrate() when it changes.
// v1 → v2: the fixed `settings.capital` number became a cash ledger (`cash.entries`).
// v2 → v3: holding sales moved from cash entries to trades (kind "holding_sale"),
//          so they can link to a thesis and be graded in the Journal.

import { breakEvenSell, geTax } from "./calc.js";

const KEY = "osrs-market-analyzer";
export const SCHEMA_VERSION = 3;

/** Cash movement types. Buys and sells are added automatically from your logs. */
export const CASH_TYPES = {
  opening: "Opening balance",
  deposit: "Added gold",
  withdraw: "Took gold out",
  adjust: "Correction",
  holding_sale: "Sold a holding",
  buy: "Buy",
  sell: "Sell",
};

export const EVENT_TYPES = {
  major: "Major update",
  minor: "Minor update",
  boss: "New boss / raid",
  quest: "Quest / area",
  skill: "Skilling content",
  rebalance: "Rebalance",
  economy: "Economy change (sink, tax, drop rate)",
  hotfix: "Hotfix",
  other: "Other",
};

export const DIP_TYPES = {
  cyclical: "Cyclical — liquidity dip, use unchanged",
  structural: "Structural — displaced or devalued",
  inverse: "Inverse — demand up from the update",
  unsure: "Not sure yet",
};

export const MISTAKE_CAUSES = {
  none: "Nothing — played out as planned",
  thesis: "Thesis was wrong",
  timing: "Right idea, wrong timing",
  sizing: "Position too big or too small",
  execution: "Bad fills / missed buy limit",
  patience: "Sold too early or held too long",
  luck: "Outside event (update, sink, crash)",
  other: "Other",
};

export function emptyState() {
  return {
    schema: SCHEMA_VERSION,
    settings: {
      activeEventId: null,      // baseline for the screener
      baselineDaysBefore: 1,    // baseline = this many days before the event date
      minPrice: 1_000_000,      // screener default filters
      minVolumeRatio: 0,
    },
    cash: { entries: [] }, // { id, date, type (see CASH_TYPES), amount (signed gp), note, ref }
    events: [],     // { id, date, name, type, notes }
    baskets: [],    // { id, name, kind: "watch"|"holdings", members: [{ itemId, name, qty, note }], notes }
    theses: [],     // { id, basketId, eventId, title, dipType, expectation, reasoning,
                    //   entryIndex, targetIndex, invalidationIndex, reviewDate, status, createdAt, closedAt, verdict }
    rules: [],      // custom rules (thesis rules are generated, not stored) — see rules.js
    positions: [],  // { id, itemId, name, qty, avgCost, fills: [{ date, qty, price }], thesisId, openedAt, notes }
    trades: [],     // closed sells — { id, kind: "trade"|"holding_sale", positionId, itemId, name, qty, buyAvg, sellPrice,
                    //   cost, tax, net, pnl, roi, openedAt, closedAt, at, holdDays, thesisId, dipType, basketId,
                    //   review: { expected, actual, right, wrong, cause } }
                    // A holding sale has no position; cost/pnl/roi are null unless you entered what you paid.
    whatIf: {},     // itemId → your hypothetical price, used where "what-if" is switched on
  };
}

export function uid(prefix = "") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function migrate(s) {
  if (!s.schema || s.schema < 2) {
    const capital = s.settings?.capital;
    s.cash = { entries: [] };
    if (capital > 0) {
      s.cash.entries.push({ id: uid("c_"), date: firstDate(s), type: "opening", amount: capital, note: "Carried over from the v0.1 capital setting" });
    }
    if (s.settings) delete s.settings.capital;
    s.schema = 2;
  }
  if (s.schema < 3) {
    // Old holding sales were cash entries like "2 × Torva full helm at 166m (tax 3.3m)".
    // The per-item price is recovered from the after-tax amount; it can be off by 1 gp from rounding.
    s.trades ||= [];
    const keep = [];
    for (const e of s.cash?.entries || []) {
      if (e.type !== "holding_sale") { keep.push(e); continue; }
      const m = /^([\d,]+) × (.+?) at /.exec(e.note || "");
      const qty = m ? Number(m[1].replace(/,/g, "")) : 1;
      const itemId = e.ref?.itemId ?? null;
      const sellPrice = breakEvenSell(e.amount / qty, itemId);
      s.trades.push({
        id: e.id.replace(/^c_/, "t_"), kind: "holding_sale", itemId, name: m ? m[2] : "Holding", qty,
        sellPrice, tax: qty * geTax(sellPrice, itemId), net: e.amount, cost: null, pnl: null, roi: null, buyAvg: null,
        openedAt: null, closedAt: e.date, at: e.at || "", holdDays: null, thesisId: null, dipType: "unset",
        basketId: e.ref?.basketId ?? null, review: {},
      });
    }
    if (s.cash) s.cash.entries = keep;
    for (const t of s.trades) t.kind ||= "trade";
    s.schema = 3;
  }
  return s;
}

/** Earliest date in the data, so a migrated opening balance comes before every logged buy. */
function firstDate(s) {
  const dates = [
    ...(s.positions || []).flatMap(p => (p.fills || []).map(f => f.date)),
    ...(s.trades || []).map(t => t.openedAt),
  ].filter(Boolean).sort();
  return dates[0] || new Date().toISOString().slice(0, 10);
}

export function hasSaved() {
  try { return localStorage.getItem(KEY) != null; } catch { return false; }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = migrate(JSON.parse(raw));
    // fill any keys added since the data was saved
    const base = emptyState();
    return { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } };
  } catch {
    return emptyState();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false; // storage full or blocked — the UI warns
  }
}

export function exportJSON(state) {
  return JSON.stringify({ app: "osrs-market-analyzer", exportedAt: new Date().toISOString(), ...state }, null, 2);
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (data.app !== "osrs-market-analyzer") throw new Error("This file is not a market analyzer export.");
  if (data.schema > SCHEMA_VERSION) throw new Error("This export is from a newer version of the app.");
  const { app, exportedAt, ...rest } = data;
  const base = emptyState();
  return migrate({ ...base, ...rest, settings: { ...base.settings, ...rest.settings } });
}

/** Seed data for a first run: your liquidation list as a holdings basket. Names resolve to item ids on load. */
export function starterState() {
  const s = emptyState();
  s.cash.entries.push({ id: uid("c_"), date: new Date().toISOString().slice(0, 10), type: "opening", amount: 900_000_000, note: "Starting gold — correct it in Portfolio" });
  s.baskets.push({
    id: uid("b_"),
    name: "Liquidation list",
    kind: "holdings",
    notes: "Gear you could sell to fund buys. Check whether each dipped before treating it as capital.",
    members: [
      "Torva full helm", "Torva platebody", "Torva platelegs",
      "Justiciar faceguard", "Justiciar chestguard", "Justiciar legguards",
      "Confliction gauntlets", "Elysian spirit shield", "Berserker ring",
      "Dinh's bulwark", "Ring of suffering", "Belle's folly",
    ].map(name => ({ itemId: null, name, qty: 1, note: "" })),
  });
  return s;
}
