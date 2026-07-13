# ADO integration — design

*Date: 2026-07-13 · Status: approved, pending implementation*

## Problem

Paulo's Azure DevOps tooling lives outside the orchestrator: the `~/.claude/commands/ado-*`
slash commands (read: my-tasks, team, blocked, retro) and `~/scripts/New-ZenithNoteTask.ps1`
(creates ADO child work items). The orchestrator is ADO-task-centric (tasks carry an `adoId`, the
DSU log already shells `/ado-my-tasks`), but you can't see your ADO work items or create ADO items
from the app — you switch to a Claude session to do it. Bringing this into the app closes the loop
between an ADO work item and the worktree/task that services it.

## Goal

Integrate ADO into the app UI: view my ADO work items, spin up a worktree-task from one, and
create a new ADO work item. **Creation is always gated behind a confirmation form — the app never
creates an ADO work item automatically.**

## Non-goals (V1)

- Team / sprint view (like `/ado-team`) — deferred.
- Editing/closing existing ADO items from the app.
- Reusing `New-ZenithNoteTask.ps1` — the app talks to `az` directly (below).

## Mechanism

The main process talks to ADO via the **`az` CLI** (Azure CLI + azure-devops extension, PAT auth
— the same setup `/ado-login` configures). All calls go through a new
`src/main/services/ado-service.ts` that mirrors `git-service.ts`: `execFileAsync('az', [...args])`
with an `AdoCommandError { message, stderr }`, **every argument passed as an array element — never
string-interpolated** (repo rule). New IPC channels are exposed through the preload facade and
consumed by the renderer. `az` is the only new runtime dependency.

### Auth / preconditions

`ado-service` exposes a check that runs `az devops project list` (as the existing commands do). If
`az` is missing or the user isn't authenticated, the service throws an actionable `AdoCommandError`
("Azure DevOps not authenticated — run `/ado-login`…"). The renderer surfaces it in the existing
error banner. No silent failures.

### Config

`getAdoConfig()` parses `az devops configure --list` for `organization` and `project`, used to
build work-item URLs (`https://dev.azure.com/<org>/<project>/_workitems/edit/<id>`).

## Capabilities

### 1. View my ADO tasks (read-only)

- `ado-service.listMyAssignedTasks(email)` runs the WIQL query `/ado-my-tasks` uses
  (`az boards query --wiql "…AssignedTo = '<email>'… State NOT IN (Closed,Resolved,Done,Removed)…"
  -o json`) and returns a typed `AdoWorkItem[]` `{ id, title, type, state, areaPath, storyPoints }`.
  Email defaults to `paulo.rodriguez@fefundinfo.com`; it is **validated against a simple email
  pattern before being placed in the WIQL string** (defense — it's the one user-influenced value in
  the query; args are already non-shell via `execFile`).
