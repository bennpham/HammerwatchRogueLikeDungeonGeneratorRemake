import React from 'react'
import type { CurveMode, ValidationIssue } from '../../generator'

interface NumberFieldProps {
  label: string
  field: string
  value: number
  onChange: (value: number) => void
  issues: ValidationIssue[]
  min?: number
  max?: number
  step?: number
  title?: string
}

/** Labeled number input with inline validation message. */
export function NumberField({ label, field, value, onChange, issues, min, max, step, title }: NumberFieldProps) {
  const fieldIssues = issues.filter((i) => i.field === field)
  return (
    <label className={`field ${fieldIssues.length > 0 ? 'field-error' : ''}`} title={title}>
      <span className="field-label">{label}</span>
      <input
        type="number"
        value={Number.isNaN(value) ? '' : value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
      />
      {fieldIssues.map((issue, i) => (
        <span key={i} className="field-message">
          {issue.message}
        </span>
      ))}
    </label>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  badge?: string
}

/** Collapsible form section. */
export function Section({ title, children, defaultOpen = false, badge }: SectionProps) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        {title}
        {badge && <span className="section-badge">{badge}</span>}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  )
}

/** Collapsible group nested inside a {@link Section}. */
export function Subsection({ title, children, defaultOpen = false, badge }: SectionProps) {
  return (
    <details className="subsection" open={defaultOpen}>
      <summary className="subsection-title">
        {title}
        {badge && <span className="section-badge">{badge}</span>}
      </summary>
      <div className="subsection-body">{children}</div>
    </details>
  )
}

interface CurveFieldProps {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  title?: string
  /** omit to hide the +/× selector */
  mode?: CurveMode
  onModeChange?: (mode: CurveMode) => void
}

/**
 * One knob of an upgrade curve. Deliberately not a {@link NumberField}: curves
 * are a shorthand for a set of per-tier overrides, not an override themselves,
 * so they carry no key and no inline validation of their own.
 */
export function CurveField({ label, value, onChange, step, title, mode, onModeChange }: CurveFieldProps) {
  return (
    <label className="field curve-field" title={title}>
      <span className="field-label">{label}</span>
      <span className="curve-input">
        {mode !== undefined && onModeChange !== undefined && (
          <select
            className="curve-mode"
            value={mode}
            onChange={(e) => onModeChange(e.target.value as CurveMode)}
            title="+ adds the step to each tier, × multiplies by it"
          >
            <option value="add">+</option>
            <option value="mul">×</option>
          </select>
        )}
        <input
          type="number"
          value={Number.isNaN(value) ? '' : value}
          step={step ?? 1}
          onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        />
      </span>
    </label>
  )
}

interface ChainRowProps {
  title: string
  /** shown next to the title, e.g. the stats the chain writes */
  subtitle?: string
  badge?: string
  /** the curve knobs */
  children: React.ReactNode
  /** the per-tier inputs, revealed on demand */
  tiers: React.ReactNode
}

/** One upgrade ladder: its curve up front, the raw tiers behind a disclosure. */
export function ChainRow({ title, subtitle, badge, children, tiers }: ChainRowProps) {
  return (
    <div className="chain-row">
      <div className="chain-head">
        <span className="chain-title">{title}</span>
        {subtitle && <span className="chain-subtitle">{subtitle}</span>}
        {badge && <span className="section-badge">{badge}</span>}
      </div>
      <div className="field-grid chain-curves">{children}</div>
      <details className="chain-tiers">
        <summary>Edit tiers</summary>
        <div className="chain-tiers-body">{tiers}</div>
      </details>
    </div>
  )
}

interface TierBlockProps {
  id: string
  children: React.ReactNode
}

/** One upgrade's own inputs, labelled with the id that appears in the XML. */
export function TierBlock({ id, children }: TierBlockProps) {
  return (
    <div className="tier-block">
      <span className="tier-id">{id}</span>
      <div className="field-grid">{children}</div>
    </div>
  )
}
