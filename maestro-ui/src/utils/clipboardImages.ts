/**
 * Shared clipboard/drag-and-drop image extraction.
 *
 * Used by the task create/edit modal to pull image Files out of paste or
 * drop events. Screenshot pastes, copied images, and dragged image files all
 * become normal task attachments.
 */

type ImageLikeName = {
    filename?: string;
    name?: string;
};

type ImageRenameOptions = {
    startIndex?: number;
    renameAll?: boolean;
};

type DroppedImageFile = {
    filename: string;
    mimeType: string;
    data: string;
    lastModified?: number;
};

const GENERIC_CLIPBOARD_NAMES = new Set([
    "",
    "image.png",
    "image.jpg",
    "image.jpeg",
    "image.gif",
    "image.webp",
    "pasted_image.png",
    "pasted_image.jpg",
    "pasted_image.jpeg",
    "pasted_image.gif",
    "pasted_image.webp",
]);

function isGenericClipboardName(name: string): boolean {
    const lower = name.toLowerCase();
    return GENERIC_CLIPBOARD_NAMES.has(lower) || /^pasted[-_]image(?:[-_]\d+)?\.(png|jpe?g|gif|webp)$/i.test(name);
}

export function nextImageNameIndex(items: ImageLikeName[]): number {
    let max = 0;
    for (const item of items) {
        const name = item.filename || item.name || "";
        const match = /^image(\d+)\.[^.]+$/i.exec(name);
        if (match) max = Math.max(max, Number(match[1]));
    }
    return max + 1;
}

function fileKey(f: File): string {
    return `${f.name}:${f.size}:${f.type}`;
}

function extForMime(mimeType: string): string {
    const sub = mimeType.split("/")[1] || "png";
    if (sub === "jpeg") return "jpg";
    if (sub === "svg+xml") return "svg";
    return sub;
}

function withImageSequenceName(file: File, index: number): File {
    const name = `image${index}.${extForMime(file.type)}`;
    const renamed = new File([file], name, { type: file.type, lastModified: file.lastModified });
    if (renamed.name !== name) {
        try {
            Object.defineProperty(renamed, "name", { value: name, configurable: true });
        } catch {
            // Browser File constructors normally preserve the supplied name.
        }
    }
    return renamed;
}

function applyImageSequenceNames(files: File[], options: ImageRenameOptions = {}): File[] {
    let nextIndex = options.startIndex ?? 1;
    return files.map((file) => {
        if (!options.renameAll && !isGenericClipboardName(file.name)) return file;
        const renamed = withImageSequenceName(file, nextIndex);
        nextIndex += 1;
        return renamed;
    });
}

export function extractImageFiles(data: DataTransfer | null, options: ImageRenameOptions = {}): File[] {
    if (!data) return [];

    const out: File[] = [];
    const seen = new Set<string>();

    const push = (f: File | null) => {
        if (!f || !f.type.startsWith("image/")) return;
        const key = fileKey(f);
        if (seen.has(key)) return;
        seen.add(key);
        out.push(f);
    };

    if (data.items) {
        for (let i = 0; i < data.items.length; i++) {
            const item = data.items[i];
            if (item.kind === "file") push(item.getAsFile());
        }
    }
    if (data.files) {
        for (let i = 0; i < data.files.length; i++) {
            push(data.files[i]);
        }
    }

    return applyImageSequenceNames(out, options);
}

function base64ToFile(image: DroppedImageFile): File {
    const binary = atob(image.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return new File([bytes], image.filename, {
        type: image.mimeType,
        lastModified: image.lastModified ?? Date.now(),
    });
}

export async function extractDroppedImagePathFiles(paths: string[], options: ImageRenameOptions = {}): Promise<File[]> {
    if (paths.length === 0) return [];

    let invoke: undefined | (<T>(cmd: string, args?: Record<string, unknown>) => Promise<T>);
    try {
        ({ invoke } = await import("@tauri-apps/api/core"));
    } catch {
        return [];
    }
    if (!invoke) return [];

    const files: File[] = [];
    for (const path of paths) {
        try {
            const image = await invoke<DroppedImageFile>("read_dropped_image_file", { path });
            files.push(base64ToFile(image));
        } catch {
            // Skip non-images, unreadable paths, and files rejected by the native guard.
        }
    }

    return applyImageSequenceNames(files, { ...options, renameAll: true });
}

export function dataTransferHasFiles(data: DataTransfer | null): boolean {
    if (!data) return false;
    return Array.from(data.types || []).includes("Files");
}
