import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: EventEmitter & { write: (chunk: string) => void; end: () => void };
  stdinWrites: string[];
}

function makeFakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  const stdinWrites: string[] = [];
  const stdin = new EventEmitter() as FakeChild['stdin'];
  stdin.write = (chunk: string) => {
    stdinWrites.push(chunk.toString());
  };
  stdin.end = () => {};
  child.stdin = stdin;
  child.stdinWrites = stdinWrites;
  return child;
}

import { buildDsuPrompt, generateDsuSummary, DsuCommandError } from './dsu-service';
import type { BranchCommitSummary } from './dsu-service';

describe('dsu-service', () => {
  beforeEach(() => {
    spawnMock.mockReset();
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
      expect(spawnMock).not.toHaveBeenCalled();
    });

    it('spawns claude with slash commands disabled and feeds the prompt over stdin, not the command line', async () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);
      const branchSummaries: BranchCommitSummary[] = [
        { repoName: 'demo', branch: 'task/fix-login-bug', commitSubjects: ['fix: handle empty input'] },
      ];

      const promise = generateDsuSummary(branchSummaries, '2026-07-08');
      child.stdout.emit('data', Buffer.from('- Fixed the login bug\n'));
      child.emit('close', 0);
      const result = await promise;

      expect(spawnMock).toHaveBeenCalledWith(
        'cmd.exe',
        ['/c', 'claude', '-p', '--disable-slash-commands'],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      // The multi-line prompt must never be an argv entry (cmd.exe truncates it);
      // it is written to stdin verbatim instead.
      expect(spawnMock.mock.calls[0]?.[1]).not.toContain(buildDsuPrompt(branchSummaries, '2026-07-08'));
      expect(child.stdinWrites.join('')).toBe(buildDsuPrompt(branchSummaries, '2026-07-08'));
      expect(result).toBe('- Fixed the login bug');
    });

    it('wraps a non-zero claude exit in DsuCommandError with the real stderr', async () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = generateDsuSummary(
        [{ repoName: 'demo', branch: 'task/x', commitSubjects: ['fix: y'] }],
        '2026-07-08',
      );
      child.stderr.emit('data', Buffer.from('claude: not logged in'));
      child.emit('close', 1);
      const thrownError = await promise.catch((err) => err);

      expect(thrownError).toBeInstanceOf(DsuCommandError);
      expect(thrownError.stderr).toBe('claude: not logged in');
    });

    it('wraps a spawn failure in DsuCommandError', async () => {
      const child = makeFakeChild();
      spawnMock.mockReturnValue(child);

      const promise = generateDsuSummary(
        [{ repoName: 'demo', branch: 'task/x', commitSubjects: ['fix: y'] }],
        '2026-07-08',
      );
      child.emit('error', new Error('spawn cmd.exe ENOENT'));
      const thrownError = await promise.catch((err) => err);

      expect(thrownError).toBeInstanceOf(DsuCommandError);
      expect(thrownError.stderr).toBe('spawn cmd.exe ENOENT');
    });
  });
});
