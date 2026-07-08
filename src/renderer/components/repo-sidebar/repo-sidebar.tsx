import type { RepoRecord, TaskRecord } from '../../../shared/types';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  tasksByRepoId: Record<string, TaskRecord[]>;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
}

export function RepoSidebar({
  repos,
  tasksByRepoId,
  selectedTaskId,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
}: RepoSidebarProps): JSX.Element {
  return (
    <nav aria-label="Repositories">
      <button type="button" onClick={onOpenRepoClick}>
        Open Existing Repo
      </button>
      <button type="button" onClick={onCloneRepoClick}>
        Clone Repo
      </button>
      <ul>
        {repos.map((repo) => (
          <li key={repo.id}>
            <span>{repo.name}</span>
            <button type="button" onClick={() => onNewTaskClick(repo.id)}>
              New Task
            </button>
            <ul>
              {(tasksByRepoId[repo.id] ?? []).map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    aria-pressed={task.id === selectedTaskId}
                    onClick={() => onSelectTask(task.id)}
                  >
                    {task.title}
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
