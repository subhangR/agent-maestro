import { backoffBase, backoffDelay, MAX_BACKOFF_MS } from '../entitySync/reconnect';

describe('reconnect backoff', () => {
  it('doubles per attempt from 1s', () => {
    expect(backoffBase(0)).toBe(1000);
    expect(backoffBase(1)).toBe(2000);
    expect(backoffBase(2)).toBe(4000);
    expect(backoffBase(3)).toBe(8000);
  });

  it('caps at 30s', () => {
    expect(backoffBase(5)).toBe(MAX_BACKOFF_MS);
    expect(backoffBase(10)).toBe(MAX_BACKOFF_MS);
    expect(backoffBase(100)).toBe(MAX_BACKOFF_MS);
  });

  it('treats negative attempts as 0', () => {
    expect(backoffBase(-3)).toBe(1000);
  });

  it('adds 0-50% jitter within [base, base*1.5]', () => {
    // rng=0 → no jitter; rng=1 → full 50%.
    expect(backoffDelay(2, () => 0)).toBe(4000);
    expect(backoffDelay(2, () => 1)).toBe(6000);
    expect(backoffDelay(2, () => 0.5)).toBe(5000);
  });

  it('stays within bounds for random jitter at the cap', () => {
    for (let i = 0; i < 100; i++) {
      const d = backoffDelay(10);
      expect(d).toBeGreaterThanOrEqual(MAX_BACKOFF_MS);
      expect(d).toBeLessThanOrEqual(MAX_BACKOFF_MS * 1.5);
    }
  });
});
