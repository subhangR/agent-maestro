import React, { useRef, useMemo, useEffect } from "react";
import { useSessionStore, getActive, getSortedSessions } from "../../stores/useSessionStore";
import { useProjectStore } from "../../stores/useProjectStore";
import { useProjectDialogStore } from "../../stores/useProjectDialogStore";
import { useSshStore } from "../../stores/useSshStore";
import { usePersistentSessionStore } from "../../stores/usePersistentSessionStore";
import { useAgentShortcutStore } from "../../stores/useAgentShortcutStore";
import { usePromptStore } from "../../stores/usePromptStore";
import { useEnvironmentStore } from "../../stores/useEnvironmentStore";
import { useAssetStore } from "../../stores/useAssetStore";
import { usePathPickerStore } from "../../stores/usePathPickerStore";
import { useSecureStorageStore } from "../../stores/useSecureStorageStore";
import { useRecordingStore } from "../../stores/useRecordingStore";
import { useUIStore } from "../../stores/useUIStore";
import { useQuickLaunch } from "../../hooks/useQuickLaunch";
import { AgentShortcutsModal } from "../AgentShortcutsModal";
import { NewSessionModal } from "../modals/NewSessionModal";
import {
  PersistentSessionsModal,
  type PersistentSessionsModalItem,
} from "../modals/PersistentSessionsModal";
import { ManageTerminalsModal } from "../modals/ManageTerminalsModal";
import { ProjectModal } from "../modals/ProjectModal";
import { ConfirmDeleteProjectModal } from "../modals/ConfirmDeleteProjectModal";
import { ConfirmDeleteRecordingModal } from "../modals/ConfirmDeleteRecordingModal";
import { ApplyAssetModal } from "../modals/ApplyAssetModal";
import { ConfirmActionModal } from "../modals/ConfirmActionModal";
import { PathPickerModal } from "../modals/PathPickerModal";
import { SshManagerModal } from "../modals/SshManagerModal";
import { SecureStorageModal } from "../modals/SecureStorageModal";
import { StartRecordingModal } from "../modals/StartRecordingModal";
import { RecordingsListModal } from "../modals/RecordingsListModal";
import { ReplayModal } from "../modals/ReplayModal";
import { AgentModalViewer } from "../modals/AgentModalViewer";
import { useMaestroStore } from "../../stores/useMaestroStore";
import { SpellStudio } from "../spells/studio/SpellStudio";
import { TeamMemberIntroDialog } from "../maestro/TeamMemberIntroDialog";
import { SpellbookDrawer } from "../spells/studio/spellbook";
import { UndoToast } from "../spells/UndoToast";
import { SpellNotificationToasts } from "../spells/SpellNotificationToasts";
import { useSpellbookStore } from "../../stores/useSpellbookStore";
import { normalizeSmartQuotes } from "../../app/utils/string";

