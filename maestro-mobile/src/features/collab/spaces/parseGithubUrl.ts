// Local helper: parse a user-supplied GitHub repo URL into the canonical parts
// the SpacesClient needs. Accepts:
//   - "github.com/owner/repo"
//   - "https://github.com/owner/repo"
//   - "https://github.com/owner/repo.git"
//   - "http://github.com/owner/repo"
// Returns null if the input doesn't look like a GitHub repo URL.

export interface ParsedGithubUrl {
  /** Canonical form, no scheme: "github.com/owner/repo" */
  githubUrl: string;
  githubHost: string;
  githubOwner: string;
  githubRepo: string;
}

export function parseGithubUrl(raw: string): ParsedGithubUrl | null {
  const trimmed = raw.trim().replace(/\.git$/, '');
  // Strip scheme if present
  const withoutScheme = trimmed.replace(/^https?:\/\//, '');
  // Must start with github.com/
  const match = withoutScheme.match(/^(github\.com)\/([^/\s]+)\/([^/\s]+)\/?$/i);
  if (!match || !match[1] || !match[2] || !match[3]) return null;
  const githubHost = match[1].toLowerCase();
  const githubOwner = match[2];
  const githubRepo = match[3];
  const githubUrl = `${githubHost}/${githubOwner}/${githubRepo}`;
  return { githubUrl, githubHost, githubOwner, githubRepo };
}
