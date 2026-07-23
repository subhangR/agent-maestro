/**
 * Clipboard image storage.
 *
 * Clipboard images are host-agnostic: they belong to the *server*, not to a
 * task, a session, an agent tool, or a deployment. When Maestro is served over
 * a network the user's clipboard lives on their machine while the agent process
 * lives on the server, so a pasted image has to be uploaded and written to the
 * server's filesystem before any agent can read it by path.
 */

/** Image types accepted for clipboard uploads. */
export const CLIPBOARD_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

export type ClipboardImageMimeType = (typeof CLIPBOARD_IMAGE_MIME_TYPES)[number];

/** Metadata for an image that has been persisted to the server's filesystem. */
export interface StoredClipboardImage {
  /** Server-generated filename, e.g. `clip_1753228800000_a1b2c3d4.png`. */
  filename: string;
  /** Date bucket the image lives in (`YYYY-MM-DD`). */
  date: string;
  /**
   * ABSOLUTE path on the server's filesystem. This is the value agents are
   * given — every supported agent tool reads images by path.
   */
  path: string;
  mimeType: ClipboardImageMimeType;
  bytes: number;
}

export interface IClipboardImageRepository {
  /** Absolute root of clipboard storage (`<dataDir>/clipboard`). */
  readonly root: string;

  /**
   * Persist image bytes under `<root>/<date>/` with a server-generated filename.
   * Client-supplied filenames are never used.
   */
  save(data: Buffer, mimeType: ClipboardImageMimeType, date: string): Promise<StoredClipboardImage>;

  /**
   * Resolve a stored image to an absolute path.
   *
   * @returns the absolute path, or `null` when the file does not exist.
   * @throws {ValidationError} when the resolved path escapes {@link root}.
   */
  resolve(date: string, filename: string): Promise<string | null>;
}
