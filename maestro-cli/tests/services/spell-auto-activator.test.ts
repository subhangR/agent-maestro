import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The activator's only seam is the shared APIClient instance.
vi.mock('../../src/api.js', () => ({
  api: { post: vi.fn() },
}));

import { api } from '../../src/api.js';
import { autoActivateManifestSpells } from '../../src/services/spell-auto-activator.js';
import type { MaestroManifest } from '../../src/types/manifest.js';

const mockPost = api.post as unknown as ReturnType<typeof vi.fn>;

const SESSION_ID = 'sess_test_123';

function manifestWithSpells(spells: MaestroManifest['spells']): MaestroManifest {
  // Only the `spells` field is read by the activator; cast the partial through unknown.
  return { spells } as unknown as MaestroManifest;
}

let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockPost.mockReset();
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.MAESTRO_DEBUG;
});

afterEach(() => {
  errSpy.mockRestore();
});

describe('autoActivateManifestSpells', () => {
  it('activates each manifest spell via POST with targetSessionIds=[sessionId]', async () => {
    mockPost.mockResolvedValue({});
    const manifest = manifestWithSpells([
      { id: 'spell_a', name: 'Alpha' },
      { id: 'spell_b', name: 'Beta' },
    ]);

    await autoActivateManifestSpells(manifest, SESSION_ID);

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenCalledWith('/api/spells/spell_a/activate', { targetSessionIds: [SESSION_ID] });
    expect(mockPost).toHaveBeenCalledWith('/api/spells/spell_b/activate', { targetSessionIds: [SESSION_ID] });
  });

  it('is a no-op when manifest.spells is missing', async () => {
    await autoActivateManifestSpells(manifestWithSpells(undefined), SESSION_ID);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('is a no-op when manifest.spells is empty', async () => {
    await autoActivateManifestSpells(manifestWithSpells([]), SESSION_ID);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('swallows a per-spell failure (fail-open) without rejecting and still activates the others', async () => {
    mockPost
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({});
    const manifest = manifestWithSpells([
      { id: 'spell_bad', name: 'Bad' },
      { id: 'spell_ok', name: 'Ok' },
    ]);

    await expect(autoActivateManifestSpells(manifest, SESSION_ID)).resolves.toBeUndefined();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('logs a visible warning to stderr on failure even when debug is off', async () => {
    mockPost.mockRejectedValue(new Error('activation exploded'));

    await autoActivateManifestSpells(manifestWithSpells([{ id: 'spell_x', name: 'X' }]), SESSION_ID);

    expect(errSpy).toHaveBeenCalledTimes(1);
    const msg = String(errSpy.mock.calls[0][0]);
    expect(msg).toContain('WARN');
    expect(msg).toContain('spell_x');
    expect(msg).toContain('activation exploded');
  });

  it('does not reject even on a non-Error throw path (allSettled)', async () => {
    // A synchronous non-Error throw from post must not bubble out of the batch.
    mockPost.mockImplementation(() => { throw 'string failure'; });

    await expect(
      autoActivateManifestSpells(manifestWithSpells([{ id: 'spell_z', name: 'Z' }]), SESSION_ID),
    ).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
  });

  it('stays quiet on success when debug is off', async () => {
    mockPost.mockResolvedValue({});
    await autoActivateManifestSpells(manifestWithSpells([{ id: 'spell_ok', name: 'Ok' }]), SESSION_ID);
    expect(errSpy).not.toHaveBeenCalled();
  });
});
