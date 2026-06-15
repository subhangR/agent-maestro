import { describe, it, expect } from "vitest";
import { extractImageFiles, dataTransferHasFiles, nextImageNameIndex } from "../utils/clipboardImages";

function makeFile(name: string, type: string, content = "x"): File {
    return new File([content], name, { type });
}

/** Build a minimal DataTransfer-like object from items and/or files. */
function makeDataTransfer(opts: { itemFiles?: (File | null)[]; files?: File[]; types?: string[] }): DataTransfer {
    const itemFiles = opts.itemFiles ?? [];
    const items = itemFiles.map(f => ({
        kind: "file" as const,
        type: f?.type ?? "",
        getAsFile: () => f,
    }));
    return {
        items,
        files: opts.files ?? [],
        types: opts.types ?? (opts.files?.length || itemFiles.length ? ["Files"] : []),
    } as unknown as DataTransfer;
}

describe("extractImageFiles", () => {
    it("returns empty array for null data", () => {
        expect(extractImageFiles(null)).toEqual([]);
    });

    it("extracts image files from clipboard items (screenshot paste)", () => {
        const png = makeFile("image.png", "image/png");
        const result = extractImageFiles(makeDataTransfer({ itemFiles: [png] }));
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("image/png");
    });

    it("ignores non-image files", () => {
        const pdf = makeFile("doc.pdf", "application/pdf");
        const txt = makeFile("notes.txt", "text/plain");
        const result = extractImageFiles(makeDataTransfer({ itemFiles: [pdf], files: [txt] }));
        expect(result).toEqual([]);
    });

    it("extracts from the files list (OS file copy)", () => {
        const jpg = makeFile("photo.jpg", "image/jpeg");
        const result = extractImageFiles(makeDataTransfer({ files: [jpg] }));
        expect(result).toHaveLength(1);
        expect(result[0].name).toBe("photo.jpg");
    });

    it("dedupes the same file appearing in both items and files", () => {
        const png = makeFile("shot.png", "image/png", "same-bytes");
        const result = extractImageFiles(makeDataTransfer({ itemFiles: [png], files: [png] }));
        expect(result).toHaveLength(1);
    });

    it("renames generic clipboard blobs to image1", () => {
        const generic = makeFile("image.png", "image/png");
        const [result] = extractImageFiles(makeDataTransfer({ itemFiles: [generic] }));
        expect(result.name).toBe("image1.png");
    });

    it("renames legacy pasted_image clipboard blobs to image1", () => {
        const generic = makeFile("pasted_image.png", "image/png");
        const [result] = extractImageFiles(makeDataTransfer({ itemFiles: [generic] }));
        expect(result.name).toBe("image1.png");
    });

    it("keeps real filenames intact by default", () => {
        const named = makeFile("mockup-v2.png", "image/png");
        const [result] = extractImageFiles(makeDataTransfer({ files: [named] }));
        expect(result.name).toBe("mockup-v2.png");
    });

    it("maps jpeg mime to .jpg extension when renaming", () => {
        const generic = makeFile("image.jpeg", "image/jpeg");
        const [result] = extractImageFiles(makeDataTransfer({ itemFiles: [generic] }));
        expect(result.name).toBe("image1.jpg");
    });

    it("handles multiple pasted images with distinct names", () => {
        const a = makeFile("image.png", "image/png", "aaa");
        const b = makeFile("image.png", "image/png", "bbbb");
        const result = extractImageFiles(makeDataTransfer({ itemFiles: [a, b] }));
        expect(result).toHaveLength(2);
        expect(result.map(f => f.name)).toEqual(["image1.png", "image2.png"]);
    });

    it("can rename all dropped images from an existing sequence", () => {
        const a = makeFile("mockup.png", "image/png", "aaa");
        const b = makeFile("diagram.jpg", "image/jpeg", "bbbb");
        const result = extractImageFiles(makeDataTransfer({ files: [a, b] }), { renameAll: true, startIndex: 3 });
        expect(result.map(f => f.name)).toEqual(["image3.png", "image4.jpg"]);
    });

    it("skips items whose getAsFile returns null", () => {
        const result = extractImageFiles(makeDataTransfer({ itemFiles: [null] }));
        expect(result).toEqual([]);
    });
});

describe("nextImageNameIndex", () => {
    it("continues after existing task and staged image names", () => {
        expect(nextImageNameIndex([
            { filename: "image1.png" },
            { name: "image2.jpg" },
            { filename: "notes.png" },
        ])).toBe(3);
    });

    it("starts at 1 when no sequential image names exist", () => {
        expect(nextImageNameIndex([{ filename: "screenshot.png" }])).toBe(1);
    });
});

describe("dataTransferHasFiles", () => {
    it("is false for null", () => {
        expect(dataTransferHasFiles(null)).toBe(false);
    });

    it("is true when types include Files", () => {
        expect(dataTransferHasFiles(makeDataTransfer({ files: [makeFile("a.png", "image/png")] }))).toBe(true);
    });

    it("is false for a text-only transfer", () => {
        expect(dataTransferHasFiles(makeDataTransfer({ types: ["text/plain"] }))).toBe(false);
    });
});
