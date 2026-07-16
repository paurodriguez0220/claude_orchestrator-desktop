import type { ParsedTasks, ParsedWorkItem } from '../../shared/types';

// Splits an optional leading `---` frontmatter block off the top of the file,
// returning the raw key/value fields and the remaining body. Mirrors the
// lightweight approach in notes-service rather than pulling in a YAML dependency.
function splitFrontmatter(content: string): { fields: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(content);
  if (!match) {
    return { fields: {}, body: content };
  }
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    fields[line.slice(0, separatorIndex).trim()] = line.slice(separatorIndex + 1).trim();
  }
  return { fields, body: match[2]! };
}

const ITEM_RE = /^-\s*\[( |x|X)\]\s*\(([^)]+)\)\s*(.*)$/;
const BLOCKQUOTE_RE = /^\s*>\s?(.*)$/;
const TRAILING_ID_RE = /\s*#(\d+)\s*$/;
const HEADING1_RE = /^#\s+(.*)$/;
const WORK_ITEMS_HEADING_RE = /^##\s+work items\s*$/i;
const HEADING_RE = /^#{1,6}\s+/;

// Parses a worktree's `tasks.md` into structured work-item data. Pure and
// deterministic: no I/O, no clock, no randomness. See the design spec at
// docs/superpowers/specs/2026-07-16-ado-tasks-md-template-parser-design.md.
export function parseTasksMarkdown(content: string): ParsedTasks {
  const { fields, body } = splitFrontmatter(content);

  const parsedParent = Number(fields.adoParent);
  const parentId =
    fields.adoParent && Number.isInteger(parsedParent) && parsedParent > 0 ? parsedParent : undefined;

  const lines = body.split('\n');

  let featureTitle: string | undefined;
  for (const line of lines) {
    const heading = HEADING1_RE.exec(line);
    if (heading) {
      featureTitle = heading[1]!.trim();
      break;
    }
  }

  const items: ParsedWorkItem[] = [];
  let inSection = false;
  let current: ParsedWorkItem | undefined;
  const descriptionLines: string[] = [];

  function flushDescription(): void {
    if (current && descriptionLines.length > 0) {
      current.description = descriptionLines.join('\n');
    }
    descriptionLines.length = 0;
  }

  for (const line of lines) {
    if (WORK_ITEMS_HEADING_RE.test(line)) {
      inSection = true;
      continue;
    }
    if (!inSection) {
      continue;
    }
    // Any other heading closes the Work items section.
    if (HEADING_RE.test(line)) {
      flushDescription();
      break;
    }

    const itemMatch = ITEM_RE.exec(line);
    if (itemMatch) {
      flushDescription();
      const rest = itemMatch[3]!;
      const idMatch = TRAILING_ID_RE.exec(rest);
      const title = (idMatch ? rest.slice(0, idMatch.index) : rest).trim();
      current = {
        type: itemMatch[2]!.trim(),
        title,
        checked: itemMatch[1]!.toLowerCase() === 'x',
        ...(idMatch ? { adoId: Number(idMatch[1]) } : {}),
      };
      items.push(current);
      continue;
    }

    const quoteMatch = BLOCKQUOTE_RE.exec(line);
    if (quoteMatch && current) {
      descriptionLines.push(quoteMatch[1]!);
    }
  }
  flushDescription();

  return { parentId, featureTitle, items };
}

// Appends the given ADO work-item ids to the un-synced item lines (those under
// "## Work items" that carry no trailing `#id`), in document order, one id per
// line until the ids run out. Already-synced lines and all prose are left
// exactly as they were — this is the write side of the idempotency marker.
export function appendAdoIds(content: string, ids: number[]): string {
  let idIndex = 0;
  let inSection = false;

  return content
    .split('\n')
    .map((line) => {
      if (WORK_ITEMS_HEADING_RE.test(line)) {
        inSection = true;
        return line;
      }
      if (!inSection || HEADING_RE.test(line)) {
        if (HEADING_RE.test(line) && !WORK_ITEMS_HEADING_RE.test(line)) {
          inSection = false;
        }
        return line;
      }
      if (idIndex >= ids.length) {
        return line;
      }
      const itemMatch = ITEM_RE.exec(line);
      if (itemMatch && !TRAILING_ID_RE.test(itemMatch[3]!)) {
        return `${line} #${ids[idIndex++]}`;
      }
      return line;
    })
    .join('\n');
}
