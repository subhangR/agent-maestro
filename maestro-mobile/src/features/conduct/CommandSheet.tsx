// CommandSheet — the body for the Conduct FAB's `{ type: 'command' }` sheet.
// PHASE 2 STUB: the real hub (spawn a session, new task, new member, cast a
// spell) lands in Phase 3, when this gets wired into Compass's SHEET_REGISTRY
// and its rows call `sheet.open(...)` / the spawn flow. For now it renders the
// four launch rows as DISABLED affordances so the shape is reviewable without
// triggering any mutation. It is intentionally NOT registered yet.
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { SheetHeader, SheetSection, PickerRow, Text } from '@/components';
import type { IconName } from '@/theme';

import type { SheetBodyProps } from '../../../navigation/sheets';

/** The four Conduct launch actions (wired in Phase 3). */
const ACTIONS: { id: string; label: string; detail: string; icon: IconName }[] = [
  { id: 'spawn', label: 'Spawn session', detail: 'Run an agent on a task', icon: 'play' },
  { id: 'newTask', label: 'New task', detail: 'Create a task', icon: 'listChecks' },
  { id: 'newMember', label: 'New team member', detail: 'Add an agent persona', icon: 'users' },
  { id: 'castSpell', label: 'Cast spell', detail: 'Invoke a contextual prompt', icon: 'spell' },
];

export function CommandSheet({ sheet }: SheetBodyProps<{ type: 'command' }>): React.JSX.Element {
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
              // Phase-2 stub: rows are inert (no onPress) until Phase 3 wiring.
              accessibilityHint="Available in a later build"
            />
          ))}
        </View>
      </SheetSection>
      <Text variant="secondary" color="ink3" style={styles.note}>
        Conduct actions arrive in Phase 3.
      </Text>
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
  note: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[1],
  },
}));
