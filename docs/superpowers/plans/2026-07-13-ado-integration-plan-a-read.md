# ADO Integration — Plan A (read side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** View my Azure DevOps work items inside the app and spin up a worktree-task from one (prefilled title + ADO ID). Read-only against ADO.

**Architecture:** A new main-process `ado-service.ts` shells to the `az` CLI (mirrors `git-service.ts`: `execFileAsync` + typed error, arg-arrays only). New IPC channels expose auth check, config, and the my-tasks query through the preload facade. The renderer adds an ADO Tasks modal (opened from a sidebar icon button) and reuses the existing New Task modal, prefilled, for "create worktree from item".

**Tech Stack:** Electron main (Node), React + TypeScript (strict), Vitest + Testing Library, `az` CLI (azure-devops extension).

## Global Constraints

- Main owns all `az` access; renderer only via IPC.
- NEVER string-interpolate user input into an `az` invocation — pass every argument as an array element (repo rule).
- TypeScript strict; no `any`; named exports only.
- Follow existing patterns: `src/main/services/git-service.ts` (execFile + typed error), `src/main/ipc/image-handlers.ts` (IPC registration), `src/preload/index.ts` facade, existing modal components, and the app's loading-spinner pattern.
- Default ADO email: `paulo.rodriguez@fefundinfo.com` (validate against an email regex before placing in WIQL).

---

### Task A1: `ado-service` — auth check, config, list my tasks

**Files:**
- Create: `src/main/services/ado-service.ts`
- Test: `src/main/services/ado-service.test.ts`
- Modify: `src/shared/ipc-channels.ts` (add `AdoWorkItem` interface)

**Interfaces:**
- Produces:
  - `AdoWorkItem { id: number; title: string; type: string; state: string; areaPath: string; storyPoints: number | undefined }` (in `ipc-channels.ts`)
  - `class AdoCommandError extends Error { stderr: string }`
  - `assertAdoAuthenticated(): Promise<void>` — rejects with `AdoCommandError` if `az` missing/not logged in
  - `getAdoConfig(): Promise<{ organization: string; project: string }>`
  - `listMyAssignedTasks(email?: string): Promise<AdoWorkItem[]>` (default email `paulo.rodriguez@fefundinfo.com`)

- [ ] **Step 1: Write failing tests** in `src/main/services/ado-service.test.ts`. Mock `node:child_process` `execFile` the way `git-service.test.ts` does (promisified). Cases:
  - `listMyAssignedTasks` maps `az boards query` JSON into `AdoWorkItem[]`. Stub the resolved stdout to a realistic payload, e.g.:
    ```ts
    const wiqlJson = JSON.stringify([
      { id: 101, fields: { 'System.Title': 'Fix login', 'System.WorkItemType': 'Bug', 'System.State': 'Active', 'System.AreaPath': 'Proj\\Team', 'Microsoft.VSTS.Scheduling.StoryPoints': 3 } },
    ]);
    ```
    Assert result `[{ id: 101, title: 'Fix login', type: 'Bug', state: 'Active', areaPath: 'Proj\\Team', storyPoints: 3 }]`, and that `execFile` was called with `'az'` and an args array whose first elements are `['boards','query','--wiql', <string>, '-o','json']`.
  - `listMyAssignedTasks('bad email!')` rejects with an `AdoCommandError`-style error mentioning invalid email, WITHOUT calling `execFile`.
  - A missing `storyPoints` field yields `storyPoints: undefined`.
  - `assertAdoAuthenticated` rejects (AdoCommandError, message mentions `/ado-login`) when `execFile` rejects (simulating `az devops project list` failure).

- [ ] **Step 2: Run tests, confirm they fail.** `npm run test:main -- ado-service` → FAIL (module missing).

- [ ] **Step 3: Add the `AdoWorkItem` type** to `src/shared/ipc-channels.ts`:
  ```ts
  export interface AdoWorkItem {
    id: number;
    title: string;
    type: string;
    state: string;
    areaPath: string;
    storyPoints: number | undefined;
  }
  ```

