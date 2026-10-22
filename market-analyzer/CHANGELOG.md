# GE Market Analyzer — changelog

## 0.3.0 — 2026-10-22

Screener no longer hides what you search for, and rotation handles structural vs cyclical items.

### Fixed
- Searching for an item that trades above its baseline (e.g. Inquisitor armor after the raid spike) returned nothing, because the "Only below baseline" filter ran before the search. The screener now says how many matches each filter is hiding, with a **Show all matches** link.

### Added
- **Direction** filter in the screener: Below baseline (dips), Above baseline (risers), or All. "Above" is how you find inverse movers. Switching direction re-sorts so the biggest move is first.
- **Holding recovers %** in the rotation calculator. Leave it blank to assume both items recover alike; set it when your thesis says the holding won't recover (structural) and the target will (cyclical).
- Tests for the separate holding recovery.

### Changed
- "Only below baseline" checkbox replaced by the Direction filter.
- Items with no baseline or volume now always sort to the bottom, whichever way a column is sorted.

## 0.2.0 — 2026-10-22

Cash is now tracked from your logs instead of being a fixed number.

### Added
- **Cash ledger** (Portfolio → Cash): opening balance, added gold, gold taken out, and "Set balance to…" corrections, with a running balance.
- Logged buys and sells flow into cash automatically. They're derived from your positions and trades, not stored twice, so cash can't drift out of sync.
- **Sell from Holdings**: a Sell button on each holdings item logs the sale, lowers its quantity and adds the after-tax gold to cash.
- Portfolio figures: Cash, Positions if sold now, Holdings if sold now, Total if all sold now.
- Buy form shows cash available; logging a buy warns if cash goes below zero.
- Test for the ledger's math and ordering.

### Changed
- Every new fill, sell and cash entry records the time it was logged, so same-day rows stay in the order they happened.
- Holdings with quantity 0 (sold out) stay listed for the record but are left out of the basket index.
- Settings no longer has a capital field.

### Migration
- Saved data moves from schema 1 to 2 on first load. The old capital setting becomes an opening-balance entry dated before your first logged buy. Older exports still import.

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
