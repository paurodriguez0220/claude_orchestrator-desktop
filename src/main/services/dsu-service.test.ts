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

import { buildDsuPrompt, generateDsuSummary, DsuCommandError } from './dsu-service';
import type { TaskCommitSummary } from './dsu-service';

describe('dsu-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  describe('buildDsuPrompt', () => {
    it('lists each task title as a heading with its commit subjects as bullets', () => {
      const taskSummaries: TaskCommitSummary[] = [
        { title: 'Fix login bug', commitSubjects: ['fix: handle empty input', 'feat: add validation'] },
      ];
      const prompt = buildDsuPrompt(taskSummaries);
      expect(prompt).toContain('## Fix login bug');
      expect(prompt).toContain('- fix: handle empty input');
      expect(prompt).toContain('- feat: add validation');
    });
  });

  describe('generateDsuSummary', () => {
    it('returns a fixed message without shelling out when there are no task summaries', async () => {
      const result = await generateDsuSummary([]);
      expect(result).toBe('No commits since the last working day.');
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('invokes claude -p non-interactively with the prompt as a discrete argument, never a concatenated shell string', async () => {
      execFileMock.mockReturnValue({ stdout: '- Fixed the login bug\n', stderr: '' });
      const taskSummaries: TaskCommitSummary[] = [
        { title: 'Fix login bug', commitSubjects: ['fix: handle empty input'] },
      ];
      const result = await generateDsuSummary(taskSummaries);
      expect(execFileMock).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '-p', buildDsuPrompt(taskSummaries)],
        undefined,
      );
      expect(result).toBe('- Fixed the login bug');
    });

    it('wraps a failing claude invocation in DsuCommandError with the real stderr', async () => {
      mockError = Object.assign(new Error('exit 1'), { stderr: 'claude: not logged in' });
      const thrownError = await generateDsuSummary([
        { title: 'Fix login bug', commitSubjects: ['fix: handle empty input'] },
      ]).catch((err) => err);
      expect(thrownError).toBeInstanceOf(DsuCommandError);
      expect(thrownError.stderr).toBe('claude: not logged in');
    });
  });
});
