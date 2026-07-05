import { describe, expect, it, vi } from 'vitest';
import {
  buildSpellBody,
  buildSpellShareInput,
  buildTaskShareInput,
  buildTeamMemberShareInput,
  localStatusToSpace,
} from '../hooks/useSpaceSharing';
import type { MaestroTask, Spell, TaskStatus } from '../app/types/maestro';

// The hook module imports the Space*Clients (which transitively pull the
// Firestore SDK); stub them so this suite stays pure and import-safe.
vi.mock('../firebase/SpaceTasksClient', () => ({
  SpaceTasksClient: { subscribe: vi.fn() },
}));
vi.mock('../firebase/SpaceTeamMembersClient', () => ({
  SpaceTeamMembersClient: { subscribe: vi.fn() },
}));
vi.mock('../firebase/SpaceSpellsClient', () => ({
  SpaceSpellsClient: { subscribe: vi.fn() },
}));
vi.mock('firebase/firestore', () => ({
  Timestamp: class Timestamp {},
}));

const makeSpell = (overrides: Partial<Spell> = {}): Spell => ({
  id: 'spell_1',
  name: 'Reviewer',
  description: 'Reviews things',
  color: 'emerald',
  rules: [],
  createdAt: 1,
  updatedAt: 2,
  ...overrides,
});

describe('localStatusToSpace', () => {
  it('maps archived to cancelled', () => {
    expect(localStatusToSpace('archived')).toBe('cancelled');
  });

  it('maps every other status 1:1', () => {
    const passthrough: TaskStatus[] = [
      'todo',
      'in_progress',
      'in_review',
      'completed',
      'cancelled',
      'blocked',
    ];
    for (const status of passthrough) {
      expect(localStatusToSpace(status)).toBe(status);
    }
  });
});

describe('buildTaskShareInput', () => {
  it('maps a local task onto the shared input with provenance', () => {
    const task = {
      id: 'task_1',
      projectId: 'proj_1',
      title: 'Ship it',
      description: 'All of it',
      status: 'in_progress',
      priority: 'high',
    } as unknown as MaestroTask;
    expect(buildTaskShareInput(task)).toEqual({
      title: 'Ship it',
      description: 'All of it',
      status: 'in_progress',
      priority: 'high',
      sourceTaskId: 'task_1',
      sourceProjectId: 'proj_1',
    });
  });

  it('defaults a missing description to empty string and archived to cancelled', () => {
    const task = {
      id: 'task_2',
      projectId: 'proj_1',
      title: 'Old one',
      description: undefined,
      status: 'archived',
      priority: 'low',
    } as unknown as MaestroTask;
    const input = buildTaskShareInput(task);
    expect(input.description).toBe('');
    expect(input.status).toBe('cancelled');
  });
});

describe('buildTeamMemberShareInput', () => {
  it('maps a fully-populated team member', () => {
    const input = buildTeamMemberShareInput({
      id: 'tm_1',
      projectId: 'proj_1',
      name: 'Ada',
      role: 'Engineer',
      identity: 'You are Ada.',
      avatar: '🤖',
      model: 'opus',
      agentTool: 'claude-code',
      mode: 'coordinator',
      skillIds: ['sk_1'],
      commandPermissions: { groups: { git: true } },
    });
    expect(input).toEqual({
      name: 'Ada',
      role: 'Engineer',
      identity: 'You are Ada.',
      avatar: '🤖',
      model: 'opus',
      agentTool: 'claude-code',
      mode: 'coordinator',
      skillIds: ['sk_1'],
      commandPermissions: { groups: { git: true } },
      sourceTeamMemberId: 'tm_1',
      sourceProjectId: 'proj_1',
    });
  });

  it('normalizes missing optionals to nulls / empty containers', () => {
    const input = buildTeamMemberShareInput({
      id: 'tm_2',
      projectId: 'proj_2',
      name: 'Bare',
      role: 'Worker',
      identity: '',
      avatar: '',
    });
    expect(input.avatar).toBeNull();
    expect(input.model).toBeNull();
    expect(input.agentTool).toBeNull();
    expect(input.mode).toBeNull();
    expect(input.skillIds).toEqual([]);
    expect(input.commandPermissions).toEqual({});
  });
});

