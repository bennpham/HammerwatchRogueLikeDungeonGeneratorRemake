# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
