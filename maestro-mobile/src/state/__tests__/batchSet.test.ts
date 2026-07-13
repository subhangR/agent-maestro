import { createBatchSet, normalizeSession, mergeSummarySession, statusOnlyPatch } from '../batchSet';
import { makeSession, flush } from './factories';
import type { SessionStatusChangedPayload } from '@/domain';

describe('createBatchSet', () => {
  it('coalesces N updaters in one tick into ONE set, and ALL survive', async () => {
    interface S {
      tasks: Record<string, { id: string }>;
    }
    let state: S = { tasks: {} };
    let setCalls = 0;
    const set = (u: (s: S) => Partial<S>) => {
      state = { ...state, ...u(state) };
      setCalls += 1;
    };
    const { batchSet } = createBatchSet<S>(set);

    for (let i = 0; i < 50; i += 1) {
      batchSet((prev) => ({ tasks: { ...prev.tasks, [i]: { id: String(i) } } }));
    }
    // Nothing applied synchronously.
    expect(setCalls).toBe(0);

    await flush();

    // One commit, all 50 present (the read-live-state + spread-whole-map contract).
    expect(setCalls).toBe(1);
    expect(Object.keys(state.tasks)).toHaveLength(50);
  });

  it('uses a single set() call for a single updater', async () => {
    let calls = 0;
    const { batchSet } = createBatchSet<{ n: number }>(() => {
      calls += 1;
    });
    batchSet(() => ({ n: 1 }));
    await flush();
    expect(calls).toBe(1);
  });

  it('schedules a fresh batch after a flush', async () => {
    let calls = 0;
    const { batchSet } = createBatchSet<{ n: number }>(() => {
      calls += 1;
    });
    batchSet(() => ({ n: 1 }));
    await flush();
    batchSet(() => ({ n: 2 }));
    await flush();
    expect(calls).toBe(2);
  });
});

describe('normalizeSession', () => {
  it('defaults missing arrays + status', () => {
    const raw = { ...makeSession(), taskIds: undefined, timeline: undefined, events: undefined, docs: undefined, status: undefined } as never;
    const n = normalizeSession(raw);
    expect(n.taskIds).toEqual([]);
    expect(n.timeline).toEqual([]);
    expect(n.events).toEqual([]);
    expect(n.docs).toEqual([]);
    expect(n.status).toBe('spawning');
  });
});

describe('mergeSummarySession (summary-vs-full guard)', () => {
  it('keeps a populated array when the summary is empty', () => {
    const existing = makeSession({ timeline: [{ id: 't1', type: 'progress', timestamp: 1 }], taskIds: ['task_1'] });
    const summary = makeSession({ id: existing.id, timeline: [], taskIds: [] });
    const merged = mergeSummarySession(existing, summary);
    expect(merged.timeline).toHaveLength(1);
    expect(merged.taskIds).toEqual(['task_1']);
  });

  it('lets a populated summary win over an empty existing', () => {
    const existing = makeSession({ timeline: [] });
    const summary = makeSession({ id: existing.id, timeline: [{ id: 't2', type: 'progress', timestamp: 2 }] });
    expect(mergeSummarySession(existing, summary).timeline).toHaveLength(1);
  });

  it('returns incoming verbatim when no existing', () => {
    const incoming = makeSession();
    expect(mergeSummarySession(undefined, incoming)).toBe(incoming);
  });
});

describe('statusOnlyPatch', () => {
  it('shallow-merges status/lastActivity/needsInput without touching other fields', () => {
    const existing = makeSession({ status: 'working', name: 'keep-me', taskIds: ['task_9'] });
    const payload: SessionStatusChangedPayload = {
      id: existing.id,
      status: 'idle',
      lastActivity: '1500',
      needsInput: { active: true, message: 'go?' },
    };
    const patched = statusOnlyPatch(existing, payload);
    expect(patched.status).toBe('idle');
    expect(patched.lastActivity).toBe(1500);
    expect(patched.needsInput).toEqual({ active: true, message: 'go?' });
    expect(patched.name).toBe('keep-me');
    expect(patched.taskIds).toEqual(['task_9']);
  });
});
