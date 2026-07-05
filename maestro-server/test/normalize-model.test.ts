import { normalizeModelId, LEGACY_MODEL_ALIASES } from '../src/types';

describe('normalizeModelId', () => {
  it('passes live Fable 5 through unchanged (no longer retired)', () => {
    expect(normalizeModelId('claude-fable-5')).toBe('claude-fable-5');
    expect(normalizeModelId('claude-fable-5[1m]')).toBe('claude-fable-5[1m]');
  });

  it('passes live Sonnet 5 through unchanged', () => {
    expect(normalizeModelId('claude-sonnet-5')).toBe('claude-sonnet-5');
    expect(normalizeModelId('claude-sonnet-5[1m]')).toBe('claude-sonnet-5[1m]');
  });

  it('passes other active model ids through unchanged', () => {
    expect(normalizeModelId('claude-opus-4-8')).toBe('claude-opus-4-8');
    expect(normalizeModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(normalizeModelId('gpt-5.5')).toBe('gpt-5.5');
  });

  it('passes through undefined (no model configured)', () => {
    expect(normalizeModelId(undefined)).toBeUndefined();
  });

  it('has no retired aliases (map is currently empty)', () => {
    expect(LEGACY_MODEL_ALIASES).toEqual({});
  });
});
