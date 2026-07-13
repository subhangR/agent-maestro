import * as fs from 'fs/promises';
import * as path from 'path';
import { TestDataDir, createTestContainer, createTestProject, silentLogger } from './helpers';
import { FileSystemProjectRepository } from '../src/infrastructure/repositories/FileSystemProjectRepository';
import { TimestampIdGenerator } from '../src/infrastructure/common/TimestampIdGenerator';
import { createProjectSchema, updateProjectSchema } from '../src/api/validation';

/**
 * Coverage for the per-project canonical GitHub repository URL (`Project.githubUrl`).
 *
 * Contract:
 *  - `githubUrl` is an OPTIONAL, durable field on the Project aggregate.
 *  - The API accepts only the canonical form `https://github.com/<owner>/<repo>`
 *    (https only, host must be github.com, exactly owner/repo, no `.git`, no extra path).
 *  - An empty string on update CLEARS the saved value.
 *  - Existing project JSON without the field must keep loading (backward compatibility).
 *  - Persistence is atomic and survives a repository reload (restart).
 */
describe('Project.githubUrl — validation contract', () => {
  const CANONICAL = 'https://github.com/octocat/hello-world';

  describe('createProjectSchema', () => {
    it('accepts a canonical GitHub repository URL', () => {
      const result = createProjectSchema.safeParse({
        name: 'P',
        workingDir: '/tmp/p',
        githubUrl: CANONICAL,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a project without githubUrl (optional / backward compatible)', () => {
      const result = createProjectSchema.safeParse({ name: 'P', workingDir: '/tmp/p' });
      expect(result.success).toBe(true);
    });

    it('accepts mixed-case owner/repo and dots/underscores/hyphens in the repo name', () => {
      for (const url of [
        'https://github.com/Microsoft/TypeScript',
        'https://github.com/my-org/my.repo_name-1',
      ]) {
        expect(createProjectSchema.safeParse({ name: 'P', workingDir: '/tmp/p', githubUrl: url }).success).toBe(true);
      }
    });

    it('accepts the officially supported leading-dot .github repository', () => {
      const result = createProjectSchema.safeParse({
        name: 'P',
        workingDir: '/tmp/p',
        githubUrl: 'https://github.com/acme/.github',
      });
      expect(result.success).toBe(true);
    });

    it.each([
      ['reserved "." repo segment', 'https://github.com/acme/.'],
      ['reserved ".." repo segment', 'https://github.com/acme/..'],
    ])('rejects %s', (_label, url) => {
      const result = createProjectSchema.safeParse({ name: 'P', workingDir: '/tmp/p', githubUrl: url });
      expect(result.success).toBe(false);
    });
  });

  describe('updateProjectSchema', () => {
    it('accepts a canonical GitHub repository URL', () => {
      expect(updateProjectSchema.safeParse({ githubUrl: CANONICAL }).success).toBe(true);
    });

    it('accepts an empty string to clear the saved repository', () => {
      expect(updateProjectSchema.safeParse({ githubUrl: '' }).success).toBe(true);
    });

    it('accepts the officially supported leading-dot .github repository', () => {
      expect(
        updateProjectSchema.safeParse({ githubUrl: 'https://github.com/acme/.github' }).success
      ).toBe(true);
    });

    it.each([
      ['non-https scheme', 'http://github.com/octocat/hello-world'],
      ['other host', 'https://gitlab.com/octocat/hello-world'],
      ['look-alike host', 'https://github.com.evil.com/octocat/hello-world'],
      ['missing repo segment', 'https://github.com/octocat'],
      ['extra path segment', 'https://github.com/octocat/hello-world/tree/main'],
      ['trailing slash', 'https://github.com/octocat/hello-world/'],
      ['.git suffix', 'https://github.com/octocat/hello-world.git'],
      ['leading-hyphen owner', 'https://github.com/-octocat/hello-world'],
      ['non-url garbage', 'octocat/hello-world'],
      ['reserved "." repo segment', 'https://github.com/acme/.'],
      ['reserved ".." repo segment', 'https://github.com/acme/..'],
      ['query string', 'https://github.com/acme/.github?tab=readme'],
      ['fragment', 'https://github.com/acme/.github#readme'],
    ])('rejects %s', (_label, url) => {
      const result = updateProjectSchema.safeParse({ githubUrl: url });
      expect(result.success).toBe(false);
    });
  });
});

describe('Project.githubUrl — persistence', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('persists githubUrl on create', async () => {
    const created = await container.projectService.createProject(
      createTestProject({ githubUrl: 'https://github.com/octocat/hello-world' })
    );
    expect(created.githubUrl).toBe('https://github.com/octocat/hello-world');
  });

  it('round-trips githubUrl through update and emits project:updated', async () => {
    const created = await container.projectService.createProject(createTestProject());
    expect(created.githubUrl).toBeUndefined();

    const events: any[] = [];
    container.eventBus.on('project:updated', (p) => {
      events.push(p);
    });

    const updated = await container.projectService.updateProject(created.id, {
      githubUrl: 'https://github.com/acme/widgets',
    });

    expect(updated.githubUrl).toBe('https://github.com/acme/widgets');
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe(created.name); // other fields preserved
    expect(events).toHaveLength(1);
    expect(events[0].githubUrl).toBe('https://github.com/acme/widgets');
  });

  it('survives a repository reload (restart persistence)', async () => {
    const created = await container.projectService.createProject(
      createTestProject({ githubUrl: 'https://github.com/acme/widgets' })
    );

    // Simulate a server restart: brand-new repository over the same data dir.
    const reloaded = new FileSystemProjectRepository(
      testDataDir.getPath(),
      new TimestampIdGenerator(),
      silentLogger
    );
    await reloaded.initialize();

    const found = await reloaded.findById(created.id);
    expect(found?.githubUrl).toBe('https://github.com/acme/widgets');
  });

  it('keeps two projects with different saved repositories independent across reload', async () => {
    const a = await container.projectService.createProject(
      createTestProject({ name: 'A', githubUrl: 'https://github.com/acme/alpha' })
    );
    const b = await container.projectService.createProject(
      createTestProject({ name: 'B', githubUrl: 'https://github.com/acme/beta' })
    );

    const reloaded = new FileSystemProjectRepository(
      testDataDir.getPath(),
      new TimestampIdGenerator(),
      silentLogger
    );
    await reloaded.initialize();

    expect((await reloaded.findById(a.id))?.githubUrl).toBe('https://github.com/acme/alpha');
    expect((await reloaded.findById(b.id))?.githubUrl).toBe('https://github.com/acme/beta');
  });

  it('clears githubUrl when updated with an empty string', async () => {
    const created = await container.projectService.createProject(
      createTestProject({ githubUrl: 'https://github.com/acme/widgets' })
    );

    const cleared = await container.projectService.updateProject(created.id, { githubUrl: '' });
    expect(cleared.githubUrl).toBeUndefined();

    const reloaded = new FileSystemProjectRepository(
      testDataDir.getPath(),
      new TimestampIdGenerator(),
      silentLogger
    );
    await reloaded.initialize();
    const found = await reloaded.findById(created.id);
    expect(found?.githubUrl).toBeUndefined();
    // Ensure the key is not left behind as null/empty in the persisted JSON.
    const raw = JSON.parse(
      await fs.readFile(path.join(testDataDir.getPath(), 'projects', `${created.id}.json`), 'utf-8')
    );
    expect('githubUrl' in raw).toBe(false);
  });

  it('loads a legacy project JSON that predates githubUrl (backward compatibility)', async () => {
    const projectsDir = path.join(testDataDir.getPath(), 'projects');
    await fs.mkdir(projectsDir, { recursive: true });
    const legacy = {
      id: 'proj_legacy_1',
      name: 'Legacy',
      workingDir: '/tmp/legacy',
      description: '',
      createdAt: 1,
      updatedAt: 1,
    };
    await fs.writeFile(path.join(projectsDir, `${legacy.id}.json`), JSON.stringify(legacy));

    const reloaded = new FileSystemProjectRepository(
      testDataDir.getPath(),
      new TimestampIdGenerator(),
      silentLogger
    );
    await reloaded.initialize();

    const found = await reloaded.findById(legacy.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Legacy');
    expect(found?.githubUrl).toBeUndefined();
  });
});
