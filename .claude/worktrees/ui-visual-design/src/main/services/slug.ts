export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const SAFE_BRANCH_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_.-]*$/;

export function assertSafeBranchName(branch: string): void {
  if (!SAFE_BRANCH_PATTERN.test(branch) || branch.includes('..')) {
    throw new Error(`Unsafe branch name: ${branch}`);
  }
}

const SAFE_URL_CHARS = /^[A-Za-z0-9:/_.@-]+$/;

// scp-like ssh URL (git@host:path). The host segment must not be able to
// start with '-', otherwise git invokes `ssh <host> ...` with an argv token
// that ssh will parse as a CLI flag (e.g. `-F` or `-oProxyCommand=...`),
// enabling argument injection (CVE-2017-1000117 class).
const SAFE_GIT_AT_URL_PATTERN = /^git@[A-Za-z0-9][A-Za-z0-9.-]*:[A-Za-z0-9/_.-]+$/;

const SAFE_FOLDER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function assertSafeFolderName(name: string): void {
  if (name.includes('/') || name.includes('\\') || name.includes('..') || !SAFE_FOLDER_NAME_PATTERN.test(name)) {
    throw new Error(`Unsafe folder name: ${name}`);
  }
}

export function assertValidGitUrl(url: string): void {
  const hasKnownScheme = url.startsWith('https://') || url.startsWith('git@');
  if (!hasKnownScheme || !SAFE_URL_CHARS.test(url)) {
    throw new Error(`Invalid git URL: ${url}`);
  }
  if (url.startsWith('git@') && !SAFE_GIT_AT_URL_PATTERN.test(url)) {
    throw new Error(`Invalid git URL: ${url}`);
  }
}
