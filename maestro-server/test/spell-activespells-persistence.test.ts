import { TestDataDir, createTestContainer, silentLogger } from './helpers';
import { FileSystemSpellRepository } from '../src/infrastructure/repositories/FileSystemSpellRepository';
import { SpellService } from '../src/application/services/SpellService';
import { TimestampIdGenerator } from '../src/infrastructure/common/TimestampIdGenerator';
import { Spell } from '../src/types';

/**
 * Regression: FileSystemSessionRepository.update() previously had NO handler for
 * updates.activeSpells, so SpellService.activateSpell/deactivateSpell/resetLoop
 * all called sessionRepo.update(id, { activeSpells }) but the change was SILENTLY
 * DROPPED — activation returned success yet the reloaded session.activeSpells stayed [].
 *
 * These tests drive the REAL FileSystemSessionRepository (not a mock) end-to-end
 * through SpellService and assert the persisted-and-reloaded session reflects each
 * mutation: activate persists, deactivate removes, resetLoop zeroes counters.
 */

describe('FileSystemSessionRepository — activeSpells persistence (spell flow)', () => {
  let dataDir: TestDataDir;
  let container: Awaited<ReturnType<typeof createTestContainer>>;
  let spellRepo: FileSystemSpellRepository;
  let spellService: SpellService;
  let projectId: string;

  const spell: Spell = {
    id: 'sp_persist_1',
    name: 'Persist Test',
    description: 'spell used to assert activeSpells persistence',
    color: 'amber' as any,
    rules: [
      { id: 'r_a', enabled: true, trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 5 } } as any,
      { id: 'r_b', enabled: true, trigger: { type: 'hook', hookEvent: 'Stop' }, action: { type: 'continue-loop', maxIterations: 5 } } as any,
    ],
    createdAt: 0,
    updatedAt: 0,
  };

  beforeEach(async () => {
    dataDir = new TestDataDir();
    container = await createTestContainer(dataDir.getPath());

    const project = await container.projectService.createProject({
      name: 'p',
      workingDir: dataDir.getPath(),
    } as any);
    projectId = project.id;

    spellRepo = new FileSystemSpellRepository(dataDir.getPath(), new TimestampIdGenerator(), silentLogger);
    await spellRepo.initialize();
    await spellRepo.create(spell);

    spellService = new SpellService(
      container.projectRepo,
      container.taskRepo,
      container.sessionRepo,
      container.teamMemberRepo,
      null as any, // skillLoader — unused on this path
      null as any, // customPromptRepo — unused on this path
      spellRepo,
      container.eventBus,
      container.idGenerator,
    );
  });

  afterEach(async () => {
    await dataDir.cleanup();
  });

  async function makeSession(): Promise<string> {
    const session = await container.sessionRepo.create({
      projectId,
      taskIds: [],
      name: 'sess',
    } as any);
    return session.id;
  }

  it('activateSpell persists activeSpells to disk (reload shows it)', async () => {
    const sessionId = await makeSession();

    await spellService.activateSpell(spell.id, [sessionId], null);

    const reloaded = await container.sessionRepo.findById(sessionId);
    expect(reloaded!.activeSpells).toHaveLength(1);
    expect(reloaded!.activeSpells![0].spellId).toBe(spell.id);
    expect(reloaded!.activeSpells![0].enabled).toBe(true);
  });

  it('deactivateSpell removes the entry (reload shows it gone)', async () => {
    const sessionId = await makeSession();
    await spellService.activateSpell(spell.id, [sessionId], null);

    await spellService.deactivateSpell(spell.id, [sessionId]);

    const reloaded = await container.sessionRepo.findById(sessionId);
    expect(reloaded!.activeSpells ?? []).toHaveLength(0);
  });

  it('resetLoop zeroes counters and persists (single-rule and all-rules)', async () => {
    const sessionId = await makeSession();
    await spellService.activateSpell(spell.id, [sessionId], null);

    // Simulate loop iterations accumulating on the persisted active spell.
    const active = (await container.sessionRepo.findById(sessionId))!.activeSpells![0];
    active.ruleIterations = { r_a: 3, r_b: 4 };
    await container.sessionRepo.update(sessionId, {
      activeSpells: [active],
    } as any);

    // Sanity: the counters actually persisted (proves the repo fix, not just resetLoop).
    let reloaded = await container.sessionRepo.findById(sessionId);
    expect(reloaded!.activeSpells![0].ruleIterations).toEqual({ r_a: 3, r_b: 4 });

    // Single-rule reset.
    await spellService.resetLoop(spell.id, sessionId, 'r_a');
    reloaded = await container.sessionRepo.findById(sessionId);
    expect(reloaded!.activeSpells![0].ruleIterations).toEqual({ r_a: 0, r_b: 4 });

    // All-rules reset.
    await spellService.resetLoop(spell.id, sessionId);
    reloaded = await container.sessionRepo.findById(sessionId);
    expect(reloaded!.activeSpells![0].ruleIterations).toEqual({});
  });
});
