// RunConfigSheet — the body for `{ type: 'runConfig'; taskId; sessionId? }`.
// Inline spawn configuration (provider / model / reasoning / mode / permissions / worktree)
// seeded from the task's assigned team member, then POST /api/sessions/spawn via
// the @/state client. The new session arrives over the session:spawn IMMEDIATE WS
// event (Pulse ingests it — idempotent), so we DO NOT insert it ourselves: on
// success we just dismiss and navigate to the (soon-to-exist) session detail.
//
// spawnSource is FORCED to 'ui' inside the client — never set here.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Input, SheetHeader, SheetSection, FieldRow, Toggle, Text } from '@/components';
import { getMaestroClient, useModelProfiles, useTask, useTeamMember, useUiStore } from '@/state';
import {
  AGENT_MODES,
  LAUNCH_REASONING_EFFORTS,
  PERMISSION_MODES,
  asTaskId,
  asTeamMemberId,
  type AgentMode,
  type LaunchProvider,
  type LaunchReasoningEffort,
  type ModelProfile,
  type PermissionMode,
} from '@/domain';
import { spawnSessionRequestSchema, type SpawnSessionRequest } from '@/domain/schemas/spawn';

import { routes } from '../../../navigation';
import type { SheetBodyProps } from '../../../navigation/sheets';

// ── Display labels for the closed enums (picker option labels) ────────────────
const MODE_LABEL: Record<AgentMode, string> = {
  worker: 'Worker',
  coordinator: 'Coordinator',
  'coordinated-worker': 'Coordinated worker',
  'coordinated-coordinator': 'Coordinated coordinator',
};
const PROVIDER_LABEL: Record<LaunchProvider, string> = {
  claude: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  hermes: 'Hermes',
};
// Matches the web provider-chip palette.
const PROVIDER_COLOR: Record<LaunchProvider, string> = {
  claude: '#A78BFA',
  openai: '#10B981',
  gemini: '#38BDF8',
  hermes: '#F59E0B',
};
const PERMISSION_LABEL: Record<PermissionMode, string> = {
  acceptEdits: 'Accept edits',
  interactive: 'Interactive',
  readOnly: 'Read only',
  bypassPermissions: 'Bypass permissions',
};

const CUSTOM_MODEL_ID = '__custom_model__';
const DEFAULT_REASONING_ID = '__default_reasoning__';
const RUN_PROVIDERS = ['claude', 'openai', 'gemini', 'hermes'] as const satisfies readonly LaunchProvider[];

function providerForLegacyTool(agentTool?: string): LaunchProvider {
  switch (agentTool) {
    case 'codex':
      return 'openai';
    case 'gemini':
      return 'gemini';
    case 'hermes':
      return 'hermes';
    default:
      return 'claude';
  }
}

function applyProfile(
  profile: ModelProfile,
  setProvider: (provider: LaunchProvider) => void,
  setModel: (model: string) => void,
  setReasoningEffort: (effort: LaunchReasoningEffort | undefined) => void,
  setSelectedProfileId: (id: string | null) => void,
  setIsCustomModel: (isCustom: boolean) => void,
): void {
  setProvider(profile.launchConfig.provider);
  setModel(profile.launchConfig.model);
  setReasoningEffort(profile.launchConfig.reasoningEffort);
  setSelectedProfileId(profile.id);
  setIsCustomModel(false);
}

