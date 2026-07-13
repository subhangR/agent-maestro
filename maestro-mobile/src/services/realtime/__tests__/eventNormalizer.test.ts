import { normalizeEvent } from '../entitySync/eventNormalizer';

describe('normalizeEvent', () => {
  it('normalizes a known event envelope', () => {
    const ev = normalizeEvent({
      type: 'task:updated',
      event: 'task:updated',
      data: { id: 't1' },
      timestamp: 123,
    });
    expect(ev).not.toBeNull();
    expect(ev!.event).toBe('task:updated');
    expect(ev!.type).toBe('task:updated');
    expect(ev!.timestamp).toBe(123);
    expect((ev!.data as { id: string }).id).toBe('t1');
  });

  it('drops an unknown event name', () => {
    expect(normalizeEvent({ type: 'foo:bar', event: 'foo:bar', data: {}, timestamp: 1 })).toBeNull();
  });

  it('drops a pong (no event field)', () => {
    expect(normalizeEvent({ type: 'pong' })).toBeNull();
  });

  it('drops non-object / malformed input', () => {
    expect(normalizeEvent(null)).toBeNull();
    expect(normalizeEvent(42)).toBeNull();
    expect(normalizeEvent('task:updated')).toBeNull();
    expect(normalizeEvent({ event: 99 })).toBeNull();
  });

  it('falls back to a timestamp when absent', () => {
    const ev = normalizeEvent({ event: 'session:deleted', data: { id: 's1' } });
    expect(ev).not.toBeNull();
    expect(typeof ev!.timestamp).toBe('number');
  });

  it('handles both batched-array members and single immediate events', () => {
    // Caller branches on Array.isArray; the normalizer handles each member.
    const batch = [
      { type: 'task:created', event: 'task:created', data: { id: 'a' }, timestamp: 1 },
      { type: 'nope:nope', event: 'nope:nope', data: {}, timestamp: 2 },
      { type: 'session:updated', event: 'session:updated', data: { id: 'b' }, timestamp: 3 },
    ];
    const normalized = batch.map(normalizeEvent).filter(Boolean);
    expect(normalized).toHaveLength(2);

    const immediate = normalizeEvent({
      type: 'session:spawn',
      event: 'session:spawn',
      data: { projectId: 'p' },
      timestamp: 9,
    });
    expect(immediate!.event).toBe('session:spawn');
  });
});
