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
   dependence into the generator. Cosmetic randomness draws from
   `ctx.cosmeticRand`, layout randomness from `ctx.rand` — never mix the two
   or the layout stream shifts and every existing seed changes.
3. **No unbounded loops.** Every retry loop in the port is bounded
   (`MAX_LEVEL_ATTEMPTS = 60`, 1000/2000-attempt inner loops). The original
   retried forever; that is a bug we fixed, not a behaviour to restore.
4. **Bad input is rejected, not crashed on.** Every crash path of the Java
   tool is a rule in `src/generator/config/validation.ts` with a test in
   `tests/validation.test.ts`. New parameters need new rules and new tests.
5. **`parameters.txt` compatibility.** The original file format keeps working
   as an import/override. Unknown keys are reported, never fatal.
6. **Player tweaks stay out of the RNG.** `src/generator/tweak/**` emits the
   game's `tweak/*.xml` balance files and draws no random values; it runs
   after every level is built. A run with no player edits emits no `tweak/`
   folder and must stay byte-identical to a pre-tweak run of the same seed.

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
