import { api } from '../api.js';
import type { MaestroManifest } from '../types/manifest.js';

/**
 * Auto-activate any spells the manifest carries (typically resolved from
 * Task.spellIds at spawn time). Best-effort and fail-open: a per-spell failure
 * is swallowed (logged as a visible warning) and never blocks worker init, and
 * one spell failing does not stop the others from activating.
 */
export async function autoActivateManifestSpells(
  manifest: MaestroManifest,
  sessionId: string,
): Promise<void> {
  const spells = manifest.spells;
  if (!spells || spells.length === 0) return;

  const debug = process.env.MAESTRO_DEBUG === 'true';
  const logDebug = (msg: string) => { if (debug) console.error(msg); };
  // Failures are surfaced at normal (non-debug) level so a broken spell isn't
  // silently dropped, while still remaining fail-open.
  const warn = (msg: string) => { console.error(msg); };

  // allSettled (not all) so a synchronous non-Error throw inside a mapped task
  // can never reject the whole batch — activation stays fail-open regardless.
  await Promise.allSettled(spells.map(async (spell) => {
    try {
      await api.post(`/api/spells/${spell.id}/activate`, {
        targetSessionIds: [sessionId],
      });
      logDebug(`[spell-auto-activate] activated ${spell.id} (${spell.name}) on ${sessionId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warn(`[spell-auto-activate] WARN failed to activate ${spell.id} (${spell.name}): ${message} — continuing (fail-open)`);
    }
  }));
}
