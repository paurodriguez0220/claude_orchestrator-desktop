import { useState } from 'react';

export interface CloneRepoFields {
  url: string;
  name: string;
}

export interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: CloneRepoFields) => void;
}

export function CloneRepoModal({ isOpen, onClose, onSubmit }: CloneRepoModalProps): JSX.Element | null {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  if (!isOpen) {
    return null;
  }

  return (
    <div role="dialog" aria-label="Clone Repo">
      <label htmlFor="clone-repo-url">Git URL</label>
      <input id="clone-repo-url" value={url} onChange={(event) => setUrl(event.target.value)} />

      <label htmlFor="clone-repo-name">Local Name</label>
      <input id="clone-repo-name" value={name} onChange={(event) => setName(event.target.value)} />

      <button type="button" onClick={() => onSubmit({ url, name })}>
        Clone
      </button>
      <button type="button" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
