import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { IS_TAURI } from '../platform';
import {
  AssetTemplate,
  AssetSettings,
  ApplyAssetRequest,
  ApplyAssetTarget,
} from '../app/types/app-state';
import { makeId } from '../app/utils/id';
import { formatError, joinPathDisplay } from '../utils/formatters';
import { shortenPathSmart } from '../pathDisplay';
import { useUIStore } from './useUIStore';
import { useProjectStore } from './useProjectStore';

interface AssetState {
  assets: AssetTemplate[];
  assetSettings: AssetSettings;
  assetEditorOpen: boolean;
  assetEditorId: string | null;
  assetEditorName: string;
  assetEditorPath: string;
  assetEditorAutoApply: boolean;
  assetEditorContent: string;
  applyAssetRequest: ApplyAssetRequest | null;
  applyAssetApplying: boolean;
  applyAssetError: string | null;
  confirmDeleteAssetId: string | null;
  setAssets: (assets: AssetTemplate[] | ((prev: AssetTemplate[]) => AssetTemplate[])) => void;
  setAssetSettings: (settings: AssetSettings | ((prev: AssetSettings) => AssetSettings)) => void;
  setAssetEditorOpen: (open: boolean) => void;
  setAssetEditorId: (id: string | null) => void;
  setAssetEditorName: (name: string) => void;
  setAssetEditorPath: (path: string) => void;
  setAssetEditorAutoApply: (autoApply: boolean) => void;
  setAssetEditorContent: (content: string) => void;
  setApplyAssetRequest: (request: ApplyAssetRequest | null) => void;
  setApplyAssetApplying: (applying: boolean) => void;
  setApplyAssetError: (error: string | null) => void;
  setConfirmDeleteAssetId: (id: string | null) => void;
  openAssetEditor: (asset?: AssetTemplate) => void;
  closeAssetEditor: () => void;
  saveAssetFromEditor: () => void;
  requestDeleteAsset: (id: string) => void;
  confirmDeleteAsset: () => void;
  toggleAssetAutoApply: (id: string) => void;
  ensureAutoAssets: (baseDir: string, projectId: string, assetsEnabledOverride?: boolean) => Promise<void>;
  openApplyAssetModal: (target: ApplyAssetTarget, dir: string, assetId: string) => void;
  closeApplyAssetModal: () => void;
  confirmApplyAsset: (overwrite: boolean) => Promise<void>;
}

