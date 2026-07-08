import { readdir, readFile, mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { getTaskTranscriptPath } from '../paths';
import { listAliveSessions } from './pty-manager';

interface TranscriptUserMessage {
  type: 'user';
  message: { role: 'user'; content: string };
}

interface TranscriptAssistantContentBlock {
  type: string;
  text?: string;
}

interface TranscriptAssistantMessage {
  type: 'assistant';
  message: { role: 'assistant'; content: TranscriptAssistantContentBlock[] };
}

function isUserEntry(entry: unknown): entry is TranscriptUserMessage {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as { type?: unknown; message?: { content?: unknown } };
  return candidate.type === 'user' && typeof candidate.message?.content === 'string';
}

function isAssistantEntry(entry: unknown): entry is TranscriptAssistantMessage {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const candidate = entry as { type?: unknown; message?: { content?: unknown } };
  return candidate.type === 'assistant' && Array.isArray(candidate.message?.content);
}

export function encodeProjectDirName(cwd: string): string {
  return cwd.replace(/[\\:.\/]/g, '-');
}

export async function findLatestTranscriptFile(cwd: string): Promise<string | undefined> {
  const projectDir = join(homedir(), '.claude', 'projects', encodeProjectDirName(cwd));
  let entries: string[];
  try {
    entries = await readdir(projectDir);
  } catch {
    return undefined;
  }
  const jsonlFiles = entries.filter((name) => name.endsWith('.jsonl'));
  if (jsonlFiles.length === 0) {
    return undefined;
  }
  const withMtimes = await Promise.all(
    jsonlFiles.map(async (name) => {
      const filePath = join(projectDir, name);
      const stats = await stat(filePath);
      return { filePath, mtimeMs: stats.mtimeMs };
    }),
  );
  withMtimes.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return withMtimes[0]?.filePath;
}

export function parseTranscriptToMarkdown(jsonlContent: string): string {
  let markdown = '';
  for (const line of jsonlContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isUserEntry(entry)) {
      markdown += `### You\n\n${entry.message.content}\n\n`;
    } else if (isAssistantEntry(entry)) {
      const text = entry.message.content
        .filter((block) => block.type === 'text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n\n');
      if (text !== '') {
        markdown += `### Claude\n\n${text}\n\n`;
      }
    }
  }
  return markdown;
}

export async function exportTranscript(cwd: string, outputPath: string): Promise<void> {
  const transcriptFile = await findLatestTranscriptFile(cwd);
  if (transcriptFile === undefined) {
    return;
  }
  const raw = await readFile(transcriptFile, 'utf-8');
  const markdown = parseTranscriptToMarkdown(raw);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf-8');
}

export function startTranscriptExportScheduler(intervalMs: number): void {
  setInterval(() => {
    for (const { taskId, cwd } of listAliveSessions()) {
      void exportTranscript(cwd, getTaskTranscriptPath(taskId)).catch((err) => {
        console.error(`Failed to export transcript for task ${taskId}:`, err);
      });
    }
  }, intervalMs);
}
