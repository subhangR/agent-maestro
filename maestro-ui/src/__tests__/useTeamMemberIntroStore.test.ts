import { beforeEach, describe, expect, it } from 'vitest';
import { useTeamMemberIntroStore } from '../stores/useTeamMemberIntroStore';

const reset = () =>
  useTeamMemberIntroStore.setState({
    queue: [],
    currentIndex: 0,
    isOpen: false,
    suppressedIds: new Set<string>(),
  });

const store = () => useTeamMemberIntroStore.getState();

describe('useTeamMemberIntroStore', () => {
  beforeEach(reset);

  it('enqueues a created member and opens the dialog', () => {
    const enqueued = store().enqueue('tm_1');
    expect(enqueued).toBe(true);
    expect(store().isOpen).toBe(true);
    expect(store().queue).toEqual(['tm_1']);
    expect(store().currentIndex).toBe(0);
  });

  it('suppresses a locally-created member exactly once', () => {
    store().markLocallyCreated('tm_local');
    // First incoming event is suppressed (the user already configured it).
    expect(store().enqueue('tm_local')).toBe(false);
    expect(store().isOpen).toBe(false);
    expect(store().queue).toEqual([]);
    // The mark is consumed — a later genuine re-create would introduce.
    expect(store().enqueue('tm_local')).toBe(true);
    expect(store().isOpen).toBe(true);
  });

  it('ignores duplicates already in the queue', () => {
    store().enqueue('tm_1');
    expect(store().enqueue('tm_1')).toBe(false);
    expect(store().queue).toEqual(['tm_1']);
  });

  it('queues multiple members and navigates next/back', () => {
    store().enqueue('tm_1');
    store().enqueue('tm_2');
    store().enqueue('tm_3');
    expect(store().queue).toEqual(['tm_1', 'tm_2', 'tm_3']);

    store().goNext();
    expect(store().currentIndex).toBe(1);
    store().goNext();
    expect(store().currentIndex).toBe(2);

    store().goPrev();
    expect(store().currentIndex).toBe(1);
  });

  it('does not step back past the first member', () => {
    store().enqueue('tm_1');
    store().goPrev();
    expect(store().currentIndex).toBe(0);
  });

  it('closes when advancing past the last member', () => {
    store().enqueue('tm_1');
    store().enqueue('tm_2');
    store().goNext(); // -> index 1 (last)
    store().goNext(); // past end -> close
    expect(store().isOpen).toBe(false);
    expect(store().queue).toEqual([]);
    expect(store().currentIndex).toBe(0);
  });

  it('close() dismisses the whole flow', () => {
    store().enqueue('tm_1');
    store().enqueue('tm_2');
    store().close();
    expect(store().isOpen).toBe(false);
    expect(store().queue).toEqual([]);
    expect(store().currentIndex).toBe(0);
  });
});
