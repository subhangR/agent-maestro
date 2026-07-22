import { describe, it, expect } from "vitest";
import { MaestroProject } from "../app/types/maestro";
import {
  parseGitRemote,
  parseManualGithubRemote,
  toGithubUrlForPersistence,
} from "../utils/parseGitRemote";
import {
  reconcileProjectsWithServer,
  toMaestroProject,
} from "../stores/projectSync";

/**
 * The Collab repo selection persists on the Project aggregate as
 * `githubUrl` (canonical `https://github.com/<owner>/<repo>`), while Firebase
 * Collab Spaces are keyed by `ParsedGitRemote.canonical`
 * (`github.com/<owner>/<repo>`). These tests pin the mapping between the two
 * forms plus the server-authoritative flow through the sync mapper.
 */
describe("toGithubUrlForPersistence", () => {
  it("produces the canonical https GitHub URL the server accepts", () => {
    const parsed = parseGitRemote("git@github.com:Owner/Repo.git");
    expect(parsed).not.toBeNull();
    expect(toGithubUrlForPersistence(parsed!)).toBe(
      "https://github.com/owner/repo",
    );
  });

  it("normalizes an https remote (drops .git, lowercases) to the same value", () => {
    const parsed = parseGitRemote("https://github.com/Owner/Repo.git");
    expect(toGithubUrlForPersistence(parsed!)).toBe(
      "https://github.com/owner/repo",
    );
  });

  it("rejects non-github hosts (server accepts github.com only)", () => {
    const parsed = parseGitRemote("https://gitlab.com/owner/repo");
    expect(parsed).not.toBeNull();
    expect(toGithubUrlForPersistence(parsed!)).toBeNull();
  });

  it("round-trips so the Firebase key is identical whether detected or hydrated", () => {
    const detected = parseGitRemote("git@github.com:Owner/Repo.git")!;
    const persisted = toGithubUrlForPersistence(detected)!;
    const hydrated = parseGitRemote(persisted)!;
    // The Firebase/collab cache key must be stable across the round-trip.
    expect(hydrated.canonical).toBe(detected.canonical);
    expect(hydrated.canonical).toBe("github.com/owner/repo");
  });
});

describe("toMaestroProject carries githubUrl (server-owned)", () => {
  it("maps a persisted githubUrl through from the server source", () => {
    const mapped = toMaestroProject({
      id: "A",
      name: "A",
      workingDir: "/a",
      createdAt: 1,
      updatedAt: 1,
      githubUrl: "https://github.com/owner/repo",
    });
    expect(mapped.githubUrl).toBe("https://github.com/owner/repo");
  });

  it("leaves githubUrl undefined when the server has none", () => {
    const mapped = toMaestroProject({
      id: "A",
      name: "A",
      workingDir: "/a",
      createdAt: 1,
      updatedAt: 1,
    });
    expect(mapped.githubUrl).toBeUndefined();
  });

  it("does not let local metadata override the server githubUrl", () => {
    // githubUrl is server-authoritative: a stale local copy must not win.
    const local = { environmentId: "env-1" } as Partial<MaestroProject>;
    const mapped = toMaestroProject(
      {
        id: "A",
        name: "A",
        workingDir: "/a",
        createdAt: 1,
        updatedAt: 1,
        githubUrl: "https://github.com/server/repo",
      },
      local,
    );
    expect(mapped.githubUrl).toBe("https://github.com/server/repo");
    expect(mapped.environmentId).toBe("env-1");
  });
});

