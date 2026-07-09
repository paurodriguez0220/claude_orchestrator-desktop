import { listAliveSessions } from './pty-manager';
import { isTaskFinished } from './transcript-service';

type FinishedStateChangeListener = (taskId: string, finished: boolean) => void;

export function startFinishedStatePoller(intervalMs: number, onFinishedStateChanged: FinishedStateChangeListener): void {
  const knownFinishedState = new Map<string, boolean>();

  setInterval(() => {
    const aliveTaskIds = new Set<string>();

    for (const { taskId, cwd } of listAliveSessions()) {
      aliveTaskIds.add(taskId);
      void isTaskFinished(cwd)
        .catch(() => false)
        .then((finished) => {
          const previous = knownFinishedState.get(taskId) ?? false;
          if (previous !== finished) {
            knownFinishedState.set(taskId, finished);
            onFinishedStateChanged(taskId, finished);
          }
        });
    }

    for (const taskId of knownFinishedState.keys()) {
      if (!aliveTaskIds.has(taskId)) {
        knownFinishedState.delete(taskId);
      }
    }
  }, intervalMs);
}
