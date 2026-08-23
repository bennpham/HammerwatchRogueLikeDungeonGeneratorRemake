# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Timer mode — a timed hazard per floor.** Give a floor a countdown and, when it runs out, the entire floor turns into a damage field: the party takes damage every few hundred milliseconds until they leave. The damage may be **negative**, which heals instead, so the same knob covers "this floor is on a clock" and "this floor patches you up". Monsters are never touched. Every floor is configured independently — countdown length, damage, frequency, and whether a `M:SS` countdown announces on screen — with a **Copy to floors below** button for the usual escalate-as-you-descend setup. A new **Timer mode** section sits under **Monster max counts** in the Dungeon tab; every floor is **off** by default, and a floor left off produces byte-identical XML to the pre-feature generator for the same seed. In `parameters.txt` this is `timerN=enabled|seconds|damage|freqMs|countdown`, written only for floors that have it on.
- **Boss invulnerability windows.** Every time the boss's health crosses 75%, 50% or 25% it becomes immortal for a configurable stretch — 30 seconds on every threshold by default, on every preset — while a `M:SS` countdown ticks down on screen. It solves two problems at once: a fully upgraded party could burst a boss down before the fight it was carrying ever happened, and because the three thresholds then fired within the same second, every wave tier's spawners switched on at once and the arena flooded badly enough to drop the game to a crawl. A new **Boss invulnerability** section sits between **Boss** and **Waves** in the Boss tab: one duration field by default, or one per threshold behind a "Set per threshold" switch; 0 seconds disables a single threshold and the section can be turned off entirely. In `parameters.txt` this is `bossInvuln` (`30,30,30`, a single value for all three, or `off`) and `bossInvulnCountdown`. Generated dungeon floors are byte-identical with it on or off — only `levels/boss.xml` changes.

### Fixed

- **Dead players stayed dead in the lobby, the boss prep room and the boss arena.** Only the numeric dungeon floors revived a player who died on the way in, so a co-op partner who died on the last floor arrived in the prep room dead and could not shop before the boss fight. All three rooms now emit the same one-shot `RespawnPlayers` rig the floors have always used — an `AreaTrigger` over the spawn point fires it once on arrival and a `ToggleElement` immediately disables the trigger, so dying mid-fight is still permanent. Generated dungeon floors are byte-identical; only the three extra level files change.

## [0.4.0]

### Added

- **Boss tab** — full campaign endpoint with three stages:
  - **Prep room** — a safe zone where the party gathers before facing the boss, with healing stations and light to recover from dungeon runs. Selectable with `bossprep` parameter.
  - **Boss arena** — a tailored combat space where all monster tiers can spawn as mini-bosses, configurable difficulty via scatter spawn modes (wall clusters, arena centre, arena edges) and wave timing. Includes pillars for cover and mixed theming.
  - **Victory condition** — win by defeating the boss, with the arena wired into the generation pipeline so campaigns play through from dungeon entrance to final victory.
  - Three new parameters: `boss` (enable/disable), `bossprep` (enable/disable), and `bossRoomTheme` (selectable theme for the arena).
  - `bossMonsterMultiplier` and `bossFoodMultiplier` for scaling monster spawns and food drops specific to the boss fight.

- **Alt-tileset overlay themes (c-tiles, d-carpet, f-frozen, etc.)** — visual variety by layering alternate tilesets on top of the base theme, giving players more themed progression within a campaign without creating new monster pools.

- **Mixed themes** — per-region and per-pattern floor mixing, allowing campaigns to blend two themes on the same floor for visual depth and variety. Controlled via `mixedThemes` parameter.

- **Reachability validation test** — ensures every generated dungeon floor is completeable by flood-filling from entrance to exit/orb/portal, accounting for wall art's two-row overhang. Rejected floors are automatically re-rolled up to 60 attempts.

- **Monster picker UI improvements**:
  - Collapsible monster groups for better organization in the picker.
  - Count hint (`#N`) showing how many of each type are in the current pool.
  - Paste/copy pools for easier sharing of monster configurations.
  - Slime variants regrouped for clarity.

- **Boss wave spawn modes** — scattered one-shot spawners with preset pools and arena themes, offering variety in how monsters enter the boss fight.

### Changed

