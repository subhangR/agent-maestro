import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/MaestroClient', () => ({
  maestroClient: {
    activateSpell: vi.fn(),
    deactivateSpell: vi.fn(),
    toggleSpell: vi.fn(),
    resetSpellLoop: vi.fn(),
    listEnsembles: vi.fn().mockResolvedValue([]),
  },
}));

import { maestroClient } from '../utils/MaestroClient';
import { useSpellActivationStore } from '../stores/useSpellActivationStore';
import { useActiveSpellsStore } from '../stores/useActiveSpellsStore';
import { useSpellNotificationsStore } from '../stores/useSpellNotificationsStore';

const mocked = maestroClient as unknown as {
  activateSpell: ReturnType<typeof vi.fn>;
  deactivateSpell: ReturnType<typeof vi.fn>;
  toggleSpell: ReturnType<typeof vi.fn>;
  resetSpellLoop: ReturnType<typeof vi.fn>;
  listEnsembles: ReturnType<typeof vi.fn>;
};

const initialActivation = useSpellActivationStore.getState();
const initialActive = useActiveSpellsStore.getState();
const initialNotifs = useSpellNotificationsStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  mocked.listEnsembles.mockResolvedValue([]);
  useSpellActivationStore.setState(initialActivation, true);
  useActiveSpellsStore.setState(initialActive, true);
  useSpellNotificationsStore.setState(initialNotifs, true);
  useSpellNotificationsStore.setState({ history: [], toasts: [] });
});

function seedActive(sessionId = 's1', spellId = 'sp1') {
  useActiveSpellsStore.getState().activate({
    sessionIds: [sessionId], spellId, spellName: 'Spell', color: 'violet',
    castAt: 1, enabled: true, ruleIterations: { r1: 2 },
  });
}

describe('castSpell (C1)', () => {
  it('forwards castMode and ensembleName to the server call', async () => {
    mocked.activateSpell.mockResolvedValue({
      spell: { name: 'Crew Spell' },
      sessions: [{ sessionId: 's1' }, { sessionId: 's2' }],
      ensembleId: 'ens_1',
    });
    const result = await useSpellActivationStore.getState().castSpell({
      spellId: 'sp1',
      targetSessionIds: ['s1', 's2'],
      castMode: 'coordinate',
      ensembleName: 'Refactor crew',
    });
    expect(mocked.activateSpell).toHaveBeenCalledWith(
      'sp1', ['s1', 's2'], null, { castMode: 'coordinate', ensembleName: 'Refactor crew' },
    );
    expect(result).toEqual({ spellId: 'sp1', sessionIds: ['s1', 's2'] });
    expect(useSpellActivationStore.getState().lastCastReceipt?.summary)
      .toMatch(/Cast .* on 2 sessions/);
  });

  it('leaves castMode/ensembleName undefined for a plain cast', async () => {
    mocked.activateSpell.mockResolvedValue({ spell: { name: 'S' }, sessions: [{ sessionId: 's1' }] });
    await useSpellActivationStore.getState().castSpell({ spellId: 'sp1', targetSessionIds: ['s1'] });
    expect(mocked.activateSpell).toHaveBeenCalledWith(
      'sp1', ['s1'], null, { castMode: undefined, ensembleName: undefined },
    );
  });

  it('surfaces failures: error state + warn toast, and rethrows', async () => {
    mocked.activateSpell.mockRejectedValue(new Error('boom'));
    await expect(
      useSpellActivationStore.getState().castSpell({ spellId: 'sp1', targetSessionIds: ['s1'] }),
    ).rejects.toThrow('boom');
    expect(useSpellActivationStore.getState().error).toBe('boom');
    expect(useSpellActivationStore.getState().casting).toBe(false);
    const history = useSpellNotificationsStore.getState().history;
    expect(history[0].level).toBe('warn');
    expect(history[0].message).toMatch(/Cast failed: boom/);
  });
});

describe('setSpellEnabled (C4 — toggle endpoint)', () => {
  it('hits the toggle endpoint (not deactivate/re-activate) with an optimistic flip', async () => {
    seedActive();
    mocked.toggleSpell.mockResolvedValue({ sessionId: 's1', spellId: 'sp1', activeSpell: {} });
    await useSpellActivationStore.getState().setSpellEnabled('s1', 'sp1', false);
    expect(mocked.toggleSpell).toHaveBeenCalledWith('sp1', 's1', false);
    expect(mocked.deactivateSpell).not.toHaveBeenCalled();
    expect(mocked.activateSpell).not.toHaveBeenCalled();
    const row = useActiveSpellsStore.getState().byMaestroSessionId['s1'][0];
    expect(row.enabled).toBe(false);
    expect(row.ruleIterations).toEqual({ r1: 2 }); // preserved — no re-cast
  });

  it('rolls back the optimistic flip and toasts when the server rejects', async () => {
    seedActive();
    mocked.toggleSpell.mockRejectedValue(new Error('offline'));
    await expect(
      useSpellActivationStore.getState().setSpellEnabled('s1', 'sp1', false),
    ).rejects.toThrow('offline');
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].enabled).toBe(true);
    expect(useSpellActivationStore.getState().error).toBe('offline');
    expect(useSpellNotificationsStore.getState().history[0].message).toMatch(/Toggle failed/);
  });
});

describe('resetIteration', () => {
  it('passes ruleId through and zeroes only that rule optimistically', async () => {
    useActiveSpellsStore.getState().activate({
      sessionIds: ['s1'], spellId: 'sp1', spellName: 'S', color: 'violet',
      castAt: 1, enabled: true, ruleIterations: { r1: 2, r2: 5 },
    });
    mocked.resetSpellLoop.mockResolvedValue({});
    await useSpellActivationStore.getState().resetIteration('s1', 'sp1', 'r2');
    expect(mocked.resetSpellLoop).toHaveBeenCalledWith('sp1', 's1', 'r2');
    expect(useActiveSpellsStore.getState().byMaestroSessionId['s1'][0].ruleIterations)
      .toEqual({ r1: 2, r2: 0 });
  });

  it('sets error + toast and rethrows when the reset fails', async () => {
    seedActive();
    mocked.resetSpellLoop.mockRejectedValue(new Error('nope'));
    await expect(
      useSpellActivationStore.getState().resetIteration('s1', 'sp1'),
    ).rejects.toThrow('nope');
    expect(useSpellActivationStore.getState().error).toBe('nope');
    expect(useSpellNotificationsStore.getState().history[0].message).toMatch(/Loop reset failed/);
  });
});

describe('removeActiveSpell', () => {
  it('deactivates on the server for the single session', async () => {
    mocked.deactivateSpell.mockResolvedValue({ sessionIds: ['s1'] });
    await useSpellActivationStore.getState().removeActiveSpell('s1', 'sp1');
    expect(mocked.deactivateSpell).toHaveBeenCalledWith('sp1', ['s1']);
  });
});
