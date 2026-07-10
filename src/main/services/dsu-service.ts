import { spawn } from 'node:child_process';

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
    'Use ONLY the commit subjects listed below. Do not run any commands, tools, or skills,',
    'and do not access Azure DevOps / ADO or any external task tracker — the branches and',
    'commits below are the complete and only source for this summary.',
    'Do not invent information beyond what the commit subjects imply.',
    '',
    sections,
  ].join('\n');
}

// Runs `claude -p` and returns its stdout. The prompt is fed over STDIN rather
// than as a command-line argument on purpose: it is a multi-line string, and
// `cmd.exe` mangles/truncates multi-line argv — it dropped everything after the
// first line (the branch data and instructions) plus any trailing flags. The
// truncated first line ("prepare a daily stand-up") then made claude reach for
// the user-level `ado-my-tasks` slash command, which runs `az` and stalls on a
// non-interactive permission prompt. Feeding the prompt via stdin keeps it
// intact; `--disable-slash-commands` (a simple, safe-on-the-command-line flag)
// additionally guarantees no skill/slash command can run at all.
function runClaudePrint(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', 'claude', '-p', '--disable-slash-commands'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (err: Error) => {
      reject(new DsuCommandError('claude -p failed to generate the work log', err.message));
    });
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new DsuCommandError('claude -p failed to generate the work log', stderr));
      }
    });
    // A failed spawn surfaces via the 'error' event above; swallow the stdin
    // EPIPE so it doesn't become an unhandled error.
    child.stdin.on('error', () => {});
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

export async function generateDsuSummary(
  branchSummaries: BranchCommitSummary[],
  dateStamp: string,
): Promise<string> {
  if (branchSummaries.length === 0) {
    return `No commits on ${dateStamp}.`;
  }
  return runClaudePrint(buildDsuPrompt(branchSummaries, dateStamp));
}
