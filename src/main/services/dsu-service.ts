import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class DsuCommandError extends Error {
  public readonly stderr: string;

  constructor(message: string, stderr: string) {
    super(message);
    this.name = 'DsuCommandError';
    this.stderr = stderr;
  }
}

export interface BranchCommitSummary {
  repoName: string;
  branch: string;
  commitSubjects: string[];
}

export function buildDsuPrompt(branchSummaries: BranchCommitSummary[], dateStamp: string): string {
  const sections = branchSummaries
    .map(
      (summary) =>
        `## ${summary.repoName} / ${summary.branch}\n${summary.commitSubjects.map((subject) => `- ${subject}`).join('\n')}`,
    )
    .join('\n\n');
  return [
    'You are helping prepare a daily stand-up update.',
    `Below is a list of git branches worked on during ${dateStamp} and the commit subjects made on each.`,
    'Write a concise, stand-up-style summary describing what was done, organized branch by branch.',
    'Do not invent information beyond what the commit subjects imply.',
    '',
    sections,
  ].join('\n');
}

export async function generateDsuSummary(
  branchSummaries: BranchCommitSummary[],
  dateStamp: string,
): Promise<string> {
  if (branchSummaries.length === 0) {
    return `No commits on ${dateStamp}.`;
  }
  const prompt = buildDsuPrompt(branchSummaries, dateStamp);
  try {
    const { stdout } = await execFileAsync('cmd.exe', ['/c', 'claude', '-p', prompt], undefined);
    return stdout.toString().trim();
  } catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? String(err);
    throw new DsuCommandError('claude -p failed to generate the DSU summary', stderr);
  }
}
