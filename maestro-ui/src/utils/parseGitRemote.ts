export interface ParsedGitRemote {
  host: string;
  owner: string;
  repo: string;
  canonical: string;
}

/**
 * Lenient parser for locally-detected git remotes (`git remote get-url origin`
 * output) and for re-parsing an already server-validated `Project.githubUrl`.
 * Real git remotes are already well-formed, so this stays intentionally broad
 * (ssh/https/git protocol, trailing `.git` stripped) rather than enforcing the
 * server's strict persistence contract — see `parseManualGithubRemote` for the
 * strict, non-normalizing validator used for user-typed input before a PUT.
 */
export function parseGitRemote(raw: string): ParsedGitRemote | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\.git$/i, '');

  const sshMatch = trimmed.match(/^git@([^:]+):([^/]+)\/(.+)$/);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return { host, owner, repo, canonical: `${host}/${owner}/${repo}`.toLowerCase() };
  }

  const httpsMatch = trimmed.match(/^https?:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/(.+)$/i);
  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    return { host, owner, repo, canonical: `${host}/${owner}/${repo}`.toLowerCase() };
  }

  const gitProtocolMatch = trimmed.match(/^git:\/\/([^/]+)\/([^/]+)\/(.+)$/i);
  if (gitProtocolMatch) {
    const [, host, owner, repo] = gitProtocolMatch;
    return { host, owner, repo, canonical: `${host}/${owner}/${repo}`.toLowerCase() };
  }

  return null;
}

// Mirrors maestro-server's canonical GitHub repository URL contract
// (`githubRepoUrl` in maestro-server/src/api/validation.ts). Keep these two
// definitions in sync if the server contract changes.
const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const GITHUB_REPO_RE = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

function isValidGithubOwner(owner: string): boolean {
  return GITHUB_OWNER_RE.test(owner);
}

function isValidGithubRepo(repo: string): boolean {
  return GITHUB_REPO_RE.test(repo) && !/\.git$/i.test(repo);
}

/**
 * Maps a parsed remote to the canonical `https://github.com/<owner>/<repo>` form
 * persisted on `Project.githubUrl`. Returns `null` for anything the server's
 * `githubRepoUrl` schema would reject — non-`github.com` host, or an owner/repo
 * segment outside the GitHub charset (this also catches `parseGitRemote` having
 * captured a stray path/query/fragment fragment into `owner`/`repo`) — so this
 * function never hands the caller a URL the PUT would 400 on.
 *
 * `parsed.canonical` is already the lowercased `github.com/owner/repo` key used
 * for Firebase Collab Space queries, so prefixing `https://` keeps the persisted
 * value and the Firebase key in lock-step (re-parsing the persisted URL yields
 * the same `canonical`).
 */
export function toGithubUrlForPersistence(parsed: ParsedGitRemote): string | null {
  if (parsed.host.toLowerCase() !== 'github.com') return null;
  if (!isValidGithubOwner(parsed.owner) || !isValidGithubRepo(parsed.repo)) return null;
  return `https://${parsed.canonical}`;
}

// Anchors "github.com" as a literal (not a wildcard host capture) so a
// look-alike host (`github.com.evil.com`, `not-github.com`) can never match —
// there is no separate host-equality step to bypass. The optional scheme
// group only ever matches literal `https://`; any other scheme (`http://`,
// `git://`, ...) fails the anchor and the whole match fails.
const MANUAL_GITHUB_URL_RE =
  /^(?:https:\/\/)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/((?!\.{1,2}$)[A-Za-z0-9._-]+)$/i;

/**
 * Strict validator for the manual "set repository" form in `CollabSpacePanel`
 * — the only place a user-typed string turns directly into a `Project.githubUrl`
 * PUT. Unlike `parseGitRemote`, this never silently normalizes a malformed
 * input into something valid: a `.git` suffix, trailing slash, query string,
 * fragment, extra path segment, non-`github.com` host, or non-`https` scheme
 * all make the whole input invalid (returns `null`) rather than being
 * stripped away, so a manually typed URL that the server would 400 on is
 * rejected client-side instead of silently "fixed" into something else.
 *
 * Accepts the bare `github.com/<owner>/<repo>` shorthand (matching the input's
 * placeholder text) or the full `https://github.com/<owner>/<repo>` form,
 * including a leading-dot repo like `owner/.github` — mirrors the server's
 * `githubRepoUrl` schema (maestro-server/src/api/validation.ts) exactly, short
 * of the schema's own `.git`-suffix refinement, which is re-checked below
 * since the repo charset alone would otherwise accept it (dots are legal
 * mid-name, e.g. `my.repo_name`).
 */
export function parseManualGithubRemote(raw: string): ParsedGitRemote | null {
  const trimmed = raw.trim();
  const match = trimmed.match(MANUAL_GITHUB_URL_RE);
  if (!match) return null;
  const [, owner, repo] = match;
  if (/\.git$/i.test(repo)) return null;
  return {
    host: 'github.com',
    owner,
    repo,
    canonical: `github.com/${owner}/${repo}`.toLowerCase(),
  };
}
