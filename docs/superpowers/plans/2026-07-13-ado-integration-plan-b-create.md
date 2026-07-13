# ADO Integration — Plan B (gated create) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an Azure DevOps work item from the app via a confirmation form — never automatically. Handles the known `az` gaps (unassigned child, >8 KB description truncation) and verifies the result.

**Architecture:** Extends the main-process `ado-service.ts` (from Plan A) with `createWorkItem`, shelling `az boards work-item create`, copying parent fields, patching the description via `az rest` with a body file, and verifying via `az boards work-item show`. New IPC + preload method. Renderer adds a Create ADO Work Item modal (a form that only creates on submit).

**Tech Stack:** Electron main (Node), React + TypeScript (strict), Vitest + Testing Library, `az` CLI.

**Depends on:** Plan A merged (uses `ado-service.ts`, `AdoCommandError`, `runAz`, `assertAdoAuthenticated`, `getAdoConfig`, and the ADO IPC/preload wiring).

## Global Constraints

- Main owns all `az` access; renderer only via IPC. NEVER string-interpolate user input into an `az` invocation — arg arrays only.
- **Creation is always behind the confirmation form. No code path creates an ADO item without an explicit user submit.**
- Large descriptions MUST be set via `az rest PATCH --body @<tempfile>` (JSON-patch), NOT inline — Windows' ~8 KB command-line limit silently drops big inline bodies.
- After creation, VERIFY (assignee set when intended, description non-empty when given) before reporting success.
- TypeScript strict; no `any`; named exports. Temp files go under the OS temp dir; delete after use.

---

### Task B1: `ado-service.createWorkItem`

**Files:**
- Modify: `src/main/services/ado-service.ts`
- Modify: `src/shared/ipc-channels.ts` (add request/result types)
- Test: `src/main/services/ado-service.test.ts` (add cases)

**Interfaces:**
- Consumes: `runAz`, `AdoCommandError`, `getAdoConfig` (Plan A).
- Produces (in `ipc-channels.ts`):
  ```ts
  export interface AdoCreateWorkItemRequest { type: string; title: string; description?: string; parentId?: number; assignee?: string; }
  export interface AdoCreateWorkItemResult { id: number; url: string; }
  ```
  and `createWorkItem(request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult>`.

- [ ] **Step 1: Add the types** to `src/shared/ipc-channels.ts` (the two interfaces above).

- [ ] **Step 2: Write failing tests** in `ado-service.test.ts` (extend the mocked-`execFile` setup). Drive `execFile` by matching on the args and returning canned stdout. Cases:
  - **Basic create:** `createWorkItem({ type: 'Task', title: 'T' })` calls `az` with args starting `['boards','work-item','create','--type','Task','--title','T', ...,'-o','json']`, parses `{ id: 501, ... }` from stdout, and returns `{ id: 501, url: 'https://dev.azure.com/<org>/<project>/_workitems/edit/501' }` (org/project from a mocked `getAdoConfig` — or from `az devops configure --list` stdout you stub).
  - **Description via `az rest`:** when `description` is provided, an `az rest` call is made with `--method PATCH`, a `--body @<file>` argument (arg starts with `@`), and `--resource 499b84ac-1321-427f-aa17-267ca6975798`; assert the patch file written to disk contains the description in a JSON-patch `add /fields/System.Description`. (Mock `fs` writeFile or assert via a temp path you can read.) Assert the description is NOT passed inline via `--fields`/`--description` on the create call.
  - **Parent field copy:** when `parentId` is set, the service first reads the parent (`az boards work-item show --id <parent>`), then sets `System.AssignedTo`, `Microsoft.VSTS.Common.Priority`, `Custom.EffortType`, `System.AreaPath`, `System.IterationPath` on the child, and adds a parent relation (`az boards work-item relation add ... --relation-type parent --target-id <parent>`).
  - **Verify failure:** if the post-create `az boards work-item show` of the child reports an empty `System.Description` while a description was requested (or missing `System.AssignedTo` while an assignee was intended), `createWorkItem` rejects with `AdoCommandError` mentioning verification.
  - **Explicit assignee** is passed via `--assigned-to <assignee>` on create (or patched) — assert present.

- [ ] **Step 3: Run tests, confirm fail.** `npm run test:main -- ado-service` → FAIL.

