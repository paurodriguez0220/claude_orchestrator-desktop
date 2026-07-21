import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

// The canonical tasks.md the "Sync to ADO" button reads. Embedded here (not read
// from docs/templates/tasks.md) because only out/** is packaged into the app — a
// runtime read of the docs folder would fail in the installed build. Keep this in
// step with docs/templates/tasks.md if either changes.
function renderTasksMd(adoParentId: string): string {
  return `---
adoParent: ${adoParentId}
---

# <Feature title>

<!--
This is the canonical tasks.md template. A brainstorm fills it in; the
"Sync to ADO" button reads it and creates/updates child work items under
the parent above.

Rules the parser enforces (see
docs/superpowers/specs/2026-07-16-ado-tasks-md-template-parser-design.md):

- \`adoParent\` (frontmatter): the parent work item id all children hang under.
- The first \`#\` heading and any prose are context only — never synced.
- Each \`- [ ] (Type) Title\` line under "## Work items" is one work item.
  \`(Type)\` -> ADO work-item type (Task, Bug, User Story, ...).
- An indented \`> ...\` blockquote under an item -> its ADO description.
- A trailing \`#<id>\` means the item already exists in ADO: sync updates it
  instead of creating a duplicate, and appends the id itself after creating.
  Do not add \`#<id>\` by hand.
- The checkbox ([ ] / [x]) is a human "done" marker; it does not drive sync.
-->

One-paragraph summary of the feature (context for humans; not pushed to ADO).

## Work items

- [ ] (Task) First task title
  > Optional description that becomes the ADO work item's Description field.
`;
}

// Heading that marks the convention note appended to a worktree's CLAUDE.md, used
// both to render the note and to detect it so a re-seed never duplicates it.
const CLAUDE_NOTE_HEADING = '## ADO tasks';
const CLAUDE_NOTE = `${CLAUDE_NOTE_HEADING}

Track ADO work items in \`tasks.md\` at the worktree root — append to it; do not
rename or relocate it. The "Sync to ADO" button reads exactly that file.
`;

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

// Seeds a worktree with the canonical tasks.md so the Sync-to-ADO button has a
// file to read, and nudges the agent (via CLAUDE.md) to use it. Called when a
// worktree becomes ADO-linked. Idempotent and best-effort:
//
// - No worktree folder yet -> skip silently (returns false); a later link retries.
// - tasks.md already present -> leave it untouched (returns false).
// - Otherwise -> write tasks.md with adoParent pre-filled, and append a one-line
//   convention note to CLAUDE.md if that file exists (never creating one).
//
// Returns whether it seeded a new tasks.md.
export async function seedTasksMd(worktreePath: string, adoParentId: string): Promise<boolean> {
  try {
    const info = await stat(worktreePath);
    if (!info.isDirectory()) {
      return false;
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw err;
  }

  const tasksPath = join(worktreePath, 'tasks.md');
  if ((await readFileOrNull(tasksPath)) !== null) {
    return false;
  }

  await writeFile(tasksPath, renderTasksMd(adoParentId), 'utf-8');

  const claudePath = join(worktreePath, 'CLAUDE.md');
  const claude = await readFileOrNull(claudePath);
  if (claude !== null && !claude.includes(CLAUDE_NOTE_HEADING)) {
    const separator = claude.endsWith('\n') ? '\n' : '\n\n';
    await writeFile(claudePath, `${claude}${separator}${CLAUDE_NOTE}`, 'utf-8');
  }

  return true;
}
