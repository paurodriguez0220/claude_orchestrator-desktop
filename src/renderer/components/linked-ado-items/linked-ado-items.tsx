import { useState } from 'react';
import { ExternalLink, Plus, X } from 'lucide-react';

export interface LinkedAdoItemsProps {
  adoIds: string[];
  orgUrlBase: string;
  onLink: (adoId: string) => void;
  onUnlink: (adoId: string) => void;
}

// The "Linked ADO items" section of the task panel: shows the work items linked
// to the active worktree as chips (each opening in ADO, each removable) and a
// small field to link another by id. A worktree can hold a parent plus several
// children, which is what the tasks.md -> ADO sync operates on.
export function LinkedAdoItems({ adoIds, orgUrlBase, onLink, onUnlink }: LinkedAdoItemsProps): JSX.Element {
  const [draft, setDraft] = useState('');

  function handleLink(): void {
    const trimmed = draft.trim();
    if (trimmed === '') {
      return;
    }
    onLink(trimmed);
    setDraft('');
  }

  return (
    <section className="flex flex-col gap-2 border-b border-graphite-700 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-graphite-400">Linked ADO items</h3>

      {adoIds.length === 0 ? (
        <p className="text-xs text-graphite-500">No linked ADO items.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {adoIds.map((id) => (
            <li
              key={id}
              className="flex items-center gap-1 rounded-md border border-graphite-600 bg-graphite-900 px-2 py-1 text-xs text-graphite-100"
            >
              <a
                href={`${orgUrlBase}/_workitems/edit/${id}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-clay-400 hover:underline"
              >
                #{id}
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
              <button
                type="button"
                aria-label={`Unlink ${id}`}
                title={`Unlink ${id}`}
                onClick={() => onUnlink(id)}
                className="text-graphite-500 hover:text-danger-400"
              >
                <X aria-hidden="true" className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <input
          aria-label="ADO work item id"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleLink();
            }
          }}
          placeholder="Link by id…"
          className="min-w-0 flex-1 rounded-md border border-graphite-600 bg-graphite-900 px-2 py-1 text-xs text-graphite-100 focus:outline-none focus:ring-2 focus:ring-clay-500"
        />
        <button
          type="button"
          aria-label="Link ADO item"
          title="Link ADO item"
          onClick={handleLink}
          className="shrink-0 rounded-md p-1 text-graphite-400 hover:text-clay-400"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