- [ ] **Step 4: Implement `src/main/services/ado-service.ts`.** Mirror `git-service.ts`:
  ```ts
  import { execFile } from 'node:child_process';
  import { promisify } from 'node:util';
  import type { AdoWorkItem } from '../../shared/ipc-channels';

  const execFileAsync = promisify(execFile);
  const DEFAULT_ADO_EMAIL = 'paulo.rodriguez@fefundinfo.com';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  export class AdoCommandError extends Error {
    public readonly stderr: string;
    constructor(message: string, stderr: string) {
      super(message);
      this.name = 'AdoCommandError';
      this.stderr = stderr;
    }
  }

  async function runAz(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFileAsync('az', args);
      return stdout;
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err);
      throw new AdoCommandError(`az ${args.join(' ')} failed`, stderr);
    }
  }

  export async function assertAdoAuthenticated(): Promise<void> {
    try {
      await execFileAsync('az', ['devops', 'project', 'list', '--query', 'value[0].name', '-o', 'tsv']);
    } catch (err) {
      const stderr = (err as { stderr?: string }).stderr ?? String(err);
      throw new AdoCommandError('Azure DevOps not authenticated — run /ado-login to sign in.', stderr);
    }
  }

  export async function getAdoConfig(): Promise<{ organization: string; project: string }> {
    const out = await runAz(['devops', 'configure', '--list']);
    const org = /^organization\s*=\s*(.+)$/m.exec(out)?.[1]?.trim() ?? '';
    const project = /^project\s*=\s*(.+)$/m.exec(out)?.[1]?.trim() ?? '';
    return { organization: org, project };
  }

  export async function listMyAssignedTasks(email: string = DEFAULT_ADO_EMAIL): Promise<AdoWorkItem[]> {
    if (!EMAIL_RE.test(email)) {
      throw new AdoCommandError(`Invalid ADO email: ${email}`, '');
    }
    const wiql =
      `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AreaPath], ` +
      `[Microsoft.VSTS.Scheduling.StoryPoints] FROM WorkItems WHERE [System.AssignedTo] = '${email}' ` +
      `AND [System.State] NOT IN ('Closed', 'Resolved', 'Done', 'Removed') ORDER BY [System.ChangedDate] DESC`;
    const stdout = await runAz(['boards', 'query', '--wiql', wiql, '-o', 'json']);
    const rows = JSON.parse(stdout) as Array<{ id: number; fields: Record<string, unknown> }>;
    return rows.map((r) => ({
      id: r.id,
      title: String(r.fields['System.Title'] ?? ''),
      type: String(r.fields['System.WorkItemType'] ?? ''),
      state: String(r.fields['System.State'] ?? ''),
      areaPath: String(r.fields['System.AreaPath'] ?? ''),
      storyPoints:
        typeof r.fields['Microsoft.VSTS.Scheduling.StoryPoints'] === 'number'
          ? (r.fields['Microsoft.VSTS.Scheduling.StoryPoints'] as number)
          : undefined,
    }));
  }
  ```

- [ ] **Step 5: Run tests, confirm pass.** `npm run test:main -- ado-service` → PASS. Then `npm run typecheck`.

- [ ] **Step 6: Commit.**
  ```
  git add src/main/services/ado-service.ts src/main/services/ado-service.test.ts src/shared/ipc-channels.ts
  git commit -m "feat(ado): add ado-service (auth check, config, list my tasks)"
  ```

---

### Task A2: IPC channels + handlers + preload for ADO reads

**Files:**
- Modify: `src/shared/ipc-channels.ts` (add channel keys)
- Create: `src/main/ipc/ado-handlers.ts`
- Modify: `src/main/index.ts` (register handlers)
- Modify: `src/preload/index.ts` (facade type + impl)
- Test: `src/main/ipc/ado-handlers.test.ts`, and add cases to `src/preload/index.test.ts`

