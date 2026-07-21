import { TestDataDir, createTestContainer, createTestProject } from './helpers';

describe('TeamMemberService memory entry edit/remove', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let projectId: string;

  const mkMember = () =>
    container.teamMemberService.createTeamMember({
      projectId, name: 'Steward', role: 'worker', avatar: '🤖',
    });

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    projectId = project.id;
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  describe('removeMemoryEntry', () => {
    it('removes a single entry without touching the others', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['first', 'second', 'third']);

      const updated = await container.teamMemberService.removeMemoryEntry(projectId, member.id, 1);

      expect(updated.memory).toEqual(['first', 'third']);
    });

    it('removes the last remaining entry', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['only']);

      const updated = await container.teamMemberService.removeMemoryEntry(projectId, member.id, 0);

      expect(updated.memory).toEqual([]);
    });

    it('persists the removal across a fresh read', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['a', 'b']);
      await container.teamMemberService.removeMemoryEntry(projectId, member.id, 0);

      const reloaded = await container.teamMemberService.getTeamMember(projectId, member.id);
      expect(reloaded.memory).toEqual(['b']);
    });

    it('throws NotFoundError for an out-of-range index', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['a']);

      await expect(
        container.teamMemberService.removeMemoryEntry(projectId, member.id, 5),
      ).rejects.toThrow();
    });

    it('throws for a negative index', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['a']);

      await expect(
        container.teamMemberService.removeMemoryEntry(projectId, member.id, -1),
      ).rejects.toThrow();
    });
  });

  describe('editMemoryEntry', () => {
    it('edits one entry in place, leaving the others unchanged', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['first', 'second', 'third']);

      const updated = await container.teamMemberService.editMemoryEntry(projectId, member.id, 1, 'SECOND (edited)');

      expect(updated.memory).toEqual(['first', 'SECOND (edited)', 'third']);
    });

    it('trims the new entry text', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['a']);

      const updated = await container.teamMemberService.editMemoryEntry(projectId, member.id, 0, '  padded  ');

      expect(updated.memory).toEqual(['padded']);
    });

    it('rejects empty replacement text', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['a']);

      await expect(
        container.teamMemberService.editMemoryEntry(projectId, member.id, 0, '   '),
      ).rejects.toThrow();
    });

    it('throws NotFoundError for an out-of-range index', async () => {
      const member = await mkMember();
      await container.teamMemberService.appendMemory(projectId, member.id, ['a']);

      await expect(
        container.teamMemberService.editMemoryEntry(projectId, member.id, 3, 'x'),
      ).rejects.toThrow();
    });
  });
});
