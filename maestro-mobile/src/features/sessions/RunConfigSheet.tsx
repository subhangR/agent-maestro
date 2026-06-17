// RunConfigSheet — the body for `{ type: 'runConfig'; taskId; sessionId? }`.
// Inline spawn configuration (model / agent tool / mode / permissions / worktree)
// seeded from the task's assigned team member, then POST /api/sessions/spawn via
// the @/state client. The new session arrives over the session:spawn IMMEDIATE WS
// event (Pulse ingests it — idempotent), so we DO NOT insert it ourselves: on
// success we just dismiss and navigate to the (soon-to-exist) session detail.
//
// spawnSource is FORCED to 'ui' inside the client — never set here.
import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Input, SheetHeader, SheetSection, FieldRow, Toggle, Text } from '@/components';
import { getMaestroClient, useTask, useTeamMember, useUiStore } from '@/state';
import {
  AGENT_MODES,
  AGENT_TOOLS,
  PERMISSION_MODES,
  asTaskId,
  asTeamMemberId,
  type AgentMode,
  type AgentTool,
  type PermissionMode,
} from '@/domain';
import { spawnSessionRequestSchema, type SpawnSessionRequest } from '@/domain/schemas/spawn';
import { measureTerminalSize } from '@/terminal';

import { routes } from '../../../navigation';
import type { SheetBodyProps } from '../../../navigation/sheets';

// ── Display labels for the closed enums (picker option labels) ────────────────
const MODE_LABEL: Record<AgentMode, string> = {
  worker: 'Worker',
  coordinator: 'Coordinator',
  'coordinated-worker': 'Coordinated worker',
  'coordinated-coordinator': 'Coordinated coordinator',
};
const TOOL_LABEL: Record<AgentTool, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
  hermes: 'Hermes',
  gemini: 'Gemini',
};
const PERMISSION_LABEL: Record<PermissionMode, string> = {
  acceptEdits: 'Accept edits',
  interactive: 'Interactive',
  readOnly: 'Read only',
  bypassPermissions: 'Bypass permissions',
};

export function RunConfigSheet({
  intent,
  sheet,
}: SheetBodyProps<{ type: 'runConfig'; taskId: string; sessionId?: string }>): React.JSX.Element {
  const router = useRouter();
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  const task = useTask(asTaskId(intent.taskId));
  const member = useTeamMember(asTeamMemberId(task?.teamMemberId ?? ''));

  // Config seeded from the assigned member; falls back to safe defaults.
  const [model, setModel] = useState<string>(member?.model ?? '');
  const [agentTool, setAgentTool] = useState<AgentTool>(member?.agentTool ?? 'claude-code');
  const [mode, setMode] = useState<AgentMode>(member?.mode ?? 'worker');
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(
    member?.permissionMode ?? 'acceptEdits',
  );
  const [useWorktree, setUseWorktree] = useState<boolean>(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const taskTitle = task?.title ?? intent.taskId;

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

  const projectId = useMemo(
    () => task?.projectId ?? activeProjectId ?? undefined,
    [task?.projectId, activeProjectId],
  );

  async function onSpawn(): Promise<void> {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const { cols, rows } = measureTerminalSize();

      const request: SpawnSessionRequest = spawnSessionRequestSchema.parse({
        taskIds: [intent.taskId],
        ...(intent.sessionId ? { sessionId: intent.sessionId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(member?.id ? { teamMemberId: member.id } : {}),
        mode,
        agentTool,
        permissionMode,
        ...(model.trim() ? { model: model.trim() } : {}),
        useWorktree,
        cols,
        rows,
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

      <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
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
          <FieldRow label="Model">
            <View style={styles.modelInput}>
              <Input
                value={model}
                onChangeText={setModel}
                placeholder="Default"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </FieldRow>
          <FieldRow
            label="Agent"
            value={TOOL_LABEL[agentTool]}
            onPress={() => pick('Agent tool', AGENT_TOOLS, agentTool, (v) => TOOL_LABEL[v], setAgentTool)}
            accessibilityHint="Choose the agent tool"
          />
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

        <SheetSection label="Isolation">
          <Toggle
            label="Run in worktree"
            on={useWorktree}
            tone="worktree"
            icon="gitBranch"
            size="lg"
            onToggle={setUseWorktree}
          />
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    paddingBottom: theme.space[4],
    maxHeight: '100%',
  },
  flex: {
    flexGrow: 0,
  },
  scroll: {
    paddingBottom: theme.space[4],
  },
  card: {
    marginHorizontal: theme.space[4],
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
    overflow: 'hidden',
  },
  modelInput: {
    flex: 1,
    minWidth: 140,
  },
  error: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[2],
  },
  actions: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[4],
  },
}));