**Interfaces:**
- Consumes: `assertAdoAuthenticated`, `getAdoConfig`, `listMyAssignedTasks`, `AdoWorkItem` (Task A1).
- Produces: preload API `listAdoTasks(email?: string): Promise<AdoWorkItem[]>`, `getAdoConfig(): Promise<{ organization: string; project: string }>`.

- [ ] **Step 1: Write failing tests.** In `src/main/ipc/ado-handlers.test.ts`, follow `image-handlers.test.ts` style (capture handlers registered on a mocked `ipcMain`, mock the `ado-service` module). Assert the `AdoListMyTasks` handler calls `assertAdoAuthenticated` then `listMyAssignedTasks` and returns its value; the `AdoConfig` handler returns `getAdoConfig()`'s value. In `src/preload/index.test.ts`, add cases asserting `listAdoTasks('x@y.z')` invokes channel `'ado:list-my-tasks'` with `'x@y.z'`, and `getAdoConfig()` invokes `'ado:config'`.

- [ ] **Step 2: Run tests, confirm fail.** `npm run test:main -- ado-handlers` and `npm run test:main -- preload` → FAIL.

- [ ] **Step 3: Add channel keys** to `IpcChannels` in `src/shared/ipc-channels.ts`:
  ```ts
  AdoListMyTasks: 'ado:list-my-tasks',
  AdoConfig: 'ado:config',
  ```

- [ ] **Step 4: Create `src/main/ipc/ado-handlers.ts`:**
  ```ts
  import { ipcMain } from 'electron';
  import { IpcChannels } from '../../shared/ipc-channels';
  import type { AdoWorkItem } from '../../shared/ipc-channels';
  import { assertAdoAuthenticated, getAdoConfig, listMyAssignedTasks } from '../services/ado-service';

  export function registerAdoHandlers(): void {
    ipcMain.handle(IpcChannels.AdoListMyTasks, async (_event, email?: string): Promise<AdoWorkItem[]> => {
      await assertAdoAuthenticated();
      return listMyAssignedTasks(email);
    });
    ipcMain.handle(IpcChannels.AdoConfig, async (): Promise<{ organization: string; project: string }> => {
      return getAdoConfig();
    });
  }
  ```

- [ ] **Step 5: Register in `src/main/index.ts`.** Add `import { registerAdoHandlers } from './ipc/ado-handlers';` and call `registerAdoHandlers();` alongside the existing `registerImageHandlers();` call.

- [ ] **Step 6: Extend the preload facade** in `src/preload/index.ts`. Add to the `ClaudeOrchestratorApi` interface:
  ```ts
  listAdoTasks(email?: string): Promise<AdoWorkItem[]>;
  getAdoConfig(): Promise<{ organization: string; project: string }>;
  ```
  Import `AdoWorkItem` from `../shared/ipc-channels`. Add to the `api` object:
  ```ts
  listAdoTasks: (email) => ipcRenderer.invoke(IpcChannels.AdoListMyTasks, email),
  getAdoConfig: () => ipcRenderer.invoke(IpcChannels.AdoConfig),
  ```

- [ ] **Step 7: Run tests + typecheck, confirm pass.** `npm run test:main -- ado-handlers`, `npm run test:main -- preload`, `npm run typecheck`.

- [ ] **Step 8: Commit.**
  ```
  git commit -am "feat(ado): IPC + preload for listing ADO tasks and config"
  ```

---

### Task A3: New Task modal accepts prefilled title + ADO ID

**Files:**
- Modify: `src/renderer/components/new-task-modal/new-task-modal.tsx`
- Test: `src/renderer/components/new-task-modal/new-task-modal.test.tsx`

**Interfaces:**
- Produces: `NewTaskModalProps` gains optional `initialTitle?: string` and `initialAdoId?: string`; the Title and ADO ID inputs seed from them (default `''`, preserving current behavior).

