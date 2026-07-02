// CreateTaskSheet (Forge, Stream A) — the body for `{ type: 'createTask' }`.
//
//   • create mode  → only parentId / projectId set. Calls getMaestroClient()
//     .createTask(payload) directly; the task arrives via its task:created WS
//     event (idempotent), so we do NOT optimistically insert. dismiss on resolve.
//   • edit mode    → taskId set. Inline field edits go through optimisticEdit so
//     the store updates instantly and the task:updated WS event reconciles.
//
// Selection (priority / status / assignee) is rendered inline with PickerRow —
// the sanctioned selectable primitive — so the body is self-contained and never
// depends on another stream's picker registration. Cross-stream actions, when
// needed elsewhere, go through sheets.open.
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
  TASK_PRIORITIES,
  asProjectId,
  asTaskId,
  type CreateTaskPayload,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskPayload,
} from '@/domain';
import { getMaestroClient, useProjectMembers, useTask, useUiStore } from '@/state';
import { useTheme } from '@/theme';

import { optimisticEdit } from '../_shared';
import type { SheetBodyProps } from '../../../navigation/sheets';
import { TASK_STATUS_LABEL } from './useTasksScreen';

const PRIORITY_LABEL: Record<TaskPriority, string> = { low: 'Low', medium: 'Medium', high: 'High' };

// Statuses offered in edit mode (archived is a lifecycle terminal — omitted).
const EDIT_STATUSES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'completed',
  'cancelled',
];

interface FormState {
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  teamMemberId: string | undefined;
}

function initForm(existing: Task | undefined): FormState {
  return {
    title: existing?.title ?? '',
    description: existing?.description ?? '',
    priority: existing?.priority ?? 'medium',
    status: existing?.status ?? 'todo',
    teamMemberId: existing?.teamMemberId,
  };
}

export function CreateTaskSheet({
  intent,
  sheet,
}: SheetBodyProps<{ type: 'createTask'; taskId?: string; parentId?: string; projectId?: string }>): React.JSX.Element {
  const theme = useTheme();
  const isEdit = intent.taskId != null;
  const existing = useTask(asTaskId(intent.taskId ?? ''));
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const projectId = isEdit
    ? existing?.projectId ?? null
    : intent.projectId ?? (activeProjectId as string | null);
  const members = useProjectMembers(projectId ? asProjectId(projectId) : asProjectId(''));

  const [form, setForm] = useState<FormState>(() => initForm(existing));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate the form when a deep-linked task loads into the store after mount.
  useEffect(() => {
    if (existing) setForm(initForm(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id]);

  const patch = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const title = form.title.trim();
  const canSubmit = title.length > 0 && !submitting && (isEdit || projectId != null);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    if (isEdit && intent.taskId) {
      const updates: UpdateTaskPayload = {
        title,
        description: form.description.trim(),
        priority: form.priority,
        status: form.status,
        ...(form.teamMemberId ? { teamMemberId: form.teamMemberId } : {}),
      };
      const res = await optimisticEdit('tasks', intent.taskId, updates, () =>
        getMaestroClient().updateTask(intent.taskId as string, updates),
      );
      setSubmitting(false);
      if (res.ok) sheet.dismiss();
      else setError(res.error instanceof Error ? res.error.message : 'Could not save the task.');
      return;
    }

    // Create — never optimistically insert; the task:created WS event delivers it.
    const payload: CreateTaskPayload = {
      projectId: projectId as string,
      title,
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      priority: form.priority,
      ...(intent.parentId ? { parentId: intent.parentId } : {}),
      ...(form.teamMemberId ? { teamMemberId: form.teamMemberId } : {}),
    };
    try {
      await getMaestroClient().createTask(payload);
      setSubmitting(false);
      sheet.dismiss();
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : 'Could not create the task.');
    }
  };

  return (
    <View style={{ paddingBottom: theme.space[2] }}>
      <SheetHeader
        title={isEdit ? 'Edit task' : intent.parentId ? 'New subtask' : 'New task'}
        eyebrow={isEdit ? 'EDIT' : 'CREATE'}
        onClose={sheet.dismiss}
      />

      <SheetSection label="Title">
        <View style={{ width: '100%' }}>
          <Input
            value={form.title}
            onChangeText={(t) => patch('title', t)}
            placeholder="What needs doing?"
            autoFocus={!isEdit}
            returnKeyType="done"
          />
        </View>
      </SheetSection>

      <SheetSection label="Description">
        <View style={{ width: '100%' }}>
          <TextArea
            value={form.description}
            onChangeText={(t) => patch('description', t)}
            placeholder="Add detail (optional)"
          />
        </View>
      </SheetSection>

      <SheetSection label="Priority">
        <View style={{ width: '100%' }}>
          {TASK_PRIORITIES.map((p) => (
            <PickerRow
              key={p}
              label={PRIORITY_LABEL[p]}
              selected={form.priority === p}
              onPress={() => patch('priority', p)}
            />
          ))}
        </View>
      </SheetSection>

      {isEdit && (
        <SheetSection label="Status">
          <View style={{ width: '100%' }}>
            {EDIT_STATUSES.map((s) => (
              <PickerRow
                key={s}
                label={TASK_STATUS_LABEL[s]}
                selected={form.status === s}
                onPress={() => patch('status', s)}
              />
            ))}
          </View>
        </SheetSection>
      )}

      <SheetSection label="Assignee">
        <View style={{ width: '100%' }}>
          <PickerRow
            label="Unassigned"
            selected={form.teamMemberId == null}
            onPress={() => patch('teamMemberId', undefined)}
          />
          {members.map((m) => (
            <PickerRow
              key={m.id}
              label={m.name}
              detail={m.role || undefined}
              selected={form.teamMemberId === m.id}
              onPress={() => patch('teamMemberId', m.id)}
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
          label={submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
          variant="primary"
          fullWidth
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
      </View>
    </View>
  );
}
