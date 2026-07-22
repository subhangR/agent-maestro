import { describe, expect, it } from 'vitest';
import { MaestroProject } from '../app/types/maestro';
import { toPersistedProjectRecord } from '../stores/persistence';

function project(overrides: Partial<MaestroProject> = {}): MaestroProject {
  return {
    id: 'project-1',
    name: 'Project One',
    workingDir: '/work/project-one',
    createdAt: 1,
    updatedAt: 1,
    environmentId: null,
    ...overrides,
  };
}

describe('desktop project persistence', () => {
  it('keeps the durable Collab repository binding and working directory', () => {
    const persisted = toPersistedProjectRecord(project({
      basePath: '/display/project-one',
      githubUrl: 'https://github.com/acme/project-one',
    }));

    expect(persisted).toMatchObject({
      id: 'project-1',
      title: 'Project One',
      createdAt: 1,
      updatedAt: 1,
      workingDir: '/work/project-one',
      basePath: '/display/project-one',
      githubUrl: 'https://github.com/acme/project-one',
    });
  });

  it('omits an unset repository instead of persisting an empty binding', () => {
    expect(toPersistedProjectRecord(project())).not.toHaveProperty('githubUrl');
  });
});
