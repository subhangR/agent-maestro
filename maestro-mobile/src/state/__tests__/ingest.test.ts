import { ingestEvent, ingestBatch } from '../ingest';
import { useEntityStore, resetEntities } from '../entityStore';
import { asSessionId, asTaskId } from '@/domain';
import { makeSession, makeTask, ev, flush } from './factories';

beforeEach(() => {
  resetEntities();
});

describe('ingest reducer — sessions', () => {
  it('session:created upserts a normalized session', async () => {
    const s = makeSession({ id: 'sess_a' });
    ingestEvent(ev('session:created', s));
    await flush();
    expect(useEntityStore.getState().sessions[asSessionId('sess_a')]?.name).toBe(s.name);
  });

  it('session:updated full-replaces an existing session', async () => {
    const s = makeSession({ id: 'sess_b', status: 'working' });
    ingestEvent(ev('session:created', s));
    await flush();
    ingestEvent(ev('session:updated', makeSession({ id: 'sess_b', status: 'completed' })));
    await flush();
    expect(useEntityStore.getState().sessions[asSessionId('sess_b')]?.status).toBe('completed');
  });

  it('session:status_changed patches an existing session, ignores an absent one', async () => {
    const s = makeSession({ id: 'sess_c', status: 'working' });
    ingestEvent(ev('session:created', s));
    await flush();

    ingestEvent(ev('session:status_changed', { id: 'sess_c', status: 'idle', lastActivity: '2000' }));
    ingestEvent(ev('session:status_changed', { id: 'sess_missing', status: 'idle', lastActivity: '2000' }));
    await flush();

    expect(useEntityStore.getState().sessions[asSessionId('sess_c')]?.status).toBe('idle');
    expect(useEntityStore.getState().sessions[asSessionId('sess_missing')]).toBeUndefined();
  });

  it('session:deleted removes it', async () => {
    const s = makeSession({ id: 'sess_d' });
    ingestEvent(ev('session:created', s));
    await flush();
    ingestEvent(ev('session:deleted', { id: 'sess_d' }));
    await flush();
    expect(useEntityStore.getState().sessions[asSessionId('sess_d')]).toBeUndefined();
  });
});

describe('ingest reducer — tasks', () => {
  it('task:created upserts + guarantees taskSessionStatuses object', async () => {
    const t = { ...makeTask({ id: 'task_a' }), taskSessionStatuses: undefined };
    ingestEvent(ev('task:created', t));
    await flush();
    const stored = useEntityStore.getState().tasks[asTaskId('task_a')];
    expect(stored).toBeDefined();
    expect(stored?.taskSessionStatuses).toEqual({});
  });

  it('task:deleted removes it', async () => {
    ingestEvent(ev('task:created', makeTask({ id: 'task_b' })));
    await flush();
    ingestEvent(ev('task:deleted', { id: 'task_b' }));
    await flush();
    expect(useEntityStore.getState().tasks[asTaskId('task_b')]).toBeUndefined();
  });
});

describe('ingest reducer — coalescing', () => {
  it('a batched flush of N events triggers exactly ONE store notification', async () => {
    let notifications = 0;
    const unsub = useEntityStore.subscribe(() => {
      notifications += 1;
    });

    const events = Array.from({ length: 50 }, (_, i) => ev('task:created', makeTask({ id: `bulk_${i}` })));
    ingestBatch(events);
    await flush();
    unsub();

    expect(notifications).toBe(1);
    const tasks = useEntityStore.getState().tasks;
    expect(Object.keys(tasks).filter((k) => k.startsWith('bulk_'))).toHaveLength(50);
  });

  it('coalesces a MIXED-entity flush (tasks + sessions) into one commit, all surviving', async () => {
    let notifications = 0;
    const unsub = useEntityStore.subscribe(() => {
      notifications += 1;
    });
    ingestBatch([
      ev('task:created', makeTask({ id: 'mix_t1' })),
      ev('session:created', makeSession({ id: 'mix_s1' })),
      ev('task:created', makeTask({ id: 'mix_t2' })),
      ev('session:created', makeSession({ id: 'mix_s2' })),
    ]);
    await flush();
    unsub();

    expect(notifications).toBe(1);
    const st = useEntityStore.getState();
    expect(st.tasks[asTaskId('mix_t1')]).toBeDefined();
    expect(st.tasks[asTaskId('mix_t2')]).toBeDefined();
    expect(st.sessions[asSessionId('mix_s1')]).toBeDefined();
    expect(st.sessions[asSessionId('mix_s2')]).toBeDefined();
  });
});
