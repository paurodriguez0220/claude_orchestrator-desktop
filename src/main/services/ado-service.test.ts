import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockError: { stderr?: string } | null = null;

const execFileMock = vi.fn();
const writeFileMock = vi.fn(async (_path: string, _data: string) => undefined);
const rmMock = vi.fn(async (_path: string, _options?: unknown) => undefined);

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

vi.mock('node:fs/promises', () => ({
  writeFile: (path: string, data: string) => writeFileMock(path, data),
  rm: (path: string, options?: unknown) => rmMock(path, options),
}));

import {
  assertAdoAuthenticated,
  getAdoConfig,
  listMyAssignedTasks,
  createWorkItem,
  AdoCommandError,
} from './ado-service';

function jsonResult(value: unknown): { stdout: string; stderr: string } {
  return { stdout: JSON.stringify(value), stderr: '' };
}

const CONFIG_RESULT = { stdout: 'organization = myorg\nproject      = MyProject\n', stderr: '' };

describe('ado-service', () => {
  beforeEach(() => {
    execFileMock.mockReset();
    writeFileMock.mockClear();
    rmMock.mockClear();
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

  describe('createWorkItem', () => {
    it('creates a basic work item and returns its id + edit url', async () => {
      execFileMock
        .mockReturnValueOnce(CONFIG_RESULT)
        .mockReturnValueOnce(jsonResult({ id: 501 }))
        .mockReturnValueOnce(jsonResult({ fields: {} }));

      const result = await createWorkItem({ type: 'Task', title: 'T' });

      expect(result).toEqual({ id: 501, url: 'https://dev.azure.com/myorg/MyProject/_workitems/edit/501' });

      const createCall = execFileMock.mock.calls[1] as unknown[];
      expect(createCall[0]).toBe('az');
      expect(createCall[1]).toEqual(['boards', 'work-item', 'create', '--type', 'Task', '--title', 'T', '-o', 'json']);
    });

    it('sets a large description via az rest PATCH with a body file, not inline', async () => {
      execFileMock
        .mockReturnValueOnce(CONFIG_RESULT)
        .mockReturnValueOnce(jsonResult({ id: 502 }))
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce(jsonResult({ fields: { 'System.Description': 'Some long description' } }));

      await createWorkItem({ type: 'Task', title: 'T', description: 'Some long description' });

      const createCall = execFileMock.mock.calls[1] as unknown[];
      const createArgs = createCall[1] as string[];
      expect(createArgs.join(' ')).not.toContain('description');
      expect(createArgs).not.toContain('--description');

      const restCall = execFileMock.mock.calls[2] as unknown[];
      const restArgs = restCall[1] as string[];
      expect(restArgs).toContain('--method');
      expect(restArgs[restArgs.indexOf('--method') + 1]).toBe('PATCH');
      expect(restArgs).toContain('--resource');
      expect(restArgs[restArgs.indexOf('--resource') + 1]).toBe('499b84ac-1321-427f-aa17-267ca6975798');
      const bodyArg = restArgs.find((arg) => arg.startsWith('@'));
      expect(bodyArg).toBeDefined();

      expect(writeFileMock).toHaveBeenCalledOnce();
      const writtenContent = writeFileMock.mock.calls[0]?.[1] as string;
      const patch = JSON.parse(writtenContent) as Array<{ op: string; path: string; value: string }>;
      expect(patch).toEqual([{ op: 'add', path: '/fields/System.Description', value: 'Some long description' }]);

      expect(rmMock).toHaveBeenCalledOnce();
    });

    it('copies parent fields and adds a parent relation when parentId is given', async () => {
      execFileMock
        .mockReturnValueOnce(CONFIG_RESULT)
        .mockReturnValueOnce(jsonResult({ id: 503 }))
        .mockReturnValueOnce(
          jsonResult({
            fields: {
              'System.AssignedTo': { uniqueName: 'x@y.com' },
              'Microsoft.VSTS.Common.Priority': 2,
              'Custom.EffortType': 'Story',
              'System.AreaPath': 'Proj\\Team',
              'System.IterationPath': 'Proj\\Sprint 1',
            },
          }),
        )
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce(jsonResult({ fields: {} }));

      await createWorkItem({ type: 'Task', title: 'Child', parentId: 999 });

      const allArgs = execFileMock.mock.calls.map((call) => (call as unknown[])[1] as string[]);

      const showParentCall = allArgs[2];
      expect(showParentCall).toEqual(['boards', 'work-item', 'show', '--id', '999', '-o', 'json']);

      const updateCalls = allArgs.filter((args) => args[2] === 'update');
      expect(updateCalls).toContainEqual([
        'boards', 'work-item', 'update', '--id', '503', '--fields', 'System.AssignedTo=x@y.com',
      ]);
      expect(updateCalls).toContainEqual([
        'boards', 'work-item', 'update', '--id', '503', '--fields', 'Microsoft.VSTS.Common.Priority=2',
      ]);
      expect(updateCalls).toContainEqual([
        'boards', 'work-item', 'update', '--id', '503', '--fields', 'Custom.EffortType=Story',
      ]);
      expect(updateCalls).toContainEqual([
        'boards', 'work-item', 'update', '--id', '503', '--fields', 'System.AreaPath=Proj\\Team',
      ]);
      expect(updateCalls).toContainEqual([
        'boards', 'work-item', 'update', '--id', '503', '--fields', 'System.IterationPath=Proj\\Sprint 1',
      ]);

      const relationCall = allArgs.find((args) => args[2] === 'relation');
      expect(relationCall).toEqual([
        'boards', 'work-item', 'relation', 'add', '--id', '503', '--relation-type', 'parent', '--target-id', '999',
      ]);
    });

    it('rejects with an AdoCommandError mentioning verification when the description did not persist', async () => {
      execFileMock
        .mockReturnValueOnce(CONFIG_RESULT)
        .mockReturnValueOnce(jsonResult({ id: 504 }))
        .mockReturnValueOnce({ stdout: '', stderr: '' })
        .mockReturnValueOnce(jsonResult({ fields: { 'System.Description': '' } }));

      await expect(createWorkItem({ type: 'Task', title: 'T', description: 'desc' })).rejects.toMatchObject({
        name: 'AdoCommandError',
        message: expect.stringContaining('verif'),
      });
    });

    it('rejects with an AdoCommandError mentioning verification when the assignee did not persist', async () => {
      execFileMock
        .mockReturnValueOnce(CONFIG_RESULT)
        .mockReturnValueOnce(jsonResult({ id: 505 }))
        .mockReturnValueOnce(jsonResult({ fields: {} }));

      await expect(
        createWorkItem({ type: 'Task', title: 'T', assignee: 'x@y.com' }),
      ).rejects.toMatchObject({
        name: 'AdoCommandError',
        message: expect.stringContaining('verif'),
      });
    });

    it('passes an explicit assignee via --assigned-to on create', async () => {
      execFileMock
        .mockReturnValueOnce(CONFIG_RESULT)
        .mockReturnValueOnce(jsonResult({ id: 506 }))
        .mockReturnValueOnce(jsonResult({ fields: { 'System.AssignedTo': { uniqueName: 'x@y.com' } } }));

      await createWorkItem({ type: 'Task', title: 'T', assignee: 'x@y.com' });

      const createCall = execFileMock.mock.calls[1] as unknown[];
      const createArgs = createCall[1] as string[];
      expect(createArgs).toContain('--assigned-to');
      expect(createArgs[createArgs.indexOf('--assigned-to') + 1]).toBe('x@y.com');
    });
  });
});