- **Money cap removed from lobbies** — starting gold is now uncapped, allowing campaigns to gift any amount of gold in the lobby. Previously capped at 12,000 per player.

- **Boss arena preset tuned** — the "boss death" monster tier in arena waves now has balanced difficulty progression matching the updated presets.

### Fixed

- **Northern spawn stuck in north wall** — boss arena north wall no longer traps spawners, ensuring safe monster entry from all directions.

- **Dragon boss spawning inside wall** — dragon positioning corrected to avoid collision with the north wall during its spawn animation.

### Notes

- The boss arena is fully playable in game (Hammerwatch 1.41). All monster tiers spawn, corpse passability allows free movement through defeated enemies, and the victory condition lands the player back in the main menu. The arena scales from a 5-monster gauntlet to a complex multi-tier challenge depending on campaign settings.
  - Do note you might want to kill off the monsters while fighting the boss vs ganking the boss in one go causing a giant spawn to rush to extraction otherwise it's you vs lag
- Monster pool tiers now include a dedicated boss-arena tier, keeping early-dungeon and boss-fight difficulty separate so campaigns can tune the endgame independent of lobby and regular floors.



## [0.3.0]

### Added

- **Campaign presets** — three curated starting templates simplify setup for new players:
  - **Castle** (7 floors, default) — the classic balanced layout with four thematic dungeon tiers and mixed monster types that ramp smoothly. Intended as the reference difficulty; tuned for parties playing cautiously through all upgrades.
  - **Desert** (5 floors) — daytime ruins with a guard-heavy palette from the desert theme. Rebalanced for tougher early combat with adjusted spawn limits reflecting that theme's monster pool.
  - **Bonus Gauntlet** (5 floors) — a compact gauntlet run skipping the default's extra floors, good for speedrun or high-difficulty testing.
  - All three are selectable from a new dropdown in the header and can be imported via `campaignPreset=` parameter. Existing seeds preserve their custom settings unchanged.

- **Monster filtering by Hammerwatch act** — the monster pool editor now groups monsters by the acts they appear in (Act 1, Act 2, etc.), making it clearer which types are thematically appropriate for each difficulty tier. The full roster remains available; filtering is purely organizational in the UI.

- **Lock final room option** — new `lockFinalRoom` parameter gates the victory orb behind a gold door at the end of a dead-end corridor, forcing players to choose between safety and treasure. Enabled by default for added challenge. When locked:
  - A gold door replaces the final room's front passage
  - Gold keys are matched to the generated doors so players can actually reach the orb
  - The victory condition and level flow remain intact; you're just adding a small detour

- **New monster types:**
  - **`skeleton3`** — a fast melee swarm skeleton (20 HP, 8 damage, speed 1.1) from stock levels 10 and 11, and what `lich_3` summons. Versus the vanilla `skeleton1` (40 HP, 20 damage, speed 0.4), it trades survivability for speed and crowd potential. Capped at 100; playtested at double that they swarm and overrun a party long before frame rate becomes a concern. Opt-in from the monster pool editor or `monstersN=` parameter.
  - **`tower_empty`** — the empty battlement, a 450-HP obstacle with no attack skills and full 32×32 blocking collision. Suitable for walling off passages and creating terrain features. Defaults to 0 pool weight since it does not attack.

- **New theme: Desert outdoors (theme_h)** — a daytime ruins aesthetic expanding the desert campaign tier. Includes custom wall tilemaps and doodad placement that fit a sun-baked exterior. Visual overlap tuned so corner artifacts from adjacent themes don't leak through.

- **Bonus themes (bonus1–5)** — five extra theme variants with corrected wall collision behavior and fixed stair alcove placement, allowing more terrain variety within a campaign.

- **Monster roster audit** — introduced a guard test that validates every actor path in `MONSTER_TYPES` against `tests/fixtures/actor-paths.txt`, a committed snapshot of the game's actor folder. Previously nothing verified that an enabled monster type pointed to a file the game actually has. This catches actor path typos and vanished actors immediately.

