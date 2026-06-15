import { normalizeMode } from '../src/types';

describe('normalizeMode', () => {
  describe('without a coordinator (top-level / UI spawn)', () => {
    it('keeps worker as worker', () => {
      expect(normalizeMode('worker', false)).toBe('worker');
    });

    it('keeps coordinator as coordinator', () => {
      expect(normalizeMode('coordinator', false)).toBe('coordinator');
    });

    it('downgrades coordinated-worker to worker', () => {
      // Regression: a team member stored as coordinated-worker spawned at top
      // level must not yield a coordinated mode, or the manifest would be
      // incoherent (coordinated mode with no coordinatorSessionId) and fail
      // normalization.
      expect(normalizeMode('coordinated-worker', false)).toBe('worker');
    });

    it('downgrades coordinated-coordinator to coordinator', () => {
      expect(normalizeMode('coordinated-coordinator', false)).toBe('coordinator');
    });

    it('normalizes legacy execute to worker', () => {
      expect(normalizeMode('execute', false)).toBe('worker');
    });

    it('normalizes legacy coordinate to coordinator', () => {
      expect(normalizeMode('coordinate', false)).toBe('coordinator');
    });
  });

  describe('with a coordinator (spawned by a parent session)', () => {
    it('promotes worker to coordinated-worker', () => {
      expect(normalizeMode('worker', true)).toBe('coordinated-worker');
    });

    it('promotes coordinator to coordinated-coordinator', () => {
      expect(normalizeMode('coordinator', true)).toBe('coordinated-coordinator');
    });

    it('keeps coordinated-worker as coordinated-worker', () => {
      expect(normalizeMode('coordinated-worker', true)).toBe('coordinated-worker');
    });

    it('keeps coordinated-coordinator as coordinated-coordinator', () => {
      expect(normalizeMode('coordinated-coordinator', true)).toBe('coordinated-coordinator');
    });
  });
});
