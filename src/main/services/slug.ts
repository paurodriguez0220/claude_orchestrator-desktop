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
  if (!SAFE_BRANCH_PATTERN.test(branch)) {
    throw new Error(`Unsafe branch name: ${branch}`);
  }
}

const SAFE_URL_CHARS = /^[A-Za-z0-9:/_.@-]+$/;

export function assertValidGitUrl(url: string): void {
  const hasKnownScheme = url.startsWith('https://') || url.startsWith('git@');
  if (!hasKnownScheme || !SAFE_URL_CHARS.test(url)) {
    throw new Error(`Invalid git URL: ${url}`);
  }
}