- **Lobby tab** — a prebuilt starting level where the party spawns into a safe room with five upgrade vendors arranged in a row, optional starting gold on the floor, and a teleport portal down to the dungeon. Enabled by default with no gold, so new users see a shop and spawn room rather than jumping straight into configuration. Features:
  - **Per-column shop control:** each vendor stall can independently show any subset of its columns (21 total across five shops), with all/none toggles. Vendors with no columns selected are removed from the level entirely.
  - **Starting gold in increments of 500:** gold is spawned as red diamonds, filling the 12 floor slots and stacking beyond. Stack depth capped at 12,000 (confirmed to pay out in-game, two diamonds per slot).
  - **Upgrade impact preview:** each column displays how many upgrades it actually contains after the Player tab's edits. A column the Player tab has emptied raises a single advisory warning rather than blocking the generation.
  - **Three new parameters:** `lobby` (enable/disable), `lobbyGold` (amount), `lobbyShops` (space-separated column list).

- **`GeneratedFile.encoding`** — campaign files can now carry binary content as base64, allowing a lobby template with custom non-stock artwork to be embedded. The generator still returns strings only (no Node I/O, maintaining purity); encoding and decoding happen at the pack/write boundary.

### Changed

- **Monster pool editor now sorts alphabetically** — categories and max-count table list types by name, not append order. `MONSTER_TYPES` is append-only for compatibility, so newly added types used to land at the bottom of their group regardless of name. Both lists now sort through the same path and hide deprecated types.

- **`levels.xml` start point moves with the lobby** — when enabled, the lobby ships as level `"lobby"` and becomes the start; dungeon levels keep their numbered ids. This ensures that existing seeds produce byte-identical output whether the lobby is on or off (verified by test).

- **Default starting gold raised to 10,000** — campaigns now start with 10k gold on the ground instead of the original lower amount, giving players more flexibility in their opening upgrade choices.

- **Tileset definitions refined** — wall and floor tilesets are now more clearly defined per theme, reducing visual ambiguity and improving consistency across the desert and bonus theme variants.

### Fixed

- **`tower_archer2` emitted a non-existent actor path.** The type pointed at `actors/tower_battlement_archer_2.xml`, which the game never shipped — Hammerwatch only has battlement archer variants 1 and 3. Enabling it wrote an unresolvable path into the level. Now repointed to `tower_battlement_empty` and hidden from the GUI in favour of `tower_empty`, but the id deliberately survives so existing `parameters.txt` files with `maxTowers_Archer2` keep loading.

- **Theme_h (desert outdoors) corner artifacts removed** — adjusted visual overlap so corner tilemaps from adjacent themes no longer leak through during level generation.

### Notes

- **The lobby is verified in game** (Hammerwatch 1.41, Windows, real Steam install). Walls enclose the room — the full perimeter was walked and there is no way out; torches and lighting render; every stall and vendor doodad renders; diamond pickups pay out at 0, 1500 and 12,000 gold; deselecting a vendor's every column removes it cleanly; and the exit teleport lands the party in dungeon level 0. The committed template is the Dreadmann Mansion `levels/test_lobby.xml` imported verbatim by `scripts/import-lobby-assets.mjs`, and the 10 campaign-local files it needs ride along in `LOBBY_ASSETS` — which also confirms that a campaign can ship its own doodads and textures and have them render. Note that starting gold is a per-player figure: each player keeps their own purse, and one player walking over the diamonds credits the full amount to everyone, so the configured number is what *every* player starts with regardless of party size.
- Campaign presets can be reconfigured from the preset dropdown after selection, so they serve as starting points rather than locked-in templates.

## [0.2.0] - 2026-07-30

### Added

