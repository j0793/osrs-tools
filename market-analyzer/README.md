# GE Market Analyzer

Finds Grand Exchange items trading below where they were before a game update, tracks what you buy and sell, and keeps a record of whether your calls were right.

Prices come live from the [OSRS Wiki Real-time Prices API](https://oldschool.runescape.wiki/w/RuneScape:Real-time_Prices). Everything you enter stays in your browser.

## How the pieces connect

```
Events ──► sets the baseline day (N days before the update)
   │
Screener ──► every item vs baseline: % change, volume, buy limit, break-even
   │           └─ Direction: dips (below), risers (above, inverse movers), or all
   │
Item page ──► history chart, recovery scenarios, log a buy
   │
Baskets ──► your groups of related items → index (100 = baseline)
   │           └─ Thesis: dip type, expectation, entry / target / invalidation
   │                 └─ becomes rules → signals: Buy zone, Sell zone, Invalidated, Watch
   │           └─ Custom rules on any basket or item
   │           └─ Holdings basket + rotation calculator (your liquidation list),
   │              with a separate expected recovery for the item you sell
   │
Portfolio ──► open positions, P/L after tax at instant-sell price
   │           └─ Cash ledger: opening + deposits/withdrawals + buys + sells + holding sales
   │
Journal ──► each sell gets a review → stats by dip type and by cause
```

## Files

| File | What it does |
|---|---|
| `js/calc.js` | All money math: GE tax, break-even, P/L, scenarios, rotation, basket index, trend, cash ledger, stats. Pure functions. |
| `js/rules.js` | Thesis levels → rules, rule evaluation, signal priority. Pure functions. |
| `js/api.js` | Every call to the price API, with field-name fallbacks and caching. |
| `js/store.js` | Saved data schema, load/save, export/import, the starter liquidation list. |
| `js/app.js` | Views, routing and the flow between them. |
| `tests/logic.test.mjs` | Checks calc.js and rules.js against hand-worked numbers. |

## Definitions

- **Price** (screener, baskets): mid of the latest instant buy and instant sell.
- **Sell now** (portfolio): latest instant-sell price — what you'd get dumping it immediately.
- **Baseline**: average of six hourly samples (00, 04, 08, 12, 16, 20 UTC) on the baseline day.
- **Volume ×**: average hourly volume over the last 4 hours ÷ the baseline day's. 1.0 is normal; well above 1 on a falling item means dumping is still happening.
- **Gold / 4h**: buy limit × price. How much you can actually put into one item per window.
- **Break-even**: lowest sell price that returns your cost after the 2% tax (5m cap per item).
- **Basket index**: 100 = baseline. Items with a quantity are weighted by baseline value; items without one count equally.
- **Cash**: your manual entries plus every logged buy (minus) and sell (plus, after tax). Buys and sells aren't stored as cash entries; they're read from positions and trades each time, so the two can't disagree.
- **Signal priority**: Invalidated beats Sell zone beats Buy zone beats Watch. No rule firing = Hold.

## Running the tests

```
cd market-analyzer
node --test tests/logic.test.mjs
```

## First run after publishing

1. Open **Settings → Run data check**. Every endpoint should say `ok: true`.
2. Open **Events**, add the update you're trading around with its date and type, and keep "Use as baseline" ticked.
3. Open **Baskets → Liquidation list** and fix any name marked in red (the exact in-game name).

## If prices don't load

The app calls the API straight from your browser. If the status bar shows a load error on every refresh:

- Run **Settings → Data check** and note which endpoint fails.
- If they all fail with a network error, the API is likely refusing cross-site browser requests. The fix is a tiny free proxy (for example a Cloudflare Worker) that forwards requests and adds the header; then change `API_BASE` in `js/api.js` to the proxy's address.
- If one endpoint works but numbers are blank, the field names differ from what `pick()` expects in `js/api.js`. Add the names the data check shows.
