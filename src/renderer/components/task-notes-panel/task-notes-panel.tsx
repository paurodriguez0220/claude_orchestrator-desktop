import { useState } from 'react';
import type { TaskStatus } from '../../../shared/types';

export interface TaskNotesPanelProps {
  body: string;
  status: TaskStatus;
  onSave: (body: string) => Promise<void>;
}

export function TaskNotesPanel({ body, status, onSave }: TaskNotesPanelProps): JSX.Element {
  const [draft, setDraft] = useState(body);
  const [saveError, setSaveError] = useState<string | undefined>();

  async function handleSave(): Promise<void> {
    setSaveError(undefined);
    try {
      await onSave(draft);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  return (
    <div>
      <p>Status: {status}</p>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
      <button type="button" onClick={handleSave}>
        Save
      </button>
      {saveError !== undefined && <p role="alert">{saveError}</p>}
    </div>
  );
}