export function AppModals() {
  /* ------------------------------------------------------------------ */
  /*  Local refs for modal inputs                                        */
  /* ------------------------------------------------------------------ */

  const newNameRef = useRef<HTMLInputElement | null>(null);
  const sshHostInputRef = useRef<HTMLInputElement | null>(null);
  const projectTitleRef = useRef<HTMLInputElement | null>(null);
  const recordNameRef = useRef<HTMLInputElement | null>(null);
  const replayNextItemRef = useRef<HTMLDivElement | null>(null);

  /* ------------------------------------------------------------------ */
  /*  Store subscriptions                                                */
  /* ------------------------------------------------------------------ */

  // Session store
  const sessions = useSessionStore((s) => s.sessions);
  const newOpen = useSessionStore((s) => s.newOpen);
  const setNewOpen = useSessionStore((s) => s.setNewOpen);
  const newName = useSessionStore((s) => s.newName);
  const setNewName = useSessionStore((s) => s.setNewName);
  const newCommand = useSessionStore((s) => s.newCommand);
  const setNewCommand = useSessionStore((s) => s.setNewCommand);
  const newPersistent = useSessionStore((s) => s.newPersistent);
  const setNewPersistent = useSessionStore((s) => s.setNewPersistent);
  const newCwd = useSessionStore((s) => s.newCwd);
  const setNewCwd = useSessionStore((s) => s.setNewCwd);
  const onNewSubmit = useSessionStore((s) => s.onNewSubmit);
  const onSshConnect = useSessionStore((s) => s.onSshConnect);
  const attachPersistentSession = useSessionStore((s) => s.attachPersistentSession);
  const reorderSessions = useSessionStore((s) => s.reorderSessions);
  const sendNextReplayStep = useSessionStore((s) => s.sendNextReplayStep);
  const resetNewSessionForm = useSessionStore((s) => s.resetNewSessionForm);

  // Project store
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const onProjectSubmit = useProjectStore((s) => s.onProjectSubmit);
  const deleteActiveProject = useProjectStore((s) => s.deleteActiveProject);

  // Project dialog store
  const projectOpen = useProjectDialogStore((s) => s.projectOpen);
  const setProjectOpen = useProjectDialogStore((s) => s.setProjectOpen);
  const projectMode = useProjectDialogStore((s) => s.projectMode);
  const projectTitle = useProjectDialogStore((s) => s.projectTitle);
  const setProjectTitle = useProjectDialogStore((s) => s.setProjectTitle);
  const projectBasePath = useProjectDialogStore((s) => s.projectBasePath);
  const setProjectBasePath = useProjectDialogStore((s) => s.setProjectBasePath);
  const projectEnvironmentId = useProjectDialogStore((s) => s.projectEnvironmentId);
  const setProjectEnvironmentId = useProjectDialogStore((s) => s.setProjectEnvironmentId);
  const projectAssetsEnabled = useProjectDialogStore((s) => s.projectAssetsEnabled);
  const setProjectAssetsEnabled = useProjectDialogStore((s) => s.setProjectAssetsEnabled);
  const projectSoundInstrument = useProjectDialogStore((s) => s.projectSoundInstrument);
  const setProjectSoundInstrument = useProjectDialogStore((s) => s.setProjectSoundInstrument);
  const projectSoundConfig = useProjectDialogStore((s) => s.projectSoundConfig);
  const setProjectSoundConfig = useProjectDialogStore((s) => s.setProjectSoundConfig);
  const confirmDeleteProjectOpen = useProjectDialogStore((s) => s.confirmDeleteProjectOpen);
  const setConfirmDeleteProjectOpen = useProjectDialogStore((s) => s.setConfirmDeleteProjectOpen);
  const deleteProjectError = useProjectDialogStore((s) => s.deleteProjectError);
  const deleteProjectId = useProjectDialogStore((s) => s.deleteProjectId);

  // SSH store
  const sshManagerOpen = useSshStore((s) => s.sshManagerOpen);
  const setSshManagerOpen = useSshStore((s) => s.setSshManagerOpen);
  const sshHosts = useSshStore((s) => s.sshHosts);
  const sshHostsLoading = useSshStore((s) => s.sshHostsLoading);
  const sshHostsError = useSshStore((s) => s.sshHostsError);
  const sshHost = useSshStore((s) => s.sshHost);
  const setSshHost = useSshStore((s) => s.setSshHost);
  const sshPersistent = useSshStore((s) => s.sshPersistent);
  const setSshPersistent = useSshStore((s) => s.setSshPersistent);
  const sshForwardOnly = useSshStore((s) => s.sshForwardOnly);
  const setSshForwardOnly = useSshStore((s) => s.setSshForwardOnly);
  const sshExitOnForwardFailure = useSshStore((s) => s.sshExitOnForwardFailure);
  const setSshExitOnForwardFailure = useSshStore((s) => s.setSshExitOnForwardFailure);
  const sshForwards = useSshStore((s) => s.sshForwards);
  const addSshForward = useSshStore((s) => s.addSshForward);
  const removeSshForward = useSshStore((s) => s.removeSshForward);
  const updateSshForward = useSshStore((s) => s.updateSshForward);
  const sshError = useSshStore((s) => s.sshError);
  const setSshError = useSshStore((s) => s.setSshError);
  const refreshSshHosts = useSshStore((s) => s.refreshSshHosts);
  const copySshCommand = useSshStore((s) => s.copySshCommand);
  const getSshCommandPreview = useSshStore((s) => s.getSshCommandPreview);

  // Persistent session store
  const persistentSessionsOpen = usePersistentSessionStore((s) => s.persistentSessionsOpen);
  const persistentSessionsLoading = usePersistentSessionStore((s) => s.persistentSessionsLoading);
  const persistentSessionsError = usePersistentSessionStore((s) => s.persistentSessionsError);
  const persistentSessions = usePersistentSessionStore((s) => s.persistentSessions);
  const confirmKillPersistentId = usePersistentSessionStore((s) => s.confirmKillPersistentId);
  const setConfirmKillPersistentId = usePersistentSessionStore((s) => s.setConfirmKillPersistentId);
  const confirmKillPersistentBusy = usePersistentSessionStore((s) => s.confirmKillPersistentBusy);
  const refreshPersistentSessions = usePersistentSessionStore((s) => s.refreshPersistentSessions);
  const requestKillPersistent = usePersistentSessionStore((s) => s.requestKillPersistent);
  const confirmKillPersistentSession = usePersistentSessionStore((s) => s.confirmKillPersistentSession);
  const closePersistentSessionsModal = usePersistentSessionStore((s) => s.closePersistentSessionsModal);
  const manageTerminalsOpen = usePersistentSessionStore((s) => s.manageTerminalsOpen);
  const setManageTerminalsOpen = usePersistentSessionStore((s) => s.setManageTerminalsOpen);

  // Agent shortcut store
  const agentShortcutsOpen = useAgentShortcutStore((s) => s.agentShortcutsOpen);
  const setAgentShortcutsOpen = useAgentShortcutStore((s) => s.setAgentShortcutsOpen);
  const agentShortcutIds = useAgentShortcutStore((s) => s.agentShortcutIds);
  const addAgentShortcut = useAgentShortcutStore((s) => s.addAgentShortcut);
  const removeAgentShortcut = useAgentShortcutStore((s) => s.removeAgentShortcut);
  const moveAgentShortcut = useAgentShortcutStore((s) => s.moveAgentShortcut);
  const resetAgentShortcuts = useAgentShortcutStore((s) => s.resetAgentShortcuts);

  // Prompt store
  const prompts = usePromptStore((s) => s.prompts);
  const confirmDeletePromptId = usePromptStore((s) => s.confirmDeletePromptId);
  const setConfirmDeletePromptId = usePromptStore((s) => s.setConfirmDeletePromptId);
  const confirmDeletePrompt = usePromptStore((s) => s.confirmDeletePrompt);

  // Environment store
  const environments = useEnvironmentStore((s) => s.environments);
  const setEnvironmentsOpen = useEnvironmentStore((s) => s.setEnvironmentsOpen);
  const confirmDeleteEnvironmentId = useEnvironmentStore((s) => s.confirmDeleteEnvironmentId);
  const setConfirmDeleteEnvironmentId = useEnvironmentStore((s) => s.setConfirmDeleteEnvironmentId);
  const confirmDeleteEnvironment = useEnvironmentStore((s) => s.confirmDeleteEnvironment);

  // Asset store
  const assets = useAssetStore((s) => s.assets);
  const confirmDeleteAssetId = useAssetStore((s) => s.confirmDeleteAssetId);
  const setConfirmDeleteAssetId = useAssetStore((s) => s.setConfirmDeleteAssetId);
  const confirmDeleteAsset = useAssetStore((s) => s.confirmDeleteAsset);
  const applyAssetRequest = useAssetStore((s) => s.applyAssetRequest);
  const applyAssetApplying = useAssetStore((s) => s.applyAssetApplying);
  const applyAssetError = useAssetStore((s) => s.applyAssetError);
  const closeApplyAssetModal = useAssetStore((s) => s.closeApplyAssetModal);
  const confirmApplyAsset = useAssetStore((s) => s.confirmApplyAsset);

  // Path picker store
  const pathPickerOpen = usePathPickerStore((s) => s.pathPickerOpen);
  const pathPickerTarget = usePathPickerStore((s) => s.pathPickerTarget);
  const pathPickerListing = usePathPickerStore((s) => s.pathPickerListing);
  const pathPickerLoading = usePathPickerStore((s) => s.pathPickerLoading);
  const pathPickerError = usePathPickerStore((s) => s.pathPickerError);
  const loadPathPicker = usePathPickerStore((s) => s.loadPathPicker);
  const closePathPicker = usePathPickerStore((s) => s.closePathPicker);
  const openPathPicker = usePathPickerStore((s) => s.openPathPicker);

  // Secure storage store
  const secureStorageSettingsOpen = useSecureStorageStore((s) => s.secureStorageSettingsOpen);
  const secureStorageSettingsError = useSecureStorageStore((s) => s.secureStorageSettingsError);
  const secureStorageMode = useSecureStorageStore((s) => s.secureStorageMode);
  const secureStorageSettingsMode = useSecureStorageStore((s) => s.secureStorageSettingsMode);
  const setSecureStorageSettingsMode = useSecureStorageStore((s) => s.setSecureStorageSettingsMode);
  const secureStorageSettingsBusy = useSecureStorageStore((s) => s.secureStorageSettingsBusy);
  const closeSecureStorageSettings = useSecureStorageStore((s) => s.closeSecureStorageSettings);
  const applySecureStorageSettings = useSecureStorageStore((s) => s.applySecureStorageSettings);

  // Recording store
  const recordPromptOpen = useRecordingStore((s) => s.recordPromptOpen);
  const recordPromptName = useRecordingStore((s) => s.recordPromptName);
  const setRecordPromptName = useRecordingStore((s) => s.setRecordPromptName);
  const recordPromptSessionId = useRecordingStore((s) => s.recordPromptSessionId);
  const closeRecordPrompt = useRecordingStore((s) => s.closeRecordPrompt);
  const startRecording = useRecordingStore((s) => s.startRecording);
  const recordingsOpen = useRecordingStore((s) => s.recordingsOpen);
  const setRecordingsOpen = useRecordingStore((s) => s.setRecordingsOpen);
  const recordingsLoading = useRecordingStore((s) => s.recordingsLoading);
  const recordingsError = useRecordingStore((s) => s.recordingsError);
  const recordings = useRecordingStore((s) => s.recordings);
  const refreshRecordings = useRecordingStore((s) => s.refreshRecordings);
  const requestDeleteRecording = useRecordingStore((s) => s.requestDeleteRecording);
  const openReplay = useRecordingStore((s) => s.openReplay);
  const replayOpen = useRecordingStore((s) => s.replayOpen);
  const replayLoading = useRecordingStore((s) => s.replayLoading);
  const replayError = useRecordingStore((s) => s.replayError);
  const replayRecording = useRecordingStore((s) => s.replayRecording);
  const replayIndex = useRecordingStore((s) => s.replayIndex);
  const replaySteps = useRecordingStore((s) => s.replaySteps);
  const replayShowAll = useRecordingStore((s) => s.replayShowAll);
  const setReplayShowAll = useRecordingStore((s) => s.setReplayShowAll);
  const replayFlowExpanded = useRecordingStore((s) => s.replayFlowExpanded);
  const setReplayFlowExpanded = useRecordingStore((s) => s.setReplayFlowExpanded);
  const closeReplayModal = useRecordingStore((s) => s.closeReplayModal);
  const getReplayFlow = useRecordingStore((s) => s.getReplayFlow);
  const confirmDeleteRecordingId = useRecordingStore((s) => s.confirmDeleteRecordingId);
  const setConfirmDeleteRecordingId = useRecordingStore((s) => s.setConfirmDeleteRecordingId);
  const deleteRecording = useRecordingStore((s) => s.deleteRecording);

  // UI store
  const homeDir = useUIStore((s) => s.homeDir);

  // Maestro store — agent modals
  const activeModals = useMaestroStore((s) => s.activeModals);
  const closeAgentModal = useMaestroStore((s) => s.closeAgentModal);

  // Quick launch hook
  const { commandSuggestions, agentShortcuts } = useQuickLaunch({
    agentShortcutIds,
    sessions,
  });

  /* ------------------------------------------------------------------ */
  /*  Derived values                                                     */
  /* ------------------------------------------------------------------ */

  const active = getActive();
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId],
  );

  // Sorted sessions for the current project (used by ManageTerminalsModal)
  const projectSessions = useMemo(
    () => getSortedSessions(activeProjectId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, activeProjectId],
  );

  // SSH command preview
  const sshCommandPreview = getSshCommandPreview();

  // Persistent session items for modal
  const persistentSessionItems = useMemo<PersistentSessionsModalItem[]>(() => {
    if (!persistentSessions.length) return [];
    const projectTitleById = new Map(projects.map((p) => [p.id, p.name]));
    const out: PersistentSessionsModalItem[] = [];

    for (const ps of persistentSessions) {
      const activeSession =
        sessions.find((s) => s.persistId === ps.persistId && !s.exited && !s.closing) ?? null;
      const openInUi = Boolean(activeSession);
      const projectName = activeSession ? projectTitleById.get(activeSession.projectId) ?? null : null;
      const label = activeSession
        ? projectName
          ? `${activeSession.name} — ${projectName}`
          : activeSession.name
        : ps.sessionName;
      out.push({
        persistId: ps.persistId,
        sessionName: ps.sessionName,
        label,
        openInUi,
      });
    }

    out.sort((a, b) => {
      if (a.openInUi !== b.openInUi) return a.openInUi ? -1 : 1;
      return a.persistId.localeCompare(b.persistId);
    });
    return out;
  }, [persistentSessions, projects, sessions]);

  // Pending delete prompt
  const pendingDeletePrompt = confirmDeletePromptId
    ? prompts.find((p) => p.id === confirmDeletePromptId) ?? null
    : null;
  const pendingDeletePromptTitle = pendingDeletePrompt?.title?.trim() ?? null;

  // Pending delete environment
  const pendingDeleteEnvironment = confirmDeleteEnvironmentId
    ? environments.find((e) => e.id === confirmDeleteEnvironmentId) ?? null
    : null;
  const pendingDeleteEnvironmentName = pendingDeleteEnvironment?.name?.trim() ?? null;

  // Pending delete asset
  const pendingDeleteAsset = confirmDeleteAssetId
    ? assets.find((a) => a.id === confirmDeleteAssetId) ?? null
    : null;
  const pendingDeleteAssetName = pendingDeleteAsset?.name?.trim() ?? null;
  const pendingDeleteAssetRelativePath = pendingDeleteAsset?.relativePath ?? null;

  // Pending apply asset
  const pendingApplyAsset = applyAssetRequest
    ? assets.find((a) => a.id === applyAssetRequest.assetId) ?? null
    : null;
  const pendingApplyAssetName = pendingApplyAsset?.name ?? "";
  const pendingApplyAssetRelativePath = pendingApplyAsset?.relativePath ?? "";

  // Placeholders
  const cwdPlaceholder = activeProject?.basePath ?? "~";
  const basePathPlaceholder = homeDir ?? "~";
  // Active project derived
  const activeProjectName = activeProject?.name ?? null;
  const activeProjectTitle = activeProject?.name ?? "";

  // Conditional button helpers
  const canUseProjectBase = Boolean(activeProject?.basePath);
  const canUseCurrentTabCwd = Boolean(active?.cwd);
  const canUseCurrentTabBasePath = Boolean(active?.cwd);
  const canUseHomeBasePath = Boolean(homeDir);

  // Replay flow
  const replayFlow = getReplayFlow();

  /* ------------------------------------------------------------------ */
  /*  Auto-load inline browser when project modal opens                  */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    if (projectOpen) {
      const initialPath = projectBasePath.trim() || activeProject?.basePath || homeDir || null;
      openPathPicker("project", initialPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectOpen]);

  /* ------------------------------------------------------------------ */
  /*  Callbacks                                                          */
  /* ------------------------------------------------------------------ */

  const onBrowseNewCwd = () =>
    openPathPicker("session", newCwd.trim() || activeProject?.basePath || null);

  const onPathPickerSelect = () => {
    const selected = pathPickerListing?.path;
    if (!selected) return;
    if (pathPickerTarget === "project") setProjectBasePath(selected);
    if (pathPickerTarget === "session") setNewCwd(selected);
    closePathPicker();
  };

  const onCloseNewSession = () => {
    setNewOpen(false);
    setNewPersistent(false);
  };

  const onCloseSshManager = () => {
    setSshManagerOpen(false);
    setSshError(null);
  };

  const onCloseProject = () => setProjectOpen(false);

  const onConfirmDeleteProject = () => {
    setConfirmDeleteProjectOpen(false);
    void deleteActiveProject();
  };

  const onUseProjectBase = () => setNewCwd(activeProject?.basePath ?? "");
  const onUseCurrentTabCwd = () => setNewCwd(active?.cwd ?? "");
  const onUseCurrentTabBasePath = () => setProjectBasePath(active?.cwd ?? "");
  const onUseHomeBasePath = () => setProjectBasePath(homeDir ?? "");

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <>
      <NewSessionModal
        isOpen={newOpen}
        projectName={activeProjectName}
        name={newName}
        nameInputRef={newNameRef}
        onChangeName={(value) => setNewName(normalizeSmartQuotes(value))}
        command={newCommand}
        onChangeCommand={(value) => setNewCommand(normalizeSmartQuotes(value))}
        commandSuggestions={commandSuggestions}
        cwd={newCwd}
        onChangeCwd={(value) => setNewCwd(normalizeSmartQuotes(value))}
        cwdPlaceholder={cwdPlaceholder}
        onBrowseCwd={onBrowseNewCwd}
        canUseProjectBase={canUseProjectBase}
        onUseProjectBase={onUseProjectBase}
        canUseCurrentTab={canUseCurrentTabCwd}
        onUseCurrentTab={onUseCurrentTabCwd}
        onClose={onCloseNewSession}
        onSubmit={onNewSubmit}
      />

      <SshManagerModal
        isOpen={sshManagerOpen}
        hosts={sshHosts}
        hostsLoading={sshHostsLoading}
        hostsError={sshHostsError}
        onRefreshHosts={refreshSshHosts}
        host={sshHost}
        hostInputRef={sshHostInputRef}
        onChangeHost={setSshHost}
        forwardOnly={sshForwardOnly}
        onChangeForwardOnly={setSshForwardOnly}
        exitOnForwardFailure={sshExitOnForwardFailure}
        onChangeExitOnForwardFailure={setSshExitOnForwardFailure}
        forwards={sshForwards}
        onAddForward={addSshForward}
        onRemoveForward={removeSshForward}
        onUpdateForward={updateSshForward}
        commandPreview={sshCommandPreview}
        onCopyCommand={copySshCommand}
        error={sshError}
        onClose={onCloseSshManager}
        onConnect={() => void onSshConnect()}
      />

      <PersistentSessionsModal
        isOpen={persistentSessionsOpen}
        loading={persistentSessionsLoading}
        error={persistentSessionsError}
        sessions={persistentSessionItems}
        onClose={closePersistentSessionsModal}
        onRefresh={() => void refreshPersistentSessions()}
        onAttach={(persistId) => void attachPersistentSession(persistId)}
        onRequestKill={requestKillPersistent}
      />

      {manageTerminalsOpen && (
        <ManageTerminalsModal
          sessions={projectSessions}
          onReorder={reorderSessions}
          onClose={() => setManageTerminalsOpen(false)}
        />
      )}

      <AgentShortcutsModal
        isOpen={agentShortcutsOpen}
        agentShortcuts={agentShortcuts}
        onClose={() => setAgentShortcutsOpen(false)}
        onMoveUp={(id) => moveAgentShortcut(id, -1)}
        onMoveDown={(id) => moveAgentShortcut(id, 1)}
        onRemove={removeAgentShortcut}
        onAdd={addAgentShortcut}
        onResetDefaults={resetAgentShortcuts}
      />

      <ConfirmActionModal
        isOpen={Boolean(confirmKillPersistentId)}
        title="Kill persistent session"
        message={
          <>
            Kill{" "}
            {confirmKillPersistentId ? `agents-ui-${confirmKillPersistentId.slice(0, 8)}\u2026` : "this"}
            ? This will terminate any running shells/ssh inside the session.
          </>
        }
        confirmLabel="Kill"
        confirmDanger
        busy={confirmKillPersistentBusy}
        onClose={() => {
          if (confirmKillPersistentBusy) return;
          setConfirmKillPersistentId(null);
        }}
        onConfirm={() => void confirmKillPersistentSession()}
      />

      <ProjectModal
        isOpen={projectOpen}
        mode={projectMode}
        title={projectTitle}
        titleInputRef={projectTitleRef}
        onChangeTitle={(value) => setProjectTitle(normalizeSmartQuotes(value))}
        basePath={projectBasePath}
        onChangeBasePath={(value) => setProjectBasePath(normalizeSmartQuotes(value))}
        basePathPlaceholder={basePathPlaceholder}
        canUseCurrentTab={canUseCurrentTabBasePath}
        onUseCurrentTab={onUseCurrentTabBasePath}
        canUseHome={canUseHomeBasePath}
        onUseHome={onUseHomeBasePath}
        environments={environments}
        selectedEnvironmentId={projectEnvironmentId}
        onChangeEnvironmentId={setProjectEnvironmentId}
        onOpenEnvironments={() => setEnvironmentsOpen(true)}
        assetsEnabled={projectAssetsEnabled}
        onChangeAssetsEnabled={setProjectAssetsEnabled}
        soundInstrument={projectSoundInstrument}
        onChangeSoundInstrument={setProjectSoundInstrument}
        soundConfig={projectSoundConfig}
        onChangeSoundConfig={setProjectSoundConfig}
        onClose={onCloseProject}
        onSubmit={onProjectSubmit}
        browserListing={pathPickerTarget === "project" ? pathPickerListing : null}
        browserLoading={pathPickerTarget === "project" ? pathPickerLoading : false}
        browserError={pathPickerTarget === "project" ? pathPickerError : null}
        onBrowserNavigate={(path) => void loadPathPicker(path)}
        onBrowserSelect={(path) => setProjectBasePath(path)}
      />

      <ConfirmDeleteProjectModal
        isOpen={confirmDeleteProjectOpen}
        projectTitle={deleteProjectId ? (projects.find((p) => p.id === deleteProjectId)?.name ?? '') : activeProjectTitle}
        error={deleteProjectError}
        onClose={() => setConfirmDeleteProjectOpen(false)}
        onConfirmDelete={onConfirmDeleteProject}
      />

      <ConfirmDeleteRecordingModal
        isOpen={Boolean(confirmDeleteRecordingId)}
        recordingLabel={
          confirmDeleteRecordingId
            ? recordings.find((r) => r.recordingId === confirmDeleteRecordingId)?.meta?.name?.trim() ||
              confirmDeleteRecordingId
            : ""
        }
        onClose={() => setConfirmDeleteRecordingId(null)}
        onConfirmDelete={() => {
          const id = confirmDeleteRecordingId;
          setConfirmDeleteRecordingId(null);
          if (id) void deleteRecording(id);
        }}
      />

      <ConfirmActionModal
        isOpen={Boolean(confirmDeletePromptId)}
        title="Delete prompt"
        message={
          <>
            Delete{" "}
            {pendingDeletePromptTitle ? `"${pendingDeletePromptTitle}"` : "this prompt"}?
            {" "}This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        confirmDanger
        onClose={() => setConfirmDeletePromptId(null)}
        onConfirm={confirmDeletePrompt}
      />

      <ConfirmActionModal
        isOpen={Boolean(confirmDeleteEnvironmentId)}
        title="Delete environment"
        message={
          <>
            Delete{" "}
            {pendingDeleteEnvironmentName
              ? `"${pendingDeleteEnvironmentName}"`
              : "this environment"}
            ? Projects using it will fall back to no environment.
          </>
        }
        confirmLabel="Delete"
        confirmDanger
        onClose={() => setConfirmDeleteEnvironmentId(null)}
        onConfirm={confirmDeleteEnvironment}
      />

      <ConfirmActionModal
        isOpen={Boolean(confirmDeleteAssetId)}
        title="Delete template"
        message={
          <>
            Delete{" "}
            {pendingDeleteAssetName ? `"${pendingDeleteAssetName}"` : "this template"}?
            <br />
            Relative path: {pendingDeleteAssetRelativePath ?? "\u2014"}
          </>
        }
        confirmLabel="Delete"
        confirmDanger
        onClose={() => setConfirmDeleteAssetId(null)}
        onConfirm={confirmDeleteAsset}
      />

      <ApplyAssetModal
        isOpen={Boolean(applyAssetRequest && pendingApplyAssetName)}
        templateName={pendingApplyAssetName}
        relativePath={pendingApplyAssetRelativePath}
        targetLabel={applyAssetRequest?.target === "project" ? "project base path" : "tab working directory"}
        targetDir={applyAssetRequest?.dir ?? ""}
        applying={applyAssetApplying}
        error={applyAssetError}
        onClose={closeApplyAssetModal}
        onApply={(overwrite) => void confirmApplyAsset(overwrite)}
      />

      <PathPickerModal
        isOpen={pathPickerOpen && pathPickerTarget === "session"}
        listing={pathPickerListing}
        loading={pathPickerLoading}
        error={pathPickerError}
        onLoad={(path) => void loadPathPicker(path)}
        onClose={closePathPicker}
        onSelect={onPathPickerSelect}
      />

      {secureStorageSettingsOpen && (
        <SecureStorageModal
          isOpen={secureStorageSettingsOpen}
          onClose={closeSecureStorageSettings}
          error={secureStorageSettingsError}
          mode={secureStorageMode}
          settingsMode={secureStorageSettingsMode}
          onSettingsModeChange={setSecureStorageSettingsMode}
          busy={secureStorageSettingsBusy}
          onApply={applySecureStorageSettings}
          environments={environments}
        />
      )}

      {recordPromptOpen && (
        <StartRecordingModal
          isOpen={recordPromptOpen}
          onClose={closeRecordPrompt}
          sessionName={
            recordPromptSessionId
              ? sessions.find((s) => s.id === recordPromptSessionId)?.name ?? ""
              : ""
          }
          sessionId={recordPromptSessionId}
          name={recordPromptName}
          onChangeName={setRecordPromptName}
          onStart={() => {
            if (recordPromptSessionId && recordPromptName.trim()) {
              void startRecording(recordPromptSessionId, recordPromptName.trim());
            }
          }}
          nameInputRef={recordNameRef}
          secureStorageMode={secureStorageMode}
        />
      )}

      {recordingsOpen && (
        <RecordingsListModal
          isOpen={recordingsOpen}
          onClose={() => setRecordingsOpen(false)}
          recordings={recordings}
          loading={recordingsLoading}
          error={recordingsError}
          projects={projects}
          onRefresh={refreshRecordings}
          onDelete={requestDeleteRecording}
          onOpenReplay={(id, mode) => {
            setRecordingsOpen(false);
            void openReplay(id, mode);
          }}
        />
      )}

      {replayOpen && (
        <ReplayModal
          isOpen={replayOpen}
          onClose={closeReplayModal}
          loading={replayLoading}
          error={replayError}
          recording={replayRecording}
          index={replayIndex}
          steps={replaySteps}
          showAll={replayShowAll}
          setShowAll={(v) => setReplayShowAll(typeof v === "function" ? v(replayShowAll) : v)}
          flow={replayFlow}
          flowExpanded={replayFlowExpanded}
          setFlowExpanded={setReplayFlowExpanded}
          nextItemRef={replayNextItemRef}
          onSendNext={() => void sendNextReplayStep()}
        />
      )}

      {/* Spell Studio — unified Library/Detail/Cast/Entities + editor overlay
          (Track UI-A). Bridges the legacy launcher store, so every existing
          "cast this spell" caller opens the Studio in cast mode. */}
      <SpellStudio />

      {/* Intro dialog for agent/CLI-created team members */}
      <TeamMemberIntroDialog />
      <SpellbookHost />
      <UndoToast />
      <SpellNotificationToasts />

      {/* Agent-generated modals */}
      {activeModals.map((modal) => (
        <AgentModalViewer
          key={modal.modalId}
          modal={modal}
          onClose={() => closeAgentModal(modal.modalId)}
        />
      ))}
    </>
  );
}

function SpellbookHost() {
  const isOpen = useSpellbookStore((s) => s.isOpen);
  const scrollToSessionId = useSpellbookStore((s) => s.scrollToSessionId);
  const close = useSpellbookStore((s) => s.closeSpellbook);
  return (
    <SpellbookDrawer
      isOpen={isOpen}
      scrollToSessionId={scrollToSessionId}
      onClose={close}
    />
  );
}
