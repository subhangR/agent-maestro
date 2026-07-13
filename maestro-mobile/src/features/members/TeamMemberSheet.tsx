// TeamMemberSheet (Forge, Stream A) — the body for `{ type: 'editMember' }`.
//
//   • create mode → only projectId set. Calls getMaestroClient()
//     .createTeamMember(payload) directly; the member arrives via its
//     teamMember:created WS event. dismiss on resolve, inline error on reject.
//   • edit mode   → memberId set. Field edits go through optimisticEdit so the
//     store updates instantly and the teamMember:updated WS event reconciles.
//
// Selection (tool / mode / permission) is rendered inline with PickerRow so the
// body is self-contained and never depends on another stream's picker.
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  Button,
  Input,
  PickerRow,
  SheetHeader,
  SheetSection,
  TextArea,
  Text,
} from '@/components';
import {
  AGENT_MODES,
  AGENT_TOOLS,
  PERMISSION_MODES,
  asTeamMemberId,
  displayToolLabel,
  modeDisplayLabel,
  type AgentMode,
  type AgentTool,
  type CreateTeamMemberPayload,
  type PermissionMode,
  type TeamMember,
  type UpdateTeamMemberPayload,
} from '@/domain';
import { getMaestroClient, useTeamMember, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { optimisticEdit } from '../_shared';
import type { SheetBodyProps } from '../../../navigation/sheets';

const DEFAULT_AVATAR = '🎯';

interface FormState {
  name: string;
  role: string;
  avatar: string;
  identity: string;
  model: string;
  agentTool: AgentTool;
  mode: AgentMode;
  permissionMode: PermissionMode | undefined;
}

function initForm(existing: TeamMember | undefined): FormState {
  return {
    name: existing?.name ?? '',
    role: existing?.role ?? '',
    avatar: existing?.avatar ?? '',
    identity: existing?.identity ?? '',
    model: existing?.model ?? '',
    agentTool: existing?.agentTool ?? 'claude-code',
    mode: existing?.mode ?? 'worker',
    permissionMode: existing?.permissionMode,
  };
}

export function TeamMemberSheet({
  intent,
  sheet,
}: SheetBodyProps<{ type: 'editMember'; memberId?: string; projectId?: string }>): React.JSX.Element {
  const theme = useTheme();
  const isEdit = intent.memberId != null;
  const existing = useTeamMember(asTeamMemberId(intent.memberId ?? ''));
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const projectId = isEdit
    ? existing?.projectId ?? null
    : intent.projectId ?? (activeProjectId as string | null);

  const [form, setForm] = useState<FormState>(() => initForm(existing));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) setForm(initForm(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const name = form.name.trim();
  const canSubmit = name.length > 0 && !submitting && (isEdit || projectId != null);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    if (isEdit && intent.memberId && projectId) {
      const updates: UpdateTeamMemberPayload = {
        name,
        role: form.role.trim(),
        avatar: form.avatar.trim() || DEFAULT_AVATAR,
        identity: form.identity.trim(),
        model: form.model.trim(),
        agentTool: form.agentTool,
        mode: form.mode,
        ...(form.permissionMode ? { permissionMode: form.permissionMode } : {}),
      };
      const res = await optimisticEdit('teamMembers', intent.memberId, updates, () =>
        getMaestroClient().updateTeamMember(intent.memberId as string, projectId, updates),
      );
      setSubmitting(false);
      if (res.ok) sheet.dismiss();
      else setError(res.error instanceof Error ? res.error.message : 'Could not save the member.');
      return;
    }

    const payload: CreateTeamMemberPayload = {
      projectId: projectId as string,
      name,
      role: form.role.trim(),
      avatar: form.avatar.trim() || DEFAULT_AVATAR,
      ...(form.identity.trim() ? { identity: form.identity.trim() } : {}),
      ...(form.model.trim() ? { model: form.model.trim() } : {}),
      agentTool: form.agentTool,
      mode: form.mode,
      ...(form.permissionMode ? { permissionMode: form.permissionMode } : {}),
    };
    try {
      await getMaestroClient().createTeamMember(payload);
      setSubmitting(false);
      sheet.dismiss();
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : 'Could not create the member.');
    }
  };

  return (
    <View style={{ paddingBottom: theme.space[2] }}>
      <SheetHeader
        title={isEdit ? 'Edit member' : 'New member'}
        eyebrow={isEdit ? 'EDIT' : 'CREATE'}
        onClose={sheet.dismiss}
      />

      <SheetSection label="Name">
        <View style={{ width: '100%' }}>
          <Input
            value={form.name}
            onChangeText={(t) => patch('name', t)}
            placeholder="Agent name"
            autoFocus={!isEdit}
          />
        </View>
      </SheetSection>

      <SheetSection label="Role">
        <View style={{ width: '100%' }}>
          <Input
            value={form.role}
            onChangeText={(t) => patch('role', t)}
            placeholder="e.g. Backend engineer"
          />
        </View>
      </SheetSection>

      <SheetSection label="Avatar">
        <View style={{ width: '100%' }}>
          <Input
            value={form.avatar}
            onChangeText={(t) => patch('avatar', t)}
            placeholder={DEFAULT_AVATAR}
          />
        </View>
      </SheetSection>

      <SheetSection label="Model">
        <View style={{ width: '100%' }}>
          <Input
            value={form.model}
            onChangeText={(t) => patch('model', t)}
            placeholder="Model id (optional)"
            autoCapitalize="none"
          />
        </View>
      </SheetSection>

      <SheetSection label="Identity">
        <View style={{ width: '100%' }}>
          <TextArea
            value={form.identity}
            onChangeText={(t) => patch('identity', t)}
            placeholder="Persona / instructions (optional)"
          />
        </View>
      </SheetSection>

      <SheetSection label="Tool">
        <View style={{ width: '100%' }}>
          {AGENT_TOOLS.map((t) => (
            <PickerRow
              key={t}
              label={displayToolLabel(t)}
              selected={form.agentTool === t}
              onPress={() => patch('agentTool', t)}
            />
          ))}
        </View>
      </SheetSection>

      <SheetSection label="Mode">
        <View style={{ width: '100%' }}>
          {AGENT_MODES.map((m) => (
            <PickerRow
              key={m}
              label={modeDisplayLabel(m)}
              selected={form.mode === m}
              onPress={() => patch('mode', m)}
            />
          ))}
        </View>
      </SheetSection>

      <SheetSection label="Permission">
        <View style={{ width: '100%' }}>
          <PickerRow
            label="Default"
            selected={form.permissionMode == null}
            onPress={() => patch('permissionMode', undefined)}
          />
          {PERMISSION_MODES.map((p) => (
            <PickerRow
              key={p}
              label={p}
              selected={form.permissionMode === p}
              onPress={() => patch('permissionMode', p)}
            />
          ))}
        </View>
      </SheetSection>

      {error != null && (
        <View style={{ paddingHorizontal: theme.space[4], paddingBottom: theme.space[2] }}>
          <Text variant="secondary" color="blockText">
            {error}
          </Text>
        </View>
      )}

      <View style={{ paddingHorizontal: theme.space[4], paddingTop: theme.space[2] }}>
        <Button
          label={submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create member'}
          variant="primary"
          fullWidth
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}
