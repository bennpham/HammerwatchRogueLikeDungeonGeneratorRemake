# Discovery log

Append-only record of what we learn about what Hammerwatch, its editor and
`LevelPacker.exe` actually accept. **Newest entries at the top.**

This file is the mechanism that keeps the skills honest: findings that only
live in a chat transcript are lost the moment the session ends. Every agent
that confirms or refutes something about the game's asset surface writes here
in the same change.

### 2026-08-28 — items as boss-tier drops, and two health sizes we have not seen load
**Tag:** **[VERIFIED]** for the emission shape and the item paths listed under
(1); **[UNVERIFIED]** for `items/health_2.xml` and `items/health_3.xml`.
**Context:** Building Wave pickups (`src/generator/boss/wavePickups.ts`), which
drops items on the arena's spawn anchors at each boss health threshold. The
project owner supplied a boss level resaved by the game's own editor
(`boss_test_perks.xml`) with a spread of item spawns hand-placed in it.

1. **An item spawns through the same `SpawnObject` node an actor does** — the
   node's `parameters` is simply an `items/…xml` path instead of an
   `actors/…xml` one. The editor wrote these itself, so both the node shape and
   every path below are **[VERIFIED]**:

   | | path |
   | --- | --- |
   | health / mana | `items/health_4.xml`, `items/mana_2.xml` |
   | potions | `items/powerup_potion1.xml` (invincibility), `items/powerup_potion2.xml` (rejuvenation), `items/powerup_potion3.xml` (damage) |
   | upgrades | all eight, as already recorded above |

   The three potions' effects are the owner's, from play. `powerup_potion2` is
   what the stock 25% tier drops.