- IPC `ado:list-my-tasks` → `AdoWorkItem[]`. Preload: `listAdoTasks(email?)`.
- UI: a sidebar **icon button** (icon-first, per Paulo's preference) opens an **ADO Tasks modal**
  listing items — ID, title, type, state, story points, and a browser link. A loading spinner
  while the query runs (matches the app's loading-feedback pattern).

### 2. Worktree-task from an ADO item

- Each ADO Tasks row has a **"Create worktree"** action that opens the **existing New Task modal
  prefilled** with the item's title and `adoId`. This reuses the full branch/prefix/worktree flow.
- Small change to `new-task-modal.tsx`: accept optional `initialTitle` / `initialAdoId` props and
  seed the corresponding `useState` from them. Default `''` preserves current behavior.

### 3. Create an ADO work item (gated)

- UI: a **Create ADO Work Item modal** (opened from its own icon button) — a form with: work-item
  **type** (e.g. Task / Bug / User Story), **title**, **description**, optional **parent ID**,
  optional **assignee** (defaults to the logged-in user's email). **Nothing is created until the
  user submits** — the form is the prompt-gate, and Create is disabled until required fields
  (type + title) are filled. A spinner shows while creating.
- `ado-service.createWorkItem(input)` where
  `input = { type, title, description?, parentId?, assignee? }`:
  1. `az boards work-item create --type <type> --title <title> [--assigned-to <assignee>] -o json`
     → capture the new id.
  2. If `parentId` given: copy the parent's `System.AssignedTo`,
     `Microsoft.VSTS.Common.Priority`, `Custom.EffortType`, `System.AreaPath`,
     `System.IterationPath` onto the child, and add the parent link
     (`az boards work-item relation add --id <child> --relation-type parent --target-id <parent>`).
     (Per the `feedback_ado_child_workitems` memory — the child is otherwise created unassigned.)
  3. **Description:** set via `az rest PATCH` with `--body @<tempfile>` (a JSON-patch file written to
     the scratch/temp dir), **not** inline `--fields`/`--description`, because a large HTML body
     exceeds Windows' ~8 KB command-line limit and gets silently dropped. Include
     `--resource 499b84ac-1321-427f-aa17-267ca6975798` and `Content-Type=application/json-patch+json`
     (per the memory — omitting the resource id gives TF400813).
  4. **Verify:** `az boards work-item show --id <id> -o json` (suppress the cp1252 stderr warning),
     confirm `System.AssignedTo` is set (when an assignee was intended) and `System.Description` is
     non-empty (when a description was given). If verification fails, throw `AdoCommandError` with a
     clear message rather than reporting success.
  5. Return `{ id, url }`.
- IPC `ado:create-work-item` → `{ id: number, url: string }`. Preload: `createAdoWorkItem(input)`.
- On success the modal shows the created ID + clickable link.

## Shared types (`src/shared/ipc-channels.ts` / `types.ts`)

```ts
export interface AdoWorkItem {
  id: number;
  title: string;
  type: string;
  state: string;
  areaPath: string;
  storyPoints: number | undefined;
}
export interface AdoCreateWorkItemRequest {
  type: string;
  title: string;
  description?: string;
  parentId?: number;
  assignee?: string;
}
export interface AdoCreateWorkItemResult { id: number; url: string; }
```
New `IpcChannels`: `AdoListMyTasks: 'ado:list-my-tasks'`, `AdoCreateWorkItem: 'ado:create-work-item'`,
`AdoConfig: 'ado:config'`.

## Error handling

Every `az` failure becomes an `AdoCommandError` carrying stderr; handlers reject and the renderer
shows the message in the existing top error banner. Auth/not-installed produce the actionable
"run `/ado-login`" guidance. Creation never reports success it hasn't verified.

## Testing

- **`ado-service.test.ts`:** mock `execFile` (as `git-service.test.ts` does). Cover: list parses
  WIQL JSON into `AdoWorkItem[]`; email validation rejects a bad email; create issues the expected
  `az` argv; parent-field copy fires only when `parentId` is set; large description goes through
  `az rest --body @file` (not inline); the verify step throws when AssignedTo/Description didn't
  land; auth failure produces the actionable error.
- **Renderer:** ADO Tasks modal renders items + link, shows the loading spinner, and "Create
  worktree" forwards title+adoId; New Task modal seeds from `initialTitle`/`initialAdoId`; Create
  ADO Work Item modal disables submit until type+title, forwards the request, shows the result, and
  never calls create on open. Use deferred-promise IPC stubs for the loading assertions.

## Global constraints

- Main owns all `az` access; renderer only via IPC. **Never string-interpolate** user input into an
  `az` invocation — arg arrays only.
- TypeScript strict; no `any`; named exports.
- Creation is **always** behind the confirmation form — no code path creates an ADO item without an
  explicit user submit.
- Follow existing patterns: `git-service.ts` (execFile + typed error), `image-handlers.ts` (IPC
  registration), the modal components, and the app's loading-spinner pattern.

## Implementation phasing

Write one spec, implement as **two plans**, each independently shippable:
- **Plan A — read side:** `ado-service` (auth check, config, list) + IPC/preload + ADO Tasks modal +
  New Task modal prefill (Capabilities 1–2).
- **Plan B — gated create:** `ado-service.createWorkItem` (+ known-gaps handling) + IPC/preload +
  Create ADO Work Item modal (Capability 3).
