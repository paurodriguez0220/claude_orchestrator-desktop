# Task: UI visual design pass

**Status:** Planned

## Goal

Give the app real visual design — right now every renderer component has zero CSS, so the app renders as raw unstyled HTML (overlapping buttons, no layout, modals rendering inline instead of as overlays).

## Context

None of the MVP's 15 tasks or the existing-branch feature's 6 tasks ever added CSS. `src/renderer/index.html` has no stylesheet link, and no component has a `className`/style of any kind. This was fine for building/testing behavior (tests query by role/label/text, not appearance) but the app is now unusable-looking for daily use — confirmed by a screenshot showing the sidebar's "Digital.Knowledge" repo name running into its "New Task" button, and a "Remove" button overlapping a tiny bullet point.

## Proposed Design

### Setup

Add Tailwind CSS v4 via `@tailwindcss/vite` (no separate PostCSS/Tailwind config file needed — the plugin integrates directly into `electron.vite.config.ts`'s renderer Vite config). Add a single global stylesheet (`src/renderer/styles.css`) with the Tailwind import, linked from `index.html`/`main.tsx`.

### Visual direction

Dark theme throughout — a warm neutral graphite background (not default gray-900/blue-gray) with a terracotta/clay accent color for primary buttons, focus rings, and the active-task highlight in the sidebar. Applied via Tailwind's theme customization (CSS custom properties in Tailwind v4's `@theme` block), not scattered hex codes across components.

### Layout

- **App shell**: fixed-width dark sidebar (repos/tasks tree + "Open Existing Repo"/"Clone Repo" buttons) on the left; flexible main content area on the right. Implemented as a CSS grid/flex root in `App`.
- **Task selected**: terminal fills most of the main area's width; `TaskNotesPanel` becomes a narrower fixed-width panel to its right (not full-width below).
- **Error banner**: a visually distinct, dismissable bar anchored at the top of the app (replacing the current bare `<p role="alert">`), styled to read clearly as an error (not just default text color).

### Modals

`NewTaskModal` and `CloneRepoModal` become fixed-position centered overlays with a semi-transparent backdrop, instead of rendering inline in the normal document flow. Clicking the backdrop does not close the modal (avoid accidental data loss while filling a form) — only the existing Cancel button does.

### Terminal

`TerminalTab` passes an explicit `theme` option to the `Terminal` constructor (background/foreground/cursor/selection colors) matching the app's palette, so the embedded terminal reads as part of the app rather than a mismatched black rectangle.

### Non-goals

- No component logic, prop, or IPC behavior changes — this is visual/layout only.
- No new UI component library (no shadcn, no Radix) — Tailwind utility classes directly on existing JSX, per YAGNI for a single-user tool.
- No changes to test files — every existing test queries by role/label/text, not CSS classes, so all should keep passing unmodified. (If a specific test turns out to depend on DOM structure that must change for layout reasons, that's a plan-time decision to flag, not a silent change.)

### Testing

- All existing tests (main + renderer) must continue to pass unmodified — this is the primary regression guard, since there's no visual regression testing in this project.
- Manual verification via the smoke-test runbook: launch the app (`start.bat`), visually confirm the sidebar/main layout, open a modal (confirm it overlays centered with backdrop, not inline), select a task (confirm terminal + side notes panel layout), trigger an error (confirm the banner is visually distinct).

## Acceptance Criteria

- [ ] Tailwind CSS is set up via `@tailwindcss/vite`, no separate config file sprawl
- [ ] Sidebar, buttons, and task list render with real spacing/layout — no visual overlap
- [ ] `NewTaskModal`/`CloneRepoModal` render as centered overlays with a backdrop, not inline
- [ ] Selecting a task shows the terminal filling most of the main area with the notes panel as a narrower side panel, not stacked full-width
- [ ] Error messages render in a visually distinct banner
- [ ] Terminal colors are explicitly themed to match the app palette
- [ ] Every existing test (main + renderer) still passes unmodified
- [ ] `npm run build` succeeds

---
*Maintained by paurodriguez0220 · Last updated: 2026-07-08*
*Standards: https://github.com/paurodriguez0220/standards-docs*
