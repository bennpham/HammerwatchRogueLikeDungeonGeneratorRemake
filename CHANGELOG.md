# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Multiple boss fights.** The Boss tab gains a **Number of boss fights** field, and above the Prep room / Boss room sub-tabs a row of **Fight 1, Fight 2, …** tabs plus a **Copy to next fight** button. Each fight is fully independent: its own prep room (shop columns, gold, free upgrades) and its own arena (theme, size, boss pool, all five wave tiers with their buffs and pickups, cover, spawn tuning, invulnerability, multipliers). Beating a fight teleports the party into the **next fight's prep room** rather than to the orb, so a chain reads fight, shop, fight — only the last arena carries the victory orb and the campaign's single `GameEnd`. There is no upper limit on the count, the same as `levels`. The fights share `ctx.bossRand` in order, so the first fight's arena is exactly the arena a single-fight campaign has always generated and every dungeon floor is untouched.

- **Wave pickups — item drops per boss health tier.** A new Boss-tab section under Wave buffs: each of the five tiers (100/75/50/25% and after the boss dies) can drop any mix of health, mana, potions and free upgrades, with a count per row. The copies appear the moment the threshold fires and stay on the floor — unlike the buffs, the tiers do **not** replace one another. They land on a **drop pad** just inside the arena entrance, laid out the same way on every seed (health up the left, mana up the right, the eight upgrades in the middle, potions in the row by the door) so the party can learn it once and run back to it mid-fight. Stock table (all three presets): 1× Health (Huge) + 2× Mana (Large) at 50%, one rejuvenation potion at 25%, and double the resupply once the boss is down. `parameters.txt`: `boss<i>WavePickupN=<item>:<count>|…`, on its own key so files written before the feature still round-trip byte for byte — and a tier the file describes without a pickup line drops nothing rather than inheriting the stock table. This ships **on**, so a stock arena differs from one generated before it; dungeon floors are untouched, as always. Extra lives (`powerup_1up`, `powerup_7up`) are in the roster too but in no stock table — an extra life in the final fight is opt-in.

### Changed

- **`parameters.txt`: every `boss*` key now carries its fight index** — `bossGold` is `boss0Gold`, `bossWave3` is `boss0Wave3`, and a second fight adds a full `boss1*` block, alongside a new `bossFights=N` count. This is a deliberate break of the flat keys (pre-1.0), but **importing an older file still works**: the unprefixed spelling is read as fight 0. Nothing writes it any more, so re-exporting an old file rewrites it in the indexed form. The emitted campaign follows the same indexing: `levels/bossprep0.xml` and `levels/boss0.xml`, with level ids `bossprep0` / `boss0`.

- **Boss arena rebalanced from two 4-player playtests.** Arena is now 42–64 on both axes (was 24–32 × 32–44): too small and the horde stacks on itself, too big and a scattered wave arrives dispersed, never re-forms, and gets picked off. Cover defaults to `symmetric` at 0.08 density. Castle's wave counts are cut ~60% (152/137/117/38/21 per tier) — the 100% tier used to ask for 480 monsters and roughly 1140 were alive by the 50% threshold. Desert and Bonus keep their tables. `parameters.txt`: `boss<i>Width`, `boss<i>Height`, `boss<i>Cover`.
- **Scattered spawns arrive in batches instead of on one frame.** A monster entry gets at most `batchSize` (8) spawn points per tier and anything past that trickles in on `batchIntervalMs` (1500), the same way the anchor rig splits a horde over its nine anchors. Inside the budget the old one-shot shape is emitted unchanged. `parameters.txt`: `boss<i>Spawn` grew two fields to `spacing,ringSpacing,clusters,batchSize,batchIntervalMs`; the three-field form still parses.
- **The horde is bloodlusted after the boss dies.** Every preset's boss-death tier now carries `bloodlust` aimed at monsters (+50% damage, +50% move speed), so the walk to the orb is a fight. It is the only tier the stock presets buff. `parameters.txt`: `boss0WaveBuff5=bloodlust:monsters`. This is the first 0.5.0-era feature that ships **on**, so a stock arena is no longer byte-identical to one generated before it — dungeon floors are untouched, as always.

### Fixed

- **Monsters spawned inside a centre-placed boss.** The arena put a `centre` boss on `(midX, midY)` and the `C` spawn anchor on the same tile, so anything sent to `C` appeared inside the queen and could not be hit. `C` is now pushed clear of the boss's collider.
- **`random` scatter only used the corners and compass points.** Spawn placement accumulated one occupied-floor list across all five tiers, so the floor saturated and every overflow was padded onto the nine anchors. Placement now resets per tier, refuses tiles the pillars sealed off from the entrance, retries a short request at tighter spacing, and pads onto real spare floor before ever considering an anchor.

## [0.5.0]

### Added

- **Free upgrades in the lobby and prep room.** Drop any number of the game's 8 stock upgrade pickups (damage, defense, health, mana, plus tier-2) on the floor of either room. Defaults to 0 of each, so stock balance is unchanged. Both rooms also got two extra lights. `parameters.txt`: `lobbyUpgrades` / `bossUpgrades`, eight space-separated counts.
- **Buffs per boss wave tier.** Each of the five arena tiers (100%, 75%, 50%, 25%, boss dead) can carry one arena-wide buff aimed at players, monsters or both. Tiers *replace* each other, so only one aura is live at a time and the fight reads as phases. **Copy to tiers below** repeats a buff downward. Off by default. `parameters.txt`: `bossWaveBuffN=<id>:<target>`.
- **Buff auras per floor.** Hang any of the game's 41 buffs on a floor, targeting players, monsters or both. Covers the whole floor, live on arrival, never expires. Several per floor allowed. Each buff's numbers show in the dropdown. Off by default. `parameters.txt`: `buffN=<id>:<target>|<id>:<target>`.
- **Timer mode.** Give a floor a countdown; when it hits zero the whole floor damages the party every few hundred ms until they leave. Negative damage heals instead. Monsters unaffected. Per-floor length, damage, frequency, and optional on-screen `M:SS`. Off by default. `parameters.txt`: `timerN=enabled|seconds|damage|freqMs|countdown`.
- **Boss invulnerability windows.** Boss goes immortal for 30s (configurable, per threshold) each time its health crosses 75%, 50% and 25%, with an on-screen countdown. Stops a geared party from bursting the boss before its waves happen — which used to fire all three tiers at once and lag the arena. `parameters.txt`: `bossInvuln`, `bossInvulnCountdown`.
- **Final room opens with a button, not a gold key.** `finalLockMode=button` (default) bars the orb corridor with a destructible wall and hides a floor button elsewhere on the floor; stepping on it blows the wall open. No key needed, so spending gold keys earlier can't lock you out of the ending. `finalLockMode=key` keeps the old gold door.

### Fixed

- **Dead players stayed dead in the lobby, prep room and arena.** Only numbered dungeon floors revived players on entry, so a partner who died on the last floor couldn't shop before the boss. All three rooms now use the same one-shot `RespawnPlayers` rig. Dying mid-fight is still permanent.

### Notes

- Every 0.5.0 feature is off or zero by default, and none of them draw RNG. A given seed's `levels/level*.xml` stays byte-identical whether they're on or off — only the extra level files change.

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
