import type { RepoRecord, TaskRecord } from '../../../shared/types';
import { TaskSearchInput } from '../task-search-input/task-search-input';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  tasksByRepoId: Record<string, TaskRecord[]>;
  scratchTasks: TaskRecord[];
  selectedTaskId: string | undefined;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
  onNewQuestionClick: () => void;
}

export function RepoSidebar({
  repos,
  tasksByRepoId,
  scratchTasks,
  selectedTaskId,
  searchQuery,
  onSearchQueryChange,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
  onNewQuestionClick,
}: RepoSidebarProps): JSX.Element {
  const isSearchActive = searchQuery.trim() !== '';
  const visibleRepos = isSearchActive
    ? repos.filter((repo) => (tasksByRepoId[repo.id] ?? []).length > 0)
    : repos;

  return (
    <nav
      aria-label="Repositories"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-graphite-700 bg-graphite-800 p-4"
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenRepoClick}
          className="flex-1 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Open Existing Repo
        </button>
        <button
          type="button"
          onClick={onCloneRepoClick}
          className="flex-1 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Clone Repo
        </button>
      </div>
      <TaskSearchInput value={searchQuery} onChange={onSearchQueryChange} />
      <ul className="flex flex-col gap-3">
        {visibleRepos.map((repo) => (
          <li key={repo.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-semibold text-graphite-100">{repo.name}</span>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => onReviewCodeClick(repo.id)}
                  className="rounded-md border border-graphite-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
                >
                  Review Code
                </button>
                <button
                  type="button"
                  onClick={() => onNewTaskClick(repo.id)}
                  className="rounded-md bg-clay-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:bg-clay-500"
                >
                  New Task
                </button>
              </div>
            </div>
            <ul className="flex flex-col gap-1 pl-2">
              {(tasksByRepoId[repo.id] ?? []).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    aria-pressed={task.id === selectedTaskId}
                    onClick={() => onSelectTask(task.id)}
                    className={
                      task.id === selectedTaskId
                        ? 'flex-1 truncate rounded-md bg-clay-600/20 px-2 py-1 text-left text-sm font-medium text-clay-400'
                        : 'flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700'
                    }
                  >
                    {task.title}
                  </button>
                  {task.kind === 'review' && (
                    <span className="shrink-0 rounded-full bg-clay-600/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-400">
                      Review
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemoveTaskClick(task.id)}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-graphite-400 hover:text-danger-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-graphite-700 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-graphite-100">Quick Questions</h2>
          <button
            type="button"
            onClick={onNewQuestionClick}
            className="rounded-md bg-clay-600 px-2 py-1 text-xs font-medium text-graphite-100 hover:bg-clay-500"
          >
            + New Question
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {scratchTasks.map((task) => (
            <li key={task.id} className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-pressed={task.id === selectedTaskId}
                onClick={() => onSelectTask(task.id)}
                className={
                  task.id === selectedTaskId
                    ? 'flex-1 truncate rounded-md bg-clay-600/20 px-2 py-1 text-left text-sm font-medium text-clay-400'
                    : 'flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700'
                }
              >
                {task.title}
              </button>
              <span className="shrink-0 text-xs text-graphite-400">{task.status}</span>
              <button
                type="button"
                onClick={() => onRemoveTaskClick(task.id)}
                className="shrink-0 rounded-md px-2 py-1 text-xs text-graphite-400 hover:text-danger-400"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
