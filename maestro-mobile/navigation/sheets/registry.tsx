// Sheet registry — maps each SheetIntent `type` to the component that renders
// its body. Compass owns this map; the BODIES come from the feature streams /
// Palette (Wave 2). Until they land, every entry is a labelled placeholder so
// the host is fully wired and the app runs end-to-end.
//
// INTEGRATION SEAM (Wave 2): replace each placeholder with the real body, e.g.
//   command:    features/conduct/CommandSheet      (Stream B — straddle)
//   project:    features/_shared/ProjectSheet      (Stream B)
//   createTask: features/tasks/CreateTaskSheet     (Stream A)
//   editMember: features/members/TeamMemberSheet   (Stream A)
//   runConfig:  features/sessions/RunConfigSheet    (Stream B)
//   picker:     components/sheets/PickerSheet        (Palette — generic shell)
//   doc/diagram/docs: whiteboard / doc-viewer        (kept-scope viewers)
// The registry import is ONE-WAY (navigation → features); no feature writes here.
import { View } from 'react-native';
import type { ComponentType } from 'react';

import { Text } from '@/components';
import { useTheme } from '@/theme';
import { CommandSheet } from '@/features/conduct';
import { CreateTaskSheet } from '@/features/tasks';
import { TeamMemberSheet } from '@/features/members';
import { RunConfigSheet } from '@/features/sessions';

import type { SheetBodyProps, SheetType } from './types';
import { PickerSheet } from './PickerSheet';
import { ProjectSheet } from './ProjectSheet';

/** Temporary body shown until the real sheet component is registered. */
function PlaceholderBody({ intent, sheet }: SheetBodyProps) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.space[4], gap: theme.space[2], minHeight: 160 }}>
      <Text variant="eyebrow" color="ink3">
        sheet · {intent.type}
      </Text>
      <Text variant="title" color="ink">
        {LABELS[intent.type]}
      </Text>
      <Text variant="body" color="ink3">
        Placeholder body — Palette/Forge fills this in Wave 2. Compass owns the
        host, snap points, backdrop, keyboard handling, and the open/dismiss API.
      </Text>
      <Text
        variant="label"
        color="brand"
        onPress={sheet.dismiss}
        style={{ marginTop: theme.space[2] }}
      >
        Dismiss
      </Text>
    </View>
  );
}

const LABELS: Record<SheetType, string> = {
  command: 'Conduct',
  project: 'Switch project',
  createTask: 'New task',
  editMember: 'Team member',
  runConfig: 'Run configuration',
  picker: 'Select',
  doc: 'Document',
  diagram: 'Diagram',
  docs: 'Docs',
};

/**
 * type → body component. Typed loosely (the host narrows the intent before
 * passing it). Swap a value here to ship a real sheet without touching the host.
 */
export const SHEET_REGISTRY: Record<SheetType, ComponentType<SheetBodyProps>> = {
  // Real Phase-3 bodies (Forge). Each is typed against its narrowed intent
  // (`SheetBodyProps<{type:'…'}>`); the host narrows the intent before passing,
  // so casting to the broad slot type at the registry site is safe.
  command: CommandSheet as ComponentType<SheetBodyProps>,
  createTask: CreateTaskSheet as ComponentType<SheetBodyProps>,
  editMember: TeamMemberSheet as ComponentType<SheetBodyProps>,
  runConfig: RunConfigSheet as ComponentType<SheetBodyProps>,
  project: ProjectSheet as ComponentType<SheetBodyProps>,
  picker: PickerSheet as ComponentType<SheetBodyProps>,
  // No body yet — kept on the placeholder / Phase-2 viewers.
  doc: PlaceholderBody,
  diagram: PlaceholderBody,
  docs: PlaceholderBody,
};
