# Task: Package as a proper Windows installer

**Status:** Done

## Goal

Replace the `start.bat` dev-mode launcher with a packaged, installable Windows app.

## Context

The MVP ships with `start.bat` (+ a Desktop shortcut pointing to it) that runs `npm run dev` — a hot-reload dev server, with a visible console window, requiring Node/npm to be installed. The original design doc explicitly deferred "Installer/code-signing/distribution" as out of scope for the MVP (`docs/tasks/defined/claude-orchestrator-mvp.md`). This is the tracked follow-up.

## Proposed Design

Use `electron-builder` to produce a Windows installer (or portable exe) from `npm run build`'s output, replacing the dev-mode launcher. Given this is a single-user personal tool, code-signing can likely be skipped (accept the SmartScreen warning on first run) unless AppLocker/EDR friction shows up in practice.

## Acceptance Criteria

- [ ] App launches from a Start Menu entry / Desktop icon without a visible console window
- [ ] Runs the production build, not the dev server
- [ ] `start.bat` and its Desktop shortcut are removed once the installer replaces them
- [ ] Build/release process documented in `CLAUDE.md`
