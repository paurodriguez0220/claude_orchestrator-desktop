import { GitBranchPlus } from 'lucide-react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';
import type { AdoWorkItem } from '../../../shared/ipc-channels';

export interface AdoTasksModalProps {
  isOpen: boolean;
  tasks: AdoWorkItem[];
  isLoading: boolean;
  orgUrlBase: string;
  onCreateWorktree: (item: AdoWorkItem) => void;
  onClose: () => void;
}

export function AdoTasksModal({
  isOpen,
  tasks,
  isLoading,
  orgUrlBase,
  onCreateWorktree,
  onClose,
}: AdoTasksModalProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="Azure DevOps tasks" className="flex max-h-[80vh] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">Azure DevOps tasks</h2>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-graphite-400">
              <Spinner />
            </div>
          ) : tasks.length === 0 ? (
            <p className="text-sm text-graphite-400">No active ADO tasks.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-graphite-100" title={task.title}>
                      {task.title}
                    </p>
                    <p className="truncate text-xs text-graphite-400">
                      {task.type} · {task.state}
                      {task.storyPoints !== undefined ? ` · ${task.storyPoints} SP` : ''}
                    </p>
                    <a
                      href={`${orgUrlBase}/_workitems/edit/${task.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-clay-400 hover:underline"
                    >
                      Open in ADO
                    </a>
                  </div>
                  <button
                    type="button"
                    aria-label="Create worktree"
                    title="Create worktree"
                    onClick={() => onCreateWorktree(task)}
                    className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-clay-400"
                  >
                    <GitBranchPlus aria-hidden="true" className="h-4 w-4" />
                  </button>
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
