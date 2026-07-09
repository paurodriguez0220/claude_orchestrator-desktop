import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const NO_COMMITS_MESSAGE = 'No commits since the last working day.';

export class DsuCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'DsuCommandError';
    this.stderr = stderr;
  }
}

export interface TaskCommitSummary {
  title: string;
  commitSubjects: string[];
}

export function buildDsuPrompt(taskSummaries: TaskCommitSummary[]): string {
  const sections = taskSummaries
    .map(
      (task) => `## ${task.title}\n${task.commitSubjects.map((subject) => `- ${subject}`).join('\n')}`,
    )
    .join('\n\n');
  return [
    'You are helping prepare a daily stand-up update.',
    'Below is a list of tasks and the git commit subjects completed on each since the last working day.',
    'Write a concise, stand-up-style summary describing what was done, organized task by task.',
    'Do not invent information beyond what the commit subjects imply.',
    '',
    sections,
  ].join('\n');
}

export async function generateDsuSummary(taskSummaries: TaskCommitSummary[]): Promise<string> {
  if (taskSummaries.length === 0) {
    return NO_COMMITS_MESSAGE;
  }
  const prompt = buildDsuPrompt(taskSummaries);
  try {
    const { stdout } = await execFileAsync('cmd.exe', ['/c', 'claude', '-p', prompt], undefined);
    return stdout.toString().trim();
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new DsuCommandError('claude -p failed to generate the DSU summary', stderr);
  }
}
