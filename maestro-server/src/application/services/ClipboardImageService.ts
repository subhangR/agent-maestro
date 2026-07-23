import {
  ClipboardImageMimeType,
  CLIPBOARD_IMAGE_MIME_TYPES,
  IClipboardImageRepository,
  StoredClipboardImage,
} from '../../domain/repositories/IClipboardImageRepository';
import { PayloadTooLargeError, ValidationError } from '../../domain/common/Errors';

/** Default upload ceiling when MAESTRO_CLIPBOARD_MAX_BYTES is unset (10 MB). */
export const DEFAULT_CLIPBOARD_MAX_BYTES = 10 * 1024 * 1024;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Identify an image by its leading bytes.
 *
 * A browser is free to declare any Content-Type on a multipart part, so the
 * declared type is a hint and the bytes are the truth. Anything we cannot
 * positively identify as one of the four accepted formats is rejected.
 */
export function sniffImageMimeType(data: Buffer): ClipboardImageMimeType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return 'image/png';
  }
  // JPEG: SOI marker followed by any marker byte.
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (data.length >= 6) {
    const header = data.subarray(0, 6).toString('latin1');
    if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  }
  // WEBP: RIFF container whose form type is WEBP.
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/** Normalize common aliases so `image/jpg` doesn't read as a mismatch. */
function normalizeMimeType(mimeType: string): string {
  const base = mimeType.split(';')[0].trim().toLowerCase();
  return base === 'image/jpg' ? 'image/jpeg' : base;
}

function isAccepted(mimeType: string): mimeType is ClipboardImageMimeType {
  return (CLIPBOARD_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Local date bucket (`YYYY-MM-DD`) used to group uploads on disk. */
export function clipboardDateBucket(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export interface ClipboardUploadInput {
  data: Buffer;
  /** Content-Type declared by the client, if any. Treated as a hint only. */
  declaredMimeType?: string;
  /** Optional; used for grouping/telemetry only — never for storage layout. */
  sessionId?: string;
}

/**
 * Validates and stores images pasted from a browser clipboard.
 *
 * Deliberately knows nothing about tasks, sessions, agent tools or transports:
 * it takes bytes and hands back an absolute server-side path.
 */
export class ClipboardImageService {
  private readonly maxBytesValue: number;

  constructor(
    private readonly repository: IClipboardImageRepository,
    options?: { maxBytes?: number },
  ) {
    this.maxBytesValue = options?.maxBytes ?? DEFAULT_CLIPBOARD_MAX_BYTES;
  }

  get maxBytes(): number {
    return this.maxBytesValue;
  }

  async store(input: ClipboardUploadInput): Promise<StoredClipboardImage> {
    const { data, declaredMimeType } = input;

    if (!data || data.length === 0) {
      throw new ValidationError('An image file is required');
    }

    if (data.length > this.maxBytesValue) {
      throw new PayloadTooLargeError(
        `Image exceeds the maximum size of ${this.maxBytesValue} bytes`,
        { maxBytes: this.maxBytesValue, bytes: data.length },
      );
    }

    if (declaredMimeType) {
      const declared = normalizeMimeType(declaredMimeType);
      if (!isAccepted(declared)) {
        throw new ValidationError(
          `Unsupported image type: ${declared}. Allowed: ${CLIPBOARD_IMAGE_MIME_TYPES.join(', ')}`,
        );
      }
      const sniffed = sniffImageMimeType(data);
      if (!sniffed) {
        throw new ValidationError('File content is not a recognized image format');
      }
      if (sniffed !== declared) {
        throw new ValidationError(
          `Declared type ${declared} does not match file content (${sniffed})`,
        );
      }
      return this.repository.save(data, sniffed, clipboardDateBucket());
    }

    const sniffed = sniffImageMimeType(data);
    if (!sniffed) {
      throw new ValidationError('File content is not a recognized image format');
    }
    return this.repository.save(data, sniffed, clipboardDateBucket());
  }

  /**
   * Look up a stored image for streaming back to the browser.
   * @throws {ValidationError} when the request escapes the clipboard root.
   */
  async resolve(
    date: string,
    filename: string,
  ): Promise<{ path: string; mimeType: ClipboardImageMimeType } | null> {
    const resolved = await this.repository.resolve(date, filename);
    if (!resolved) return null;
    return { path: resolved, mimeType: mimeTypeForFilename(filename) };
  }
}

const MIME_BY_EXTENSION: Record<string, ClipboardImageMimeType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Content-Type for a server-generated clipboard filename. */
export function mimeTypeForFilename(filename: string): ClipboardImageMimeType {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'image/png';
}
