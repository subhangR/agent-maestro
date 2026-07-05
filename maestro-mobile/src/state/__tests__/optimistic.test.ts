import { optimisticPatch, rollback, clearOptimistic, applyOverrides, __clearAllOverrides } from '../optimistic';
import { ingestEvent } from '../ingest';
import { useEntityStore, resetEntities } from '../entityStore';
import { asSessionId } from '@/domain';
import { makeSession, ev, flush } from './factories';

beforeEach(() => {
  resetEntities();
  __clearAllOverrides();
});

const seed = async (over = {}) => {
  const s = makeSession({ id: 'sess_x', ...over });
  ingestEvent(ev('session:created', s));
  await flush();
  return s;
};

describe('optimisticPatch / rollback', () => {
  it('applies immediately and returns a token; rollback restores prior values', async () => {
    await seed({ archivedAt: null });
    const token = optimisticPatch('sessions', 'sess_x', { archivedAt: 1234 });
    expect(token).not.toBeNull();
    expect(useEntityStore.getState().sessions[asSessionId('sess_x')]?.archivedAt).toBe(1234);

    rollback(token!);
    expect(useEntityStore.getState().sessions[asSessionId('sess_x')]?.archivedAt).toBeNull();
  });

  it('returns null when the entity is absent (no-op)', () => {
    expect(optimisticPatch('sessions', 'nope', { archivedAt: 1 })).toBeNull();
  });
});

describe('override survives an in-flight server replace (generalized pendingLifecycle)', () => {
  it('a stale session:updated cannot bounce an un-confirmed optimistic field', async () => {
    await seed({ archivedAt: null });
    optimisticPatch('sessions', 'sess_x', { archivedAt: 9999 });

    // Server echoes the OLD value while our PATCH is in flight.
    ingestEvent(ev('session:updated', makeSession({ id: 'sess_x', archivedAt: null })));
    await flush();

    expect(useEntityStore.getState().sessions[asSessionId('sess_x')]?.archivedAt).toBe(9999);
  });

  it('after clearOptimistic, the next server payload is authoritative', async () => {
    await seed({ archivedAt: null });
    optimisticPatch('sessions', 'sess_x', { archivedAt: 9999 });
    clearOptimistic('sessions', 'sess_x', 'archivedAt');

    ingestEvent(ev('session:updated', makeSession({ id: 'sess_x', archivedAt: null })));
    await flush();

    expect(useEntityStore.getState().sessions[asSessionId('sess_x')]?.archivedAt).toBeNull();
  });
});

describe('applyOverrides', () => {
  it('re-applies an active override onto an inbound entity', async () => {
    await seed({ archivedAt: null });
    optimisticPatch('sessions', 'sess_x', { archivedAt: 42 });
    const inbound = makeSession({ id: 'sess_x', archivedAt: null });
    expect(applyOverrides('sessions', 'sess_x', inbound).archivedAt).toBe(42);
  });

  it('is a passthrough when there is no override', () => {
    const inbound = makeSession({ id: 'sess_y', archivedAt: 7 });
    expect(applyOverrides('sessions', 'sess_y', inbound)).toBe(inbound);
  });
});
