import { useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';

export interface NewQuestionFields {
  title: string;
}

export interface NewQuestionModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (fields: NewQuestionFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function NewQuestionModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: NewQuestionModalProps): JSX.Element | null {
  const [title, setTitle] = useState('');

  if (!isOpen) {
    return null;
  }

  function handleSubmit(): void {
    onSubmit({ title });
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="New Question" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">New Question</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="new-question-title" className={fieldLabelClasses}>
            Title
          </label>
          <input
            id="new-question-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

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
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isSubmitting && <Spinner />}
            {isSubmitting ? 'Creating…' : 'Create Question'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
