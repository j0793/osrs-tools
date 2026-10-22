// Run from the market-analyzer folder:  node --test tests/
// Checks the money math and rule engine with hand-worked numbers.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../js/calc.js";
import * as R from "../js/rules.js";
import { averageSamples } from "../js/api.js";

test("GE tax: 2%, rounded down, capped at 5m, zero under 50 gp", () => {
  assert.equal(C.geTax(49), 0);
  assert.equal(C.geTax(50), 1);
  assert.equal(C.geTax(1_234_567), 24_691);
  assert.equal(C.geTax(250_000_000), 5_000_000);
  assert.equal(C.geTax(900_000_000), 5_000_000);
  assert.equal(C.geTax(5_000_000, 13190), 0); // bond exempt
});

test("break-even sell covers cost after tax", () => {
  for (const buy of [100, 9_999, 1_000_000, 37_250_000, 244_999_999, 300_000_000, 1_400_000_000]) {
    const s = C.breakEvenSell(buy);
    assert.ok(s - C.geTax(s) >= buy, `sell ${s} covers ${buy}`);
    assert.ok((s - 1) - C.geTax(s - 1) < buy, `sell ${s - 1} should not cover ${buy}`);
  }
  assert.equal(C.breakEvenSell(300_000_000), 305_000_000); // flat 5m above the cap
});

test("a 30% drop needs ~42.9% to recover", () => {
  assert.equal(C.riseNeeded(70, 100).toFixed(1), "42.9");
});

test("position P/L and fills", () => {
  const pos = { qty: 10, avgCost: 1_000_000 };
  const r = C.positionPnL(pos, 1_200_000);
  assert.equal(r.tax, 240_000);
  assert.equal(r.pnl, 12_000_000 - 240_000 - 10_000_000);
  const merged = C.addFill(pos, 10, 800_000);
  assert.deepEqual(merged, { qty: 20, avgCost: 900_000 });
});

test("recovery scenarios: buy at the low, sell at partial recoveries", () => {
  const rows = C.recoveryScenarios({ entry: 70_000_000, qty: 1, current: 70_000_000, baseline: 100_000_000, fractions: [0.5, 1] });
  assert.equal(rows[0].sell, 85_000_000);
  assert.equal(rows[0].pnl, 85_000_000 - 1_700_000 - 70_000_000);
  assert.equal(rows[1].sell, 100_000_000);
  assert.equal(rows[1].pnl, 100_000_000 - 2_000_000 - 70_000_000);
});

test("rotation: selling a flat holding into a dipped item", () => {
  const [full] = C.rotationScenario({
    hold: { itemId: 1, qty: 1, current: 500_000_000, baseline: 500_000_000 },
    target: { itemId: 2, current: 7_000_000, baseline: 10_000_000 },
    fractions: [1],
  });
  assert.equal(full.proceeds, 495_000_000);
  assert.equal(full.units, 70);
  assert.ok(full.edge > 0);
});

test("rotation with a fixed recovery for the holding (structural vs cyclical)", () => {
  const hold = { itemId: 1, qty: 1, current: 397_000_000, baseline: 468_000_000 }; // Elysian-like
  const target = { itemId: 2, current: 146_000_000, baseline: 168_000_000 };       // Torva-body-like
  const same = C.rotationScenario({ hold, target, fractions: [0.75] })[0];
  const fixed = C.rotationScenario({ hold, target, fractions: [0.75], holdFraction: 0.2 })[0];
  assert.equal(fixed.rotateValue, same.rotateValue);           // target side unchanged
  assert.ok(fixed.keepValue < same.keepValue);                  // holding recovers less
  assert.equal(fixed.keepValue, C.netProceeds(Math.round(397_000_000 + 0.2 * 71_000_000), 1, 1));
  assert.ok(fixed.edge > same.edge);
});

test("basket index: equal (geometric) vs by value", () => {
  const now = { 1: 80, 2: 50 }, base = { 1: 100, 2: 100 };
  const eq = C.basketIndex([{ itemId: 1 }, { itemId: 2 }], id => now[id], id => base[id], "equal");
  assert.equal(eq.index.toFixed(2), (Math.sqrt(0.8 * 0.5) * 100).toFixed(2)); // 63.25
  const w = C.basketIndex([{ itemId: 1, qty: 3 }, { itemId: 2, qty: 1 }], id => now[id], id => base[id], "value");
  assert.equal(w.index, 72.5);
  assert.equal(w.valueNow, 290);
  const blankQty = C.basketIndex([{ itemId: 1 }, { itemId: 2, qty: 1 }], id => now[id], id => base[id], "value");
  assert.equal(blankQty.index, 65); // blank qty counts as 1, not ignored
  const missing = C.basketIndex([{ itemId: 1 }, { itemId: 9 }], id => now[id], id => base[id], "equal");
  assert.equal(missing.covered, 1);
});

