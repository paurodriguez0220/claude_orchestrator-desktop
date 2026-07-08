import { useState } from 'react';
import type { BranchOption } from '../../../shared/ipc-channels';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
  existingBranch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  branches: BranchOption[];
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

export function NewTaskModal({ isOpen, branches, onClose, onSubmit }: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [selectedExistingBranch, setSelectedExistingBranch] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: useExistingBranch ? undefined : branch || undefined,
      existingBranch: useExistingBranch ? selectedExistingBranch || undefined : undefined,
    });
  }

  return (
    <div role="dialog" aria-label="New Task">
      <label htmlFor="new-task-title">Title</label>
      <input id="new-task-title" value={title} onChange={(event) => setTitle(event.target.value)} />

      <label htmlFor="new-task-ado-id">ADO Task ID (optional)</label>
      <input id="new-task-ado-id" value={adoId} onChange={(event) => setAdoId(event.target.value)} />

      <fieldset>
        <legend>Branch</legend>
        <label>
          <input
            type="radio"
            name="branch-mode"
            checked={!useExistingBranch}
            onChange={() => setUseExistingBranch(false)}
          />
          New branch
        </label>
        <label>
          <input
            type="radio"
            name="branch-mode"
            checked={useExistingBranch}
            onChange={() => setUseExistingBranch(true)}
          />
          Use existing branch
        </label>
      </fieldset>

      {useExistingBranch ? (
        <>
          <label htmlFor="new-task-existing-branch">Existing Branch</label>
          <select
            id="new-task-existing-branch"
            value={selectedExistingBranch}
            onChange={(event) => setSelectedExistingBranch(event.target.value)}
          >
            <option value="">Select a branch</option>
            {branches.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label htmlFor="new-task-branch">Branch (optional)</label>
          <input id="new-task-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />
        </>
      )}

      <button type="button" onClick={handleSubmit}>
        Create Task
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