export function RunConfigSheet({
  intent,
  sheet,
}: SheetBodyProps<{ type: 'runConfig'; taskId: string; sessionId?: string }>): React.JSX.Element {
  const router = useRouter();
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  const task = useTask(asTaskId(intent.taskId));
  const member = useTeamMember(asTeamMemberId(task?.teamMemberId ?? ''));
  const modelProfiles = useModelProfiles();

  // Profiles load independently of members, so the bound/default profile is
  // applied once both are in the entity store. A legacy member.model remains a
  // custom-model fallback when no profile applies.
  const [model, setModel] = useState<string>(member?.model ?? '');
  const [provider, setProvider] = useState<LaunchProvider>(() => providerForLegacyTool(member?.agentTool));
  const [reasoningEffort, setReasoningEffort] = useState<LaunchReasoningEffort | undefined>(undefined);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [isCustomModel, setIsCustomModel] = useState<boolean>(Boolean(member?.model));
  const [mode, setMode] = useState<AgentMode>(member?.mode ?? 'worker');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    member?.permissionMode ?? 'acceptEdits',
  );
  const [useWorktree, setUseWorktree] = useState<boolean>(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seededProfile = useRef(false);

  const taskTitle = task?.title ?? intent.taskId;

  const orderedProfiles = useMemo(
    () =>
      [...modelProfiles].sort(
        (a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name),
      ),
    [modelProfiles],
  );
  const selectedProfile = orderedProfiles.find((profile) => profile.id === selectedProfileId);
  const providerProfiles = orderedProfiles.filter((profile) => profile.launchConfig.provider === provider);

  useEffect(() => {
    // Do not let an early profile response beat the task/member response: a
    // member-bound profile must take precedence over the workspace default.
    if (seededProfile.current || !task || orderedProfiles.length === 0) return;
    if (task.teamMemberId && !member) return;
    const initialProfile =
      orderedProfiles.find((profile) => profile.id === member?.modelProfileId) ??
      orderedProfiles.find((profile) => profile.isDefault);

    if (initialProfile) {
      applyProfile(
        initialProfile,
        setProvider,
        setModel,
        setReasoningEffort,
        setSelectedProfileId,
        setIsCustomModel,
      );
    }
    seededProfile.current = true;
  }, [member, orderedProfiles, task]);

  // Open the universal single-select picker, mapping its result back to a setter.
  function pick<T extends string>(
    title: string,
    values: readonly T[],
    current: T,
    label: (v: T) => string,
    onPicked: (v: T) => void,
  ): void {
    sheet.open({
      type: 'picker',
      config: {
        title,
        selectedIds: [current],
        options: values.map((v) => ({ id: v, label: label(v) })),
        onSubmit: (ids) => {
          const next = ids[0] as T | undefined;
          if (next) onPicked(next);
        },
      },
    });
  }

  function selectProvider(nextProvider: LaunchProvider): void {
    setProvider(nextProvider);
    const firstProfile = orderedProfiles.find((profile) => profile.launchConfig.provider === nextProvider);
    if (firstProfile) {
      applyProfile(
        firstProfile,
        setProvider,
        setModel,
        setReasoningEffort,
        setSelectedProfileId,
        setIsCustomModel,
      );
      return;
    }
    setSelectedProfileId(null);
    setIsCustomModel(true);
    setModel('');
    setReasoningEffort(undefined);
  }

  function openModelPicker(): void {
    sheet.open({
      type: 'picker',
      config: {
        title: `${PROVIDER_LABEL[provider]} models`,
        selectedIds: [isCustomModel ? CUSTOM_MODEL_ID : selectedProfileId].filter(
          (id): id is string => Boolean(id),
        ),
        searchable: true,
        options: [
          ...providerProfiles.map((profile) => ({
            id: profile.id,
            label: profile.name,
            badge: PROVIDER_LABEL[profile.launchConfig.provider],
            tone: PROVIDER_COLOR[profile.launchConfig.provider],
            sublabel: [profile.launchConfig.model, profile.launchConfig.reasoningEffort]
              .filter(Boolean)
              .join(' · '),
            monoSublabel: true,
          })),
          {
            id: CUSTOM_MODEL_ID,
            label: 'Custom…',
            sublabel: 'Enter a raw model ID',
          },
        ],
        onSubmit: (ids) => {
          const nextId = ids[0];
          if (nextId === CUSTOM_MODEL_ID) {
            setSelectedProfileId(null);
            setIsCustomModel(true);
            setModel('');
            setReasoningEffort(undefined);
            return;
          }
          const profile = orderedProfiles.find((candidate) => candidate.id === nextId);
          if (profile) {
            applyProfile(
              profile,
              setProvider,
              setModel,
              setReasoningEffort,
              setSelectedProfileId,
              setIsCustomModel,
            );
          }
        },
      },
    });
  }

  const projectId = useMemo(
    () => task?.projectId ?? activeProjectId ?? undefined,
    [task?.projectId, activeProjectId],
  );

  async function onSpawn(): Promise<void> {
    if (busy) return;
    setError(null);
    if (!model.trim()) {
      setError('Choose a model profile or enter a custom model ID.');
      return;
    }
    setBusy(true);
    try {
      // NOTE: no cols/rows here — the server's spawn schema is strict and the PTY
      // is sized by the terminal's own resize once it attaches. Sending them got
      // rejected as "Unrecognized keys" by stricter (e.g. hosted) servers.
      const request: SpawnSessionRequest = spawnSessionRequestSchema.parse({
        taskIds: [intent.taskId],
        ...(intent.sessionId ? { sessionId: intent.sessionId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(member?.id ? { teamMemberId: member.id } : {}),
        mode,
        permissionMode,
        launchConfig: {
          provider,
          model: model.trim(),
          ...(reasoningEffort ? { reasoningEffort } : {}),
        },
        useWorktree,
      });

      const resp = await getMaestroClient().spawnSession(request);
      // Session lands via session:spawn (idempotent ingest) — don't insert it.
      sheet.dismissAll();
      router.push(routes.session(resp.sessionId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to spawn session.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <SheetHeader title="Run configuration" eyebrow="SPAWN" onClose={sheet.dismiss} />

      <SheetSection label="Task">
          <Text variant="body" color="ink" numberOfLines={2}>
            {taskTitle}
          </Text>
          {member != null && (
            <Text variant="secondary" color="ink3" numberOfLines={1}>
              {member.name} · {member.role}
            </Text>
          )}
        </SheetSection>

        <View style={styles.card}>
          <FieldRow
            label="Provider"
            value={PROVIDER_LABEL[provider]}
            onPress={() =>
              sheet.open({
                type: 'picker',
                config: {
                  title: 'Provider',
                  selectedIds: [provider],
                  options: RUN_PROVIDERS.map((option) => ({
                    id: option,
                    label: PROVIDER_LABEL[option],
                    tone: PROVIDER_COLOR[option],
                  })),
                  onSubmit: (ids) => {
                    const next = ids[0] as LaunchProvider | undefined;
                    if (next) selectProvider(next);
                  },
                },
              })
            }
            accessibilityHint="Choose the model provider"
          />
          <FieldRow
            label="Model"
            value={isCustomModel ? (model || 'Custom…') : (selectedProfile?.name ?? 'Choose a model')}
            onPress={openModelPicker}
            accessibilityHint="Choose a server-defined model profile or enter a custom model"
          />
          {isCustomModel ? (
            <View style={styles.customModelInput}>
              <Input
                value={model}
                onChangeText={setModel}
                placeholder="Model ID"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ) : null}
          {provider === 'claude' ? (
            <FieldRow
              label="Reasoning"
              value={reasoningEffort ?? 'Default'}
              onPress={() =>
                sheet.open({
                  type: 'picker',
                  config: {
                    title: 'Reasoning effort',
                    selectedIds: reasoningEffort ? [reasoningEffort] : [DEFAULT_REASONING_ID],
                    options: [
                      { id: DEFAULT_REASONING_ID, label: 'Default', sublabel: 'Use the model default' },
                      ...LAUNCH_REASONING_EFFORTS.map((effort) => ({ id: effort, label: effort })),
                    ],
                    onSubmit: (ids) => {
                      const next = ids[0] as LaunchReasoningEffort | typeof DEFAULT_REASONING_ID | undefined;
                      setReasoningEffort(next === DEFAULT_REASONING_ID || !next ? undefined : next);
                    },
                  },
                })
              }
              accessibilityHint="Choose Claude reasoning effort"
            />
          ) : null}
          <FieldRow
            label="Mode"
            value={MODE_LABEL[mode]}
            onPress={() => pick('Mode', AGENT_MODES, mode, (v) => MODE_LABEL[v], setMode)}
            accessibilityHint="Choose the agent mode"
          />
          <FieldRow
            label="Permissions"
            value={PERMISSION_LABEL[permissionMode]}
            onPress={() =>
              pick('Permissions', PERMISSION_MODES, permissionMode, (v) => PERMISSION_LABEL[v], setPermissionMode)
            }
            accessibilityHint="Choose the permission mode"
          />
        </View>

        <SheetSection label="Options">
          <View style={styles.toggleStack}>
            <Toggle
              label="Bypass permissions"
              on={permissionMode === 'bypassPermissions'}
              tone="danger"
              icon="shield"
              size="lg"
              onToggle={(v) =>
                setPermissionMode(v ? 'bypassPermissions' : member?.permissionMode ?? 'acceptEdits')
              }
            />
            <Toggle
              label="Run in worktree"
              on={useWorktree}
              tone="worktree"
              icon="gitBranch"
              size="lg"
              onToggle={setUseWorktree}
            />
          </View>
        </SheetSection>

        {error != null && (
          <Text variant="secondary" color="blockText" style={styles.error}>
            {error}
          </Text>
        )}

        <View style={styles.actions}>
          <Button
            label={busy ? 'Spawning…' : 'Spawn'}
            icon="play"
            variant="primary"
            fullWidth
            disabled={busy}
            onPress={() => void onSpawn()}
          />
        </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    paddingBottom: theme.space[2],
  },
  card: {
    marginHorizontal: theme.space[4],
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    overflow: 'hidden',
  },
  customModelInput: {
    paddingHorizontal: theme.space[4],
    paddingBottom: theme.space[2],
    paddingLeft: theme.space[4] + 96 + theme.space[3],
  },
  error: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[2],
  },
  actions: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[4],
  },
  toggleStack: {
    gap: theme.space[2],
  },
}));
