import { useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';

export interface CloneRepoFields {
  url: string;
  name: string;
}

export interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: CloneRepoFields) => void;
}

const fieldInputClasses =
  'rounded-md border border-graphite-600 bg-graphite-900 px-3 py-2 text-graphite-100 focus:border-clay-500 focus:outline-none';
const fieldLabelClasses = 'text-sm font-medium text-graphite-400';

export function CloneRepoModal({ isOpen, onClose, onSubmit }: CloneRepoModalProps): JSX.Element | null {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="Clone Repo" className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">Clone Repo</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="clone-repo-url" className={fieldLabelClasses}>
            Git URL
          </label>
          <input
            id="clone-repo-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="clone-repo-name" className={fieldLabelClasses}>
            Local Name
          </label>
          <input
            id="clone-repo-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={fieldInputClasses}
          />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-graphite-400 hover:text-graphite-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSubmit({ url, name })}
            className="rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
          >
            Clone
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
