import React, { useEffect, useRef, useState } from "react";
import { CollabSpace } from "../../../firebase/collabSpaceTypes";
import { EmptySectionState } from "../shared/EmptySectionState";
import { useFirebaseAuthStore } from "../../../stores/useFirebaseAuthStore";
import { SpaceShareClient } from "../../../firebase/SpaceShareClient";
import {
    SpaceFilesClient,
    spaceFileToBlob,
    encodeFileToBase64,
} from "../../../firebase/SpaceFilesClient";
import { SpaceFile, SPACE_FILE_MAX_RAW_BYTES } from "../../../firebase/spaceShareTypes";
import { useSpaceFiles } from "../../../hooks/useSpaceFiles";
import {
    resolveOrigin,
    canManageEntity,
    formatRelative,
} from "../../../hooks/useSpaceSharing";
import "../../../styles-space-sharing.css";
import "../../../styles-space-files.css";

type Props = {
    space: CollabSpace;
};

const MAX_FILE_KB = Math.floor(SPACE_FILE_MAX_RAW_BYTES / 1024);

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileKind = "image" | "audio" | "video" | "pdf" | "archive" | "code" | "text" | "file";

function fileKind(mimeType: string, name: string): FileKind {
    const mt = (mimeType || "").toLowerCase();
    if (mt.startsWith("image/")) return "image";
    if (mt.startsWith("audio/")) return "audio";
    if (mt.startsWith("video/")) return "video";
    if (mt === "application/pdf") return "pdf";
    if (/zip|tar|gzip|x-7z|x-rar/.test(mt)) return "archive";
    if (/json|xml|javascript|typescript|x-sh/.test(mt)) return "code";
    if (mt.startsWith("text/")) return "text";
    if (/\.(ts|tsx|js|jsx|py|rs|go|sh|json|yml|yaml)$/i.test(name)) return "code";
    return "file";
}

const KIND_GLYPHS: Record<FileKind, string> = {
    image: "🖼",
    audio: "🎵",
    video: "🎬",
    pdf: "📕",
    archive: "🗜",
    code: "⌨",
    text: "📄",
    file: "📎",
};

function FileTypeIcon({ mimeType, name }: { mimeType: string; name: string }) {
    const kind = fileKind(mimeType, name);
    return (
        <span
            className={`spaceFileIcon spaceFileIcon--${kind}`}
            role="img"
            aria-label={`${kind} file`}
        >
            {KIND_GLYPHS[kind]}
        </span>
    );
}

/**
 * Lazy inline thumbnail for image files. The payload is already in memory
 * (the doc is part of the live subscription), so this only materializes an
 * object URL when the row renders — and revokes it on unmount.
 */
function ImageThumb({ file }: { file: SpaceFile }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        let objectUrl: string | null = null;
        try {
            objectUrl = URL.createObjectURL(spaceFileToBlob(file));
            setUrl(objectUrl);
        } catch {
            setUrl(null); // corrupt payload → fall back to the type icon
        }
        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [file.id, file.data, file.mimeType]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!url) return <FileTypeIcon mimeType={file.mimeType} name={file.name} />;
    return <img className="spaceFileThumb" src={url} alt={`Preview of ${file.name}`} />;
}

/** File staged in the picker, awaiting an optional caption before upload. */
type StagedUpload = { file: File };

