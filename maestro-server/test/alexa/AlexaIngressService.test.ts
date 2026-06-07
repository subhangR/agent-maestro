import { AlexaIngressService } from '../../src/application/services/AlexaIngressService';
import { VoiceState } from '../../src/infrastructure/bootstrap/MasterProjectBootstrap';
import { TeamMember } from '../../src/types';
import { TestDataDir, createTestContainer, createTestProject, createTestTask, silentLogger } from '../helpers';

const ALEXA_ID = 'tm_system_alexa_coordinator';
const DEBUGGER_ID = 'tm_system_alexa_debugger';

describe('AlexaIngressService', () => {
  let testDataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let masterProjectId: string;
  let taskId: string;

  beforeEach(async () => {
    testDataDir = new TestDataDir();
    container = await createTestContainer(testDataDir.getPath());
    const project = await container.projectService.createProject(createTestProject({ name: 'Master', isMaster: true }));
    masterProjectId = project.id;
    const task = await container.taskService.createTask(createTestTask(masterProjectId, { title: 'Voice Directives' }));
    taskId = task.id;

    // Seed a debugger team member (systemKind-based lookup is the source of truth).
    const now = new Date().toISOString();
    await container.teamMemberRepo.create({
      id: DEBUGGER_ID,
      projectId: masterProjectId,
      systemKind: 'alexa-debugger',
      name: 'Alexa Debugger',
      role: 'Live voice loopback',
      avatar: '🎙️',
      mode: 'worker',
      isDefault: false,
      status: 'active',
      memory: [],
      createdAt: now,
      updatedAt: now,
    } as TeamMember);
  });

  afterEach(async () => {
    await testDataDir.cleanup();
  });

  function makeService(voiceState: VoiceState, spawnFn = jest.fn(async () => 'sess_spawned')) {
    const service = new AlexaIngressService({
      logger: silentLogger,
      eventBus: container.eventBus,
      sessionService: container.sessionService,
      teamMemberRepo: container.teamMemberRepo,
      voiceState,
      alexaRootTeamMemberId: ALEXA_ID,
      serverUrl: 'http://localhost:4568',
      spawnFn,
    });
    return { service, spawnFn };
  }

  it('spawns a coordinator when none is alive (and only once)', async () => {
    const voiceState: VoiceState = { masterProjectId, voiceDirectiveTaskId: taskId };
    const { service, spawnFn } = makeService(voiceState);

    const result = await service.handleUtterance({ query: 'hello from curl' });

    expect(result.spawned).toBe(true);
    expect(result.sessionId).toBe('sess_spawned');
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(spawnFn).toHaveBeenCalledWith(expect.objectContaining({
      projectId: masterProjectId,
      taskId,
      teamMemberId: ALEXA_ID,
    }));
  });

  it('reuses an existing live coordinator session instead of spawning', async () => {
    const session = await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Alexa Coordinator',
      metadata: { mode: 'coordinator', teamMemberId: ALEXA_ID },
    } as any);

    const voiceState: VoiceState = { masterProjectId, voiceDirectiveTaskId: taskId };
    const { service, spawnFn } = makeService(voiceState);

    const emitted: any[] = [];
    container.eventBus.on('session:prompt_send', (e: any) => { emitted.push(e); });

    const result = await service.handleUtterance({ query: 'do the thing' });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.spawned).toBe(false);
    expect(result.sessionId).toBe(session.id);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ sessionId: session.id, content: 'do the thing' });

    const updated = await container.sessionService.getSession(session.id);
    expect(updated.timeline.some(ev => ev.type === 'prompt_received' && ev.message?.includes('do the thing'))).toBe(true);
  });

  it('ignores terminated coordinator sessions and spawns fresh', async () => {
    await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Dead Alexa Coordinator',
      status: 'stopped',
      metadata: { mode: 'coordinator', teamMemberId: ALEXA_ID },
    } as any);

    const voiceState: VoiceState = { masterProjectId, voiceDirectiveTaskId: taskId };
    const { service, spawnFn } = makeService(voiceState);

    const result = await service.handleUtterance({ query: 'wake up' });
    expect(spawnFn).toHaveBeenCalledTimes(1);
    expect(result.spawned).toBe(true);
  });

  it('throws when the master project is not yet initialized', async () => {
    const { service } = makeService({});
    await expect(service.handleUtterance({ query: 'x' })).rejects.toMatchObject({ code: 'ALEXA_INGRESS_NOT_READY' });
  });

  it('routes to an active debugger session instead of the system coordinator', async () => {
    // A live system coordinator also exists; the debugger override must win.
    const coordinator = await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Alexa Coordinator',
      metadata: { mode: 'coordinator', teamMemberId: ALEXA_ID },
    } as any);

    const debuggerSession = await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Alexa Debugger',
      metadata: { mode: 'worker', teamMemberId: DEBUGGER_ID },
    } as any);

    const voiceState: VoiceState = { masterProjectId, voiceDirectiveTaskId: taskId };
    const { service, spawnFn } = makeService(voiceState);

    const emitted: any[] = [];
    container.eventBus.on('session:prompt_send', (e: any) => { emitted.push(e); });

    const result = await service.handleUtterance({ query: 'debug this' });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.spawned).toBe(false);
    expect(result.sessionId).toBe(debuggerSession.id);
    expect(result.sessionId).not.toBe(coordinator.id);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ sessionId: debuggerSession.id, content: 'debug this' });
  });

  it('falls back to the system coordinator when no debugger session exists', async () => {
    const coordinator = await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Alexa Coordinator',
      metadata: { mode: 'coordinator', teamMemberId: ALEXA_ID },
    } as any);

    const voiceState: VoiceState = { masterProjectId, voiceDirectiveTaskId: taskId };
    const { service, spawnFn } = makeService(voiceState);

    const result = await service.handleUtterance({ query: 'no debugger here' });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.spawned).toBe(false);
    expect(result.sessionId).toBe(coordinator.id);
  });

  it('falls back to the system coordinator when the debugger session has ended', async () => {
    await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Dead Alexa Debugger',
      status: 'stopped',
      metadata: { mode: 'worker', teamMemberId: DEBUGGER_ID },
    } as any);

    const coordinator = await container.sessionService.createSession({
      projectId: masterProjectId,
      taskIds: [taskId],
      name: 'Alexa Coordinator',
      metadata: { mode: 'coordinator', teamMemberId: ALEXA_ID },
    } as any);

    const voiceState: VoiceState = { masterProjectId, voiceDirectiveTaskId: taskId };
    const { service, spawnFn } = makeService(voiceState);

    const result = await service.handleUtterance({ query: 'debugger is dead' });

    expect(spawnFn).not.toHaveBeenCalled();
    expect(result.spawned).toBe(false);
    expect(result.sessionId).toBe(coordinator.id);
  });
});
