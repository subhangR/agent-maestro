import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { MaestroManifest, TeamStructureNode } from '../../src/types/manifest.js';
import { PromptBuilder } from '../../src/services/prompt-builder.js';

const ORIG_V2 = process.env.MAESTRO_PROMPT_IDENTITY_V2;

const TREE: TeamStructureNode = {
  id: 'team-root',
  name: 'Frontend Team',
  leaderId: 'tm-lead',
  members: [
    { id: 'tm-lead', name: 'Lead', role: 'coordinator', identity: 'You lead.', mode: 'coordinator', isLeader: true },
    { id: 'tm-css', name: 'Stylist', role: 'CSS specialist', identity: 'You do CSS.', mode: 'worker', isLeader: false },
  ],
  subTeams: [
    {
      id: 'team-api',
      name: 'API Team',
      leaderId: 'tm-api-lead',
      members: [
        { id: 'tm-api-lead', name: 'API Lead', role: 'coordinator', identity: 'You lead API.', mode: 'coordinator', isLeader: true },
        { id: 'tm-api-dev', name: 'API Dev', role: 'backend', identity: 'You build endpoints.', mode: 'worker', isLeader: false },
      ],
      subTeams: [],
    },
  ],
};

function buildManifest(overrides: Partial<MaestroManifest> = {}): MaestroManifest {
  return {
    manifestVersion: '1.0',
    mode: 'worker',
    tasks: [
      {
        id: 'task-1',
        title: 'Test Task',
        description: 'A test task',
        acceptanceCriteria: ['Done'],
        projectId: 'proj-1',
        createdAt: '2026-05-31T00:00:00Z',
      },
    ],
    session: { model: 'sonnet', permissionMode: 'acceptEdits' },
    ...overrides,
  };
}

describe('<team_structure> block', () => {
  beforeEach(() => { process.env.MAESTRO_PROMPT_IDENTITY_V2 = 'true'; });
  afterEach(() => {
    if (ORIG_V2 === undefined) delete process.env.MAESTRO_PROMPT_IDENTITY_V2;
    else process.env.MAESTRO_PROMPT_IDENTITY_V2 = ORIG_V2;
  });

  it('renders the recursive team tree for a coordinator', () => {
    const manifest = buildManifest({ mode: 'coordinator', teamStructure: TREE });
    const xml = new PromptBuilder().buildSystemXml(manifest);

    expect(xml).toContain('<team_structure>');
    // root team + members
    expect(xml).toContain('id="team-root"');
    expect(xml).toContain('id="tm-css"');
    expect(xml).toContain('role="CSS specialist"');
    // nested sub-team + its leader (the recursive hierarchy)
    expect(xml).toContain('id="team-api"');
    expect(xml).toContain('leader_id="tm-api-lead"');
    expect(xml).toContain('id="tm-api-dev"');
    // expertise surfaced for delegation
    expect(xml).toContain('You build endpoints.');
  });

  it('includes the recursive delegation protocol', () => {
    const manifest = buildManifest({ mode: 'coordinator', teamStructure: TREE });
    const xml = new PromptBuilder().buildSystemXml(manifest);
    expect(xml).toContain('<protocol>');
    expect(xml).toContain('spawn that sub-team');
    expect(xml).toContain('maestro session spawn --task');
  });

  it('does not render for a plain worker', () => {
    const manifest = buildManifest({ mode: 'worker', teamStructure: TREE });
    const xml = new PromptBuilder().buildSystemXml(manifest);
    expect(xml).not.toContain('<team_structure>');
  });

  it('omits the block when no team is bound', () => {
    const manifest = buildManifest({ mode: 'coordinator' });
    const xml = new PromptBuilder().buildSystemXml(manifest);
    expect(xml).not.toContain('<team_structure>');
  });
});
