import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import type { AdoWorkItem, AdoCreateWorkItemRequest, AdoCreateWorkItemResult } from '../../shared/ipc-channels';

const execFileAsync = promisify(execFile);

// The Azure DevOps "app id" resource that `az rest` must target to reuse the
// CLI's own AAD session when calling the REST API directly (required for the
// description PATCH, which the `az boards` subcommands can't express).
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798';

// Fields copied from a parent work item onto a newly created child so it
// isn't left unassigned/unscheduled — a known `az boards work-item create`
// gap: it never inherits any field from --parent.
const PARENT_COPY_FIELDS = [
  'System.AssignedTo',
  'Microsoft.VSTS.Common.Priority',
  'Custom.EffortType',
  'System.AreaPath',
  'System.IterationPath',
] as const;

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

async function showWorkItem(id: number): Promise<{ fields: Record<string, unknown> }> {
  const out = await runAz(['boards', 'work-item', 'show', '--id', String(id), '-o', 'json']);
  return JSON.parse(out) as { fields: Record<string, unknown> };
}

function fieldValueToString(value: unknown): string {
  if (typeof value === 'object' && value !== null && 'uniqueName' in (value as Record<string, unknown>)) {
    return String((value as { uniqueName: unknown }).uniqueName);
  }
  return String(value);
}

export async function createWorkItem(request: AdoCreateWorkItemRequest): Promise<AdoCreateWorkItemResult> {
  const { organization, project } = await getAdoConfig();

  const createArgs = ['boards', 'work-item', 'create', '--type', request.type, '--title', request.title];
  if (request.assignee) {
    createArgs.push('--assigned-to', request.assignee);
  }
  createArgs.push('-o', 'json');
  const created = JSON.parse(await runAz(createArgs)) as { id: number };
  const id = created.id;

  if (request.parentId !== undefined) {
    const parent = await showWorkItem(request.parentId);
    for (const field of PARENT_COPY_FIELDS) {
      const value = parent.fields[field];
      if (value !== undefined && value !== null && String(value) !== '') {
        await runAz([
          'boards', 'work-item', 'update', '--id', String(id), '--fields', `${field}=${fieldValueToString(value)}`,
        ]);
      }
    }
    await runAz([
      'boards', 'work-item', 'relation', 'add',
      '--id', String(id),
      '--relation-type', 'parent',
      '--target-id', String(request.parentId),
    ]);
  }

  if (request.description) {
    // Large descriptions silently get dropped when passed inline on Windows
    // (the ~8 KB command-line limit truncates the argv before `az` ever sees
    // it), so the description is always patched via a body file instead.
    const patch = [{ op: 'add', path: '/fields/System.Description', value: request.description }];
    const bodyFile = join(tmpdir(), `ado-patch-${randomUUID()}.json`);
    await writeFile(bodyFile, JSON.stringify(patch), 'utf8');
    try {
      await runAz([
        'rest', '--method', 'PATCH',
        '--uri', `https://dev.azure.com/${organization}/_apis/wit/workitems/${id}?api-version=7.1`,
        '--resource', ADO_RESOURCE,
        '--headers', 'Content-Type=application/json-patch+json',
        '--body', `@${bodyFile}`,
      ]);
    } finally {
      await rm(bodyFile, { force: true });
    }
  }

  const check = await showWorkItem(id);
  if (request.description && String(check.fields['System.Description'] ?? '') === '') {
    throw new AdoCommandError(`Work item ${id} created but description did not persist — verify in ADO.`, '');
  }
  if (request.assignee && !check.fields['System.AssignedTo']) {
    throw new AdoCommandError(`Work item ${id} created but assignee did not persist — verify in ADO.`, '');
  }

  return { id, url: `https://dev.azure.com/${organization}/${project}/_workitems/edit/${id}` };
}
