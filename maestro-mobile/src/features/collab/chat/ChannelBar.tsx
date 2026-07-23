// src/features/collab/chat/ChannelBar.tsx — horizontal scrollable channel list.
// Renders each channel as a pressable pill; highlights the active one.
// "+ Add" pill at the end triggers onCreate.
import { useRef } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components';
import { useTheme } from '@/theme';
import type { Channel } from '@/services/collab';

export interface ChannelBarProps {
  channels: Channel[];
  activeChannelId: string | null;
  onSelect: (channelId: string) => void;
  onCreate: () => void;
}

export function ChannelBar({ channels, activeChannelId, onSelect, onCreate }: ChannelBarProps): React.JSX.Element {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.line,
        backgroundColor: theme.colors.surface,
      }}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.space[2],
          paddingHorizontal: theme.space[4],
          paddingVertical: theme.space[2],
        }}
      >
        {channels.map((ch) => {
          const isActive = ch.id === activeChannelId;
          return (
            <Pressable
              key={ch.id}
              onPress={() => onSelect(ch.id)}
              accessibilityRole="button"
              accessibilityLabel={`#${ch.name}`}
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: theme.radii.pill,
                borderWidth: 1,
                borderColor: isActive ? theme.colors.ink : theme.colors.line,
                backgroundColor: isActive ? theme.colors.ink : pressed ? theme.colors.hover : theme.colors.card,
              })}
            >
              <Text
                variant="label"
                color={isActive ? 'paper' : 'ink2'}
                numberOfLines={1}
                style={{ maxWidth: 120 }}
              >
                #{ch.name}
              </Text>
            </Pressable>
          );
        })}

        {/* "+ Add channel" pill */}
        <Pressable
          onPress={onCreate}
          accessibilityRole="button"
          accessibilityLabel="Create channel"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: theme.radii.pill,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.line2,
            backgroundColor: pressed ? theme.colors.hover : 'transparent',
          })}
        >
          <Text variant="label" color="ink3">
            + Add
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
