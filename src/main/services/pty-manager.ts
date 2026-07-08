import * as pty from 'node-pty';

type PtyDataListener = (taskId: string, data: string) => void;

interface Session {
  process: pty.IPty;
  cwd: string;
}

const sessions = new Map<string, Session>();

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
  const ptyProcess = pty.spawn('cmd.exe', args, {
    cwd,
    name: 'xterm-color',
    cols: 80,
    rows: 30,
  });

  let respawnedAsFresh = false;

  ptyProcess.onData((data) => {
    if (resume && !respawnedAsFresh && data.includes(NO_CONVERSATION_MARKER)) {
      respawnedAsFresh = true;
      ptyProcess.kill();
      if (sessions.get(taskId)?.process === ptyProcess) {
        sessions.delete(taskId);
      }
      spawnClaudeSession(taskId, cwd, false, onData);
      return;
    }
    onData(taskId, data);
  });
  ptyProcess.onExit(() => {
    if (sessions.get(taskId)?.process === ptyProcess) {
      sessions.delete(taskId);
    }
  });
  sessions.set(taskId, { process: ptyProcess, cwd });
}

export function writeToSession(taskId: string, data: string): void {
  sessions.get(taskId)?.process.write(data);
}

export function isSessionAlive(taskId: string): boolean {
  return sessions.has(taskId);
}

export function killSession(taskId: string): void {
  sessions.get(taskId)?.process.kill();
  sessions.delete(taskId);
}

export function resizeSession(taskId: string, cols: number, rows: number): void {
  sessions.get(taskId)?.process.resize(cols, rows);
}

export function listAliveSessions(): Array<{ taskId: string; cwd: string }> {
  return Array.from(sessions.entries()).map(([taskId, session]) => ({ taskId, cwd: session.cwd }));
}
