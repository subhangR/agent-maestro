/**
 * Upload a pasted / dropped clipboard image to the server and get back an
 * ABSOLUTE SERVER-SIDE path.
 *
 * This is the keystone of the agent-agnostic image bridge: every CLI agent
 * (Claude Code, Codex, Hermes, a plain shell + an editor) reads images by file
 * path. So instead of trying to teach the terminal about each agent's inline
 * image protocol, we upload the blob once, get a path the SERVER can read, and
 * inject that short path as plain text at the agent's prompt. Nothing in the
 * chain knows or cares which agent is running.
 *
 * Contract (POST /api/clipboard/images, multipart/form-data):
 *   { file: blob, sessionId?: string }
 *   201 -> { filename, path, url, mimeType, bytes }   path = absolute ON SERVER
 *
 * We deliberately do NOT go through MaestroClient.fetch: that wrapper forces
 * `Content-Type: application/json`, which would corrupt a multipart body (the
 * browser must set the multipart boundary itself). We reuse only the pieces
 * that matter for auth — API_BASE_URL + the gateway bearer token — so this
 * behaves identically in Tauri and the browser, secure origin or not.
 */
import { API_BASE_URL } from "./serverConfig";
import { getGatewayAuthToken } from "./gatewayAuth";

export interface ClipboardImageUploadResult {
  filename: string;
  /** Absolute path on the SERVER host — this is what we write into the PTY. */
  path: string;
  /** Server URL for previewing the image (GET /api/clipboard/images/:date/:filename). */
  url: string;
  mimeType: string;
  bytes: number;
}

/** Thrown when the server rejects an upload; `message` is safe to show a user. */
export class ClipboardUploadError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ClipboardUploadError";
    this.status = status;
  }
}

function friendlyMessage(status: number, _serverText: string): string {
  // Messages are locked to the server contract (max 10MB cap; multer/type guard).
  if (status === 413) return "Image too large (max 10MB)";
  if (status === 400) return "Unsupported or corrupt image";
  if (status === 401 || status === 403) return "Not authorized to upload images.";
  if (status === 404) return "Image upload endpoint not found on the server.";
  if (status >= 500) return "The server could not process the image. Please try again.";
  return `Image upload failed (HTTP ${status}).`;
}

/**
 * Upload one image File. Resolves with the server-side path (and metadata) on
 * success; rejects with a `ClipboardUploadError` carrying a user-facing message
 * on 400/413/etc. Callers surface `.message` in a toast and write NOTHING into
 * the PTY on failure.
 */
export async function uploadClipboardImage(
  file: File,
  sessionId?: string,
): Promise<ClipboardImageUploadResult> {
  const form = new FormData();
  // Preserve the (already sequence-named) filename so the server can keep the
  // extension / a sensible name.
  form.append("file", file, file.name);
  if (sessionId) form.append("sessionId", sessionId);

  const token = await getGatewayAuthToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/clipboard/images`, {
      method: "POST",
      credentials: "include",
      // NB: do NOT set Content-Type — the browser adds the multipart boundary.
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
  } catch (err) {
    throw new ClipboardUploadError(
      "Could not reach the server to upload the image.",
      0,
    );
  }

  if (!response.ok) {
    const serverText = await response.text().catch(() => "");
    throw new ClipboardUploadError(friendlyMessage(response.status, serverText), response.status);
  }

  const data = (await response.json()) as Partial<ClipboardImageUploadResult>;
  if (!data || typeof data.path !== "string" || !data.path) {
    throw new ClipboardUploadError("Server did not return an image path.", response.status);
  }

  return {
    filename: data.filename ?? file.name,
    path: data.path,
    url: data.url ?? "",
    mimeType: data.mimeType ?? file.type,
    bytes: typeof data.bytes === "number" ? data.bytes : file.size,
  };
}