describe("reconcileProjectsWithServer keeps githubUrl server-authoritative", () => {
  function project(
    overrides: Partial<MaestroProject> & { id: string },
  ): MaestroProject {
    return {
      id: overrides.id,
      name: overrides.name ?? overrides.id,
      workingDir: overrides.workingDir ?? `/work/${overrides.id}`,
      createdAt: overrides.createdAt ?? 1,
      updatedAt: overrides.updatedAt ?? 1,
      basePath: overrides.basePath,
      environmentId: overrides.environmentId ?? null,
      githubUrl: overrides.githubUrl,
    };
  }

  it("displays the server's githubUrl for a project that exists on both", () => {
    const serverA = project({
      id: "A",
      githubUrl: "https://github.com/owner/repo",
    });
    const localA = project({ id: "A" }); // no githubUrl locally

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: false,
    });

    expect(result.projectsToDisplay).toHaveLength(1);
    expect(result.projectsToDisplay[0].githubUrl).toBe(
      "https://github.com/owner/repo",
    );
  });

  it("keeps two projects' distinct saved repositories separate", () => {
    const serverA = project({
      id: "A",
      githubUrl: "https://github.com/owner/alpha",
    });
    const serverB = project({
      id: "B",
      githubUrl: "https://github.com/owner/beta",
    });

    const result = reconcileProjectsWithServer({
      localProjects: [],
      serverProjects: [serverA, serverB],
      closedProjectIds: new Set(),
      isTauri: false,
    });

    const byId = Object.fromEntries(
      result.projectsToDisplay.map((p) => [p.id, p.githubUrl]),
    );
    expect(byId).toEqual({
      A: "https://github.com/owner/alpha",
      B: "https://github.com/owner/beta",
    });
  });
});

/**
 * `parseManualGithubRemote` is the strict, non-normalizing gate in front of
 * the manual "set repository" PUT in `CollabSpacePanel` (`handleSaveRemote`).
 * Unlike `parseGitRemote` (used only for trusted local git-remote
 * auto-detection), it must mirror the server's `githubRepoUrl` Zod schema
 * (maestro-server/src/api/validation.ts) exactly: reject, not silently fix,
 * anything the server would 400 on.
 */
describe("parseManualGithubRemote", () => {
  it.each([
    ["github.com/owner/repo", "github.com/owner/repo"],
    ["https://github.com/owner/repo", "github.com/owner/repo"],
    ["  https://github.com/owner/repo  ", "github.com/owner/repo"],
    ["https://github.com/my-org/my.repo_name-1", "github.com/my-org/my.repo_name-1"],
  ])("accepts %s", (raw, canonical) => {
    const parsed = parseManualGithubRemote(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.host).toBe("github.com");
    expect(parsed!.canonical).toBe(canonical);
  });

  it("accepts the leading-dot .github repo (bare and canonical forms)", () => {
    expect(parseManualGithubRemote("github.com/owner/.github")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: ".github",
      canonical: "github.com/owner/.github",
    });
    expect(parseManualGithubRemote("https://github.com/owner/.github")).toEqual({
      host: "github.com",
      owner: "owner",
      repo: ".github",
      canonical: "github.com/owner/.github",
    });
  });

  it.each([
    ["non-https scheme", "http://github.com/owner/repo"],
    [".git suffix", "https://github.com/owner/repo.git"],
    ["trailing slash", "https://github.com/owner/repo/"],
    ["query string", "https://github.com/owner/repo?x=1"],
    ["fragment", "https://github.com/owner/repo#section"],
    ["extra path segment", "https://github.com/owner/repo/extra"],
    ["lookalike host (subdomain suffix)", "https://github.com.evil.com/owner/repo"],
    ["wrong host", "https://gitlab.com/owner/repo"],
    ["bare dot repo", "https://github.com/owner/."],
    ["bare dot-dot repo", "https://github.com/owner/.."],
    ["leading-hyphen owner", "https://github.com/-owner/repo"],
    ["missing repo segment", "https://github.com/owner"],
    ["ssh form (not accepted manually)", "git@github.com:owner/repo.git"],
    ["non-url garbage", "not a url"],
  ])("rejects %s: %s", (_label, raw) => {
    expect(parseManualGithubRemote(raw)).toBeNull();
  });
});
