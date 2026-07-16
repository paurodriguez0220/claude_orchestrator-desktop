import { describe, it, expect } from 'vitest';
import { parseTasksMarkdown } from './tasks-md-parser';

describe('parseTasksMarkdown', () => {
  it('parses the parent id from frontmatter', () => {
    const md = ['---', 'adoParent: 12345', '---', '', '## Work items', ''].join('\n');
    expect(parseTasksMarkdown(md).parentId).toBe(12345);
  });

  it('leaves parentId undefined when adoParent is missing, blank, or non-integer', () => {
    expect(parseTasksMarkdown('## Work items').parentId).toBeUndefined();
    expect(parseTasksMarkdown('---\nadoParent:\n---').parentId).toBeUndefined();
    expect(parseTasksMarkdown('---\nadoParent: not-a-number\n---').parentId).toBeUndefined();
  });

  it('captures the first heading as the feature title', () => {
    const md = ['# My feature', '', 'context prose', '', '## Work items'].join('\n');
    expect(parseTasksMarkdown(md).featureTitle).toBe('My feature');
  });

  it('parses one checkbox line into a work item with type and title', () => {
    const md = ['## Work items', '- [ ] (Task) Set up the data model'].join('\n');
    const { items } = parseTasksMarkdown(md);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: 'Task', title: 'Set up the data model', checked: false });
    expect(items[0]?.adoId).toBeUndefined();
  });

  it('matches the type case-insensitively and supports multi-word types', () => {
    const md = ['## Work items', '- [ ] (user story) Do the thing'].join('\n');
    expect(parseTasksMarkdown(md).items[0]?.type).toBe('user story');
  });

  it('joins indented blockquote lines under an item into its description', () => {
    const md = [
      '## Work items',
      '- [ ] (Task) With a description',
      '  > First line.',
      '  > Second line.',
    ].join('\n');
    expect(parseTasksMarkdown(md).items[0]?.description).toBe('First line.\nSecond line.');
  });

  it('reads a trailing #id as adoId and strips it from the title', () => {
    const md = ['## Work items', '- [x] (Task) Already synced #67890'].join('\n');
    const item = parseTasksMarkdown(md).items[0];
    expect(item).toMatchObject({ title: 'Already synced', adoId: 67890, checked: true });
  });

  it('preserves a mid-title # that is not a trailing id marker', () => {
    const md = ['## Work items', '- [ ] (Bug) Fix #region handling'].join('\n');
    const item = parseTasksMarkdown(md).items[0];
    expect(item?.title).toBe('Fix #region handling');
    expect(item?.adoId).toBeUndefined();
  });

  it('distinguishes checked from unchecked independently of adoId', () => {
    const md = [
      '## Work items',
      '- [ ] (Task) Not done, not synced',
      '- [x] (Task) Done, not synced',
    ].join('\n');
    const { items } = parseTasksMarkdown(md);
    expect(items[0]?.checked).toBe(false);
    expect(items[1]?.checked).toBe(true);
    expect(items[0]?.adoId).toBeUndefined();
    expect(items[1]?.adoId).toBeUndefined();
  });

  it('returns no items when there is no Work items section', () => {
    expect(parseTasksMarkdown('# Just a heading\n\nsome prose').items).toEqual([]);
  });

  it('skips prose and unrecognised lines under the Work items section', () => {
    const md = [
      '## Work items',
      'just some prose that is not an item',
      '- [ ] (Task) A real item',
      '- a bullet with no checkbox',
    ].join('\n');
    expect(parseTasksMarkdown(md).items).toHaveLength(1);
  });
});
