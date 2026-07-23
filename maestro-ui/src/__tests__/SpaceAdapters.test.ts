import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { User } from 'firebase/auth';
import {
  adoptSpaceTeamMember,
  installSpaceSpell,
  pullSpaceTaskToLocal,
} from '../firebase/SpaceAdapters';
import { maestroClient } from '../utils/MaestroClient';
import { SpaceTasksClient } from '../firebase/SpaceTasksClient';
import { SpaceTeamMembersClient } from '../firebase/SpaceTeamMembersClient';
import { SpaceSpellsClient } from '../firebase/SpaceSpellsClient';
import type { SpaceSpell, SpaceTask, SpaceTeamMember } from '../firebase/spaceShareTypes';
import type { MaestroTask, Spell, TeamMember } from '../app/types/maestro';

vi.mock('../utils/MaestroClient', () => ({
  maestroClient: {
    createTask: vi.fn(),
    updateTask: vi.fn(),
    createTeamMember: vi.fn(),
    listSpells: vi.fn(),
    createSpell: vi.fn(),
    updateSpell: vi.fn(),
  },
}));
vi.mock('../firebase/SpaceTasksClient', () => ({
  SpaceTasksClient: { recordPull: vi.fn() },
}));
vi.mock('../firebase/SpaceTeamMembersClient', () => ({
  SpaceTeamMembersClient: { recordAdopt: vi.fn() },
}));
vi.mock('../firebase/SpaceSpellsClient', () => ({
  SpaceSpellsClient: { recordInstall: vi.fn() },
}));

const user = { uid: 'user-1' } as User;

const makeSpaceSpell = (overrides: Partial<SpaceSpell> = {}): SpaceSpell =>
  ({
    id: 'ss_1',
    spaceId: 'space_1',
    name: 'Reviewer',
    description: 'Reviews things',
    body: 'body preview',
    icon: '✨',
    sourceSpellId: null,
    sourceProjectId: null,
    sourceUserId: null,
    createdBy: 'creator-uid',
    ...overrides,
  }) as SpaceSpell;

const v2Rules: SpaceSpell['rules'] = [
  {
    label: 'Guard',
    enabled: true,
    trigger: { type: 'hook', hookEvent: 'PreToolUse', matcher: 'Bash' },
    action: { type: 'run-command', command: 'echo hi', feedOutput: true },
  },
  {
    enabled: false,
    trigger: { type: 'hook', hookEvent: 'Stop' },
    action: { type: 'inject-prompt', prompt: 'Wrap up' },
  },
];

let warnSpy: MockInstance;

