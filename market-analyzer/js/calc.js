// calc.js — pure math. No fetching, no DOM, no storage.
// Everything the app concludes about money goes through these functions,
// so they are the first place to check when a number looks wrong.

// ---------- Grand Exchange tax ----------
// 2% of the sale price per item, rounded down, capped at 5,000,000 per item.
// Below 50 gp the 2% rounds down to 0. A few items are exempt entirely.
export const TAX_RATE = 0.02;
export const TAX_CAP = 5_000_000;
export const TAX_EXEMPT_IDS = new Set([
  13190, // Old school bond — add other exempt item ids here if needed
]);

export function geTax(price, itemId = null) {
  if (!(price > 0)) return 0;
  if (itemId != null && TAX_EXEMPT_IDS.has(itemId)) return 0;
  return Math.min(Math.floor(price * TAX_RATE), TAX_CAP);
}

/** What you keep from selling `qty` at `price`, after tax. */
export function netProceeds(price, qty = 1, itemId = null) {
  return qty * (price - geTax(price, itemId));
}

/** Lowest sell price that returns at least `buyPrice` after tax. */
export function breakEvenSell(buyPrice, itemId = null) {
  if (!(buyPrice > 0)) return 0;
  const ok = s => s - geTax(s, itemId) >= buyPrice;
  let s = Math.ceil(buyPrice / (1 - TAX_RATE));
  while (!ok(s)) s++;
  while (s > buyPrice && ok(s - 1)) s--; // rounding-down of tax can allow a slightly lower price
  const capped = buyPrice + TAX_CAP; // once the cap applies, tax is a flat 5m
  if (ok(capped) && capped < s) s = capped;
  return s;
}

// ---------- Prices ----------
/** Mid price from a /latest entry. Falls back to whichever side exists. */
export function midPrice(p) {
  if (!p) return null;
  const { high, low } = p;
  if (high > 0 && low > 0) return (high + low) / 2;
  return high > 0 ? high : low > 0 ? low : null;
}

export function pctChange(now, base) {
  if (!(base > 0) || now == null) return null;
  return ((now - base) / base) * 100;
}

/** Rise needed (in %) to get from `now` back to `base`. A 30% drop needs ~42.9%. */
export function riseNeeded(now, base) {
  if (!(now > 0) || !(base > 0)) return null;
  return ((base - now) / now) * 100;
}

/** Gold you can put to work in one 4-hour buy-limit window. */
export function capacityPer4h(limit, price) {
  if (!(limit > 0) || !(price > 0)) return null;
  return limit * price;
}

// ---------- Positions ----------
/** Value and P/L of holding `qty` bought at `avgCost` if sold at `sellPrice` now. */
export function positionPnL({ qty, avgCost, itemId = null }, sellPrice) {
  if (!(qty > 0) || !(sellPrice > 0)) return null;
  const cost = qty * avgCost;
  const gross = qty * sellPrice;
  const tax = qty * geTax(sellPrice, itemId);
  const net = gross - tax;
  const pnl = net - cost;
  return { cost, gross, tax, net, pnl, roi: cost > 0 ? (pnl / cost) * 100 : null };
}

/** Add a buy fill to a position, returning the new quantity and average cost. */
export function addFill(position, qty, price) {
  const oldQty = position.qty || 0;
  const newQty = oldQty + qty;
  const avgCost = newQty > 0 ? (oldQty * (position.avgCost || 0) + qty * price) / newQty : 0;
  return { qty: newQty, avgCost };
}

/** Realised result of selling `qty` from a position at `sellPrice`. */
export function closeTrade(position, qty, sellPrice) {
  const r = positionPnL({ qty, avgCost: position.avgCost, itemId: position.itemId }, sellPrice);
  return r && { ...r, qty, sellPrice, buyAvg: position.avgCost };
}

