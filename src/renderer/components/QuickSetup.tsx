import React from 'react'
import {
  DEFAULT_LOCK_PRICE,
  EXTRA_LIFE_UPGRADES,
  STAT_GROUPS,
  applyCostPolicy,
  applyFullyUpgraded,
  applyMasterFactor,
  applyShopRemovals,
  applySkillUnlocks,
  applyStatFactor,
  deriveCostPolicy,
  deriveMasterFactor,
  deriveShopRemovals,
  deriveSkillUnlocks,
  deriveStatFactor,
  resetQuickSetup,
  totalShopCost
} from '../../generator'
import type { CostPolicy, PlayerTweaks, StatGroupId } from '../../generator'
import { BoolField, CurveField, Section, Subsection, ToggleGroup } from './fields'

interface QuickSetupProps {
  tweaks: PlayerTweaks
  badge?: string
  onChange: (tweaks: PlayerTweaks) => void
}

type ShopChoice = Exclude<CostPolicy, 'mixed'> | 'mixed'

const SHOP_OPTIONS: Array<{ value: ShopChoice; label: string; title: string }> = [
  { value: 'stock', label: 'Stock prices', title: 'The prices the game ships with' },
  {
    value: 'free',
    label: 'All free',
    title: 'Every upgrade costs 0, so a character can be fully kitted out — including the 2nd and ultimate skill — at any shop'
  },
  {
    value: 'locked',
    label: 'Locked out',
    title: 'Prices set out of reach, so the party plays the whole campaign on its starting stats'
  }
]

const gold = (value: number): string => value.toLocaleString('en-US')

/**
 * Bulk editor for the whole roster, sitting above the per-class sections.
 *
 * It owns no state of its own: every knob reads its value back out of `tweaks`
 * and writes ordinary `player.*` overrides, so what you set here shows up in the
 * class sections below, exports to parameters.txt, and disappears entirely at
 * ×1 — which is what keeps a stock run from emitting a tweak/ folder.
 */
export function QuickSetup({ tweaks, badge, onChange }: QuickSetupProps) {
  // the lock price is a UI-only choice: what gets stored is the price itself
  const [lockPrice, setLockPrice] = React.useState(DEFAULT_LOCK_PRICE)

  const master = deriveMasterFactor(tweaks)
  const policy = deriveCostPolicy(tweaks, lockPrice)
  const skills = deriveSkillUnlocks(tweaks)
  const noLives = deriveShopRemovals(EXTRA_LIFE_UPGRADES, tweaks)

  const setPolicy = (choice: ShopChoice) => {
    if (choice === 'mixed') return
    const next = applyCostPolicy(choice, lockPrice, tweaks)
    // free upgrades exist so a character can reach its 2nd and ultimate skill,
    // so switch those on at the same time rather than making it a second step
    onChange(choice === 'free' ? applySkillUnlocks(true, next) : next)
  }

  const setLock = (value: number) => {
    setLockPrice(value)
    if (policy === 'locked' && Number.isFinite(value)) {
      onChange(applyCostPolicy('locked', value, tweaks))
    }
  }

  return (
    <Section title="Quick setup — all characters" badge={badge}>
      <p className="hint">
        Scales starting stats <em>and</em> every upgrade tier that writes them, across all seven
        classes at once. <code>×1</code> is the stock game and stores nothing. Switch to the{' '}
        <strong>Loadout</strong> tab to see what a character ends up with.
      </p>

      <Subsection title="Stat multipliers" defaultOpen>
        <div className="field-grid quick-setup-master">
          <CurveField
            label={`all stats${master.uniform ? '' : ' · mixed'}`}
            value={master.factor}
            step={0.1}
            onChange={(v) => onChange(applyMasterFactor(v, tweaks))}
            title="Sets every group below at once"
          />
        </div>
        <div className="field-grid">
          {STAT_GROUPS.map((group) => {
            const derived = deriveStatFactor(group.id, tweaks)
            return (
              <CurveField
                key={group.id}
                label={`${group.label}${derived.uniform ? '' : ' · custom'}`}
                value={derived.factor}
                step={0.1}
                onChange={(v) => onChange(applyStatFactor(group.id as StatGroupId, v, tweaks))}
                title={group.hint}
              />
            )
          })}
        </div>
        <p className="hint">
          Higher is always stronger: mana regen and skill costs are divided rather than multiplied,
          because a lower period and a cheaper spell are the better ones. Stats the game leaves
          unset — a locked skill&apos;s duration, for instance — are skipped so their sentinels stay
          intact.
        </p>
      </Subsection>

      <Subsection title="Upgrade shop" defaultOpen>
        <ToggleGroup
          label="prices"
          value={policy}
          options={
            policy === 'mixed'
              ? [...SHOP_OPTIONS, { value: 'mixed' as ShopChoice, label: 'Mixed', title: 'Prices have been edited by hand' }]
              : SHOP_OPTIONS
          }
          onChange={setPolicy}
        />

        {policy === 'locked' && (
          <div className="field-grid">
            <CurveField
              label="lock price"
              value={lockPrice}
              step={1000}
              onChange={setLock}
              title="High enough that the party can never save up for it"
            />
          </div>
        )}

        <div className="quick-setup-checks">
          <BoolField
            label="Start with 2nd + ultimate skills unlocked"
            checked={skills}
            onChange={(on) => onChange(applySkillUnlocks(on, tweaks))}
            title="Also fills in each skill's stats, which the game leaves unset until the upgrade is bought"
          />
          <BoolField
            label="Remove extra lives from the shop (life)"
            checked={noLives}
            onChange={(on) => onChange(applyShopRemovals(EXTRA_LIFE_UPGRADES, on, tweaks))}
            title="Extra lives are repeatable, so players can farm them by leaving a level and coming back. Rejuvenation stays — it is a one-off full heal, not another life."
          />
        </div>

        <p className="hint">Gold to buy every upgrade in the game: {gold(totalShopCost(tweaks))}.</p>
      </Subsection>

      <Subsection title="Presets" defaultOpen>
        <div className="quick-setup-presets">
          <button type="button" onClick={() => onChange(applyFullyUpgraded(tweaks))}>
            Fully upgraded roster
          </button>
          <button type="button" onClick={() => onChange(resetQuickSetup(tweaks))}>
            Reset quick setup
          </button>
        </div>
        <p className="hint">
          <strong>Fully upgraded</strong> bakes every upgrade&apos;s result into the starting stats
          and unlocks every skill, so nobody has to shop at all — set your multipliers first, since
          it captures the ladder as it stands. <strong>Reset</strong> returns every character stat,
          price and skill to the stock game, leaving enemy difficulty alone.
        </p>
      </Subsection>
    </Section>
  )
}