export const FilesSection: React.FC<Props> = ({ space }) => {
    const user = useFirebaseAuthStore((s) => s.user);
    const { items: files, loading, error, retry } = useSpaceFiles(space.id);

    const inputRef = useRef<HTMLInputElement>(null);
    const [staged, setStaged] = useState<StagedUpload | null>(null);
    const [caption, setCaption] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [errorDismissed, setErrorDismissed] = useState(false);

    const [deleting, setDeleting] = useState<Set<string>>(new Set());
    const [downloading, setDownloading] = useState<Set<string>>(new Set());
    const [rowError, setRowError] = useState<Record<string, string>>({});

    useEffect(() => setErrorDismissed(false), [error]);

    const clearRowError = (id: string) =>
        setRowError((p) => {
            const n = { ...p };
            delete n[id];
            return n;
        });

    const openPicker = () => {
        setUploadError(null);
        inputRef.current?.click();
    };

    const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Allow re-picking the same file later.
        e.target.value = "";
        if (!file) return;
        if (file.size > SPACE_FILE_MAX_RAW_BYTES) {
            setUploadError(
                `"${file.name}" is ${formatBytes(file.size)} — files shared to a space must be ${MAX_FILE_KB} KB or smaller.`,
            );
            return;
        }
        setUploadError(null);
        setCaption("");
        setStaged({ file });
    };

    const cancelStaged = () => {
        setStaged(null);
        setCaption("");
        setUploadError(null);
    };

    const handleUpload = async () => {
        if (!user || !staged || uploading) return;
        setUploading(true);
        setUploadError(null);
        try {
            const data = await encodeFileToBase64(staged.file);
            await SpaceShareClient.shareFile(user, space.id, {
                name: staged.file.name,
                mimeType: staged.file.type || "application/octet-stream",
                size: staged.file.size,
                data,
                caption: caption.trim() ? caption.trim() : null,
            });
            setStaged(null);
            setCaption("");
        } catch (e: any) {
            setUploadError(e?.message ?? "Upload failed. Try again.");
        } finally {
            setUploading(false);
        }
    };

    const handleDownload = async (f: SpaceFile) => {
        clearRowError(f.id);
        setDownloading((p) => new Set(p).add(f.id));
        try {
            const blob = spaceFileToBlob(f);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = f.name || "download";
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Give the browser a beat to start the download before revoking.
            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            if (user) {
                // Best-effort download tracking — never blocks the download.
                SpaceFilesClient.recordDownload(space.id, f.id, user.uid).catch((err) => {
                    // eslint-disable-next-line no-console
                    console.warn("[SpaceFiles] recordDownload failed:", err);
                });
            }
        } catch (e: any) {
            setRowError((p) => ({
                ...p,
                [f.id]: e?.message ?? "Download failed — the file payload may be corrupt.",
            }));
        } finally {
            setDownloading((p) => {
                const n = new Set(p);
                n.delete(f.id);
                return n;
            });
        }
    };

    const handleDelete = async (f: SpaceFile) => {
        if (!confirm(`Delete "${f.name}" for everyone in this space?`)) return;
        clearRowError(f.id);
        setDeleting((p) => new Set(p).add(f.id));
        try {
            await SpaceFilesClient.delete(space.id, f.id);
        } catch (e: any) {
            setRowError((p) => ({ ...p, [f.id]: e?.message ?? "Delete failed." }));
            setDeleting((p) => {
                const n = new Set(p);
                n.delete(f.id);
                return n;
            });
        }
    };

    const visible = files.filter((f) => !deleting.has(f.id));
    const showError = error && !errorDismissed;

    return (
        <section className="spaceEntityPane spaceEntityPane--files" aria-label="Shared files">
            <header className="spaceEntityHeader">
                <div className="spaceEntityHeaderLeft">
                    <span className="spaceEntityTitle">Shared Files</span>
                    <span className="spaceEntityCount">{files.length}</span>
                </div>
                <div className="spaceEntityHeaderRight">
                    <span className="spaceFileLimitNote">Max {MAX_FILE_KB} KB per file</span>
                    <button
                        type="button"
                        className="spaceEntityPrimaryBtn"
                        onClick={openPicker}
                        disabled={!user || uploading}
                        title={user ? undefined : "Sign in to share files"}
                    >
                        {uploading ? (
                            <>
                                <span className="spaceSharingBtnSpinner" aria-hidden="true" />
                                Uploading…
                            </>
                        ) : (
                            "+ Upload file"
                        )}
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        className="spaceFileHiddenInput"
                        onChange={onFilePicked}
                        aria-label="Choose a file to share"
                        tabIndex={-1}
                    />
                </div>
            </header>

            {showError && (
                <div className="spaceSharingError" role="alert">
                    <span className="spaceSharingErrorMsg">{error}</span>
                    <button type="button" className="spaceSharingErrorRetry" onClick={retry}>
                        Retry
                    </button>
                    <button
                        type="button"
                        className="spaceSharingErrorDismiss"
                        aria-label="Dismiss error"
                        onClick={() => setErrorDismissed(true)}
                    >
                        ×
                    </button>
                </div>
            )}

            {uploadError && !staged && (
                <div className="spaceSharingError" role="alert">
                    <span className="spaceSharingErrorMsg">{uploadError}</span>
                    <button
                        type="button"
                        className="spaceSharingErrorDismiss"
                        aria-label="Dismiss error"
                        onClick={() => setUploadError(null)}
                    >
                        ×
                    </button>
                </div>
            )}

            {staged && (
                <div className="spaceFileStaged" role="group" aria-label="File ready to share">
                    <div className="spaceFileStagedHead">
                        <FileTypeIcon mimeType={staged.file.type} name={staged.file.name} />
                        <span className="spaceFileStagedName" title={staged.file.name}>
                            {staged.file.name}
                        </span>
                        <span className="spaceFileStagedSize">{formatBytes(staged.file.size)}</span>
                    </div>
                    <input
                        type="text"
                        className="spaceEntitySearchInput spaceFileCaptionInput"
                        placeholder="Add a caption (optional)"
                        aria-label="Caption for the shared file"
                        value={caption}
                        maxLength={280}
                        disabled={uploading}
                        onChange={(e) => setCaption(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                void handleUpload();
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelStaged();
                            }
                        }}
                    />
                    {uploadError && (
                        <div className="spaceSharingRowError" role="alert">
                            {uploadError}
                        </div>
                    )}
                    <div className="spaceFileStagedActions">
                        <button
                            type="button"
                            className="spaceEntityGhostBtn"
                            onClick={cancelStaged}
                            disabled={uploading}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className={`spaceEntityPrimaryBtn ${uploading ? "spaceSharingBtn--pending" : ""}`}
                            onClick={() => void handleUpload()}
                            disabled={uploading || !user}
                        >
                            {uploading ? (
                                <>
                                    <span className="spaceSharingBtnSpinner" aria-hidden="true" />
                                    Sharing…
                                </>
                            ) : (
                                "Share file"
                            )}
                        </button>
                    </div>
                </div>
            )}

            <div className="spaceEntityBody">
                {loading && files.length === 0 ? (
                    <div className="spaceSharingSkeletonList" aria-busy="true" aria-label="Loading shared files">
                        {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="spaceSharingSkeletonRow" />
                        ))}
                    </div>
                ) : visible.length === 0 ? (
                    <EmptySectionState
                        icon="📎"
                        title="No files shared yet"
                        body={`Upload a file (up to ${MAX_FILE_KB} KB) to share it with everyone in this space.`}
                        action={
                            user
                                ? { label: "Upload file", onClick: openPicker, disabled: uploading }
                                : undefined
                        }
                    />
                ) : (
                    <ul className="spaceFileList">
                        {visible.map((f) => {
                            const origin = resolveOrigin(space, f.sourceUserId ?? f.createdBy);
                            const canManage = canManageEntity(space, user?.uid, f.createdBy);
                            const isImage = fileKind(f.mimeType, f.name) === "image";
                            const isDownloading = downloading.has(f.id);
                            const downloadCount = (f.downloadedByUids ?? []).length;
                            return (
                                <li key={f.id} className="spaceFileRow">
                                    <div className="spaceFileRowMedia" aria-hidden={isImage ? undefined : "true"}>
                                        {isImage ? (
                                            <ImageThumb file={f} />
                                        ) : (
                                            <FileTypeIcon mimeType={f.mimeType} name={f.name} />
                                        )}
                                    </div>
                                    <div className="spaceFileRowMain">
                                        <div className="spaceFileRowName" title={f.name}>
                                            {f.name}
                                        </div>
                                        {f.caption && (
                                            <div className="spaceFileRowCaption">{f.caption}</div>
                                        )}
                                        <div className="spaceFileRowMeta">
                                            <span>{formatBytes(f.size)}</span>
                                            <span aria-hidden="true">·</span>
                                            <span
                                                className="spaceFileRowUploader"
                                                style={{ color: origin.color }}
                                            >
                                                @{origin.displayName}
                                            </span>
                                            <span aria-hidden="true">·</span>
                                            <span>{formatRelative(f.createdAt)}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>
                                                {downloadCount}{" "}
                                                {downloadCount === 1 ? "download" : "downloads"}
                                            </span>
                                        </div>
                                        {rowError[f.id] && (
                                            <div className="spaceSharingRowError" role="alert">
                                                {rowError[f.id]}
                                            </div>
                                        )}
                                    </div>
                                    <div className="spaceFileRowActions">
                                        <button
                                            type="button"
                                            className={`spaceEntityGhostBtn ${isDownloading ? "spaceSharingBtn--pending" : ""}`}
                                            onClick={() => void handleDownload(f)}
                                            disabled={isDownloading}
                                            aria-label={`Download ${f.name} (${formatBytes(f.size)})`}
                                        >
                                            {isDownloading ? "Downloading…" : "⤓ Download"}
                                        </button>
                                        {canManage && (
                                            <button
                                                type="button"
                                                className="spaceEntityGhostBtn spaceEntityGhostBtn--danger"
                                                onClick={() => void handleDelete(f)}
                                                aria-label={`Delete ${f.name}`}
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </section>
    );
};
