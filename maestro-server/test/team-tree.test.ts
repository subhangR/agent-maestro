import { TestDataDir, createTestContainer, createTestProject } from './helpers';

describe('TeamService.getTeamTree', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let projectId: string;

  const mkMember = (name: string, role: string) =>
    container.teamMemberService.createTeamMember({ projectId, name, role, avatar: '🤖' });

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject());
    projectId = project.id;
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  it('resolves a recursive tree with hydrated members and nested sub-teams', async () => {
    const lead = await mkMember('Lead', 'coordinator');
    const css = await mkMember('Stylist', 'CSS specialist');
    const apiLead = await mkMember('API Lead', 'coordinator');
    const apiDev = await mkMember('API Dev', 'backend');

    const root = await container.teamService.createTeam({
      projectId, name: 'Frontend Team', leaderId: lead.id, memberIds: [lead.id, css.id],
    });
    const api = await container.teamService.createTeam({
      projectId, name: 'API Team', leaderId: apiLead.id, memberIds: [apiLead.id, apiDev.id],
    });
    await container.teamService.addSubTeam(projectId, root.id, api.id);

    const tree = await container.teamService.getTeamTree(projectId, root.id);

    expect(tree.id).toBe(root.id);
    expect(tree.leaderId).toBe(lead.id);
    expect(tree.members.map(m => m.id).sort()).toEqual([lead.id, css.id].sort());
    expect(tree.members.find(m => m.id === lead.id)?.isLeader).toBe(true);
    expect(tree.members.find(m => m.id === css.id)?.isLeader).toBe(false);
    expect(tree.members.find(m => m.id === css.id)?.role).toBe('CSS specialist');

    // recursive sub-team is fully expanded
    expect(tree.subTeams).toHaveLength(1);
    const sub = tree.subTeams[0];
    expect(sub.id).toBe(api.id);
    expect(sub.leaderId).toBe(apiLead.id);
    expect(sub.members.map(m => m.id).sort()).toEqual([apiLead.id, apiDev.id].sort());
    expect(sub.members.find(m => m.id === apiDev.id)?.role).toBe('backend');
  });

  it('throws when the team does not exist', async () => {
    await expect(container.teamService.getTeamTree(projectId, 'team_missing')).rejects.toThrow();
  });

  it('skips members that no longer exist', async () => {
    const lead = await mkMember('Lead', 'coordinator');
    const ghost = await mkMember('Ghost', 'worker');
    const team = await container.teamService.createTeam({
      projectId, name: 'T', leaderId: lead.id, memberIds: [lead.id, ghost.id],
    });
    // Simulate a dangling reference (member removed out from under the team).
    await container.teamMemberRepo.delete(ghost.id);

    const tree = await container.teamService.getTeamTree(projectId, team.id);
    expect(tree.members.map(m => m.id)).toEqual([lead.id]);
  });

  describe('findSubTeamLedBy', () => {
    it('re-roots a spawned sub-team leader to its own branch', async () => {
      const rootLead = await mkMember('Root Lead', 'coordinator');
      const subLead = await mkMember('Sub Lead', 'coordinator');
      const subDev = await mkMember('Sub Dev', 'worker');

      const root = await container.teamService.createTeam({
        projectId, name: 'Root', leaderId: rootLead.id, memberIds: [rootLead.id],
      });
      const sub = await container.teamService.createTeam({
        projectId, name: 'Sub', leaderId: subLead.id, memberIds: [subLead.id, subDev.id],
      });
      await container.teamService.addSubTeam(projectId, root.id, sub.id);

      // The sub-team leader resolves to the sub-team id (scoped recursion).
      expect(await container.teamService.findSubTeamLedBy(projectId, root.id, subLead.id)).toBe(sub.id);
      // The root leader does NOT match the root itself (search is descendants-only).
      expect(await container.teamService.findSubTeamLedBy(projectId, root.id, rootLead.id)).toBeNull();
      // A plain worker leads nothing.
      expect(await container.teamService.findSubTeamLedBy(projectId, root.id, subDev.id)).toBeNull();
    });
  });
});
