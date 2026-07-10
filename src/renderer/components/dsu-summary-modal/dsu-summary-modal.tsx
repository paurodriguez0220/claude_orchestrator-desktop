import { useEffect, useState } from 'react';
import { ModalOverlay } from '../modal-overlay/modal-overlay';
import { Spinner } from '../spinner/spinner';
import { getLastWorkingDayStamp, toDateStamp } from '../../../shared/dates';

export interface DsuSummaryModalProps {
  isOpen: boolean;
  summary: string | undefined;
  filePath: string | undefined;
  isGenerating: boolean;
  onGenerate: (date: string) => void;
  onClose: () => void;
}

export function DsuSummaryModal({
  isOpen,
  summary,
  filePath,
  isGenerating,
  onGenerate,
  onClose,
}: DsuSummaryModalProps): JSX.Element | null {
  const [date, setDate] = useState(() => getLastWorkingDayStamp(new Date()));

  // Re-derive the default whenever the modal opens: the app can stay running
  // across days, so a mount-time default would go stale.
  useEffect(() => {
    if (isOpen) {
      setDate(getLastWorkingDayStamp(new Date()));
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="Work Log" className="flex max-h-[80vh] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">Work Log</h2>
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs text-graphite-400">
            Day to summarize
            <input
              type="date"
              value={date}
              max={toDateStamp(new Date())}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-md border border-graphite-700 bg-graphite-900 px-2 py-1.5 text-sm text-graphite-100"
            />
          </label>
          <button
            type="button"
            onClick={() => onGenerate(date)}
            disabled={isGenerating || date === ''}
            className="flex items-center justify-center gap-2 rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500 disabled:opacity-50"
          >
            {isGenerating && <Spinner />}
            {isGenerating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {summary !== undefined && (
          <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-graphite-700 bg-graphite-900 p-3 text-sm text-graphite-100">
            {summary}
          </pre>
        )}
        {filePath !== undefined && <p className="text-xs text-graphite-400">Saved to {filePath}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-graphite-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
