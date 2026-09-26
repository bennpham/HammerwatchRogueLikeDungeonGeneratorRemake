# CLAUDE.md — Hammerwatch Rogue-like Dungeon Generator (remake)

Electron + React + Vite + TypeScript desktop app that generates random rogue-like
campaigns for **Hammerwatch** (2013, Crackshell). It is a port of a terminal-only
Java tool from the Hammerwatch forums; the original source lives in
`reference/original-java/` and is the behavioural reference for the port.

Read `README.md` for the user-facing description. This file is the working
contract for agents.

## Where the knowledge lives

Detailed context is packaged as skills in `.claude/skills/` — load the one that
matches the work instead of re-deriving it from source:

| Skill | Use it when |
| --- | --- |
| `hammerwatch-project` | Any change to this repo — layout, commands, invariants, review bar |
| `hammerwatch-java-port` | Touching `src/generator/**`, RNG, or anything that must stay faithful to the Java original |
| `hammerwatch-modding` | Level XML, `tweak/*.xml` player balance, campaign packaging, actors/doodads/tilemaps, adding custom content |
| `hammerwatch-crash-triage` | A crash log, stack trace, hang, or "generation failed" report arrives |

Subagents are defined in `.claude/agents/` — see "Agent roster" below.

## Non-negotiable invariants

1. **The generator stays pure.** Nothing under `src/generator/**` may import
   `electron`, `fs`, `path`, `child_process`, or touch the DOM. It takes
   `(params, seed)` and returns file contents + preview geometry, in memory.
   All I/O lives in `src/main/**`.
2. **Determinism.** Same params + same seed ⇒ byte-identical output. Never
   introduce `Math.random()`, `Date.now()`, or `Object` iteration order
   dependence into the generator. **Five** streams, never mixed: layout
   randomness draws from `ctx.rand`, cosmetic (floor tiles, overlay and mixed
   palettes) from `ctx.cosmeticRand`, everything in the boss arena from
   `ctx.bossRand`, the per-floor wall traps from `ctx.trapRand` (`seed + 3`) —
   one `iRand` per placed spewer, in numeric floor order, and only after the
   retry loop has *accepted* a floor, so a discarded candidate never draws —
   and the per-floor BOSS from `ctx.floorBossRand` (`seed + 4`), on the same
   post-acceptance terms. Mixing them shifts the streams after and every
   existing seed changes. A path with nothing to draw must return *before*
   touching a stream.
3. **No unbounded loops.** Every retry loop in the port is bounded
   (`MAX_LEVEL_ATTEMPTS = 60`, 1000/2000-attempt inner loops). The original
   retried forever; that is a bug we fixed, not a behaviour to restore.
4. **Bad input is rejected, not crashed on.** Every crash path of the Java
   tool is a rule in `src/generator/config/validation.ts` with a test in
   `tests/validation.test.ts`. New parameters need new rules and new tests.
5. **`parameters.txt` compatibility.** The original file format keeps working
   as an import/override. Unknown keys are reported, never fatal.
