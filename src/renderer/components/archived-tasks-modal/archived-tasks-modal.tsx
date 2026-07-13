import { useEffect, useState } from 'react';
import { ArchiveRestore } from 'lucide-react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import type { RepoRecord, TaskRecord } from '../../../shared/types';

export interface ArchivedTasksModalProps {
  isOpen: boolean;
  repos: RepoRecord[];
  archivedTasksByRepoId: Record<string, TaskRecord[]>;
  onSelectTask: (taskId: string) => void;
  onUnarchive: (taskId: string) => void;
  onClose: () => void;
}

export function ArchivedTasksModal({
  isOpen,
  repos,
  archivedTasksByRepoId,
  onSelectTask,
  onUnarchive,
  onClose,
}: ArchivedTasksModalProps): JSX.Element | null {
  const [filter, setFilter] = useState('');

  // The modal can stay mounted across opens; clear the filter each time it opens.
  useEffect(() => {
    if (isOpen) {
      setFilter('');
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const needle = filter.trim().toLowerCase();
  const repoName = (repoId: string): string => repos.find((repo) => repo.id === repoId)?.name ?? repoId;

  const groups = Object.entries(archivedTasksByRepoId)
    .map(([repoId, tasks]) => ({
      repoId,
      name: repoName(repoId),
      tasks: tasks.filter(
        (task) =>
          needle === '' ||
          task.title.toLowerCase().includes(needle) ||
          (task.branch ?? '').toLowerCase().includes(needle) ||
          repoName(repoId).toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.tasks.length > 0);

  const totalArchived = Object.values(archivedTasksByRepoId).reduce((sum, tasks) => sum + tasks.length, 0);

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="Archived tasks" className="flex max-h-[80vh] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">Archived tasks</h2>
        <input
          type="search"
          aria-label="Filter archived tasks"
          placeholder="Filter archived tasks…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          className="rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-sm text-graphite-100 focus:outline-none focus:ring-2 focus:ring-clay-500"
        />
        <div className="flex-1 overflow-y-auto">
          {totalArchived === 0 ? (
            <p className="text-sm text-graphite-400">No archived tasks.</p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-graphite-400">No archived tasks match.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {groups.map((group) => (
                <li key={group.repoId} className="flex flex-col gap-1">
                  <span className="truncate text-sm font-semibold text-graphite-100">{group.name}</span>
                  <ul className="flex flex-col gap-1 pl-2">
                    {group.tasks.map((task) => (
                      <li key={task.id} className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectTask(task.id)}
                          title={task.title}
                          className="flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700"
                        >
                          {task.title}
                        </button>
                        <button
                          type="button"
                          aria-label="Unarchive task"
                          title="Unarchive task"
                          onClick={() => onUnarchive(task.id)}
                          className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-clay-400"
                        >
                          <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="self-end rounded-md border border-graphite-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          Close
        </button>
      </div>
    </ModalOverlay>
  );
}
