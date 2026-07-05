import { spawnSessionSchema, createTaskSchema, updateTaskSchema } from '../src/api/validation';

/**
 * Regression tests for the spawn wire-contract.
 *
 * PR #83 introduced `launchConfig` as the canonical launch override and tightened
 * validation (strict enum for `agentTool`, `.strict()` on launchConfig). That broke
 * backward compatibility: legacy/older clients and a UI sending `launchConfig` could
 * be hard-rejected with HTTP 400 "Unrecognized key". These tests pin the contract so
 * the schema stays tolerant of legacy values and forward-compatible extra fields,
 * while still accepting new model names.
 */
describe('spawnSessionSchema — backward & forward compatibility', () => {
  const base = { projectId: 'proj_1', taskIds: ['task_1'] };

  it('accepts the canonical launchConfig the post-PR83 UI sends', () => {
    const result = spawnSessionSchema.safeParse({
      ...base,
      launchConfig: {
        provider: 'claude',
        model: 'claude-opus-4-8',
        reasoningEffort: 'max',
        accessMode: 'fullAccess',
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a legacy bare agentTool value ("claude") instead of failing as an unknown enum', () => {
    const result = spawnSessionSchema.safeParse({ ...base, agentTool: 'claude', model: 'opus' });
    expect(result.success).toBe(true);
  });

  it('accepts legacy top-level model + agentTool (pre-launchConfig clients)', () => {
    const result = spawnSessionSchema.safeParse({ ...base, agentTool: 'codex', model: 'gpt-5.5' });
    expect(result.success).toBe(true);
  });

  it('tolerates unknown/future fields inside launchConfig (not .strict())', () => {
    const result = spawnSessionSchema.safeParse({
      ...base,
      launchConfig: { provider: 'openai', model: 'gpt-5.5', temperature: 0.4 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts arbitrary (new) model names — model is a free string, not an enum', () => {
    const result = spawnSessionSchema.safeParse({
      ...base,
      launchConfig: { provider: 'claude', model: 'claude-opus-9-9-future' },
    });
    expect(result.success).toBe(true);
  });

  it('still rejects a launchConfig missing required provider/model', () => {
    const result = spawnSessionSchema.safeParse({
      ...base,
      launchConfig: { reasoningEffort: 'high' },
    });
    expect(result.success).toBe(false);
  });

  it('still rejects unknown keys at the top level of the spawn body', () => {
    const result = spawnSessionSchema.safeParse({ ...base, bogusTopLevelKey: true });
    expect(result.success).toBe(false);
  });
});

// ─── Task schema teammate-assignment & dueDate contract ───────────────────────

describe('createTaskSchema — teammate assignment and dueDate fields', () => {
  const baseCreate = { projectId: 'proj_1' };

  it('accepts teamMemberId', () => {
    const result = createTaskSchema.safeParse({ ...baseCreate, teamMemberId: 'tm_1' });
    expect(result.success).toBe(true);
  });

  it('accepts teamMemberIds array', () => {
    const result = createTaskSchema.safeParse({ ...baseCreate, teamMemberIds: ['tm_1', 'tm_2'] });
    expect(result.success).toBe(true);
  });

  it('accepts dueDate string', () => {
    const result = createTaskSchema.safeParse({ ...baseCreate, dueDate: '2025-12-31' });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys (strict schema)', () => {
    const result = createTaskSchema.safeParse({ ...baseCreate, unknownKey: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('updateTaskSchema — teammate assignment and dueDate fields', () => {
  it('accepts teamMemberId', () => {
    const result = updateTaskSchema.safeParse({ teamMemberId: 'tm_1' });
    expect(result.success).toBe(true);
  });

  it('accepts teamMemberIds array', () => {
    const result = updateTaskSchema.safeParse({ teamMemberIds: ['tm_1', 'tm_2'] });
    expect(result.success).toBe(true);
  });

  it('accepts dueDate string', () => {
    const result = updateTaskSchema.safeParse({ dueDate: '2025-12-31' });
    expect(result.success).toBe(true);
  });

  it('accepts null dueDate (clearing)', () => {
    const result = updateTaskSchema.safeParse({ dueDate: null });
    expect(result.success).toBe(true);
  });

  it('accepts clearing teamMemberIds to empty array', () => {
    const result = updateTaskSchema.safeParse({ teamMemberIds: [] });
    expect(result.success).toBe(true);
  });

  it('rejects unknown keys (strict schema)', () => {
    const result = updateTaskSchema.safeParse({ unknownKey: 'x' });
    expect(result.success).toBe(false);
  });
});
