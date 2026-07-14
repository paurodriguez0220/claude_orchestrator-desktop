import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class EditorLaunchError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'EditorLaunchError';
    this.stderr = stderr;
  }
}

// Reject any path that could break out of the `cmd.exe` invocation below.
// Worktree/scratch paths are app-generated and never contain these, so this
// is a belt-and-suspenders guard honouring the repo rule "never build a shell
// command by string-interpolating input".
const UNSAFE_PATH_CHARS = /["%&|<>^`$]|[\r\n]/;

export async function openInVsCode(folderPath: string): Promise<void> {
  if (folderPath.trim() === '' || UNSAFE_PATH_CHARS.test(folderPath)) {
    throw new EditorLaunchError(`Refusing to open an unsafe path: ${folderPath}`, '');
  }
  // The VS Code CLI on Windows is `code.cmd`, a batch file Node cannot spawn
  // directly. Wrapping in `cmd.exe` with shell:false lets Node do its own
  // argv-quoting of folderPath (handling spaces) instead of us hand-quoting
  // into a shell string.
  try {
    await execFileAsync('cmd.exe', ['/c', 'code', folderPath], { windowsHide: true });
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new EditorLaunchError(
      "Could not open VS Code. Make sure the 'code' command is on your PATH " +
        "(in VS Code: Ctrl+Shift+P → \"Shell Command: Install 'code' command in PATH\").",
      stderr,
    );
  }
}
