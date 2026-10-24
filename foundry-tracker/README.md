# Giants' Foundry Planner

Plans Giants' Foundry trips for 99 Smithing as an ironman: which mithril and adamant items to buy from shops for each haul, what it costs, how many swords and how much XP it gives, and how much gold rune alching brings in to pay for it.

One file, `index.html`, with its styles and script inline. No build step.

## Sections

- **Furnace (goal)**: look up a username on Wise Old Man for current Smithing XP, set a goal level, see the level bar with a trip's XP and coins (set swords per trip, or hide it), swords to goal, and the mistakes-per-trip setting.
- **Alloy**: pick the mithril/adamant split per sword (20/8, 18/10, 16/12, 14/14, 12/16) and compare metal score, XP, cost, net gp and swords to goal for each. The rest of the page follows the split you pick.
- **Armory and Counter**: pick items for the haul, inventory space and overload slots, Load cheapest, Cost for X swords, and the haul's bars, cost, swords and XP.
- **Rune Treasury**: runite bars in, high alch gold out, after nature runes (Amlodd's, 180) and Blast Furnace coal (Ordan, 67, 4 per bar). Single item or Best mix, top 3 ranking, coal per inventory, swords the profit pays for, and runite rock spots outside the Wilderness in three distance columns.

## Data and network

- Saved in your browser under `gfp-v2`. Clearing site data resets it.
- The only network call is the Wise Old Man lookup (`api.wiseoldman.net/v2/players/<name>`), which allows calls from any site. Fonts come from Google Fonts.
- Shop prices, stock, high alch values and rock locations are written into the script. If Jagex changes a shop, edit the numbers there.

## Running locally

Double-click `index.html`, or from the repo root run `python -m http.server` and open `http://localhost:8000/foundry-tracker/`.
