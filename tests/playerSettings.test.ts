import { describe, expect, it } from 'vitest'
import {
  parseParametersTxt,
  parsePlayerSettingsTxt,
  serializeParametersTxt,
  serializePlayerSettingsTxt,
  validateParameters
} from '../src/generator'
import { PLAYER_PRESETS, PLAYER_PRESET_GROUPS, TWEAK_FIELD_MAP, playerPresetById, pruneTweaks } from '../src/generator/tweak'
import { defaultParameters } from '../src/generator/config/parameters'
import type { PlayerTweaks } from '../src/generator/tweak/types'

const FLOAT_KEY = 'player.general.easy.enemyhealthall'
const INT_KEY = 'player.knight.param.max-health'
const REMOVE_KEY = 'player.shared.remove.life'

/** the lines that are not the `#` header */
function bodyLines(text: string): string[] {
  return text.split('\r\n').filter((line) => line !== '' && !line.startsWith('#'))
}

describe('playersettings.txt', () => {
  it('names real tweak fields of the expected types', () => {
    expect(TWEAK_FIELD_MAP.get(FLOAT_KEY)?.type).toBe('float')
    expect(TWEAK_FIELD_MAP.get(INT_KEY)?.type).toBe('int')
    expect(TWEAK_FIELD_MAP.has(REMOVE_KEY)).toBe(true)
  })

  it.each<[string, PlayerTweaks]>([
    ['empty', {}],
    ['the default', defaultParameters().playerTweaks],
    ['a float field', { [FLOAT_KEY]: 1.25 }],
    ['an int field', { [INT_KEY]: 300 }],
    ['a remove flag plus mixed fields', { [REMOVE_KEY]: 1, [FLOAT_KEY]: 0.5, [INT_KEY]: 1 }]
  ])('round-trips %s exactly', (_label, tweaks) => {
    const parsed = parsePlayerSettingsTxt(serializePlayerSettingsTxt(tweaks))
    expect(parsed.tweaks).toEqual(pruneTweaks(tweaks))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys).toEqual([])
  })

  it('writes only the header for a stock Player tab', () => {
    const text = serializePlayerSettingsTxt({})
    expect(bodyLines(text)).toEqual([])
    expect(text.startsWith('#')).toBe(true)
  })

  it('writes stock-valued entries as nothing, and sorts the rest', () => {
    const stock = TWEAK_FIELD_MAP.get(INT_KEY)!.stock
    const text = serializePlayerSettingsTxt({ [REMOVE_KEY]: 1, [INT_KEY]: stock, [FLOAT_KEY]: 2 })
    expect(bodyLines(text)).toEqual([`${FLOAT_KEY}=2.000000`, `${REMOVE_KEY}=1`])
  })

  it('formats every line exactly as parameters.txt does', () => {
    const tweaks = { [REMOVE_KEY]: 1, [FLOAT_KEY]: 0.5, [INT_KEY]: 200 }
    const full = serializeParametersTxt({ ...defaultParameters(), playerTweaks: tweaks }).split('\r\n')
    for (const line of bodyLines(serializePlayerSettingsTxt(tweaks))) {
      expect(full).toContain(line)
    }
  })

  it('replaces the Player tab: a key the file leaves out is stock', () => {
    // the default carries `remove.life`; a file without it means "buyable again"
    expect(parsePlayerSettingsTxt(`${INT_KEY}=200\n`).tweaks).toEqual({ [INT_KEY]: 200 })
  })

  it('drops a stock value, truncates an int, and lowercases keys', () => {
    const stock = TWEAK_FIELD_MAP.get(FLOAT_KEY)!.stock
    const parsed = parsePlayerSettingsTxt(`${FLOAT_KEY}=${stock}\nPLAYER.Knight.Param.Max-Health=250.9\n`)
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 250 })
  })

  it('reports an unknown player key and a non-number, and keeps the rest', () => {
    const parsed = parsePlayerSettingsTxt(
      ['player.knight.param.no-such-stat=5', `${FLOAT_KEY}=lots`, `${INT_KEY}=120`].join('\n')
    )
    expect(parsed.unknownKeys).toEqual(['player.knight.param.no-such-stat', FLOAT_KEY])
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 120 })
  })

  it('skips comments, blank lines, CRLF endings and malformed lines', () => {
    const parsed = parsePlayerSettingsTxt(`# a comment\r\n\r\n${INT_KEY}=90\r\nnot a key value line\r\n`)
    expect(parsed.tweaks).toEqual({ [INT_KEY]: 90 })
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys).toEqual([])
  })

  it('takes only the player half of a whole parameters.txt', () => {
    const params = { ...defaultParameters(), playerTweaks: { [REMOVE_KEY]: 1, [INT_KEY]: 400 } }
    const text = serializeParametersTxt(params)
    const parsed = parsePlayerSettingsTxt(text)
    expect(parsed.tweaks).toEqual(pruneTweaks(params.playerTweaks))
    expect(parsed.unknownKeys).toEqual([])
    expect(parsed.ignoredKeys.length).toBeGreaterThan(0)
    expect(parsed.ignoredKeys.some((key) => key.toLowerCase().startsWith('player.'))).toBe(false)
  })

  it('still applies its player keys when imported as a parameters.txt', () => {
    const tweaks = { [INT_KEY]: 222 }
    const parsed = parseParametersTxt(serializePlayerSettingsTxt(tweaks))
    expect(parsed.params.playerTweaks[INT_KEY]).toBe(222)
    expect(parsed.unknownKeys).toEqual([])
  })
})

