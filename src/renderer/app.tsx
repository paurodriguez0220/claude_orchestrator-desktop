import { useEffect, useRef, useState } from 'react';
import { RepoSidebar } from './components/repo-sidebar/repo-sidebar';
import { NewTaskModal } from './components/new-task-modal/new-task-modal';
import { CloneRepoModal } from './components/clone-repo-modal/clone-repo-modal';
import { NewQuestionModal } from './components/new-question-modal/new-question-modal';
import { TerminalTab } from './components/terminal-tab/terminal-tab';
import { TaskNotesPanel } from './components/task-notes-panel/task-notes-panel';
import { TabBar } from './components/tab-bar/tab-bar';
import { Spinner } from './components/spinner/spinner';
import type { RepoRecord, TaskRecord, TaskStatus } from '../shared/types';
import type { BranchOption } from '../shared/ipc-channels';
import type { NewTaskFields } from './components/new-task-modal/new-task-modal';
import type { NewQuestionFields } from './components/new-question-modal/new-question-modal';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [openTaskIds, setOpenTaskIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [notesByTaskId, setNotesByTaskId] = useState<Record<string, { body: string; status: TaskStatus }>>({});
  const [newTaskRepoId, setNewTaskRepoId] = useState<string | undefined>();
  const [newTaskMode, setNewTaskMode] = useState<'task' | 'review'>('task');
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isNewQuestionModalOpen, setIsNewQuestionModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [isSubmittingModal, setIsSubmittingModal] = useState(false);
  const [loadingTaskId, setLoadingTaskId] = useState<string | undefined>();
  const [finishedTaskIds, setFinishedTaskIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [matchingTaskIds, setMatchingTaskIds] = useState<string[] | undefined>();
  // Mirrors newTaskRepoId so handleNewTaskClick's in-flight listBranches
  // callback can check, after the fact, whether its response is still
  // relevant — reading state directly from inside an already-started async
  // function would only ever see the value captured at call time.
  const newTaskRepoIdRef = useRef(newTaskRepoId);

  useEffect(() => {
    void window.claudeOrchestrator.listRepos().then(setRepos);
    void window.claudeOrchestrator.listTasks().then(setTasks);
  }, []);

  useEffect(() => {
    return window.claudeOrchestrator.onTaskFinishedStateChanged(({ taskId, finished }) => {
      setFinishedTaskIds((current) => {
        if (finished) {
          return current.includes(taskId) ? current : [...current, taskId];
        }
        return current.filter((id) => id !== taskId);
      });
    });
  }, []);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed === '') {
      setMatchingTaskIds(undefined);
      return;
    }
    const timeoutId = setTimeout(() => {
      window.claudeOrchestrator
        .taskSearch(searchQuery)
        .then(setMatchingTaskIds)
        .catch((err: unknown) => setErrorMessage(toErrorMessage(err)));
    }, 250);
    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    newTaskRepoIdRef.current = newTaskRepoId;
  }, [newTaskRepoId]);

  async function handleSelectTask(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      if (!openTaskIds.includes(taskId)) {
        setLoadingTaskId(taskId);
        try {
          await window.claudeOrchestrator.openTask(taskId);
          setOpenTaskIds((current) => [...current, taskId]);
          // Only fetch notes the first time a tab is opened — switching back
          // to an already-open tab should be instant and reuse the cache
          // populated here, not re-fetch over IPC.
          const notes = await window.claudeOrchestrator.getTaskNotes(taskId);
          setNotesByTaskId((current) => ({ ...current, [taskId]: notes }));
        } finally {
          setLoadingTaskId(undefined);
        }
      }
      setActiveTaskId(taskId);
      setFinishedTaskIds((current) => current.filter((id) => id !== taskId));
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCloseTab(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      // Block the UI close until the backend confirms the PTY is actually gone.
      // This mirrors the pattern used elsewhere in this file (handleRemoveTask,
      // handleSelectTask): openTaskIds/activeTaskId only advance after the IPC
      // call succeeds. If closeTask rejected and we removed the tab anyway, the
      // tab would look closed while its PTY process kept running in the
      // background with no surviving UI to reach it — an orphaned process the
      // user can no longer see or retry closing. Leaving the tab open on
      // failure (with the error banner shown) keeps that retry path available.
      await window.claudeOrchestrator.closeTask(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
      return;
    }
    const remaining = openTaskIds.filter((id) => id !== taskId);
    setOpenTaskIds(remaining);
    if (activeTaskId === taskId) {
      const fallback = remaining[remaining.length - 1];
      if (fallback !== undefined) {
        await handleSelectTask(fallback);
      } else {
        setActiveTaskId(undefined);
      }
    }
  }

  async function handleNewTaskClick(repoId: string): Promise<void> {
    setErrorMessage(undefined);
    setNewTaskMode('task');
    setNewTaskRepoId(repoId);
    try {
      const options = await window.claudeOrchestrator.listBranches(repoId);
      // Guard against out-of-order responses: if the user closed this modal
      // and opened another repo's before this call resolved, newTaskRepoIdRef
      // will have moved on and this stale list must not be applied.
      if (newTaskRepoIdRef.current === repoId) {
        setBranches(options);
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleReviewCodeClick(repoId: string): Promise<void> {
    setErrorMessage(undefined);
    setNewTaskMode('review');
    setNewTaskRepoId(repoId);
    try {
      await window.claudeOrchestrator.fetchRepo(repoId);
      const options = await window.claudeOrchestrator.listBranches(repoId);
      setBranches(options);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCreateTask(fields: NewTaskFields): Promise<void> {
    if (!newTaskRepoId) {
      return;
    }
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const task = await window.claudeOrchestrator.createTask({
        repoId: newTaskRepoId,
        ...fields,
        kind: newTaskMode === 'review' ? 'review' : undefined,
      });
      setTasks((current) => [...current, task]);
      await handleSelectTask(task.id);
      setNewTaskRepoId(undefined);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleCreateQuestion(fields: NewQuestionFields): Promise<void> {
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const task = await window.claudeOrchestrator.createTask({ title: fields.title, kind: 'scratch' });
      setTasks((current) => [...current, task]);
      await handleSelectTask(task.id);
      setIsNewQuestionModalOpen(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleOpenRepoClick(): Promise<void> {
    setErrorMessage(undefined);
    try {
      const path = await window.claudeOrchestrator.selectFolder();
      if (path === undefined) {
        return;
      }
      const repo = await window.claudeOrchestrator.addRepo(path);
      setRepos((current) => [...current, repo]);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCloneRepo(fields: { url: string; name: string }): Promise<void> {
    setErrorMessage(undefined);
    setIsSubmittingModal(true);
    try {
      const repo = await window.claudeOrchestrator.cloneRepo(fields.url, fields.name);
      setRepos((current) => [...current, repo]);
      setIsCloneModalOpen(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    } finally {
      setIsSubmittingModal(false);
    }
  }

  async function handleRemoveTask(taskId: string): Promise<void> {
    const task = tasks.find((candidate) => candidate.id === taskId);
    const confirmMessage =
      task?.kind === 'scratch'
        ? 'Remove this question? This deletes its scratch folder.'
        : 'Remove this task? This deletes its git worktree.';
    if (!window.confirm(confirmMessage)) {
      return;
    }
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.removeTask(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setOpenTaskIds((current) => current.filter((id) => id !== taskId));
      if (taskId === activeTaskId) {
        setActiveTaskId(undefined);
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  const activeTasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    if (task.repoId !== undefined && task.status !== 'done') {
      (acc[task.repoId] ??= []).push(task);
    }
    return acc;
  }, {});

  const archivedTasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    if (task.repoId !== undefined && task.status === 'done') {
      (acc[task.repoId] ??= []).push(task);
    }
    return acc;
  }, {});
  const scratchTasks = tasks.filter((task) => task.kind === 'scratch');

  const filteredActiveTasksByRepoId =
    matchingTaskIds === undefined
      ? activeTasksByRepoId
      : Object.fromEntries(
          Object.entries(activeTasksByRepoId).map(([repoId, repoTasks]) => [
            repoId,
            repoTasks.filter((task) => matchingTaskIds.includes(task.id)),
          ]),
        );

  return (
    <div className="flex h-screen flex-col bg-graphite-900 text-graphite-100">
      {errorMessage !== undefined && (
        <div
          role="alert"
          className="z-40 flex items-center justify-between bg-danger-500 px-4 py-2 text-sm font-medium text-graphite-100 shadow-lg"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(undefined)}
            className="ml-4 rounded px-2 py-1 text-xs font-semibold hover:bg-graphite-950/20"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <RepoSidebar
          repos={repos}
          activeTasksByRepoId={filteredActiveTasksByRepoId}
          archivedTasksByRepoId={archivedTasksByRepoId}
          scratchTasks={scratchTasks}
          selectedTaskId={activeTaskId}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          onSelectTask={(taskId) => void handleSelectTask(taskId)}
          onOpenRepoClick={() => void handleOpenRepoClick()}
          onCloneRepoClick={() => setIsCloneModalOpen(true)}
          onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
          onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
          onReviewCodeClick={(repoId) => void handleReviewCodeClick(repoId)}
          onNewQuestionClick={() => setIsNewQuestionModalOpen(true)}
        />
        <NewTaskModal
          isOpen={newTaskRepoId !== undefined}
          branches={branches}
          isSubmitting={isSubmittingModal}
          mode={newTaskMode}
          onClose={() => {
            setNewTaskRepoId(undefined);
            setBranches([]);
          }}
          onSubmit={(fields) => void handleCreateTask(fields)}
        />
        <CloneRepoModal
          isOpen={isCloneModalOpen}
          isSubmitting={isSubmittingModal}
          onClose={() => setIsCloneModalOpen(false)}
          onSubmit={(fields) => void handleCloneRepo(fields)}
        />
        <NewQuestionModal
          isOpen={isNewQuestionModalOpen}
          isSubmitting={isSubmittingModal}
          onClose={() => setIsNewQuestionModalOpen(false)}
          onSubmit={(fields) => void handleCreateQuestion(fields)}
        />
        <main className="flex flex-1 flex-col overflow-hidden">
          {openTaskIds.length > 0 && (
            <TabBar
              tabs={openTaskIds.map((id) => ({
                taskId: id,
                title: tasks.find((task) => task.id === id)?.title ?? '',
              }))}
              activeTaskId={activeTaskId}
              finishedTaskIds={finishedTaskIds}
              onSelectTab={(taskId) => void handleSelectTask(taskId)}
              onCloseTab={(taskId) => void handleCloseTab(taskId)}
            />
          )}
          <div className="flex flex-1 overflow-hidden">
            {openTaskIds.length > 0 || loadingTaskId !== undefined ? (
              <>
                <div className="relative flex-1 overflow-hidden">
                  {loadingTaskId !== undefined && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-graphite-900/80 text-sm text-graphite-100">
                      <Spinner />
                      <span>Starting session…</span>
                    </div>
                  )}
                  {openTaskIds.map((id) => (
                    <div key={id} className={id === activeTaskId ? 'h-full w-full' : 'hidden'}>
                      <TerminalTab taskId={id} />
                    </div>
                  ))}
                </div>
                {activeTaskId !== undefined && (
                  <div className="w-80 shrink-0 overflow-y-auto border-l border-graphite-700 bg-graphite-800">
                    <TaskNotesPanel
                      key={activeTaskId}
                      body={notesByTaskId[activeTaskId]?.body ?? ''}
                      status={notesByTaskId[activeTaskId]?.status ?? 'todo'}
                      onSave={async (newBody) => {
                        await window.claudeOrchestrator.setTaskNotes({ taskId: activeTaskId, body: newBody });
                        setNotesByTaskId((current) => ({
                          ...current,
                          [activeTaskId]: { body: newBody, status: current[activeTaskId]?.status ?? 'todo' },
                        }));
                      }}
                    />
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-graphite-400">
                Select or create a task to get started.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
