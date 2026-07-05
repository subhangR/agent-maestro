import { describe, it, expect } from 'vitest';
import type { MaestroManifest } from '../../src/types/manifest.js';
import { normalizeManifest } from '../../src/prompting/manifest-normalizer.js';
import { normalizeModelId } from '../../src/types/manifest.js';

function buildManifest(overrides: Partial<MaestroManifest> = {}): MaestroManifest {
  return {
    manifestVersion: '1.0',
    mode: 'worker',
    tasks: [
      {
        id: 'task-1',
        title: 'Test',
        description: 'Test description',
        acceptanceCriteria: ['Done'],
        projectId: 'proj-1',
        createdAt: '2026-02-21T00:00:00Z',
      },
    ],
    session: {
      model: 'sonnet',
      permissionMode: 'acceptEdits',
    },
    ...overrides,
  };
}

describe('manifest-normalizer', () => {
  it('normalizes legacy execute mode to worker', () => {
    const manifest = buildManifest({ mode: 'execute' as any });
    const result = normalizeManifest(manifest);

    expect(result.manifest.mode).toBe('worker');
    expect(result.legacyModeNormalized).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('normalizes legacy coordinate mode to coordinated-coordinator when coordinator session exists', () => {
    const manifest = buildManifest({
      mode: 'coordinate' as any,
      coordinatorSessionId: 'sess-parent',
    });

    const result = normalizeManifest(manifest);

    expect(result.manifest.mode).toBe('coordinated-coordinator');
    expect(result.errors[0]).toContain('requires exactly one self profile');
  });

  it('builds teamMemberProfiles from legacy singular team member fields', () => {
    const manifest = buildManifest({
      teamMemberId: 'tm-1',
      teamMemberName: 'Alice',
      teamMemberAvatar: 'A',
      teamMemberRole: 'Engineer',
      teamMemberIdentity: 'Build backend APIs',
      teamMemberMemory: ['Prefers TypeScript'],
    });

    const result = normalizeManifest(manifest);

    expect(result.manifest.teamMemberProfiles).toBeDefined();
    expect(result.manifest.teamMemberProfiles?.[0].id).toBe('tm-1');
    expect(result.manifest.teamMemberProfiles?.[0].identity).toBe('Build backend APIs');
  });

  it('leaves live Fable 5 / Sonnet 5 model ids unchanged everywhere the spawner reads them', () => {
    const manifest = buildManifest({
      session: { model: 'claude-fable-5', permissionMode: 'acceptEdits' },
      launchConfig: { provider: 'claude', model: 'claude-fable-5[1m]' },
      teamMemberProfiles: [
        {
          id: 'tm-2',
          name: 'Bob',
          avatar: 'B',
          identity: 'Write tests',
          model: 'claude-sonnet-5',
        },
      ],
    } as Partial<MaestroManifest>);

    const result = normalizeManifest(manifest);

    expect(result.manifest.session.model).toBe('claude-fable-5');
    expect(result.manifest.launchConfig?.model).toBe('claude-fable-5[1m]');
    expect(result.manifest.teamMemberProfiles?.[0].model).toBe('claude-sonnet-5');
  });

  it('leaves a live model id on session.launchConfig unchanged (the field the spawner launches)', () => {
    const manifest = buildManifest({
      session: {
        model: 'claude-sonnet-5',
        permissionMode: 'acceptEdits',
        launchConfig: { provider: 'claude', model: 'claude-fable-5[1m]' },
      },
    } as Partial<MaestroManifest>);

    const result = normalizeManifest(manifest);

    expect(result.manifest.session.launchConfig?.model).toBe('claude-fable-5[1m]');
    expect(result.manifest.session.model).toBe('claude-sonnet-5');
  });

  it('flags deprecated workflow fields as warnings', () => {
    const manifest = buildManifest({
      teamMemberWorkflowTemplateId: 'execute-simple',
      teamMemberCustomWorkflow: 'Do the thing',
    });

    const result = normalizeManifest(manifest);

    expect(result.deprecatedWorkflowFieldsPresent).toBe(true);
    expect(result.warnings.some((message) => message.includes('Deprecated workflow fields'))).toBe(true);
  });

  it('dedupes team members and filters self from availableTeamMembers', () => {
    const manifest = buildManifest({
      teamMemberProfiles: [
        {
          id: 'tm-self',
          name: 'Self',
          avatar: 'S',
          identity: 'Self profile',
        },
      ],
      availableTeamMembers: [
        {
          id: 'tm-self',
          name: 'Self',
          role: 'Engineer',
          identity: 'Self identity',
          avatar: 'S',
        },
        {
          id: 'tm-a',
          name: 'Alice',
          role: 'Engineer',
          identity: 'A identity',
          avatar: 'A',
        },
        {
          id: 'tm-a',
          name: 'Alice duplicate',
          role: 'Engineer',
          identity: 'A identity duplicate',
          avatar: 'A',
        },
      ],
    });

    const result = normalizeManifest(manifest);
    expect(result.errors).toEqual([]);
    expect(result.manifest.availableTeamMembers).toHaveLength(1);
    expect(result.manifest.availableTeamMembers?.[0].id).toBe('tm-a');
    expect(result.warnings.some((message) => message.includes('Removed duplicate team member'))).toBe(true);
    expect(result.warnings.some((message) => message.includes('Filtered 1 self team member'))).toBe(true);
  });

  it('enforces strict single-self cardinality for coordinator modes by default', () => {
    const noSelf = normalizeManifest(buildManifest({
      mode: 'coordinator',
      teamMemberProfiles: [],
    }));
    const multiSelf = normalizeManifest(buildManifest({
      mode: 'coordinator',
      teamMemberProfiles: [
        { id: 'tm-1', name: 'A', avatar: 'A', identity: 'A' },
        { id: 'tm-2', name: 'B', avatar: 'B', identity: 'B' },
      ],
    }));

    expect(noSelf.errors[0]).toContain('requires exactly one self profile');
    expect(multiSelf.errors[0]).toContain('requires exactly one self profile');
  });

  it('supports permissive coordinator fallback and chooses deterministic-first self profile', () => {
    const result = normalizeManifest(
      buildManifest({
        mode: 'coordinator',
        teamMemberProfiles: [
          { id: 'tm-2', name: 'B', avatar: 'B', identity: 'B' },
          { id: 'tm-1', name: 'A', avatar: 'A', identity: 'A' },
        ],
      }),
      { coordinatorSelfIdentityPolicy: 'permissive' },
    );

    expect(result.errors).toEqual([]);
    expect(result.manifest.teamMemberProfiles).toHaveLength(1);
    expect(result.manifest.teamMemberProfiles?.[0].id).toBe('tm-2');
    expect(result.warnings.some((message) => message.includes('deterministic first profile'))).toBe(true);
  });

  it('warns (fail-open) when a coordinated mode has no coordinatorSessionId', () => {
    const result = normalizeManifest(buildManifest({
      mode: 'coordinated-worker',
      coordinatorSessionId: undefined,
    }));

    // Fail-open policy (manifest-normalizer.ts:197-198): a missing
    // coordinatorSessionId is a warning, not a hard error — no errors are
    // raised so a coordinated session is never stripped of its ability to run.
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((message) => message.includes('has no coordinatorSessionId; proceeding without it'))).toBe(true);
  });
});

describe('normalizeModelId identity (LEGACY_MODEL_ALIASES is empty — no live model is coerced)', () => {
  it.each([
    'claude-fable-5',
    'claude-fable-5[1m]',
    'claude-sonnet-5',
    'claude-sonnet-5[1m]',
    'anthropic:claude-fable-5',
    'anthropic/claude-fable-5',
  ])('returns %s unchanged (pass-through to the spawner --model flag)', (id) => {
    expect(normalizeModelId(id)).toBe(id);
  });
});
