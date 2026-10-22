# GE Market Analyzer — changelog

## 0.1.0 — 2026-10-22

First scaffold. Logic and flow are in place for review; expect rough edges.

### Added
- **Screener**: every traded item against a baseline day, with % change, rise needed to recover, volume vs normal, buy limit, gold per 4-hour window and after-tax break-even.
- **Item page**: price history chart with baseline, event and trade markers; recovery scenarios at 25/50/75/100%; what-if price; log buys.
- **Baskets**: user-defined groups with a value-weighted index (100 = baseline), what-if mode, and a **Holdings** type seeded with the liquidation list.
- **Rotation calculator** for holdings: sell an item you own and buy a dipped one, compared at equal recovery.
- **Theses**: dip type, expectation, reasoning, entry/target/invalidation levels that become rules automatically, close with a verdict.
- **Rules**: custom conditions on index, % vs baseline, price, trend, volume or position ROI, producing Buy zone / Sell zone / Invalidated / Watch signals.
- **Portfolio**: open positions valued at instant-sell after tax, capital deployed and free, realized and unrealized P/L.
- **Journal**: every sell with a review (expected, actual, right, wrong, main cause) and stats by dip type and by cause.
- **Events**: update log with a type flag; the active event sets the baseline.
- **Settings**: capital, baseline offset, export/import JSON backup, API data check.
- Logic tests for tax, break-even, P/L, scenarios, rotation, basket index, trend, stats and rules (`node --test tests/logic.test.mjs`).

### Known gaps
- Basket trend metric is not built (item trend works once its history is loaded).
- Some v2 API field names are undocumented; run Settings → Data check after publishing.
- Data lives in one browser; use Export/Import to move it.