2. **A count is copies, not `trigger-times`.** A `SpawnObject` spawns one actor
   per incoming trigger, and a tier trigger fires once, so `trigger-times: 4` on
   a single node drops one item and banks three. Four copies means four nodes —
   which is also how the owner described building it ("just stack them on top of
   each other"). `trigger-times: 1` still matters on the 100% tier, whose
   AreaTrigger re-fires every time a player walks back over the entrance.

3. **`items/health_2.xml` and `items/health_3.xml` are [UNVERIFIED].** They are
   in the owner's asset extract but appear in no file we have seen the editor or
   the game write, and neither has been walked over in game. They are offered in
   the pickup dropdown and emitted on request; do NOT promote them into
   `ASSET-REGISTRY.md` until a packed campaign loads a floor carrying one. There
   is no `mana_3` — the owner checked the extract; mana has two sizes only.

### 2026-08-28 — an arena can be too big: a scattered wave that never re-forms
**Tag:** **[VERIFIED]** in game (same 4-player group, on the 2026-08-27 build)
for the arena-size and cover findings; **[EMITTED]** for the boss-death
bloodlust field, which is emitted and round-trips but has not been watched land
on the post-kill horde in game yet.
**Context:** Second playtest, checking the 2026-08-27 rebalance. The lag was
gone; two of the three figures it shipped were wrong in the other direction.

1. **66-88 overshot, and not because of the walking.** On a floor that size a
   `random`-scattered wave arrives already dispersed and never converges: the
   monsters spend the fight pathfinding across open ground and reach the party
   in ones and twos, where they are picked off. The tuned counts stop applying
   any pressure at all — the same tables that were unplayable on 24-32 x 32-44
   were trivial on 66-88. This is the general finding, and it is about spawn
   dispersion rather than tile count: arena size is the lever that sets how far
   a scattered horde has to travel before it is a horde again. Settled range is
   **42-64 on both axes** (the group's stated preference was "around 44x44").
2. **0.12 cover was tuned for the bigger floor.** At 42-64 it reads as clutter;
   0.08 — the pre-2026-08-27 density — is right at this size. The `symmetric`
   pattern from that playtest was kept: it reads as deliberate architecture, and
   the legibility is what lets a party call out positions.
3. **The walk to the orb wanted teeth.** The boss-death tier already spawns a
   send-off, but a party that has just won walks through it. Requested fix: the
   post-kill horde fights buffed.

**Impact:**

- Arena default is 42-64 x 42-64; cover is `symmetric` at 0.08. Every preset
  inherits both — `withBoss()` re-points only theme, pool and waves.
- Wave counts are unchanged. The 2026-08-27 cut (152/137/117/38/21 for Castle)
  plus the batch budget were confirmed balanced by this session.
- Every preset's boss-death tier now carries `bloodlust` aimed at `monsters`
  (`bossDeathBuffs()` in `config/parameters.ts`), so the horde that spawns on
  the kill fights at +50% damage and +50% move speed. It is the only tier any
  stock preset buffs, and tiers replace one another, so the field is dark for
  the whole health fight and switches on at `Boss Died`. A stock arena therefore
  carries three `Boss Died` triggers: the win chain, the death tier's spawns and
  the death tier's buff field.
- The boss-tier copy of validation's "a strengthener aimed at anything but
  players" warning is gone. The arena's five tiers are an explicit difficulty
  ladder, so buffing the horde there is the feature; the per-floor copy of the
  rule stays, where a strengthener on monsters usually is a mis-aimed target.

**Still open:** the 2026-08-27 entry's open question shrinks but does not close
— the largest arena that can now roll is 64x64, still well above the 32x44 that
was the previous maximum, and no arena above 32x44 has been packed by
`LevelPacker.exe` or loaded in game. Stays `[EMITTED]`.

### 2026-08-27 — a centre boss swallows the C spawn anchor, and one frame cannot absorb 480 actors
**Tag:** **[VERIFIED]** in game (4-player playtest, no warlock, stock Castle
preset). Both findings were observed directly, not inferred.
**Context:** First multiplayer playtest of the generated boss arena at the
stock defaults.
**Evidence:**

1. **Monsters spawned inside the queen.** `arena.ts` placed a `centre` boss at
   `(midX, midY)`; `anchors()` placed the `C` spawn anchor at `(midX, midY)`.
   The queen's collider is the largest of the seven — 81x83 px, i.e.
   5.06 x 5.19 tiles — so every monster the anchor rig round-robined onto `C`
   materialised inside her body, where the party could not reach it. The code
   knew: `cover.ts` dropped `C` from its reachability targets for centre
   bosses, and `boss.test.ts` skipped `C` in its "no anchor inside the boss"
   assertion. Both were working around the bug rather than fixing it.
2. **The frame budget is far below the wave tables.** Every scattered monster
   emitted one `SpawnObject` with `trigger-times: 1` hung directly off its tier
   trigger, so the whole tier arrived on a single frame: 480 actors at 100%,
   and — because nothing ever disables a lower tier's rig — roughly 1140 alive
   by the 50% threshold. The fight was pathfinding-bound well before that.
   Four players with no warlock (no mass clear) is the honest test case; a
   party that can vaporise a horde masks it.
3. **The floor ran out before the count did.** `placeSpawnPoints` accumulated
   one `placed` rect list across all five tiers, and `spacing: 2` reserves a
   2x2 box per point, so a 28x38 interior held ~250 disjoint points against the
   ~1200 the tables asked for. Once saturated, every pattern placed nothing and
   the pad fell back to the 9 anchors — which is exactly what the playtest saw
   and reported as "random only places things on the corners and NWES".

**Impact:**

- `anchors()` takes an `AnchorClearance` object: `northClearance` for a
  `topWall` boss (unchanged behaviour) and `centreBoss` for a centre one, which
  pushes `C` south by half the collider plus a tile, clamped clear of `S`. The
  workaround in `cover.ts` and the test exception are both gone.
- Scatter spawning gained a batch budget: `boss.arena.spawn.batchSize` (8) and
  `batchIntervalMs` (1500). Past the budget a monster gets `batchSize` points
  and its count split round-robin over them on a shared per-tier timer, the same
  way the anchor rig splits a horde over its 9 anchors. Inside the budget the
  old one-shot shape is emitted unchanged.
- `placeSpawnPoints` resets its `placed` list per tier, filters candidates
  against `cover.ts`'s new `reachableMask` (so no monster lands in a pocket the
  pillars sealed off), retries a short request at `spacing: 1`, and pads onto
  real spare floor before ever considering the anchors.
- Stock Castle counts cut ~60% (152/137/117/38/21 per tier), arena grown to
  66-88 on both axes, cover moved to `symmetric` at density 0.12.
- New validation warning when a tier wants more scatter points than the
  smallest arena it can roll has floor for — the check whose absence let this
  ship.

**Still open:** the arena is now up to 88x88 where the largest previously
emitted was 32x44. Nothing is known to clamp it (`arena.ts` rasterizes its own
grid, independent of `mapWidth`/`mapHeight`) but no 88x88 arena has been packed
by `LevelPacker.exe` or loaded in game yet. Tagged `[EMITTED]` until it is.

### 2026-08-25 — the eight free upgrade item paths, and light ids are not renumbered
**Tag:** **[VERIFIED]** for the item paths and the two lighting entries (read
from levels saved by the game's own editor); **[EMITTED]** for stacking more
than one of a kind on a slot, which no in-game run has confirmed yet.
**Context:** Adding dungeon-master-controlled free upgrade pickups and two extra
lights to the lobby and the boss prep room (`src/generator/lobby/`,
`src/generator/bossprep/`).
**Evidence:** Two authored levels supplied by the project owner — a lobby and a
boss prep room saved out of the editor — were diffed against the committed
templates.

1. **Eight upgrade pickups exist as ordinary items** and are placed through the
   same `<dictionary name="items">` section as the diamonds, one
   `<array name="items/…">` per type:

   | | path |
   | --- | --- |
   | tier 1 | `items/upgrade_damage.xml`, `items/upgrade_defense.xml`, `items/upgrade_health.xml`, `items/upgrade_mana.xml` |
   | tier 2 | `items/upgrade_damage_2.xml`, `items/upgrade_defense_2.xml`, `items/upgrade_health_2.xml`, `items/upgrade_mana_2.xml` |

   The `_2` suffix is the game's own tier marker, not a copy count. **[VERIFIED]**
   — the editor wrote these paths itself. Promoted into `ASSET-REGISTRY.md`
   § "Items".

2. **A light entry carries no reference to anything**, so unlike an item or a
   node its id is never rewritten at build time. That makes light ids a hazard
   the other sections do not have: the two authored lights came in at 10020/10021
   (lobby) and 10047/10048 (prep room), which sit **inside** the span
   `diamondArray` walks — `LOBBY_ITEM_ID_BASE` is 10000 and the payout is capped
   at 10 000 diamonds. A deep enough gold pile silently produced duplicate ids.
   They were renumbered into the authored range (3400/3401 and 3600/3601) on
   import. Both import scripts already reject any id at or above the respawn
   rig's 9000, so a re-import of the original files fails loudly rather than
   reintroducing this. **[VERIFIED]** (the collision was caught by the existing
   id-uniqueness tests, not in game).

3. **The lighting block the authored lights use** is a plain warm torch:
   `mulColor1 255 255 255 255`, `mulColor2 255 255 224 255`,
   `mulColor3 255 165 0 255`, `mulRange 15`, `addColor1 96 64 0 255`,
   `addColor2 64 48 0 255`, `addColor3 48 32 0 255`, `addRange 4`. **[VERIFIED]**

**Impact:** `UPGRADE_KINDS` / `upgradeArrays` in
`src/generator/levelTemplate/surgery.ts`; `*_UPGRADE_SLOTS` and
`*_UPGRADE_ID_BASE` in the two `template.ts` files, the latter derived as
`*_ITEM_ID_BASE + MAX_DIAMOND_COUNT` so the cap and the id arithmetic cannot
drift. **Open question:** whether several upgrade pickups stacked on one tile
are all collectable, or whether the party can only pick up the top one — the
same question the diamonds answered yes to in 2026-07-30, but the diamonds are
money and these are items, so it does not carry over. Until someone runs it, the
form's "there is no cap" wording is a promise about what we emit, not about what
the game hands out.

### 2026-08-24 — the buff asset catalogue, `types` bit 2, and a `damage: 0` buff aura
**Tag:** [VERIFIED] for the buff catalogue and schema (read from a real
install); **[UNVERIFIED]** for the monsters bit and for the pure-aura rig, both
of which need one in-game run; [EMITTED] for the 100ms reapply interval.
**Context:** Buff auras — the optional per-floor buff fields
(`src/generator/buffs/field.ts`). A floor can wear any number of the game's
buffs, each aimed at players, monsters or both.
**Evidence:** The rig is copied from a level built by hand in the game's own
editor,
`<Steam>/steamapps/common/Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_buff.xml`,
and cross-checked against shipped content and the extracted asset folder.

1. **The game ships exactly 41 buffs**, all under
   `<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/buffs/*.xml`.
   Transcribed in full into `src/generator/objects/buffTypes.ts`, one entry per
   file, with a description derived from that file's own numbers. A test asserts
   `path === 'buffs/' + id + '.xml'` for every entry. **[VERIFIED]**

2. **A buff asset's schema** is `<buff><behavior><dictionary>` holding an `int
   duration` (ms) plus any of `float speed-mul`, `float dmg-mul`, `bool snare`,
   `bool stun`, a `dictionary damage` (`freq`, `dmg`, `bool can-kill`), a
   `dictionary mana-drain` (`freq`, `dmg`), a `string color`, and a cosmetic
   `array effects` of particles/light/sprite dictionaries. **[VERIFIED]**

   Two asset-level surprises worth recording: `test.xml` uses **negative** `dmg`
   in both `damage` and `mana-drain`, i.e. it *heals* — the only healing buff in
   the game. And `enemy_spider_1.xml` / `enemy_lich_desert_2.xml` use a
   **negative** `speed-mul`, which reverses movement rather than slowing it.

3. **`RectangleShape`'s `types` bit 2 is monsters. [UNVERIFIED]** Bit 1 =
   players is already [VERIFIED] (see the 2026-08-23 entry). Bit 2 is inferred
   from two independent places in shipped content: `campaign/levels/level_boss_1.xml`
   binds a `DangerArea{damage: 1337}` — an instakill sweep, plainly not aimed at
   the party — to a `RectangleShape{types: 2}`, and `prefabs/trap_fire_floor.xml`
   uses `3` for its `AreaTrigger` where `1` is the known players-only value.
   Across all of `campaign/`, `campaign2/` and `prefabs/` the only values that
   ever appear are `1` (470×), `2` (23×), `3` (246×) and `15` (1154×), which is
   consistent with a four-bit mask whose low two bits are players and monsters.

   `BUFF_TARGET_TYPES` in `config/parameters.ts` maps `players`/`monsters`/`both`
   to `1`/`2`/`3`. **Promote to [VERIFIED] once a generated floor with a
   monsters-only buff has been played and the party demonstrably does not catch
   it.**

4. **A `DangerArea` with `damage: 0` and a non-empty `buff` is a pure buff
   aura. [UNVERIFIED]** This is the whole feature: the node's damage is not the
   point, the buff is. The authored `test_buff.xml` is built exactly this way —
   three `DangerArea` nodes, `damage: 0`, `freq: 100`, carrying
   `buffs/bloodlust.xml`, `buffs/banner_drain.xml` and
   `buffs/boss_maggot_poison.xml` respectively, all bound to one whole-map
   `RectangleShape{types: 15}`. Needs one in-game run to confirm the engine does
   not skip a zero-damage field.

5. **`freq: 100` keeps an aura continuous. [EMITTED]** `BUFF_REFRESH_MS = 100`,
   taken from `test_buff.xml`. Every shipped buff's `duration` is at least 150ms,
   so the buff is always reapplied before it lapses. The four shortest
   (`banner_bloodlust` and `banner_drain` at 150ms, `trap_frost` at 500ms,
   `trap_quicksand` at 400ms) are what make a field read as "only while standing
   in it" rather than as a lingering debuff — that is the asset's design, not a
   limitation of ours.

6. **A buff field ships `enabled: True`.** `NodeDangerArea`'s constructor sets
   `enabled = false` for timer mode's benefit, whose `ToggleElement{state: 0}`
   switches it on at the end of a countdown. A buff aura has no trigger at all,
   so `buildFloorBuffRig` sets it back to true — it has to arrive live.

7. **A buff field can be swapped mid-fight by toggling two of them. [EMITTED]**
   The boss arena's per-tier buffs (`src/generator/boss/waveBuffs.ts`) rely on
   this: each threshold's `GlobalEventTrigger` fans out to a
   `ToggleElement{state: 1}` on the outgoing field and a `{state: 0}` on the
   incoming one, so exactly one arena-wide aura is live at a time. Same
   inverted polarity as everywhere else. The 100% tier's field carries no
   trigger at all — it ships `enabled: True` and *is* the opening state.

   Not yet run in game. The risk worth naming: a buff already applied to an
   entity presumably runs out its own `duration` after its field is switched
   off, so the swap is not instant — the outgoing buff should linger for up to
   its duration (2–5s for most). That is acceptable for the feature and is why
   the short-duration assets above are the crisp choice for a tier buff.

8. **One shape per distinct target, not one per buff.** Buffs on the same floor
   aiming at the same target share a `RectangleShape`, so three player-facing
   buffs cost four nodes rather than six. The shapes are created lazily in
   first-use order, so a floor's ids depend only on its own buff list.

**Impact:** `src/generator/objects/buffTypes.ts` (new),
`src/generator/boss/waveBuffs.ts` (new),
`src/generator/buffs/field.ts` (new), `src/generator/map/coverShape.ts` (new —
the covering-rectangle helper timer mode and buffs now share),
`BUFF_TARGET_TYPES`/`FloorBuff`/`levelBuffs` in `config/parameters.ts`,
`validateLevelBuffs` in `config/validation.ts`, the `buffN=` key in
`config/configFile.ts`, `tests/floorBuffs.test.ts`,
`tests/bossWaveBuffs.test.ts`.

### 2026-08-24 — `ChangeDoodadState`, and `need-sync` is about *change*, not collision
**Tag:** [VERIFIED] for the schema and the `need-sync` rule — both read off the
shipped campaign. [EMITTED] for our own rig until the campaign is played.
**Context:** The floor button that opens the final room never changed its art —
it stayed in its `raised` sprite after being stepped on.
**Evidence — the node.** `campaign/levels/level_1.xml` node 2180 drives its own
floor button with a `ChangeDoodadState`:

```xml
<dictionary name="parameters">
  <string name="state">activate</string>
  <dictionary name="object"><int-arr name="static">65</int-arr></dictionary>
</dictionary>
```

`object` holds a **doodad** id, not a script-node id — the same distinction
`NodeToggleImmortality` draws for actor ids. The state names are per-asset
strings, not an enum: `doodads/special/trigger_button_floor.xml` declares three
sprites — `raised` (its default), `activate` (two frames, 50ms each) and
`pressed` — plus `<states default="raised"><transition from="activate"
to="pressed"/></states>`. So `activate` animates the press and lands on
`pressed` by itself, while `pressed` snaps straight to the final frame. We emit
`pressed` by choice; `SEAL_BUTTON_STATE` in `map/buttonSeal.ts` says so, because
it otherwise reads like an error against the campaign's own usage.

**Evidence — `need-sync`.** The same file carries two floor buttons and they
differ on exactly this point: the one with a `ChangeDoodadState` on it is
`need-sync True` (line 9804), the plain one `False` (line 7111). So the flag
means "this doodad's runtime changes replicate to every client" — destruction
for the seal pieces, *state* for the button — and not "this doodad blocks".
**Impact:** `NodeChangeDoodadState` in `objects/nodes.ts`, wired as a fourth
fan-out on the seal's one-shot `AreaTrigger`, and the button now ships
`need-sync True`.

That last distinction quietly retired an assumption three places relied on, all
of which read "need-sync ⇒ part of the barrier" and were only ever right by
accident:

1. `map/sealCheck.ts` marked every synced doodad solid on a solid-tile theme.
   The button carries no `<collision>` and no `<polygon>` at all, so this would
   invent an obstacle — and an invented obstacle *shrinks* the reachable set,
   meaning the check would start passing floors it should reject. It fails
   towards a false pass, which is the dangerous direction.
2. `tests/sealProbe.ts` did the same, and would additionally have read the button
   as a `Horizontal` piece and undone a `yOffset: 2` never applied to it, landing
   the phantom obstacle on the wrong tile.
3. `tests/generation.test.ts` asserted the `DestroyObject` array named *every*
   synced doodad, and that the floor's synced doodads were all one type. The
   button is synced, is not destroyed, and is a different type.

The rule to reach for is not "is it synced" but "does its art declare a
collider".

### 2026-08-24 — the gated room was open on a second side, and nothing ever checked the gate held
**Tag:** [VERIFIED] — a seal-aware reachability sweep, calibrated against the two
walk-arounds the user confirmed in game, and since confirmed in play: a theme-h
and a bonus-5 campaign were played on 2026-08-24 with the seal no longer
walk-around-able and every locked door holding at its ends. Bonus 5 is the first
play evidence for the bonus themes at all — their `flatWalls` flag, and the
barrier and door rows it moves, had only ever been inferred from theme h.
**Context:** After four positioning fixes, a sweep of 60 seeds x 4 themes asked
the question none of the existing checks did: *with the seal intact, can the
player still walk to the orb?* Nine floors per lettered theme said yes.
**Evidence:** The probe was calibrated first. Reverting each earlier fix in turn
reproduced exactly the leak the user had found in game and nothing else:

| | LEFT fix reverted | DOWN fix reverted | both in |
| --- | --- | --- | --- |
| `dungeon1613495514` (LEFT) | **reachable** | sealed | sealed |
| `dungeon1986970473` (DOWN) | sealed | **reachable** | sealed |

The leaks then split into two families. The smaller one is barrier geometry —
the barrier's end stops 2..9 tiles short of any wall (themes a/f seeds 29, 37,
59; bonus1 seed 35). The larger one cannot be fixed by moving a barrier at all.
Seed 8, theme a, orb room `o` and seal `S`:

```
  42 #####.....####ooooooooo........
  46 #####.....####ooooooooo........
  50 ...........S##ooooooooo########
  55 ...........S..ooooooooo########
```

The seal bars the left corridor correctly. The room's right edge at x 56 abuts
open floor at x 57 with **no wall band between them at all**. `buildTileArray`
marks a tile floor if *any* room or passage contains it, and `overlapRoom` only
forbids a passage overlapping rooms that are not its own endpoints — so a
passage bound for the gated room may graze it anywhere along its path, and two
regions that merely touch merge seamlessly. `sealRoomWithButton` and
`Room.lockRoom` both gate `passages[0]` and trust it is the only way in.
Eleven of theme a's 51 *sealed* floors also have a second opening that happens
to lead nowhere, so the topology is common; it is only sometimes fatal.
**Impact:** `map/sealCheck.ts` — `sealHolds(level, ctx)` — runs last in
`Level.build()`, after `buildTileArray` and `buildWalls`, and rejects the floor
if the orb is reachable with the seal treated as intact. Draws no random values;
a rejected floor re-rolls like any other invalid one. It carries the fence model
(which `DoodadType` closes which tile edge on a `directionalFences` theme) that
until now existed only as prose in this log. Solid themes read the tile grid
directly and deliberately skip `OVERHANG_ROWS`, since over-stating where the
player can walk can only cost a re-roll, never ship a leak.

Result: 0 leaks across 240 floors, 0 generation failures, and **only the leaking
floors changed** — 9/60 on a and f, 6/60 on h, 4/60 on bonus1, matching the leak
counts exactly. A floor whose gate already held is byte-identical.

`tests/sealProbe.ts` keeps an independent reading of the same collision data
from the *emitted XML*, so a floor the generator believes is sealed but writes
out wrong is still caught. The two are deliberately not shared.
**The gold door too.** `Room.lockRoom` gates the same `passages[0]` and inherited
the same blind spot, so `sealHolds` closes every `Door` item as well and runs on
any gated floor, not only one carrying `need-sync` doodads. A door is a solid
one-tile-wide collider whose two variants differ only in reach:
`door_a_*_h_v2` is y -16..0 px (its own row and the one above) and
`door_a_*_v` is y -32..+8 (its own row and the two above). Every door closes,
not just the orb's — a route crossing any door is a gated route. In
`finalLockMode: 'key'` this re-rolls 3/40 floors on theme a and 5/40 on theme h,
again with no generation failures.

### 2026-08-24 — a barrier needs the right tile AND the right edge, and "+3" was really "1 + overhang"
**Tag:** [VERIFIED] — two theme-h campaigns played and hand-fixed in the editor.
**Context:** The button seal failed to gate the final room twice more, in two
unrelated ways. Both were in `map/buttonSeal.ts`'s choice of *where* to put the
barrier, not its span (that was the earlier overhang entry) nor the wall band
(the entry below).

| Seed | Corridor | Generated | Hand-fixed |
| --- | --- | --- | --- |
| `dungeon1613495514` | LEFT | 8x `h_v_8_l` at x **12**, rows 22..29 | x **11** |
| `dungeon1986970473` | DOWN | 7x `h_h_8_dn` at y **41**, x 34..40 | y **39** |

**Evidence — the edge.** A fence theme's piece blocks one edge of its tile, and
the band uses a *mirrored* piece on each side of a corridor:

| Piece | Polygon | Blocks the boundary at |
| --- | --- | --- |
| `h_v_8_l` (`Vertical`, `TLeft`) | x 10..18 px | `x + 1` |
| `h_v_8_r` (`TRight`) | x -2..6 px | `x` |

`placePassageDoor` puts a LEFT door at `r.x - 1` and a RIGHT one at
`r.x + r.width + 1` — the room's wall column either way. But a LEFT doorway's
band is `TRight` and a RIGHT one's is `TLeft`, so the boundary to continue is
`entrance.x` on the left and `entrance.x + 1` on the right. The seal is always
`Vertical` -> `h_v_8_l`, which blocks `x + 1`: right for a RIGHT door, one tile
off for a LEFT one. The gap is not walked through sideways — it is walked
*around*: the corner at the doorway, `h_crn_r_dn`, has polygon (0,3)(-5,0)(1,-5)(2,0),
a 7x8px nub in the tile's top-left corner rather than a full edge, so the player
enters the doorway tile from the standable wall row below the nub, steps up past
`h_v_8_r`'s x 11.87..12.38 fence at x≈12.6, and walks into the room.

**Evidence — the offset.** `lineY = entrance.y + 3` for a DOWN corridor is
`1 + OVERHANG_ROWS`: one row past the doorway, plus the two rows the lettered
themes' three-tile-tall art buries. A `flatWalls` theme buries none, so +3 is two
rows too far. In `dungeon1986970473` the corridor is a single row — room wall at
38, mouth at 39, orb room from 40 spanning x 35..49 — so the seal landed at 41
*inside the orb room*, 7 tiles against 15, and was walked around at its right
end. At `entrance.y + 1` the cross-section is exactly `p.width` and the line
joins the orb room's own top wall, which is the same `h_h_8_dn` top-edge fence.

**Impact:** new `flatWalls` flag on `ThemeDef` (theme h and every bonus theme) and
`overhangRows(theme)` in `map/reachability.ts`; `buttonSeal.ts` gains a `lineX`
mirroring its `lineY`, and both it and `Room.lockRoom()`'s DOWN case now read
`entrance.y + 1 + overhangRows(theme)`. Lettered themes are byte-identical —
`overhangRows` returns 2, so `1 + 2` is the 3 they already had.

**Why the gold door never showed either:** a door is a solid 1-tile collider
centred on `entrance.x + 0.5`, covering `entrance.x`..`entrance.x + 1`, so it
spans *both* candidate boundaries and edge direction cannot matter to it —
`dungeon300445903`'s theme-h gold columns held at the door line and leaked only
over the top. It does share the DOWN overshoot exactly, which is why `lockRoom`
was fixed alongside.

**Sharp edges left in place, all pre-existing:**
1. **The lettered themes have the same DOWN overshoot** and no room to correct
   it — the rows the barrier would move onto are inside their own wall art.
   Reproduces on themes a and f at seeds 12, 29, 35, 59, 60, where the seal's
   far end abuts floor instead of wall. `tests/generation.test.ts` sweeps those
   seeds on the flat themes only and says so at the loop.
2. **A separate end-of-barrier failure on every theme**, seeds 13, 20 and 35:
   the seal's *near* end abuts floor, i.e. the wall band beside the corridor is
   thinner than the one tile of margin the seal allows for. Not diagnosed.
3. `sealRoomWithButton` reads `passages[0].path[0]`, the doorway of the
   passage's **begin** room, which may not be the room being sealed — it is not
   in `dungeon1986970473`. Harmless (barring either end of a one-way corridor
   gates it equally, and `p.width` is the passage's own width), and the gold door
   has always worked the same way.
4. `blockedGrid` models `OVERHANG_ROWS` on every theme, including flat ones. It
   is over-conservative there, never unsafe — but making it theme-aware would
   change which floors get re-rolled and with them every flat-theme seed.

### 2026-08-24 — theme h's wall *band* is standable, so a barrier must reach one tile into it
**Tag:** [VERIFIED] in game, both orientations. The vertical case came first —
the user walked around a gold door on a theme-h floor and fixed it by hand. The
horizontal case shipped as an inference from the same mechanism and was
confirmed on 2026-08-24, when the user walked at a horizontal door row's ends on
a theme-h campaign and could not get past.
**Context:** A locked door on theme h did not seal its corridor. This is a
*different* fault from the 2026-08-24 overhang entry below: there the corridor's
own rows were uncovered, here they were covered and the player went around
through the wall.
**Evidence:** Theme h's pieces barricade one edge of their tile, so a boundary
tile is somewhere the player can stand — already documented in
`config/themes.ts` under `directionalFences`. The row above a corridor takes
`TDown` -> `h_h_8_dn`, which fences only that tile's top edge (y -0.13..0.38):
steppable from the corridor floor, connected along the corridor's whole length,
and therefore a way over the top of a door column and back down past it. In
`dungeon300445903/levels/level0.xml` the two gold columns ran y 7..12 and 36..39;
`level0_modified.xml` adds one `items/door_a_gold_v_v2.xml` per column at
`21.5 5` and `46.5 34` — `entrance.y` in both cases.

The ends are not symmetric, and the art is why:

| End | Piece | Coverage | Needs an extra door? |
| --- | --- | --- | --- |
| Row above a horizontal corridor | `h_h_8_dn` | top edge only, y -0.13..0.38 | **yes** |
| Row below a horizontal corridor | `h_h_8_up` @ `yOffset: -1` | x 0..1, y -0.19..1.0 — near solid | no |
| Both columns beside a vertical corridor | `h_v_8_r` / `h_v_8_l` | ~25% edge fences | **yes, both** |

Door geometry, read from `assetsExtract/items/`: `door_a_*_v.xml` is a 12x32
sprite at `<origin>6 32</origin>` with collision y -32..+8 px, so it blocks from
two tiles above its position down to half a tile below; `door_a_*_v_v2.xml` is
the 16px variant (collision y -16..+8); `door_a_*_h_v2.xml` blocks one tile,
x -8..+8, y -16..0. That is why an extra **full** `_v` door at `entrance.y + 1`
is equivalent to the hand-placed `_v_v2` at `entrance.y` — same collision top
edge, same visual top edge, no new asset — and why the vertical case already
reached the wall row *below* the corridor without help.
**Impact:** `Room.lockRoom()` takes a `margin` of 1 when
`getTheme(this.theme)?.directionalFences === true`, and 0 otherwise: UP/DOWN
gains a door in the wall column on each side, LEFT/RIGHT one above. Non-fence
themes emit byte-identical levels, which the new `tests/generation.test.ts`
sweep asserts by requiring theme a's columns to *stop* on corridor floor at the
top. No RNG draw moves — `Item.create(..., 'Door', tier)` passes an explicit
index — so theme-h seeds keep their layout and only gain items and shifted ids.
**Caveat:** the extra door occupies a wall-band tile. Where that tile is floor
belonging to an unrelated passage hard against the corridor, the door gates that
passage too; reachability does not model doors and will not catch it. The
existing doors already carry the same exposure at their other ends.

### 2026-08-24 — a doodad's `pos` is its art anchor; a `RectangleShape`'s is its **centre**
**Tag:** [VERIFIED] — from the shipped campaign, plus the user's hand-fix in the
editor.
**Context:** The button that opens the final room was pressable only from beside
it, never on it. The generated rig put the doodad and its 1x1 trigger box half a
tile apart on both axes.
**Evidence:** `editor/campaign/levels/level_1.xml` wires the game's own floor
button — a `doodads/special/trigger_button_floor.xml` doodad at `pos -20 -25`
(line 9803) driven by `RectangleShape` id 2179 at `pos -19.5 -24.5`, `w 1 h 1`
(line 20689). The two differ by exactly `(0.5, 0.5)`, and the asset itself
declares `<origin>0 0</origin>`, i.e. the sprite hangs down-right of its
position rather than straddling it. The user reproduced the same offset by hand
in `dungeon1210642739/levels/level0_modified.xml`, dragging the seal's four
script nodes from `37.241093 6.315228` to `38.241093 7.315228` while the button
doodad stayed at `37.741093 6.815228`.
**Impact:** `src/generator/map/buttonSeal.ts` now positions the shape (and the
trigger/sound/announce nodes with it) at the doodad's **emitted** position plus
0.5 — `doodadOffset('TriggerButton', theme)` plus a half tile — rather than at
the raw rolled tile. `tests/generation.test.ts` asserts the 0.5 relationship.
The centre rule was already known for large shapes (`timer/hazard.ts`, the 3x3
`BossPortal` shape); what was missing is that a doodad does **not** share it, so
"same coordinate" never means "concentric". Note `objects/objectSet.ts`'s `Shop`
still puts its 1x1 shape at the vendor doodad's own coordinate and carries the
same mismatch; it is long-standing shipped behaviour and was left alone.

### 2026-08-24 — theme h and the bonus themes have **no wall overhang**, so a barrier must span the whole corridor
**Tag:** [VERIFIED] in game — the user played a theme-h campaign, walked around
the seal barring the final room, and fixed it by hand in the editor.

Source: a diff of a generated theme-h `level0.xml` against the same file after
the user extended its seal. Exactly three doodads were added — `h_v_8_l` at
(59,7), (59,8), (59,9), all `need-sync`, appended to the `DestroyObject` id
list. Nothing else in the level differed.

1. **The two rows under a wall band are dead space only where the art
   overhangs.** `OVERHANG_ROWS = 2` (reachability.ts) comes from the lettered
   themes, whose wall pieces are 16x48 anchored `<origin>0 32</origin>` and
   emitted at `yOffset: 1`/`2`, so a wall at tile `T` fills `T`, `T+1` and most
   of `T+2`. **Theme h and every `bonus<n>` theme anchor every wall piece at
   `yOffset: 0`** (16x16 art, `<origin>0 0</origin>` — see `desertOutdoor()`
   and `bonus()` in `config/themes.ts`). They overhang nothing, and those two
   rows are ordinary walkable floor.

2. **So any barrier laid across a corridor must cover its full cross-section.**
   Reconstructing the tilemap: the corridor was floor on rows y=8..13 (a
   horizontal passage is `width + 2` rows tall, `Passage.contains`), and the
   seal covered y=10..14 — it started at `entrance.y + 2` on the assumption
   that rows 8 and 9 were buried. On theme h they were not, and the player
   walked straight over the top of the wall without pressing the button.
   `map/buttonSeal.ts` now spans the whole cross-section plus one tile into the
   wall band at each end (`width + 4` pieces for a horizontal corridor,
   `width + 2` for a vertical one), on every theme — the extra pieces sit under
   the lettered themes' overhang and simply make the barrier read full-height.
   `tests/generation.test.ts` asserts the seal is contiguous and runs into wall
   at both ends, for themes `a`, `h` and `bonus1`.

3. **Open question:** `reachability.ts` still models `OVERHANG_ROWS = 2` for
   every theme. On the flat themes that is over-conservative — it treats
   walkable rows as blocked and so rejects some floors the game plays fine. It
   never passes a floor that is actually sealed, so it is safe as it stands;
   the fix would be a per-theme overhang count. Not done, deliberately.

4. **Not a finding:** the same diff moved the rig's script nodes
   (`RectangleShape`/`AreaTrigger`/`PlaySound`/`AnnounceText` from (56,12) to
   (57,13), `DestroyObject` from (59,12) to (57,9)). The user confirms that was
   incidental dragging in the editor, **not** a fix — so it says nothing about
   whether `RectangleShape` is corner- or centre-anchored, and the generator
   keeps anchoring the shape on the button's own tile.

### 2026-08-24 — `PlaySound`, `trigger_button_floor`, and a button-opened wall
**Tag:** [EMITTED] for everything below — the schema and the paths come from a
hand-edited `level6.xml` the user opened in the game's editor and re-saved, so
the editor accepted them; none of it has been walked over in game yet.

Source: a diff of a generated `level6.xml` against the same file after the user
replaced its final-room gold door with a wall-and-button gate by hand.

1. **`PlaySound` parameter shape.** A `<dictionary name="parameters">` with
   `sound` (a `sound/<bank>.xml:<cue>` pair, **not** a file path), `loop`,
   `play3d` and `range3d`:

   ```xml
   <string name="sound">sound/misc.xml:button_hatch</string>
   <bool name="loop">False</bool>
   <bool name="play3d">False</bool>
   <float name="range3d">5</float>
   ```

   `range3d` is written even when `play3d` is False. `button_hatch` is the cue
   the game's own hatch buttons use. Now `NodePlaySound` in `objects/nodes.ts`.

2. **`doodads/special/trigger_button_floor.xml` is a floor plate with no
   trigger of its own.** The user's rig lays a 1x1 `RectangleShape` over the
   button's tile and hangs the `AreaTrigger` off *that* — the doodad is art.
   Now `DoodadType.TriggerButton`, centred on its tile (`0.5, 0.5`) like
   `Cover`, since the art is a flat decal with no overhang.

3. **A wall can be a destructible gate outside the arena.** The same
   `need-sync: true` + `DestroyObject` pairing the boss alcove's seals use
   works on ordinary theme wall pieces laid across a corridor. The user's
   version used `doodads/theme_g/g_v_16.xml` at 2-tile spacing;
   `map/buttonSeal.ts` instead reuses the arena's verified `Vertical` /
   `Horizontal` (`_v_8` / `_h_8`) one per tile, because that pairing is
   [VERIFIED] to both seal and open. **Open question:** whether `_v_16` /
   `_h_16` are the better-looking choice for a corridor-width gate — check in
   game and record the answer here.

4. **`AreaTrigger` with `trigger-times: 1`** is how the editor writes a
   one-shot. The generator has only ever written `-1` before this.

### 2026-08-23 — `DangerArea`, the `RectangleShape` type bitmask, and `LevelLoaded`
**Tag:** [VERIFIED] for all findings — `DangerArea` schema, empty `buff`, the
`types` bitmask meaning (1 = players only), and `LevelLoaded` firing on a
generated floor's load.
**Context:** Timer mode — the optional per-floor timed hazard
(`src/generator/timer/hazard.ts`). After a countdown the whole floor turns into
a damage field: damage every `freq` ms, negative damage healing instead.
**Evidence:** The rig is copied from a level built by hand in the game's own
editor,
`<Steam>/steamapps/common/Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_damage_player_timer.xml`,
and cross-checked against shipped content.

1. **`DangerArea`** carries a parameter dictionary in this exact order:
   `{damage: int, shape: {static: [shapeId]}, freq: int, buff: string}`.
   `freq` is milliseconds between applications. It is a *node*, so a
   `ToggleElement` can switch it on and off like any other element. Present in
   the shipped `campaign/levels/level_2.xml`, `level_boss_1.xml` and the
   prefabs `trap_fire_floor.xml`, `bonus_field_confuse.xml`,
   `trap_flies.xml`, `trap_block_falling.xml`, `trap_floor_drain_onoff.xml`.

2. **An empty `buff` is valid.** `<string name="buff"></string>` is what the
   shipped `campaign/levels/level_2.xml` writes for a pure-damage field — the
   element is present and empty, not omitted. The generator emits it that way;
   buff selection is a later feature.

3. **`RectangleShape`'s `types` is an entity-type bitmask, not a count.**
   `prefabs/bonus_field_confuse.xml` uses `types: 1` for a field that only
   affects players; `prefabs/trap_fire_floor.xml` uses `types: 15` for one that
   catches everything. The `AreaTrigger` in `trap_fire_floor.xml` uses `3`.
   Timer mode ships `1` so monsters are never damaged. **[VERIFIED]** by playing
   a generated floor with the timer armed — monsters took no damage while the
   field was live.

4. **`ToggleElement` polarity re-confirmed: `state: 0` ENABLES, `state: 1`
   disables.** `prefabs/trap_fire_floor.xml` settles it independently of the
   boss work — the enter-area branch (`AreaTrigger` event 0 → activate doodad)
   ends in `state: 0`, and the exit branch (event 1 → deactivate) ends in
   `state: 1`, both pointed at the same disabled `DangerArea`.

5. **`GlobalEventTrigger` accepts `LevelLoaded`** as its bare-string parameter,
   firing once the floor loads — this is what starts the countdown. Taken from
   the authored `test_damage_player_timer.xml`; not found in shipped campaign
   levels, but **[VERIFIED]** by playing a generated floor with the timer armed.
   The countdown announced correctly and the hazard switched on at the right time.

6. **`RectangleShape`'s position is the rectangle's centre**, and a generated
   level's map-array coordinates are world coordinates — timer mode centres its
   covering shape on `(mapWidth / 2, mapHeight / 2)` and oversizes it by 2 tiles
   on each axis.

**Impact:** `NodeDangerArea` in `src/generator/objects/nodes.ts`;
`src/generator/timer/hazard.ts`; `tests/floorTimer.test.ts`. All findings now
[VERIFIED] in game.

### 2026-08-22 — `ToggleImmortality`, the countdown `AnnounceText`, and how a node carries real delays
**Tag:** [VERIFIED] for the three node schemas below; [EMITTED] for the dual
delay-key emission, which has not yet been loaded in game.
**Context:** The boss arena gained invulnerability windows — on each of `Boss
75%`, `Boss 50%` and `Boss 25%` the boss goes immortal for a configurable number
of seconds while a countdown ticks down, then damage lands again
(`src/generator/boss/invulnerability.ts`). It exists because a fully upgraded
party can burst a boss down fast enough that all three thresholds fire in the
same second, which both skips the fight and switches every wave tier's spawners
on at once — the arena floods and the framerate collapses.
**Evidence:** The rig is copied from a level built by hand in the game's own
editor and played:
`<Steam>/steamapps/common/Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_boss_invinc.xml`.

1. **`ToggleImmortality`** takes the same parameter dictionary as
   `ToggleElement` — `{state, element: {static: [id]}}` — but `element` holds an
   **actor** id, not a script-node id. Polarity is inverted the same way
   `ToggleElement`'s is: **`state: 0` turns immortality ON, `state: 1` clears
   it.** Also present in the shipped `campaign/levels/level_boss_4.xml` (nodes
   at lines 2925 and 3562), where the pair targets the dragon's actor id, and in
   `campaign2/levels/level_boss_1.xml` and `level_hub.xml`.
2. **A countdown tick is an ordinary `AnnounceText`** with
   `{text: "0:30", time: 1000, type: 2}`. `type: 2` is the timer-line style;
   `type: 0` is the centred banner the generator's win text already used.
   `time` is how long the text stays up, so 1000 makes consecutive ticks meet
   end to end with no gap and no overlap.
3. **The whole countdown is one trigger's fan-out, not a chain.** A single
   `GlobalEventTrigger "Boss 75%"` connects to every node of the window at once
   and staggers them purely through its delay array — immortality-on at 0, one
   `AnnounceText` per second, immortality-off at the window length. Nothing
   re-triggers anything.
4. **Delay-key dialect, now load-bearing.** The 2026-08-08 dialect note recorded
   that hand-authored levels write `connection-delays` (real values) while this
   generator writes `delays` (a verbatim copy of `connections`, Java-original
   parity). Until now nothing in the port depended on a delay actually being
   honoured, so which key the *engine* reads in a generated level was never
   settled — and reading the shipped files cannot settle it, because the
   generator's nonsense values are all small enough to be invisible either way.
   `ScriptNode.connectTo(node, delayMs)` therefore switches a node into
   real-delay mode and emits the **same true millisecond values under both
   names**. Nodes that never take a delay are untouched and still ship the
   legacy `delays` line byte-for-byte, so no existing level moved.
**Impact:** `NodeToggleImmortality` in `objects/nodes.ts`; per-connection delays
in `objects/scriptNode.ts`; the rig in `boss/invulnerability.ts`, built after the
wave rig so switching it on only appends nodes. Default is on, 30 seconds on
every threshold, countdown on, for every preset.
**Open:** whether the engine honours `delays`, `connection-delays`, or both, in
a generated level. Play a packed campaign, watch a threshold, and promote this
entry — if only one key works, the other can be dropped from real-delay nodes.

### 2026-08-22 — only the numeric floors revived a dead player; lobby, prep room and arena did not
**Tag:** [VERIFIED] for the bug (reproduced in co-op in game); [EMITTED] for the fix.
**Context:** A playtest report — one player died on a dungeon floor, the other
took the red portal, and the dead player arrived in the boss prep room still
dead, unable to shop for the boss fight.
**Evidence:** Every generated `level*.xml` carries a four-node rig emitted by
the `ExitUp` prefab (`src/generator/objects/objectSet.ts`) at the entrance
stairs: `RectangleShape` → `AreaTrigger` → { `AnnounceText`,
`RespawnPlayers`, `ToggleElement` }. The `ToggleElement` carries
`state 1` (disable) and its `element` is the **AreaTrigger's own id**, so
the trigger fires once on arrival and switches itself off — that is what stops
an infinite respawn loop. Confirmed in an installed campaign at
`levels/level6.xml` (ids 9/10/11/12/13). The three hand-authored / generated
non-dungeon levels — `lobby.xml`, `bossprep.xml`, `boss.xml` — contained
no `RespawnPlayers` node at all, so nothing ever revived a player who arrived
in them dead.
**Impact:** All three now emit the same rig, minus the `AnnounceText`, over a
3x3 area centred on the level's `LevelStart` (wider than the floors' 1x1 so a
player who materializes slightly off the start tile still crosses it). The two
template levels get it inserted at build time by `respawnOnEntryNodes()` /
`insertNodes()` in `src/generator/levelTemplate/surgery.ts` — **not** by
hand-editing `template.ts`, which `scripts/import-*-assets.mjs` regenerates
— at id base 9000. The arena builds it programmatically in `boss/arena.ts`.
Still `[EMITTED]`: the emitted rig has not itself been loaded in game yet.

**Dialect note, worth remembering on its own** (`[VERIFIED]` by reading both
kinds of file): the *hand-authored* templates, saved by the game's own editor,
write a node's position as `<vec2 name="pos">x y</vec2>` and its delays as
`connection-delays` (zeros), while the *generated* levels write a
`<float name="x">`/`<float name="y">` pair and a `delays` int-arr that is
a verbatim copy of `connections` (Java-original parity). Anything inserted
into a template must follow the template's dialect, not the generator's.

### 2026-08-19 — monsters spawned off `Boss Died` do appear; the death tier works
**Tag:** [VERIFIED] — played in game. Supersedes the open question this entry
was first filed with.
**Context:** The boss arena gained a fifth wave tier keyed to the engine's
`Boss Died` event, so a campaign can spawn a last stand into the walk from the
dead boss to the orb (`src/generator/boss/waves.ts`, `TIER_EVENT_NAMES`).
**Evidence:** That `GlobalEventTrigger "Boss Died"` fires for a bare boss actor
was already verified (2026-08-10 entry below), but only ever for opening doors
and ending the level — no shipped campaign spawns off it. Packed a campaign with
a filled death tier, killed the boss, and the wave spawned: `SpawnObject` nodes
hanging off `Boss Died` keep producing actors after the boss is dead. Nothing in
the fight teardown suppresses them, and they run concurrently with the win chain
that destroys the alcove seals — the player fights the send-off on the way to
the orb, which is the intended shape.
**Impact:** The tier is a first-class wave, not a speculative one. All three
presets now ship it **populated** (castle: a lich send-off; desert: fire pillars
and floaters; bonus: the 25% line-up plus wisps — see `BOSS_DEATH_WAVE` in
`src/generator/config/parameters.ts`). Clearing it is still legal and is how a
campaign gets the old quiet walk back: an empty tier emits no script nodes and
requests no scatter points. Every mechanism the health tiers have applies here
unchanged — max counts (including `-1`/endless), per-monster intervals, scatter
spawn modes, the `bossWave5` line in `parameters.txt`, and the wave editor in
the Boss tab.

### 2026-08-18 — the starting-gold caps are gone; deeper stacks are a product decision, not a verified one
**Tag:** [UNVERIFIED] beyond two deep — the removal is a product decision by the
project owner, not a new in-game observation.
**Context:** `LOBBY_GOLD_MAX` (12000 = 500 x 12 slots x 2) and `BOSS_GOLD_MAX`
(42000 = 500 x 42 slots x 2) blocked starting gold above two diamonds per
authored floor slot, because two deep was the deepest stack anyone had watched
pay out (2026-07-30/31 entries below).
**Evidence:** Those caps were a conservative guess, never a game limit. Placement
never runs out of room: `diamondArray` in `src/generator/levelTemplate/surgery.ts`
walks the slot list round-robin (`slots[i % slots.length]`) with unique item ids,
so gold past the slot count stacks deeper on the same spots rather than spilling
outside the room. There is no "no space left" failure mode to protect against.
**Impact:** Both caps are deleted, with no warning tier replacing them —
`lobby.startingGold` and `boss.prep.startingGold` are now only required to be a
whole number >= 0 and a multiple of 500. The single remaining bound is
`GOLD_SAFETY_MAX` in `src/generator/config/validation.ts` (5,000,000 = 10,000
diamonds), which exists purely so a typed typo is rejected instead of emitting
millions of `<item>` nodes and hanging the generator; it is explicitly not a game
limit. **Stacks deeper than two per slot remain unconfirmed in game** — if a deep
stack is ever found to swallow diamonds, this entry is where to record it.

### 2026-08-18 — the wall overhang sealed ~10% of generated dungeon floors
**Tag:** [VERIFIED] — reported in game (seed 431297690, floor 6: the exit room
could not be entered), then reproduced from the emitted XML.
**Context:** The 2026-08-12 entry below established that `*_x_t_dn` art is three
tiles tall and buries the two rows under a wall tile. That fact had only ever
been applied to the boss arena's alcove; the dungeon floors never modelled it.
**Evidence:** Flood-filling `data-t` on the reported floor finds one connected
component holding both `LevelStart` and `LevelExitArea` — the tilemap says the
floor is fine. Its two halves meet through a single neck at x 58-62 whose floor
rows are 14-17, but the wall mass at row 13 buries rows 14 and 15, and the exit
room only touches the neck at row 14. Scanning the 8 campaigns already installed
in `editor/` with an overhang-aware fill: 0/39 floors blocked modelling 0 rows,
1/39 modelling 1 row (exactly the reported floor), **4/39 modelling 2** — the
value the collider actually has (40px on a 16px tile).
**Impact:** `src/generator/map/reachability.ts` now rejects such a floor and the
existing 60-attempt retry re-rolls it; ~6% of first rolls are discarded, and a
70-floor sweep of freshly generated campaigns scans clean. Seeds that previously
shipped a sealed floor now produce a different dungeon from that floor on — the
re-roll consumes the layout stream. Anything that must be walkable in a
generated level needs **three clear rows below the nearest wall above it**, not
just floor in the tilemap.

### 2026-08-18 — a stock boss arena now emits ~1300 SpawnObject nodes
**Tag:** [EMITTED] — generated and validated here, never opened in game.
**Context:** The stock presets were rebuilt so almost every wave monster is on
the `random` scatter mode with counts of 60-250 each, instead of trickling
through the nine anchors.
**Evidence:** `generateDungeon` on the three presets, seed 1234: `levels/boss.xml`
is 931 KB / 1270 `SpawnObject` nodes (Castle), 855 KB / 1160 (Desert), 835 KB /
991 (Bonus). Generation stays under 260 ms, and `spawnPoints.padToCount` keeps
the emitted node count exactly equal to the configured budget — an arena has
nowhere near 1300 free 2x2 footprints, so the surplus stacks on already-placed
points rather than being dropped.
**Impact:** Unknown whether the game or `LevelPacker.exe` is happy with a level
this node-heavy; that is the next thing to check in game. The per-monster
scatter warning (60) was replaced by a per-arena total (`BOSS_SCATTER_WARN =
2000`) so the stock presets do not warn on open — if the game turns out to
struggle, that number is the knob to lower.

### 2026-08-17 — mixed themes: the verified stacking mechanism, driven per region
**Tag:** [EMITTED] for the 8 `x - mixed` themes; the mechanism they rely on is
already [VERIFIED] by the 2026-08-16 tile-block-stacking entry below.
**Context:** Extending the paired themes of PR #24 so a floor can vary within
itself — `a - mixed` … `g - mixed` (plus `i`), one surface per room and per
corridor, and a geometric pattern across the boss arena.
**Evidence:** Nothing new about the engine was needed. The user's hand-authored
`test_alt_tileset.xml` already proved the three facts this depends on: a block
takes many datasets, they may paint disjoint patches, and `data-a: 0` is how a
layer declares itself absent on a cell. This change simply chooses the patches
from the level's own room/corridor rectangles instead of a hand-drawn 4x4 grid.
A generated `c - mixed` block carries the base plus at most one dataset per
palette overlay, and blocks whose regions all landed on the plain slot carry
just the base.
**Impact:** `src/generator/map/tilemapOverlay.ts` gained `mixedDatasets`, shared
by the floors and the arena. Two things remain unverified and are the first
thing to look at in game:
- **Seams.** The curated overlays ship no `<borders>` (that is why the
  `*_scattered` / `*_path` sets were excluded from curation), so where two
  regions meet, the art changes on a hard tile edge. Inside a room that edge is
  under the wall band, but a corridor meeting a room is open floor. If it reads
  badly, the fix is to bias corridors towards the plain slot rather than to add
  border tilesets.
- **Dataset count per block.** Eight was verified by hand; a mixed theme emits
  at most 1 + 2 (floors) or 1 + 1 + 2 (arena, counting `water`), so this stays
  well inside what was seen — but it is the first time the generator has emitted
  more than three.

### 2026-08-17 — `slime_1_host` is a spawner, and the folder does not say so
**Tag:** [VERIFIED] (read from a stock install's `editor/assetsExtract/actors/`)
**Context:** The boss-wave variant picker groups spawners separately from
creatures, and decided membership from the `actors/spawners/` path prefix. That
filed `slime#0` under Classic beside the walkers.
**Evidence:** `actors/slime_1_host.xml` is a static hive that produces
`slime_1_spawn` and leaves a razed doodad on death — the same shape as every
`actors/spawners/**` file, and is already recorded as such in the
corpse-passability entry below. It simply ships one directory up.
**Impact:** Spawner-hood is a per-actor fact, not a path rule. The port keeps a
`NON_PREFIXED_SPAWNERS` set in `objects/monsterTypes.ts` for the exception;
`slime_1_host` is its only member today, pinned by a test. Display only —
`slime#0` still resolves to the same actor, so no seed changes. If another
hive-shaped actor joins the roster it needs an entry there, or it will show up
among the creatures.

### 2026-08-17 — the north-wall projectile band applies to every spawned monster, not just anchor spawns
**Tag:** [EMITTED] (the band itself is [VERIFIED] — see the 2026-08-16
`SpawnObject` entry; what is unconfirmed is only that applying it to scatter
points fixes the reported case in game)
**Context:** Playtesting the scatter spawn modes (#21): the northern-most
scattered `SpawnObject`s came out inside the north wall, the same symptom the
fixed anchors had before #22 and the dragon had before #25.
**Evidence:** The 2026-08-16 entry established that a monster spawned 2 tiles
from the north wall fires into the wall band and every projectile is absorbed,
and that y = 4 fires cleanly on a 32x42 arena. That fact is about *where a
monster stands*, not about which code path put it there — but the fix landed
only in `anchors.ts` (`NORTH_ANCHOR_INSET`) and, for the boss's static
collider, in `bosses.ts` (`topWallBossY`). `spawnPoints.ts` (#21) drew
candidates over the whole interior and filtered them through cover.ts's
`isFree`, which has no north-band rule — a pillar in the top rows is only
decoration — so a scattered monster could legally land at interior y = 0..3.
**Impact:** `spawnPoints.ts` now filters through its own `isFreeSpawn`
(`rect.y >= NORTH_ANCHOR_INSET && isFree(...)`) and each of the four patterns
draws its y from the legal range, so the band costs no placement attempts. The
requested count is still always the count that spawns — `padToCount` stacks the
leftovers, and its anchor fallback already honours the band. The boss was left
at `topWallBossY` (dragon y = 3): #25's collider math is a separate constraint
and the reported bug was about the spawn nodes. The general rule for anything
added later: **a north-band rule belongs to the monster, so every path that
places one must apply it.**

### 2026-08-17 — a one-shot scattered horde is a trigger wired straight to N `SpawnObject`s with `trigger-times: 1`
**Tag:** [EMITTED] (derived from the [VERIFIED] 2026-08-10 `SpawnObject`
semantics; this exact rig has not been loaded in game yet)
**Context:** Issue #21 — the boss arena only ever spawned monsters from the 9
fixed anchors on a `TimerTrigger`, and asked for a second shape: a monster's
whole count placed across the arena and spawned once.
**Evidence:** The 2026-08-10 entry established that a `SpawnObject` spawns
exactly one actor per incoming trigger signal, that its position **is** the
node position, and that `trigger-times` is a lifetime budget rather than a
rate. Those three facts compose: a tier trigger connected directly to N
`SpawnObject`s, each at its own placed point, spawns N actors in one go, with
no `ToggleElement`/`TimerTrigger` in between at all. The budget is what makes
it *one*-shot — tier 0's trigger is an `AreaTrigger` over the entrance shape,
which fires again every time a player walks back over it, so the emitted nodes
carry `trigger-times: 1` rather than the default `-1`:
```xml
<string name="type">SpawnObject</string>
<bool name="enabled">True</bool>
<int name="trigger-times">1</int>
<float name="x">11</float>
<float name="y">7</float>
<string name="parameters">actors/bat_1.xml</string>
```
**Impact:** `src/generator/boss/spawnPoints.ts` places the points (the same
four patterns cover pillars use, sharing cover.ts's rejection filter so a spawn
never lands on the boss, the entrance, the alcove, an anchor or a pillar) and
`boss/waves.ts` wires them. Monsters whose wreck keeps its collision
(`corpseCollision === 'blocking'`, see the 2026-08-16 corpse entry) are refused
this mode by validation: nine known wreck positions are survivable, wrecks
anywhere are how an arena walls itself off. **Open question:** whether a player
re-entering the entrance area mid-fight can re-fire tier 0 in a way the
`trigger-times: 1` budget does not already cover — playtest before promoting
this to [VERIFIED].

### 2026-08-16 — a wall-mounted actor must clear the wall band by its collision `offset`, not just its footprint
**Tag:** [VERIFIED] (hand-patched in the game's own editor and played)
**Context:** The dragon boss was unwinnable on every generated regular dungeon:
players could not reach or damage it, it never attacked, and it read as sitting
off the map to the north.
**Evidence:** `editor/assetsExtract/actors/boss_dragon/boss_dragon.xml` carries
`<collision static="true"><circle offset="0 -8" radius="34" /></collision>`. At
the game's fixed 16px/tile that is a **static** collider of radius 2.125 tiles
whose centre sits **half a tile above** the actor's own position. The generator
placed the dragon at interior row 0 (flush against the north wall), so
`0 - 0.5 - 2.125 = -2.625` — 2.6 tiles of static collider inside the solid wall
band. The user hand-edited the arena to interior row 3 and re-saved through the
editor (`editor/dungeon1834575286/levels/boss_fix.xml`, dragon at `13 3` vs the
generated `13 0`): the dragon is then reachable, damageable, fires normally, and
still reads as mounted on the north wall. Row 3 is exactly
`ceil(radius - offsetY)` = `ceil(2.125 + 0.5)`.
**Impact:** Footprint size alone is not enough to place an actor against a wall
— the collision shape's `offset` has to be honoured too. `bosses.ts` now records
`collisionOffsetY` per boss and derives the placement row in `topWallBossY`;
`arena.ts` uses it instead of a hardcoded 0. Only the dragon is `topWall`, so
every other boss's arena is byte-identical (verified by fingerprinting five
centre-boss seeds before and after). Knock-on: at row 3 the dragon's collider
covers the `N` spawn anchor at `NORTH_ANCHOR_INSET` (4), which would spawn wave
monsters inside a static boss, so `anchors()` gained an optional `bossClearance`
that pushes **only** `N` south (to row 6 for the dragon); `NE`/`NW` sit far
enough out in x to be unaffected, and centre-placed bosses pass nothing and keep
the historical layout.

### 2026-08-16 — a tile block stacks arbitrarily many tilesets, ordered by the tileset's own `level`, not by dataset order
**Tag:** [VERIFIED] for the stacking mechanism and the full tileset roster below
(read from the user's own install); [EMITTED] for the 14 overlay themes we now
generate, until they are seen in game.
**Context:** Adding paired theme entries (`c`, `c - tiles`, `c - tiles dirt`, …)
so a floor can carry alternate art without a new layout algorithm.
**Evidence:** The user hand-authored
`editor/pht6_quiky_dreadmann_mansion/levels/test_non_related_to_map/test_alt_tileset.xml`
in the game's own editor and it loads. One 20x20 block there carries **eight**
datasets — `b_default`, `b_tiles_mixed`, `b_tiles_red`, `c_default`, `c_tiles`,
`c_tiles_dirt`, `d_default`, `d_carpet` — each with its own `data-t`/`data-a`,
painted over disjoint 4x4 patches. So `datasets` is not limited to the two the
boss arena uses (`water` + theme), and a `data-a` of 0 is how a layer declares
itself absent on a cell.

Draw order comes from the `level` attribute the *tileset XML* declares, not from
the order datasets appear in the block. Every tileset in
`editor/assetsExtract/tilemaps/` and its `level`, with the top-level `<sprite>`
count (excluding `<borders>`, which the engine picks and `data-t` cannot address):

| Tileset | `level` | Variants | Borders |
| --- | --- | --- | --- |
| `water` | 1 | 1 | no |
| `a_default` | 10 | 2 | no |
| `a_scattered` | 11 | 5 | yes |
| `a_dirt` | 12 | 2 | no |
| `a_dirt_scattered` | 13 | 5 | yes |
| `b_default` | 20 | 4 | no |
| `b_tiles_mixed` | 21 | 4 | no |
| `b_default_border_*` | 31–38 | 1 each | no |
| `b_tiles_red` | 39 | 1 | no |
| `c_default` | 50 | 4 | no |
| `c_tiles` | 51 | 4 | no |
| `c_dirt` | 52 | 2 | yes |
| `c_tiles_dirt` | 53 | 8 | no |
| `c_default_border_*` | 61–68 | 1 each | no |
| `d_default` | 70 | 8 | no |
| `d_default_dirt` | 71 | 4 | no |
| `d_dirt` | 72 | 2 | yes |
| `d_carpet` | 75 | 6 | no |
| `d_carpet_border_*` | 81–88 | 1 each | no |
| `d_carpet_dirt` | 90 | 2 | yes |
| `e_default` | 100 | 2 | no |
| `e_default_dark` | 101 | 2 | no |
| `e_arable` | 103 | 1 | yes |
| `e_fine` | 110 | 2 | yes |
| `e_moss` | 111 | 2 | yes |
| `f_default` | 120 | 2 | no |
| `f_fine` | 121 | 2 | yes |
| `f_path` | 122 | 5 | yes |
| `f_frozen` | 123 | 2 | yes |
| `g_default` | 130 | 2 | no |
| `g_fine` | 131 | 2 | yes |
| `g_path` | 132 | 2 | yes |
| `g_path_dense` | 133 | 4 | no |
| `h_default` | 140 | 2 | yes |
| `i_default` | 150 | 8 | no |
| `i_symbols` | 151 | 4 | no |
| `bonus_1`–`bonus_5` | 500–504 | 2,1,1,1,1 | no |
| `bonus_shadow` | 600 | 1 | no |
| `b_moss` | 900 | 2 | yes |
| `c_moss` | 901 | 1 | yes |
| `c_moss_tile` | 902 | 1 | yes |
| `d_moss` | 905 | 2 | yes |
| `slime_green` | 950 | 1 | yes |
| `grass` / `grass_brown` / `grass_yellow` / `grass_frozen` | 1000–1003 | 2 each | yes |
| `special_zone` | 1500 | 1 | no |

Two consequences fall straight out of the table. Every `<theme>_default` is the
lowest `level` in its own family, so any same-family overlay reliably sorts above
it — the pairing works without reordering anything. And `water` at `level` 1 is
below every classic tileset, which is why the arena's water underlay renders
beneath the theme regardless of where it sits in `datasets`.
**Impact:** `ThemeDef` gained an optional `overlay: { tilemap, tiles }`, and
`THEME_DEFS` now interleaves 14 curated pairings among the 14 plain themes —
`a_dirt`, `b_tiles_mixed`, `b_tiles_red`, `c_tiles`, `c_tiles_dirt`,
`d_default_dirt`, `d_carpet`, `e_default_dark`, `e_fine`, `f_fine`, `f_frozen`,
`g_fine`, `g_path_dense`, `i_symbols`. An overlay theme is its base theme by
spread, so it resolves identical doodads, walls, stairs and warnings; only the
extra tilemap dataset differs. `src/generator/map/tilemapOverlay.ts` builds that
dataset for both `map/level.ts` and `boss/arena.ts`, and returns `null` *before*
touching the RNG when a theme has no overlay — which is what keeps every
pre-existing seed byte-identical (verified by hashing a fixed-seed campaign
before and after the change). Themes `h` and `bonus1`–`bonus5` ship no non-border
overlay and stay unpaired. The `*_moss`, `*_scattered`, `*_path` and `grass*`
sets are deliberately not offered yet: they are built to dapple a floor in
patches, and this feature paints at full coverage.


### 2026-08-16 — shadows are a client display setting, so a room lit for shadows-off is too dark for everyone else
**Tag:** [VERIFIED] that one light is not enough with shadows on (the user played
the prep room on an install with shadows enabled and found it too dark);
[EMITTED] for the 18-light replacement now committed, until it is played.
**Context:** The authored boss prep room
(`levels/test_non_related_to_map/test_boss_prep_room.xml` in the
`pht6_quiky_dreadmann_mansion` editor campaign) shipped with a single light at
`0 -13` and `ambient-color 50 50 50 255`. On the dev machine's install shadows
are off, so the room looked fine; on an install with shadows on the same room
was too dark to use.
**Evidence:** Shadow rendering is a per-installation display setting, not
something the level XML controls — the same level file reads as adequately lit
or unplayably dark depending on the client. `ambient-color` is the only floor
brightness a dark room gets when its `lights` array is nearly empty, and 50/255
ambient is not enough on its own. The re-authored level carries 18 lights (ids
3313, 3514, 3517–3532) spread over the stalls, the diamond rows and the
entrance; `shadow-color 135 128 128 255`, `ambient-color 50 50 50 255`,
`add-color 0 0 0 255` and `shadow-length 1` are unchanged, so the fix is
entirely additional lights rather than a brighter ambient.
**Impact:** Author every hand-made room (prep room, lobby) for a shadows-**on**
client — that is the strictly darker case, and a room that reads well there
reads well with shadows off. Re-imported via
`node scripts/import-bossprep-assets.mjs --from "<HW>/editor/pht6_quiky_dreadmann_mansion"`;
the import is a pure addition inside `<array name="lights">` and every constant
`deriveMeta()` derives (`BOSSPREP_TEMPLATE_IDS`, `BOSSPREP_EXIT_NODE_ID = 232`,
the 42 `BOSSPREP_DIAMOND_SLOTS`, `BOSSPREP_ITEM_ID_BASE = 10000`) came back
identical, so `buildBossPrep()` needed no change. Note the new light ids run to
3532, still well clear of the diamond id base. Raise to `[VERIFIED]` after the
lit room has been walked in game with shadows on. The generated dungeon floors
and the boss arena still emit an empty `lights` array with the Java original's
255/255/255 ambient (`src/generator/map/level.ts`, `src/generator/boss/arena.ts`) —
they are full-bright, so this finding does not apply to them.

### 2026-08-16 — a campaign can start on a non-numeric level id, with no numeric floors at all
**Tag:** [EMITTED] — generated and asserted in tests, not yet packed or loaded in game.
**Context:** Allowing `levels = 0` so a campaign can be nothing but the boss
prep room and the arena ("skip straight to the boss").
**Evidence:** `levels.xml` is emitted as
`<levels start="bossprep">` with exactly two `<level id="bossprep">` /
`<level id="boss">` entries inside the single `<act name="lvl.act1">`, and no
`levels/level*.xml` files at all. Nothing in the format suggests `start` must
name a numeric id — the lobby already ships as `start="lobby"` and was played
end to end ([VERIFIED] 2026-07-31 lobby entry), so a string id is accepted
both as a level id and as `start`. What is new here is a campaign with *no*
numeric floors at all.
**Impact:** `src/generator/index.ts` picks `start` as
lobby → `'0'` → `'bossprep'`. The lobby is forced off at 0 floors because
`LOBBY_EXIT_TARGET` is the hardcoded floor `'0'` (`src/generator/lobby/build.ts`),
which would strand the party. **Open question:** does the game's floor counter
/ act display cope with an act whose only floors are `lvl.floor?floor=0` and
`?floor=1` served by string ids? Raise to `[VERIFIED]` after one playthrough.

### 2026-08-16 — tower and spawner corpses: which wrecks you can walk over
**Tag:** [VERIFIED] for the XML facts (read directly from a stock install's
`editor/assetsExtract/actors/**`); [VERIFIED] in gameplay for `tower_flower_*`
(walkable) and `tower_nova_*` (blocked) only — the user has walked those two.
Every other row of the table below is `[UNVERIFIED]` in gameplay until played.
**Context:** Issue #20. Towers and spawners are the only roster actors that
leave a *permanent* doodad on the floor, so they are the only ones that can
seal an arena after the fight. Nothing in the port recorded which ones do.
**Evidence:** A live actor's `<entry name="corpse">` names a `*_razed.xml`; the
razed file's `<collision>` block is what stays on the floor forever. All 30
towers/spawners are solid *while alive* — passability is purely post-death.

- passable: `tower_banner_1/2/3`, `tower_battlement_archer_1`,
  `tower_battlement_archer_3`, `tower_battlement_empty`, `tower_flower_1`,
  `tower_flower_1_small`, `tower_flower_2`, `tower_flower_3`,
  `spawners/archer_1`, `spawners/archer_2`, `spawners/doomspawn_1`,
  `spawners/eye_1`, `spawners/mummy_1`, `spawners/mummy_ranged_1`,
  `spawners/skeleton_1`, `spawners/skeleton_2`, `spawners/tick_1`,
  `spawners/bonus/skeleton_1`, `slime_1_host`
- blocking: `tower_nova_1` (circle r=8), `tower_nova_2` (r=8),
  `tower_static_frost` (r=10), `tower_tracking_1/2/3` (r=8),
  `spawners/bats` (r=8), `spawners/maggot_1` (7-point polygon),
  `spawners/wisp_1` (r=14)

Three different mechanisms produce "passable", so no filename or grep rule
separates them — the table has to be written out by hand:
1. The razed file has no `<collision>` at all (most entries).
2. The razed file's `<collision>` block is **commented out** —
   `tower_flower_1_razed.xml:8-10`, `spawners/archer_1_razed.xml:7-15`,
   `spawners/archer_2_razed.xml:7-15`. Grepping for the tag finds these and
   gets the answer exactly backwards.
3. The live actor's `corpse` entry is itself commented out —
   `spawners/doomspawn_1.xml:18`. `doomspawn_1_razed.xml` exists and carries a
   radius-18 circle, but nothing loads it, so a dead doomspawn spawner leaves
   nothing at all.

Two actors reuse another's razed file, so the corpse cannot be found by
transforming the live path either: `tower_nova_2.xml` -> `tower_nova_1_razed.xml`
and `tower_battlement_archer_1.xml` -> `tower_battlement_archer_3_razed.xml`.
**Impact:** New `src/generator/objects/actorCollision.ts` holds the table,
keyed by the live actor path (what appears in `MonsterTypeDef.tiers`), with
`tests/actorCollision.test.ts` re-transcribing it independently and asserting
that every tower/spawner in the roster is covered. The boss-wave picker badges
each option `passable`/`blocks` and offers a "Passable only" filter. Nothing
*uses* the data for placement yet — that is the follow-up dead-end-prevention
feature. Note this refines, and does not contradict, the existing
`tower_empty` entries below: its **live** collision is a full 32x32 blocking
polygon, but its **corpse** is walkable.


### 2026-08-16 — the boss arena could only ever spawn one tier per monster
**Tag:** [VERIFIED] (read from the port's own source and its emitted `boss.xml`)
**Context:** Issue #20 reported "all spawners are missing" from the boss arena.
**Evidence:** `boss/waves.ts` resolved a pool id with
`type.tiers[Math.min(1, type.tiers.length - 1)]` — always index 1, no RNG draw,
clamped down only for single-tier types. The dungeon by contrast rolls tiers
upward with `upgradeChance` (`Monster.createRolled`) and places `tiers[0]`
spawner props separately (`room.ts`). So the arena excluded tier 0 (all 13
spawners) **and** every tier >= 2: roughly 20 actors including
`archer_1_elite`, `bat_3`, `eye_1`, `lich_2`, `lich_3`, `maggot_1`,
`maggot_1_elite`, `mummy_1_small`, `mummy_1_elite`, `mummy_ranged_2`,
`skeleton_1`, `skeleton_1_elite`, `skeleton_2`, `skeleton_2_elite`,
`slime_1_host`, `tick_1`, `tick_1_elite`, `tick_2_small`, `wisp_1`.
**Impact:** A wave pool entry is now a *variant key*, not a bare monster id:
`bat1` is still `tiers[1]`, `bat1#0` is the spawner, `archer1#2` the elite
(`monsterTypes.ts`: `parseMonsterKey` / `resolveActorPath` / `variantKey`).
A bare id keeps its old meaning, so every saved `parameters.txt`, every preset
and every seed's arena is byte-identical — the whole existing suite passes
unchanged, which is the regression gate for this change. Exactly one canonical
key exists per actor path (`bat1#1` is rejected as a non-canonical spelling of
`bat1`), so one actor can never hold two pool slots with two different max
counts. `#` is safe in the `bossWave%d=` grammar, which already uses `|`, `,`
and `:`. Spawner variants are grouped under a synthetic **Spawners** group in
the wave picker rather than inside the group of the monster they emit — that
also moves `mb_doomspawn` (whose only tier IS a spawner) out of **Bosses** in
that picker; the dungeon pool editor is untouched.


### 2026-08-16 — a `SpawnObject` 2 tiles from the north wall makes projectile monsters harmless
**Tag:** [VERIFIED] (hand-patched `boss.xml` reloaded in Hammerwatch; the user's
`boss_fix_tower.xml` in `editor/dungeon2088907814/levels/` is the fixed file)
**Context:** The boss arena's 9 spawn anchors were all inset 2 tiles from the
interior edge. Waves that rolled a tower — `tower_nova_1`, the flower and
battlement towers — produced towers on the three northern anchors that never
damaged anyone. Players could still shoot them, so they read as a spawn bug,
not a balance one.
**Evidence:** Every projectile from a north-row tower vanished on spawn. A
tower actor fires from an origin *above* its own tile, and at 2 tiles the
origin lands in the north wall band, so the shot collides immediately. The
user hand-edited a generated 32x42 arena, moving only the `NW`/`N`/`NE`
`SpawnObject` nodes from `y = 2` to `y = 4` (`2 2`/`16 2`/`29 2` -> `2 4`/
`16 4`/`29 4`) and leaving the other six anchors, `LevelStart`, the entrance
`RectangleShape` and all 4 waves untouched. Towers fired normally afterwards.
**Impact:** The inset is no longer uniform. `boss/anchors.ts` gains
`NORTH_ANCHOR_INSET = 4`, used by `N`, `NE` and `NW`; `ANCHOR_INSET = 2` still
governs west, east and south. A flat constant, not a function of the wall
band's thickness — the interior floor starts at `y = 0` on every theme, so the
clearance the firing origin needs does not vary with `BAND`. Fixes issue #19.
Note this shifts cover-pillar and food layout for existing seeds (the anchor
rects feed `cover.ts`'s rejection filter, and a rejection costs a `bossRand`
draw); `ctx.rand` and `ctx.cosmeticRand` are untouched, so dungeon levels are
byte-identical and only boss arenas change.


### 2026-08-13 — a tilemap block's declared `x`/`y` MUST be a multiple of 20; the engine snaps it
**Tag:** [VERIFIED] (proved by hand-patching a generated `boss.xml` and reloading
it in Hammerwatch 1.41 — the floor snapped onto its walls)
**Context:** The boss arena emits its entities in a local space offset from the
rasterisation grid, so it declared each `<tiledata>` block at
`b * 20 - origin` to compensate. The floor rendered `origin` tiles away from
its walls anyway — 5 on X and 1 on Y for one seed — and two rounds of adjusting
that subtraction changed nothing in game.
**Evidence:** Every tilemap in the game and in this project uses block origins
that are multiples of 20: `level_1.xml` and every shipped campaign level, the
editor-saved `bossprep` template (−20, 0, 20), the lobby template, and `Level`'s
own emitter. The boss arena was the **only** emitter producing non-multiples,
and the only level that rendered shifted. The emitted file was internally
consistent — floor tiles spanned x [−4..24] inside walls at −5 and 25 — so the
arithmetic was right and the *declaration* was not.
**Impact:** The engine quantises the declared origin to the 20-grid and silently
discards any offset written there. The offset has to live in the **sampling**
instead: declare at `b * 20`, and sample the tile array at `b * 20 + origin`.
Cell `i` is drawn at world `declared - 10 + i % 20`, so it then carries grid
index `world + origin` and renders at `grid - origin`, i.e. local space.
Corollary for tests: asserting the emitter's own formula back at itself passes
while the game is visibly broken. Assert that origins are multiples of 20, and
assert it against a `Level` floor too so the claim cannot be vacuous.

### 2026-08-13 — a collision polygon's bounding box is NOT its coverage; theme h fills no tile
**Tag:** [VERIFIED]
**Context:** The boss arena's one-tile wall band leaked on theme h. Three fixes
swapped in pieces believed to be "solid", each judged by the min/max extent of
the piece's `<polygon collision="true">` points. All three failed, the last
making it visibly worse — a sawtooth band of 160 identical slivers.
**Evidence:** Sampling the polygons properly (point-in-polygon over a 16x16
grid) instead of taking their bounding boxes gives the real coverage of every
`doodads/theme_h/` piece: `h_crn_r_dn_v2` 56%, `h_crn_l_up_v2` 38%,
`h_h_8_dn` 28%, `h_v_8_l`/`h_v_8_r` 25%, `h_h_8_up` 9%, the v1 corners 0-1%.
**No piece in the folder fills a tile.** `h_crn_l_up_v2`, which the bounding box
reported as a full tile (x -2..16, y -2..16), is actually the thin diagonal
`(16,3) (2,16) (16,-2) (9,-1) (4,3) (-2,16)`.
**Impact:** Theme h seals a room only because its fences join into a closed
loop *around a wall mass several tiles thick* — the way every theme h dungeon
room does. A one-tile band is a geometry its art cannot seal, and no piece
swap can fix that. The boss arena gives such a theme a 2-tile band instead
(`ThemeDef.directionalFences`). Before judging whether any doodad blocks a
tile, sample its polygon; the extents lie whenever the art is diagonal.

### 2026-08-12 — themed wall pieces are 3 tiles tall and overhang 2 tiles downward
**Tag:** [VERIFIED] (in game, Hammerwatch 1.41 — the reward orb was unreachable
until it was moved clear of the overhang)
**Context:** The boss arena's alcove hid its orb inside a small pocket. The orb
was placed at the pocket's centre and could be seen but not walked onto.
**Evidence:** `doodads/theme_g/g_x_t_dn.xml` and `g_h_8.xml` declare
`<origin>0 32</origin>` on a `16 48` frame — three tiles tall, anchored two
tiles down — and `DoodadType` draws them at `tile + 2`. The sprite therefore
spans world `T` to `T + 3`: a wall at tile 15 paints over tiles 15, 16 **and**
17. In a 3-row pocket that buries the top two rows, including the centre.
The 1-tile pieces (`*_v_8`, `*_x_t_up`, `origin 0 16` on a `16 16` frame) do not
do this.
**Impact:** Anything the player must reach needs at least **four** rows of
clearance below the nearest wall tile above it, not three. The arena's alcove is
5x5 with the orb on its bottom row; a centred orb in a 5-row pocket still lands
one row inside the overhang. Read the `<frame>` height and the `<origin>` y
before assuming a piece occupies only its own tile.

### 2026-08-12 — destroying a wall doodad does not create ground under it
**Tag:** [VERIFIED] (in game — the opened alcove was a hole onto the water layer)
**Context:** The boss arena seals its alcove with `need-sync` wall doodads that a
`DestroyObject` node removes when the boss dies. The wall opened correctly, but
the doorway was a gap showing the level's base tilemap layer.
**Evidence:** Collision and floor are independent. A doodad carries the collider;
the tilemap carries the ground. The mouth tiles were left as wall in the tile
array, so removing their doodads removed the collider and left no floor.
**Impact:** Any tile a script will open must be **floored in the tilemap** as
well as sealed with a doodad. A consequence for generated levels: the pattern
matcher only visits wall tiles, so once a tile is floored it will no longer
produce a wall piece for it — the seal has to be placed explicitly.

### 2026-08-12 — the `Orb` win rig works, despite appearing in no shipped campaign
**Tag:** [VERIFIED] (in game — a full generated campaign completed on it,
**YOU WIN!!** with a score screen)
**Context:** The orb's end-game chain — `Item` (`items/crystal_purple.xml`) +
`ObjectEventTrigger` with `event="Destroyed"` watching that item + `GameEnd` —
was ported from the Java original and had never been confirmed to fire.
**Evidence:** Grepping both shipped campaigns finds **zero** uses of `GameEnd`,
and every one of their 60 `Destroyed` triggers watches a *doodad*, never an
item. The orb item is also `<collision static="true">` with a radius-5 circle,
so it is a solid obstacle rather than something walked through. All three facts
suggested the rig could not work; all three are red herrings.
**Impact:** Do not "fix" this rig on the strength of it being absent from the
shipped campaigns. When the orb appears unreachable the cause is its
*placement*, not its wiring — see the wall-overhang entry above.

### 2026-08-11 — the boss portal is `exit_teleport_boss.xml`; `marker_exit.xml` is an editor decal, not portal art
**Tag:** [VERIFIED]
**Context:** Phase 5a invented the `BossPortal` `ObjectSet` to match `Orb`'s id
count, guessing at the visual. Two authored levels were then supplied for
comparison: `test_boss_portal.xml` and the portal inside
`test_boss_prep_room.xml`.
**Evidence:** Both use `doodads/generic/exit_teleport_boss.xml`, as does the
shipped `campaign/levels/level_11.xml` and `campaign2/levels/level_boss_3.xml`.
The asset is a 4-frame animated sprite with a glow layer, `open`/`closed`
states defaulting to `open`, and two collision polygons at x −10..−8 and 8..10
px — side posts the player walks *between*, not a solid block. It carries **no
behaviour**: no teleport logic and no destination, so `test_boss_portal.xml`
(empty tilemap, zero script nodes) is an art probe, not a working rig.
What 5a had used, `doodads/generic/marker_exit.xml`, is a flat 32×16 sprite
from `markers.png` on `defaultlayer="-5"` with no collision and no animation.
The repo's own `ExitDn` set lays it *under* the stair sprite as a floor decal —
it is an editor marker, never the visual itself.
**Impact:** Added a `BossPortal` `DoodadType` and swapped the `ObjectSet` case
onto it. Replacing rather than adding the doodad keeps `BossPortal` at exactly
3 ctx ids, so it still swaps 1:1 with `Orb` and no wall doodad id on the final
floor shifts.

### 2026-08-11 — the authored portal rig gates on all players; the generator ships the 2-node variant
**Tag:** [VERIFIED]
**Context:** Deciding how the generated boss portal should be wired.
**Evidence:** The prep room's authored rig is four nodes —
`RectangleShape(w 3, h 3, types 15)` → `AllPlayersAreaTrigger`
(msg `"Waiting all players..."`) → `{PlaySound sound/misc.xml:info_teleport_activate,
LevelExitArea}`. Note the shape id sits in the **trigger's** `shape` dict and
the `LevelExitArea`'s own `shape` dict is left **empty** — the inverse of how
this repo's `NodeLevelExit.connectToShape` wires it. `AllPlayersAreaTrigger`
and `PlaySound` have no node class in this repo.
**Impact:** The generator deliberately ships the 2-node
`RectangleShape` + `LevelExitArea` pattern instead, because that is what every
already-playable floor exit (`ExitDn`) in this port uses, and because the
4-node rig would cost 2 new node classes and break the 3-id parity with `Orb`.
The trigger area was widened to 3×3 to match the authored one. **Open:** the
all-players gating is real co-op behaviour we are not reproducing — a lone
player can take the portal and split the party. Revisit after co-op
playtesting.

### 2026-08-11 — exact cover-pillar footprints, read from each pillar doodad's own collision shape
**Tag:** [VERIFIED] (real Steam install,
`editor/assetsExtract/doodads/theme_<t>/<t>_special_pillar.xml`,
`doodads/theme_h/h_deco_rock.xml`, `doodads/theme_bonusN/bonusN_pillar.xml`;
boss-tab-handoff.md Phase 5c). Sharpens the 2026-08-08 entry below, which only
recorded "solid" for the classic pillars without a width/height; this one
records the exact source geometry cover.ts's rejection filter uses.
**Context:** `src/generator/boss/cover.ts`'s shared rejection filter needs a
real per-theme pillar bounding box, not the `2x2` placeholder `geometry.ts`
shipped with Phase 5a's `PILLAR_FOOTPRINT_AREA`.
**Evidence:**
- classic themes a,b,c,d,e,f,g,i — `<t>_special_pillar.xml`, one
  `<polygon collision="true">` spanning x 0..16, y -24..16 (px). All eight are
  byte-identical here. At 16px/tile that is **1.0 tile wide × 2.5 tiles tall**
  — markedly taller than it is wide, unlike the other two shapes below.
- theme h — `h_deco_rock.xml` (theme H's only cover asset),
  `<collision><circle offset="-1 0" radius="18"/></collision>` => **2.25 ×
  2.25 tiles**.
- bonus1–5 — `bonusN_pillar.xml`, polygon x 0..16, y 0..16 => **1.0 × 1.0
  tiles**, confirming the earlier "solid 1×1" note exactly.
**Impact:** `geometry.ts` exports `pillarFootprint(theme)` returning these
three shapes; `cover.ts` uses it for every placement's exact overlap test.
`coverPillarCount`'s `PILLAR_FOOTPRINT_AREA` (which has no theme parameter —
`validation.ts` and all four cover patterns share its signature) is now the
*average* of the three real areas across all 14 themes (≈2.15 tiles²) rather
than the placeholder `2×2`. Promote into `ASSET-REGISTRY.md` alongside the
2026-08-10 pillar entry once a run confirms the asymmetric classic footprint
in game (the width/height split hasn't been eyeballed in-engine yet, only read
from the XML).

### 2026-08-10 — exact boss footprints, read from each actor's own `<collision>` shape
**Tag:** [VERIFIED] (real Steam install, `editor/assetsExtract/actors/boss_<name>/boss_<name>.xml`,
boss-tab-handoff.md Phase 5b). Sharpens the 2026-08-08 entry below, which
rounded to one decimal; this one records the exact source geometry.
**Context:** `src/generator/boss/bosses.ts` needs a footprint per boss to
reserve arena floor against (`geometry.ts`'s `BOSS_FOOTPRINT_AREA`) and to
decide dragon-vs-everyone-else placement. Read all seven actor files directly
rather than trusting the earlier rounded figures.
**Evidence:** Two shapes appear across the seven files:
- **Explicit `<collision>` child** (dragon, knight, lich, queen, worm) — a
  `<circle radius="R" .../>` for four of them (dragon 34px, knight 10px, lich
  8px, worm 19px; footprint = 2R/16 tiles, a circle so width == height), and
  for queen two `<polygon>` blocks with no circle — footprint is the
  axis-aligned bounding box of every `<point>` in both: x spans -43..38
  (81px), y spans -33..50 (83px), i.e. **5.0625 x 5.1875 tiles**, the largest
  of the seven (confirms/refines the "~5.1 x 5.2" figure already in
  `boss-tab.md`).
- **No `<collision>` child at all** (anubis, krilith) — the actor falls back
  to the radius on the `<actor collision="N">` attribute itself: anubis
  `collision="7"`, krilith `collision="3.5"`, both in px, so footprint =
  2N/16 tiles (0.875 and 0.4375 tiles respectively). This is the same
  attribute every ordinary monster and player actor also carries (e.g.
  `bat_1.xml` is `collision="5"`, every player class is `collision="3.5"`),
  so it reads as the engine's generic fallback hit-circle radius when an
  actor doesn't author an explicit shape — not a boss-specific mechanism.
- Confirmed placement data already in the 2026-08-08 entry against the actual
  shipped level: `editor/campaign/levels/level_boss_4.xml` places
  `actors/boss_dragon/boss_dragon.xml` at exactly `<vec2>-5 -26.5</vec2>`.
**Impact:** `src/generator/boss/bosses.ts`'s `BOSS_DEFS` uses these exact
px-derived fractions (not rounded) for `footprintWidth`/`footprintHeight`;
`geometry.ts`'s `BOSS_FOOTPRINT_AREA` now reads `largestBossFootprintArea()`
from that file instead of a hardcoded `5.1 * 5.2`, so the two can't drift.
Promote to `ASSET-REGISTRY.md` once the arena phase (5c+) has placed a boss in
a generated level and it renders/collides as expected in game.

### 2026-08-10 — the boss prep room importer derives the handoff's known values exactly
**Tag:** [VERIFIED] (real Steam install, `scripts/import-bossprep-assets.mjs --from
"<HW>/editor/pht6_quiky_dreadmann_mansion" --level
levels/test_non_related_to_map/test_boss_prep_room.xml`, boss-tab-handoff.md Phase 4)
**Context:** Phase 4 asked for an importer that *derives*
`BOSSPREP_TEMPLATE_IDS`, `BOSSPREP_EXIT_NODE_ID`, `BOSSPREP_DIAMOND_SLOTS` and
`BOSSPREP_ITEM_ID_BASE` from the authored file rather than hardcoding the
handoff's "known values", as a check on the derivation logic (cloned from
`scripts/import-lobby-assets.mjs`'s `deriveMeta`).
**Evidence:** Running the importer against the real file on disk produced,
byte for byte:
- `BOSSPREP_EXIT_NODE_ID = 232`, a `LevelExitArea` whose `<string
  name="level">` read `1` before surgery.
- Five `ShopArea` ids `3295`/`3297`/`3305`/`3307`/`3310` sitting on
  `CircleShape` ids `3294`/`3296`/`3304`/`3306`/`3309` — same `cats` strings
  and same shape id scheme the lobby's real template uses (see the
  2026-07-31 lobby entries below), confirming `LOBBY_VENDORS` /
  `categoriesFor()` reuse unchanged across both hand-authored rooms.
- Exactly 42 distinct diamond slots, item ids `3472`–`3513`.
- One extra top-level section, `<dictionary name="prefabs"></dictionary>`,
  empty and otherwise unremarked — the editor writes it even when unused;
  carried through verbatim since the template is opaque text.
- Root section order in this file is tilemap → doodads → actors → items →
  scripting → lighting, **not** `Level.getXML()`'s
  tilemap/doodads/actors/scripting/items/lighting order. Harmless: nothing
  reads the template as anything but opaque text located by element id.
**Impact:** No hand-tuning was needed anywhere in the importer or in
`src/generator/bossprep/build.ts` — the shared `cats`-prefix / vendor-doodad
derivation, item-slot reading order and id-base allocation logic port from the
lobby's importer unchanged. No `--asset` files were needed: every `type` /
`tileset` / `sound` path the file references resolves under a stock prefix —
`actors/boss_knight/`, `doodads/generic/`, `doodads/special/`,
`doodads/theme_{bonus4,c,d,f}/`, `tilemaps/{bonus_5,f_default,f_frozen,
g_default,water}.xml`, `sound/misc.xml`. The file is an editor scratch level
that samples several themes' decoration at once (it is not what the shipped
prep room looks like — `buildBossPrep` never touches decoration, only the
four surgical edits), which is why the asset list is wider than the shop rig
alone would suggest. None of these paths are re-verified against the game
here — only that they are stock-looking paths, same evidence tier as every
other `[EMITTED]` path in `ASSET-REGISTRY.md`.

### 2026-08-10 — boss global events fire for a bare boss actor in any level
**Tag:** [VERIFIED] (Windows install, scratch level authored in the editor)
**Context:** `docs/plans/boss-tab.md` research item R2 — the single biggest risk
in the boss-arena design was that `Boss 75%` / `Boss Died` might be emitted by
the shipped boss levels' own scripts rather than by the boss actor.
**Evidence:** `editor/pht6_quiky_dreadmann_mansion/levels/test_non_related_to_map/test_break_alcove_finish.xml`
places `actors/boss_queen/boss_queen.xml` in `<actors>` with no rig of its own,
plus one node:
```xml
<int name="id">84</int>
<string name="type">GlobalEventTrigger</string>
<int name="trigger-times">-1</int>
<string name="parameters">Boss Died</string>
<int-arr name="connections">85</int-arr>
```
Killing the queen fired the trigger. Note `parameters` is a **bare
`<string>` scalar**, not a dictionary.
**Impact:** No `ObjectEventTrigger`+`Counter` fallback is needed. Boss health
events are usable as generic level scripting. `src/generator/objects/scriptNode.ts`
needs an overridable `getParametersXML()` so a node can emit a scalar instead of
a `<dictionary name="parameters">`.

### 2026-08-10 — `DestroyObject` on wall doodads opens a genuinely walkable hole
**Tag:** [VERIFIED] (same scratch level, walked through in game)
**Context:** `boss-tab.md` R1 — the boss arena's win condition seals the orb in
an alcove and opens it on `Boss Died`, deliberately avoiding a gold door (a key
carried out of the last dungeon floor would open it early).
**Evidence:** In `test_break_alcove_finish.xml`, node 85:
```xml
<string name="type">DestroyObject</string>
<dictionary name="parameters">
  <int-arr name="static">1 54 2</int-arr>
</dictionary>
```
The id array sits **directly** under `parameters` — no `object`/`element`
wrapper dict, unlike `ObjectEventTrigger` and `ToggleElement`. Ids 1/54/2 are
`doodads/theme_a/a_h_16.xml` wall segments at `(-4,-9)`, `(-2,-9)`, `(0,-9)`.
After the queen died they vanished and the gap was walkable.
Two constraints the same file reveals:
- Those three doodads are the **only** ones in the file carrying
  `<bool name="need-sync">True</bool>`; all 50-odd others are `False`. Emit
  `need-sync=True` for anything a `DestroyObject` targets.
- The alcove interior is authored as **real floor tiles** in the `<tilemap>`.
  Collision came from the doodads alone, but the floor had to be there already —
  destroying doodads does not create ground.
**Impact:** Design confirmed; `HideObject`/`ToggleElement` were not needed. The
arena generator must carve alcove floor tiles up front and seal the mouth with
`need-sync=True` wall doodads.

### 2026-08-10 — `SpawnObject` fires once per trigger; endless spawning needs `TimerTrigger`
**Tag:** [VERIFIED] (scratch level `test_spawner_spam.xml`, same install)
**Context:** `boss-tab.md` R3. The design assumed `trigger-times: -1` on a
`SpawnObject` meant "spawn endlessly". It does not.
**Evidence:** A bare `SpawnObject` spawns exactly one actor per incoming trigger
signal. `test_spawner_spam.xml` gets a continuous stream by putting a
`TimerTrigger` in front:
```xml
<string name="type">TimerTrigger</string>
<bool name="enabled">False</bool>
<int name="trigger-times">-1</int>
<int name="parameters">1000</int>        <!-- bare int, milliseconds -->
<int-arr name="connections">96 97 98</int-arr>
```
turned on by `GlobalEventTrigger "Boss 50%"` → `ToggleElement{state: 0}` →
timer. `state: 0` = enable, consistent with `NodeToggleElement.state = 1 //
disable` in `src/generator/objects/nodes.ts`. `SpawnObject` itself:
```xml
<string name="type">SpawnObject</string>
<int name="trigger-times">-1</int>
<vec2 name="pos">-3 -7</vec2>
<string name="parameters">actors/bat_2.xml</string>
```
— no placement dict; the spawn position **is** the node position and
`trigger-times` is a **lifetime budget** (how many spawns remain), not a rate.
**Impact:** `TimerTrigger` is a required new node type (bare-int parameters).
The `boss-tab.md` wave rig was redesigned around
`trigger → ToggleElement(state 0) → TimerTrigger(intervalMs) → SpawnObject×N`,
and the Boss tab gained a per-monster spawn-interval parameter.

### 2026-08-10 — solid pillar doodads confirmed blocking
**Tag:** [VERIFIED] (`test_break_alcove_finish.xml`)
**Context:** `boss-tab.md` R8 — arena cover must actually block, and most
`*_deco_pillar_*.xml` files carry no collider.
**Evidence:** `doodads/theme_a/a_special_pillar.xml`,
`doodads/theme_c/c_special_pillar.xml`, `doodads/theme_h/h_deco_rock.xml` and
`doodads/theme_bonus1/bonus1_pillar.xml` were all placed and all blocked both
movement and projectiles.
**Impact:** The `Pillar` `DoodadType` mapping in the boss plan stands:
`*_special_pillar` for themes a–g/i, `h_deco_rock` for theme h,
`bonusN_pillar` for the bonus themes. Promote to `ASSET-REGISTRY.md`.

## Entry format

```
### YYYY-MM-DD — one-line finding
**Tag:** [VERIFIED] | [UNVERIFIED] | [REFUTED]
**Context:** what we were doing.
**Evidence:** what we actually observed — packer output, game behaviour,
  a file listing from a real install, an error message. Quote it.
**Impact:** files/skills to update, seeds invalidated, follow-up needed.
```

Rules:

- `[VERIFIED]` requires observation on a real install — not "it looks right in
  the code". Say which platform and, where it matters, which game version/DLC.
- `[REFUTED]` entries are as valuable as confirmations. Record the failure mode
  verbatim; it usually becomes a validation rule or a triage symptom.
- Promote confirmed facts into `ASSET-REGISTRY.md` and upgrade the tag in
  `SKILL.md`, then link back to the entry here.
- Never delete or rewrite an entry. Supersede it with a newer one that
  references it.

## Open questions

Highest-value unknowns. Anyone with a real Hammerwatch install can close these;
until then, treat them as unknown in anything shown to the user.

1. **Can a campaign ship its own assets?** Can custom `actors/`, `doodads/` or
   `tilemaps/` XML be placed inside the campaign folder and referenced by
   relative path, or does `LevelPacker.exe` only resolve against the game's
   asset root? Split in two, because the answers are worth different things:
   ~~**1a — doodads and textures.**~~ Answered — **yes**, see the 2026-07-31
   lobby-renders entry. The lobby's 10 campaign-local files in `LOBBY_ASSETS`
   (`doodads/level1/*` + `c_blood.png`, `lamp_torch_post_spor.xml` +
   `lamp_torch_post.png`) were packed inside *our* campaign folder and rendered
   in game, so a campaign may ship its own doodad XML and textures and reference
   them by relative path.
   **1b — actors.** Whether "custom monsters" can mean *new actor files* rather
   than only *unused stock actors*. **Deferred to post-1.0** and deliberately not
   being worked on now; it drags in spawner variants, `MONSTER_TYPES` wiring, and
   projectile/effect/sound dependencies. A passing 1a run does not answer it.
2. ~~**`.hwm` container format.**~~ Answered — see the 2026-07-29 packer-path
   entry. Custom `HWRP` archive: header, info.xml, optional icon PNG, then one
   gzip stream holding a name-keyed resource table. Still open: the exact
   per-entry record layout, enough to *write* a pack without the Windows tool.
3. **`LevelPacker.exe` interface.** Any flags beyond the single positional
   folder argument? What is its exit code and stderr on malformed input? Right
   now the app can only report "it failed". (Known: the positional argument is
   used verbatim as the resource-key prefix — see the 2026-07-29 entry.)
4. **Localization keys.** Do `lvl.act1` / `lvl.floor?floor=N` accept literal
   display strings, and can a campaign supply its own string table? Custom act
   and floor names depend on the answer.
5. **Asset availability per version/DLC.** The desert, tower, boss and special
   actor paths came from the modified `Monster.java`. Which of them exist in a
   stock current install? Any that don't need a `defaultMax` of 0 and a note.
6. **`info.xml` fields.** Is `<lives>0</lives>` really unlimited? Are there
   other supported fields (difficulty, party size, campaign icon)?
7. **Theme completeness.** Do all of `a b c d e f g i` ship the full 17-piece
   `doodads/theme_<t>/` wall set, and are the variant counts in `THEME_DEFS`
   right for every one? A wrong count is a load-time error. Partially answered
   for the bonus themes — see the 2026-07-30 bonus-theme entry: they ship 18
   pieces but **not** the two `_exit_h_*` frames, and their variant counts are
   still assumed rather than measured.
8. ~~**Do campaign tweak files replace or merge?**~~ Answered — **replace**, see
   the 2026-07-30 entry. Deleting upgrades from a campaign's file removes them
   from the shop, so `baseline.ts` must keep the complete transcription.
9. **Are malformed tweak files fatal?** Does `LevelPacker.exe` validate the
   `tweak/` folder at all, or does a bad file only surface in game (or get
   silently ignored)? Decides whether we need stricter emit-time checks.
10. **Do tweak `name`/`desc` keys accept literal strings?** Same question as
    the `levels.xml` localization keys, and the answer probably generalizes.
11. **Is the 5-tier upgrade cap about chain length or the `cat` namespace?**
    Appending `health-6`…`health-10` with `cat="misc6"`…`"misc10"` did nothing
    (2026-07-30). Stock files only ever use `misc1-5`/`off1-5`/`def1-5`, so the
    ceiling may be the shop's column set rather than the chain. Test: add a 6th
    tier reusing `cat="misc5"`. If it appears, extra tiers are possible after
    all and the app could offer to lengthen a ladder.
12. ~~**Is a money pickup shared or per-player?**~~ Answered — **per-player**,
    see the 2026-08-02 entry. A 12000 drop gives *each* player 12000, so the
    lobby's "starting gold" and the dungeon's `goldMultiplier` both describe a
    per-player amount, not a party pot.

## Entries

### 2026-08-08 — the engine emits named boss-health global events, and `SpawnObject` needs no actor placement
**Tag:** [VERIFIED] (read from a real Windows install's shipped campaigns) for
the strings and the node schemas; the *behaviour* of both in a campaign of our
own is `[UNVERIFIED]` — see R2/R3 in `docs/plans/boss-tab.md`.
**Context:** Designing the Boss tab (issue #6) — a hand-authored pre-fight shop
room plus a generated boss arena with monster waves keyed to boss health.
**Evidence:** Read from
`<Steam>/steamapps/common/Hammerwatch/editor/`.

1. `GlobalEventTrigger` nodes in `campaign/levels/level_boss_1..4.xml` and
   `campaign2/levels/level_boss_1..3.xml` carry these engine event strings
   verbatim as their `parameters`:
   `Activate Boss`, `Boss 75%`, `Boss 50%`, `Boss 25%`, `Boss Died`, `LevelLoaded`.
   The node's `parameters` is a **bare `<string>`**, not a dictionary:
   ```xml
   <dictionary>
   	<int name="id">317</int>
   	<string name="type">GlobalEventTrigger</string>
   	<bool name="enabled">True</bool>
   	<int name="trigger-times">-1</int>
   	<vec2 name="pos">-30 -14</vec2>
   	<string name="parameters">Boss 75%</string>
   	<int-arr name="connections">309</int-arr>
   	<int-arr name="connection-delays">0</int-arr>
   </dictionary>
   ```
2. `SpawnObject` likewise has **no `parameters` dictionary** — `parameters` is a
   bare `<string>` holding the asset path, the spawn position **is** the node's
   own `pos`, and the spawn count **is** its `trigger-times`. There is no count
   attribute, no name reference and no explicit coordinate. 1462 such nodes in
   `pht6_quiky_dreadmann_mansion/levels/test_yard2.xml`; `trigger-times` values
   observed are `1` (×1393), `2` (×54), `5` (×15). It spawns items and doodads
   too, not just actors (`items/health_1.xml`, `doodads/theme_b/b_h_16_fence.xml`
   all appear as `SpawnObject` payloads).
3. Boss-to-shipped-level map, for anyone needing a reference wiring:
   queen→`campaign/level_boss_1`, knight→`_2`, lich→`_3`, dragon→`_4`;
   worm→`campaign2/level_boss_1`, krilith→`_2`, anubis→`_3`.
4. `DestroyObject` is the one node that puts `<int-arr name="static">`
   **directly** under `parameters` with no wrapper dict, and it tolerates
   duplicate ids in that list.
5. Script-node types available in shipped boss levels, beyond the ten this repo
   emits: `CircleShape`, `AllPlayersAreaTrigger`, `ScriptLink`,
   `GlobalEventTrigger`, `TimerTrigger`, `Counter`, `Random`, `Variable`,
   `CheckVariable`, `SetGlobalFlag`, `DifficultyFilter`, `SpawnObject`,
   `DestroyObject`, `HideObject`, `ToggleImmortality`, `TogglePhysics`,
   `ChangeDoodadState`, `ShowSpeechBubble`, `HideSpeechBubble`, `PlaySound`,
   `PlayMusic`, `PlayEffect`, `CameraShake`, `DangerArea`, `ProjectileShooter`,
   `PathNode`. There is no Lua anywhere — all wiring is the XML script graph.
**Impact:** `docs/plans/boss-tab.md` is the design that rests on this. When it
is implemented, `src/generator/objects/scriptNode.ts` needs an overridable
`getParametersXML()` because `ScriptNode.getXML()` currently always emits a
`parameters` **dictionary** and cannot express the bare-scalar form these two
nodes require. Promote to `ASSET-REGISTRY.md` once a generated campaign has been
observed firing one of these events in game.

### 2026-08-08 — boss actors: two of the seven cannot move, and only `*_special_pillar` doodads are solid cover
**Tag:** [VERIFIED] for the file contents (read from a real install);
`[UNVERIFIED]` for minimum arena sizes and in-game collision — see R4/R8 in
`docs/plans/boss-tab.md`.
**Context:** Same Boss-tab design pass. Needed to know where each boss can be
placed and which doodads work as arena cover.
**Evidence:** From `editor/assetsExtract/actors/` and `.../doodads/`.

| Boss | Path | hp | Movement | Footprint |
| --- | --- | --- | --- | --- |
| anubis | `actors/boss_anubis/boss_anubis.xml` | 10000 | `composite`, `ranged` speed 0.6 + teleport | `collision="7"` ≈ 0.9 tile |
| dragon | `actors/boss_dragon/boss_dragon.xml` | 15000 | `boss-dragon`, `<collision static="true">` — **stationary** | circle r=34 @ scale 16 ≈ **4.25 tiles across** |
| knight | `actors/boss_knight/boss_knight.xml` | 2500 | `boss-knight` speed 0.55, `static="false"` | circle r=10 ≈ 1.25 tiles |
| krilith | `actors/boss_krilith/boss_krilith.xml` | 850 | `composite`, `ranged` speed 0.6 | `collision="3.5"` ≈ 0.44 tile |
| lich | `actors/boss_lich/boss_lich.xml` | 3500 | `boss-lich` speed 0.55, `static="false"` | circle r=8 ≈ 1 tile |
| queen | `actors/boss_queen/boss_queen.xml` | 2500 | `boss-maggot`, **no `speed`, no `movement` dict**, `static="true"` — **stationary** | polygons spanning ≈ **5.1 × 5.2 tiles** |
| worm | `actors/boss_worm/boss_worm.xml` | 500 | `boss-worm` speed 0.3, `static="true"` (burrows) | circle r=19 ≈ 2.4 tiles |

`boss_dragon` **has no upward-facing art at all**: its aim sprites are a 9-slot
arc named `"4" "3" "2" "1" "0" "-1" "-2" "-3" "-4"` plus `default`,
`stomp-left`, `stomp-right` — every frame in `dragon.png` faces down or
down-diagonal. The shipped `campaign/levels/level_boss_4.xml` places it at the
top of the arena (`<array><int>264</int><vec2>-5 -26.5</vec2></array>`). Any
generated arena must put the dragon in the top wall; every other boss can go
centre.

Cover doodads: `*_special_pillar.xml` (themes a–g, i) carry a
`<polygon collision="true">` and are **solid**; `theme_h` has exactly one cover
asset, `doodads/theme_h/h_deco_rock.xml`, with `<circle offset="-1 0" radius="18"/>`
(≈2.25 tiles); `theme_bonusN/bonusN_pillar.xml` are solid 1×1. **Most
`*_deco_pillar_*.xml` have no `<collision>` element at all and are pure art** —
e.g. `theme_i/i_deco_pillar_large.xml` is sprite-only. Do not use them as cover.
**Impact:** Feeds the `Pillar` doodad type and the boss-placement rules in
`docs/plans/boss-tab.md` §4–5. Note the 30× HP spread (worm 500 → dragon 15000),
which is why that doc's R9 asks whether an HP scaler is wanted.

### 2026-08-02 — one player picking up gold credits the full amount to every player
**Tag:** [VERIFIED] — established Hammerwatch behaviour, stated by the project
owner. Closes open question 12.
**Context:** The 2026-07-31 lobby run confirmed stacked diamonds pay out in full,
but was solo, so it could not distinguish "the party gets 12000" from "each
player gets 12000".
**Evidence:** Every player has their own separate purse, and a money pickup is
credited to all of them at once. One player walking over a 12000 stack leaves
*every* player 12000 richer. Gold is never split, never a shared pot, and never
something each player has to collect for themselves.
**Impact:** Every gold figure in this app is a per-player amount. The Lobby tab's
starting gold is what each player begins with, so `LOBBY_GOLD_MAX` (12000) is a
per-player ceiling; the dungeon's `goldMultiplier` scales a drop that then goes to
everyone. Nothing in the generator changes — the emitted diamonds are the same
either way. This is a labelling and balance-advice fact only.

### 2026-08-01 — `theme_h`'s colliders are edge fences, and a `CrossWall` tile is the joint that must be solid
**Tag:** [VERIFIED] (root cause read from the install; fix played in game on
Windows — the map is sealed and the theme still reads as an outdoor desert)
**Context:** A player reported still walking out of the map after the up-corner
anchor fix below. **Supersedes the "theme `h` no longer borrows any art from
theme `i`" entry**, which was right about the goal and wrong about the piece:
its `CrossWall` → `h_h_8_dn` remap is what opened the hole.
**Evidence:** Compare the polygon the remap replaced against the one it
installed, both normalized to tile units after the port's `yOffset`:

| piece | polygon | covers | shape |
| --- | --- | --- | --- |
| `i_x_x` (was) | `(0,16)(0,-8)(16,-8)(16,16)`, origin `0 16` | x 0.00…1.00, y −0.50…1.00 | **solid tile** |
| `h_h_8_dn` (became) | `(0,3)(0,-2)(16,-2)(16,3)(6,6)`, origin `0 0` | x 0.00…1.00, y −0.13…0.38 | fence on the top edge |

The general finding is the one that matters: **every `doodads/theme_h/` wall
piece barricades a single *edge* of its tile, not the tile.** `h_h_8_dn` fences
the top, `h_v_8_l` the right (x 0.63…1.13, full height), `h_v_8_r` the left. A
room is sealed because those fences join into a closed loop around its wall
band — the band itself is not solid, and the player can legitimately stand
inside a boundary tile. The `CrossWall` pattern (four orthogonal wall
neighbours, one diagonal floor) is exactly the **outer corner of that band**,
where the top row's fence and the side column's fence meet at right angles
without touching. `i_x_x`'s solid block was closing that joint. A fence there
leaves the corner open, and the void beyond has no doodads and therefore no
collision at all, so the escape route is: floor → up into the top wall row →
sideways into the corner → out of the level. Matches the reported symptom
(bottom walls holding, corners leaking) exactly.
**Impact:** `CrossWall` takes `h_h_8_up` at `yOffset: -1` — polygon
`(0,32)(0,16)(8,13)(16,16)(16,32)` → x 0.00…1.00, y −0.19…1.00, the **only**
piece in the folder that covers a whole tile, and already proven in game as
`TUp`. 42 tiles per level change piece; no doodad-count change, no RNG change,
no seed invalidated. `themes.test.ts` has a named regression test explaining why
a better-*facing* cliff must not be substituted here. Corollary recorded in
`ASSET-REGISTRY.md`: **substituting one theme `h` piece for another is only safe
when the replacement fences the same edge.**

**Accepted cost, confirmed in game:** `h_h_8_up` is 16×32, so at a corner it
overlaps the tile above and neighbouring wall pieces can z-fight/flicker. This
is inherent to a folder with no junction art — the only alternatives are theme
`i`'s grey indoor stone or a hole in every room, and the flicker is the
cheapest of the three. Surfaced to the user as `ThemeDef.cosmeticWarning`, a new
advisory field `validateParameters` reports **once per theme** (not per level),
so choosing theme `h` explains its own quirk instead of looking like a bug.

Two pieces re-examined under the fence model and deliberately left alone:
`VCapDown` (`h_h_8_dn`) fences its own top edge, which *is* the stub-to-tile-
below boundary, so the end tile is a harmless alcove; and `CornerLD`/`CornerRD`,
whose small polygons (x 0.88…1.31 / x −0.31…0.13, y −0.31…0.19) sit precisely at
the tile corner where the vertical and horizontal fences meet — they are the
joint pieces for the 2-way case, and are already correct.

### 2026-08-01 — anchor is not the whole story: a `theme_h` piece's `<frame>` height decides its offset
**Tag:** [VERIFIED] (played in game, then read from the install at
`D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch\editor\assetsExtract\`)
**Context:** A player reported walking out of the level through the **top-left
and top-right corners of every room** in a theme `h` level, while the bottom
corners held. Supersedes the 2026-08-01 "every `doodads/theme_h/` piece is
anchored `0 0`" entry, which is true about `<origin>` but wrong about what
follows from it.
**Evidence:** Every `theme_h` piece really does declare `<origin>0 0</origin>`,
but the folder mixes two sprite sizes, and the collision polygon sits at a
different place in each:

| piece | `<frame>` | collider y | tiles below anchor |
| --- | --- | --- | --- |
| `h_crn_l_dn` / `h_crn_r_dn` | `16 16` | `-5 … 3` | −0.31 … 0.19 — own tile |
| `h_crn_l_up` / `h_crn_r_up` | `16 32` | `16 … 32` | **+1.00 … +2.00** |
| `h_h_8_up` | `16 32` | `13 … 32` | +0.81 … +2.00 |
| `h_h_cap_up_l` | `16 32` | `6 … 32` | **+0.38 … +2.00** |
| `h_h_cap_up_r` | `16 32` | `4 … 32` | **+0.25 … +2.00** |
| `h_h_8_dn`, `h_v_8_l`, `h_v_8_r` | `16 16` | within `-2 … 16` | own tile |

So `<origin>0 0</origin>` means "no *extra* compensation", not "collider is on
this tile". The folder's **five** 16×32 pieces draw a tall cliff face upward and
hold their polygon in the lower half; flattened to `yOffset: 0` they put both
the art and the barrier one full tile below the wall. `h_h_8_up` was already
special-cased at `-1`; the two *up* corners and both `h_h_cap_up_*` are the
identical case and were missed. The corners are exactly the reported hole — and
also why they looked "awkward", since the sprite was a tile low too.
**Impact:** `CornerLU`, `CornerRU`, `HCapLeft` and `HCapRight` all take
`yOffset: -1` in `desertOutdoor()`. Rule for any future theme: **read the
asset's `<frame>` height and its polygon's y range — never infer the offset from
`<origin>` alone.** Recorded in `ASSET-REGISTRY.md`; `themes.test.ts` pins the
offset of every 16×32 piece so a regression cannot land silently. No seed
changes — doodad *placement* moved, the RNG stream did not.

**Follow-up:** fixing the anchors did *not* close the map. See the newer
edge-fence entry above — a second, independent hole sat in the `CrossWall`
corner joint.

### 2026-08-01 — theme `h` no longer borrows any art from theme `i`
**Tag:** [EMITTED] (packs and generates; the visual call came from in-game
screenshots of the previous behaviour)
**Context:** `CrossWall`, `VCapUp` and `VCapDown` have no cliff equivalent in
`doodads/theme_h/` and were filled from `theme_i`, the indoor half of the
desert set.
**Evidence:** In game, theme `i`'s grey indoor stone among theme `h`'s sand
cliffs reads as another tileset's wall dropped into the desert — the same
mistake `omitCover` already avoids for the occlusion overlay.
**Impact:** These three now map onto the horizontal cliff faces by facing, the
way the tees already do: `VCapUp` → `h_h_8_up` (`yOffset: -1`, 16×32),
`VCapDown` and `CrossWall` → `h_h_8_dn`. Theme `h` is now self-contained —
`themes.test.ts` asserts no emitted level references `theme_i` at all. The
cross is an interior junction its neighbours largely cover, so reusing the
bottom face there costs little. Still `[EMITTED]`: nobody has confirmed the
cross reads correctly in game.

### 2026-08-01 — the monster roster now carries a campaign-act tag for the GUI filter
**Tag:** [UNVERIFIED] (transcribed from the fandom wiki, not observed in game)
**Context:** Issue #4 asked for the monster pool lists to be filterable by the
act a player meets each monster in, rather than only by our internal
`Classic/Desert/Towers/Special/Bosses/Bonus` groups.
**Evidence:** The act membership comes from the maintainer's reading of
<https://hammerwatch.fandom.com/wiki/Castle_Hammerwatch> and
<https://hammerwatch.fandom.com/wiki/Temple_of_the_Sun>, quoted in
[issue #4](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/4#issuecomment-5140162966):
Act 1 ticks/bats/maggots/flower towers; Act 2 maggots (first floor only),
skeletons, slimes, archers, nova towers; Act 3 eyes, wisps, lich, flower
towers, nova towers; Act 4 no new enemies, a subset of 2 and 3. Nobody has
walked the campaign with a checklist to confirm it.

Two mappings are ours, not the wiki's, and are the first things to re-check if
the tagging looks wrong in the GUI:

- **Mini-bosses inherit their base monster's acts** (`mb_tick` → Act 1,
  `mb_skeleton` → Acts 2/4, and so on). The wiki lists monsters, not the `_mb`
  variants.
- **`mb_doomspawn` → Act 4.** Inferred from it being the final encounter's
  spawn. Not stated by either page.
- **`mb_mummy` → Temple of the Sun.** It sits in `group: 'Bosses'` rather than
  `'Desert'`, so it needs an explicit override in `monsterCategories`; the rest
  of the desert roster falls out of `group === 'Desert'` on its own.

Everything the wiki does not place — `spider`, `floater_fire`, `pillar_fire`,
`special_beheaded_kamikaze`, the banner/tracking/static-frost/battlement towers
and `tower_empty` — is deliberately untagged and shows under "Other".
**Impact:** `MonsterTypeDef.acts` and `monsterCategories()` in
`src/generator/objects/monsterTypes.ts`; consumed only by
`MonsterFilterBar.tsx`. Presentation metadata — the generator never reads it,
no `DungeonParameters` field was added, and no seed changes. Correcting an act
tag is safe at any time: it moves a checkbox between filter chips and nothing
else. Not promoted to `ASSET-REGISTRY.md` — that file tracks asset paths and
editor constraints, and this is campaign lore.

### 2026-08-01 — an outdoor theme should emit no `Cover` at all
**Tag:** [VERIFIED] (screenshot of a packed theme `h` level)
**Context:** Theme `h` borrowed `color_theme_i_16` for `Cover`, since no
`color_theme_h_16` exists.
**Evidence:** In game the overlays render as grey stone slabs lying flat on the
desert sand — one under the player, more along the wall band — and break up the
cliff silhouette. `Cover` exists to hide the character behind wall *tops*, which
presumes a tall solid wall seen from the front. Theme `h`'s "walls" are low cliff
edges with open ground behind them, so there is no wall top and nothing to hide.
**Impact:** New `ThemeDef.omitCover`. It has to be honoured in **both** emission
sites — `buildWalls` in `map/level.ts` (the `wall: false` pattern pass) and the
two the stair prefabs place in `objects/objectSet.ts`; skipping only one leaves
covers on the alcoves. Sets the precedent for any future outdoor theme. Note this
is not the same as "no collider lost": the 2026-07-30 `[RETRACTED]` entry already
established `Cover` carries no collision.

### 2026-08-01 — `h_pyramid_exit_door` is the door leaf, not the doorway
**Tag:** [VERIFIED] (screenshot of a packed theme `h` level)
**Context:** Theme `h` ships no stair frames; `h_pyramid_exit_door` was chosen
for both ends because it was the only alcove-sized piece with a collider.
**Evidence:** At alcove size it reads as two loose planks rather than a door —
it is only the leaf. `h_pyramid_exit` (55×59, `<origin>31 59</origin>`) is the
full doorway structure and is what the alcove should show, at the cost of
declaring no collision polygon of its own.
**Impact:** Both stair ends now use `h_pyramid_exit` at `{1.21875, 0.25}`,
centring its 3.44-tile width on the 2-tile alcove and resting its base where the
door's was, and theme `h` declares `stairBacking: 'Horizontal'` again. Lesson:
"has a collider" is not sufficient grounds to pick an exit piece — check what the
sprite actually depicts at the size it will be drawn, and reach for `stairBacking`
rather than letting the collider choose the art.

### 2026-08-01 — theme `h` is a usable outdoor desert set; the "only four corners" finding was a false negative
**Tag:** [VERIFIED] (read from `doodads/theme_h/` and `tilemaps/h_default.xml`
supplied from a real install)
**Context:** Adding theme `h` so the Desert group covers outdoors (`h`) as well
as indoors (`i`).
**Evidence:** The folder holds 24 files, not four. The earlier survey searched
the editor's Doodads tab for the classic suffixes (`_crn_*`, `_h_8`, `_v_8`,
`_x_x`, `_x_t_*`) and missed everything named differently. What is actually
there: `h_crn_{l,r}_{dn,up}` (+ `_v2` alternates) — the corners match the classic
names exactly — plus `h_h_8_dn`/`h_h_8_up`, `h_v_8_l`/`h_v_8_r`,
`h_h_cap_up_l`/`h_h_cap_up_r`, `h_h_16_dn/up`, `h_v_16_l/r`, `h_deco_rock`,
`h_exit_special`, and the four `h_pyramid*` pieces. There is genuinely no
`x_x`, no `x_t_*`, no `v_cap_*` and no `color_theme_h_16`.
**Impact:** Supersedes the 2026-07-30 note inside the sprite-origin entry and
the "no usable theme `h`" paragraph in `ASSET-REGISTRY.md`, both now rewritten.
`themes.ts` gains `desertOutdoor()`; `tests/themes.test.ts` no longer asserts
`THEMES` excludes `h`. Generalisable lesson: survey an asset folder by listing
it, not by searching it for names another theme uses.

### 2026-08-01 — every `doodads/theme_h/` piece is anchored `0 0`, like the bonus art
**Tag:** [VERIFIED] (read from the supplied asset XML)
**Context:** Choosing offsets for theme `h`, under the rule that `yOffset` =
the asset's `<origin>` y ÷ 16.
**Evidence:** `h_crn_l_dn.xml`, `h_h_8_dn.xml`, `h_v_8_l.xml` and every other
wall piece declare `<origin>0 0</origin>`, where `a_h_8.xml` is `0 32` and
`a_v_8.xml` is `0 16`.
**Impact:** All of theme `h`'s wall offsets flatten to 0, reusing the mechanism
`bonus()` introduced. This is also why its four corners need no path override:
their names already match the template, so only the anchor differs. Pieces
borrowed from `theme_i` must *not* inherit the flattening — theme `i` carries
the classic anchors, and a stray `yOffset: 0` slides its collider off its sprite.

### 2026-08-01 — the tees are ~84% of a level's wall doodads, so junction art decides how a theme looks
**Tag:** [VERIFIED] (measured from the generator, 8 seeds × 8 levels, theme `a`)
**Context:** Deciding whether theme `h` could borrow `theme_i`'s junctions.
**Evidence:** Piece mix — `TRight` 22.3%, `TLeft` 22.0%, `TUp` 20.9%, `TDown`
20.4%, `CrossWall` 6.5%, corners 6.2%, straights 1.7%, caps 0.03%. `VCapDown`
appeared 6 times in 64 levels. Borrowing all seven missing pieces would have
rendered an `h` level ~92% as theme `i`.
**Evidence (mapping):** a `T*` pattern is a wall mass with the opening on
exactly one side, which is what a directional cliff edge is — and theme `h`'s
names line up one for one: `TDown`→`h_h_8_dn`, `TUp`→`h_h_8_up`,
`TLeft`→`h_v_8_l`, `TRight`→`h_v_8_r`. That is very likely *why* the folder
ships facing variants and no junctions.
**Impact:** Theme `h` maps its tees onto its own faces and borrows only
`CrossWall`, `VCapUp`, `VCapDown` and `Cover` — 591 theme-`h` wall pieces to 41
borrowed on a sample level. Worth checking first for any future non-classic
theme: a missing tee matters ~50× more than a missing cap.

### 2026-08-01 — theme `h`'s exit pieces are mostly not solid; only the pyramid door can back an alcove
**Tag:** [VERIFIED] for the polygons, [UNVERIFIED] for the offsets
**Context:** Theme `h` ships no `exit_h_dn`/`exit_h_up`, so the stair alcove
needed a substitute.
**Evidence:** `h_exit_special.xml` (32×32, `<origin>16 16</origin>`) declares no
`<polygon collision="true">` at all — it is a hole in the floor. `h_pyramid_exit.xml`
also declares none. `h_pyramid.xml` is 192×192 with a solid box, far larger than
the 2-tile alcove. `h_pyramid_exit_door.xml` is 32×36, `<origin>16 40</origin>`,
with a `-16..16 × -40..0` collider — alcove-sized and solid.
**Impact:** Both `ExitUp` and `ExitDn` use the pyramid door at `{1, 0.5}`, which
derives from origin `(1, 2.5)` tiles and the prefab placing the piece at
`(x+2, y+3)` with the opening on wall row `y+1`; the collider then covers
`x+2..x+4 × y+1..y+3.5`. Because that closes the opening, theme `h` declares no
`stairBacking`. **Verify in game** — if a gap shows, add
`stairBacking: 'Horizontal'` as the bonus themes do. Same status for the
`h_h_8_up` anchor (`yOffset: -1`, chosen because it is the only 16×32 face and
its collider sits in the lower half) and for whether each cliff face points out
of the wall mass rather than into it.

### 2026-08-01 — tileset variant counts must exclude `<borders>` sprites
**Tag:** [VERIFIED] (read from `tilemaps/h_default.xml`)
**Context:** `ASSET-REGISTRY.md` recorded theme `h` as having 14 sprites.
**Evidence:** `h_default.xml` has exactly 2 top-level `<sprite>` elements. The
other 12 are inside `<borders>` — `north`, `south`, `east`, `west`, four
corners and four `*pit` variants — and are chosen by the engine, not by
`data-t`. The 14 figure counted every `<sprite>` tag in the file.
**Impact:** Theme `h` is registered with `tiles: 2`. `getTiles` emits
`1..tiles`, so an inflated count would have emitted floor indices the tileset
cannot resolve. **Follow-up:** the same miscount may inflate `d: 8` and `i: 8`
— re-count their top-level `<sprite>` elements when those files are available.

### 2026-07-31 — the lobby now ships visuals with proper walls and lighting; campaign-local doodads render in-game
**Tag:** [VERIFIED] — Windows 10, Hammerwatch 1.41, real Steam install.
**Context:** Final in-game verification run after importing the editor-saved lobby with its campaign-local assets.
**Evidence:** The user played the lobby in-game. Walls render (tested walking the full perimeter — cannot leave the room). Torches and lighting render. Stalls and vendor doodads render. Diamond pickups work and pay out gold. Deselected stalls (whole vendor removed) work correctly. The exit teleport works (lands in dungeon level 0). Zero/1500/12000 gold all pay out correctly.
**Impact:** Promotes the 2026-07-31 "fallback lobby" entry's replacement to fully `[VERIFIED]`. The campaign-local files in `LOBBY_ASSETS` work as shipped — close open question 1a, at least for doodads. Update `ASSET-REGISTRY.md` § "The lobby template" from `[EMITTED]` to `[VERIFIED]`.

### 2026-07-31 — the script-authored fallback lobby is not enclosed; replaced by the real editor-saved level
**Tag:** [VERIFIED] for the failure, [SUPERSEDED] by the entry immediately above for the replacement.
**Context:** The Lobby tab worked functionally on a real install — level
transition, shops and gem pickup all behaved — but looked wrong. Supersedes the
2026-07-31 fallback-lobby entry below, which flagged exactly this as the thing
to re-check first in game.
**Evidence:** Screenshot from Hammerwatch 1.41: a flat brown room with no wall
art, and the user reports "walls are missing and I can hop off the map". The
fallback's ring of stock `doodads/theme_c/c_h_8` / `c_v_8` at the offsets
`src/generator/objects/doodad.ts` uses does **not** close the room — a ring
computed for a room whose floor is a multiple of 8 still leaves the party a way
out. Not chased further, because the fix was to stop authoring the room at all.
**Impact:** `src/generator/lobby/template.ts` is now the campaign's own
`levels/test_lobby.xml`, imported verbatim, and `LOBBY_ASSETS` carries the 10
campaign-local files it needs. Three things this taught us about consuming
editor output, all now handled in code:

- **The editor saves UTF-8 with a BOM and CRLF.** Both are normalized in
  `scripts/import-lobby-assets.mjs` (`clean()`) so the committed constant and
  the string it produces are the same text.
- **Editor dialect ≠ `Level.getXML()` dialect.** Positions are
  `<vec2 name="pos">x y</vec2>`, not `<float name="x">`/`<float name="y">`;
  indentation is tabs; items are `<array name="items/<type>.xml">` holding
  `<array><int>id</int><vec2>x y</vec2></array>` per placement, not a dictionary
  per item. `buildLobby`'s text surgery reads both — it matches whitespace
  rather than assuming it — and now emits the editor's items form. At zero gold
  the items section is left **empty** rather than holding an empty `<array>`,
  by analogy with the empty-`<int-arr>` crash above.
- **A hand-authored template's element ids are nothing like ours** (56–69 for
  doodads, 3294–3365 for nodes and items). Rather than transcribe them, the
  import script now *derives* `LOBBY_TEMPLATE_IDS`, `LOBBY_EXIT_NODE_ID`,
  `LOBBY_DIAMOND_SLOTS` and `LOBBY_ITEM_ID_BASE` from the file it reads —
  stalls by their `ShopArea`'s `cats` prefix, the stall's doodads by standing on
  the same spot as its vendor, the slots by the distinct positions of the
  authored diamonds. A re-import of a different lobby stays correct with no
  hand-editing, and throws if a stall, the exit or the diamonds are missing.

Confirms the `CircleShape` note below: the real template uses `CircleShape`
under each `ShopArea` and `buildLobby` never looks at a shape's type, only its
id. Still `[EMITTED]`, pending a pack-and-play run: that the campaign-local
`doodads/level1/*` + `c_blood.png` and `lamp_torch_post_spor.xml` +
`lamp_torch_post.png` render when shipped inside *our* campaign folder rather
than the one they were authored in — which is also what closes open question 1a.

### 2026-07-31 — an empty `<int-arr>` crashes `LevelPacker.exe`; string level ids are fine
**Tag:** [VERIFIED] — Windows 10, Hammerwatch 1.41, real Steam install.
**Context:** "Install into Hammerwatch" failed on the first run of the Lobby tab
against a real install. No `.hwm` was produced. Supersedes the `[UNVERIFIED]`
2026-07-31 fallback-lobby entry below on the two points it guessed at.
**Evidence:**

1. **Empty `<int-arr>` is fatal.** The packer died with:

   ```
   Unhandled Exception: System.FormatException: Input string was not in a
   correct format.
     at System.Number.StringToNumber(...)
     at System.Int32.Parse(String s, IFormatProvider provider)
     at TiltedEngine.SValue.ParseXMLNode(XElement node)  SValue.cs:220
     at TiltedEngine.SValue.ParseXMLNode(XElement node)  SValue.cs:194   (x2)
     at TiltedEngine.SValue.ParseXMLNode(XElement node)  SValue.cs:182
     at TiltedEngine.SValue.ParseXMLNode(XElement node)  SValue.cs:194   (x3)
     at ARPGLevelPacker.Program.LoadLevelInfo(String path)
   ```

   The cause was one node in `levels/lobby.xml`:

   ```xml
   <dictionary name="shape">
   <int-arr name="static"></int-arr>
   </dictionary>
   ```

   `ParseXMLNode` splits an `int-arr` body and hands each token to
   `Int32.Parse`; an empty body yields `Int32.Parse("")`. It was the only empty
   `int-arr` in the 5.2 MB campaign, and there are **zero** empty `int-arr` in
   any shipped `campaign/`, `campaign2/` or `example/` level. Filling it with
   the id of the `RectangleShape` already at the teleport pad
   (`<int-arr name="static">10</int-arr>`) made the same folder pack: `Scanning
   and reading files... / Writing resource file...`, exit code 0, a 163 KB
   `.hwm`. Nothing else changed.

   **Rule: every `<int-arr>` must contain at least one integer.** A node with
   nothing to reference must still name something — sharing one shape id across
   several nodes is normal, `campaign/levels/level_2.xml` reuses single shape
   ids across up to four.

2. **Non-numeric level ids in `levels.xml` are legal.** This was the leading
   theory for the crash and is **[REFUTED]**. The stock game ships them:
   `campaign2/levels.xml` has `<levels start="hub">` with `<level id="hub" …>`,
   and `campaign/levels.xml` has `id="boss_1"`, `id="bonus_1"`, `id="esc_1"`,
   `id="10b"`. The third-party `pht6_quiky_dreadmann_mansion` ships
   `start="start"`. `LOBBY_LEVEL_ID = 'lobby'` and `start="lobby"` pack fine.

3. **The exit teleporter doodads are under `generic/`, not `special/`.** The
   lobby template referenced `doodads/special/exit_teleport.xml` and
   `…_stand.xml`; neither exists. `assetsExtract/doodads/special/` contains only
   `bonus_exit.xml`, `bonus_teleport.xml`, `minimap_exit_dn.xml`. The real paths
   are `doodads/generic/exit_teleport.xml` and
   `doodads/generic/exit_teleport_stand.xml`. A missing doodad does **not** stop
   the pack — it surfaces later as a `Resource error:` line in
   `<HW>/editor/game.log` and the doodad simply does not render. Every other
   asset the lobby references resolves, so `LOBBY_ASSETS` stays empty and the
   campaign folder needs no copied assets.

4. **Script node type names that exist in the 1.41 binaries** (string search):
   `AllPlayersAreaTrigger`, `ShopArea`, `LevelExitArea`, `LevelStart` in
   `Hammerwatch.exe`; `RectangleShape`, `PlaySound` in `TiltedEngine.dll`.
   Caveat: `AllPlayersAreaTrigger` appears in **no** stock campaign level, so
   the lobby's trigger→exit chain is recognised but its runtime behaviour is
   still unwitnessed.

5. **Partially answers open question 3.** On malformed input `LevelPacker.exe`
   exits non-zero and writes the .NET stack trace to stderr, leaving the
   unpacked folder in place. On success it prints two progress lines and exits
   0. The trace is genuinely useful — `src/main/packer.ts` currently discards
   the packer's stdout/stderr, which is why this one had to be read off a
   screenshot.

**Impact:** Fixed in `scripts/import-lobby-assets.mjs` (the authoring source;
`src/generator/lobby/template.ts` is generated from it) and pinned by
`tests/lobby.test.ts` — "never emits an empty or non-integer int-arr". Promote
the `generic/exit_teleport*` paths into `ASSET-REGISTRY.md`. Open question 1a is
still open: this proves the lobby *packs*, not that it *renders*.

### 2026-07-31 — the Lobby tab ships a fallback lobby, not the Dreadmann template
**Tag:** [UNVERIFIED] — nothing in this entry has been loaded in game.
**Context:** Implementing `docs/plans/lobby-tab.md`. The plan's source of truth
is `<HW>/editor/pht6_quiky_dreadmann_mansion/levels/test_lobby.xml` plus six
custom files (`doodads/level1/c_*.xml` + `c_blood.png`,
`doodads/lamp_torch_post_spor.xml` + `lamp_torch_post.png`).
**Evidence:** No Hammerwatch install exists in the dev container — no
`assetsExtract`, no `LevelPacker.exe`, no campaign folders — so the template and
its two PNGs could not be read. `scripts/import-lobby-assets.mjs --from <dir>`
imports them when someone runs it on a machine that has the game; run with no
`--from` it authors a fallback lobby instead, which is what is committed.
**Impact:** The committed `src/generator/lobby/template.ts` is *ours*, not the
Dreadmann file, and differs from the plan's decoding in four places, all
deliberate:

- **Positive coordinates.** A tilemap block at `(bx, by)` samples world
  `(bx - 10 + i%20, by - 10 + i/20)`, so the plan's origin-centred room
  (x -13..14, y -10..12) needs nine 20x20 blocks to cover its corners where a
  positive room needs four. Relative layout is unchanged: spawn left, pad right,
  diamonds above, vendor row below.
- **`RectangleShape`, not `CircleShape`, under each `ShopArea`.** The plan
  decodes `CircleShape` (`diameter 2`) from the real template. This port has
  never emitted a `CircleShape` and `NodeTypeName` has no entry for it, whereas
  `RectangleShape` + `ShopArea` is exactly what `ObjectSet.create(…, 'Shop')`
  emits for every dungeon shop room. Took the shape this pipeline already ships.
  When the real template lands, `CircleShape` comes with it — `buildLobby`
  locates the shape by id and never looks at its type.
- **Stock assets only, so `LOBBY_ASSETS` is empty.** The six custom files are
  `doodads` and their textures — decoration. The fallback's walls are stock
  `doodads/theme_c/c_h_8`, `c_v_8` and the four corners, at the offsets
  `src/generator/objects/doodad.ts` already applies to that art, sized to a
  multiple of 8 so the segments tile with no gap. Wall doodads carry the
  collision, so a gap here is a hole the party walks through — worth re-checking
  first in game.
- **`items` in the level dialect, not the editor-saved dialect.** The plan notes
  the real file stores items as
  `<array name="items/valuable_diamond_red.xml">` with nested id/vec2 arrays.
  The fallback uses `<array name="items">` of id/type/x/y dicts, which is what
  `Level.getXML()` emits and what this pipeline has always packed.

Paths used by the fallback that nothing here has confirmed exist:
`doodads/special/exit_teleport.xml`, `doodads/special/exit_teleport_stand.xml`,
`doodads/special/vendor_power.xml`, `doodads/special/vendor_speech_<vendor>.xml`,
`doodads/special/vendor_speech_level<0-6>.xml`,
`items/valuable_diamond_red.xml`, and the node types `AllPlayersAreaTrigger` and
`PlaySound` with `sound/misc.xml:info_teleport_activate`. All are attested by the
plan's reading of a real campaign, none by us. The in-game run listed under
"In-game verification" in the plan is still required, and it is also what closes
open question 1a.

### 2026-07-31 — `tower_empty` spawns as a killable obstacle with no damage output
**Tag:** [VERIFIED] (played in game, confirmed by the user)
**Context:** `tower_empty` was previously emitted but untested in-game; the Lobby
tab and other playtests could now confirm it.
**Evidence:** The user placed and played a level with `tower_empty` monsters. They
confirmed the obstacle blocks movement (full 32×32 polygon) and has HP (killable),
but deals no damage to the player. Matches the actor XML spec: 450 HP, empty
`skills`, passive movement.
**Impact:** Move `tower_empty` from `[EMITTED]` to `[VERIFIED]` in
`ASSET-REGISTRY.md`. Default of 0 is appropriate since it walls passages rather
than attacking. No validation or emission changes needed — the behavior matches
the intent.

### 2026-07-31 — `skeleton_3` is speed-capped, not HP-capped: 100 per lair is the safe ceiling
**Tag:** [VERIFIED] (played, reported by the user)
**Context:** `skeleton3` shipped at `defaultMax: 200`, reasoned from HP alone —
20 HP against `skeleton1`'s 40, so double the cap, the same
weaker-monster-higher-cap trade as `bonus_skeleton1`.
**Evidence:** Playing a floor pooled to `skeleton3`: *"their attack speed are
really fast and I get swarm and overrun quite quickly by them which make them
have high DPS."* No frame-rate complaint — this is a balance ceiling, hit well
before the ~400/lair lag ceiling in the 2026-07-30 entry.
**Impact:** `defaultMax` lowered from 200 to 100 — `skeleton1`'s own default — in
`monsterTypes.ts` and `parameters.default.txt`. The general rule the HP
reasoning missed: **for a fast melee monster, speed sets the cap, not HP.**
`bonus_skeleton1` (10 HP, capped 300) is slow, which is why the same trade
holds there. Check movement speed before scaling a cap by HP again. Confirms
`skeleton3` spawns from a generated floor, so it moves `[EMITTED]` →
`[VERIFIED]` in `ASSET-REGISTRY.md`; `tower_empty` is also now `[VERIFIED]`.

### 2026-07-31 — the roster shipped an actor path the game never had
**Tag:** [VERIFIED] (file listing from a real install)
**Context:** Auditing all 187 actor XMLs in `editor/assetsExtract/actors/`
against the 49 types in `monsterTypes.ts` — see `docs/plans/all-monsters.md`.
**Evidence:** `tower_archer2` pointed at `actors/tower_battlement_archer_2.xml`.
`grep -rl tower_battlement_archer_2` over the whole `editor/` tree returns
nothing — no XML, no PNG, no reference from any level or actor. The game
shipped battlement archer **1** and **3** only; archer_1 even reuses
`tower_battlement_archer_3_razed.xml` as its corpse. The type has
`defaultMax: 0`, so it only bites a user who enables it, and then it writes
`<string name="type">actors/tower_battlement_archer_2.xml</string>` into a
level the game cannot resolve. Same class of defect as the `>undefined<` path
below, and nothing caught it: the tests checked tier-array *shape*, never that
a path resolves to a real file.
**Impact:** `tower_archer2` is repointed at `actors/tower_battlement_empty.xml`
and marked `deprecated` (new optional field on `MonsterTypeDef`) so the GUI
hides it. The id survives for `parameters.txt` back-compat — deleting it would
turn a saved pool entry into a hard validation error, breaking user projects.
`tests/fixtures/actor-paths.txt` is now a committed allow-list of real actor
paths, and `tests/monsters.test.ts` validates every roster entry against it.
This test would have caught the phantom path on the first run. Registry updated.

### 2026-07-31 — `skeleton_3` is a real monster the generator could not place
**Tag:** [VERIFIED] (stats and level references read from a real install)
**Context:** Same audit. Of 82 live in-scope actors, 79 were already wired.
**Evidence:** `actors/skeleton_3.xml` — 20 HP, 8 dmg, speed **1.1** (vs
skeleton_1's 40 / 20 / 0.4), aggro 14, `behavior="melee"`, full 8-direction
sprite set, `effects/gibs/gib_skeleton_3.xml` present. Placed in stock
`campaign/levels/level_10.xml`, `level_11.xml` and `level_esc_1.xml`, and it is
what `lich_3.xml` summons (3 per cast, 2 s timer). No spawner and no
small/elite variant ship for it. Also found: `actors/tower_battlement_empty.xml`
is a real actor (450 HP, `multiplayer-scale-hp false`, **empty `skills`**,
`movement: passive`, full 32×32 blocking polygon, corpse →
`tower_battlement_empty_razed.xml`), used in `campaign2/levels/level_temple_3.xml`
and `level_boss_1.xml` — an obstacle, not an attacker.
**Impact:** Both added to the roster as `skeleton3` (cap 100, single-tier) and
`tower_empty` (cap 0, because the collision polygon can seal a corridor). Both
now `[VERIFIED]` in play. No rooms-only restriction needed for `tower_empty`.

### 2026-07-31 — `tower_static_frost_ground.xml` is a doodad, not an actor
**Tag:** [VERIFIED] (read from a real install)
**Context:** Same audit — it sat in `actors/` and looked like a missing monster.
**Evidence:** Its root element is `<doodad>`, not `<actor>`. It is the ground
decal drawn under the frost tower, which is why `tower_static_frost.xml` is
wired and this is not.
**Impact:** Out of scope for `monsterTypes.ts` — belongs to the doodad registry
whenever doodad work happens next. Not added. Also noted, no action:
`guard_1.png` … `guard_4.png` exist with no accompanying XML, so they are not
placeable actors. And all 27 in-scope `*_razed.xml` files are named in a live
actor's `corpse` entry; none is ever placed directly, so none belongs in the
roster.

### 2026-07-30 — money items stack on a single coordinate and pay out in full

**Tag:** [VERIFIED] — observed by the user in play, Windows.

**Context:** designing the Lobby tab's "starting gold" knob
(`docs/plans/lobby-tab.md`). Gold is spawned as `items/valuable_diamond_red.xml`,
a stock money item worth **500** each (`<entry name="amount"><int>500</int></entry>`
in its `behavior` dict). The lobby template we are starting from,
`pht6_quiky_dreadmann_mansion/levels/test_lobby.xml`, authors only 12 diamond
positions on a 6×2 grid — `x ∈ {−7.5, −4.5, −1.5, 1.5, 4.5, 7.5}`, `y ∈ {−8, −10}` —
which caps a one-per-slot scheme at 6000 gold. The open question was whether
placing several items on the *same* `vec2` renders and awards them all, or
whether the engine collapses or drops the duplicates.

**Evidence:** the user placed diamonds beyond the 12 authored slots and collected
**12000 gold** in game (HUD screenshot, "PRISON / Floor 1"). 12000 / 500 = 24
diamonds over 12 positions, i.e. two deep on every slot, all of them picked up and
credited. No visual glitch and no lost pickups reported.

**Impact:** starting gold is not bounded by the template's floor space.
`LOBBY_GOLD_MAX` in the plan no longer needs to clamp at 6000, and the round-robin
slot walk (13th diamond returns to slot 0) is a supported layout rather than an
experiment. Also generalises: any level that wants a large money drop in a small
area can stack money items rather than needing distinct tiles.

**Follow-up — still unknown, do not present as settled:**

- **Maximum practical stack depth.** Two deep is confirmed; nothing above that is.
  There is a plausible ceiling from pickup radius or render overdraw, and the
  ~300-monster performance note above is a reminder that this game has soft limits
  that only show up in play. Until someone tests ~5 deep, treat depth 2 as the
  confirmed figure and anything higher as expected-but-unproven.
- **Shared vs per-player gold.** The screenshot is a single-player run, so it does
  not say whether a 12000 drop gives the *party* 12000 or gives *each* player
  12000. This decides what the Lobby tab's "starting gold" label should promise.
  Test with two players before the label claims either.

### 2026-07-30 — a published campaign ships its own assets inside the campaign folder

**Tag:** [UNVERIFIED] — file listing from a real install; not yet observed loading.

**Context:** open question 1 ("Can a campaign ship its own assets?"), reopened
while planning the Lobby tab, which wants to ship two non-stock doodads.

**Evidence:** `<HW>/editor/pht6_quiky_dreadmann_mansion/` — a third-party campaign
distributed on the forums — contains `actors/` (22 files), `doodads/` (47),
`effects/` (6), `items/` (2), `projectiles/` (3), `sound/` (9), `tilemaps/` (8)
and `tweak/` (7), including `.png` textures alongside the `.xml`. Its
`levels/test_lobby.xml` references these by the same flat relative paths used for
stock assets — e.g. `doodads/level1/c_v_16.xml` and `doodads/lamp_torch_post_spor.xml`,
neither of which exists in `editor/assetsExtract/`. Cross-checked every path the
file references: only those two families are non-stock. So the campaign is either
relying on campaign-relative resolution, or it is broken — and a campaign
published for others to play is unlikely to be broken.

**Impact:** strong circumstantial support for shipping custom assets in the
campaign folder, which is what `docs/plans/lobby-tab.md` assumes. It is **not**
proof: nobody in this repo has packed a campaign containing a custom asset and
watched it render. The plan's in-game verification step covers exactly this
(does the blood-textured wall appear, and does it still block?).

**Scope — read this before acting on it.** That run would confirm the **doodad**
path only, and that is all the Lobby tab needs. **Custom actors are deferred to
post-1.0 and are not in scope now:** shipping a monster is a separate question
with its own failure modes (spawner variants, `MONSTER_TYPES` wiring, projectile
and effect and sound dependencies, per-DLC availability) and needs its own
verification run. Do not read a passing lobby run as clearance to add custom
monsters, and do not treat open question 1 as fully closed by it — split the
question if that is what it takes to keep the two apart.

**Follow-up:** whether `LevelPacker.exe` needs the assets present at pack time or
whether it packs whatever files it finds in the folder — relevant because the
generator writes the campaign folder itself and must include them before packing.

### 2026-07-30 — ~400 monsters in one lair is past the game's comfortable limit

**Tag:** [VERIFIED] — observed by the user in play.

**Context:** picking `defaultMax` for `bonus_skeleton1`. The HP ratio against the
vanilla skeleton (10 vs 40) argued for 100 × 4 = 400.

**Evidence:** "400 got hella laggy." Cut to **300**, which is also where `slime`
already sits — the previous highest max in the roster. `bat1` at 200 has never
been reported as a problem.

**Impact:** `defaultMax` for `bonus_skeleton1` is now 300 in `MONSTER_TYPES` and
`parameters.default.txt`. More generally this is the first datum we have on a
*performance* ceiling for horde size, and it constrains any future high-max type:
a lair rolls `trunc(fRand(max/5, max) * monsterMultiplier)`, so `max` is close to
the real worst case per room. Treat ~300 as the ceiling and remember
`monsterMultiplier` scales on top of it — a user at ×2 reaches 600.
**Follow-up:** unknown whether the limit is actor count, this actor's AI, or the
machine; nobody has tested 400 of a *vanilla* type for comparison.

### 2026-07-30 — a single-tier monster emitted `undefined` as its actor path

**Tag:** [VERIFIED] — reproduced in `tests/monsters.test.ts` against the port.

**Context:** adding the bonus archer, which ships an actor but no spawner and so
is the first single-tier type anyone would actually put in a pool.

**Evidence:** `Monster.createRolled` starts at `tier = 1` and only walks upward,
guarded by `tier < type.tiers.length - 1`. For a one-element `tiers` that bound
is `0`, the guard fails immediately, `tier` stays `1`, and `getXML` emits
`<string name="type">undefined</string>`. ~20 existing types are single-tier
(`spider`, `archer3`, `wisp2`, every `mb_*`, every `tower_*`); all sat at
`defaultMax: 0`, which is the only reason nobody hit it. The Java original threw
`ArrayIndexOutOfBounds` on the same line, so this is a crash path of the original
that the port turned into silent garbage — invariant #4 territory.

**Impact:** fixed by clamping with `Math.min(tier, tiers.length - 1)` **after**
the `while`, so the number of `fRand` draws is unchanged and no existing seed
moves. Only single-tier types' emitted XML changes, and their previous output was
`undefined` — there was no working output to preserve. Recorded as a deliberate
divergence in `hammerwatch-java-port/SKILL.md`.

### 2026-07-30 — three `actors/bonus/` monster paths exist in the editor

**Tag:** [VERIFIED] — packed and spawned in game.

**Context:** looking for monsters to pair with the `bonus1`–`bonus5` themes.

**Evidence:** in game: skeleton spawner and actor both spawn in the bonus levels;
the bonus level pool does not include the archer, so it does not appear there,
but the actor path is valid and would work if pooled.

**Impact:** added as `bonus_archer1` / `bonus_skeleton1` in a new `Bonus` group,
appended to `MONSTER_TYPES` (`monsterTypeById` falls back to the positional
`MONSTER_TYPES[3]`, so inserting near the front would change what an unknown id
resolves to). `defaultMax` scales the vanilla defaults by the HP gap — archer
40 × 1.5 = 60, skeleton capped at 300 (400 was laggy). Not added to
`defaultParameters().levelMonsters`, so every existing seed stays byte-identical;
they are opt-in via the pool editor. Note that the archer's spawner *slots* in a
Lair (`Monster.create(..., 0)`) emit the plain archer actor, since tier 0 is all
it has — that's why only the skeleton's spawner appears in the bonus levels.

### 2026-07-30 — the stair sprite is the alcove's back wall, and the bonus pair has no collider

**Tag:** [VERIFIED] — asset XML, confirmed in game by walking through the entrance.

**Context:** with the sprite-origin fix in, bonus walls block correctly, but the
player could still walk straight through the entrance and out of the level.

**Evidence:** `theme_a/a_exit_h_up.xml` carries a solid collider spanning
`0..32 x -24..16` — the stair sprite **is** the wall behind the alcove, which is
why `ObjectSet` marks the alcove `replaceWalls` and lets the prefab supply its
own walls. `special/bonus_entrance.xml` is:

```xml
<doodad defaultlayer="10">
  <sprite scale="16"> … <frame>0 0 24 24</frame> </sprite>
</doodad>
```

No polygon at all — not even a shadow one. `bonus_exit.xml` likewise (layer 0).
So the bonus alcove had a floor, decorative stair art, and nothing solid.

**The alcove geometry, learned the hard way.** `Room.transform` places the set at
`room.y - 2` (`map/room.ts`), so within the prefab's local coordinates **`y + 1`
is the room's wall row and `y + 2` onward is room floor**. A first attempt filled
`y+1..y+3` with solid blocks; two of those rows landed in the middle of the room
and were plainly visible in game. Only `y + 1` may be filled. Horizontally the
prefab already caps the band with `TDown` at `x + 1` and `x + 4`, so the gap is
exactly `x + 2` and `x + 3`.

**Impact:**
- New `ThemeDef.stairBacking`. Bonus themes set it to `'Horizontal'`, and
  `ObjectSet.addStairBacking` closes those two wall-row tiles with an ordinary
  wall segment so the band reads continuous. Lettered themes declare nothing and
  emit nothing new.
- Draw order is by `defaultlayer` — the stair art (10) floats above the wall
  pieces (0) `[VERIFIED]`, so the backing does not hide the door.
- `bonus<n>_pillar.xml` is a bare 16×16 `collision="true"` block with no shadow
  polygon, which looked like ideal filler but is not needed once the fill is
  restricted to the wall row. Still unused by the generator. Note the lettered
  themes name theirs `_special_pillar`.
- **General rule: a prefab that sets `replaceWalls` depends on its own doodads
  being solid.** Before reusing a stair/door sprite from another theme, check it
  declares `<polygon collision="true">`.

### 2026-07-30 — the extracted game assets are readable; check them before theorising

**Tag:** [VERIFIED]

**Context:** three rounds of guessing at why bonus-theme walls did not block.

**Evidence:** the full asset tree is on disk at
`<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/` — `tilemaps/*.xml`,
`doodads/**/*.xml`, and the game's own campaigns under `editor/campaign*/levels/`.
These are plain XML and directly readable. Reading two files
(`theme_a/a_h_8.xml`, `theme_bonus1/bonus1_h_8.xml`) answered in one step what
two playtest round-trips and three hypotheses had failed to.

**Impact:** for any question of the form "what does this asset actually do" —
collision, anchoring, sprite size, tile variant counts, layer order, how the
stock campaign uses a thing — **read the asset**. Only questions about runtime
behaviour need a playtest. Tile-variant counts are the `<sprite>` count;
collision is `<polygon collision="true">`; anchoring is `<origin>`.

### 2026-07-30 — bonus walls did not block because of a sprite-origin mismatch

**Tag:** [VERIFIED] — read from the asset XML.

**Context:** bonus-theme levels loaded and looked plausible, but walls were
visibly misaligned and the player could run through them off the map.
**Supersedes and retracts the `Cover` entry below.**

**Evidence:**

```
theme_a/a_h_8.xml         <origin>0 32</origin>   collider y = -24 .. 16
theme_bonus1/bonus1_h_8   <origin>0 0</origin>    collider y =   0 .. 16
```

Both have colliders, so nothing was "missing". Comparing all 15 matcher-placed
pieces gives an exact rule: **the `yOffset` in `DoodadType` equals the classic
asset's `origin_y / 16`.** `0 32` → 2, `0 16` → 1. Every piece in all five bonus
folders is anchored `0 0`, so applying the classic offsets displaced each wall by
1–2 tiles — sprite and collision polygon together.

Also read directly from the assets, correcting earlier guesses:
- `special/color_theme_a_16.xml` has **zero** `collision="true"` polygons.
  `Cover` is a character-occlusion overlay. The user demonstrated this in game by
  walking *underneath* a cover while the wall was still non-solid.
- Real tile-variant counts: `bonus_1` = 2 (not 1), `bonus_2..5` = 1. Every
  lettered count already in the registry was correct.
- The bonus tilesets work standalone: the stock `campaign/levels/level_bonus_1.xml`
  uses `bonus_1.xml` + `bonus_shadow.xml` as two datasets and **no `_default`
  base layer**, disproving a "missing base layer" theory.
- `tilemaps/h_default.xml` exists (14 sprites) and `doodads/theme_h/` exists, but
  ships only the 4 corner pieces — so "no theme h" is right in effect, and now
  for a documented reason.

**Impact:**
- `ThemeDef.doodadOverrides` values became `{ path?, xOffset?, yOffset? }`;
  bonus themes set `yOffset: 0` on every themed wall piece. New
  `doodadOffset(type, theme)` in `objects/doodad.ts` feeds `Doodad.getXML`.
- **Adding a theme now requires reading the new art's `<origin>`**, not just
  checking that filenames exist.
- Still unconfirmed until played: whether the walls now block, and whether the
  tuned offsets for the 24×24 `bonus_entrance`/`bonus_exit` sprites sit square in
  the 2-tile alcove built for the 32×48 lettered frames.

### 2026-07-30 — [RETRACTED] `Cover` is a collider, not decoration: omitting it lets players walk through walls

**This entry is wrong.** `Cover` has no collision polygons at all; see the
sprite-origin entry above for the real cause. Kept per the append-only rule. The
reasoning error worth remembering: "it was the only difference that *could*
explain it" is not evidence, and it was tagged `[VERIFIED]` off a single
screenshot rather than off the asset that would have settled it in one read.

Its incidental observations — brightness is fine, `tiles: 1` loads — do still
hold. Original entry preserved verbatim below.

---

**Tag:** [VERIFIED] — playtested on Windows, `bonus1`, 8-level campaign.

**Context:** first playtest of the bonus themes added earlier the same day.
Supersedes the "omit `Cover`" decision in the bonus-theme entry below.

**Evidence:** the level loaded, ran fine and was not too dark, but had black
rectangular holes scattered through the play area, and the player could **run
over both the floor and the black areas**, straight out of the map. The black
areas map exactly to wall interiors: `Cover`'s entry in `wallPattern.ts` is
`wall: false` matching a 2×2 block of *wall* tiles at offset 0.5/0.5, i.e. it is
the piece that fills the inside of a thick wall. It was the only bonus-specific
difference that could remove collision — the tilemap `data-t` is emitted
identically to a lettered theme, and the wall-edge pieces (`_h_8`, corners) both
rendered and blocked correctly.

**Impact:**
- Wall doodads carry collision. **A missing wall doodad is a missing collider**,
  not just missing art. `omit` was removed from `ThemeDef` entirely; a theme's
  gaps must be filled with `doodadOverrides`.
- `color_theme_*_16` exists only for `a b c d e f g i` — confirmed by searching
  `color_theme` in the editor's Doodads tab, **nothing for bonus**. All five
  bonus themes borrow `color_theme_a_16.xml` (the most neutral dark blue);
  `coverLetter` in `config/themes.ts` is the retune knob.
- Still unconfirmed: whether restoring `Cover` fully fixes the walk-through, and
  whether the borrowed blue reads acceptably against the teal/orange bonus brick.
- Also observed: bonus brightness in game is **fine** `[VERIFIED]` — the editor
  preview was misleading. `tiles: 1` loads without error `[VERIFIED]`.

### 2026-07-30 — five `bonus` themes exist, with mismatched tileset/doodad naming and no stair frames

**Tag:** [UNVERIFIED] — everything below is read off the editor's asset browser;
nothing has been packed or played yet.

**Context:** adding `bonus1`–`bonus5` to the theme dropdown for playtest.

**Evidence:** the editor's Doodads tab filtered on `theme_` lists
`doodads/theme_bonus3/bonus3_crn_l_dn.xml`, `bonus3_h_8.xml`, `bonus3_x_x.xml`
etc. — i.e. exactly the `doodads/theme_<t>/<t>_*.xml` shape the lettered themes
use, with a multi-character token. Per bonus folder the listing shows **18**
files: the 4 corners, `h_8`/`h_16`, `v_8`/`v_16`, `h_cap_l`/`h_cap_r`,
`v_cap_dn`/`v_cap_up`, the 4 `x_t_*`, `x_x`, and `pillar`; `bonus5` adds
`deteriorate`. The listing is alphabetical and **`exit_h_dn` / `exit_h_up` are
absent** (they would sort between `deteriorate` and `h_16`, where `bonus5` shows
`deteriorate` and nothing else). The user identified
`doodads/special/bonus_entrance.xml` and `doodads/special/bonus_exit.xml` as the
shared replacements.

The Tilemap tab filtered on `bonus` lists `tilemaps/bonus_1.xml` …
`tilemaps/bonus_5.xml` plus `tilemaps/bonus_shadow.xml`. **The naming does not
match the doodad side** — tileset `bonus_3`, doodad folder `theme_bonus3` with
prefix `bonus3`. Painting all five into a map shows each as a single uniform
texture (no visible per-tile variation) and all five markedly darker than the
lettered tilesets.

**Impact:**
- `TILEMAPS` in `map/level.ts` and `THEMES` in `config/parameters.ts` are replaced
  by a single `THEME_DEFS` registry in `config/themes.ts`, because no single
  token derives both path families any more.
- `ThemeDef` gains `doodadOverrides` (verbatim replacement path) and `omit`.
  Bonus themes override `ExitUp`→`bonus_entrance.xml`, `ExitDn`→`bonus_exit.xml`
  and omit `Cover`, since `color_theme_bonus<n>_16.xml` does not exist.
- Bonus `tiles` set to **1**, the only always-in-range value. If a bonus level
  loads and the floor looks too repetitive, that is the number to raise.
- Still open after playtest: do the shared `bonus_*` stair doodads sit correctly
  at our `(0, 0)` `ExitDn`/`ExitUp` offsets, what are the real variant counts,
  are bonus levels too dark to play, and what is `bonus_shadow.xml` for.
- Promote to `[VERIFIED]` in `ASSET-REGISTRY.md` once a packed campaign has been
  played; revert the feature if it has not.

### 2026-07-30 — the game applies the `req` cascade, so one removal flag limits a ladder
**Tag:** [VERIFIED] — played in game, "tiers sold" confirmed working.

**Context:** `applyTiersSold` limits an upgrade ladder by writing a **single**
`player.<file>.remove.<id>` flag — on the first tier to drop — and relying on
`applyTweaks`'s `req` cascade to take the tiers above it. That representation is
what keeps the override map small and makes `deriveTiersSold` exact, but it had
only ever been verified for *whole-chain* removal.

**Evidence:** setting a ladder's "tiers sold" to N produces a shop containing
tiers 1…N and nothing above. This is a stronger claim than the earlier removal
test (a hand-edited `knight.xml` with all of `health-1…5` and `mana-1…5` deleted,
36 of 46 upgrades surviving): there, every removed entry was absent from the file.
Here only *one* entry is deliberately dropped and the rest disappear because each
tier's `req` points at the one below, so the **game itself** is honouring the
dependency — exactly what the cascade in `applyTweaks` assumes.

**Impact:** the boundary-flag representation in `bulk.ts` (`applyTiersSold` /
`deriveTiersSold`) is verified rather than assumed; do not "fix" it by writing a
flag per tier. The one shape `req` cannot express is a *non-contiguous* removal —
drop tier 3 but keep 4 — because 4 requires 3; the UI already surfaces that as
`· custom`. Nothing to promote to `ASSET-REGISTRY.md`: removal is already recorded
there, and this refines how it is driven rather than adding an asset fact.

### 2026-07-30 — an empty `<upgrades>` loads fine, and the Thief crash is not about upgrades
**Tag:** [VERIFIED] — Linux, real install, HMW 1.41. Emitted `thief.xml` and
`shared.xml` from a real generation, read directly, with the campaign played.

**Context:** The fully-upgraded preset now removes every upgrade that can no
longer improve anything, which for six of the seven classes means shipping a file
with no upgrades at all. That was the last open claim in the removal path.

**Evidence:**

1. **An empty `<upgrades>` element is fine.** The emitted `thief.xml` ends:

   ```xml
   	</params>

   	<upgrades>
   	</upgrades>
   </tweak>
   ```

   All 29 params present, zero `<dictionary>` entries. The campaign packed,
   loaded, and played — the crash that followed happened *during combat*, not at
   load. So a class file with an empty shop is valid. Closes the open item from
   the earlier removal entries.
2. **Dead-upgrade removal works as designed on real output.** `shared.xml` keeps
   exactly `life`, `rejuv`, `pot-dmg`, `pot-rejuv`, `pot-invul` — the five
   purchases that carry no stats — and nothing else.
3. **The empty-asset-path fix is working in the wild.** `shared.xml` shows
   `<string name="combo-nova-projectile">projectiles/player_combo_nova_3.xml</string>`
   rather than the empty value that crashed the Ranger.
4. **The Thief `DivideByZeroException` is independent of upgrade presence.** Two
   crashing runs, same trace, same byte-identical Thief `<params>`:

   | Run | `remove` flags | Thief shop | Result |
   | --- | --- | --- | --- |
   | 20:57 | 1 (`life` only) | all 46 upgrades present | DivideByZero in `Autofire` |
   | 22:41 | 107 | empty | DivideByZero in `Autofire` |

   Emitting the same starting params was verified by diffing the generated
   `thief.xml` across the two commits. So neither the removal work nor anything
   else in that round is implicated — this is the same crash that was already
   open.

**Impact:** the removal path is now fully verified. The Thief crash stays open;
what this rules out is recorded in the crash-triage skill. A sweep of every stat
group × factor confirmed that **no Thief stat reachable through the app's controls
lands on 0**, except `chain-money-cost` and `smoke-money-cost`, which the stock
`chain` and `smoke` upgrades also set to 0. The divisor is therefore runtime
state, not a value we write — and since the trace is Thief-specific
(`PlayerThiefActorBehavior`), it is Thief-specific runtime state.

**Update, same day: `max-fervor` FALSIFIED.** It was the leading suspect; the user
removed it (back to stock 0) and the Thief crashed again, identical trace. So it
crashes at both `max-fervor` 10 and 0. Combined with the deduction that every
Thief starting value in the file is individually stock-safe (`knives-speed-mod`
−0.2 is the fastest a stock maxed Thief reaches, and that Thief does not crash),
and that the Sorcerer played the *same* `shared.xml` to completion, this points at
an interaction or a start-vs-upgrade difference rather than a single bad value.
Next step is a bisection (strip every `player.thief.*`), not another guess — see
the crash-triage skill. No code change until it is isolated.

### 2026-07-30 — a skill with an empty asset path crashes the game mid-combat
**Tag:** [VERIFIED] — Linux, real install, HMW 1.41. Ranger, floor 3, mid-fight.

**Context:** A fully-upgraded roster crashed after several minutes of play:

```
System.NullReferenceException: Object reference not set to an instance of an object
  at ARPGGame.Behaviors.Players.PlayerActorBehavior.Update (Int32 ms, …)
```

**Evidence:** Two string params in the stock files are `""` at character creation
and only an upgrade fills them in:

| Param | Filled by |
| --- | --- |
| `shared/combo-nova-projectile` | `combo-nova-1` / `-3` / `-5` |
| `priest/aura-buff` | `aura`, `auraslow-1` / `-2` |

The reported campaign had `combo` on with `combo-nova-dmg` 84 and
`combo-nova-parts` 22 — a combo nova armed with **no projectile to spawn** — while
`combo-nova-projectile` was still `""`. Combo builds during combat, which is why
it died on floor 3 rather than at load, and `PlayerActorBehavior` is the shared
base class, so it reaches every class regardless of which one is played. The same
latent fault existed for the Priest's cripple aura in the same file.

**This was our bug, not the game's.** `applySkillUnlocks` and `applyFullyUpgraded`
wrote an upgrade's *numeric* children and silently dropped its string children,
because `PlayerTweaks` is `Record<string, number>` and strings were excluded from
the field model outright.

**Impact:**

- String params are now fields whose override is an **index** into `choices` —
  every value the stock data gives that param, starting value first. That keeps
  `PlayerTweaks` numeric and makes it impossible to emit a path the game does not
  ship. `applyTweaks` decodes the index back to the string.
- Both presets now advance strings alongside numbers, so a maxed Knight also gets
  `effects/knight_slash_240.xml` for its widened arc — a fidelity fix that fell
  out of the same change.
- **New blocking validation rule** (`armedWithEmptyPath`): a string param that
  starts empty and is still empty while the numbers its upgrades write are live is
  an *error*, not a warning. Derived from the baseline, so a future empty-path
  param is covered automatically. This is the invariant-4 response — the crash
  path is now unreachable through the UI.
- Multipliers explicitly skip string fields; scaling an index would swap the
  projectile for an unrelated one.

**Note on reading the report:** `error.txt` appends, so the file also contained
the earlier Thief `DivideByZeroException` from 25 minutes before. Those are two
different crashes; the Thief one is still open (see the entry below).

### 2026-07-30 — chance stats cap at 100, and a Thief crash the tweaks may not own
**Tag:** [VERIFIED] for the chance cap; the crash is **[UNVERIFIED]** as to cause.
Linux, real install, fully-upgraded roster with Damage ×2 and Defense ×5.

**Context:** Answering "why do I still take damage as a Sorcerer with
`shield-chance` at 500", and triaging a Thief crash from the same campaign.

**Evidence:**

1. **A percentage stat above 100 does nothing extra, but what 100 *means* splits
   in two** `[VERIFIED]`. The cap itself is clear from the stock data:
   `shield-chance` climbs 20/40/60/80/100 and stops exactly at 100, whereas every
   damage ladder keeps climbing. A probability cannot exceed always, so 500 is
   wasted. What took a second test to separate is that the stats fall into two
   kinds that look identical in the data:

   - **Evasion** — `dodge-chance`. At 100 a Thief or Ranger is *literally
     unhittable*: "I basically CANNOT be hit at all… you're practically
     invincible." Note the stock ladder tops out at 50, so a Defense ×2 reaches
     100 and a ×5 sails past it. This is the only real invulnerability lever in
     the tweak files, and it is reachable by accident.
   - **Proc** — `shield-chance`, `bash-chance`, `crit-chance`, `money-chance`, the
     `*-slow` stats. The effect fires every time but the hit still lands. A
     Sorcerer at `shield-chance` 100 takes full damage, because `fshield` is the
     frost-shield proc, not evasion. This is what the original "still taking
     damage as a Sorcerer" report was.

   `shield-distr` is a third thing: the share of damage routed to mana.
   `validation.ts` warns once for the whole set and only claims invulnerability
   for the evasion stats — an earlier draft told everyone to raise `max-health`
   instead, which is wrong advice for a class that has `dodge-chance`.
2. **A Thief crash whose cause the audit does not pin down.**
   `DivideByZeroException` in `GameControls.Autofire(Int32 autofire, Int32 rate)`
   via `PlayerThiefActorBehavior.DoUpdate`; full trace in the crash-triage skill.
   No Thief param in the report was 0. Crucially, the two stats that could
   plausibly feed an attack interval were both at values a **stock maxed Thief
   also reaches**: `knives-speed-mod` −0.2 (end of the `aspeed` ladder) and
   `max-fervor` 10 (end of the `fervor` ladder). The only values beyond stock
   reach were `knives-dmg` 46, `kfan-dmg` 60, `dmg-reduction` 30 and
   `dodge-chance` 250 — none of which divides an interval. That makes a vanilla
   bug at max attack speed + max fervor a live possibility, reachable from spawn
   with the fully-upgraded preset but only late in a normal run.

**Impact:** the chance-cap warning is implemented and tested. The crash is logged
in the crash-triage skill with a three-step bisect whose first test —
fully-upgraded at ×1 — settles whether our multipliers are involved at all. **No
validation rule invented for it yet**, deliberately: guessing at a cause would
put a wrong constraint in front of every user.

### 2026-07-30 — pre-unlocked skills work, and multi-chain removal matches our emitter
**Tag:** [VERIFIED] — Linux, real install at `~/Applications/hammerwatch`, played
in game. Closes claim 4 of the superseded 2026-07-29 "four claims" entry.

**Context:** The last two unknowns behind the quick-setup controls.

**Evidence:**

1. **Pre-unlocking a skill works.** A campaign shipping the skill's `bool` param
   set true *plus* the numeric params the unlock upgrade would have written gives
   a working skill from the first floor — "played around with pre-unlocked skill
   no problem". This confirms the reasoning in `applySkillUnlocks`: the flag
   alone is not enough, because the stock files park the skill's stats on
   sentinels (`whirl-dur: -1`, `nova-mana-cost: 9999`) and the unlock upgrade is
   what fills them in. Applying the whole upgrade is the correct model.
2. **Removing several chains at once behaves, and our emitter agrees byte for
   byte on structure.** A hand-edited `knight.xml` with the `health-1…5` and
   `mana-1…5` ladders deleted (36 of the stock 46 upgrades left) packs, loads,
   and makes neither purchasable. Feeding the same ten ids to
   `player.knight.remove.*` produces the identical upgrade list — same 36 ids in
   the same order, same 107 param/child names, no dangling `req` on either side.
   Locked in as a regression test in `tests/tweakBulk.test.ts` with the id list
   typed out, so a baseline change that altered the shop fails loudly.

**Impact:** `applySkillUnlocks` and the `remove` scope are both verified against
the game now. **Still not tested:** an *empty* `<upgrades>` element — the file
above is a partial removal with 36 upgrades surviving, whereas the "No upgrades"
shop mode removes all of them. That is the one remaining claim in the removal
path, and the cheapest way to close it is to pick "No upgrades", install, and
open a shop.

### 2026-07-30 — the shop, play-tested: replacement confirmed, 5 tiers max, negative prices pay you
**Tag:** [VERIFIED] — Linux, real install at `~/Applications/hammerwatch`, played
in game with a packed campaign. Supersedes the 2026-07-29 "four claims" entry
below and the 2026-07-28 "appear to replace the base file wholesale" entry.

**Context:** Closing out the assumptions the bulk roster editor was built on.
All of these were only testable after the packer-path fix in the entry below —
before it, `tweak/*.xml` keys were absolute and no balance file was ever loaded.

**Evidence:**

1. **Campaign tweak files replace the base game's wholesale. CONFIRMED.**
   Shipping `tweak/knight.xml` with `max-health` at 500 gives a Knight with 500
   HP, normal sword damage, and all five health upgrades in the shop — which
   alone proves nothing, since we emit the complete file either way. The
   decisive test was the opposite one: **deleting** the health upgrades from the
   campaign's file removed them from the shop. Under a merge they would have
   survived from the base file. This is why `baseline.ts` has to carry the full
   1832-line transcription, and it is now a verified requirement rather than an
   inference.
2. **An upgrade chain caps at 5 tiers — an engine limit, not a data one.**
   Appending `health-6` … `health-10` (`cost="0"`, chained by `req`, `lvl` 6-10,
   `cat="misc6"` … `"misc10"`) did **nothing**: no extra rows in the shop, no
   extra health. The game hardcodes 5. Whether the ceiling is the chain length
   or the `cat` namespace (stock only ever uses `misc1-5`, `off1-5`, `def1-5`)
   is still open — see the new open question 11. Either way, "add a tier" is not
   a feature this app can offer, and `chains.ts` is right to only ever rewrite
   the tiers that already exist.
3. **A negative `cost` pays the player.** Buying an upgrade priced below zero
   *gives* you that much gold. Deliberately supported now: it makes a "sell your
   character down" shop possible — start with high stats and buy debuffs for
   money. `validation.ts` allows it and warns once for the whole shop rather
   than once per upgrade.
4. **`999999` is the shop's display ceiling**, and it renders in full (screenshot
   evidence: Health Pool 1 / Mana Pool 1 at 999999, Move Speed 1 at 600). So the
   old "price it out of reach" lockout worked — but finding 1 makes removal
   strictly better, and the app now empties the shop instead of pricing it.

**Impact:** `applyCostPolicy` gained `removed` and `custom` and lost `locked`;
`SHOP_PRICE_MAX` replaces `DEFAULT_LOCK_PRICE` and is now a clamp, not a
mechanism. Open question 8 is struck out above. Findings 1-4 are promoted into
`ASSET-REGISTRY.md`. Nothing here can be promoted about the *skill pre-unlock*
claim (item 4 of the superseded entry); that is still untested.

**Still open after this round:** whether removing *every* upgrade from a file
(an empty `<upgrades>` element, which is what the "No upgrades" mode emits) loads
as cleanly as removing some of them, and whether a chance stat pushed past 100
clamps or misbehaves. The pre-unlocked-skill question was closed the same day —
see the entry above.

### 2026-07-29 — LevelPacker stores its folder argument verbatim as the resource key
**Tag:** [VERIFIED] — Linux, real install at `~/Applications/hammerwatch`,
LevelPacker.exe under wine 7.0.

**Context:** A campaign installed by the app packed and appeared in the level
list, but pressing Start killed the game:

```
Resource error: : Could not find file: <hw>/assets/levels.xml
Unhandled Exception: System.NullReferenceException
  at ARPGGame.LevelList..ctor (TiltedEngine.Drawing.ResourceContext resContext, System.String xml)
  at ARPGGame.GameBase.InitGame (Difficulty diff, ARPGGame.GamePlayers players, System.String mod)
```

**Evidence:** The `.hwm` is a custom `HWRP` archive — magic `HWRP`, `uint32`
version (100), `uint32` info.xml length + info.xml, `uint32` icon PNG length +
PNG (0 when the campaign ships no `icon.png`), then a single gzip stream
holding the name-keyed resource table. Dumping the names out of the shipped
`campaign.hwm` gives relative keys (`levels.xml`, `levels/level_1.xml.bin`).
Dumping them out of the broken campaign gave:

```
/home/benpham/Applications/hammerwatch/editor/dungeon90719359/levels.xml
/home/benpham/Applications/hammerwatch/editor/dungeon90719359/tweak/shared.xml
```

Reproduced on the stock `editor/example` folder: run from another cwd with an
absolute argument, and every file LevelPacker copies rather than compiles is
keyed by the wine path it was handed (`Z:/home/.../example/levels.xml`); run
with `cwd = <hw>/editor` and the bare folder name `example`, and the same files
are keyed `levels.xml`, `doodads/example_button.xml`, and so on. Compiled
levels (`levels/*.xml.bin`) are relative either way, which is why the campaign
packed, listed and looked fine right up to Start.

A trailing slash on the argument is separately fatal — `LevelPacker.exe
editor/dungeon90719359/` run from `<hw>` dies before writing anything:

```
System.IndexOutOfRangeException: Index was outside the bounds of the array.
  at TiltedEngine.Drawing.ResourceContext.ResourceNameFromPath (System.String path)
  at ARPGLevelPacker.Program.WalkDirectoryTree (System.IO.DirectoryInfo root)
```

`ResourceNameFromPath` splits on the argument's length, so an empty trailing
segment indexes past the end. Pass the name with no separator.

**Impact:** `src/main/packer.ts` now runs `LevelPacker.exe <campaignName>` with
`cwd` set to `<hw>/editor`; passing `campaignDir` is a bug, not a style choice.
The same defect silently broke `tweak/*.xml` — those keys were absolute too, so
no player balance file was ever loaded. Two consequences for triage: a
`NullReferenceException` in `LevelList..ctor` plus a "Could not find file:
.../assets/levels.xml" resource error means the pack's `levels.xml` key is
wrong, not that the campaign XML is malformed; and `assets/` does not exist in
an installed game at all, so that path is always the failed fallback. Answers
open question 2 for reading; open question 3 gains a hard fact.

### 2026-07-29 — four claims the bulk roster editor makes about the shop
**Tag:** [UNVERIFIED] — **fully superseded 2026-07-30.** All four claims are now
verified in game: 1-3 by the shop entry above, 4 (skill pre-unlock) by the entry
above that. Kept for the reasoning and the fallbacks, which still apply if a
claim ever regresses.

**Context:** Adding "Quick setup — all characters" (`src/generator/tweak/bulk.ts`),
which needs a way to make every upgrade free, to price the shop out of reach, to
delete an upgrade, and to hand a character a skill it would normally buy.

**Evidence and the claims:**

1. **`cost="0"` is a purchasable upgrade, not a broken one.** No stock upgrade
   ships at 0, so this is unattested. The `kfan-money-cost` / `chain-money-cost`
   / `smoke-money-cost` params *do* ship at 0 and mean "free to use", which is
   the nearest supporting evidence, but those are use-costs on a param, not a
   shop `cost` attribute. If the shop treats 0 as "already owned" or hides the
   entry, the "All free" mode still reaches the same end state by a different
   route and the feature survives; if it crashes, this becomes `[REFUTED]` and
   the mode should switch to `cost="1"`.
2. **A price of `999999` locks the shop out for a whole campaign.** The game's
   own "unaffordable" idiom is `9999` (`sorcerer.xml`, `nova-mana-cost` before
   the nova upgrade is bought), so a large sentinel is at least idiomatic. We
   chose 999999 over 9999 because 9999 gold is reachable late in a long
   campaign. Unverified whether the shop UI renders a 6-digit price without
   clipping.
3. **An upgrade omitted from a campaign's tweak file does not exist in the
   shop.** This one has real supporting evidence: the official Temple of the Sun
   campaign ships `editor/campaign2/tweak/shared.xml` with 28 upgrade entries
   against the base file's 34, dropping `pot-invul` among others. That is the
   same mechanism `player.<file>.remove.<id>` uses. Still unverified because we
   have not watched our own emitted file load.
4. **Pre-unlocking a skill requires applying the whole unlock upgrade, not just
   its bool.** Strong code-side evidence: `knight.xml` starts `whirl-dur` at
   `-1` and `whirl-dmg-multiplier` at `-1`; `sorcerer.xml` starts
   `nova-mana-cost` at `9999` and `nova-shards` at `-1`. The upgrade that sets
   `<bool name="whirl">true</bool>` is also what fills those in. Setting the
   flag alone would therefore hand the player a skill with a -1 duration. What
   the game *does* with a -1 duration is the unverified part — it may clamp,
   no-op, or divide by it.

**Impact:** `src/generator/tweak/bulk.ts` and the `remove` field group in
`overrides.ts` depend on 1–3; `applySkillUnlocks` depends on 4. Anyone with an
install can close all four in one session: build a campaign with "All free",
one with "Locked out", one with extra lives removed, and one with skills
pre-unlocked, then load each and look at a shop. Nothing here belongs in
`ASSET-REGISTRY.md` until that happens.

### 2026-07-28 — baseline.ts matches the stock tweak XML field for field
**Tag:** [VERIFIED] (Windows 10, Steam install, files read directly)
**Context:** Making each upgrade's *effect* editable, not just its price. Before
adding fields derived from `upgrade.children`, the transcription they come from
had to be trusted.
**Evidence:** All nine stock files were read from
`D:\Program Files (x86)\Steam\steamapps\common\Hammerwatch\editor\assetsExtract\tweak\`
(`general.xml`, `shared.xml`, knight/priest/ranger/sorcerer/thief/warlock/wizard)
and compared tag-by-tag against `serializeUnitFile`/`serializeGeneralFile` output
for `TWEAK_BASELINE`. Every element, attribute and value matches — knight alone
is 494 tags. Two deliberate, harmless divergences:

- The game writes `2.0` where `formatNumber` gives `2`. Same number, different
  text; `xml.ts` has always emitted shortest form.
- Commented-out blocks are dropped: warlock's cut `lifesteal` skill (params at
  `warlock.xml:20-26`, upgrades `steal`/`stealdmg-*`/`stealdur-*` at
  `warlock.xml:303+`) and the superseded `shared.xml` speed tiers. They are
  inside `<!-- -->` in the stock files, so the game never loads them either.

The same comparison was run against `reference/hammerwatch-tweak-stats.md`:
every `<params>` table and every "Tier costs" column agrees with the extracted
files. One cosmetic doc fix — the knight row read `whirldur1..2`, but the stock
tier-2 id really is `whirldur`, with no `2`.
**Impact:** `baseline.ts` and `reference/hammerwatch-tweak-stats.md` can both be
treated as faithful. Chain grouping must not derive tier numbers from ids
(`whirldur` proves it) — `src/generator/tweak/chains.ts` reads the
`<int name="lvl">` child instead. Still `[EMITTED]` only for our *output*: no
generated `tweak/` folder has been loaded in game, so open questions 8-10 stand.

### 2026-07-28 — campaign tweak files appear to replace the base file wholesale
**Tag:** [UNVERIFIED] → **[VERIFIED] 2026-07-30.** The inference below was right;
see the 2026-07-30 entry for the test that settled it.
**Context:** Adding the player-balance feature (`src/generator/tweak/`), which
lets a generated campaign override class stats, upgrade costs and difficulty
multipliers.
**Evidence:** The stock tables were transcribed from a real install at
`<Steam>/steamapps/common/Hammerwatch/editor/assetsExtract/tweak/` — nine files:
`general.xml`, `shared.xml`, and one per class (knight, priest, ranger,
sorcerer, thief, warlock, wizard). No paladin/gladiator; those are Heroes of
Hammerwatch. The official Temple of the Sun campaign ships its own
`editor/campaign2/tweak/shared.xml` containing a **complete** file with 28
upgrade entries where the base file has 34 — `pot-invul` is absent. A
key-level merge cannot delete an entry, so the campaign file must replace the
base file entirely.
**Impact:** `baseline.ts` carries a full transcription of all nine files so a
single edited value can still be emitted as a valid complete file. If open
question 8 refutes this, that file and both serializers can shrink
dramatically. Nothing here has been loaded in game — our emitted `tweak/*.xml`
is `[EMITTED]` only. Documented in `SKILL.md` § "tweak/*.xml — player balance"
and `ASSET-REGISTRY.md` § "Tweak files"; human-readable tables of the same data
are in `reference/hammerwatch-tweak-stats.md`.

### 2026-07-28 — the tweak XML dialect is not the level XML dialect
**Tag:** [VERIFIED] (read from the same install's stock files)
**Context:** Deciding whether `src/generator/xml/` could serialize tweak files.
**Evidence:** Stock tweak files use arbitrary attributes on `<dictionary>`
(`id`, `cost`, `req`, `cat`, `name`, `desc`, `life-cost-scale`), self-closing
elements for upgrades with no child params, lowercase `true`/`false`, and
floats in shortest form (`0.75`, `1`) rather than the level dialect's Java
`%f` six decimals. `src/generator/xml/` can express none of that — it emits
element-name-is-type with a single `name` attribute.
**Impact:** `src/generator/tweak/xml.ts` exists as a separate serializer.
Don't "unify" the two; they are different formats that happen to both be XML.

### 2026-07-28 — log created
**Tag:** [VERIFIED]
**Context:** Setting up the orchestrator/subagent context layer. No game
install is available in the dev container, so nothing in the modding skill
could be raised above `[EMITTED]`.
**Evidence:** `reference/original-java/` and `src/generator/` are the only
sources for the asset paths currently documented; the port was diffed against
the Java tool's output, never against the game.
**Impact:** Everything in `ASSET-REGISTRY.md` starts at `[EMITTED]`. The seven
open questions above are the backlog.
