import * as pty from 'node-pty';

type PtyDataListener = (taskId: string, data: string) => void;

const sessions = new Map<string, pty.IPty>();

// `claude --continue` exits immediately with this message when the target
// directory has no prior session to resume (e.g. a task whose worktree was
// created but never had a real conversation). Left unhandled, the PTY dies
// right after printing it and the terminal pane becomes permanently unusable
// for that task. Detect it and transparently retry as a fresh session.
const NO_CONVERSATION_MARKER = 'No conversation found to continue';

export function spawnClaudeSession(
  taskId: string,
  cwd: string,
  resume: boolean,
  onData: PtyDataListener,
): void {
  if (sessions.has(taskId)) {
    return;
  }
  const args = resume ? ['/c', 'claude', '--continue'] : ['/c', 'claude'];
  const session = pty.spawn('cmd.exe', args, {
    cwd,
    name: 'xterm-color',
    cols: 80,
    rows: 30,
  });

  let respawnedAsFresh = false;

  session.onData((data) => {
    if (resume && !respawnedAsFresh && data.includes(NO_CONVERSATION_MARKER)) {
      respawnedAsFresh = true;
      session.kill();
      if (sessions.get(taskId) === session) {
        sessions.delete(taskId);
      }
      spawnClaudeSession(taskId, cwd, false, onData);
      return;
    }
    onData(taskId, data);
  });
  session.onExit(() => {
    if (sessions.get(taskId) === session) {
      sessions.delete(taskId);
    }
  });
  sessions.set(taskId, session);
}

export function writeToSession(taskId: string, data: string): void {
  sessions.get(taskId)?.write(data);
}

export function isSessionAlive(taskId: string): boolean {
  return sessions.has(taskId);
}

export function killSession(taskId: string): void {
  sessions.get(taskId)?.kill();
  sessions.delete(taskId);
}

export function resizeSession(taskId: string, cols: number, rows: number): void {
  sessions.get(taskId)?.resize(cols, rows);
}
