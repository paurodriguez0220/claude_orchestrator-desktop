import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { TaskNotes, TaskStatus, TaskKind } from '../../shared/types';

export function serializeTaskNotes(notes: TaskNotes): string {
  const lines = ['---', `title: ${notes.frontmatter.title}`];
  if (notes.frontmatter.adoId) {
    lines.push(`adoId: ${notes.frontmatter.adoId}`);
  }
  if (notes.frontmatter.branch !== undefined) {
    lines.push(`branch: ${notes.frontmatter.branch}`);
  }
  lines.push(`worktreePath: ${notes.frontmatter.worktreePath}`);
  lines.push(`status: ${notes.frontmatter.status}`);
  lines.push(`kind: ${notes.frontmatter.kind}`);
  lines.push('---', '', notes.body);
  return lines.join('\n');
}

export function parseTaskNotes(raw: string): TaskNotes {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!match || match.length < 3) {
    throw new Error('Invalid task notes format: missing frontmatter');
  }
  const frontmatterBlock = match[1]!;
  const body = match[2]!;
  const fields: Record<string, string> = {};
  for (const line of frontmatterBlock.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    fields[key] = value;
  }
  return {
    frontmatter: {
      title: fields.title ?? '',
      adoId: fields.adoId,
      branch: fields.branch,
      worktreePath: fields.worktreePath ?? '',
      status: (fields.status as TaskStatus) ?? 'todo',
      kind: (fields.kind as TaskKind) ?? 'worktree',
    },
    body: body.trim(),
  };
}

export async function readTaskNotes(path: string): Promise<TaskNotes> {
  const raw = await readFile(path, 'utf-8');
  return parseTaskNotes(raw);
}

export async function writeTaskNotes(path: string, notes: TaskNotes): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeTaskNotes(notes), 'utf-8');
}

export async function archiveTaskNotes(path: string): Promise<void> {
  const archivedPath = path.replace(/\.md$/, `.archived-${Date.now()}.md`);
  await rename(path, archivedPath);
}
