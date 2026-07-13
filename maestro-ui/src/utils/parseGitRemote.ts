export interface ParsedGitRemote {
  host: string;
  owner: string;
  repo: string;
  canonical: string;
}

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
