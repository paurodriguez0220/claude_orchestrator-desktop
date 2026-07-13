import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';
import { slugify } from '../../../shared/slug';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';
import { BranchPicker } from '../branch-picker/branch-picker';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  branchPrefix: string | undefined;
  existingBranch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  isSubmitting: boolean;
  isLoadingBranches: boolean;
  mode: 'task' | 'review';
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-clay-500';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

const BRANCH_PREFIXES = ['feature/', 'fix/', 'chore/', 'refactor/'] as const;
const CUSTOM_PREFIX = 'custom';

export function NewTaskModal({
  isOpen,
  branches,
  isSubmitting,
  isLoadingBranches,
  mode,
  onClose,
  onSubmit,
}: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [selectedExistingBranch, setSelectedExistingBranch] = useState('');
  const [prefixChoice, setPrefixChoice] = useState<string>('feature/');

  if (!isOpen) {
    return null;
  }

  const usingExistingBranch = mode === 'review' || useExistingBranch;
  const isCustomBranch = prefixChoice === CUSTOM_PREFIX;

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: usingExistingBranch ? undefined : isCustomBranch ? branch || undefined : undefined,
      branchPrefix: usingExistingBranch || isCustomBranch ? undefined : prefixChoice,
      existingBranch: usingExistingBranch ? selectedExistingBranch || undefined : undefined,
    });
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="New Task" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">New Task</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-task-title" className={fieldLabelClasses}>
            Title
          </label>
          <input
            id="new-task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-task-ado-id" className={fieldLabelClasses}>
            ADO Task ID (optional)
          </label>
          <input
            id="new-task-ado-id"
            value={adoId}
            onChange={(event) => setAdoId(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        {mode === 'task' && (
          <fieldset className="flex flex-col gap-2">
            <legend className={fieldLabelClasses}>Branch</legend>
            <label className="flex items-center gap-2 text-sm text-graphite-100">
              <input
                type="radio"
                name="branch-mode"
                checked={!useExistingBranch}
                onChange={() => setUseExistingBranch(false)}
                className="accent-clay-500"
              />
              New branch
            </label>
            <label className="flex items-center gap-2 text-sm text-graphite-100">
              <input
                type="radio"
                name="branch-mode"
                checked={useExistingBranch}
                onChange={() => setUseExistingBranch(true)}
                className="accent-clay-500"
              />
              Use existing branch
            </label>
          </fieldset>
        )}

        {isLoadingBranches && (
          <div className="flex items-center gap-2 text-sm text-graphite-400">
            <Spinner className="h-3 w-3" />
            <span>Loading branches…</span>
          </div>
        )}

        {mode === 'review' || useExistingBranch ? (
          <BranchPicker
            id="new-task-existing-branch"
            label="Existing Branch"
            branches={branches}
            value={selectedExistingBranch}
            onChange={setSelectedExistingBranch}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="new-task-branch-prefix" className={fieldLabelClasses}>
                Branch folder
              </label>
              <select
                id="new-task-branch-prefix"
                value={prefixChoice}
                onChange={(event) => setPrefixChoice(event.target.value)}
                className={fieldInputClasses}
              >
                {BRANCH_PREFIXES.map((prefix) => (
                  <option key={prefix} value={prefix}>
                    {prefix}
                  </option>
                ))}
                <option value={CUSTOM_PREFIX}>Custom…</option>
              </select>
            </div>
            {isCustomBranch ? (
              <div className="flex flex-col gap-1">
                <label htmlFor="new-task-branch" className={fieldLabelClasses}>
                  Branch (optional)
                </label>
                <input
                  id="new-task-branch"
                  value={branch}
                  onChange={(event) => setBranch(event.target.value)}
                  className={fieldInputClasses}
                />
              </div>
            ) : (
              <p className="text-sm text-graphite-400" data-testid="branch-preview">
                Branch: <span className="text-graphite-100">{`${prefixChoice}${slugify(title)}`}</span>
              </p>
            )}
          </div>
        )}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-4 py-2 text-sm font-medium text-graphite-400 hover:text-graphite-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              isSubmitting || (usingExistingBranch && (isLoadingBranches || selectedExistingBranch === ''))
            }
            className="flex items-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
