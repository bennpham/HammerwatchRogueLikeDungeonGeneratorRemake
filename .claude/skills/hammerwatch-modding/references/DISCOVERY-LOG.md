# Discovery log

Append-only record of what we learn about what Hammerwatch, its editor and
`LevelPacker.exe` actually accept. **Newest entries at the top.**

This file is the mechanism that keeps the skills honest: findings that only
live in a chat transcript are lost the moment the session ends. Every agent
that confirms or refutes something about the game's asset surface writes here
in the same change.

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
