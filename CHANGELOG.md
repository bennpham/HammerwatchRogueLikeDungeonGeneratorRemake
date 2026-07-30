# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **All characters** on the Player tab: bulk-edit the whole roster instead of
  walking ~1,400 individual fields. *Enemy difficulty* stays a top-level sibling;
  the roster-wide knobs and all eight player files live inside this one section, so
  a quick setup never has to scroll past seven class accordions
  - A master `×` knob plus one per stat group (health, mana, damage, defense,
    utility, costs) that scales each starting stat **and every upgrade tier that
    writes it**, across all seven classes at once. Higher always means stronger:
    mana regen and skill costs are divided rather than multiplied
  - Upgrade shop modes: **stock prices**, **all free** (which also pre-unlocks each
    class's 2nd and ultimate skill), **no upgrades** for a base-stats-only campaign,
    or **one custom price** — negative pays the player
  - **Fully upgraded roster** preset — everyone starts with every upgrade bought
    and every skill unlocked, at whatever balance is currently set, and the shop is
    cleared of everything that can no longer improve them
  - **Skills unlocked at start**, grouped by class in one place, filling in the
    stats and asset paths the game leaves unset until the upgrade is bought
  - **Remove extra lives from the shop**, since `life` is a repeatable purchase
    players can farm by leaving a level and returning
- **A "tiers sold" limit on every upgrade ladder.** Set it to 2 and the shop offers
  only the first two tiers; the rest disappear, because each tier requires the one
  below it and the emitted file drops the whole dependent subtree. Single-purchase
  entries get a checkbox instead
- `player.<file>.remove.<upgradeId>` overrides, which drop an upgrade from the
  emitted tweak file entirely; removal cascades to anything that requires it, so
  a file never ships a dangling `req`

### Fixed

- **"Fully upgraded roster" no longer leaves the shop selling downgrades.** A maxed
  Thief was still offered *Knives Damage 1* for 800 gold, which would have dropped
  `knives-dmg` from 46 to 16. The preset now takes every upgrade that can no longer
  improve anything out of the shop. Upgrades with no stats — extra lives,
  rejuvenation and the three potions — stay buyable, because "already better"
  cannot be computed for them and they still do something for a maxed character
- The shop-price toggle no longer reads **Mixed** when no price has been touched.
  Removing extra lives, or shortening a ladder, used to flip it off *Stock prices*
- **Pre-unlocked skills no longer crash the game.** `combo-nova-projectile` and
  `aura-buff` are empty in the stock files and only an upgrade fills them in, so
  arming a combo nova's numbers without its projectile threw a
  `NullReferenceException` mid-combat — after several minutes of play, not at load.
  Both presets now carry an upgrade's string children alongside its numbers, and a
  new blocking validation rule rejects any skill left pointing at an empty path.
  As a side effect a fully-upgraded Knight also gets the wider sword-arc graphic
  its upgrades imply

### Changed

- **Upgrade shop modes reworked after play-testing.** "Locked out" priced every
  upgrade at 999,999; it is now **No upgrades**, which leaves them out of the
  emitted files so the shop genuinely has nothing to sell. A new **Set a price**
  mode takes any single price instead
- **Negative upgrade prices are now allowed.** Confirmed in game: an upgrade
  priced below zero *pays* the player. Useful for a "sell your character down"
  shop — start with high stats and take debuffs for gold. Validation reports the
  whole bounty shop in one warning rather than once per upgrade
- `SHOP_PRICE_MAX` (999,999, the most the shop will display) replaces
  `DEFAULT_LOCK_PRICE` and is now a clamp rather than a lockout mechanism
- **Percentage stats over 100% now warn.** Confirmed in game: anything past 100
  is wasted, because a chance cannot exceed always. The warning also distinguishes
  the two kinds, which look identical in the data — `dodge-chance` at 100 makes a
  Thief or Ranger literally unhittable (its stock ladder tops out at 50, so a
  Defense ×2 gets there), while `shield-chance` at 100 leaves a Sorcerer taking
  full damage because it is the frost-shield proc, not evasion. One warning covers
  the whole set
- `bool` tweak params are now editable, stored as `0`/`1`, so skill unlocks
  round-trip through `parameters.txt` like every other override
- `string` tweak params are now editable, stored as an **index** into the values
  the stock data offers, so an unshipped asset path cannot be emitted
- The "buying it would downgrade the character" warnings no longer fire when a
  starting stat sits exactly on a rung of its own ladder — the signature of a
  deliberately fully-upgraded character. Overshooting a ladder still warns

## [0.1.0] - 2026-07-28

### Added

- Initial Alpha release of the [converted Java Rogue-like Dungeon Generator 1.1](https://web.archive.org/web/20191207045849/http://hammerwatch.com/forum/index.php?topic=1658.30)
- Electron main process and React GUI with map preview
- Dungeon generator TypeScript port from original Java tool with full test suite and validation rules
- README and documentation for the project
- Default parameters file and parameter parsing
- LevelPacker integration tests for campaign packaging
- Orchestrator subagents and project context skills for Claude Code integration

### Changed

- Upgraded Electron to 43.2.0

### Security

- Fixed all 16 npm security vulnerabilities via dependency overrides
