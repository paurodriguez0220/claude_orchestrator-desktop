import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  existingBranch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  isSubmitting: boolean;
  mode: 'task' | 'review';
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function NewTaskModal({
  isOpen,
  branches,
  isSubmitting,
  mode,
  onClose,
  onSubmit,
}: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [selectedExistingBranch, setSelectedExistingBranch] = useState('');

  if (!isOpen) {
    return null;
  }

  const usingExistingBranch = mode === 'review' || useExistingBranch;

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: usingExistingBranch ? undefined : branch || undefined,
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

        {mode === 'review' || useExistingBranch ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="new-task-existing-branch" className={fieldLabelClasses}>
              Existing Branch
            </label>
            <select
              id="new-task-existing-branch"
              value={selectedExistingBranch}
              onChange={(event) => setSelectedExistingBranch(event.target.value)}
              className={fieldInputClasses}
            >
              <option value="">Select a branch</option>
              {branches.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
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
            disabled={isSubmitting || (usingExistingBranch && selectedExistingBranch === '')}
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
