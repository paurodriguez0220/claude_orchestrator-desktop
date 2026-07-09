import { useEffect, useRef, useState } from 'react';
import type { TaskStatus } from '../../../shared/types';

const AUTOSAVE_INTERVAL_MS = 5 * 60 * 1000;

export interface TaskNotesPanelProps {
  body: string;
  status: TaskStatus;
  onSave: (body: string) => Promise<void>;
}

export function TaskNotesPanel({ body, status, onSave }: TaskNotesPanelProps): JSX.Element {
  const [draft, setDraft] = useState(body);
  const [saveError, setSaveError] = useState<string | undefined>();
  const draftRef = useRef(draft);
  const lastSavedRef = useRef(body);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  async function handleSave(): Promise<void> {
    setSaveError(undefined);
    try {
      await onSave(draft);
      lastSavedRef.current = draft;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  // This panel remounts (keyed by task id) every time the active tab
  // switches, so unmount is the only signal that the user is leaving —
  // autosave anything typed but not explicitly saved. A periodic timer
  // covers the case where the user stays on one task for a long stretch
  // without ever switching away.
  useEffect(() => {
    function saveIfDirty(): void {
      if (draftRef.current !== lastSavedRef.current) {
        const toSave = draftRef.current;
        void onSave(toSave)
          .then(() => {
            lastSavedRef.current = toSave;
          })
          .catch(() => {
            // Silent — the next periodic tick or unmount-autosave will retry.
          });
      }
    }
    const intervalId = setInterval(saveIfDirty, AUTOSAVE_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
      saveIfDirty();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Status: {status}</p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="flex-1 resize-none rounded-md border border-graphite-600 bg-graphite-900 p-3 text-sm text-graphite-100 focus:outline-none focus:ring-2 focus:ring-clay-500"
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
