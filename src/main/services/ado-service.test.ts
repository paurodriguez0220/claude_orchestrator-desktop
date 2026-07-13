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

import { assertAdoAuthenticated, getAdoConfig, listMyAssignedTasks, AdoCommandError } from './ado-service';

describe('ado-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    mockError = null;
  });

  describe('listMyAssignedTasks', () => {
    it('maps az boards query JSON output into AdoWorkItem[]', async () => {
      const wiqlJson = JSON.stringify([
        {
          id: 101,
          fields: {
            'System.Title': 'Fix login',
            'System.WorkItemType': 'Bug',
            'System.State': 'Active',
            'System.AreaPath': 'Proj\\Team',
            'Microsoft.VSTS.Scheduling.StoryPoints': 3,
          },
        },
      ]);
      execFileMock.mockReturnValue({ stdout: wiqlJson, stderr: '' });

      const result = await listMyAssignedTasks('paulo.rodriguez@fefundinfo.com');

      expect(result).toEqual([
        { id: 101, title: 'Fix login', type: 'Bug', state: 'Active', areaPath: 'Proj\\Team', storyPoints: 3 },
      ]);

      const callArgs = execFileMock.mock.calls[0] as unknown[];
      expect(callArgs[0]).toBe('az');
      const args = callArgs[1] as string[];
      const wiql = args[3];
      expect(wiql).toContain("[System.AssignedTo] = 'paulo.rodriguez@fefundinfo.com'");
      expect(wiql).toContain("[System.State] NOT IN ('Closed', 'Resolved', 'Done', 'Removed')");
      expect(args).toEqual(['boards', 'query', '--wiql', wiql, '-o', 'json']);
    });

    it('rejects with an AdoCommandError mentioning invalid email, without calling execFile', async () => {
      await expect(listMyAssignedTasks('bad email!')).rejects.toMatchObject({
        name: 'AdoCommandError',
        message: expect.stringContaining('Invalid'),
      });
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('rejects an email containing a single quote (WIQL injection guard), without calling execFile', async () => {
      await expect(listMyAssignedTasks("x'y@z.com")).rejects.toMatchObject({
        name: 'AdoCommandError',
        message: expect.stringContaining('Invalid'),
      });
      expect(execFileMock).not.toHaveBeenCalled();
    });

    it('yields storyPoints: undefined when the field is missing', async () => {
      const wiqlJson = JSON.stringify([
        {
          id: 202,
          fields: {
            'System.Title': 'No story points',
            'System.WorkItemType': 'Task',
            'System.State': 'New',
            'System.AreaPath': 'Proj\\Team',
          },
        },
      ]);
      execFileMock.mockReturnValue({ stdout: wiqlJson, stderr: '' });

      const result = await listMyAssignedTasks('paulo.rodriguez@fefundinfo.com');

      expect(result).toEqual([
        { id: 202, title: 'No story points', type: 'Task', state: 'New', areaPath: 'Proj\\Team', storyPoints: undefined },
      ]);
    });

    it('defaults to the default ADO email when none is given', async () => {
      execFileMock.mockReturnValue({ stdout: '[]', stderr: '' });
      await listMyAssignedTasks();
      const callArgs = execFileMock.mock.calls[0] as unknown[];
      const args = callArgs[1] as string[];
      expect(args[3]).toContain('paulo.rodriguez@fefundinfo.com');
    });
  });

  describe('assertAdoAuthenticated', () => {
    it('rejects with an AdoCommandError mentioning /ado-login when az fails', async () => {
      mockError = { stderr: 'ERROR: Please run "az login"' };

      const thrownError = await assertAdoAuthenticated().catch((err) => err);

      expect(thrownError).toBeInstanceOf(AdoCommandError);
      expect(thrownError.message).toContain('/ado-login');
    });

    it('resolves when az devops project list succeeds', async () => {
      execFileMock.mockReturnValue({ stdout: 'MyProject', stderr: '' });
      await expect(assertAdoAuthenticated()).resolves.toBeUndefined();
    });
  });

  describe('getAdoConfig', () => {
    it('parses organization and project out of az devops configure --list', async () => {
      execFileMock.mockReturnValue({
        stdout: 'organization = https://dev.azure.com/myorg\nproject      = MyProject\n',
        stderr: '',
      });

      const result = await getAdoConfig();

      expect(result).toEqual({ organization: 'https://dev.azure.com/myorg', project: 'MyProject' });
    });
  });
});