- **All characters** on the Player tab: bulk-edit the whole roster instead of
  walking ~1,400 individual fields. *Enemy difficulty* stays a top-level sibling;
  the roster-wide knobs and all eight player files live inside this one section, so
  a quick setup never has to scroll past seven class accordions
  - A master `×` knob plus one per stat group (health, mana, damage, defense,
    utility, costs) that scales each starting stat **and every upgrade tier that
    writes it**, across all seven classes at once. Higher always means stronger:
    mana regen and skill costs are divided rather than multiplied
  - Upgrade shop modes: **stock prices**, **all free** (which also pre-unlocks each
    class's 2nd and ultimate skill), **no upgrades** for a base-stats-only campaign,
    or **one custom price** — negative pays the player
  - **Fully upgraded roster** preset — everyone starts with every upgrade bought
    and every skill unlocked, at whatever balance is currently set, and the shop is
    cleared of everything that can no longer improve them
  - **Skills unlocked at start**, grouped by class in one place, filling in the
    stats and asset paths the game leaves unset until the upgrade is bought
  - **Remove extra lives from the shop**, since `life` is a repeatable purchase
    players can farm by leaving a level and returning
- **A "tiers sold" limit on every upgrade ladder.** Set it to 2 and the shop offers
  only the first two tiers; the rest disappear, because each tier requires the one
  below it and the emitted file drops the whole dependent subtree. Single-purchase
  entries get a checkbox instead
- `player.<file>.remove.<upgradeId>` overrides, which drop an upgrade from the
  emitted tweak file entirely; removal cascades to anything that requires it, so
  a file never ships a dangling `req`

### Fixed

- **"Fully upgraded roster" no longer leaves the shop selling downgrades.** A maxed
  Thief was still offered *Knives Damage 1* for 800 gold, which would have dropped
  `knives-dmg` from 46 to 16. The preset now takes every upgrade that can no longer
  improve anything out of the shop. Upgrades with no stats — extra lives,
  rejuvenation and the three potions — stay buyable, because "already better"
  cannot be computed for them and they still do something for a maxed character
- The shop-price toggle no longer reads **Mixed** when no price has been touched.
  Removing extra lives, or shortening a ladder, used to flip it off *Stock prices*
- **Pre-unlocked skills no longer crash the game.** `combo-nova-projectile` and
  `aura-buff` are empty in the stock files and only an upgrade fills them in, so
  arming a combo nova's numbers without its projectile threw a
  `NullReferenceException` mid-combat — after several minutes of play, not at load.
  Both presets now carry an upgrade's string children alongside its numbers, and a
  new blocking validation rule rejects any skill left pointing at an empty path.
  As a side effect a fully-upgraded Knight also gets the wider sword-arc graphic
  its upgrades imply

### Changed

- **Upgrade shop modes reworked after play-testing.** "Locked out" priced every
  upgrade at 999,999; it is now **No upgrades**, which leaves them out of the
  emitted files so the shop genuinely has nothing to sell. A new **Set a price**
  mode takes any single price instead
- **Negative upgrade prices are now allowed.** Confirmed in game: an upgrade
  priced below zero *pays* the player. Useful for a "sell your character down"
  shop — start with high stats and take debuffs for gold. Validation reports the
  whole bounty shop in one warning rather than once per upgrade
- `SHOP_PRICE_MAX` (999,999, the most the shop will display) replaces
  `DEFAULT_LOCK_PRICE` and is now a clamp rather than a lockout mechanism
- **Percentage stats over 100% now warn.** Confirmed in game: anything past 100
  is wasted, because a chance cannot exceed always. The warning also distinguishes
  the two kinds, which look identical in the data — `dodge-chance` at 100 makes a
  Thief or Ranger literally unhittable (its stock ladder tops out at 50, so a
  Defense ×2 gets there), while `shield-chance` at 100 leaves a Sorcerer taking
  full damage because it is the frost-shield proc, not evasion. One warning covers
  the whole set
- `bool` tweak params are now editable, stored as `0`/`1`, so skill unlocks
  round-trip through `parameters.txt` like every other override
- `string` tweak params are now editable, stored as an **index** into the values
  the stock data offers, so an unshipped asset path cannot be emitted
- The "buying it would downgrade the character" warnings no longer fire when a
  starting stat sits exactly on a rung of its own ladder — the signature of a
  deliberately fully-upgraded character. Overshooting a ladder still warns

## [0.1.0] - 2026-07-28

### Added

- Initial Alpha release of the [converted Java Rogue-like Dungeon Generator 1.1](https://web.archive.org/web/20191207045849/http://hammerwatch.com/forum/index.php?topic=1658.30)
- Electron main process and React GUI with map preview
- Dungeon generator TypeScript port from original Java tool with full test suite and validation rules
- README and documentation for the project
- Default parameters file and parameter parsing
- LevelPacker integration tests for campaign packaging
- Orchestrator subagents and project context skills for Claude Code integration

### Changed

- Upgraded Electron to 43.2.0

### Security

- Fixed all 16 npm security vulnerabilities via dependency overrides
