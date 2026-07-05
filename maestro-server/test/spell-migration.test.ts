import { existsSync, mkdtempSync, rmSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { migrateSpellCleanBreak } from '../src/container';
import { silentLogger } from './helpers';

/**
 * Fresh-install regression: migrateSpellCleanBreak runs BEFORE the repos create
 * the data dir, so on a brand-new DATA_DIR the sentinel write must not ENOENT —
 * the migration mkdirs the data dir first. (No logger.error, sentinel present.)
 */

describe('migrateSpellCleanBreak — fresh DATA_DIR', () => {
  it('creates the data dir + sentinel without error when the dir does not exist', () => {
    const base = mkdtempSync(join(tmpdir(), 'maestro-mig-'));
    // A data dir path that does NOT exist yet (parent exists, child does not).
    const dataDir = join(base, 'data');
    expect(existsSync(dataDir)).toBe(false);

    const errors: unknown[] = [];
    const logger = { ...silentLogger, error: (...args: unknown[]) => { errors.push(args); } } as typeof silentLogger;

    try {
      migrateSpellCleanBreak(logger, dataDir);

      // The bug path logged an ENOENT via logger.error; the fix must not.
      expect(errors).toHaveLength(0);
      // Sentinel is written into the (now-created) data dir.
      expect(existsSync(dataDir)).toBe(true);
      expect(existsSync(join(dataDir, '.migrated-spell-redesign-v2'))).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it('is idempotent — a second run short-circuits on the sentinel', () => {
    const base = mkdtempSync(join(tmpdir(), 'maestro-mig-'));
    const dataDir = join(base, 'data');
    try {
      migrateSpellCleanBreak(silentLogger, dataDir);
      const before = readdirSync(dataDir);
      // Second run should not throw and should leave the dir unchanged.
      migrateSpellCleanBreak(silentLogger, dataDir);
      expect(readdirSync(dataDir).sort()).toEqual(before.sort());
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
