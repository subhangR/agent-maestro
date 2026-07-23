// src/features/collab/share/PullSheet.tsx — pull a shared entity into the
// connected maestro-server (the phone's "local").
//
// For task / member: preview the entity, pick a target server project (from the
// entity store), then "Pull" → POST to the server via getMaestroClient(). The
// pull payload shape mirrors the CLI's pullShape() so the created server entity
// matches what desktop/CLI produce.
//
// For doc: render the markdown content + a copy button (no server write — docs
// aren't a first-class server entity the phone can POST in v1).
//
// For spell / file: preview only, with a "not yet wired on mobile" note. The
// injected MaestroClientApi seam exposes createTask/createTeamMember but no
// custom-prompt create, and file bytes have no RN sink in v1.
import { useMemo, useState } from 'react';
import { Clipboard, Modal, Pressable, ScrollView, View } from 'react-native';
import Markdown from 'react-native-markdown-display';

import { Button, Card, Divider, IconButton, Text } from '@/components';
import type { SharedEntitySummary } from '@/services/collab';
import { getMaestroClient, useProjects } from '@/state';
import { useUiStore } from '@/state/uiStore';
import { useTheme } from '@/theme';

export interface PullSheetProps {
  spaceId: string;
  item: SharedEntitySummary;
  visible: boolean;
  onClose: () => void;
}

// ── CLI pullShape parity (task/member) — plain-object builders ─────────────────

function taskPayload(d: Record<string, unknown>, projectId: string) {
  return {
    projectId,
    title: typeof d.title === 'string' ? d.title : 'Untitled',
    description: typeof d.description === 'string' ? d.description : '',
    priority: (['high', 'medium', 'low'].includes(String(d.priority)) ? d.priority : 'medium') as
      | 'high'
      | 'medium'
      | 'low',
    initialPrompt: typeof d.initialPrompt === 'string' ? d.initialPrompt : '',
    dueDate: typeof d.dueDate === 'string' ? d.dueDate : undefined,
    dangerousMode: d.dangerousMode === true,
    useWorktree: d.useWorktree === true,
  };
}

function memberPayload(d: Record<string, unknown>, projectId: string) {
  const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
  const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const obj = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return {
    projectId,
    name: str(d.name, 'Untitled'),
    role: str(d.role),
    identity: str(d.identity),
    avatar: str(d.avatar),
    model: optStr(d.model),
    agentTool: optStr(d.agentTool) as never,
    mode: optStr(d.mode) as never,
    permissionMode: optStr(d.permissionMode) as never,
    strategy: optStr(d.strategy),
    capabilities: obj(d.capabilities) as never,
    skillIds: Array.isArray(d.skillIds) ? (d.skillIds as string[]) : [],
    commandPermissions: obj(d.commandPermissions) as never,
    customWorkflow: optStr(d.customWorkflow),
    soundInstrument: optStr(d.soundInstrument),
  };
}

// ── Preview rows ───────────────────────────────────────────────────────────────

function PreviewField({ label, value }: { label: string; value: string }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={{ gap: 2, marginBottom: theme.space[2] }}>
      <Text variant="eyebrow" color="ink3">
        {label}
      </Text>
      <Text variant="body" color="ink">
        {value || '—'}
      </Text>
    </View>
  );
}

