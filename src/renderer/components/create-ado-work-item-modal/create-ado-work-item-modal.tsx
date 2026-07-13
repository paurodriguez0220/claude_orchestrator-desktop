import { useState } from 'react';
import type { AdoCreateWorkItemRequest, AdoCreateWorkItemResult } from '../../../shared/ipc-channels';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';

export interface CreateAdoWorkItemModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  result: AdoCreateWorkItemResult | undefined;
  onSubmit: (request: AdoCreateWorkItemRequest) => void;
  onClose: () => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:outline-none focus:ring-2 focus:ring-clay-500';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function CreateAdoWorkItemModal({
  isOpen,
  isSubmitting,
  result,
  onSubmit,
  onClose,
}: CreateAdoWorkItemModalProps): JSX.Element | null {
  const [type, setType] = useState('Task');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [parentId, setParentId] = useState('');
  const [assignee, setAssignee] = useState('');

  if (!isOpen) {
    return null;
  }

  const canSubmit = type.trim() !== '' && title.trim() !== '';

  function handleSubmit(): void {
    onSubmit({
      type: type.trim(),
      title: title.trim(),
      description: description.trim() || undefined,
      parentId: parentId.trim() ? Number(parentId.trim()) : undefined,
      assignee: assignee.trim() || undefined,
    });
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="New ADO work item" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">New ADO work item</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="create-ado-type" className={fieldLabelClasses}>
            Type
          </label>
          <input
            id="create-ado-type"
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="create-ado-title" className={fieldLabelClasses}>
            Title
          </label>
          <input
            id="create-ado-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="create-ado-description" className={fieldLabelClasses}>
            Description (optional)
          </label>
          <textarea
            id="create-ado-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="create-ado-parent-id" className={fieldLabelClasses}>
            Parent ID (optional)
          </label>
          <input
            id="create-ado-parent-id"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="create-ado-assignee" className={fieldLabelClasses}>
            Assignee (optional)
          </label>
          <input
            id="create-ado-assignee"
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        {result !== undefined && (
          <p className="text-sm text-graphite-100">
            Created #{result.id} —{' '}
            <a href={result.url} target="_blank" rel="noreferrer" className="text-clay-400 hover:underline">
              {result.url}
            </a>
          </p>
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
            disabled={isSubmitting || !canSubmit}
            className="flex items-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