- [ ] **Step 1: Write failing test.** In `new-task-modal.test.tsx`, render with `initialTitle="Fix login"` and `initialAdoId="12345"` and assert the Title input value is `Fix login` and the ADO Task ID input value is `12345`. Also assert existing default behavior (no props → empty) still holds.

- [ ] **Step 2: Run test, confirm fail.** `npm run test:renderer -- new-task-modal` → FAIL.

- [ ] **Step 3: Implement.** Add `initialTitle?: string; initialAdoId?: string;` to `NewTaskModalProps`. Seed the state:
  ```ts
  const [title, setTitle] = useState(initialTitle ?? '');
  const [adoId, setAdoId] = useState(initialAdoId ?? '');
  ```
  (The modal stays mounted only while open — `isOpen` is driven by the parent. Because the component is freshly rendered when the parent opens it via a keyed/remounted path, initial state is sufficient; do NOT add effects that overwrite user typing.)

- [ ] **Step 4: Run test, confirm pass + full renderer suite.** `npm run test:renderer -- new-task-modal`.

- [ ] **Step 5: Commit.** `git commit -am "feat(new-task-modal): accept initial title + ADO id for prefill"`

---

### Task A4: ADO Tasks modal + app wiring (sidebar button, load, create-worktree)

**Files:**
- Create: `src/renderer/components/ado-tasks-modal/ado-tasks-modal.tsx`
- Test: `src/renderer/components/ado-tasks-modal/ado-tasks-modal.test.tsx`
- Modify: `src/renderer/components/repo-sidebar/repo-sidebar.tsx` (add an ADO icon button to the top button row)
- Modify: `src/renderer/app.tsx` (state, load handler, wire modal, create-worktree prefill)
- Test: add cases to `src/renderer/app.test.tsx`

**Interfaces:**
- Consumes: `window.claudeOrchestrator.listAdoTasks`, `.getAdoConfig` (Task A2); `AdoWorkItem`; `NewTaskModal` `initialTitle`/`initialAdoId` (Task A3).
- Produces: `AdoTasksModalProps { isOpen: boolean; tasks: AdoWorkItem[]; isLoading: boolean; orgUrlBase: string; onCreateWorktree: (item: AdoWorkItem) => void; onClose: () => void }`.

- [ ] **Step 1: Write failing test** for `AdoTasksModal` in `ado-tasks-modal.test.tsx`: given `tasks` renders each item's title, state, type and a link containing the id; `isLoading` shows the `Spinner` (role `status`); clicking a row's "Create worktree" button calls `onCreateWorktree` with that item. Follow `archived-tasks-modal.test.tsx` patterns; wrap in `ModalOverlay` like other modals (do NOT set a self width — overlay handles it, per the archived-modal fix).

- [ ] **Step 2: Run test, confirm fail.** `npm run test:renderer -- ado-tasks-modal` → FAIL.

- [ ] **Step 3: Implement `AdoTasksModal`.** Use `ModalOverlay`, an `<h2>Azure DevOps tasks</h2>`, a `Spinner` when `isLoading`, else a list: each item shows title, a small `type · state · SP` line, an "Open in ADO" link (`${orgUrlBase}/_workitems/edit/${item.id}`), and a "Create worktree" button (lucide icon, e.g. `GitBranchPlus`, `aria-label="Create worktree"`) calling `onCreateWorktree(item)`. Empty state: "No active ADO tasks." Match the graphite/clay classes used in `archived-tasks-modal.tsx`.

- [ ] **Step 4: Run test, confirm pass.** `npm run test:renderer -- ado-tasks-modal`.

- [ ] **Step 5: Add the sidebar button.** In `repo-sidebar.tsx`, add `onOpenAdoClick: () => void;` to `RepoSidebarProps` and a new icon button in the top button row (the row with FolderOpen/Download/CalendarClock/ArchiveRestore) — use a lucide icon (e.g. `ListChecks`), `aria-label="ADO tasks"`, `title="ADO tasks"`, same classes as its neighbours, `onClick={onOpenAdoClick}`.