test("equal weighting keeps one outlier from swamping a gauge", () => {
  // Tonalztics-style outlier: +212% next to four items up ~10%
  const ratios = { 1: 3.12, 2: 1.1, 3: 1.1, 4: 1.1, 5: 1.1 };
  const members = Object.keys(ratios).map(id => ({ itemId: Number(id) }));
  const arith = C.basketIndex(members, id => ratios[id] * 100, () => 100, "value").index;   // 150.4
  const geo = C.basketIndex(members, id => ratios[id] * 100, () => 100, "equal").index;     // ~136
  assert.ok(geo < arith && geo > 110);
});

test("basket index series carries prices forward and starts when all members have data", () => {
  const history = new Map([
    [1, [{ t: 100, p: 100 }, { t: 300, p: 80 }]],
    [2, [{ t: 200, p: 100 }, { t: 400, p: 120 }]],
  ]);
  const s = C.basketIndexSeries([{ itemId: 1 }, { itemId: 2 }], history, () => 100, "value");
  assert.deepEqual(s.map(x => x.t), [200, 300, 400]); // starts at 200, when item 2 begins
  assert.deepEqual(s.map(x => Math.round(x.index)), [100, 90, 100]);
});

test("trend is ~0 for a flat series and negative for a falling one", () => {
  const flat = [0, 1, 2, 3].map(d => ({ t: d * 86400, p: 100 }));
  assert.equal(C.trendPctPerDay(flat), 0);
  const falling = [0, 1, 2, 3].map(d => ({ t: d * 86400, p: 100 - d * 5 }));
  assert.ok(C.trendPctPerDay(falling) < -5);
});

test("trade stats group by dip type", () => {
  const trades = [
    { pnl: 10, cost: 100, holdDays: 4, dipType: "cyclical" },
    { pnl: -5, cost: 100, holdDays: 10, dipType: "structural" },
    { pnl: 20, cost: 100, holdDays: 6, dipType: "cyclical" },
  ];
  const all = C.tradeStats(trades);
  assert.equal(all.n, 3);
  assert.equal(all.wins, 2);
  const by = C.tradeStats(trades, t => t.dipType);
  assert.equal(by.cyclical.roi, 15);
  assert.equal(by.structural.winRate, 0);
});

test("thesis levels become rules; priority picks the strongest signal", () => {
  const thesis = { id: "t1", basketId: "b1", title: "Melee dip", entryIndex: 75, targetIndex: 95, invalidationIndex: 60 };
  const rules = R.rulesFromThesis(thesis);
  assert.equal(rules.length, 3);

  const at = index => ({ metric: (target, m) => (m === "index" ? index : null) });
  assert.equal(R.evaluateAll(rules, at(72)).signalFor("basket", "b1"), "buy_zone");
  assert.equal(R.evaluateAll(rules, at(58)).signalFor("basket", "b1"), "invalidated"); // also <= 75, invalidated wins
  assert.equal(R.evaluateAll(rules, at(97)).signalFor("basket", "b1"), "sell_zone");
  assert.equal(R.evaluateAll(rules, at(85)).signalFor("basket", "b1"), "hold");
});

test("a condition with missing data never fires", () => {
  const rule = { id: "r", target: { kind: "item", id: 1 }, signal: "watch", conditions: [{ metric: "trend", op: ">=", value: -0.5 }] };
  const r = R.evaluateRule(rule, { metric: () => null });
  assert.equal(r.fired, false);
  assert.equal(r.details[0].missing, true);
});

test("cash ledger: opening + buys + sells + holding sale, in date order", () => {
  const { rows, balance } = C.cashLedger({
    entries: [
      { id: "o", date: "2026-10-22", type: "opening", amount: 900_000_000 },
      { id: "h", date: "2026-10-24", type: "holding_sale", amount: 49_000_000 },
    ],
    positions: [{ name: "Torva platebody", fills: [{ date: "2026-10-22", qty: 1, price: 370_000_000 }] }],
    trades: [{ name: "Torva platebody", qty: 1, net: 445_000_000, closedAt: "2026-10-23" }],
  });
  assert.deepEqual(rows.map(r => r.kind), ["opening", "buy", "sell", "holding_sale"]);
  assert.equal(rows[1].balance, 530_000_000);
  assert.equal(balance, 900_000_000 - 370_000_000 + 445_000_000 + 49_000_000);
});

test("hourly samples average into a baseline", () => {
  const s1 = new Map([[1, { avgHigh: 110, avgLow: 90, volHigh: 5, volLow: 5 }]]);
  const s2 = new Map([[1, { avgHigh: 130, avgLow: 110, volHigh: 10, volLow: 0 }]]);
  const out = averageSamples([s1, s2]);
  assert.equal(out.get(1).price, 110);
  assert.equal(out.get(1).hourlyVolume, 10);
});
