import React from 'react'
import type { ValidationIssue } from '../../generator'

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
