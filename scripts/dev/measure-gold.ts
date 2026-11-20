// How much gold each campaign preset lays on its floors (balance audit):
//   node scripts/run-ts.mjs scripts/dev/measure-gold.ts [seeds] [presetId...]
//
// Generates every preset (or the ones named) on `seeds` seeds (default 3,
// seeds 1000..), reads each floor's level XML and sums the coins and diamonds
// placed in it at the gold each is worth when picked up. Lobby gold is the
// lobbies' own startingGold. Report only; changes no preset.
//
// Counted: coins and diamonds placed in the level (lair and vault treasure).
// Not counted, because the level file cannot show them: chests, breakables,
// monster drops and mystery-plate loot. So the floor figures are a lower bound.
import { generateDungeon } from '../../src/generator'
import { CAMPAIGN_PRESETS } from '../../src/generator/config/presets'

// Gold per pickup, from objects/mysteryLoot.ts (COINS and DIAMONDS).
const GOLD: Record<string, number> = {
  valuable_1: 1,
  valuable_2: 5,
  valuable_3: 10,
  valuable_4: 3,
  valuable_5: 13,
  valuable_6: 25,
  valuable_7: 5,
  valuable_8: 27,
  valuable_9: 42,
  valuable_diamond_small: 50,
  valuable_diamond_small_red: 100,
  valuable_diamond: 250,
  valuable_diamond_red: 500
}

/** Gold in one level's XML: every `items/valuable_*.xml` item type. */
function goldIn(xml: string): number {
  let total = 0
  for (const m of xml.matchAll(/<string name="type">items\/(valuable_[a-z0-9_]+)\.xml<\/string>/g)) {
    total += GOLD[m[1]] ?? 0
  }
  return total
}

const [seedArg, ...ids] = process.argv.slice(2)
const seeds = Array.from({ length: seedArg === undefined ? 3 : Number(seedArg) }, (_, i) => 1000 + i)
const presets = ids.length === 0 ? CAMPAIGN_PRESETS : CAMPAIGN_PRESETS.filter((p) => ids.includes(p.id))
const mean = (xs: number[]) => (xs.length === 0 ? 0 : Math.round(xs.reduce((a, b) => a + b, 0) / xs.length))

const summary: string[] = [
  '| Preset | Floors | Lobby gold | Floor gold (mean) | Per floor (mean) |',
  '| --- | --- | --- | --- | --- |'
]
const details: string[] = []
for (const preset of presets) {
  const params = preset.build()
  const lobbyGold = params.lobbies.reduce((s, l) => s + (l.startingGold ?? 0), 0)
  const perFloor: number[][] = []
  const totals: number[] = []
  for (const seed of seeds) {
    const r = generateDungeon(params, seed)
    if (!r.ok) {
      console.error(`${preset.id} seed ${seed}: ${r.errors.join(' ')}`)
      continue
    }
    let total = 0
    for (const f of r.files) {
      const floor = /^levels\/\d+_floor(\d+)(?:_boss)?\.xml$/.exec(f.path)
      if (floor === null) continue
      const gold = goldIn(f.content)
      total += gold
      ;(perFloor[Number(floor[1]) - 1] ??= []).push(gold)
    }
    totals.push(total)
  }
  const floorTotal = mean(totals)
  summary.push(
    `| ${preset.label} | ${params.levels} | ${lobbyGold} | ${floorTotal} | ${params.levels === 0 ? 0 : Math.round(floorTotal / params.levels)} |`
  )
  details.push(`${preset.label} per-floor means: ${perFloor.map((g, i) => `F${i + 1} ${mean(g)}`).join(', ')}`)
}
console.log(`Seeds ${seeds.join(', ')}\n`)
console.log(summary.join('\n'))
console.log('')
for (const d of details) console.log(d)
