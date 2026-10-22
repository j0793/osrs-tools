// store.js — everything you enter lives here, saved in this browser only.
// Nothing is sent anywhere. Use Export / Import (Settings) to back up or
// move your data to another device.
//
// Schema v1 — bump SCHEMA_VERSION and add a step to migrate() when it changes.

const KEY = "osrs-market-analyzer";
export const SCHEMA_VERSION = 1;

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
      capital: 900_000_000,
    },
    events: [],     // { id, date, name, type, notes }
    baskets: [],    // { id, name, kind: "watch"|"holdings", members: [{ itemId, name, qty, note }], notes }
    theses: [],     // { id, basketId, eventId, title, dipType, expectation, reasoning,
                    //   entryIndex, targetIndex, invalidationIndex, reviewDate, status, createdAt, closedAt, verdict }
    rules: [],      // custom rules (thesis rules are generated, not stored) — see rules.js
    positions: [],  // { id, itemId, name, qty, avgCost, fills: [{ date, qty, price }], thesisId, openedAt, notes }
    trades: [],     // closed sells — { id, positionId, itemId, name, qty, buyAvg, sellPrice, cost, tax, net, pnl, roi,
                    //   openedAt, closedAt, holdDays, thesisId, dipType, review: { expected, actual, right, wrong, cause } }
    whatIf: {},     // itemId → your hypothetical price, used where "what-if" is switched on
  };
}

export function uid(prefix = "") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function migrate(s) {
  // if (s.schema === 1) { ...transform...; s.schema = 2; }
  return s;
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
