import {
  MasterProjectBootstrap,
  VoiceState,
  ALEXA_DEBUGGER_TEAM_MEMBER_ID,
} from '../../src/infrastructure/bootstrap/MasterProjectBootstrap';
import { TestDataDir, createTestContainer, silentLogger } from '../helpers';

const ALEXA_ID = 'tm_system_alexa_coordinator';

describe('MasterProjectBootstrap', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  function makeBootstrap(voiceState: VoiceState) {
    return new MasterProjectBootstrap(
      container.projectRepo,
      container.teamMemberRepo,
      container.taskService,
      silentLogger,
      voiceState,
      ALEXA_ID,
    );
  }

  it('renames an existing Default project to Master and sets isMaster', async () => {
    const def = await container.projectService.createProject({ name: 'Default', workingDir: '/tmp/x' });

    const voiceState: VoiceState = {};
    await makeBootstrap(voiceState).ensure();

    const updated = await container.projectRepo.findById(def.id);
    expect(updated?.name).toBe('Master');
    expect(updated?.isMaster).toBe(true);
    expect(voiceState.masterProjectId).toBe(def.id);
  });

  it('seeds a non-deletable Alexa Coordinator with the stable ID', async () => {
    await container.projectService.createProject({ name: 'Default', workingDir: '/tmp/x' });

    const voiceState: VoiceState = {};
    await makeBootstrap(voiceState).ensure();

    const member = await container.teamMemberRepo.findById(voiceState.masterProjectId!, ALEXA_ID);
    expect(member).toBeTruthy();
    expect(member?.id).toBe(ALEXA_ID);
    expect(member?.systemKind).toBe('alexa-coordinator');
    expect(member?.mode).toBe('coordinator');

    await expect(container.teamMemberRepo.delete(ALEXA_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('idempotently seeds a non-deletable Alexa Debugger with the stable ID', async () => {
    await container.projectService.createProject({ name: 'Default', workingDir: '/tmp/x' });

    const first: VoiceState = {};
    await makeBootstrap(first).ensure();

    const second: VoiceState = {};
    await makeBootstrap(second).ensure();

    const member = await container.teamMemberRepo.findById(first.masterProjectId!, ALEXA_DEBUGGER_TEAM_MEMBER_ID);
    expect(member).toBeTruthy();
    expect(member?.id).toBe(ALEXA_DEBUGGER_TEAM_MEMBER_ID);
    expect(member?.systemKind).toBe('alexa-debugger');
    expect(member?.mode).toBe('worker');

    const debuggers = (await container.teamMemberRepo.findByProjectId(first.masterProjectId!))
      .filter(m => m.systemKind === 'alexa-debugger');
    expect(debuggers).toHaveLength(1);

    await expect(container.teamMemberRepo.delete(ALEXA_DEBUGGER_TEAM_MEMBER_ID)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('creates a Voice Directives task in Master', async () => {
    await container.projectService.createProject({ name: 'Default', workingDir: '/tmp/x' });

    const voiceState: VoiceState = {};
    await makeBootstrap(voiceState).ensure();

    expect(voiceState.voiceDirectiveTaskId).toBeTruthy();
    const tasks = await container.taskService.listTasksByProject(voiceState.masterProjectId!);
    expect(tasks.some(t => t.id === voiceState.voiceDirectiveTaskId)).toBe(true);
  });

  it('is idempotent across repeated startups', async () => {
    await container.projectService.createProject({ name: 'Default', workingDir: '/tmp/x' });

    const first: VoiceState = {};
    await makeBootstrap(first).ensure();

    const second: VoiceState = {};
    await makeBootstrap(second).ensure();

    expect(second.masterProjectId).toBe(first.masterProjectId);
    expect(second.voiceDirectiveTaskId).toBe(first.voiceDirectiveTaskId);

    const masters = (await container.projectRepo.findAll()).filter(p => p.name === 'Master');
    expect(masters).toHaveLength(1);

    const voiceTasks = (await container.taskService.listTasksByProject(first.masterProjectId!))
      .filter(t => t.title === 'Voice Directives');
    expect(voiceTasks).toHaveLength(1);
  });

  it('creates a fresh Master project when no Default exists', async () => {
    const voiceState: VoiceState = {};
    await makeBootstrap(voiceState).ensure();

    expect(voiceState.masterProjectId).toBeTruthy();
    const master = await container.projectRepo.findById(voiceState.masterProjectId!);
    expect(master?.name).toBe('Master');
    expect(master?.isMaster).toBe(true);
  });
});
