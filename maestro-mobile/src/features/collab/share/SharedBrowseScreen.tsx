// src/features/collab/share/SharedBrowseScreen.tsx — the share/pull browse view
// for a single Collab Space.
//
// Kind tabs (Tasks / Members / Spells / Docs / Files) over the space's shared
// entities. Each list is driven by the sharedStore (SharedClient.subscribe under
// the hood). Tapping a row opens the PullSheet (preview + pull-into-server). The
// header "Share" button opens the ShareSheet (share a local server entity out).
//
// Standalone: the LEAD mounts this from the space view and passes the spaceId.
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Chip, IconButton, Text } from '@/components';
import type { SharedEntityKind, SharedEntitySummary } from '@/services/collab';
import { useTheme } from '@/theme';

import { Screen, StatusBlock } from '../../more/kit';
import {
  useSharedStore,
  selectSharedItems,
  selectSharedLoading,
  selectSharedError,
} from '../../../state/collab/sharedStore';
import { PullSheet } from './PullSheet';
import { ShareSheet } from './ShareSheet';

interface KindTab {
  key: SharedEntityKind;
  label: string;
}

const KIND_TABS: KindTab[] = [
  { key: 'task', label: 'Tasks' },
  { key: 'member', label: 'Members' },
  { key: 'spell', label: 'Spells' },
  { key: 'doc', label: 'Docs' },
  { key: 'file', label: 'Files' },
];

export function SharedBrowseScreen({ spaceId }: { spaceId: string }): React.JSX.Element {
  const theme = useTheme();
  const [kind, setKind] = useState<SharedEntityKind>('task');
  const [pullItem, setPullItem] = useState<SharedEntitySummary | null>(null);
  const [showShare, setShowShare] = useState(false);

  // Subscribe to the active kind for this space (ref-counted; torn down on switch).
  const subscribe = useSharedStore((s) => s.subscribe);
  useEffect(() => {
    const unsub = subscribe(spaceId, kind);
    return unsub;
  }, [subscribe, spaceId, kind]);

  const items = useSharedStore(useMemo(() => selectSharedItems(spaceId, kind), [spaceId, kind]));
  const loading = useSharedStore(useMemo(() => selectSharedLoading(spaceId, kind), [spaceId, kind]));
  const error = useSharedStore(useMemo(() => selectSharedError(spaceId, kind), [spaceId, kind]));

  const status = (
    <StatusBlock
      loading={loading && items.length === 0}
      error={error ?? undefined}
      empty={items.length === 0}
      emptyLabel={`Nothing shared as ${KIND_TABS.find((t) => t.key === kind)?.label.toLowerCase()} yet.`}
    />
  );

  return (
    <Screen
      title="Shared"
      eyebrow="Collab space"
      trailing={
        <IconButton
          icon="inbox"
          onPress={() => setShowShare(true)}
          accessibilityLabel="Share a local entity to this space"
          size={36}
          iconSize={18}
        />
      }
    >
      {/* Kind tabs */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space[2] }}>
        {KIND_TABS.map((tab) => (
          <Chip
            key={tab.key}
            label={tab.label}
            variant="task"
            onPress={() => setKind(tab.key)}
            accessibilityHint={`Show shared ${tab.label.toLowerCase()}`}
          />
        ))}
      </View>

      {status ?? (
        <View style={{ gap: theme.space[2] }}>
          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setPullItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`Preview and pull ${item.title}`}
            >
              <Card padding={4}>
                <Text variant="body" color="ink" numberOfLines={1}>
                  {item.title}
                </Text>
                {item.subtitle != null && (
                  <Text variant="secondary" color="ink3" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
                <Text variant="eyebrow" color="ink4" style={{ marginTop: 4 }}>
                  from {item.sourceUserId.slice(0, 8)}
                </Text>
              </Card>
            </Pressable>
          ))}
        </View>
      )}

      {/* Pull sheet (row tap) */}
      {pullItem && (
        <PullSheet
          spaceId={spaceId}
          item={pullItem}
          visible={pullItem != null}
          onClose={() => setPullItem(null)}
        />
      )}

      {/* Share sheet (header button) */}
      <ShareSheet spaceId={spaceId} visible={showShare} onClose={() => setShowShare(false)} />
    </Screen>
  );
}
