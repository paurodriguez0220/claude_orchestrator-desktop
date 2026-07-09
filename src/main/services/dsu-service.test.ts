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
import type { BranchCommitSummary } from './dsu-service';

describe('dsu-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  describe('buildDsuPrompt', () => {
    it('lists each repo/branch pair as a heading with its commit subjects as bullets, and names the date', () => {
      const branchSummaries: BranchCommitSummary[] = [
        { repoName: 'demo', branch: 'task/fix-login-bug', commitSubjects: ['fix: handle empty input'] },
      ];
      const prompt = buildDsuPrompt(branchSummaries, '2026-07-08');
      expect(prompt).toContain('## demo / task/fix-login-bug');
      expect(prompt).toContain('- fix: handle empty input');
      expect(prompt).toContain('2026-07-08');
    });
  });

  describe('generateDsuSummary', () => {
    it('returns a dated no-commits message without shelling out when there are no branch summaries', async () => {
      const result = await generateDsuSummary([], '2026-07-08');
      expect(result).toBe('No commits on 2026-07-08.');
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('invokes claude -p non-interactively with the prompt as a discrete argument', async () => {
      execFileMock.mockReturnValue({ stdout: '- Fixed the login bug\n', stderr: '' });
      const branchSummaries: BranchCommitSummary[] = [
        { repoName: 'demo', branch: 'task/fix-login-bug', commitSubjects: ['fix: handle empty input'] },
      ];
      const result = await generateDsuSummary(branchSummaries, '2026-07-08');
      expect(execFileMock).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '-p', buildDsuPrompt(branchSummaries, '2026-07-08')],
        undefined,
      );
      expect(result).toBe('- Fixed the login bug');
    });

    it('wraps a failing claude invocation in DsuCommandError with the real stderr', async () => {
      mockError = Object.assign(new Error('exit 1'), { stderr: 'claude: not logged in' });
      const thrownError = await generateDsuSummary(
        [{ repoName: 'demo', branch: 'task/x', commitSubjects: ['fix: y'] }],
        '2026-07-08',
      ).catch((err) => err);
      expect(thrownError).toBeInstanceOf(DsuCommandError);
      expect(thrownError.stderr).toBe('claude: not logged in');
    });
  });
});