6. **An arena is a boss fight OR a survival round.** `BossFight.mode` —
   **absent means `'boss'`**, read it through `arenaMode(fight)`. The engine
   fires `Boss 75%/50%/25%/Died` only for an actor in the `actors/boss_*`
   folders, so an arena with no boss actor gets none of them and every
   tier-keyed rig would be dead wiring; `src/generator/survival/` re-keys the
   same jobs to one `GlobalEventTrigger("LevelLoaded")` with a per-connection
   millisecond delay each, and the alcove comes down on the clock instead of on
   `Boss Died`. Both modes share `arena: BossArenaOptions` — the room, not the
   fight — and the boss-only fields stay on the object unread, so **flipping a
   mode is lossless both ways**; `validation.ts` gates the boss-only rules on
   the mode for the same reason. A survival arena draws a different NUMBER of
   `ctx.bossRand` values (no boss pick, no scatter points), so a mode flip moves
   every arena AFTER it, exactly as adding a fight does — never a dungeon floor,
   never an earlier arena. Arena slots label as `AB{n}`/`AS{n}`: prefix is the
   mode, number is the index in `fights`, which is what keeps `normalizeOrder`
   untouched; `parseSlotLabel` still accepts the old `B{n}`.

   **An arena or a floor may carry more than one boss** (`bossCount`, issue #64
   part 1 — **absent means 1**, read through `arenaBossCount`/`floorBossCount`).
   The engine fires `Boss 75%/50%/25%/Died` for the FIRST boss actor to cross a
   threshold or die and for nothing else, so with `isMultiBoss(count)` true no
   rig can tell whose threshold it saw: every tier-keyed rig (waves, wave
   buffs, wave pickups, traps) skips tiers 75/50/25% entirely — **before**
   allocating a node for them — and re-keys the death tier and the alcove/seal
   opener to "every boss's own death". `boss/tierSource.ts`'s
   `buildAllBossesDied` builds that rig once: one `Variable` initialised to
   the boss count, then per boss an
   `ObjectEventTrigger(Destroyed, [actor], trigger-times 1)` connected to its
   own `ChangeVariable` (subtract 1) and THEN its own `CheckVariable` (== 0).
   Every CheckVariable shares one `on-true` list, and every rig connects to
   the returned CheckVariable exactly as it would to a single boss's
   `GlobalEventTrigger` — `NodeCheckVariable.connectTo` appends to `on-true`,
   not `connections`. The whole rig is **`[VERIFIED]`** (2026-09-23
   DISCOVERY-LOG, user playtests on floors and arenas): the seal stays shut
   until the LAST boss dies, and `on-true` drives every death-tier rig,
   including the after-death traps. The earlier `Counter` node was
   `[VERIFIED]`-wrong (it fired on the first kill) and is gone — do not bring
   it back.
   Invulnerability and checkpoints are skipped outright for `isMultiBoss`,
   never re-keyed: their settings stay on the object, unread, the same
   losslessness a survival fight's boss-only fields already get.

   **Two selection modes** (issue #64 follow-up) pick which bosses fill that
   count: `bossSelection` on both `BossArenaOptions` and `DungeonBoss` —
   **absent means `'random'`**, read through `bossSelection()`, never off the
   field. `'random'` is the historical pick: `count` values drawn through
   `boss/bosses.ts`'s `pickBosses` — dragon and queen are `unique: true` and
   are removed from the candidate pool once picked, every other boss may
   repeat — drawn on an arena from `ctx.bossRand` immediately after the
   historical single pick (so `bossCount = 1` reproduces that single draw
   exactly) and on a floor from `ctx.floorBossRand`. `'lineup'`
   (`bossLineup: Partial<Record<BossId, number>>`, always iterated in
   `BOSS_IDS` order — never `Object.keys`, invariant 2) picks an EXACT roster
   instead via `boss/bosses.ts`'s `expandLineup()`, drawing **zero** pick
   values from either stream; `bossPool` is not read at all in this mode, and
   `arenaBossCount`/`floorBossCount` return the lineup's own total rather than
   `bossCount` when the mode is `'lineup'`. A lineup mode's own dragon/queen
   cap (at most 1 each) is enforced the same way `UNIQUE_BOSS_IDS` gates the
   random pick.

   `boss/geometry.ts`'s `arenaBossLayout` places every arena boss with **zero**
   extra draws — a topWall boss (the dragon) keeps its historical
   `topWallBossY` spot, the primary centre boss (queen if picked, else first
   in pick order) keeps the historical `(midX, midY)`, and every other boss
   gets a fixed offset (W, then E, then S/N) clear of the entrance and the
   anchors. `MAX_BOSS_COUNT` is **100** (raised from 4 in the follow-up, since
   stacking below removed the geometric reason for a low ceiling);
   `BOSS_COUNT_WARN` (12) is an advisory-only threshold above which validation
   warns about a crowded arena, never blocks. Bosses beyond the five fixed
   slots (topWall + primary + three offsets — `ARENA_LAYOUT_SLOTS`) **stack**
   round-robin onto a slot already in use rather than being rejected: the
   engine pushes overlapping mobile actors apart at runtime, and only the
   dragon/queen (unique, capped at 1) could ever collide with themselves, so a
   stacked slot only ever holds ordinary, repeatable bosses. `arenaBossLayout`
   now returns `null` only when the FIXED placements (topWall and/or the
   primary) do not fit; `validation.ts`'s `bossLayoutFitsEveryCombo` mirrors
   this by capping its brute-force enumeration at `ARENA_LAYOUT_SLOTS`, not at
   `count` — the check's cost is independent of how large `bossCount` is.

7. **A dungeon floor can host a boss, and that one layer DOES move the floor.**
   `levelBoss[i]` (`dungeonBoss/`, issue #61) is the one per-floor layer that is
   not purely additive, and the exception is deliberate: a boss floor's way out
   is a **sealed portal room**, not a stairs room, so `map/level.ts` takes the
   orb/portal branch whatever `ctx.gateway.kind` says and `map/room.ts` renders
   the red portal at `gateway.target` — the same substitution `boss/arena.ts`
   makes for an arena, which has no stairs prefab either. Sealing a *stairs*
   room is not an option: `transform('Exit')` has no dead-end guard,
   `buttonSeal` refuses an Exit room, an ExitDn prefab occupies the wall band a
   DOWN corridor's seal is drawn into, and `sealHolds` would pass such a floor
   silently. The branch costs a different number of `ctx.rand` draws, so
   **enabling a boss moves that floor and every floor after it** — invariant 8's
   gateway-kind cost, paid knowingly; a floor with `enabled: false` must draw
   exactly what it always drew. Everything after acceptance draws from
   `ctx.floorBossRand` alone. The boss's tile is chosen **during** construction
   and pushed to `ctx.reachTargets`, because the seal opens only on its death:
   an unreachable boss is an unfinishable floor. Only a **mobile** boss may
   stand on a floor (`MOBILE_BOSS_IDS` — authored, not derived from
   `static="true"`, which is about the collider and is true for the burrowing
   worm), and invulnerability may not share a floor with timer mode (single-boss
   floors only — see invariant 6's multi-boss addendum: a floor with
   `isMultiBoss(floorBossCount(boss))` skips invulnerability outright, so it
   cannot compete with the timer's countdown and the two may coexist).

   **A floor can be LOCKED, on the same terms** (`levelLock[i]`, issue #69,
   read through `floorLocked()` / `ctx.floorLocked`; absent = unlocked). It
   replaced the campaign-wide `lockFinalRoom`. A locked floor takes the
   orb/portal branch like a boss floor does; with a stairs gateway it renders
   the **blue** `LobbyPortal` at `gateway.target` (a boss floor keeps the red
   one). Its gateway room is sealed by `buttonSeal.ts`, whose button tile is a
   `ctx.rand` draw and a `ctx.reachTargets` entry. So locking a stairs floor
   moves it and every later floor. Locking a portal/orb floor costs only the
   button's draws, which is exactly what the old flag cost. A floor that is locked AND
   hosts a boss is sealed by `sealRoomWallWithButton`: the button animates but
   opens nothing, and `dungeonBoss/opener.ts` feeds the boss-death node (single:
   `Boss Died`; multi: the all-died check) and every button's AreaTrigger into
   one `buildCountdown` Variable, which then opens the wall. The death-tier rigs stay on
   the bosses alone. `defaultParameters()` and every preset except Pre-Alpha
   derive their locks with `withGatewayLocks` — the non-stairs, non-boss floors
   the old flag sealed — so no stock seed moved. All-unlocked is stored as
   absent.

8. **The optional layers never move a seed's dungeon.**
   `src/generator/tweak/**` and `lobby/**` draw **no** random values and run
   after every level is built; `boss/**` draws only from `ctx.bossRand` — once
   per boss fight, in list order, so adding a second fight cannot move the
   first; `traps/**` draws only from `ctx.trapRand`, once per placed spewer,
   after a floor has been built AND validated, so arming a floor's traps leaves
   every floor's rooms, walls, doodads, actors, items and pre-existing ids
   byte-identical — the one thing it moves is a *later* floor's own trap
   positions. That is only safe because a script node carries no collision: a
   trap cannot seal a route, so a floor `map/reachability.ts` has already
   accepted stays finishable however it is trapped. Adding, removing or reordering lobbies must leave every
   `levels/level*.xml` byte-identical — only which extra files exist, and which
   level a floor's gateway names, may change; clearing every tweak emits no
   `tweak/` folder at all. The one thing that *does* move a floor is the KIND
   of gateway it gets (see invariant 9), because `map/level.ts` picks a
   different room for stairs than for a portal or orb. The stock defaults are
   not empty any more: `defaultParameters()` ships two lobbies, the boss on,
   `player.shared.remove.life`, the escape floor's timer, and locks on the two
   floors that end in a portal or the orb (`levelLock`), so a stock run
   emits two lobbies, an arena, exactly one tweak file, and one floor carrying
   a hazard rig. The arena's bodyguard-twin swap (`arenaUsesBodyguards`,
   `BossArenaOptions.bodyguardVariants` — absent means on) is the same kind of
   no-draw path substitution: it changes which actor path a wave/row names,
   arena-only, and never on a dungeon floor or a floor boss's own waves.
9. **The campaign order changes links, never generation.** `levelOrder`
   (`campaign.ts`) decides where each level leads, what `levels.xml` lists and
   in what order, and which slot carries the victory orb — via `ctx.gateway`,
   which `map/level.ts`, `map/room.ts`, `objects/objectSet.ts` and
   `boss/arena.ts` read. A slot is a floor, a boss fight or a lobby; a fight is
   entered at its ARENA, and a lobby may never be the last slot because it
   carries no orb. `gatewayAfter` yields four kinds — stairs to a floor, the
   red portal to an arena, the blue teleport to a lobby, the orb at the end.
   The three non-stairs kinds share one room-selection branch and one three-id,
   zero-draw prefab contract, so swapping between THEM is free; swapping to or
   from stairs is not, and moves that floor and every floor after it. Floors
   are still built in numeric order off `ctx.rand` and arenas in list order off
   `ctx.bossRand`; generating them in a rearranged sequence would move every
   seed. An absent `levelOrder` with no lobbies must stay byte-identical to the
   pre-feature generator, so that *default* order is stored as absent, never as
   a list — but the presets' order is not the default one (a lobby sits before
   the fight and their last floor is played after it), so they store it
   explicitly and must.
10. **A floor the player cannot finish is invalid.** `map/reachability.ts`
   flood-fills with the wall art's two-row overhang modelled (`OVERHANG_ROWS`)
   and rejects a floor unless the entrance reaches the exit/orb/portal and
   every key; the bounded retry loop re-rolls it. Never relax the check, or
   model fewer rows, to make a floor pass.

## Commands

```bash
npm install
npm run dev        # electron-vite dev, hot reload
npm test           # vitest, generator suite
npm run typecheck  # tsc --noEmit over node + web projects (strict)
npm run build      # typecheck + production build to out/
npm run dist       # electron-builder distributable to release/
```

`npm run typecheck && npm test` is the gate for every change. There is no
linter configured — match surrounding style instead.

## Agent roster

Orchestrator pattern. The orchestrator plans and delegates; it does not write
production code itself when a specialist fits.

| Agent | Model | Role |
| --- | --- | --- |
| `dungeon-orchestrator` | Opus 5 | Owns the plan, splits work, reviews returned diffs, keeps skills current |
| `generator-implementer` | Sonnet | `src/generator/**` + `tests/**` — pure algorithm, XML, parity |
| `app-shell-implementer` | Sonnet | `src/main/**`, `src/preload/**`, `src/renderer/**`, `src/shared/**` |
| `crash-triage` | Haiku 4.5 | Cheap first responder for crash logs / failed generations |
| `parity-analyst` | Fable 5 | **Escalation only.** Read-only deep analysis when Opus is stuck on RNG-stream or wall-pattern divergence |

Cost rule: default to Sonnet for implementation, Haiku for triage, Opus for
planning and review. `parity-analyst` (Fable 5) is opt-in — the orchestrator
must state in writing why cheaper agents failed before spawning it.

## Skill maintenance protocol

The Hammerwatch asset surface is only partly known. Whenever a run confirms or
refutes something about what the editor/`LevelPacker.exe` actually accepts —
a new actor path that loads, a doodad that packs, a tileset letter that works,
a constraint that crashes the game — append it to
`.claude/skills/hammerwatch-modding/references/DISCOVERY-LOG.md` **in the same
change**, and promote it into `references/ASSET-REGISTRY.md` once verified in
game. Facts are tagged `[VERIFIED]`, `[EMITTED]`, or `[UNVERIFIED]`; never
silently upgrade a tag without evidence.