// ---------- Recovery scenarios ----------
/** Price if the item claws back `fraction` (0–1) of the gap between `current` and `baseline`. */
export function recoveryPrice(current, baseline, fraction) {
  return current + fraction * (baseline - current);
}

/**
 * P/L table for buying `qty` at `entry` and selling after a partial recovery.
 * fractions: e.g. [0.5, 0.75, 1] → recovers 50%, 75%, 100% of the drop.
 */
export function recoveryScenarios({ entry, qty, current, baseline, itemId = null, fractions = [0.25, 0.5, 0.75, 1] }) {
  return fractions.map(f => {
    const sell = Math.round(recoveryPrice(current, baseline, f));
    const r = positionPnL({ qty, avgCost: entry, itemId }, sell);
    return { fraction: f, sell, ...r };
  });
}

/**
 * Rotation: sell something you hold now and buy something else.
 * Compares keeping the holding vs rotating into the target. Each row is one
 * recovery fraction for the target. The holding recovers the same fraction,
 * unless `holdFraction` is given — then it's fixed at that for every row
 * (e.g. a structural holding you expect to recover only 20% of its drop).
 * Positive `edge` means rotating wins.
 */
export function rotationScenario({ hold, target, fractions = [0.5, 0.75, 1], holdFraction = null }) {
  // hold:   { itemId, qty, current, baseline }
  // target: { itemId, current, baseline }
  const proceeds = netProceeds(hold.current, hold.qty, hold.itemId);
  const units = Math.floor(proceeds / target.current);
  const leftover = proceeds - units * target.current;
  return fractions.map(f => {
    const holdSell = Math.round(recoveryPrice(hold.current, hold.baseline, holdFraction ?? f));
    const targSell = Math.round(recoveryPrice(target.current, target.baseline, f));
    const keepValue = netProceeds(holdSell, hold.qty, hold.itemId);
    const rotateValue = netProceeds(targSell, units, target.itemId) + leftover;
    return { fraction: f, keepValue, rotateValue, edge: rotateValue - keepValue, units, proceeds };
  });
}

// ---------- Baskets ----------
/**
 * Basket index: 100 = baseline. Two weightings:
 *   "equal" — every item gets one vote: the geometric mean of now/baseline.
 *             One item tripling can't swamp the rest (good for a gauge like Raid demand).
 *   "value" — weighted by money: Σ qty·now ÷ Σ qty·baseline (blank qty counts as 1).
 *             Tracks what your actual position is worth (good for holdings or planned buys).
 * valueNow / valueBase only count members that have a quantity, whichever weighting.
 * Returns null index if no member has both prices.
 */
export function basketIndex(members, nowById, baseById, weighting = "value") {
  let logSum = 0, now$ = 0, base$ = 0, covered = 0, valueNow = 0, valueBase = 0;
  for (const m of members) {
    const now = nowById(m.itemId), base = baseById(m.itemId);
    if (!(now > 0) || !(base > 0)) continue;
    covered++;
    logSum += Math.log(now / base);
    const q = m.qty > 0 ? m.qty : 1;
    now$ += q * now; base$ += q * base;
    if (m.qty > 0) { valueNow += m.qty * now; valueBase += m.qty * base; }
  }
  let index = null;
  if (covered) index = weighting === "equal" ? Math.exp(logSum / covered) * 100 : (now$ / base$) * 100;
  return { index, covered, total: members.length, valueNow, valueBase };
}

/**
 * Basket index over time from each member's price history.
 * history: Map itemId → [{ t, p }] (any order). Each member's latest price at or
 * before t is carried forward. The series starts once every member with history
 * has a price, so the index doesn't jump when an item's data begins.
 * Returns [{ t, index }].
 */