describe('player presets', () => {
  // Every build, present and future, is held to the same rules the campaign
  // presets follow.
  it('each sit in a known Player-tab group', () => {
    const groups = new Set(PLAYER_PRESET_GROUPS.map((group) => group.id))
    for (const preset of PLAYER_PRESETS) expect(groups.has(preset.group), preset.id).toBe(true)
  })

  it('have unique ids, and playerPresetById finds each one', () => {
    const ids = PLAYER_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const preset of PLAYER_PRESETS) expect(playerPresetById(preset.id)).toBe(preset)
    expect(playerPresetById('no-such-preset')).toBeUndefined()
  })

  it('build a fresh, pruned record of real tweak keys that validates', () => {
    for (const preset of PLAYER_PRESETS) {
      const first = preset.build()
      const second = preset.build()
      expect(first).not.toBe(second)
      expect(first).toEqual(second)
      expect(first).toEqual(pruneTweaks(first))
      for (const key of Object.keys(first)) expect(TWEAK_FIELD_MAP.has(key)).toBe(true)
      const result = validateParameters({ ...defaultParameters(), playerTweaks: first })
      expect(result.errors, preset.id).toEqual([])
    }
  })

  // This generator's campaigns never sell extra lives. Loading a preset
  // replaces the whole Player tab, so each one has to carry the removal itself.
  it('never put extra lives back in the shop', () => {
    for (const preset of PLAYER_PRESETS) {
      expect(preset.build()['player.shared.remove.life'], preset.id).toBe(1)
    }
  })

  it('survive a playersettings.txt round trip', () => {
    for (const preset of PLAYER_PRESETS) {
      const tweaks = preset.build()
      expect(parsePlayerSettingsTxt(serializePlayerSettingsTxt(tweaks)).tweaks).toEqual(tweaks)
    }
  })
})

describe('Anniversary Edition player preset', () => {
  const ae = () => {
    const preset = playerPresetById('anniversary')
    if (preset === undefined) throw new Error('anniversary preset missing')
    return preset.build()
  }

  it('moves everyone at 1.1 with a shop ladder that stays above it', () => {
    const tweaks = ae()
    expect(tweaks['player.shared.param.move-speed']).toBe(1.1)
    const ladder = ['speed-1', 'speed-2', 'speed-3'].map((id) => tweaks[`player.shared.effect.${id}.move-speed`])
    expect(ladder).toEqual([1.2, 1.3, 1.4])
  })

  it('adds no validation warnings over the stock Player tab', () => {
    const messages = (playerTweaks: PlayerTweaks) =>
      new Set(validateParameters({ ...defaultParameters(), playerTweaks }).warnings.map((w) => w.message))
    const stock = messages({})
    const added = [...messages(ae())].filter((message) => !stock.has(message))
    expect(added).toEqual([])
  })
})
