import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { uploadClipboardImage, ClipboardUploadError } from "../utils/clipboardUpload";

// The gateway token lookup does network/auth work we don't want in a unit test.
vi.mock("../utils/gatewayAuth", () => ({
  getGatewayAuthToken: vi.fn().mockResolvedValue(null),
}));

function makeImage(name = "image1.png"): File {
  return new File(["binary-ish"], name, { type: "image/png" });
}

/** Minimal Response stand-in; jsdom's fetch is mocked wholesale. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function errorResponse(status: number, text = ""): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => text,
  } as unknown as Response;
}

describe("uploadClipboardImage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("POSTs multipart with the field name 'file' and resolves to the absolute server path", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        filename: "image1.png",
        path: "/Users/agent/.maestro/clipboard/2026-07-23/image1.png",
        url: "/api/clipboard/images/2026-07-23/image1.png",
        mimeType: "image/png",
        bytes: 1234,
      }),
    );

    const result = await uploadClipboardImage(makeImage(), "sess_abc");

    // The path — not url, not filename — is what gets written into the PTY.
    expect(result.path).toBe("/Users/agent/.maestro/clipboard/2026-07-23/image1.png");
    expect(result.bytes).toBe(1234);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/clipboard/images");
    expect(init.method).toBe("POST");

    // multer rejects any field name other than 'file'.
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("file")).toBeInstanceOf(File);
    expect(body.get("sessionId")).toBe("sess_abc");

    // The browser MUST set the multipart boundary itself — we must not send
    // a Content-Type header of our own.
    const headers = (init.headers ?? {}) as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain("content-type");
  });

  it("omits sessionId when not supplied (it is telemetry only)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, { filename: "image1.png", path: "/tmp/image1.png", url: "", mimeType: "image/png", bytes: 1 }),
    );

    await uploadClipboardImage(makeImage());

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("sessionId")).toBeNull();
  });

  it("rejects a 413 with the size-cap message", async () => {
    fetchMock.mockResolvedValue(errorResponse(413, "File too large"));

    await expect(uploadClipboardImage(makeImage())).rejects.toThrow("Image too large (max 10MB)");
    await expect(uploadClipboardImage(makeImage())).rejects.toBeInstanceOf(ClipboardUploadError);
  });

  it("rejects a 400 with the unsupported-image message", async () => {
    fetchMock.mockResolvedValue(errorResponse(400, "bad mime"));

    await expect(uploadClipboardImage(makeImage())).rejects.toThrow("Unsupported or corrupt image");
  });

  it("rejects a 500 with a retryable message", async () => {
    fetchMock.mockResolvedValue(errorResponse(500, "boom"));

    await expect(uploadClipboardImage(makeImage())).rejects.toThrow(/could not process the image/i);
  });

  it("rejects when the network is unreachable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(uploadClipboardImage(makeImage())).rejects.toThrow(/could not reach the server/i);
  });

  it("rejects a 201 that carries no path rather than injecting an empty string", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { filename: "image1.png" }));

    await expect(uploadClipboardImage(makeImage())).rejects.toThrow(/did not return an image path/i);
  });

  it("exposes the HTTP status on the error for callers that branch on it", async () => {
    fetchMock.mockResolvedValue(errorResponse(413));

    await expect(uploadClipboardImage(makeImage())).rejects.toMatchObject({ status: 413 });
  });
});
