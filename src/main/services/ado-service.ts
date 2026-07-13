import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AdoWorkItem } from '../../shared/ipc-channels';

const execFileAsync = promisify(execFile);

const DEFAULT_ADO_EMAIL = 'paulo.rodriguez@fefundinfo.com';
// Deliberately stricter than a general-purpose email validator: this value is
// interpolated into a WIQL string literal (`[System.AssignedTo] = '<email>'`),
// so any character that could break out of that literal — notably a single
// quote — must be rejected rather than merely escaped.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export class AdoCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'AdoCommandError';
    this.stderr = stderr;
  }
}

async function runAz(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('az', args);
    return stdout;
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new AdoCommandError(`az ${args.join(' ')} failed`, stderr);
  }
}

export async function assertAdoAuthenticated(): Promise<void> {
  try {
    await execFileAsync('az', ['devops', 'project', 'list', '--query', 'value[0].name', '-o', 'tsv']);
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new AdoCommandError('Azure DevOps not authenticated — run /ado-login to sign in.', stderr);
  }
}

export async function getAdoConfig(): Promise<{ organization: string; project: string }> {
  const out = await runAz(['devops', 'configure', '--list']);
  const organization = /^organization\s*=\s*(.+)$/m.exec(out)?.[1]?.trim() ?? '';
  const project = /^project\s*=\s*(.+)$/m.exec(out)?.[1]?.trim() ?? '';
  return { organization, project };
}

export async function listMyAssignedTasks(email: string = DEFAULT_ADO_EMAIL): Promise<AdoWorkItem[]> {
  if (!EMAIL_RE.test(email)) {
    throw new AdoCommandError(`Invalid ADO email: ${email}`, '');
  }
  const wiql =
    `SELECT [System.Id], [System.Title], [System.WorkItemType], [System.State], [System.AreaPath], ` +
    `[Microsoft.VSTS.Scheduling.StoryPoints] FROM WorkItems WHERE [System.AssignedTo] = '${email}' ` +
    `AND [System.State] NOT IN ('Closed', 'Resolved', 'Done', 'Removed') ORDER BY [System.ChangedDate] DESC`;
  const stdout = await runAz(['boards', 'query', '--wiql', wiql, '-o', 'json']);
  const rows = JSON.parse(stdout) as Array<{ id: number; fields: Record<string, unknown> }>;
  return rows.map((row) => ({
    id: row.id,
    title: String(row.fields['System.Title'] ?? ''),
    type: String(row.fields['System.WorkItemType'] ?? ''),
    state: String(row.fields['System.State'] ?? ''),
    areaPath: String(row.fields['System.AreaPath'] ?? ''),
    storyPoints:
      typeof row.fields['Microsoft.VSTS.Scheduling.StoryPoints'] === 'number'
        ? (row.fields['Microsoft.VSTS.Scheduling.StoryPoints'] as number)
        : undefined,
  }));
}
