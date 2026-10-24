# Giants' Foundry Planner — changelog

Reconstructed from the build conversation ("OSRS smithing 99 giants foundry"). Times are US Eastern, from the message timestamps. Versions before 1.0.0 were assigned afterwards; the planner was a Claude artifact with no version numbers at the time. Each artifact update replaced the last on the same link, so earlier versions only exist as described here.

## 1.2.0 — 2026-10-24

### Added
- **Swords per trip** stepper above the level bar, from 1 to 12, default 4. The trip segment on the bar, the zoomed XP/coins lanes and the "trip takes you to" line all use it.
- **Show trip on the bar** toggle. It hides the trip segment, the zoom lens and the zoomed lanes; the level bar and the mistakes slider stay.
- Both settings are saved.

### Changed
- The header now states the split as a ratio, with what it gives: e.g. "18 mithril : 10 adamant bars per sword (9:5) · metal score 89 · 15,690 XP and 31,380 coins per perfect sword", with the shops on a second line.
- The mistakes slider scales with swords per trip: the max is 3 per sword, Fine is under 1 per sword, Bad under 2 per sword, then Blatant. At 4 swords that's the same 1–3 / 4–7 / 8+ as before. Mistakes above the new max are capped when you lower the trip.

## 1.1.0 — 2026-10-24

Choose the mithril/adamant split instead of always using 18/10.

### Added
- **Alloy** panel under the furnace with five splits: 20/8, 18/10, 16/12 (4:3), 14/14 and 12/16 (3:4). Click one to use it.
- Each card shows:
  - metal score
  - XP per sword and what Kovac pays
  - cheapest cost per sword
  - net gp per sword and net cost per XP
  - swords and net gp to your goal level
- Badges mark the split with the cheapest XP and the one with the most XP.
- Metal score is worked out with the OSRS Wiki formula instead of a fixed 89: 20/8 = 83, 18/10 = 89, 16/12 = 93, 14/14 = 95, 12/16 = 94.

### Changed
- Everything follows the chosen split:
  - the header line
  - Swords in inventory and its "Exactly X/Y" check
  - Load cheapest and the overload inventory
  - Cost for more swords
  - the goal's XP per sword, swords to level, and mistakes per trip
  - Swords funded in the Rune Treasury, which used a fixed 35,540 gp
- The chosen split is saved with your other settings. Existing saves start on 18/10, so nothing changes until you pick another.

## 1.0.0 — 2026-10-22

Moved into OSRS Tools and hosted on GitHub Pages.

### Added
- "← OSRS Tools" link back to the hub, and a page icon.

### Changed
- Served as a normal web page at `https://j0793.github.io/osrs-tools/foundry-tracker/` instead of a Claude artifact. The planner is otherwise identical to the artifact as of 2026-10-21 12:18.

### Migration
- Settings, haul, goal and username were saved in the artifact's own browser storage (`gfp-v2`). A different site can't read that, so the hosted page opens with the example haul. Re-enter your username, goal and inventory once.

## 0.17.1 — 2026-10-21 12:18

### Removed
- Coffer upkeep note under the Rune Treasury. You hop from a non-BF world onto a Blast Furnace world and smelt on arrival, so the coffer costs nothing. It was never in the figures, so no numbers change.

## 0.17.0 — 2026-10-21 12:07

Rune alching shows profit after supplies.

### Added
- **Coal price (Ordan)** field, default 67 gp. Ordan's price is flat and he stocks 100 per world.
- Coal counts at 4 per runite bar, the Blast Furnace's half of the usual 8.
- Per inventory: High alch − Nature runes − Coal = net. All-bars totals add Coal needed and Coal cost.
- Coal box: for your bars per inventory, the coal, gp, inventories of 27 and Ordan worlds it takes (27 bars → 108 coal · 7,236 gp · 4 inventories · 2 worlds).

### Changed
- Top-3 ranking, Best mix and Swords funded are all after nature runes and coal. Headline reads "gp net after supplies".

## 0.16.1 — 2026-10-20 22:41

### Changed
- Runite rocks in three columns: Close (4 spots, 9 rocks), Some walking (5 spots, 12 rocks), Long trip (3 spots, 4 rocks). Each column has its totals; spots with the most rocks first; per-card tags dropped. Columns stack on phones.

## 0.16.0 — 2026-10-20 (after 22:16)

The rune section becomes the Rune Treasury.

