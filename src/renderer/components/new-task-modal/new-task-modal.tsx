import { useState } from 'react';

export interface NewTaskFields {
  title: string;
  adoId: string | undefined;
  branch: string | undefined;
}

export interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: NewTaskFields) => void;
}

export function NewTaskModal({ isOpen, onClose, onSubmit }: NewTaskModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');
  const [adoId, setAdoId] = useState('');
  const [branch, setBranch] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({
      title,
      adoId: adoId || undefined,
      branch: branch || undefined,
    });
  }

  return (
    <div role="dialog" aria-label="New Task">
      <label htmlFor="new-task-title">Title</label>
      <input id="new-task-title" value={title} onChange={(event) => setTitle(event.target.value)} />

      <label htmlFor="new-task-ado-id">ADO Task ID (optional)</label>
      <input id="new-task-ado-id" value={adoId} onChange={(event) => setAdoId(event.target.value)} />

      <label htmlFor="new-task-branch">Branch (optional)</label>
      <input id="new-task-branch" value={branch} onChange={(event) => setBranch(event.target.value)} />

      <button type="button" onClick={handleSubmit}>
        Create Task
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
