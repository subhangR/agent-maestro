import { api } from '../api.js';
import type { MaestroManifest } from '../types/manifest.js';

/**
 * Auto-activate any spells the manifest carries (typically resolved from
 * Task.spellIds at spawn time). Best-effort; failures are logged at debug and
 * never block worker init.
 */
export async function autoActivateManifestSpells(
  manifest: MaestroManifest,
  sessionId: string,
): Promise<void> {
  const spells = manifest.spells;
  if (!spells || spells.length === 0) return;

  const debug = process.env.MAESTRO_DEBUG === 'true';
  const log = (msg: string) => { if (debug) console.error(msg); };

  await Promise.all(spells.map(async (spell) => {
    try {
      await api.post(`/api/spells/${spell.id}/activate`, {
        targetSessionIds: [sessionId],
      });
      log(`[spell-auto-activate] activated ${spell.id} (${spell.name}) on ${sessionId}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log(`[spell-auto-activate] failed for ${spell.id}: ${message}`);
    }
  }));
}