### Added
- Treasury styling: background of rune ore (#506C77) and gold coin stacks, rune-coloured plaque, stone buttons, brass Best mix, ledger panels with a gold top edge.
- Only the top 3 items are shown, with 1–2–3 badges, plus your picked item if it isn't in the top 3. **Show all 19** brings the full list back.
  - Single item: ranked by gp per inventory for your bar count.
  - Multiple items: ranked by gp per bar.

### Fixed
- "Nature runes (27) −5,454" was the natures for one inventory, priced at whatever nature price was set at the time, and read like a total. The per-inventory line is gone; the all-bars section now shows Nature runes needed and Nature rune cost for every bar.

### Changed
- Runite rocks moved under the shortened item list. Phone order: controls, results, rocks.

## 0.15.1 — 2026-10-20 22:02–22:06

### Changed
- Item icons redrawn in a faceted style (chosen as style D in a separate icon tester): Pauldrons (B1) for platebodies, Tassets (L2) for platelegs, Beaked (H2) for hammers.
- Metal colours: mithril #3F3F5D, adamant #455645.

## 0.15.0 — 2026-10-20 21:55

### Added
- **Armory**: the item picker as wooden chests on shelves, with stone buttons and a brass Load cheapest.
- **Counter**: the haul readout as tills under wooden banners.

## 0.14.0 — 2026-10-20 21:32–21:41

### Added
- Forge header: steel plate with rivets, etched "FOUNDRY PLANNER", rising embers.
- Furnace mouth with a magma border that wraps the XP bar; oathplate-red bricks; darker subtitle.

## 0.13.0 — 2026-10-20 20:57–21:17

### Added
- Goal header tiles and a big level bar. The trip shows as a two-lane segment (XP and coins) with a zoom lens and a slider.
- "Extra perfect swords" line: how many more perfect swords the goal takes.

## 0.12.0 — 2026-10-20 20:40–20:47

### Added
- The current trip's XP as a striped segment on the level bar.
- Mistakes per trip: Perfect (0), Fine (1–3), Bad (4–7), Blatant (8+). Each mistake costs 10 quality, and the XP and coin figures follow.

## 0.11.0 — 2026-10-20 20:09

### Added
- Rune alching: **Bars per inventory**, **Single item** / **Multiple items** modes, and **Best mix**, which picks the most profitable combination of items for your bars.

### Removed
- Rune "on hand" input.

## 0.10.0 — 2026-10-20 20:05

### Changed
- Runite rocks merged into the alching section.
- Dropped Charred, Deepfin, Isle of Souls, Isafdar and Tapoyauik spots: 12 spots, 25 rocks. Needs column removed.

## 0.9.0 — 2026-10-20 19:58

Clean-up.

### Removed
- Skirts and helms from the item list.
- "Sword N: +X bars" lines.

### Changed
- Bar totals in their own boxes; rune on-hand became a dropdown.
- Cost for X swords and Load cheapest moved into one plan panel.

## 0.8.0 — 2026-10-20 19:50

### Added
- **Overload inventory** box: plan with one less free slot.

## 0.7.1 — 2026-10-20 19:36–19:39

### Changed
- Pixel font dropped; text is Barlow in OSRS yellow (#ffff00). Wiki item sprites were considered and declined.
- "Swords to level" text on the goal box.

## 0.7.0 — 2026-10-20 19:30

### Added
- **Smithing goal**: look up your username on Wise Old Man for current XP, set a goal level, and see XP bars and a **To goal** button.

## 0.6.0 — 2026-10-20 19:14

### Added
- **Cost for X swords**: cheapest bars for a given number of swords.
- Silkscreen pixel font (replaced in 0.7.1).

## 0.5.1 — 2026-10-20 17:10–17:13

### Changed
- Load cheapest can go up to 99 swords, with a note when that's more than your slots hold. A separate "Most swords" button was added at 17:10 and removed again at 17:13.

## 0.5.0 — 2026-10-20 16:50

Rebuilt from scratch after the previous version broke.

### Added
- Inventory space stepper, haul readout and **Load cheapest**.
- Rune alching with nature runes at 180 from Amlodd's (Prifddinas), and rune on hand.
- Runite rocks list with the Wilderness left out: 17 spots, 36 rocks.

### Migration
- Saved under a new key (`gfp-v2`), so the earlier `gf-planner` save was not carried over.

## 0.4.0 — 2026-10-20 16:42

### Changed
- Tabs and Trip 2 removed; everything on one page.

### Added
- Persistent "This haul" bar.
- Cheapest-load tool.

## 0.3.0 — 2026-10-20 16:28

### Added
- Four tabs, including **Where to mine**: a runite rock guide (20 spots, 42 rocks).

## 0.2.0 — 2026-10-20 16:23

### Added
- **Rune alching** tab: ore → product → high alch chart, rune items on hand, slots taken.
- 16:14: a standalone `giants-foundry-planner.html` that opens by double-click, kept in step with the artifact from here on.

## 0.1.0 — 2026-10-20 15:51

First version: Giants' Foundry Load Planner.

### Added
- Trip 1 / Trip 2 tabs with item tiles and drawn icons, and "+ world stock" buttons.
- 18/10 packing logic for mithril and adamant loads.
- Spend with the 2% price creep per item bought; Kovac coins at 2× XP.
- Foundry overload slots, carry slots and mould score settings.
- Max swords per trip chart.
- Saved in the browser (`gf-planner`).

## Before the app — 2026-10-05 and 2026-10-16

Planning only, no code: shop sources and stock, the 18/10 warhammer method, cash and XP-per-hour estimates, two-sword loads and platelegs costs.
