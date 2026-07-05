import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Atomic file write using write-to-temp + rename pattern.
 * rename() is atomic on POSIX systems.
 *
 * Ensures the parent directory exists first (recursive mkdir) so a write to a
 * not-yet-created entity subdirectory can't fail with ENOENT — repos no longer
 * have to pre-create every subdir before their first write.
 */
export async function atomicWriteFile(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.writeFile(tmpPath, data, 'utf-8');
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    try { await fs.unlink(tmpPath); } catch {}
    throw err;
  }
}
