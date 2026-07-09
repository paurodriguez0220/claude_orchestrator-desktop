import { useState } from 'react';
import type { RepoRecord, TaskRecord } from '../../../shared/types';
import { TaskSearchInput } from '../task-search-input/task-search-input';
import { Spinner } from '../spinner/spinner';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  activeTasksByRepoId: Record<string, TaskRecord[]>;
  archivedTasksByRepoId: Record<string, TaskRecord[]>;
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
  onGenerateDsuClick: () => void;
  isGeneratingDsu: boolean;
}

interface TaskRowProps {
  task: TaskRecord;
  selectedTaskId: string | undefined;
  onSelectTask: (taskId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
}

function TaskRow({ task, selectedTaskId, onSelectTask, onRemoveTaskClick }: TaskRowProps): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2">
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
  );
}

export function RepoSidebar({
  repos,
  activeTasksByRepoId,
  archivedTasksByRepoId,
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
  onGenerateDsuClick,
  isGeneratingDsu,
}: RepoSidebarProps): JSX.Element {
  const isSearchActive = searchQuery.trim() !== '';
  const visibleRepos = isSearchActive
    ? repos.filter((repo) => (activeTasksByRepoId[repo.id] ?? []).length > 0)
    : repos;

  const [expandedRepoIds, setExpandedRepoIds] = useState<Set<string>>(new Set());

  function toggleArchived(repoId: string): void {
    setExpandedRepoIds((current) => {
      const next = new Set(current);
      if (next.has(repoId)) {
        next.delete(repoId);
      } else {
        next.add(repoId);
      }
      return next;
    });
  }

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
        <button
          type="button"
          onClick={onGenerateDsuClick}
          disabled={isGeneratingDsu}
          className="flex flex-1 items-center justify-center gap-2 rounded-md border border-graphite-600 px-3 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400 disabled:opacity-50"
        >
          {isGeneratingDsu && <Spinner />}
          {isGeneratingDsu ? 'Generating…' : 'Generate DSU'}
        </button>
      </div>
      <TaskSearchInput value={searchQuery} onChange={onSearchQueryChange} />
      <ul className="flex flex-col gap-3">
        {visibleRepos.map((repo) => {
          const archivedTasks = archivedTasksByRepoId[repo.id] ?? [];
          const isExpanded = expandedRepoIds.has(repo.id);
          return (
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
                {(activeTasksByRepoId[repo.id] ?? []).map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={onSelectTask}
                    onRemoveTaskClick={onRemoveTaskClick}
                  />
                ))}
              </ul>
              {archivedTasks.length > 0 && (
                <div className="pl-2">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => toggleArchived(repo.id)}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-graphite-400 hover:text-graphite-100"
                  >
                    <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                    {`Archived (${archivedTasks.length})`}
                  </button>
                  {isExpanded && (
                    <ul className="flex flex-col gap-1 pl-2">
                      {archivedTasks.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          selectedTaskId={selectedTaskId}
                          onSelectTask={onSelectTask}
                          onRemoveTaskClick={onRemoveTaskClick}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
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
