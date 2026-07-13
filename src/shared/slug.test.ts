import { describe, it, expect } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates a plain title', () => {
    expect(slugify('Fix Login Bug')).toBe('fix-login-bug');
  });

  it('strips characters outside a-z0-9 and collapses separators', () => {
    expect(slugify('Fix login bug!! (urgent)')).toBe('fix-login-bug-urgent');
  });

  it('strips shell metacharacters entirely', () => {
    expect(slugify('title; rm -rf / && echo pwned')).toBe('title-rm-rf-echo-pwned');
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBe(60);
  });
});
