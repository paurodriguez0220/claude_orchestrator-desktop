import { useEffect, useState } from 'react';
import { RepoSidebar } from './components/repo-sidebar/repo-sidebar';
import { NewTaskModal } from './components/new-task-modal/new-task-modal';
import { CloneRepoModal } from './components/clone-repo-modal/clone-repo-modal';
import { TerminalTab } from './components/terminal-tab/terminal-tab';
import { TaskNotesPanel } from './components/task-notes-panel/task-notes-panel';
import { TabBar } from './components/tab-bar/tab-bar';
import type { RepoRecord, TaskRecord, TaskStatus } from '../shared/types';
import type { BranchOption } from '../shared/ipc-channels';
import type { NewTaskFields } from './components/new-task-modal/new-task-modal';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [openTaskIds, setOpenTaskIds] = useState<string[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | undefined>();
  const [notesBody, setNotesBody] = useState('');
  const [notesStatus, setNotesStatus] = useState<TaskStatus>('todo');
  const [newTaskRepoId, setNewTaskRepoId] = useState<string | undefined>();
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    void window.claudeOrchestrator.listRepos().then(setRepos);
    void window.claudeOrchestrator.listTasks().then(setTasks);
  }, []);

  async function handleSelectTask(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      if (!openTaskIds.includes(taskId)) {
        await window.claudeOrchestrator.openTask(taskId);
        setOpenTaskIds((current) => [...current, taskId]);
      }
      const notes = await window.claudeOrchestrator.getTaskNotes(taskId);
      // Set the task's data together with the selection so TaskNotesPanel
      // never mounts with a stale/empty body for the newly selected task —
      // it only initializes its local draft state from `body` on mount.
      setNotesBody(notes.body);
      setNotesStatus(notes.status);
      setActiveTaskId(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCloseTab(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.closeTask(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
    const remaining = openTaskIds.filter((id) => id !== taskId);
    setOpenTaskIds(remaining);
    if (activeTaskId === taskId) {
      const fallback = remaining[remaining.length - 1];
      if (fallback !== undefined) {
        await handleSelectTask(fallback);
      } else {
        setActiveTaskId(undefined);
        setNotesBody('');
        setNotesStatus('todo');
      }
    }
  }

  async function handleNewTaskClick(repoId: string): Promise<void> {
    setErrorMessage(undefined);
    setNewTaskRepoId(repoId);
    try {
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
    try {
      const task = await window.claudeOrchestrator.createTask({ repoId: newTaskRepoId, ...fields });
      setTasks((current) => [...current, task]);
      setNewTaskRepoId(undefined);
      await handleSelectTask(task.id);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
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
    try {
      const repo = await window.claudeOrchestrator.cloneRepo(fields.url, fields.name);
      setRepos((current) => [...current, repo]);
      setIsCloneModalOpen(false);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleRemoveTask(taskId: string): Promise<void> {
    if (!window.confirm('Remove this task? This deletes its git worktree.')) {
      return;
    }
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.removeTask(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
      setOpenTaskIds((current) => current.filter((id) => id !== taskId));
      if (taskId === activeTaskId) {
        setActiveTaskId(undefined);
        setNotesBody('');
        setNotesStatus('todo');
      }
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  const tasksByRepoId = tasks.reduce<Record<string, TaskRecord[]>>((acc, task) => {
    (acc[task.repoId] ??= []).push(task);
    return acc;
  }, {});

  return (
    <div className="flex h-screen bg-graphite-900 text-graphite-100">
      {errorMessage !== undefined && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-40 flex items-center justify-between bg-danger-500 px-4 py-2 text-sm font-medium text-graphite-100 shadow-lg"
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
      <RepoSidebar
        repos={repos}
        tasksByRepoId={tasksByRepoId}
        selectedTaskId={activeTaskId}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={(repoId) => void handleNewTaskClick(repoId)}
        onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
      />
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        branches={branches}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
      <CloneRepoModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onSubmit={(fields) => void handleCloneRepo(fields)}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        {openTaskIds.length > 0 && (
          <TabBar
            tabs={openTaskIds.map((id) => ({
              taskId: id,
              title: tasks.find((task) => task.id === id)?.title ?? '',
            }))}
            activeTaskId={activeTaskId}
            onSelectTab={(taskId) => void handleSelectTask(taskId)}
            onCloseTab={(taskId) => void handleCloseTab(taskId)}
          />
        )}
        <div className="flex flex-1 overflow-hidden">
          {openTaskIds.length > 0 ? (
            <>
              <div className="relative flex-1 overflow-hidden">
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
                    body={notesBody}
                    status={notesStatus}
                    onSave={(newBody) =>
                      window.claudeOrchestrator.setTaskNotes({ taskId: activeTaskId, body: newBody })
                    }
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
  );
}