export function basketIndexSeries(members, history, baseById, weighting = "value") {
  const withData = members.filter(m => (history.get(m.itemId) || []).some(x => x.p > 0));
  if (!withData.length) return [];
  const sorted = new Map(withData.map(m => [m.itemId, history.get(m.itemId).filter(x => x.p > 0).sort((a, b) => a.t - b.t)]));
  const start = Math.max(...[...sorted.values()].map(pts => pts[0].t));
  const times = [...new Set([...sorted.values()].flatMap(pts => pts.map(x => x.t)))].filter(t => t >= start).sort((a, b) => a - b);
  const cursor = new Map(), last = new Map();
  const out = [];
  for (const t of times) {
    for (const [id, pts] of sorted) {
      let i = cursor.get(id) ?? 0;
      while (i < pts.length && pts[i].t <= t) { last.set(id, pts[i].p); i++; }
      cursor.set(id, i);
    }
    const { index } = basketIndex(withData, id => last.get(id), baseById, weighting);
    if (index != null) out.push({ t, index });
  }
  return out;
}

// ---------- Series stats ----------
/** Linear-regression slope of a price series, as % of the mean per day. */
export function trendPctPerDay(points) {
  // points: [{ t: unixSeconds, p: price }]
  const pts = points.filter(x => x.p > 0);
  if (pts.length < 3) return null;
  const n = pts.length;
  const xs = pts.map(x => x.t / 86400), ys = pts.map(x => x.p);
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0 || my === 0) return null;
  return (num / den / my) * 100;
}

/** How many standard deviations `value` sits from the series mean. */
export function zScore(value, series) {
  const s = series.filter(x => x > 0);
  if (s.length < 3 || !(value > 0)) return null;
  const m = s.reduce((a, b) => a + b) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / (s.length - 1));
  return sd > 0 ? (value - m) / sd : null;
}

// ---------- Cash ----------
/**
 * Cash ledger: your manual entries (opening balance, deposits, withdrawals,
 * corrections, holding sales) plus every logged buy fill and sell.
 * Buys and sells are derived from positions and trades, never stored twice,
 * so editing a fill or trade can't leave cash out of sync.
 * Returns rows oldest → newest with a running balance.
 */
export function cashLedger({ entries = [], positions = [], trades = [] }) {
  const rows = [
    ...entries.map((e, i) => ({ date: e.date, at: e.at || "", kind: e.type, amount: e.amount, note: e.note || "", id: e.id, manual: true, order: 0, i })),
    ...positions.flatMap(p => (p.fills || []).map((f, i) => ({
      date: f.date, at: f.at || "", kind: "buy", amount: -f.qty * f.price, note: `${f.qty.toLocaleString()} × ${p.name}`, order: 1, i,
    }))),
    ...trades.map((t, i) => ({ date: t.closedAt, at: t.at || "", kind: "sell", amount: t.net, note: `${t.qty.toLocaleString()} × ${t.name}`, order: 2, i })),
  ];
  // Same day: by the time each was logged (`at`). Rows without a time (opening balances,
  // data from v0.1) go first, then manual → buys → sells.
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at) || a.order - b.order || a.i - b.i);
  let balance = 0;
  for (const r of rows) r.balance = balance += r.amount;
  return { rows, balance };
}

// ---------- Journal stats ----------
export function daysBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000));
}

/** Track record from closed trades, overall and grouped by a key (e.g. dip type). */
export function tradeStats(trades, groupBy = null) {
  const summarize = list => {
    const n = list.length;
    if (!n) return { n: 0 };
    const wins = list.filter(t => t.pnl > 0).length;
    const pnl = list.reduce((a, t) => a + t.pnl, 0);
    const cost = list.reduce((a, t) => a + t.cost, 0);
    const hold = list.reduce((a, t) => a + (t.holdDays || 0), 0);
    return { n, wins, winRate: (wins / n) * 100, pnl, roi: cost > 0 ? (pnl / cost) * 100 : null, avgHoldDays: hold / n };
  };
  if (!groupBy) return summarize(trades);
  const groups = {};
  for (const t of trades) {
    const k = groupBy(t) ?? "unset";
    (groups[k] ||= []).push(t);
  }
  return Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, summarize(v)]));
}
