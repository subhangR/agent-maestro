import { describe, it, expect } from 'vitest';
import { MaestroProject } from '../app/types/maestro';
import {
  reconcileProjectsWithServer,
  resolveActiveProject,
  toLocalOnlyProjectCreatePayload,
  toMaestroProject,
} from '../stores/projectSync';

function project(overrides: Partial<MaestroProject> & { id: string }): MaestroProject {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    workingDir: overrides.workingDir ?? `/work/${overrides.id}`,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    githubUrl: overrides.githubUrl,
    basePath: overrides.basePath,
    environmentId: overrides.environmentId ?? null,
    assetsEnabled: overrides.assetsEnabled,
    soundInstrument: overrides.soundInstrument,
    soundConfig: overrides.soundConfig,
  };
}

describe('reconcileProjectsWithServer', () => {
  it('web mode: prunes local-only projects and never proposes creating them', () => {
    const serverA = project({ id: 'A' });
    const localA = project({ id: 'A' });
    const localB = project({ id: 'B' });
    const localC = project({ id: 'C' });

    const result = reconcileProjectsWithServer({
      localProjects: [localA, localB, localC],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: false,
    });

    expect(result.projectsToDisplay.map((p) => p.id)).toEqual(['A']);
    expect(result.projectsToCreateOnServer).toEqual([]);
  });

  it('web mode: honors an empty server response (empty workspace, not a fallback to local)', () => {
    const localA = project({ id: 'A' });

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [],
      closedProjectIds: new Set(),
      isTauri: false,
    });

    expect(result.projectsToDisplay).toEqual([]);
    expect(result.projectsToCreateOnServer).toEqual([]);
  });

  it('web mode: excludes a server project that is in closedProjectIds', () => {
    const serverA = project({ id: 'A' });
    const serverB = project({ id: 'B' });

    const result = reconcileProjectsWithServer({
      localProjects: [],
      serverProjects: [serverA, serverB],
      closedProjectIds: new Set(['B']),
      isTauri: false,
    });

    expect(result.projectsToDisplay.map((p) => p.id)).toEqual(['A']);
  });

  it('web mode: preserves local metadata (e.g. environmentId) for a project that exists on both', () => {
    const serverA = project({ id: 'A', name: 'renamed-on-server' });
    const localA = project({ id: 'A', environmentId: 'env-123', soundInstrument: 'guitar' });

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: false,
    });

    expect(result.projectsToDisplay).toEqual([
      {
        id: 'A',
        name: 'renamed-on-server',
        workingDir: serverA.workingDir,
        createdAt: serverA.createdAt,
        updatedAt: serverA.updatedAt,
        basePath: serverA.workingDir || null,
        environmentId: 'env-123',
        assetsEnabled: true,
        soundInstrument: 'guitar',
        soundConfig: undefined,
      },
    ]);
  });

  it('recovers a newer persisted GitHub binding when a legacy server response lacks it', () => {
    const serverA = project({ id: 'A', updatedAt: 10 });
    const localA = project({
      id: 'A',
      githubUrl: 'https://github.com/acme/recovered',
      updatedAt: 11,
    });

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: true,
    });

    expect(result.projectsToDisplay[0].githubUrl).toBe('https://github.com/acme/recovered');
  });

  it('does not resurrect a binding after a newer server-side unlink', () => {
    const serverA = project({ id: 'A', updatedAt: 12 });
    const localA = project({
      id: 'A',
      githubUrl: 'https://github.com/acme/unlinked',
      updatedAt: 11,
    });

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: true,
    });

    expect(result.projectsToDisplay[0].githubUrl).toBeUndefined();
  });

  it('does not treat a pre-timestamp legacy snapshot as newer than an unlinked server project', () => {
    const serverA = project({ id: 'A', updatedAt: 12 });
    const localA = project({
      id: 'A',
      githubUrl: 'https://github.com/acme/legacy',
      updatedAt: 0,
    });

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: true,
    });

    expect(result.projectsToDisplay[0].githubUrl).toBeUndefined();
  });

  it('uses a non-empty server binding when it conflicts with the persisted value', () => {
    const serverA = project({
      id: 'A',
      githubUrl: 'https://github.com/acme/server',
      updatedAt: 10,
    });
    const localA = project({
      id: 'A',
      githubUrl: 'https://github.com/acme/local',
      updatedAt: 11,
    });

    const result = reconcileProjectsWithServer({
      localProjects: [localA],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: true,
    });

    expect(result.projectsToDisplay[0].githubUrl).toBe('https://github.com/acme/server');
  });

  it('tauri mode: proposes local-only projects for creation and displays both existing + local-only', () => {
    const serverA = project({ id: 'A' });
    const localA = project({ id: 'A' });
    const localB = project({ id: 'B' });

    const result = reconcileProjectsWithServer({
      localProjects: [localA, localB],
      serverProjects: [serverA],
      closedProjectIds: new Set(),
      isTauri: true,
    });

    expect(result.projectsToDisplay.map((p) => p.id)).toEqual(['A']);
    expect(result.projectsToCreateOnServer.map((p) => p.id)).toEqual(['B']);

    // Simulate the initApp create loop: the caller pushes the created
    // project (mapped via toMaestroProject) onto the display list.
    const created = { id: 'B-server', name: 'B', workingDir: localB.workingDir, createdAt: 2, updatedAt: 2 };
    const finalDisplay = [...result.projectsToDisplay, toMaestroProject(created, localB, {
      preserveLocalGithubWhenServerMissing: true,
    })];
    expect(finalDisplay.map((p) => p.id)).toEqual(['A', 'B-server']);
  });

  it('tauri recovery keeps a local-only project binding when an older create response omits it', () => {
    const localB = project({
      id: 'B',
      githubUrl: 'https://github.com/acme/local-only',
      updatedAt: 10,
    });
    const created = { id: 'B-server', name: 'B', workingDir: localB.workingDir, createdAt: 11, updatedAt: 11 };

    expect(toMaestroProject(created, localB, {
      preserveLocalGithubWhenServerMissing: true,
    }).githubUrl).toBe('https://github.com/acme/local-only');
  });

  it('sends a local-only project binding with its upstream create request', () => {
    const payload = toLocalOnlyProjectCreatePayload(project({
      id: 'B',
      githubUrl: 'https://github.com/acme/local-only',
    }));

    expect(payload.githubUrl).toBe('https://github.com/acme/local-only');
    expect(payload).not.toHaveProperty('createdAt');
    expect(payload).not.toHaveProperty('updatedAt');
  });
});