export function PullSheet({ spaceId, item, visible, onClose }: PullSheetProps): React.JSX.Element {
  const theme = useTheme();
  const projects = useProjects();
  const activeProjectId = useUiStore((s) => s.activeProjectId);

  const [targetProjectId, setTargetProjectId] = useState<string | null>(
    activeProjectId ?? projects[0]?.id ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canPullToServer = item.kind === 'task' || item.kind === 'member';
  const d = item.data;

  const previewRows = useMemo(() => {
    switch (item.kind) {
      case 'task':
        return [
          { label: 'Title', value: String(d.title ?? '') },
          { label: 'Status', value: String(d.status ?? 'todo') },
          { label: 'Priority', value: String(d.priority ?? 'medium') },
          { label: 'Description', value: String(d.description ?? '') },
        ];
      case 'member':
        return [
          { label: 'Name', value: String(d.name ?? '') },
          { label: 'Role', value: String(d.role ?? '') },
          { label: 'Model', value: String(d.model ?? '') },
          { label: 'Identity', value: String(d.identity ?? '') },
        ];
      case 'spell':
        return [
          { label: 'Name', value: String(d.name ?? '') },
          { label: 'Description', value: String(d.description ?? '') },
        ];
      default:
        return [];
    }
  }, [item.kind, d]);

  async function handlePull() {
    if (!targetProjectId) {
      setError('Choose a target project first.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const client = getMaestroClient();
      if (item.kind === 'task') {
        const created = await client.createTask(taskPayload(d, targetProjectId));
        // CLI applies a non-todo shared status after create (server create has no status).
        const status = d.status;
        if (typeof status === 'string' && status !== 'todo') {
          await client.updateTask(created.id, { status: status as never });
        }
      } else if (item.kind === 'member') {
        await client.createTeamMember(memberPayload(d, targetProjectId));
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pull failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopyDoc() {
    const content = typeof d.content === 'string' ? d.content : '';
    Clipboard.setString(content);
  }

  function handleClose() {
    if (submitting) return;
    setError(null);
    setDone(false);
    onClose();
  }

  const docContent = typeof d.content === 'string' ? d.content : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={{ flex: 1, backgroundColor: theme.colors.paper }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[4],
          }}
        >
          <Text variant="h1" color="ink" numberOfLines={1} style={{ flex: 1 }}>
            {item.title}
          </Text>
          <IconButton icon="x" onPress={handleClose} accessibilityLabel="Close" size={36} iconSize={17} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: theme.space[4],
            paddingTop: theme.space[3],
            paddingBottom: theme.space[12],
            gap: theme.space[3],
          }}
        >
          <Text variant="eyebrow" color="ink3">
            Shared {item.kind} · from {item.sourceUserId.slice(0, 8)}
          </Text>

          <Divider />

          {/* ── Doc: markdown + copy ───────────────────────────────────────── */}
          {item.kind === 'doc' ? (
            <>
              <Card padding={4}>
                <Markdown>{docContent || '_Empty document._'}</Markdown>
              </Card>
              <Button label="Copy content" variant="secondary" fullWidth onPress={handleCopyDoc} icon="copy" />
            </>
          ) : item.kind === 'file' ? (
            <Text variant="body" color="ink3">
              File pull is not yet supported on mobile.
            </Text>
          ) : (
            <>
              {/* ── Preview fields ───────────────────────────────────────── */}
              <Card padding={4}>
                {previewRows.map((row) => (
                  <PreviewField key={row.label} label={row.label} value={row.value} />
                ))}
              </Card>

              {canPullToServer ? (
                <>
                  {/* ── Target project picker ─────────────────────────────── */}
                  <Text variant="label" color="ink2">
                    Pull into project
                  </Text>
                  {projects.length === 0 ? (
                    <Text variant="secondary" color="ink3">
                      Connect to a server with at least one project to pull.
                    </Text>
                  ) : (
                    <View style={{ gap: theme.space[1] }}>
                      {projects.map((p) => {
                        const selected = p.id === targetProjectId;
                        return (
                          <Pressable
                            key={p.id}
                            onPress={() => setTargetProjectId(p.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingHorizontal: theme.space[3],
                              paddingVertical: theme.space[3],
                              borderRadius: theme.radii.sm,
                              borderWidth: 1,
                              borderColor: selected ? theme.colors.brand : theme.colors.line2,
                              backgroundColor: selected ? theme.colors.active : theme.colors.card,
                            }}
                          >
                            <Text variant="body" color="ink" numberOfLines={1}>
                              {p.name}
                            </Text>
                            {selected && (
                              <Text variant="eyebrow" color="brand">
                                SELECTED
                              </Text>
                            )}
                          </Pressable>
                        );
                      })}
                    </View>
                  )}

                  {error && (
                    <Text variant="secondary" color="blockText">
                      {error}
                    </Text>
                  )}
                  {done ? (
                    <Text variant="body" color="ink">
                      Pulled into the server.
                    </Text>
                  ) : (
                    <Button
                      label={submitting ? 'Pulling…' : `Pull ${item.kind}`}
                      variant="primary"
                      fullWidth
                      disabled={submitting || !targetProjectId || projects.length === 0}
                      onPress={handlePull}
                    />
                  )}
                </>
              ) : (
                <Text variant="body" color="ink3">
                  Pulling a {item.kind} into the server is not yet wired on mobile. Preview only.
                </Text>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