describe('buildSpellBody', () => {
  it('falls back to the description when there are no rules', () => {
    expect(buildSpellBody(makeSpell({ rules: [], description: 'Just a summary' }))).toBe(
      'Just a summary',
    );
    expect(
      buildSpellBody(makeSpell({ rules: [], description: undefined as unknown as string })),
    ).toBe('');
  });

  it('renders one line per rule including the disabled marker', () => {
    const spell = makeSpell({
      rules: [
        {
          id: 'r1',
          label: 'Lint gate',
          enabled: true,
          trigger: { type: 'hook', hookEvent: 'PreToolUse', matcher: 'Write' },
          action: { type: 'inject-prompt', prompt: 'Check lint first' },
        },
        {
          id: 'r2',
          enabled: false,
          trigger: { type: 'hook', hookEvent: 'Stop' },
          action: { type: 'run-command', command: 'bun test' },
        },
        {
          id: 'r3',
          enabled: true,
          trigger: { type: 'schedule', intervalMs: 1000 },
          action: { type: 'notify-channel', channel: 'ops' },
        },
        {
          id: 'r4',
          enabled: true,
          trigger: { type: 'hook', hookEvent: 'SubagentStop' },
          action: { type: 'continue-loop', loopType: 'plan-execute' },
        },
        {
          id: 'r5',
          enabled: true,
          trigger: { type: 'hook', hookEvent: 'SessionStart' },
          action: { type: 'feed-context', prompt: 'Context here' },
        },
      ],
    });
    expect(buildSpellBody(spell).split('\n')).toEqual([
      '• Lint gate — on PreToolUse (Write) → inject-prompt: Check lint first',
      '• on Stop → run-command: bun test (disabled)',
      '• on schedule → notify-channel: ops',
      '• on SubagentStop → continue-loop: plan-execute',
      '• on SessionStart → feed-context: Context here',
    ]);
  });
});

describe('buildSpellShareInput', () => {
  it('is lossless: rules mapped with ids dropped, color kept, sourceProjectId null', () => {
    const spell = makeSpell({
      id: 'spell_9',
      color: 'amber',
      icon: '✨',
      rules: [
        {
          id: 'rule_local_1',
          label: 'Guard',
          enabled: true,
          trigger: { type: 'hook', hookEvent: 'PreToolUse', matcher: 'Bash' },
          action: { type: 'run-command', command: 'echo hi', feedOutput: true },
        },
        {
          id: 'rule_local_2',
          enabled: false,
          trigger: { type: 'hook', hookEvent: 'Stop' },
          action: { type: 'inject-prompt', prompt: 'Wrap up' },
        },
      ],
    });
    const input = buildSpellShareInput(spell);
    expect(input.name).toBe('Reviewer');
    expect(input.color).toBe('amber');
    expect(input.icon).toBe('✨');
    expect(input.sourceSpellId).toBe('spell_9');
    expect(input.sourceProjectId).toBeNull();
    expect(input.body).toBe(buildSpellBody(spell));
    expect(input.rules).toEqual([
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
    ]);
    // Local rule ids must not leak into the shared payload.
    for (const r of input.rules) {
      expect('id' in r).toBe(false);
    }
    // Absent label is omitted entirely (Firestore rejects undefined).
    expect('label' in input.rules[1]).toBe(false);
  });

  it('normalizes missing description/icon/rules', () => {
    const input = buildSpellShareInput(
      makeSpell({
        description: undefined as unknown as string,
        icon: undefined,
        rules: undefined as unknown as Spell['rules'],
      }),
    );
    expect(input.description).toBe('');
    expect(input.icon).toBeNull();
    expect(input.rules).toEqual([]);
  });
});
