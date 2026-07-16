import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Code2,
  Download,
  Eye,
  FolderOpen,
  FolderPlus,
  GitPullRequest,
  MessageCirclePlus,
  Pencil,
  Plus,
  RefreshCw,
  RefreshCwOff,
  Trash2,
  X,
} from 'lucide-react';
import type { RepoRecord, TaskRecord } from '../../../shared/types';
import { TaskSearchInput } from '../task-search-input/task-search-input';
import { Spinner } from '../spinner/spinner';

export interface RepoSidebarProps {
  repos: RepoRecord[];
  activeTasksByRepoId: Record<string, TaskRecord[]>;
  scratchTasks: TaskRecord[];
  selectedTaskId: string | undefined;
  removingTaskIds: string[];
  isAddingRepo: boolean;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onSelectTask: (taskId: string) => void;
  onOpenRepoClick: () => void;
  onCloneRepoClick: () => void;
  onNewTaskClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
  onNewQuestionClick: () => void;
  appVersion: string | undefined;
  onGenerateDsuClick: () => void;
  onArchiveTaskClick: (taskId: string) => void;
  onOpenArchivedClick: () => void;
  onOpenTaskInEditorClick?: (taskId: string) => void;
  onToggleUpdateBase?: (repoId: string, updateBaseOnCreate: boolean) => void;
  onCreateFolder?: (repoId: string, name: string) => void;
  onRenameFolder?: (repoId: string, folderId: string, name: string) => void;
  onDeleteFolder?: (repoId: string, folderId: string) => void;
  onAssignTaskToFolder?: (taskId: string, folderId: string | null) => void;
}

