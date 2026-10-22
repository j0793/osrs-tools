// rules.js — turns your theses and rules into signals.
// Pure functions: the app hands in a "context" with prices already looked up.
//
// A rule = a name, a target (basket or item), the signal it raises, and one or
// more conditions that must ALL pass. A thesis automatically produces three
// rules from its levels (entry, target, invalidation); you can add custom ones.

export const SIGNALS = ["invalidated", "sell_zone", "buy_zone", "watch"]; // highest priority first
export const SIGNAL_LABEL = {
  invalidated: "Invalidated",
  sell_zone: "Sell zone",
  buy_zone: "Buy zone",
  watch: "Watch",
  hold: "Hold",
};

/**
 * Condition metrics. Each reads one number from the context for the rule's target.
 *   index       basket index (100 = baseline)            — baskets only
 *   pct_vs_base % change from baseline                    — items or baskets
 *   price       current mid price in gp                   — items only
 *   trend       % per day over recent history             — items or baskets
 *   vol_ratio   recent hourly volume ÷ baseline hourly    — items only
 *   roi         open position ROI % after tax             — items with a position
 */
export const METRICS = {
  index:       { label: "Basket index",            unit: "",   targets: ["basket"] },
  pct_vs_base: { label: "% vs baseline",           unit: "%",  targets: ["item", "basket"] },
  price:       { label: "Price",                   unit: "gp", targets: ["item"] },
  trend:       { label: "Trend % per day",         unit: "%",  targets: ["item", "basket"] },
  vol_ratio:   { label: "Volume vs baseline",      unit: "×",  targets: ["item"] },
  roi:         { label: "Position ROI after tax",  unit: "%",  targets: ["item"] },
};

const OPS = {
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "between": (a, b, c) => a >= Math.min(b, c) && a <= Math.max(b, c),
};
export const OP_LIST = Object.keys(OPS);

/** Rules generated from a thesis's levels. Levels are basket index values (100 = baseline). */
export function rulesFromThesis(thesis) {
  if (!thesis.basketId) return [];
  const t = { kind: "basket", id: thesis.basketId };
  const base = { thesisId: thesis.id, target: t, auto: true };
  const out = [];
  if (thesis.entryIndex != null)
    out.push({ ...base, id: `${thesis.id}:entry`, name: `${thesis.title}: in entry zone`, signal: "buy_zone",
      conditions: [{ metric: "index", op: "<=", value: thesis.entryIndex }] });
  if (thesis.targetIndex != null)
    out.push({ ...base, id: `${thesis.id}:target`, name: `${thesis.title}: target reached`, signal: "sell_zone",
      conditions: [{ metric: "index", op: ">=", value: thesis.targetIndex }] });
  if (thesis.invalidationIndex != null)
    out.push({ ...base, id: `${thesis.id}:invalid`, name: `${thesis.title}: invalidation hit`, signal: "invalidated",
      conditions: [{ metric: "index", op: "<=", value: thesis.invalidationIndex }] });
  return out;
}

/**
 * Evaluate one rule. `ctx.metric(target, metricName)` returns a number or null.
 * A condition with no data does not pass, and is reported as missing.
 */
export function evaluateRule(rule, ctx) {
  const details = rule.conditions.map(c => {
    const actual = ctx.metric(rule.target, c.metric);
    const fn = OPS[c.op];
    const pass = actual != null && fn ? fn(actual, c.value, c.value2) : false;
    return { ...c, actual, pass, missing: actual == null };
  });
  const fired = details.length > 0 && details.every(d => d.pass);
  return { rule, fired, details };
}

/** Evaluate every enabled rule and return results plus one overall signal per target. */
export function evaluateAll(rules, ctx) {
  const results = rules.filter(r => r.enabled !== false).map(r => evaluateRule(r, ctx));
  const byTarget = {};
  for (const r of results) {
    if (!r.fired) continue;
    const key = `${r.rule.target.kind}:${r.rule.target.id}`;
    const cur = byTarget[key];
    if (!cur || SIGNALS.indexOf(r.rule.signal) < SIGNALS.indexOf(cur)) byTarget[key] = r.rule.signal;
  }
  return { results, signalFor: (kind, id) => byTarget[`${kind}:${id}`] || "hold" };
}
