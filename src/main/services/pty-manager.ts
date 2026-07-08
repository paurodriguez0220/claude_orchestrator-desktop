import * as pty from 'node-pty';

type PtyDataListener = (taskId: string, data: string) => void;

const sessions = new Map<string, pty.IPty>();

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
  session.onData((data) => onData(taskId, data));
  session.onExit(() => {
    sessions.delete(taskId);
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