async function applyTextAssetsRaw(
  baseDir: string,
  templates: AssetTemplate[],
  overwrite: boolean,
): Promise<string[]> {
  const dir = baseDir.trim();
  if (!dir) return [];
  const payload = templates
    .map((t) => ({ relativePath: t.relativePath, content: t.content }))
    .filter((t) => t.relativePath.trim());
  if (payload.length === 0) return [];
  if (!IS_TAURI) return [];
  return invoke<string[]>('apply_text_assets', { baseDir: dir, assets: payload, overwrite });
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: [],
  assetSettings: { autoApplyEnabled: true },
  assetEditorOpen: false,
  assetEditorId: null,
  assetEditorName: '',
  assetEditorPath: '',
  assetEditorAutoApply: true,
  assetEditorContent: '',
  applyAssetRequest: null,
  applyAssetApplying: false,
  applyAssetError: null,
  confirmDeleteAssetId: null,

  setAssets: (assets) =>
    set((s) => ({ assets: typeof assets === 'function' ? assets(s.assets) : assets })),
  setAssetSettings: (settings) =>
    set((s) => ({
      assetSettings: typeof settings === 'function' ? settings(s.assetSettings) : settings,
    })),
  setAssetEditorOpen: (open) => set({ assetEditorOpen: open }),
  setAssetEditorId: (id) => set({ assetEditorId: id }),
  setAssetEditorName: (name) => set({ assetEditorName: name }),
  setAssetEditorPath: (path) => set({ assetEditorPath: path }),
  setAssetEditorAutoApply: (autoApply) => set({ assetEditorAutoApply: autoApply }),
  setAssetEditorContent: (content) => set({ assetEditorContent: content }),
  setApplyAssetRequest: (request) => set({ applyAssetRequest: request }),
  setApplyAssetApplying: (applying) => set({ applyAssetApplying: applying }),
  setApplyAssetError: (error) => set({ applyAssetError: error }),
  setConfirmDeleteAssetId: (id) => set({ confirmDeleteAssetId: id }),

  openAssetEditor: (asset) => {
    set({
      assetEditorId: asset?.id ?? null,
      assetEditorName: asset?.name ?? '',
      assetEditorPath: asset?.relativePath ?? '',
      assetEditorContent: asset?.content ?? '',
      assetEditorAutoApply: asset?.autoApply ?? true,
      assetEditorOpen: true,
    });
  },

  closeAssetEditor: () => {
    set({
      assetEditorOpen: false,
      assetEditorId: null,
      assetEditorName: '',
      assetEditorPath: '',
      assetEditorContent: '',
      assetEditorAutoApply: true,
    });
  },

  saveAssetFromEditor: () => {
    const {
      assetEditorName,
      assetEditorPath,
      assetEditorContent,
      assetEditorId,
      assetEditorAutoApply,
      assets,
    } = get();
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
      createdAt: assetEditorId
        ? (assets.find((a) => a.id === assetEditorId)?.createdAt ?? now)
        : now,
      autoApply: assetEditorAutoApply,
    };
    const updated = assetEditorId
      ? assets
          .map((a) => (a.id === assetEditorId ? next : a))
          .sort((a, b) => b.createdAt - a.createdAt)
      : [...assets, next].sort((a, b) => b.createdAt - a.createdAt);
    set({
      assets: updated,
      assetEditorOpen: false,
      assetEditorId: null,
      assetEditorName: '',
      assetEditorPath: '',
      assetEditorContent: '',
      assetEditorAutoApply: true,
    });
  },

  requestDeleteAsset: (id) => set({ confirmDeleteAssetId: id }),

  confirmDeleteAsset: () => {
    const {
      confirmDeleteAssetId: id,
      assets,
      assetEditorId,
      applyAssetRequest,
    } = get();
    if (!id) return;
    const asset = assets.find((a) => a.id === id);
    const label = asset?.name?.trim() ? asset.name.trim() : 'template';

    const updates: Partial<AssetState> = {
      confirmDeleteAssetId: null,
      assets: assets.filter((a) => a.id !== id),
    };
    if (assetEditorId === id) {
      updates.assetEditorOpen = false;
      updates.assetEditorId = null;
      updates.assetEditorName = '';
      updates.assetEditorPath = '';
      updates.assetEditorContent = '';
      updates.assetEditorAutoApply = true;
    }
    if (applyAssetRequest?.assetId === id) {
      updates.applyAssetRequest = null;
      updates.applyAssetError = null;
      updates.applyAssetApplying = false;
    }
    set(updates as AssetState);

    useUIStore.getState().showNotice(`Deleted template "${label}"`);
  },

  toggleAssetAutoApply: (id) =>
    set((state) => ({
      assets: state.assets.map((a) =>
        a.id === id ? { ...a, autoApply: !(a.autoApply ?? true) } : a,
      ),
    })),

  ensureAutoAssets: async (baseDir, projectId, assetsEnabledOverride) => {
    const { assetSettings, assets } = get();
    if (!assetSettings.autoApplyEnabled) return;

    // Cross-store: check project's assetsEnabled
    const { projects } = useProjectStore.getState();
    const enabledProject =
      assetsEnabledOverride ??
      (projects.find((p: MaestroProjectLike) => p.id === projectId)?.assetsEnabled ?? true);
    if (!enabledProject) return;

    const templates = assets.filter((a) => a.autoApply ?? true);
    if (templates.length === 0) return;

    try {
      await applyTextAssetsRaw(baseDir, templates, false);
    } catch (err) {
      useUIStore.getState().reportError('Failed to apply assets', err);
    }
  },

  openApplyAssetModal: (target, dir, assetId) => {
    set({
      applyAssetError: null,
      applyAssetApplying: false,
      applyAssetRequest: { target, dir, assetId },
    });
  },

  closeApplyAssetModal: () => {
    if (get().applyAssetApplying) return;
    set({ applyAssetRequest: null, applyAssetError: null });
  },

  confirmApplyAsset: async (overwrite) => {
    const { applyAssetRequest: req, assets } = get();
    if (!req) return;
    const asset = assets.find((a) => a.id === req.assetId);
    if (!asset) {
      set({ applyAssetRequest: null });
      return;
    }

    set({ applyAssetApplying: true, applyAssetError: null });
    try {
      const written = await applyTextAssetsRaw(req.dir, [asset], overwrite);
      set({ applyAssetRequest: null });

      const { showNotice } = useUIStore.getState();
      const templateLabel = asset.name.trim() || 'template';
      const targetLabel = req.target === 'project' ? 'project' : 'tab';
      const targetPath = shortenPathSmart(joinPathDisplay(req.dir, asset.relativePath), 72);
      if (written.length === 0) {
        showNotice(`Skipped "${templateLabel}" (${targetLabel}): ${targetPath}`);
        return;
      }
      const verb = overwrite ? 'Applied (overwrite)' : 'Applied';
      showNotice(
        `${verb} "${templateLabel}" (${targetLabel}): ${shortenPathSmart(written[0] ?? targetPath, 72)}`,
      );
    } catch (err) {
      set({ applyAssetError: formatError(err) });
      useUIStore.getState().reportError('Failed to apply asset', err);
    } finally {
      set({ applyAssetApplying: false });
    }
  },
}));

// Internal type alias to avoid importing MaestroProject in the module scope (circular import risk)
type MaestroProjectLike = { id: string; assetsEnabled?: boolean };
