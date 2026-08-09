# Boss tab — a pre-fight prep room and a generated boss arena

> **Status: design only.** Nothing here is implemented yet. Nine facts the
> design rests on are still unverified — see "Research needed" at the end.
> R1 and R2 are load-bearing: if either comes back negative the win condition
> and the wave wiring both need redesigning.

## Context

[Issue #6](https://github.com/bennpham/HammerwatchRogueLikeDungeonGeneratorRemake/issues/6)
asks for a boss fight before the campaign ends, with a shop room in front of it so
the gold collected on the way down has somewhere to go. Nothing in
`reference/original-java/` covers this — it is entirely new surface, not a port.

The issue asks whether the boss room can be auto-generated or must be
hand-authored. **Answer: both, split by role.** The prep room is hand-authored
(a verbatim template like the lobby, because a shop room has no interesting
geometry); the arena is generated (one big themed rectangle with seeded cover),
because that is what makes it replayable.

Two things confirmed during research make the design possible:

- The engine emits global events `Activate Boss`, `Boss 75%`, `Boss 50%`,
  `Boss 25%` and `Boss Died`, verified in `editor/campaign/levels/level_boss_1..4.xml`
  and `editor/campaign2/levels/level_boss_1..3.xml`. A `GlobalEventTrigger` node
  whose `parameters` is the bare string `Boss 50%` listens for them.
- `SpawnObject` needs no actor placement at all: `parameters` is a bare
  `<string>` holding the actor path, the spawn position **is** the node's own
  position, and the spawn count **is** its `trigger-times` (`-1` = endless).
  Verified across 1462 such nodes in `test_yard2.xml`.

## Decisions taken

| Question | Decision |
| --- | --- |
| Feature default | **On**, like the lobby. `boss.enabled: false` reproduces today's campaign byte-for-byte. |
| Campaign order | Append: `lobby → 0 … N-1 → bossprep → boss`. |
| Final dungeon floor | Keeps its gold-locked orb room, but with the boss on, the orb prefab is swapped for a **portal to the prep room**. With the boss off it stays the win condition exactly as today. |
| Orb / win condition | Lives in the boss arena, in a **3×3 alcove sealed by ordinary wall doodads**. `Boss Died` destroys those doodads, punching a hole in the wall; the existing `ObjectEventTrigger → GameEnd` chain is untouched. **Explicitly not a gold door** — a gold key carried out of the last dungeon floor would open it early and break the campaign. |
| Alcove wall | Seeded pick of N / E / W (entrance is always S), not signposted — players hunt for which wall opened. **N is excluded when the boss is the dragon**, so the dragon can never body-block the reward. |
| Boss choice | Multi-select pool of all seven bosses; the seed picks one. |
| Boss state | Live from level load. No dormancy, no `ToggleImmortality`. |
| First wave | An `AreaTrigger` (`trigger-times -1`) over the entrance. Waves 2–4 use `GlobalEventTrigger` on `Boss 75%` / `Boss 50%` / `Boss 25%`. |
| Wave config | Four tiers (100/75/50/25), each with **its own monster pool and its own per-monster max-count table**. A max count of `-1` means endless. |
| Arena theme | One dropdown over the existing `THEME_DEFS` registry, independent of the dungeon's per-floor themes. |
| Prep coins | Authored diamond slots reusing the lobby's 500-gold-per-diamond scheme, **default 0**. |
| Cover patterns | All four ship: random scatter, border ring, gaussian clusters, symmetric/grid. |

## Design

### 1. Determinism — the load-bearing constraint

Both new levels are emitted **after** the `params.levels` loop in
`generateDungeon`, exactly like the lobby and `emitTweakFiles`. The arena needs
randomness, so it draws from a **third stream**, `ctx.bossRand = new Random(seed + 2)`
(mirroring `cosmeticRand = seed + 1`). `ctx.rand` and `ctx.cosmeticRand` are
never touched, so every existing seed's dungeon floors stay byte-identical
whether the boss is on or off.

The one deliberate exception is the final floor's orb room. Turning the boss on
swaps the `Orb` prefab for a `BossPortal` prefab in the *same* room at the *same*
coordinates. Neither prefab consumes RNG (check `ObjectSet`'s `Orb` case —
no `rand` calls), so **the layout, wall bitmap and every other object on that
floor are unchanged**; only the orb room's own doodads/items/script nodes differ.
That property must have a test.

New level ids are the strings `bossprep` and `boss`, for the same reason the
lobby's is `lobby`: numeric floor ids `0..N-1` must not move.

### 2. New script node types

`src/generator/objects/scriptNode.ts` + `nodes.ts` gain these to `NodeTypeName`:

| Node | Parameters shape | Notes |
| --- | --- | --- |
| `SpawnObject` | bare `<string>` = actor/item path | no `parameters` dict; count = `trigger-times`; position = node position |
| `GlobalEventTrigger` | bare `<string>` = event name | `Boss 75%` / `Boss 50%` / `Boss 25%` / `Boss Died` |
| `CircleShape` | `diameter` float, `types` int | for round trigger areas |
| `AllPlayersAreaTrigger` | `shape` dict + `msg` string | used by the prep-room exit |
| `PlaySound` | `sound`, `loop`, `play3d`, `range3d` | teleport feedback |
| `DestroyObject` | `<int-arr name="static">` **directly** under `parameters`, no wrapper dict | punches the hole in the alcove wall |

Two nodes carry a bare scalar instead of a `parameters` dictionary, which the
current `ScriptNode.getXML()` cannot express — it always calls
`getParametersDict()`. Add an overridable `getParametersXML(): string` that the
default implementation delegates to `getParametersDict().getXML()`, so
`SpawnObject` and `GlobalEventTrigger` can return `<string name="parameters">…</string>`.

**Format note:** the repo's `ScriptNode` emits `<float name="x">`/`<float name="y">`
and `<int-arr name="delays">`, whereas the editor writes `<vec2 name="pos">` and
`<int-arr name="connection-delays">`. The repo's dialect ships and works today, so
new nodes follow the repo's dialect — not the editor's. (Confirm once in game for
the new types; research item R7.)

### 3. Prep room — `src/generator/bossprep/`

A direct clone of the `src/generator/lobby/` module shape:

- `template.ts` — `BOSSPREP_TEMPLATE`, generated by a new
  `scripts/import-bossprep-assets.mjs` modelled on `scripts/import-lobby-assets.mjs`,
  from
  `.../Hammerwatch/editor/pht6_quiky_dreadmann_mansion/levels/test_non_related_to_map/test_boss_prep_room.xml`.
  Also exports `BOSSPREP_TEMPLATE_IDS`, `BOSSPREP_EXIT_NODE_ID = 232`,
  `BOSSPREP_DIAMOND_SLOTS`, `BOSSPREP_ITEM_ID_BASE`.
- `build.ts` — `buildBossPrep(options)`. Reuse the text-surgery helpers
  (`elementSpan`, `removeElement`, `replaceInElement`, `setItems`) and
  `diamondCount()` from `src/generator/lobby/build.ts` — **lift them into a shared
  `src/generator/levelTemplate/surgery.ts` rather than copy-pasting.**
- The prep room is a straight copy of the lobby's shop rig: **identical
  `ShopArea` ids (3295/3297/3305/3307/3310), identical `cats` strings, identical
  `CircleShape` ids (3294/3296/3304/3306/3309)** — only the positions differ.
  So `LOBBY_VENDORS` / `categoriesFor()` / `ALL_LOBBY_CATEGORIES` from
  `src/generator/lobby/shops.ts` are reused unchanged.
- The prep room references `doodads/special/vendor_speech_level5.xml`, which the
  lobby import already ships in `LOBBY_ASSETS`. Verify no *other* referenced
  asset is missing (research item R6) before deciding whether a
  `BOSSPREP_ASSETS` array is needed at all.
- The exit rig at ids 228/231/232/229 is edited to point
  `<string name="level">` at `boss`.
- Its `<items>` section is empty in the source, so the diamond slots must be
  authored by hand (research item R5).

### 4. Boss arena — `src/generator/boss/`

`buildBossArena(options, theme, rand): { xml, preview }`. Not a `Level` — it does
not use rooms/passages/`wallPattern` — but it reuses `Tile`, `Doodad`,
`Item`, `Monster`, `ObjectSet` and the `src/generator/xml/` primitives, and emits
the same section order as `Level.getXML()`.

```
+==================[SEALED WALL]================+   <- 3 wall doodads, destroyed
|                  (orb, 3x3)                   |      on "Boss Died"
|   NW              N / dragon              NE  |   alcove: seeded N/E/W,
|                                               |   never N when boss = dragon
|                                               |
|   W              centre / boss             E  |   9 spawn anchors, inset
|                                               |   from the walls
|   SW               S                      SE  |
|                 [ ENTRY / LevelStart ]        |
+-----------------------------------------------+
```

- **Geometry**: one solid wall band around a rectangle sized
  `rand(minWidth..maxWidth) × rand(minHeight..maxHeight)`. Walls use the same
  `THEMED_WALL_PIECES` doodad set as the dungeon via `wallPattern.searchPatterns`,
  which already handles theme H's edge-fence weirdness.
- **Boss placement**: `boss_dragon` goes in the top wall (it has no upward-facing
  art and `collision static="true"`; the shipped `level_boss_4.xml` places it at
  `-5 -26.5`). Every other boss goes dead-centre. `boss_queen` is also
  `static="true"` and has no movement dict at all, but attacks in all directions,
  so centre is correct for it.
- **Spawn anchors**: 9 positions (N/S/E/W + 4 corners + centre), each inset from
  the wall by the arena's padding. For a wave of total count `C` across monster
  types, each `(monster, anchor)` pair gets one `SpawnObject` node with
  `trigger-times` set to that monster's per-tier max, dispersed round-robin
  across the anchors. `-1` passes straight through as endless.
- **Wave wiring**:
  - 100%: `RectangleShape` over the entrance → `AreaTrigger` (`event 0`,
    `types 1`, `trigger-times -1`) → all of that tier's `SpawnObject` nodes.
  - 75/50/25%: `GlobalEventTrigger` with `parameters` = `Boss 75%` etc. → that
    tier's `SpawnObject` nodes.
- **Win**: `GlobalEventTrigger "Boss Died"` → `DestroyObject` listing the ids of
  the wall doodads sealing the alcove mouth → the wall opens → players collect
  the orb → the existing `Orb` `ObjectSet` fires `ObjectEventTrigger → GameEnd`.
  Reuse `ObjectSet.create(ctx, x, y, 'Orb', theme)` as-is; only the wall seal is
  new. **No lock, no key, no door** — the campaign hands out gold keys on the
  final dungeon floor and a carried-over key must not be able to open this.
  This assumes wall collision in a packed level comes from the wall *doodads*
  and not from the tilemap; that assumption is research item R1.
- **Preview**: emit a `LevelPreview` with a single `PreviewRoom` so the canvas
  preview shows the arena alongside the dungeon floors with no renderer change.

### 5. Cover pillars

New `src/generator/boss/cover.ts`.

Solid pillar doodad per theme, resolved through a new `DoodadType` entry
`Pillar` plus `ThemeDef.doodadOverrides`:

- themes a–g, i → `doodads/theme_<t>/<t>_special_pillar.xml`
- theme h (outdoor desert) → `doodads/theme_h/h_deco_rock.xml` *(the only cover
  asset theme H has; ~2.25 tiles across)*
- bonus1–5 → `doodads/theme_bonusN/bonusN_pillar.xml`

Confirmed solid: `*_special_pillar.xml` carry a `<polygon collision="true">`,
`h_deco_rock.xml` a `<circle radius="18"/>`. **Most `*_deco_pillar_*.xml` have no
collider at all and are pure art — do not use them.**

Four patterns, selected by an enum param:

| Pattern | Behaviour |
| --- | --- |
| `random` | `count` pillars at seeded positions |
| `ring` | evenly spaced around an inset border, with a **`ringSpacing` gap parameter** so the ring is walkable rather than a second wall |
| `gaussian` | `clusters` seeded centres, pillars normally distributed around each |
| `symmetric` | placed in one quadrant then mirrored 4-fold, so the fight is fair from any approach |

All four run through one rejection filter: a pillar is discarded if it overlaps
the boss footprint (largest is `boss_queen` at ~5.1 × 5.2 tiles), any of the 9
spawn anchors, the entrance, the alcove/door, or another pillar. The filter is
bounded — a fixed attempt cap, never a `while (true)` (invariant #3).

### 6. Parameters, validation, `parameters.txt`

`src/generator/config/parameters.ts`:

```ts
export interface BossOptions {
  enabled: boolean          // default true
  prep: {
    shopCategories: string[]   // default ALL_LOBBY_CATEGORIES (power INCLUDED)
    startingGold: number       // default 0, multiple of 500
  }
  arena: {
    theme: string              // default 'g'
    minWidth: number; maxWidth: number
    minHeight: number; maxHeight: number
    bossPool: string[]         // default all 7
    waves: BossWave[]          // exactly 4, in order 100 / 75 / 50 / 25
    cover: {
      pattern: 'random' | 'ring' | 'gaussian' | 'symmetric'
      density: number
      ringSpacing: number
      clusters: number
    }
    monsterMultiplier: number
    goldMultiplier: number
    foodMultiplier: number
  }
}
export interface BossWave {
  monsters: string[]                  // ids from MONSTER_TYPES
  monsterMax: Record<string, number>  // -1 = endless
}
```

Note the Player-tab default divergence the user asked for: unlike the lobby,
**`power` is on by default in the prep room's shop** — extra lives matter more
right before a boss than they do at the start of a run.

- `src/generator/config/validation.ts`: a `validateBoss(p, errors, warnings)`
  called next to `validateLobby`. Dotted field paths (`boss.arena.minWidth`) so
  `NumberField` renders errors inline. Rules to cover at minimum: min ≤ max on
  both axes; arena large enough for the largest enabled boss plus 9 anchors plus
  the alcove; `bossPool` non-empty; exactly 4 waves; `startingGold` a multiple of
  500 within range; cover density not exceeding the free floor area; unknown
  monster/theme ids. Absent `boss` object means "off, not invalid".
- `src/generator/config/configFile.ts`: lowercase keys `boss`, `bossgold`,
  `bossshops`, `bosstheme`, `bosswidth`, `bossheight`, `bosspool`, `bosscover`,
  `bosswave1..4`. Back-fill on parse; append on serialize alongside the lobby
  keys. Unknown keys reported, never fatal (invariant #5).
- `parameters.default.txt`: add the commented keys.

### 7. UI — the Boss tab

`App.tsx`: extend `leftTab` to `'lobby' | 'dungeon' | 'player' | 'boss'`, add the
button (right of Player, with an `on`/`off` `tab-count` badge like the lobby's),
add the render branch, add a `resetDefaults()` branch and its button label.

New `src/renderer/components/BossForm.tsx`, with the two sub-tabs the user asked
for, using the existing `Section` / `Subsection` / `NumberField` / `BoolField` /
`ToggleGroup` from `src/renderer/components/fields.tsx`:

**Sub-tab "Prep room"** — mirrors `LobbyForm.tsx`, including a
**"Copy from Lobby"** button that assigns `params.lobby.shopCategories` into
`params.boss.prep.shopCategories`. Starting gold field defaults to 0.

**Sub-tab "Boss room"**:

- *General* — min/max width, min/max height (the Dungeon tab's "General" group is
  dropped; "Rooms & passages" becomes this, minus room counts and passage widths)
- *Chances & multipliers* — monster / gold / food only
- *Theme* — one `<select>` over `THEME_DEFS` grouped by `ThemeDef.group`
- *Boss* — checkbox grid of the 7 bosses (reuse the `MonsterFilterBar` idiom)
- *Waves* — four `Subsection`s (100% / 75% / 50% / 25%), each a
  `MonsterPoolsEditor`-style pool plus a `MonsterMaxTable`-style count table
  accepting `-1`
- *Cover* — pattern `ToggleGroup`, density slider, plus `ringSpacing` /
  `clusters` shown only for the patterns that use them

Add CSS alongside the existing `.lobby-*` block in
`src/renderer/styles/app.css`.

## Files

**New**
- `docs/plans/boss-tab.md` *(this document — the deliverable of this task)*
- `src/generator/levelTemplate/surgery.ts` — helpers lifted out of `lobby/build.ts`
- `src/generator/bossprep/{template,build,index}.ts`
- `src/generator/boss/{arena,cover,anchors,bosses,index}.ts`
- `scripts/import-bossprep-assets.mjs`
- `src/renderer/components/BossForm.tsx`
- `tests/boss.test.ts`

**Modified**
- `src/generator/config/{parameters,validation,configFile,themes}.ts`
- `src/generator/objects/{scriptNode,nodes,objectSet,doodad}.ts` — new node types, `BossPortal` set type, `Pillar` doodad
- `src/generator/core/context.ts` — `bossRand`
- `src/generator/index.ts` — emit both levels, extend the barrel
- `src/generator/lobby/build.ts` — re-export from the shared surgery module
- `src/renderer/App.tsx`, `src/renderer/styles/app.css`
- `parameters.default.txt`, `README.md`, `CHANGELOG.md`
- `.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` — every fact confirmed by the research below

## Verification

Offline (`npm run typecheck && npm test`):

1. `boss.enabled: false` ⇒ `files` byte-identical to a pre-feature run of the
   same seed. Same assertion style as `tests/lobby.test.ts`.
2. `boss.enabled: true` ⇒ `levels/level0..N-1.xml` differ from the boss-off run
   **only** inside the final floor's orb room; wall bitmaps and every other
   floor identical.
3. Determinism: same params + same seed ⇒ `expect(a.files).toEqual(b.files)`.
4. Arena invariants: exactly one boss actor; boss inside the walls; 9 anchors on
   walkable floor; alcove never on the N wall when the boss is the dragon; no
   pillar overlaps an anchor, the boss, the entrance or the alcove.
5. Script graph: every `connections` id resolves to a real node; all ids unique
   across doodads/actors/items/scripting (reuse `allIds(xml)` from
   `tests/lobby.test.ts`); one `GlobalEventTrigger` per health tier.
6. Validation matrix in `tests/validation.test.ts` for each new rule.
7. `parameters.txt` round-trip in `tests/configFile.test.ts`.

In game (required before merge):

8. Pack and install; confirm both levels appear and the campaign is playable end
   to end for at least two different bosses.
9. Final dungeon floor: gold key still gates the room, the portal teleports to
   the prep room.
10. Prep room: all five stalls sell, `power` sells extra lives, exit teleports to
    the arena.
11. Arena: entry fires wave 1; each health threshold fires its wave; killing the
    boss punches the hole in the alcove wall; the orb ends the game. Also carry
    a gold key in from the last floor and confirm it does **not** open the
    alcove early.
12. Run each of the four cover patterns once and eyeball that pillars are solid
    and the arena is navigable.

---

## Research needed from you before implementation

These are the facts the design rests on that I could not confirm from files
alone. Ordered by how much they'd cost to get wrong.

**R1 — Does destroying wall doodads actually open a walkable hole?** *(blocks the win condition)*
Build a scratch level with a sealed 3×3 alcove behind a normal themed wall, wire
an `AreaTrigger` → `DestroyObject` listing those wall doodads' ids, and walk into
it. Two things to report: (a) do the doodads disappear, and (b) **can you walk
through the gap** — i.e. is collision coming from the doodads alone, or does the
tilemap underneath still block? If the tilemap blocks too, the alcove floor has
to be authored as floor tiles from the start with only the doodads sealing it,
and I need to know that before writing the geometry code. Also worth comparing
`DestroyObject` against `HideObject{state:1}` and `ToggleElement` in the same
test — whichever leaves the cleanest hole wins.

**R2 — Do the boss global events fire for a boss placed in an arbitrary level?**
*(blocks waves 2–4 and the win condition)*
This is the single biggest risk: the `Boss 75%` / `Boss Died` events may be
emitted by the boss actor itself, or they may be authored by the shipped boss
levels' own scripts. Blank level, one `boss_queen` in `<actors>`, plus four
`GlobalEventTrigger` nodes (`Boss 75%`, `Boss 50%`, `Boss 25%`, `Boss Died`) each
→ an `AnnounceText`. Damage it down and report which announcements appear.
Repeat for `boss_dragon`. If they don't fire, the fallback is
`ObjectEventTrigger{event:"Destroyed", object:<boss id>}` for death plus
`{event:"Hit"}` + a `Counter` for thresholds — tell me and I'll redesign.

**R3 — Does `SpawnObject` with `trigger-times: -1` spawn endlessly, and how fast?**
One `AreaTrigger` → one `SpawnObject actors/bat_2.xml` with `trigger-times -1`.
Does it spawn once per trigger fire, or continuously? At what rate? This decides
whether `-1` in the UI means "endless" or has to mean something else.

**R4 — Minimum arena size per boss.**
Place each of the seven bosses in an empty square room and note the smallest
room in which it behaves correctly (doesn't clip walls, can attack, players can
kite). Also: for `boss_dragon`, open
`editor/campaign/levels/level_boss_4.xml`, find the arena's top wall row, and
tell me the dragon's y-offset from it — it sits at `-5 -26.5` and I need the
delta, not the absolute.

**R5 — Prep-room walkable floor, for the diamond slots.**
Open `test_boss_prep_room.xml` in the editor and either (a) give me a rectangle
of walkable floor tiles clear of the vendors at `y = 7` and the exit at
`y = -13`, or (b) just place 12 `items/valuable_diamond_red.xml` where you'd want
starting coins to lie and send me the saved file — I'll read the slots straight
out of it, exactly as the lobby importer does.

**R6 — Does the prep room reference any asset the lobby import didn't already ship?**
It uses `doodads/special/vendor_speech_level5.xml` (already in `LOBBY_ASSETS`),
`doodads/generic/exit_teleport_boss.xml`, `exit_teleport_boss_desert.xml`,
`actors/boss_knight/statue_1..8.xml` and `doodads/theme_bonus4/*`. Pack a
campaign containing only the prep room and confirm `LevelPacker.exe` resolves
all of them from stock assets.

**R7 — Do the new node types accept the repo's XML dialect?**
The repo writes `<float name="x">` / `<float name="y">` / `<int-arr name="delays">`
where the editor writes `<vec2 name="pos">` / `<int-arr name="connection-delays">`.
That works today for the node types already shipping. Hand-edit one packed level
so a `SpawnObject` and a `GlobalEventTrigger` use the repo's dialect and confirm
they still fire — if not, all new nodes must override to the editor's dialect.

**R8 — Which pillar doodads are solid, per theme.** *(nice to have — mostly
readable from the asset files)*
Drop `a_special_pillar`, `h_deco_rock` and `bonus1_pillar` into a test level and
confirm they block movement and projectiles. I have the collision geometry from
the XML but haven't watched anything walk into one.

**R9 — Boss HP and pacing.** Recorded HP: dragon 15000, anubis 10000, lich 3500,
knight 2500, queen 2500, worm 850/500. That is a 30× spread. Should the Boss tab
expose an HP scaler (which would mean a new `tweak/` file or an actor override,
i.e. custom assets — currently out of scope per `docs/plans/lobby-tab.md`), or do
we accept that picking `worm` is a much shorter fight than picking `dragon`?
Your call; it doesn't block anything else.
