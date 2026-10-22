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

/**
 * What a thesis's three levels mean, by direction. Levels are basket index values (100 = baseline).
 *   recover — you expect the basket to climb back:
 *     entry ≤ → Buy zone · target ≥ → Sell zone (take profit) · invalidation ≤ → Invalidated
 *   decline — you expect it NOT to recover (structural / displaced):
 *     entry ≥ → Sell zone (sell into a bounce) · target ≤ → Watch (decline played out, reassess)
 *     · invalidation ≥ → Invalidated (it recovered after all)
 */
export const THESIS_DIRECTIONS = {
  recover: {
    label: "Expect recovery",
    entry:   { op: "<=", signal: "buy_zone",    name: "in entry zone",          short: "Buy at ≤" },
    target:  { op: ">=", signal: "sell_zone",   name: "target reached",         short: "Take profit at ≥" },
    invalid: { op: "<=", signal: "invalidated", name: "invalidation hit",       short: "Wrong if ≤" },
  },
  decline: {
    label: "Expect no recovery",
    entry:   { op: ">=", signal: "sell_zone",   name: "bounced into sell zone", short: "Sell if it bounces to ≥" },
    target:  { op: "<=", signal: "watch",       name: "decline played out",     short: "Played out at ≤" },
    invalid: { op: ">=", signal: "invalidated", name: "recovered — thesis wrong", short: "Wrong if ≥" },
  },
};

export const directionOf = thesis => (thesis.direction === "decline" ? "decline" : "recover");

/** Rules generated from a thesis's levels, following its direction. */
export function rulesFromThesis(thesis) {
  if (!thesis.basketId) return [];
  const d = THESIS_DIRECTIONS[directionOf(thesis)];
  const base = { thesisId: thesis.id, target: { kind: "basket", id: thesis.basketId }, auto: true };
  return [["entry", thesis.entryIndex], ["target", thesis.targetIndex], ["invalid", thesis.invalidationIndex]]
    .filter(([, v]) => v != null)
    .map(([k, v]) => ({
      ...base, id: `${thesis.id}:${k}`, name: `${thesis.title}: ${d[k].name}`, signal: d[k].signal,
      conditions: [{ metric: "index", op: d[k].op, value: v }],
    }));
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
