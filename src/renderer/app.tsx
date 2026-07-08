import { useEffect, useState } from 'react';
import { RepoSidebar } from './components/repo-sidebar/repo-sidebar';
import { NewTaskModal } from './components/new-task-modal/new-task-modal';
import { CloneRepoModal } from './components/clone-repo-modal/clone-repo-modal';
import { TerminalTab } from './components/terminal-tab/terminal-tab';
import { TaskNotesPanel } from './components/task-notes-panel/task-notes-panel';
import type { RepoRecord, TaskRecord, TaskStatus } from '../shared/types';

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

export function App(): JSX.Element {
  const [repos, setRepos] = useState<RepoRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | undefined>();
  const [notesBody, setNotesBody] = useState('');
  const [notesStatus, setNotesStatus] = useState<TaskStatus>('todo');
  const [newTaskRepoId, setNewTaskRepoId] = useState<string | undefined>();
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  useEffect(() => {
    void window.claudeOrchestrator.listRepos().then(setRepos);
    void window.claudeOrchestrator.listTasks().then(setTasks);
  }, []);

  async function handleSelectTask(taskId: string): Promise<void> {
    setErrorMessage(undefined);
    try {
      await window.claudeOrchestrator.openTask(taskId);
      const notes = await window.claudeOrchestrator.getTaskNotes(taskId);
      // Set the task's data together with the selection so TaskNotesPanel
      // never mounts with a stale/empty body for the newly selected task —
      // it only initializes its local draft state from `body` on mount.
      setNotesBody(notes.body);
      setNotesStatus(notes.status);
      setSelectedTaskId(taskId);
    } catch (err) {
      setErrorMessage(toErrorMessage(err));
    }
  }

  async function handleCreateTask(fields: { title: string; adoId: string | undefined; branch: string | undefined; existingBranch: string | undefined }): Promise<void> {
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
      if (taskId === selectedTaskId) {
        setSelectedTaskId(undefined);
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
    <div>
      {errorMessage !== undefined && <p role="alert">{errorMessage}</p>}
      <RepoSidebar
        repos={repos}
        tasksByRepoId={tasksByRepoId}
        selectedTaskId={selectedTaskId}
        onSelectTask={(taskId) => void handleSelectTask(taskId)}
        onOpenRepoClick={() => void handleOpenRepoClick()}
        onCloneRepoClick={() => setIsCloneModalOpen(true)}
        onNewTaskClick={setNewTaskRepoId}
        onRemoveTaskClick={(taskId) => void handleRemoveTask(taskId)}
      />
      <NewTaskModal
        isOpen={newTaskRepoId !== undefined}
        branches={[]}
        onClose={() => setNewTaskRepoId(undefined)}
        onSubmit={(fields) => void handleCreateTask(fields)}
      />
      <CloneRepoModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onSubmit={(fields) => void handleCloneRepo(fields)}
      />
      {selectedTaskId !== undefined && (
        <>
          <TerminalTab taskId={selectedTaskId} />
          <TaskNotesPanel
            body={notesBody}
            status={notesStatus}
            onSave={(newBody) => window.claudeOrchestrator.setTaskNotes({ taskId: selectedTaskId, body: newBody })}
          />
        </>
      )}
    </div>
  );
}