- [ ] **Step 4: Implement `createWorkItem`** in `ado-service.ts`:
  ```ts
  import { writeFile, rm } from 'node:fs/promises';
  import { join } from 'node:path';
  import { tmpdir } from 'node:os';
  import { randomUUID } from 'node:crypto';
  import type { AdoCreateWorkItemRequest, AdoCreateWorkItemResult } from '../../shared/ipc-channels';

  const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'; // Azure DevOps app id (required for az rest)
  const PARENT_COPY_FIELDS = [
    'System.AssignedTo', 'Microsoft.VSTS.Common.Priority', 'Custom.EffortType',
    'System.AreaPath', 'System.IterationPath',
  ] as const;

  async function showWorkItem(id: number): Promise<{ fields: Record<string, unknown> }> {
    const out = await runAz(['boards', 'work-item', 'show', '--id', String(id), '-o', 'json']);
    return JSON.parse(out) as { fields: Record<string, unknown> };
  }

  export async function createWorkItem(request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult> {
    const createArgs = ['boards', 'work-item', 'create', '--type', request.type, '--title', request.title, '-o', 'json'];
    if (request.assignee) { createArgs.push('--assigned-to', request.assignee); }
    const created = JSON.parse(await runAz(createArgs)) as { id: number };
    const id = created.id;

    if (request.parentId !== undefined) {
      const parent = await showWorkItem(request.parentId);
      for (const field of PARENT_COPY_FIELDS) {
        const value = parent.fields[field];
        if (value !== undefined && value !== null && String(value) !== '') {
          const v = typeof value === 'object' && value !== null && 'uniqueName' in (value as Record<string, unknown>)
            ? String((value as { uniqueName: unknown }).uniqueName)
            : String(value);
          await runAz(['boards', 'work-item', 'update', '--id', String(id), '--fields', `${field}=${v}`]);
        }
      }
      await runAz(['boards', 'work-item', 'relation', 'add', '--id', String(id), '--relation-type', 'parent', '--target-id', String(request.parentId)]);
    }

    if (request.description) {
      const patch = [{ op: 'add', path: '/fields/System.Description', value: request.description }];
      const org = (await getAdoConfig()).organization;
      const bodyFile = join(tmpdir(), `ado-patch-${randomUUID()}.json`);
      await writeFile(bodyFile, JSON.stringify(patch), 'utf8');
      try {
        await runAz([
          'rest', '--method', 'PATCH',
          '--uri', `https://dev.azure.com/${org}/_apis/wit/workitems/${id}?api-version=7.1`,
          '--resource', ADO_RESOURCE,
          '--headers', 'Content-Type=application/json-patch+json',
          '--body', `@${bodyFile}`,
        ]);
      } finally {
        await rm(bodyFile, { force: true });
      }
    }

    // Verify
    const check = await showWorkItem(id);
    if (request.description && String(check.fields['System.Description'] ?? '') === '') {
      throw new AdoCommandError(`Work item ${id} created but description did not persist — verify in ADO.`, '');
    }
    if (request.assignee && !check.fields['System.AssignedTo']) {
      throw new AdoCommandError(`Work item ${id} created but assignee did not persist — verify in ADO.`, '');
    }

    const { organization, project } = await getAdoConfig();
    return { id, url: `https://dev.azure.com/${organization}/${project}/_workitems/edit/${id}` };
  }
  ```
  (If `getAdoConfig` calls make the tests awkward, cache the config once at the top of `createWorkItem`; keep behavior identical.)

- [ ] **Step 5: Run tests, confirm pass + typecheck.** `npm run test:main -- ado-service && npm run typecheck`.

- [ ] **Step 6: Commit.** `git commit -am "feat(ado): createWorkItem with parent-field copy, az rest description, verify"`

---

### Task B2: IPC + preload for create

**Files:**
- Modify: `src/shared/ipc-channels.ts` (channel key)
- Modify: `src/main/ipc/ado-handlers.ts`
- Modify: `src/preload/index.ts`
- Test: `src/main/ipc/ado-handlers.test.ts`, `src/preload/index.test.ts` (add cases)

**Interfaces:**
- Consumes: `createWorkItem`, `AdoCreateWorkItemRequest`, `AdoCreateWorkItemResult` (Task B1).
- Produces: preload `createAdoWorkItem(request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult>`.

- [ ] **Step 1: Write failing tests.** `ado-handlers.test.ts`: the `AdoCreateWorkItem` handler calls `assertAdoAuthenticated` then `createWorkItem(request)` and returns its result. `preload/index.test.ts`: `createAdoWorkItem(req)` invokes channel `'ado:create-work-item'` with `req`.

- [ ] **Step 2: Run, confirm fail.**

- [ ] **Step 3: Add channel key** `AdoCreateWorkItem: 'ado:create-work-item'` to `IpcChannels`.

- [ ] **Step 4: Add handler** in `ado-handlers.ts`:
  ```ts
  ipcMain.handle(IpcChannels.AdoCreateWorkItem, async (_event, request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult> => {
    await assertAdoAuthenticated();
    return createWorkItem(request);
  });
  ```
  (import `createWorkItem`, `AdoCreateWorkItemRequest`, `AdoCreateWorkItemResult`.)

- [ ] **Step 5: Extend preload.** Interface: `createAdoWorkItem(request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult>;`. Impl: `createAdoWorkItem: (request) => ipcRenderer.invoke(IpcChannels.AdoCreateWorkItem, request),`. Import the two types.

- [ ] **Step 6: Run tests + typecheck, confirm pass.**

- [ ] **Step 7: Commit.** `git commit -am "feat(ado): IPC + preload for creating a work item"`

---

### Task B3: Create ADO Work Item modal + app wiring

**Files:**
- Create: `src/renderer/components/create-ado-work-item-modal/create-ado-work-item-modal.tsx`
- Test: `src/renderer/components/create-ado-work-item-modal/create-ado-work-item-modal.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx` (add a "New ADO item" icon button)
- Modify: `src/renderer/app.tsx` (state, submit handler, wire modal)
- Test: add cases to `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.createAdoWorkItem` (Task B2); `AdoCreateWorkItemRequest`, `AdoCreateWorkItemResult`.
- Produces: `CreateAdoWorkItemModalProps { isOpen: boolean; isSubmitting: boolean; result: AdoCreateWorkItemResult | undefined; onSubmit: (req: AdoCreateWorkItemRequest) => void; onClose: () => void }`.

- [ ] **Step 1: Write failing test.** In the modal test: renders a work-item type input/select, title, description, optional parent id, optional assignee; the Create button is DISABLED until both type and title are non-empty; clicking Create calls `onSubmit` with the trimmed field values (`parentId` parsed to a number or omitted; empty description/assignee omitted); while `isSubmitting` a spinner shows and Create is disabled; when `result` is set, the created id and a link (`result.url`) are shown; on open (`isOpen` true, no interaction) `onSubmit` is NOT called. Follow `new-task-modal.test.tsx`/`clone-repo-modal.test.tsx` patterns, wrapped in `ModalOverlay` (no self width).

- [ ] **Step 2: Run test, confirm fail.** `npm run test:renderer -- create-ado-work-item-modal` → FAIL.

- [ ] **Step 3: Implement the modal.** `ModalOverlay` + `<h2>New ADO work item</h2>`; controlled inputs for type (default `'Task'`), title, description (textarea), parentId (text, numeric), assignee (text). `const canSubmit = type.trim() !== '' && title.trim() !== '';` Create button `disabled={isSubmitting || !canSubmit}`, shows `Spinner` + "Creating…" when submitting (mirror `new-task-modal.tsx`). `onSubmit` builds:
  ```ts
  onSubmit({
    type: type.trim(),
    title: title.trim(),
    description: description.trim() || undefined,
    parentId: parentId.trim() ? Number(parentId.trim()) : undefined,
    assignee: assignee.trim() || undefined,
  });
  ```
  When `result` is present, render a success line: `Created #{result.id}` with an anchor to `result.url`. Cancel button calls `onClose`.

- [ ] **Step 4: Run test, confirm pass.**

- [ ] **Step 5: Sidebar button.** In `repo-sidebar.tsx` add `onNewAdoItemClick: () => void;` to props and an icon button (lucide, e.g. `FilePlus2`, `aria-label="New ADO item"`, `title="New ADO item"`) in the top button row.

- [ ] **Step 6: Wire `app.tsx`.** State:
  ```ts
  const [isCreateAdoOpen, setIsCreateAdoOpen] = useState(false);
  const [adoCreateResult, setAdoCreateResult] = useState<AdoCreateWorkItemResult | undefined>();
  ```
  (`isSubmittingModal` is already present — reuse it.) Handler:
  ```ts
  async function handleCreateAdoWorkItem(request: AdoCreateWorkItemRequest): Promise<void> {
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const result = await window.claudeOrchestrator.createAdoWorkItem(request);
      setAdoCreateResult(result);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }
  ```
  Pass `onNewAdoItemClick={() => { setAdoCreateResult(undefined); setIsCreateAdoOpen(true); }}` to `RepoSidebar`. Render:
  ```tsx
  <CreateAdoWorkItemModal
    isOpen={isCreateAdoOpen}
    isSubmitting={isSubmittingModal}
    result={adoCreateResult}
    onSubmit={(req) => void handleCreateAdoWorkItem(req)}
    onClose={() => setIsCreateAdoOpen(false)}
  />
  ```

- [ ] **Step 7: App tests.** In `app.test.tsx` (mock `createAdoWorkItem`): clicking "New ADO item" opens the modal; submitting forwards the request and, on resolve, shows the created id/link; a deferred promise shows the submitting spinner. Assert `createAdoWorkItem` is not called on mere open.

- [ ] **Step 8: Run full suite + typecheck, confirm pass.** `npm run typecheck && npm test`.

- [ ] **Step 9: Commit.** `git commit -am "feat(ado): create ADO work item modal (gated) + sidebar entry"`

---

## Self-review notes
- Covers spec Capability 3 with the gating rule (form-only creation, disabled until type+title, never on open) and all known-gaps handling (parent-field copy, `az rest` description via body file + resource id, post-create verification).
- `az rest` description path always used when a description is given (uniform, avoids the 8 KB trap), per the spec decision.
