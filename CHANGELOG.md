# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Quick setup — all characters** on the Player tab: bulk-edit the whole roster
  instead of walking ~1,400 individual fields
  - A master `×` knob plus one per stat group (health, mana, damage, defense,
    utility, costs) that scales each starting stat **and every upgrade tier that
    writes it**, across all seven classes at once. Higher always means stronger:
    mana regen and skill costs are divided rather than multiplied
  - Upgrade shop modes: stock prices, **all free** (which also pre-unlocks each
    class's 2nd and ultimate skill), or **locked out** at an editable price
    (default 999,999) for a base-stats-only campaign
  - **Fully upgraded roster** preset — everyone starts with every upgrade bought
    and every skill unlocked, at whatever balance is currently set
  - **Remove extra lives from the shop**, since `life` is a repeatable purchase
    players can farm by leaving a level and returning
- Per-class "Skills unlocked at start" checkboxes, which fill in the skill stats
  the game leaves on sentinels until the unlock upgrade is bought
- `player.<file>.remove.<upgradeId>` overrides, which drop an upgrade from the
  emitted tweak file entirely; removal cascades to anything that requires it, so
  a file never ships a dangling `req`

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
- `bool` tweak params are now editable, stored as `0`/`1`, so skill unlocks
  round-trip through `parameters.txt` like every other override
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
