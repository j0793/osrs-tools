# GE Market Analyzer — changelog

## 1.0.0 — 2026-10-22

Out of scaffold. No code changes from 0.5.0; this marks the version that is published and checked.

### Status
- Every gap listed under 0.1.0 is closed: the basket trend shipped in 0.4.0, and the price API's field names were confirmed by the data check (all `ok: true`). Backups are handled by Export/Import in Settings.
- Live data check passed on GitHub Pages; 18 logic tests pass.
- Saved data stays at schema 3, so nothing migrates.

### Planned
- Daily brief: a scheduled summary of signals, basket moves and open theses.
- Cyclical buys basket and thesis, when you're ready to buy.

## 0.5.0 — 2026-10-22

Theses can bet on "no recovery", and selling a holding is now a graded decision.

### Added
- **Thesis direction**: *Expect recovery* or *Expect no recovery*. For no recovery, the levels flip:
  - Sell if it bounces to ≥ entry → Sell zone
  - Played out at ≤ target → Watch
  - Wrong if ≥ invalidation → Invalidated
  Choosing the Structural dip type sets "Expect no recovery" automatically. Labels, rule names and chart lines follow the direction.
- **Edit theses**: title, dip type, direction, event, text, levels and review date.
- **Holding sales in the Journal**: the Sell form on a Holdings basket takes a thesis and, optionally, what you paid. Each sale is graded by what the item did after: "selling saved X so far" or "holding would be X better", using today's instant-sell price after tax. Reviewable like trades.
- Journal figures: Holdings sold, Sales right so far, Saved vs holding. Thesis cards show Sales vs holding.
- Chart lines are coloured by the signal they raise (green buy, gold sell, red wrong, blue watch).
- Tests for decline theses and sell-decision grading.

### Fixed
- Amounts just under a unit showed as "1000.0k" or "1000m"; they now read 1.0m and 1.00b.

### Changed
- Holding sales are stored as trades (kind "holding_sale") instead of cash entries. Cash totals are unchanged.
- Trade stats only count sells with a known cost; a holding sold without "paid each" is graded by the sell decision instead.

### Migration
- Schema 2 → 3 on first load: holding sales logged in v0.4 become journal entries. Their price per item is worked back from the after-tax amount and can be 1 gp off.
- Existing theses keep working as "Expect recovery".

## 0.4.0 — 2026-10-22

Baskets get history, a trend, and are easier to build and manage.

### Added
- **Basket index chart**: the index over the last 30 days, with 100 = baseline, your events, and each open thesis's entry, target and invalidation lines.
- **Basket trend**: slope of the index over the last 7 days, % per day. Usable in rules (e.g. "Raid demand trend ≤ 0 → Watch"). Baskets with a trend rule load their history at startup so signals work on every page.
- **Edit basket**: rename, change type (Watch / Holdings), notes, and index weighting.
- **Index weighting** per basket:
  - *Equal*: geometric mean, every item one vote; one outlier can't swamp the index. Default for Watch baskets.
  - *By value*: Σ qty × now ÷ Σ qty × baseline, blank qty counts as 1. Default for Holdings.
- **Add several at once** in a basket: paste one item per line, optional `, qty`. Names that don't match are listed.
- **Multi-select in the Screener**: tick items (or all shown) and add them to any basket in one go.
- Tests for both weightings, the outlier case, and the index series.

### Fixed
- In baskets mixing items with and without a quantity, items without one were effectively ignored (weight 1 gp vs millions). Blank quantity now counts as 1 under By value.

### Changed
- Watch baskets now default to Equal weighting, so their index values will shift from v0.3.0. Switch to By value under Edit to get the old behaviour.
- Baseline line on charts is grey, so it isn't confused with a thesis target.
- A failed history load waits for Refresh prices instead of retrying on every screen update.

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
