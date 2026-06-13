import React, { useRef, useState } from "react";
import { TaskImage } from "../../../app/types/maestro";
import { maestroClient } from "../../../utils/MaestroClient";
import { dataTransferHasFiles, extractImageFiles, nextImageNameIndex } from "../../../utils/clipboardImages";
import { Icon } from "../redesign/kit";

type ImagesTabProps = {
    taskId: string;
    images: TaskImage[];
    onImagesChange: (images: TaskImage[]) => void;
    /** 'tab' = full panel (default), 'bar' = compact inline chips row */
    variant?: 'tab' | 'bar';
};

export function ImagesTab({ taskId, images, onImagesChange, variant = 'tab' }: ImagesTabProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [previewImage, setPreviewImage] = useState<TaskImage | null>(null);

    const uploadFiles = async (files: File[]) => {
        const imageFiles = files.filter(file => file.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        setUploading(true);
        try {
            const newImages: TaskImage[] = [];
            for (const file of imageFiles) {
                try {
                    const img = await maestroClient.uploadTaskImage(taskId, file);
                    newImages.push(img);
                } catch {
                    // Keep successful uploads and skip failed files.
                }
            }
            if (newImages.length > 0) {
                onImagesChange([...images, ...newImages]);
            }
        } finally {
            setUploading(false);
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        try {
            await uploadFiles(Array.from(files));
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async (imageId: string) => {
        try {
            await maestroClient.deleteTaskImage(taskId, imageId);
            onImagesChange(images.filter(img => img.id !== imageId));
            if (previewImage?.id === imageId) setPreviewImage(null);
        } catch (err) {
            // Delete failed
        }
    };

    const handlePaste = async (e: React.ClipboardEvent) => {
        const pastedImages = extractImageFiles(e.clipboardData, {
            startIndex: nextImageNameIndex(images),
            renameAll: true,
        });
        if (pastedImages.length === 0) return;
        e.preventDefault();
        await uploadFiles(pastedImages);
    };

    const handleDragOver = (e: React.DragEvent) => {
        if (dataTransferHasFiles(e.dataTransfer)) e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent) => {
        const droppedImages = extractImageFiles(e.dataTransfer, {
            startIndex: nextImageNameIndex(images),
            renameAll: true,
        });
        if (droppedImages.length === 0) return;
        e.preventDefault();
        await uploadFiles(droppedImages);
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const previewLightbox = previewImage && (
        <div
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0,0,0,0.8)',
                zIndex: 10000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                cursor: 'pointer',
            }}
            onClick={() => setPreviewImage(null)}
        >
            <img
                src={maestroClient.getTaskImageUrl(taskId, previewImage.id)}
                alt={previewImage.filename}
                style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: '8px' }}
            />
            <div style={{ color: '#fff', marginTop: '8px', fontSize: '12px', textAlign: 'center' }}>
                {previewImage.filename} &middot; {formatSize(previewImage.size)}
            </div>
        </div>
    );

    // ── Bar variant: compact inline chips ────────────────────
    if (variant === 'bar') {
        return (
            <>
                {images.map(img => (
                    <span
                        key={img.id}
                        className="pn-mchip pn-mchip--ref"
                        style={{ maxWidth: '120px', cursor: 'pointer' }}
                        onClick={() => setPreviewImage(img)}
                        title={img.filename}
                    >
                        <img
                            src={maestroClient.getTaskImageUrl(taskId, img.id)}
                            alt={img.filename}
                            style={{
                                width: '16px',
                                height: '16px',
                                objectFit: 'cover',
                                borderRadius: '2px',
                                flexShrink: 0,
                            }}
                        />
                        <span style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            maxWidth: '70px',
                        }}>
                            {img.filename}
                        </span>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'inline-flex', lineHeight: 1, flexShrink: 0 }}
                            title="Remove image"
                        >
                            <Icon name="x" size={11} />
                        </button>
                    </span>
                ))}

                <button
                    type="button"
                    className="pn-mchip"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Attach image"
                >
                    {uploading ? '…' : <><Icon name="paperclip" size={12} /> Attach</>}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />

                {previewLightbox}
            </>
        );
    }

    // ── Tab variant: full panel ───────────────────────────────
    return (
        <div
            style={{ padding: '8px 12px' }}
            onPaste={handlePaste}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            tabIndex={0}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="pn-fhint">
                    {images.length} image{images.length !== 1 ? 's' : ''}
                    {' '}&middot; paste or click to add
                </span>
                <button
                    type="button"
                    className="pn-mchip"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? 'Uploading...' : <><Icon name="paperclip" size={12} /> Add Image</>}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                />
            </div>

            {images.length === 0 && !uploading && (
                <div style={{
                    textAlign: 'center',
                    padding: '16px',
                    color: 'var(--pn-ink-4)',
                    fontSize: '11px',
                    border: '1px dashed var(--pn-line-2)',
                    borderRadius: 'var(--pn-r-sm)',
                    background: 'var(--pn-surface)',
                }}>
                    No images yet. Click "Add Image" or paste from clipboard.
                </div>
            )}

            {images.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                    gap: '6px',
                }}>
                    {images.map(img => (
                        <div
                            key={img.id}
                            style={{
                                position: 'relative',
                                borderRadius: 'var(--pn-r-sm)',
                                overflow: 'hidden',
                                border: '1px solid var(--pn-line-2)',
                                cursor: 'pointer',
                                aspectRatio: '1',
                            }}
                            onClick={() => setPreviewImage(img)}
                        >
                            <img
                                src={maestroClient.getTaskImageUrl(taskId, img.id)}
                                alt={img.filename}
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDelete(img.id); }}
                                style={{
                                    position: 'absolute',
                                    top: '2px',
                                    right: '2px',
                                    background: 'rgba(0,0,0,0.6)',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '18px',
                                    height: '18px',
                                    fontSize: '11px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    lineHeight: 1,
                                }}
                                title="Delete image"
                            >
                                &times;
                            </button>
                            <div style={{
                                position: 'absolute',
                                bottom: 0,
                                left: 0,
                                right: 0,
                                background: 'rgba(0,0,0,0.5)',
                                color: '#fff',
                                fontSize: '9px',
                                padding: '1px 4px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>
                                {img.filename}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {previewLightbox}
        </div>
    );
}
