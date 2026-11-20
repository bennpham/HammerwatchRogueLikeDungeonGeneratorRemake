# Boot checklist

These are things the generator emits that only playing can confirm. The tests prove that the levels are well formed and wired. They can't prove that the game behaves the way the wiring intends.

**How to use it:** build the campaign each row names in the app, then **Install** it into Hammerwatch. Pick the campaign in game, play it, and set each row's status:

- `CONFIRMED <date>` when it works;
- `BROKEN <date>: what happened` when it doesn't, with the relevant lines of the game's log.

Each confirmed row goes into `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` as `[VERIFIED]` and is promoted to `ASSET-REGISTRY.md` (CLAUDE.md, "Skill maintenance protocol"). Rows that predate this file are already recorded in the DISCOVERY-LOG and are not repeated here.

The in-game questions that decide how World mode is built (D1–D10) are in `docs/discovery/world-mode.md`. `scripts/probe-world.mjs` builds their probe levels.

## World mode (`docs/plans/world-mode.md`, `world-mode-terrain.md`)

| # | Feature | How to check | Status |
|---|---|---|---|
| W1 | Loads | A campaign whose first slot is `W1` starts on the island at the arrival, with no log errors. | UNCHECKED |
| W2 | Coast closes | Walk the whole shore of a desert island, pushing outward at outer corners, inner corners, straights, inlets and necks. There must be no way off. Shots stop at the cliffs or fly over them; note which. | UNCHECKED |
| W3 | Coast look | The theme h cliffs read as a coast. Band tiles with water beneath them and the `h_h_8_up` corners look acceptable. | UNCHECKED |
| W4 | Size and cost | Note the load time and frame rate at 128, 240 and 512 tiles. The app stays responsive while it generates, and a generation cancelled halfway leaves nothing behind. Above 240 is untested ground: record what happens. | UNCHECKED |
| W5 | Portal | The portal is closed on arrival. After the last objective, "The portal has opened!" shows, the portal animates, and walking in leads on. It is red when a fight follows and blue otherwise. | UNCHECKED |
| W6 | Countdown | Each button press and each boss kill announces "N objectives remain". | UNCHECKED |
| W7 | World last | Put `W1` last. There is no portal. At zero the orb appears 3 tiles north of the centre, clear of the arrival, and picking it up ends the run. Before zero it cannot be seen, picked up or bumped into. Try a bare start and a camp start. | UNCHECKED |
| W8 | Bosses | Several bosses on one island: the count drops once per kill, and the portal waits for the last kill. Note how the boss bars behave when the bosses are far apart. | UNCHECKED |
| W9 | Ambushes | A tripwire springs one ring of monsters round the party, once. With the button ambush at 100%, each button does the same. Spawned monsters attack at once and none is stuck in a rock or on a cliff tile. | UNCHECKED |
| W10 | Packs and loot | Packs wait round the island, and coins lie in caches on reachable ground. | UNCHECKED |
| W11 | Mystery | Each plate fires once, and its trap spewers switch off. Disguised buttons look like plates and still count. | UNCHECKED |
| W12 | Timer, music | The countdown runs, and after it the island hurts. The chosen track plays. | UNCHECKED |
| W13 | Camp start | A camp start puts the cart, signpost, basket, carpets and two lit torches round the arrival. None of them blocks the portal or the arrival. | UNCHECKED |
| W14 | Checkpoints | With per-objective checkpoints on, die after finishing an objective. The party comes back at the arrival, not at the level start of an earlier save. | UNCHECKED |
| W15 | Oasis, dry grass, frozen | One world of each. The rock canyon edge closes all the way round and reads as a clearing. The patches, trails and scatter suit the biome. Lighting is acceptable with shadows on and off. | UNCHECKED |
| W16 | Plateaus: stairs | Use **Hills** or **Highlands** on oasis or dry grass. The party climbs only at the stairways: south flights, recessed north flights and side flights. Monsters use the stairs too. | UNCHECKED |
| W17 | Plateaus: closed rims | Walk round each plateau, on top and below. The party cannot step up or down a rim at any corner or beside a stairway. Shots cross the rims. A site on a plateau is reached by its stairs. | UNCHECKED |
| W18 | Plateau looks | The kerbs and stairs read as terraces. The plateau top's own ground looks right beside the low ground. Note whether the party can stand on the face art below a south rim. | UNCHECKED |
| W19 | Mesas | On desert and frozen, walk the whole ring of one mesa. There must be no leak, and nothing spawns inside one. | UNCHECKED |
| W20 | World presets | The **Explorer**, **Treasure hunt**, **Monster island** and **Speedrun** shortcuts each build an island that plays as its name says. | UNCHECKED |

## Campaign Mode (`docs/plans/campaign-mode.md`)

| # | Feature | How to check | Status |
|---|---|---|---|
| C1 | The tier lock | In **Castle Campaign**, the first town on the castle bridge sells only tier 1 of each skill vendor, plus the power shop. Each later town adds one tier, and the town before the dragon sells all five. A shop room on a floor may sell a tier ahead; that is intended. | UNCHECKED |
| C2 | Portals between acts | The portal out of a town before a fight is red. The portal out of an arena leads to the next act's first floor, and the last arena ends the run on the orb. | UNCHECKED |
| C3 | The same town each act | Returning to the castle bridge (or the bazaar) after each act reads as coming back with more to buy, not as a repeat. At each town the gold buys some, but not all, of the new tier. | UNCHECKED |
| C4 | Desert's opening island | In **Desert Campaign**, the party leaves the bazaar onto a 128-tile desert island with three buttons and no boss. Pressing all three opens the blue portal down into the caves. | UNCHECKED |
| C5 | Full runs | Play each Campaign Mode preset once to the end (roadmap exit criterion 7). | UNCHECKED |

## Open-world presets (`docs/plans/open-world-presets.md`)

| # | Feature | How to check | Status |
|---|---|---|---|
| O1 | The Lost Entrance | The disguised buttons can't be told from the plates. Each real press counts down, and the blue portal leads down to the caves. | UNCHECKED |
| O2 | Breakout | The stairs out of floor 2 arrive at the island's centre. The island's timer leaves enough time on a first attempt. Its portal leads to the escape floor, which ends on the orb. | UNCHECKED |
| O3 | Manhunt | Several bosses wait on each island with no trails. Each can be found in reasonable time, and the portal opens on the last kill. | UNCHECKED |
| O4 | Archipelago | Four islands, one per biome, each with its own monsters. Every portal arrives where it should. The last island's final objective brings the orb. | UNCHECKED |
| O5 | Surface and Depths | It opens on the island with no town before it. Each island's portal leads down to its floor, and each floor's stairs come up at the next island's centre. | UNCHECKED |
| O6 | Storm Front | Three islands on shrinking clocks, with trails showing the way. The timers leave enough time on a first attempt. | UNCHECKED |
| O7 | Full runs | Play each open-world preset once to the end (roadmap exit criterion 7). | UNCHECKED |
