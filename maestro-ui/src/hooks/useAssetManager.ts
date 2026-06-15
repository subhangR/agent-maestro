import { useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { IS_TAURI } from "../platform";
import {
    AssetTemplate,
    AssetSettings,
    ApplyAssetRequest,
    ApplyAssetTarget,
} from "../app/types/app-state";
import { MaestroProject } from "../app/types/maestro";
import { makeId } from "../app/utils/id";
import { formatError, joinPathDisplay } from "../utils/formatters";
import { shortenPathSmart } from "../pathDisplay";

interface UseAssetManagerProps {
    projects: MaestroProject[];
    showNotice: (message: string, duration?: number) => void;
    reportError: (title: string, error: unknown) => void;
}

export function useAssetManager({
    projects,
    showNotice,
    reportError,
}: UseAssetManagerProps) {
    const [assets, setAssets] = useState<AssetTemplate[]>([]);
    const [assetSettings, setAssetSettings] = useState<AssetSettings>({ autoApplyEnabled: true });

    const [assetEditorOpen, setAssetEditorOpen] = useState(false);
    const [assetEditorId, setAssetEditorId] = useState<string | null>(null);
    const [assetEditorName, setAssetEditorName] = useState("");
    const [assetEditorPath, setAssetEditorPath] = useState("");
    const [assetEditorAutoApply, setAssetEditorAutoApply] = useState(true);
    const [assetEditorContent, setAssetEditorContent] = useState("");

    const [applyAssetRequest, setApplyAssetRequest] = useState<ApplyAssetRequest | null>(null);
    const [applyAssetApplying, setApplyAssetApplying] = useState(false);
    const [applyAssetError, setApplyAssetError] = useState<string | null>(null);

    const [confirmDeleteAssetId, setConfirmDeleteAssetId] = useState<string | null>(null);

    const assetNameRef = useRef<HTMLInputElement | null>(null);

    function openAssetEditor(asset?: AssetTemplate) {
        setAssetEditorId(asset?.id ?? null);
        setAssetEditorName(asset?.name ?? "");
        setAssetEditorPath(asset?.relativePath ?? "");
        setAssetEditorContent(asset?.content ?? "");
        setAssetEditorAutoApply(asset?.autoApply ?? true);
        setAssetEditorOpen(true);
        window.setTimeout(() => assetNameRef.current?.focus(), 0);
    }

    function closeAssetEditor() {
        setAssetEditorOpen(false);
        setAssetEditorId(null);
        setAssetEditorName("");
        setAssetEditorPath("");
        setAssetEditorContent("");
        setAssetEditorAutoApply(true);
    }

    function saveAssetFromEditor() {
        const name = assetEditorName.trim();
        const relativePath = assetEditorPath.trim();
        if (!name || !relativePath) return;
        const now = Date.now();
        const id = assetEditorId ?? makeId();
        const next: AssetTemplate = {
            id,
            name,
            relativePath,
            content: assetEditorContent,
            createdAt: assetEditorId ? (assets.find((a) => a.id === assetEditorId)?.createdAt ?? now) : now,
            autoApply: assetEditorAutoApply,
        };
        setAssets((prev) => {
            if (!assetEditorId) return [...prev, next].sort((a, b) => b.createdAt - a.createdAt);
            return prev
                .map((a) => (a.id === assetEditorId ? next : a))
                .sort((a, b) => b.createdAt - a.createdAt);
        });
        closeAssetEditor();
    }

    function requestDeleteAsset(id: string) {
        setConfirmDeleteAssetId(id);
    }

    function confirmDeleteAsset() {
        const id = confirmDeleteAssetId;
        setConfirmDeleteAssetId(null);
        if (!id) return;

        const asset = assets.find((a) => a.id === id);
        const label = asset?.name?.trim() ? asset.name.trim() : "template";

        if (assetEditorId === id) closeAssetEditor();
        if (applyAssetRequest?.assetId === id) {
            setApplyAssetRequest(null);
            setApplyAssetError(null);
            setApplyAssetApplying(false);
        }
        setAssets((prev) => prev.filter((a) => a.id !== id));
        showNotice(`Deleted template "${label}"`);
    }

    function toggleAssetAutoApply(id: string) {
        setAssets((prev) =>
            prev.map((a) => (a.id === id ? { ...a, autoApply: !(a.autoApply ?? true) } : a)),
        );
    }

    async function applyTextAssetsRaw(
        baseDir: string,
        templates: AssetTemplate[],
        overwrite: boolean,
    ): Promise<string[]> {
        const dir = baseDir.trim();
        if (!dir) return [];
        const payload = templates
            .map((t) => ({
                relativePath: t.relativePath,
                content: t.content,
            }))
            .filter((t) => t.relativePath.trim());
        if (payload.length === 0) return [];
        if (!IS_TAURI) return [];
        return invoke<string[]>("apply_text_assets", { baseDir: dir, assets: payload, overwrite });
    }

    async function applyTextAssets(
        baseDir: string,
        templates: AssetTemplate[],
        overwrite: boolean,
    ): Promise<string[]> {
        try {
            return await applyTextAssetsRaw(baseDir, templates, overwrite);
        } catch (err) {
            reportError("Failed to apply assets", err);
            return [];
        }
    }

    async function ensureAutoAssets(baseDir: string, projectId: string, assetsEnabledOverride?: boolean) {
        const enabledGlobal = assetSettings.autoApplyEnabled;
        if (!enabledGlobal) return;

        const enabledProject =
            assetsEnabledOverride ??
            (projects.find((p) => p.id === projectId)?.assetsEnabled ?? true);
        if (!enabledProject) return;

        const templates = assets.filter((a) => a.autoApply ?? true);
        if (templates.length === 0) return;

        await applyTextAssets(baseDir, templates, false);
    }

    function openApplyAssetModal(target: ApplyAssetTarget, dir: string, assetId: string) {
        setApplyAssetError(null);
        setApplyAssetApplying(false);
        setApplyAssetRequest({ target, dir, assetId });
    }

    function closeApplyAssetModal() {
        if (applyAssetApplying) return;
        setApplyAssetRequest(null);
        setApplyAssetError(null);
    }

    async function confirmApplyAsset(overwrite: boolean) {
        const req = applyAssetRequest;
        if (!req) return;
        const asset = assets.find((a) => a.id === req.assetId);
        if (!asset) {
            setApplyAssetRequest(null);
            return;
        }

        setApplyAssetApplying(true);
        setApplyAssetError(null);
        try {
            const written = await applyTextAssetsRaw(req.dir, [asset], overwrite);
            setApplyAssetRequest(null);

            const templateLabel = asset.name.trim() || "template";
            const targetLabel = req.target === "project" ? "project" : "tab";
            const targetPath = shortenPathSmart(joinPathDisplay(req.dir, asset.relativePath), 72);
            if (written.length === 0) {
                showNotice(`Skipped "${templateLabel}" (${targetLabel}): ${targetPath}`);
                return;
            }
            const verb = overwrite ? "Applied (overwrite)" : "Applied";
            showNotice(
                `${verb} "${templateLabel}" (${targetLabel}): ${shortenPathSmart(written[0] ?? targetPath, 72)}`,
            );
        } catch (err) {
            setApplyAssetError(formatError(err));
            reportError("Failed to apply asset", err);
        } finally {
            setApplyAssetApplying(false);
        }
    }

    return {
        assets,
        setAssets,
        assetSettings,
        setAssetSettings,
        assetEditorOpen,
        setAssetEditorOpen,
        assetEditorId,
        setAssetEditorId,
        assetEditorName,
        setAssetEditorName,
        assetEditorPath,
        setAssetEditorPath,
        assetEditorAutoApply,
        setAssetEditorAutoApply,
        assetEditorContent,
        setAssetEditorContent,
        applyAssetRequest,
        setApplyAssetRequest,
        applyAssetApplying,
        setApplyAssetApplying,
        applyAssetError,
        setApplyAssetError,
        confirmDeleteAssetId,
        setConfirmDeleteAssetId,
        assetNameRef,

        openAssetEditor,
        closeAssetEditor,
        saveAssetFromEditor,
        requestDeleteAsset,
        confirmDeleteAsset,
        toggleAssetAutoApply,
        ensureAutoAssets,
        openApplyAssetModal,
        closeApplyAssetModal,
        confirmApplyAsset,
    };
}
