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
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Status: {status}</p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="flex-1 resize-none rounded-md border border-graphite-600 bg-graphite-900 p-3 text-sm text-graphite-100 focus:border-clay-500 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleSave}
        className="self-start rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
      >
        Save
      </button>
      {saveError !== undefined && (
        <p role="alert" className="text-sm text-danger-400">
          {saveError}
        </p>
      )}
    </div>
  );
}