describe('toMaestroProject', () => {
  it('defaults local metadata when no local project is provided', () => {
    const mapped = toMaestroProject({ id: 'X', name: 'X', workingDir: '/x', createdAt: 1, updatedAt: 1 });
    expect(mapped.environmentId).toBeNull();
    expect(mapped.assetsEnabled).toBe(true);
    expect(mapped.soundInstrument).toBe('piano');
    expect(mapped.soundConfig).toBeUndefined();
    expect(mapped.basePath).toBe('/x');
  });
});

describe('resolveActiveProject', () => {
  it('falls back to the first project when the candidate id no longer exists', () => {
    const projects = [project({ id: 'A' }), project({ id: 'B' })];
    const result = resolveActiveProject(projects, 'ghost', { ghost: 's1', A: 's2' });
    expect(result.activeProjectId).toBe('A');
    expect(result.activeSessionByProject).toEqual({ A: 's2' });
  });

  it('returns empty string when there are no projects', () => {
    const result = resolveActiveProject([], 'A', { A: 's1' });
    expect(result.activeProjectId).toBe('');
    expect(result.activeSessionByProject).toEqual({});
  });

  it('keeps the candidate id when it is still valid', () => {
    const projects = [project({ id: 'A' }), project({ id: 'B' })];
    const result = resolveActiveProject(projects, 'B', { B: 's9' });
    expect(result.activeProjectId).toBe('B');
    expect(result.activeSessionByProject).toEqual({ B: 's9' });
  });
});
