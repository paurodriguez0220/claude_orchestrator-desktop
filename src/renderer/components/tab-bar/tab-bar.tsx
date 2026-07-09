export interface TabBarTab {
  taskId: string;
  title: string;
}

export interface TabBarProps {
  tabs: TabBarTab[];
  activeTaskId: string | undefined;
  finishedTaskIds: string[];
  onSelectTab: (taskId: string) => void;
  onCloseTab: (taskId: string) => void;
}

export function TabBar({ tabs, activeTaskId, finishedTaskIds, onSelectTab, onCloseTab }: TabBarProps): JSX.Element {
  return (
    <div className="flex shrink-0 gap-1 border-b border-graphite-700 bg-graphite-800 px-2 pt-2">
      {tabs.map((tab) => {
        const isActive = tab.taskId === activeTaskId;
        const isFinished = !isActive && finishedTaskIds.includes(tab.taskId);
        return (
          <div key={tab.taskId} className="flex items-center gap-1">
            <button
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelectTab(tab.taskId)}
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
              aria-label={`Close ${tab.title}`}
              className="rounded px-1 text-xs text-graphite-400 hover:bg-graphite-700 hover:text-graphite-100"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
