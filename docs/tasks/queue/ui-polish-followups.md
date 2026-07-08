# Task: UI polish follow-ups

**Status:** Planned

## Goal

Small polish items from the final review of the UI visual design pass. None are blockers.

## Context

Final whole-branch review (2026-07-08) approved the visual design pass for merge but flagged three minor items.

## Proposed Design

- `app.tsx`: the fixed error banner (`fixed inset-x-0 top-0`) overlaps the sidebar's top buttons while visible, since neither the sidebar nor main content reserves space for it. Add a `pt-*` offset to the shell (or make the banner participate in normal flow) when an error is showing.
- Form inputs/textarea/select use `focus:border-clay-500 focus:outline-none` — a border-color shift rather than a true focus ring. The design direction called for "focus rings." Consider `focus:ring-2 focus:ring-clay-500` for stronger keyboard-focus visibility.
- This branch introduced a reusable pattern (Tailwind v4 via `@tailwindcss/vite`, `@theme` token palette, no separate config file) not yet captured in `standards-docs/web-components.md`. Add a short note for future projects.

## Acceptance Criteria

- [ ] Error banner no longer visually overlaps sidebar content
- [ ] Text inputs show a clear focus ring, not just a border-color shift
- [ ] Tailwind v4 setup convention documented in standards-docs