- [ ] **Step 6: Wire `app.tsx`.** Add state:
  ```ts
  const [isAdoModalOpen, setIsAdoModalOpen] = useState(false);
  const [adoTasks, setAdoTasks] = useState<AdoWorkItem[]>([]);
  const [isLoadingAdo, setIsLoadingAdo] = useState(false);
  const [adoOrgUrlBase, setAdoOrgUrlBase] = useState('');
  const [prefillTask, setPrefillTask] = useState<{ title: string; adoId: string } | undefined>();
  ```
  Add a handler that opens the modal and loads tasks (set before await, clear in finally):
  ```ts
  async function handleOpenAdo(): Promise<void> {
    setErrorMessage(undefined);
    setIsAdoModalOpen(true);
    setIsLoadingAdo(true);
    try {
      const [tasks, config] = await Promise.all([
        window.claudeOrchestrator.listAdoTasks(),
        window.claudeOrchestrator.getAdoConfig(),
      ]);
      setAdoTasks(tasks);
      setAdoOrgUrlBase(`https://dev.azure.com/${config.organization}/${config.project}`);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsLoadingAdo(false);
    }
  }
  ```
  Pass `onOpenAdoClick={() => void handleOpenAdo()}` to `RepoSidebar`. Render `<AdoTasksModal isOpen={isAdoModalOpen} tasks={adoTasks} isLoading={isLoadingAdo} orgUrlBase={adoOrgUrlBase} onClose={() => setIsAdoModalOpen(false)} onCreateWorktree={(item) => { setPrefillTask({ title: item.title, adoId: String(item.id) }); setIsAdoModalOpen(false); setNewTaskMode('task'); /* open New Task for the first repo, or require repo choice */ }} />`.
  For repo selection when creating from ADO: open the New Task modal with the prefill; if there are multiple repos, the existing New Task flow already requires a repo via `newTaskRepoId`. Set `newTaskRepoId` to the currently-relevant repo. **Decision:** if exactly one repo exists, use it; otherwise leave `newTaskRepoId` unset is not allowed (modal keys off it). So: set `setNewTaskRepoId(repos[0]?.id)` when opening prefilled, and note in the modal that the repo can be changed — BUT the current modal has no repo picker. To keep V1 simple and correct: only enable "Create worktree" prefill when there is at least one repo, and use `repos[0]`. Record this limitation with a `log`/comment; a repo picker is a follow-up.
  Pass `initialTitle={prefillTask?.title}` and `initialAdoId={prefillTask?.adoId}` to the existing `<NewTaskModal>`, and add `key={prefillTask ? \`${prefillTask.title}-${prefillTask.adoId}\` : 'blank'}` so it remounts with fresh initial state. Clear `prefillTask` in the New Task modal's `onClose`.

- [ ] **Step 7: Add app tests.** In `app.test.tsx` (mock `claudeOrchestrator.listAdoTasks`/`getAdoConfig`), assert: clicking the ADO sidebar button opens the modal and shows loaded tasks; the loading spinner shows while a deferred `listAdoTasks` is pending; "Create worktree" opens the New Task modal with the title prefilled. Use the deferred-promise pattern already in the file.

- [ ] **Step 8: Run full suite + typecheck, confirm pass.** `npm run typecheck && npm test`.

- [ ] **Step 9: Commit.** `git commit -am "feat(ado): ADO tasks modal + sidebar entry + create-worktree-from-item"`

---

## Self-review notes
- Covers spec Capabilities 1 (view) and 2 (worktree-from-item), the auth/error path, the loading spinner, and the "not a git app" boundary (this is task/ADO management, launcher-style).
- The one simplification recorded: creating a worktree from an ADO item uses `repos[0]` when multiple repos exist (no repo picker in V1) — flagged for a follow-up, not silently dropped.
