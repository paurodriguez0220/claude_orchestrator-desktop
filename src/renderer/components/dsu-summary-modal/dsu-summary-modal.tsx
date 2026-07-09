import { ModalOverlay } from '../modal-overlay/modal-overlay';

export interface DsuSummaryModalProps {
  isOpen: boolean;
  summary: string;
  filePath: string | undefined;
  onClose: () => void;
}

export function DsuSummaryModal({ isOpen, summary, filePath, onClose }: DsuSummaryModalProps): JSX.Element | null {
  if (!isOpen) {
    return null;
  }

  return (
    <ModalOverlay>
      <div role="dialog" aria-label="DSU Summary" className="flex max-h-[80vh] flex-col gap-4">
        <h2 className="text-lg font-semibold text-graphite-100">DSU Summary</h2>
        <pre className="flex-1 overflow-y-auto whitespace-pre-wrap rounded-md border border-graphite-700 bg-graphite-900 p-3 text-sm text-graphite-100">
          {summary}
        </pre>
        {filePath !== undefined && <p className="text-xs text-graphite-400">Saved to {filePath}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-clay-600 px-4 py-2 text-sm font-medium text-graphite-100 hover:bg-clay-500"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}
