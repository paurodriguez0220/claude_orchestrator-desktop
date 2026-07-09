import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DsuGenerateResponse } from '../../shared/ipc-channels';
import { dateStampToRange, toDateStamp } from '../../shared/dates';
import { readStore } from './store';
import { listBranches, getBranchCommitsInRange } from './git-service';
import type { BranchCommit } from './git-service';
import { generateDsuSummary } from './dsu-service';
import type { BranchCommitSummary } from './dsu-service';
import { getStorePath, getDsuSummaryPath } from '../paths';

const DEFAULT_BRANCH_NAMES = new Set(['master', 'main']);

// The default branch goes last so commits merged into it the same day stay
// attributed to the feature branch they were made on — each commit hash
// belongs to the first branch that lists it.
export function orderBranchesDefaultLast(branches: string[]): string[] {
  const regular = branches.filter((branch) => !DEFAULT_BRANCH_NAMES.has(branch));
  const defaults = branches.filter((branch) => DEFAULT_BRANCH_NAMES.has(branch));
  return [...regular, ...defaults];
}

export async function generateAndSaveDsu(dateStamp: string): Promise<DsuGenerateResponse> {
  const store = await readStore(getStorePath());
  const { from, to } = dateStampToRange(dateStamp);

  const branchSummaries: BranchCommitSummary[] = [];
  for (const repo of store.repos) {
    let local: string[];
    try {
      ({ local } = await listBranches(repo.path));
    } catch {
      continue;
    }
    const seenHashes = new Set<string>();
    for (const branch of orderBranchesDefaultLast(local)) {
      let commits: BranchCommit[];
      try {
        commits = await getBranchCommitsInRange(repo.path, branch, from, to);
      } catch {
        continue;
      }
      const fresh = commits.filter((commit) => !seenHashes.has(commit.hash));
      for (const commit of fresh) {
        seenHashes.add(commit.hash);
      }
      if (fresh.length > 0) {
        branchSummaries.push({
          repoName: repo.name,
          branch,
          commitSubjects: fresh.map((commit) => commit.subject),
        });
      }
    }
  }

  const markdown = await generateDsuSummary(branchSummaries, dateStamp);
  const filePath = getDsuSummaryPath(dateStamp);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, markdown, 'utf-8');
  return { markdown, filePath };
}

let activeRun: Promise<void> | null = null;
let hasQueuedRun = false;

// Closing a tab must never wait on (or fail because of) a DSU run —
// production callers `void` the returned promise. Back-to-back closes
// coalesce: one run at a time, at most one queued follow-up to pick up the
// latest state. The promise resolves once the coalesced chain drains and
// never rejects (failures are logged), which is what makes this testable.
export function queueDsuAutoRegenerate(
  runGeneration: (dateStamp: string) => Promise<DsuGenerateResponse> = generateAndSaveDsu,
): Promise<void> {
  if (activeRun) {
    hasQueuedRun = true;
    return activeRun;
  }
  activeRun = (async () => {
    do {
      hasQueuedRun = false;
      try {
        await runGeneration(toDateStamp(new Date()));
      } catch (err) {
        console.error('DSU auto-regenerate failed', err);
      }
    } while (hasQueuedRun);
    activeRun = null;
  })();
  return activeRun;
}
