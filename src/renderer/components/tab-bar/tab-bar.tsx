import { X } from 'lucide-react';
import { Spinner } from '../spinner/spinner';

export interface TabBarTab {
  taskId: string;
  title: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  activeTaskId: string | undefined;
  finishedTaskIds: string[];
  closingTaskIds: string[];
  onSelectTab: (taskId: string) => void;
  onCloseTab: (taskId: string) => void;
}

export function TabBar({
  tabs,
  activeTaskId,
  finishedTaskIds,
  closingTaskIds,
  onSelectTab,
  onCloseTab,
}: TabBarProps): JSX.Element {
  return (
    <div className="flex shrink-0 gap-1 border-b border-graphite-700 bg-graphite-800 px-2 pt-2">
      {tabs.map((tab) => {
        const isActive = tab.taskId === activeTaskId;
        const isFinished = !isActive && finishedTaskIds.includes(tab.taskId);
        const isClosing = closingTaskIds.includes(tab.taskId);
        return (
          <div key={tab.taskId} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(tab.taskId)}
              title={tab.title}
              className={
                isActive
                  ? 'max-w-40 truncate rounded-t-md bg-graphite-900 px-3 py-2 text-sm font-medium text-clay-400'
                  : 'max-w-40 truncate rounded-t-md px-3 py-2 text-sm text-graphite-400 hover:text-graphite-100'
              }
            >
              {tab.title}
            </button>
            {isFinished && (
              <span
                role="status"
                aria-label={`${tab.title} finished`}
                className="h-2 w-2 shrink-0 rounded-full bg-clay-500"
              />
            )}
            <button
              type="button"
              onClick={() => onCloseTab(tab.taskId)}
              disabled={isClosing}
              aria-label={`Close ${tab.title}`}
              className="rounded px-1 text-xs text-graphite-400 hover:bg-graphite-700 hover:text-graphite-100 disabled:opacity-50"
            >
              {isClosing ? <Spinner className="h-3 w-3" /> : <X aria-hidden="true" className="h-3 w-3" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