interface TaskRowProps {
  task: TaskRecord;
  selectedTaskId: string | undefined;
  isRemoving: boolean;
  onSelectTask: (taskId: string) => void;
  onArchiveTaskClick: (taskId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onOpenTaskInEditorClick?: (taskId: string) => void;
  isDraggable?: boolean;
  onDragStart?: (taskId: string) => void;
}

function TaskRow({
  task,
  selectedTaskId,
  isRemoving,
  onSelectTask,
  onArchiveTaskClick,
  onRemoveTaskClick,
  onOpenTaskInEditorClick,
  isDraggable,
  onDragStart,
}: TaskRowProps): JSX.Element {
  return (
    <li className="flex items-center justify-between gap-2">
      <button
        type="button"
        aria-pressed={task.id === selectedTaskId}
        onClick={() => onSelectTask(task.id)}
        draggable={isDraggable}
        onDragStart={() => onDragStart?.(task.id)}
        title={task.title}
        className={
          task.id === selectedTaskId
            ? 'flex-1 truncate rounded-md bg-clay-600/20 px-2 py-1 text-left text-sm font-medium text-clay-400'
            : 'flex-1 truncate rounded-md px-2 py-1 text-left text-sm text-graphite-200 hover:bg-graphite-700'
        }
      >
        {task.title}
      </button>
      {task.kind === 'review' && (
        <span className="shrink-0 rounded-full bg-clay-600/20 px-1.5 py-0.5 text-clay-400">
          <GitPullRequest role="img" aria-label="Review" className="h-3 w-3" />
        </span>
      )}
      {onOpenTaskInEditorClick && (
        <button
          type="button"
          aria-label="Open in VS Code"
          title="Open in VS Code"
          onClick={() => onOpenTaskInEditorClick(task.id)}
          className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-clay-400"
        >
          <Code2 aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        aria-label="Archive task"
        title="Archive task"
        onClick={() => onArchiveTaskClick(task.id)}
        disabled={isRemoving}
        className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-clay-400 disabled:opacity-50"
      >
        <Archive aria-hidden="true" className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Remove task"
        onClick={() => onRemoveTaskClick(task.id)}
        disabled={isRemoving}
        className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-danger-400 disabled:opacity-50"
      >
        {isRemoving ? <Spinner className="h-4 w-4" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
      </button>
    </li>
  );
}

interface RepoItemProps {
  repo: RepoRecord;
  tasks: TaskRecord[];
  selectedTaskId: string | undefined;
  removingTaskIds: string[];
  onSelectTask: (taskId: string) => void;
  onNewTaskClick: (repoId: string) => void;
  onReviewCodeClick: (repoId: string) => void;
  onRemoveTaskClick: (taskId: string) => void;
  onArchiveTaskClick: (taskId: string) => void;
  onOpenTaskInEditorClick?: (taskId: string) => void;
  onToggleUpdateBase?: (repoId: string, updateBaseOnCreate: boolean) => void;
  onCreateFolder?: (repoId: string, name: string) => void;
  onRenameFolder?: (repoId: string, folderId: string, name: string) => void;
  onDeleteFolder?: (repoId: string, folderId: string) => void;
  onAssignTaskToFolder?: (taskId: string, folderId: string | null) => void;
}

function RepoItem({
  repo,
  tasks,
  selectedTaskId,
  removingTaskIds,
  onSelectTask,
  onNewTaskClick,
  onReviewCodeClick,
  onRemoveTaskClick,
  onArchiveTaskClick,
  onOpenTaskInEditorClick,
  onToggleUpdateBase,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAssignTaskToFolder,
}: RepoItemProps): JSX.Element {
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState('');

  const updateBaseEnabled = repo.updateBaseOnCreate !== false;
  const folders = repo.folders ?? [];
  const folderIds = new Set(folders.map((folder) => folder.id));
  const tasksByFolder = new Map<string, TaskRecord[]>();
  const ungroupedTasks: TaskRecord[] = [];
  for (const task of tasks) {
    if (task.folderId !== undefined && folderIds.has(task.folderId)) {
      const list = tasksByFolder.get(task.folderId) ?? [];
      list.push(task);
      tasksByFolder.set(task.folderId, list);
    } else {
      ungroupedTasks.push(task);
    }
  }

  const dropAllowed = onAssignTaskToFolder !== undefined;

  function handleDrop(folderId: string | null): void {
    if (draggedTaskId !== null && onAssignTaskToFolder) {
      onAssignTaskToFolder(draggedTaskId, folderId);
    }
    setDraggedTaskId(null);
  }

  function submitNewFolder(): void {
    const name = newFolderName.trim();
    if (name !== '' && onCreateFolder) {
      onCreateFolder(repo.id, name);
    }
    setNewFolderName('');
    setIsCreatingFolder(false);
  }

  function submitRename(folderId: string): void {
    const name = renameName.trim();
    if (name !== '' && onRenameFolder) {
      onRenameFolder(repo.id, folderId, name);
    }
    setRenamingFolderId(null);
    setRenameName('');
  }

  function renderTaskRow(task: TaskRecord): JSX.Element {
    return (
      <TaskRow
        key={task.id}
        task={task}
        selectedTaskId={selectedTaskId}
        isRemoving={removingTaskIds.includes(task.id)}
        onSelectTask={onSelectTask}
        onArchiveTaskClick={onArchiveTaskClick}
        onRemoveTaskClick={onRemoveTaskClick}
        onOpenTaskInEditorClick={onOpenTaskInEditorClick}
        isDraggable={dropAllowed}
        onDragStart={setDraggedTaskId}
      />
    );
  }

  return (
    <li className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-graphite-100" title={repo.name}>
          {repo.name}
        </span>
        <div className="flex shrink-0 gap-1">
          {onToggleUpdateBase && (
            <button
              type="button"
              aria-label="Update base before new tasks"
              aria-pressed={updateBaseEnabled}
              title={
                updateBaseEnabled
                  ? 'New tasks branch from the latest remote default branch (click to branch from your local copy instead)'
                  : 'New tasks branch from your local copy (click to fetch and branch from the latest remote default branch)'
              }
              onClick={() => onToggleUpdateBase(repo.id, !updateBaseEnabled)}
              className={
                updateBaseEnabled
                  ? 'flex items-center justify-center rounded-md border border-clay-500 p-1.5 text-clay-400 hover:border-clay-400'
                  : 'flex items-center justify-center rounded-md border border-graphite-600 p-1.5 text-graphite-500 hover:border-clay-500 hover:text-clay-400'
              }
            >
              {updateBaseEnabled ? (
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              ) : (
                <RefreshCwOff aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          )}
          {onCreateFolder && (
            <button
              type="button"
              aria-label="New folder"
              title="New folder"
              onClick={() => setIsCreatingFolder(true)}
              className="flex items-center justify-center rounded-md border border-graphite-600 p-1.5 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
            >
              <FolderPlus aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Review Code"
            title="Review Code"
            onClick={() => onReviewCodeClick(repo.id)}
            className="flex items-center justify-center rounded-md border border-graphite-600 p-1.5 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
          >
            <Eye aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="New Task"
            title="New Task"
            onClick={() => onNewTaskClick(repo.id)}
            className="flex items-center justify-center rounded-md bg-clay-600 p-1.5 text-graphite-100 hover:bg-clay-500"
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isCreatingFolder && (
        <div className="flex items-center gap-1 pl-2">
          <input
            type="text"
            aria-label="Folder name"
            autoFocus
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                submitNewFolder();
              } else if (event.key === 'Escape') {
                setIsCreatingFolder(false);
                setNewFolderName('');
              }
            }}
            className="flex-1 rounded-md border border-graphite-600 bg-graphite-900 px-2 py-1 text-sm text-graphite-100"
          />
          <button
            type="button"
            aria-label="Confirm new folder"
            onClick={submitNewFolder}
            className="shrink-0 rounded-md px-1.5 py-1 text-graphite-400 hover:text-clay-400"
          >
            <Check aria-hidden="true" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Cancel new folder"
            onClick={() => {
              setIsCreatingFolder(false);
              setNewFolderName('');
            }}
            className="shrink-0 rounded-md px-1.5 py-1 text-graphite-400 hover:text-danger-400"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      {folders.map((folder) => {
        const folderTasks = tasksByFolder.get(folder.id) ?? [];
        const isCollapsed = collapsedFolderIds.includes(folder.id);
        const isRenaming = renamingFolderId === folder.id;
        return (
          <div key={folder.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Toggle ${folder.name} folder`}
                aria-expanded={!isCollapsed}
                onClick={() =>
                  setCollapsedFolderIds((current) =>
                    current.includes(folder.id)
                      ? current.filter((id) => id !== folder.id)
                      : [...current, folder.id],
                  )
                }
                onDragOver={(event) => {
                  if (dropAllowed) {
                    event.preventDefault();
                  }
                }}
                onDrop={() => handleDrop(folder.id)}
                className="flex flex-1 items-center gap-1 truncate rounded-md px-1 py-1 text-left text-sm font-medium text-graphite-200 hover:bg-graphite-700"
              >
                {isCollapsed ? (
                  <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                )}
                {isRenaming ? (
                  <input
                    type="text"
                    aria-label="Rename folder"
                    autoFocus
                    value={renameName}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setRenameName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        submitRename(folder.id);
                      } else if (event.key === 'Escape') {
                        setRenamingFolderId(null);
                        setRenameName('');
                      }
                    }}
                    className="flex-1 rounded border border-graphite-600 bg-graphite-900 px-1 text-sm text-graphite-100"
                  />
                ) : (
                  <>
                    <span className="flex-1 truncate">{folder.name}</span>
                    <span className="shrink-0 rounded-full bg-graphite-700 px-1.5 text-xs text-graphite-300">
                      {folderTasks.length}
                    </span>
                  </>
                )}
              </button>
              {onRenameFolder && !isRenaming && (
                <button
                  type="button"
                  aria-label="Rename folder"
                  title="Rename folder"
                  onClick={() => {
                    setRenamingFolderId(folder.id);
                    setRenameName(folder.name);
                  }}
                  className="shrink-0 rounded-md px-1.5 py-1 text-graphite-400 hover:text-clay-400"
                >
                  <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
              {onDeleteFolder && (
                <button
                  type="button"
                  aria-label="Delete folder"
                  title="Delete folder (keeps its tasks)"
                  onClick={() => onDeleteFolder(repo.id, folder.id)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-graphite-400 hover:text-danger-400"
                >
                  <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {!isCollapsed && (
              <ul className="flex flex-col gap-1 pl-4">{folderTasks.map(renderTaskRow)}</ul>
            )}
          </div>
        );
      })}

      <ul
        aria-label="Ungrouped tasks"
        onDragOver={(event) => {
          if (dropAllowed) {
            event.preventDefault();
          }
        }}
        onDrop={() => handleDrop(null)}
        className="flex flex-col gap-1 pl-2"
      >
        {ungroupedTasks.map(renderTaskRow)}
      </ul>
    </li>
  );
}

export function RepoSidebar({
  repos,
  activeTasksByRepoId,
  scratchTasks,
  selectedTaskId,
  removingTaskIds,
  isAddingRepo,
  searchQuery,
  onSearchQueryChange,
  onSelectTask,
  onOpenRepoClick,
  onCloneRepoClick,
  onNewTaskClick,
  onRemoveTaskClick,
  onReviewCodeClick,
  onNewQuestionClick,
  appVersion,
  onGenerateDsuClick,
  onArchiveTaskClick,
  onOpenArchivedClick,
  onOpenTaskInEditorClick,
  onToggleUpdateBase,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onAssignTaskToFolder,
}: RepoSidebarProps): JSX.Element {
  const isSearchActive = searchQuery.trim() !== '';
  const visibleRepos = isSearchActive
    ? repos.filter((repo) => (activeTasksByRepoId[repo.id] ?? []).length > 0)
    : repos;

  return (
    <nav
      aria-label="Repositories"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-graphite-700 bg-graphite-800 p-4"
    >
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Open Existing Repo"
          title="Open Existing Repo"
          onClick={onOpenRepoClick}
          disabled={isAddingRepo}
          className="flex flex-1 items-center justify-center rounded-md border border-graphite-600 px-3 py-2 text-graphite-100 hover:border-clay-500 hover:text-clay-400 disabled:opacity-50"
        >
          {isAddingRepo ? <Spinner className="h-4 w-4" /> : <FolderOpen aria-hidden="true" className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Clone Repo"
          title="Clone Repo"
          onClick={onCloneRepoClick}
          className="flex flex-1 items-center justify-center rounded-md border border-graphite-600 px-3 py-2 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Generate work log"
          title="Generate work log"
          onClick={onGenerateDsuClick}
          className="flex flex-1 items-center justify-center rounded-md border border-graphite-600 px-3 py-2 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          <CalendarClock aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Archived tasks"
          title="Archived tasks"
          onClick={onOpenArchivedClick}
          className="flex flex-1 items-center justify-center rounded-md border border-graphite-600 px-3 py-2 text-graphite-100 hover:border-clay-500 hover:text-clay-400"
        >
          <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <TaskSearchInput value={searchQuery} onChange={onSearchQueryChange} />
      <ul className="flex flex-col gap-3">
        {visibleRepos.map((repo) => (
          <RepoItem
            key={repo.id}
            repo={repo}
            tasks={activeTasksByRepoId[repo.id] ?? []}
            selectedTaskId={selectedTaskId}
            removingTaskIds={removingTaskIds}
            onSelectTask={onSelectTask}
            onNewTaskClick={onNewTaskClick}
            onReviewCodeClick={onReviewCodeClick}
            onRemoveTaskClick={onRemoveTaskClick}
            onArchiveTaskClick={onArchiveTaskClick}
            onOpenTaskInEditorClick={onOpenTaskInEditorClick}
            onToggleUpdateBase={onToggleUpdateBase}
            onCreateFolder={onCreateFolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            onAssignTaskToFolder={onAssignTaskToFolder}
          />
        ))}
      </ul>
      <div className="flex flex-col gap-2 border-t border-graphite-700 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-graphite-100">Quick Questions</h2>
          <button
            type="button"
            aria-label="New Question"
            title="New Question"
            onClick={onNewQuestionClick}
            className="flex items-center justify-center rounded-md bg-clay-600 p-1.5 text-graphite-100 hover:bg-clay-500"
          >
            <MessageCirclePlus aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        <ul className="flex flex-col gap-1">
          {scratchTasks.map((task) => {
            const isRemoving = removingTaskIds.includes(task.id);
            return (
              <li key={task.id} className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-pressed={task.id === selectedTaskId}
                  onClick={() => onSelectTask(task.id)}
                  title={task.title}
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
                  aria-label="Remove question"
                  onClick={() => onRemoveTaskClick(task.id)}
                  disabled={isRemoving}
                  className="shrink-0 rounded-md px-2 py-1 text-graphite-400 hover:text-danger-400 disabled:opacity-50"
                >
                  {isRemoving ? <Spinner className="h-4 w-4" /> : <Trash2 aria-hidden="true" className="h-4 w-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {appVersion !== undefined && (
        <span className="text-center text-xs text-graphite-500">{`v${appVersion}`}</span>
      )}
    </nav>
  );
}
