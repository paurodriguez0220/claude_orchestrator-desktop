import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockError: { stderr?: string } | null = null;

const execFileMock = vi.fn();

vi.mock('node:child_process', () => ({
  execFile: (...args: unknown[]) => {
    const callback = args[args.length - 1] as (
      err: { stderr?: string } | null,
      result?: { stdout: string; stderr: string },
    ) => void;
    const result = execFileMock(...args.slice(0, -1));
    if (mockError) {
      callback(mockError);
    } else {
      callback(null, result ?? { stdout: '', stderr: '' });
    }
  },
}));

import { openInVsCode, EditorLaunchError } from './editor-service';

describe('editor-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  it('launches VS Code via cmd.exe /c code with the folder path as an argument array, never a shell string', async () => {
    await openInVsCode('C:\\repo-worktrees\\fix login bug');
    expect(execFileMock).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'code', 'C:\\repo-worktrees\\fix login bug'],
      { windowsHide: true },
    );
  });

  it('rejects a path containing shell/cmd metacharacters without launching anything', async () => {
    await expect(openInVsCode('C:\\repo & calc.exe')).rejects.toBeInstanceOf(EditorLaunchError);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('rejects an empty path without launching anything', async () => {
    await expect(openInVsCode('   ')).rejects.toBeInstanceOf(EditorLaunchError);
    expect(execFileMock).not.toHaveBeenCalled();
  });

  it('wraps a failing launch in EditorLaunchError with an install hint and the real stderr', async () => {
    mockError = Object.assign(new Error('exit 1'), {
      stderr: "'code' is not recognized as an internal or external command",
    });
    const thrown = await openInVsCode('C:\\repo-worktrees\\slug').catch((err) => err);
    expect(thrown).toBeInstanceOf(EditorLaunchError);
    expect(thrown.message).toContain("'code' command");
    expect(thrown.stderr).toContain("'code' is not recognized");
  });
});