beforeEach(() => {
  vi.clearAllMocks();
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(maestroClient.listSpells).mockResolvedValue([]);
  vi.mocked(maestroClient.createSpell).mockResolvedValue({ id: 'local_spell_1' } as Spell);
  vi.mocked(maestroClient.updateSpell).mockResolvedValue({ id: 'existing_1' } as Spell);
  vi.mocked(maestroClient.createTask).mockResolvedValue({ id: 'local_task_1' } as MaestroTask);
  vi.mocked(maestroClient.updateTask).mockResolvedValue({ id: 'local_task_1' } as MaestroTask);
  vi.mocked(maestroClient.createTeamMember).mockResolvedValue({ id: 'local_tm_1' } as TeamMember);
  vi.mocked(SpaceSpellsClient.recordInstall).mockResolvedValue(undefined);
  vi.mocked(SpaceTasksClient.recordPull).mockResolvedValue(undefined);
  vi.mocked(SpaceTeamMembersClient.recordAdopt).mockResolvedValue(undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('installSpaceSpell', () => {
  it('installs a v2 shared spell with the exact rules and color', async () => {
    const spaceSpell = makeSpaceSpell({ rules: v2Rules, color: 'amber', schemaVersion: 2 });

    const result = await installSpaceSpell(user, spaceSpell);

    expect(result).toEqual({ status: 'installed' });
    expect(maestroClient.createSpell).toHaveBeenCalledTimes(1);
    expect(maestroClient.createSpell).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Reviewer',
        description: 'Reviews things',
        icon: '✨',
        color: 'amber',
        rules: [
          {
            label: 'Guard',
            enabled: true,
            trigger: { type: 'hook', hookEvent: 'PreToolUse', matcher: 'Bash' },
            action: { type: 'run-command', command: 'echo hi', feedOutput: true },
          },
          {
            enabled: false,
            trigger: { type: 'hook', hookEvent: 'Stop' },
            action: { type: 'inject-prompt', prompt: 'Wrap up' },
          },
        ],
      }),
    );
    expect(SpaceSpellsClient.recordInstall).toHaveBeenCalledWith(
      'space_1',
      'ss_1',
      'user-1',
      'local_spell_1',
    );
  });

  it('installs a legacy doc (no rules) as a single DISABLED inject-prompt rule from body', async () => {
    const spaceSpell = makeSpaceSpell({ body: 'legacy body text', rules: undefined });

    const result = await installSpaceSpell(user, spaceSpell);

    expect(result).toEqual({ status: 'installed' });
    const payload = vi.mocked(maestroClient.createSpell).mock.calls[0][0];
    expect(payload.rules).toHaveLength(1);
    expect(payload.rules[0]).toEqual({
      label: 'Imported from space (legacy shared spell — review before enabling)',
      enabled: false,
      trigger: { type: 'hook', hookEvent: 'Stop' },
      action: { type: 'inject-prompt', prompt: 'legacy body text' },
    });
    // No shared color on a legacy doc → default violet.
    expect(payload.color).toBe('violet');
  });

  it('falls back to description, then target name, for the legacy prompt', async () => {
    await installSpaceSpell(user, makeSpaceSpell({ body: '', description: 'desc only' }));
    let payload = vi.mocked(maestroClient.createSpell).mock.calls[0][0];
    expect(payload.rules[0].action).toEqual({ type: 'inject-prompt', prompt: 'desc only' });

    vi.mocked(maestroClient.createSpell).mockClear();
    await installSpaceSpell(user, makeSpaceSpell({ body: '', description: '', name: 'NameOnly' }));
    payload = vi.mocked(maestroClient.createSpell).mock.calls[0][0];
    expect(payload.rules[0].action).toEqual({ type: 'inject-prompt', prompt: 'NameOnly' });
  });

  it('returns a conflict when the name exists and no strategy is given', async () => {
    vi.mocked(maestroClient.listSpells).mockResolvedValue([
      { id: 'existing_1', name: 'Reviewer' } as Spell,
    ]);

    const result = await installSpaceSpell(user, makeSpaceSpell({ rules: v2Rules }));

    expect(result).toEqual({
      status: 'conflict',
      conflictingId: 'existing_1',
      conflictingName: 'Reviewer',
    });
    expect(maestroClient.createSpell).not.toHaveBeenCalled();
    expect(maestroClient.updateSpell).not.toHaveBeenCalled();
    expect(SpaceSpellsClient.recordInstall).not.toHaveBeenCalled();
  });

  it('cancel strategy aborts without writing anything', async () => {
    vi.mocked(maestroClient.listSpells).mockResolvedValue([
      { id: 'existing_1', name: 'Reviewer' } as Spell,
    ]);

    const result = await installSpaceSpell(user, makeSpaceSpell(), { onConflict: 'cancel' });

    expect(result).toEqual({ status: 'cancelled' });
    expect(maestroClient.createSpell).not.toHaveBeenCalled();
    expect(maestroClient.updateSpell).not.toHaveBeenCalled();
  });

  it('replace strategy updates the existing spell with rules + color and records the install', async () => {
    vi.mocked(maestroClient.listSpells).mockResolvedValue([
      { id: 'existing_1', name: 'Reviewer' } as Spell,
    ]);
    const spaceSpell = makeSpaceSpell({ rules: v2Rules, color: 'cyan' });

    const result = await installSpaceSpell(user, spaceSpell, { onConflict: 'replace' });

    expect(result).toEqual({ status: 'replaced' });
    expect(maestroClient.updateSpell).toHaveBeenCalledTimes(1);
    expect(maestroClient.updateSpell).toHaveBeenCalledWith(
      'existing_1',
      expect.objectContaining({
        name: 'Reviewer',
        color: 'cyan',
        rules: [
          expect.objectContaining({ label: 'Guard', enabled: true }),
          expect.objectContaining({ enabled: false }),
        ],
      }),
    );
    expect(maestroClient.createSpell).not.toHaveBeenCalled();
    expect(SpaceSpellsClient.recordInstall).toHaveBeenCalledWith(
      'space_1',
      'ss_1',
      'user-1',
      'existing_1',
    );
  });

  it('a nameOverride sidesteps the conflict and installs under the new name', async () => {
    vi.mocked(maestroClient.listSpells).mockResolvedValue([
      { id: 'existing_1', name: 'Reviewer' } as Spell,
    ]);

    const result = await installSpaceSpell(user, makeSpaceSpell({ rules: v2Rules }), {
      nameOverride: 'Reviewer (space)',
    });

    expect(result).toEqual({ status: 'installed' });
    expect(maestroClient.createSpell).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Reviewer (space)' }),
    );
  });

  it('a recordInstall failure does NOT fail the install', async () => {
    vi.mocked(SpaceSpellsClient.recordInstall).mockRejectedValue(new Error('offline'));

    const result = await installSpaceSpell(user, makeSpaceSpell({ rules: v2Rules }));

    expect(result).toEqual({ status: 'installed' });
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('pullSpaceTaskToLocal', () => {
  const spaceTask = {
    id: 'st_1',
    spaceId: 'space_1',
    title: 'Shared task',
    description: 'Shared description',
    priority: 'high',
    status: 'todo',
  } as unknown as SpaceTask;

  it('creates a local task with the mapped payload and records the pull', async () => {
    const created = await pullSpaceTaskToLocal(user, spaceTask, 'proj_1');

    expect(created).toEqual({ id: 'local_task_1' });
    expect(maestroClient.createTask).toHaveBeenCalledWith({
      projectId: 'proj_1',
      title: 'Shared task',
      description: 'Shared description',
      priority: 'high',
    });
    expect(SpaceTasksClient.recordPull).toHaveBeenCalledWith(
      'space_1',
      'st_1',
      'user-1',
      'local_task_1',
    );
  });

  it('defaults missing description/priority', async () => {
    await pullSpaceTaskToLocal(
      user,
      { ...spaceTask, description: undefined, priority: undefined } as unknown as SpaceTask,
      'proj_1',
    );
    expect(maestroClient.createTask).toHaveBeenCalledWith(
      expect.objectContaining({ description: '', priority: 'medium' }),
    );
  });

  it('preserves portable task settings and applies the shared status', async () => {
    await pullSpaceTaskToLocal(user, {
      ...spaceTask,
      status: 'blocked',
      initialPrompt: 'Review deployment',
      dueDate: '2026-08-01',
      dangerousMode: true,
      useWorktree: true,
    } as unknown as SpaceTask, 'proj_1');
    expect(maestroClient.createTask).toHaveBeenCalledWith(expect.objectContaining({
      initialPrompt: 'Review deployment', dueDate: '2026-08-01',
      dangerousMode: true, useWorktree: true,
    }));
    expect(maestroClient.updateTask).toHaveBeenCalledWith('local_task_1', { status: 'blocked' });
  });

  it('recordPull failure is best-effort: the pull still returns the created task', async () => {
    vi.mocked(SpaceTasksClient.recordPull).mockRejectedValue(new Error('offline'));

    const created = await pullSpaceTaskToLocal(user, spaceTask, 'proj_1');

    expect(created).toEqual({ id: 'local_task_1' });
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('adoptSpaceTeamMember', () => {
  const makeSpaceTm = (overrides: Partial<SpaceTeamMember> = {}): SpaceTeamMember =>
    ({
      id: 'stm_1',
      spaceId: 'space_1',
      name: 'Ada',
      role: 'Engineer',
      identity: 'You are Ada.',
      avatar: '🤖',
      model: 'opus',
      agentTool: 'claude-code',
      mode: 'coordinator',
      skillIds: ['sk_1'],
      commandPermissions: { groups: { git: true } },
      sourceTeamMemberId: null,
      sourceProjectId: null,
      sourceUserId: null,
      createdBy: 'creator-uid',
      ...overrides,
    }) as SpaceTeamMember;

  it('keeps a whitelisted mode and records the adopt with the created id', async () => {
    const created = await adoptSpaceTeamMember(user, makeSpaceTm({ mode: 'worker' }), 'proj_1');

    expect(created).toEqual({ id: 'local_tm_1' });
    expect(maestroClient.createTeamMember).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj_1',
        name: 'Ada',
        role: 'Engineer',
        mode: 'worker',
        skillIds: ['sk_1'],
        commandPermissions: { groups: { git: true } },
      }),
    );
    expect(SpaceTeamMembersClient.recordAdopt).toHaveBeenCalledWith(
      'space_1',
      'stm_1',
      'user-1',
      'local_tm_1',
    );
  });

  it('drops a non-whitelisted mode (undefined in the payload)', async () => {
    await adoptSpaceTeamMember(user, makeSpaceTm({ mode: 'root-overlord' }), 'proj_1');
    const payload = vi.mocked(maestroClient.createTeamMember).mock.calls[0][0];
    expect(payload.mode).toBeUndefined();
  });

  it('drops a null mode and defaults role/identity/avatar', async () => {
    await adoptSpaceTeamMember(
      user,
      makeSpaceTm({ mode: null, role: '', identity: null as unknown as string, avatar: null }),
      'proj_1',
    );
    const payload = vi.mocked(maestroClient.createTeamMember).mock.calls[0][0];
    expect(payload.mode).toBeUndefined();
    expect(payload.role).toBe('Adopted from space');
    expect(payload.identity).toBe('');
    expect(payload.avatar).toBe('');
  });

  it('recordAdopt failure is best-effort: adoption still succeeds', async () => {
    vi.mocked(SpaceTeamMembersClient.recordAdopt).mockRejectedValue(new Error('offline'));

    const created = await adoptSpaceTeamMember(user, makeSpaceTm(), 'proj_1');

    expect(created).toEqual({ id: 'local_tm_1' });
    expect(warnSpy).toHaveBeenCalled();
  });
});
