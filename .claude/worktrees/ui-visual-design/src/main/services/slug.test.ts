import { describe, it, expect } from 'vitest';
import { slugify, assertSafeBranchName, assertValidGitUrl, assertSafeFolderName } from './slug';

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

describe('assertSafeBranchName', () => {
  it('accepts a normal branch name', () => {
    expect(() => assertSafeBranchName('task/fix-login-bug')).not.toThrow();
  });

  it('rejects a branch name containing a semicolon', () => {
    expect(() => assertSafeBranchName('feat/x; rm -rf /')).toThrow('Unsafe branch name');
  });

  it('rejects a branch name containing backticks', () => {
    expect(() => assertSafeBranchName('feat/`whoami`')).toThrow('Unsafe branch name');
  });

  it('rejects a branch name containing a space', () => {
    expect(() => assertSafeBranchName('feat/with space')).toThrow('Unsafe branch name');
  });

  it('rejects a branch name containing a path-traversal segment', () => {
    expect(() => assertSafeBranchName('feat/..')).toThrow('Unsafe branch name');
  });
});

describe('assertValidGitUrl', () => {
  it('accepts a normal https URL', () => {
    expect(() => assertValidGitUrl('https://github.com/paurodriguez0220/demo.git')).not.toThrow();
  });

  it('accepts a normal ssh (git@) URL', () => {
    expect(() => assertValidGitUrl('git@github.com:paurodriguez0220/demo.git')).not.toThrow();
  });

  it('rejects a URL with a shell injection payload', () => {
    expect(() => assertValidGitUrl('https://github.com/x; rm -rf /')).toThrow('Invalid git URL');
  });

  it('rejects a URL without a known scheme', () => {
    expect(() => assertValidGitUrl('javascript:alert(1)')).toThrow('Invalid git URL');
  });

  it('rejects an ssh URL whose host segment starts with a dash (argument injection via -F)', () => {
    expect(() => assertValidGitUrl('git@-F/tmp/evil_ssh_config')).toThrow('Invalid git URL');
  });

  it('rejects an ssh URL whose host segment starts with a dash (argument injection via -4)', () => {
    expect(() => assertValidGitUrl('git@-4')).toThrow('Invalid git URL');
  });
});

describe('assertSafeFolderName', () => {
  it('accepts a plain folder name', () => {
    expect(() => assertSafeFolderName('demo')).not.toThrow();
  });

  it('accepts a folder name with hyphens, underscores, and digits', () => {
    expect(() => assertSafeFolderName('my-repo_2')).not.toThrow();
  });

  it('rejects a path-traversal segment with a forward slash', () => {
    expect(() => assertSafeFolderName('../evil')).toThrow();
  });

  it('rejects a path-traversal segment with a backslash', () => {
    expect(() => assertSafeFolderName('..\\evil')).toThrow();
  });

  it('rejects a name containing a path separator', () => {
    expect(() => assertSafeFolderName('a/b')).toThrow();
  });
});
