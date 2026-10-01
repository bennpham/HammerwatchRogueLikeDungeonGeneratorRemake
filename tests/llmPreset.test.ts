import { describe, expect, it } from 'vitest'
import {
  CAMPAIGN_PRESETS,
  defaultParameters,
  parseParametersTxt,
  serializeParametersTxt,
  validateParameters
} from '../src/generator'
import { buildRepairMessage, buildSystemPrompt } from '../src/shared/llm/prompt'
import { diffParams, extractParametersBlock } from '../src/shared/llm/reply'
import { describeHttpError } from '../src/main/llm/client'

const CLAUDE = CAMPAIGN_PRESETS.filter((p) => p.group === 'claude')

describe('extractParametersBlock', () => {
  it('reads a ```parameters fence and ignores the prose around it', () => {
    const reply = 'Sure, here you go.\n```parameters\nlevels=4\nmapWidth=100\n```\nEnjoy!'
    expect(extractParametersBlock(reply)).toBe('levels=4\nmapWidth=100')
  })

  it('accepts an untagged fence and a ```txt fence', () => {
    expect(extractParametersBlock('```\nlevels=3\n```')).toBe('levels=3')
    expect(extractParametersBlock('```txt\nlevels=3\n```')).toBe('levels=3')
  })

  it('falls back to bare key=value lines when there is no fence', () => {
    expect(extractParametersBlock('Here:\nlevels=5\nmapWidth=120\nThat is all.')).toBe('levels=5\nmapWidth=120')
  })

  it('joins several parameters blocks in order, and prefers them over other fences', () => {
    const reply = '```parameters\nlevels=4\n```\ntext\n```parameters\nmapWidth=100\n```\n```\nshopChance=0.5\n```'
    expect(extractParametersBlock(reply)).toBe('levels=4\nmapWidth=100')
  })

  it('returns null for a prose-only reply', () => {
    expect(extractParametersBlock('Which theme do you want? Ice, fire or desert?')).toBeNull()
    expect(extractParametersBlock('')).toBeNull()
  })

  it('handles CRLF line endings and an unclosed fence', () => {
    expect(extractParametersBlock('Hi\r\n```parameters\r\nlevels=4\r\nmapWidth=100\r\n```\r\n')).toBe('levels=4\nmapWidth=100')
    expect(extractParametersBlock('```parameters\nlevels=4\nmapWidth=1')).toBe('levels=4\nmapWidth=1')
  })

  it('ignores prose that merely contains an equals sign mid-sentence', () => {
    expect(extractParametersBlock('Set it so that levels = more is nice')).toBeNull()
  })
})

describe('every Claude preset survives the LLM round trip', () => {
  for (const preset of CLAUDE) {
    it(preset.id, () => {
      const params = preset.build()
      const reply = `Here is the campaign.\n\`\`\`parameters\n${serializeParametersTxt(params)}\n\`\`\``
      const block = extractParametersBlock(reply)
      expect(block).not.toBeNull()
      const parsed = parseParametersTxt(block as string, defaultParameters())
      expect(parsed.unknownKeys).toEqual([])
      expect(validateParameters(parsed.params).errors).toEqual([])
      expect(parsed.params).toEqual(params)
    })
  }
})

describe('diffParams', () => {
  it('is empty for identical parameters', () => {
    expect(diffParams(defaultParameters(), defaultParameters())).toEqual([])
  })

  it('reports only the keys that were touched', () => {
    const before = defaultParameters()
    const after = parseParametersTxt('mapWidth=100\nshopChance=0.5', before).params
    const changes = diffParams(before, after)
    expect(changes.map((c) => c.key).sort()).toEqual(['mapWidth', 'shopChance'])
    const width = changes.find((c) => c.key === 'mapWidth')
    expect(width).toEqual({ key: 'mapWidth', before: '80', after: '100' })
  })

  it('reports a key that appears or disappears with a null side', () => {
    const before = defaultParameters()
    const after = { ...before, mapHeight: 80 }
    expect(diffParams(before, after)).toEqual([{ key: 'mapHeight', before: '60', after: '80' }])
  })
})

describe('buildRepairMessage', () => {
  it('lists every error field and every unknown key', () => {
    const message = buildRepairMessage(
      [
        { field: 'themes', message: 'Floor 2 has no theme.' },
        { field: 'mapWidth', message: 'Map width must be at least 20.' }
      ],
      ['levelz', 'boss9Mode']
    )
    for (const needle of ['themes', 'Floor 2 has no theme.', 'mapWidth', 'at least 20', 'levelz', 'boss9Mode']) {
      expect(message).toContain(needle)
    }
  })

  it('omits a section that has nothing in it', () => {
    expect(buildRepairMessage([], ['levelz'])).not.toContain('Validation errors')
    expect(buildRepairMessage([{ field: 'a', message: 'b' }], [])).not.toContain('did not recognise')
  })
})

describe('buildSystemPrompt', () => {
  it('is deterministic', () => {
    expect(buildSystemPrompt(defaultParameters())).toBe(buildSystemPrompt(defaultParameters()))
  })

  it('carries the current settings and the id lists', () => {
    const current = parseParametersTxt('mapWidth=140', defaultParameters()).params
    const prompt = buildSystemPrompt(current)
    expect(prompt).toContain('mapWidth=140')
    expect(prompt).toContain('boss_dragon')
    expect(prompt).toContain('a_mixed')
  })

  it('stays compact enough for a small free model', () => {
    expect(buildSystemPrompt(defaultParameters()).length).toBeLessThan(32000)
  })
})

describe('describeHttpError', () => {
  it('maps the common statuses to actionable text', () => {
    expect(describeHttpError('Groq', 401, null, '').message).toContain('API key')
    const limited = describeHttpError('Groq', 429, '12', '')
    expect(limited.message).toContain('12 s')
    expect(limited.retryAfterMs).toBe(12000)
    expect(describeHttpError('Groq', 500, null, '{"error":{"message":"boom"}}').message).toContain('boom')
  })
})
