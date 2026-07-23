import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ClipboardImageMimeType,
  IClipboardImageRepository,
  StoredClipboardImage,
} from '../../domain/repositories/IClipboardImageRepository';
import { ValidationError } from '../../domain/common/Errors';
import { ILogger } from '../../domain/common/ILogger';
import { atomicWriteBinaryFile } from './utils/atomicWrite';

/** File extension written for each accepted mime type. */
const EXTENSION_BY_MIME: Record<ClipboardImageMimeType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * Stores clipboard images under `<dataDir>/clipboard/<YYYY-MM-DD>/`.
 *
 * The data dir is injected (never hardcoded), so the same code serves
 * `~/.maestro/data` in production and `~/.maestro-staging/data` in staging.
 */
export class FileSystemClipboardImageRepository implements IClipboardImageRepository {
  readonly root: string;

  constructor(dataDir: string, private readonly logger?: ILogger) {
    this.root = path.resolve(dataDir, 'clipboard');
  }

  async save(
    data: Buffer,
    mimeType: ClipboardImageMimeType,
    date: string,
  ): Promise<StoredClipboardImage> {
    const dir = this.confine(date);
    const filename = `clip_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${EXTENSION_BY_MIME[mimeType]}`;
    const filePath = path.join(dir, filename);

    await atomicWriteBinaryFile(filePath, data);
    this.logger?.debug?.(`Stored clipboard image ${filePath} (${data.length} bytes, ${mimeType})`);

    return { filename, date, path: filePath, mimeType, bytes: data.length };
  }

  async resolve(date: string, filename: string): Promise<string | null> {
    const filePath = this.confine(date, filename);
    try {
      const stat = await fs.stat(filePath);
      return stat.isFile() ? filePath : null;
    } catch {
      return null;
    }
  }

  /**
   * Join untrusted path segments onto {@link root} and verify the result stays
   * inside it. Zod already rejects traversal at the route boundary; this is the
   * defence that does not depend on a caller remembering to validate.
   */
  private confine(...segments: string[]): string {
    const resolved = path.resolve(this.root, ...segments);
    const prefix = this.root.endsWith(path.sep) ? this.root : this.root + path.sep;
    if (resolved !== this.root && !resolved.startsWith(prefix)) {
      throw new ValidationError('Path escapes the clipboard storage root');
    }
    return resolved;
  }
}
