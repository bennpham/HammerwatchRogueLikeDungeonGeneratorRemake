import React from 'react'
import { TWEAK_BASELINE, TWEAK_FIELDS, countTweaksByFile } from '../../generator'
import type { PlayerTweaks, TweakFieldDef, ValidationIssue } from '../../generator'
import { NumberField, Section } from './fields'

interface PlayerFormProps {
  tweaks: PlayerTweaks
  issues: ValidationIssue[]
  onChange: (tweaks: PlayerTweaks) => void
}

/** Fields grouped by the file they belong to, in baseline display order. */
const FIELDS_BY_FILE = new Map<string, TweakFieldDef[]>(
  TWEAK_BASELINE.map((file) => [file.id, TWEAK_FIELDS.filter((f) => f.fileId === file.id)])
)

function currentValue(tweaks: PlayerTweaks, field: TweakFieldDef): number {
  const override = tweaks[field.key]
  return override === undefined ? field.stock : override
}

/**
 * Editor for the game's tweak/*.xml balance data. Values equal to the stock
 * game are deleted from the override map rather than stored, so "nothing was
 * changed" stays literally empty and no tweak/ folder gets emitted.
 */
export function PlayerForm({ tweaks, issues, onChange }: PlayerFormProps) {
  const counts = countTweaksByFile(tweaks)

  const set = (field: TweakFieldDef, value: number) => {
    const next = { ...tweaks }
    if (Number.isNaN(value) || value === field.stock) {
      delete next[field.key]
    } else {
      next[field.key] = value
    }
    onChange(next)
  }

  const badge = (fileId: string): string | undefined => {
    const n = counts[fileId]
    return n === undefined ? undefined : `${n} changed`
  }

  const grid = (fields: TweakFieldDef[]) => (
    <div className="field-grid">
      {fields.map((field) => (
        <NumberField
          key={field.key}
          label={field.label}
          field={field.key}
          value={currentValue(tweaks, field)}
          onChange={(v) => set(field, v)}
          issues={issues}
          step={field.type === 'float' ? 0.05 : 1}
          title={`${field.file} — stock ${field.stock}`}
        />
      ))}
    </div>
  )

  return (
    <div className="parameter-form">
      <p className="hint player-intro">
        Starting stats and shop prices from the game&apos;s <code>tweak/</code> files. Anything you change
        here is written into the campaign so it applies to your dungeon only. Leave everything alone and
        no tweak files are produced at all.
      </p>

      {TWEAK_BASELINE.map((file) => {
        const fields = FIELDS_BY_FILE.get(file.id) ?? []
        if (fields.length === 0) return null

        if (file.kind === 'general') {
          return (
            <Section key={file.id} title={file.label} badge={badge(file.id)}>
              <p className="hint">
                Per-difficulty enemy scaling. <code>medium</code> is the 1.0 baseline; lower{' '}
                <code>SpawnFreq</code> means faster spawns.
              </p>
              {file.difficulties.map((difficulty) => (
                <div key={difficulty.name} className="player-subgroup">
                  <div className="player-subgroup-title">{difficulty.name}</div>
                  {grid(fields.filter((f) => f.section === difficulty.name))}
                </div>
              ))}
            </Section>
          )
        }

        const params = fields.filter((f) => f.group === 'param')
        const costs = fields.filter((f) => f.group === 'cost')

        return (
          <Section key={file.id} title={file.label} badge={badge(file.id)}>
            {params.length > 0 && (
              <div className="player-subgroup">
                <div className="player-subgroup-title">Starting stats</div>
                {grid(params)}
              </div>
            )}
            {costs.length > 0 && (
              <div className="player-subgroup">
                <div className="player-subgroup-title">Upgrade costs (gold)</div>
                {grid(costs)}
              </div>
            )}
          </Section>
        )
      })}
    </div>
  )
}
