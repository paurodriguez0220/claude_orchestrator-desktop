import { useState } from 'react';
import { CloudUpload, ExternalLink } from 'lucide-react';
import { Spinner } from '../spinner/spinner';
import type { AdoSyncResult } from '../../../shared/ipc-channels';

export interface SyncTasksButtonProps {
  onDryRun: () => Promise<AdoSyncResult>;
  onSync: () => Promise<AdoSyncResult>;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'previewing' }
  | { kind: 'confirm'; preview: AdoSyncResult }
  | { kind: 'syncing' }
  | { kind: 'done'; result: AdoSyncResult }
  | { kind: 'error'; message: string };

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong';
}

// The gated "Sync tasks.md to ADO" control. A first click runs a dry run and
// shows exactly what will be created; only an explicit Confirm performs the
// write. The app never syncs to ADO on its own.
export function SyncTasksButton({ onDryRun, onSync }: SyncTasksButtonProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  async function handlePreview(): Promise<void> {
    setPhase({ kind: 'previewing' });
    try {
      setPhase({ kind: 'confirm', preview: await onDryRun() });
    } catch (err) {
      setPhase({ kind: 'error', message: errorMessage(err) });
    }
  }

  async function handleConfirm(): Promise<void> {
    setPhase({ kind: 'syncing' });
    try {
      setPhase({ kind: 'done', result: await onSync() });
    } catch (err) {
      setPhase({ kind: 'error', message: errorMessage(err) });
    }
  }

  if (phase.kind === 'confirm') {
    const { preview } = phase;
    const count = preview.toCreate.length;
    return (
      <div className="flex flex-col gap-2 text-xs text-graphite-300">
        {count === 0 ? (
          <p>Nothing to create — all items are already synced.</p>
        ) : (
          <>
            <p>
              Create {count} work item{count === 1 ? '' : 's'}
              {preview.parentId !== undefined ? <> under #{preview.parentId}</> : null}?
              {preview.skipped > 0 ? ` (${preview.skipped} already synced)` : ''}
            </p>
            <ul className="ml-3 list-disc text-graphite-400">
              {preview.toCreate.map((item, index) => (
                <li key={`${item.title}-${index}`}>
                  ({item.type}) {item.title}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex gap-2">
          {count > 0 && (
            <button
              type="button"
              onClick={() => void handleConfirm()}
              className="rounded-md bg-clay-600 px-3 py-1 font-medium text-graphite-100 hover:bg-clay-500"
            >
              Confirm
            </button>
          )}
          <button
            type="button"
            onClick={() => setPhase({ kind: 'idle' })}
            className="rounded-md px-3 py-1 text-graphite-400 hover:text-graphite-100"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'done') {
    const { result } = phase;
    return (
      <div className="flex flex-col gap-2 text-xs text-graphite-300">
        <p>Created {result.created.length} work item{result.created.length === 1 ? '' : 's'}.</p>
        <ul className="flex flex-col gap-1">
          {result.created.map((item) => (
            <li key={item.id}>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-clay-400 hover:underline"
              >
                #{item.id} {item.title}
                <ExternalLink aria-hidden="true" className="h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setPhase({ kind: 'idle' })}
          className="self-start rounded-md px-3 py-1 text-graphite-400 hover:text-graphite-100"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => void handlePreview()}
        disabled={phase.kind === 'previewing' || phase.kind === 'syncing'}
        className="flex items-center gap-2 self-start rounded-md border border-graphite-600 px-3 py-1 text-xs font-medium text-graphite-100 hover:border-clay-500 hover:text-clay-400 disabled:opacity-50"
      >
        {phase.kind === 'previewing' || phase.kind === 'syncing' ? (
          <Spinner />
        ) : (
          <CloudUpload aria-hidden="true" className="h-4 w-4" />
        )}
        Sync tasks.md to ADO
      </button>
      {phase.kind === 'error' && (
        <p role="alert" className="text-xs text-danger-400">
          {phase.message}
        </p>
      )}
    </div>
  );
}
