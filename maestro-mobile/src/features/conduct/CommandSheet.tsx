// CommandSheet — the body for the Conduct FAB's `{ type: 'command' }` sheet.
// The hub's four launchers, now LIVE (Phase 3):
//   • Spawn session  → pick an open task (universal picker) → open runConfig
//   • New task       → open the createTask sheet
//   • New team member→ open the editMember sheet
//   • Cast spell     → switch to the inline SpellCastView wizard
// Cross-stream actions go ONLY through `sheet.open(...)` — never by importing a
// Stream-A component.
import { useState } from 'react';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { IconButton, PickerRow, SheetHeader, SheetSection, Text } from '@/components';
import { useOpenTasks, useUiStore } from '@/state';
import { asProjectId } from '@/domain';
import type { IconName } from '@/theme';

import type { SheetBodyProps } from '../../../navigation/sheets';
import { SpellCastView } from './SpellCastView';

type HubView = 'menu' | 'spell';

/** The four Conduct launch actions. */
const ACTIONS: { id: string; label: string; detail: string; icon: IconName }[] = [
  { id: 'spawn', label: 'Spawn session', detail: 'Run an agent on a task', icon: 'play' },
  { id: 'newTask', label: 'New task', detail: 'Create a task', icon: 'listChecks' },
  { id: 'newMember', label: 'New team member', detail: 'Add an agent persona', icon: 'users' },
  { id: 'castSpell', label: 'Cast spell', detail: 'Invoke a contextual prompt', icon: 'spell' },
];

export function CommandSheet({ sheet }: SheetBodyProps<{ type: 'command' }>): React.JSX.Element {
  const [view, setView] = useState<HubView>('menu');
  const projectId = useUiStore((s) => s.activeProjectId);
  const openTasks = useOpenTasks(projectId ?? asProjectId(''));

  // Spawn: pick a task via the universal picker, then open its run config.
  function startSpawn(): void {
    sheet.open({
      type: 'picker',
      config: {
        title: 'Spawn on task',
        selectedIds: [],
        searchable: true,
        options: openTasks.map((t) => ({ id: t.id, label: t.title, sublabel: t.status })),
        onSubmit: (ids) => {
          const taskId = ids[0];
          if (taskId) sheet.open({ type: 'runConfig', taskId });
        },
      },
    });
  }

  function onAction(id: string): void {
    switch (id) {
      case 'spawn':
        startSpawn();
        break;
      case 'newTask':
        sheet.open({ type: 'createTask' });
        break;
      case 'newMember':
        sheet.open({ type: 'editMember' });
        break;
      case 'castSpell':
        setView('spell');
        break;
    }
  }

  if (view === 'spell') {
    return (
      <View style={styles.root}>
        <SheetHeader
          title="Cast spell"
          eyebrow="CONDUCT"
          trailing={<IconButton icon="chevronL" onPress={() => setView('menu')} accessibilityLabel="Back" />}
        />
        {projectId == null ? (
          <SheetSection>
            <Text variant="secondary" color="ink3">
              Select a project first.
            </Text>
          </SheetSection>
        ) : (
          <SpellCastView projectId={projectId} onDismiss={sheet.dismissAll} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SheetHeader title="Conduct" eyebrow="LAUNCH" onClose={sheet.dismiss} />
      <SheetSection label="Actions">
        <View style={styles.rows}>
          {ACTIONS.map((a) => (
            <PickerRow
              key={a.id}
              label={a.label}
              detail={a.detail}
              onPress={() => onAction(a.id)}
              accessibilityHint={a.detail}
            />
          ))}
        </View>
      </SheetSection>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    paddingBottom: theme.space[4],
  },
  rows: {
    width: '100%',
    gap: 2,
  },
}));
