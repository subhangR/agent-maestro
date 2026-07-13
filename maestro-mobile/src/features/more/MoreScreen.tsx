// MoreScreen (Forge, Stream A · read-only hub). The fifth tab: a menu to the
// secondary surfaces. Compass hasn't added per-leaf route files, so each leaf is
// rendered inline as a self-contained sub-screen (its own back affordance) via
// local section state — no new routes, all within Stream A's scope.
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import type { IconName } from '@/theme';
import { useTheme } from '@/theme';

import { GraphsScreen } from '../graphs';
import { ListsScreen } from '../lists';
import { ProfilesScreen } from '../profiles';
import { SkillsScreen } from '../skills';
import { TeamsScreen } from '../teams';
import { Screen } from './kit';
import { SettingsScreen } from './SettingsScreen';

type Section = 'teams' | 'skills' | 'lists' | 'graphs' | 'profiles' | 'settings';

interface MenuItem {
  section: Section;
  label: string;
  detail: string;
  icon: IconName;
}

const MENU: MenuItem[] = [
  { section: 'teams', label: 'Teams', detail: 'Ensembles & sub-teams', icon: 'team' },
  { section: 'skills', label: 'Skills', detail: 'Referenced across members & tasks', icon: 'sparkles' },
  { section: 'lists', label: 'Lists', detail: 'Task lists', icon: 'listChecks' },
  { section: 'graphs', label: 'Graphs', detail: 'Task graphs', icon: 'graph' },
  { section: 'profiles', label: 'Profiles', detail: 'Model profiles', icon: 'layers' },
  { section: 'settings', label: 'Settings', detail: 'Host & appearance', icon: 'settings' },
];

function MenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }): React.JSX.Element {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space[3],
        padding: theme.space[3],
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.line,
        backgroundColor: pressed ? theme.colors.hover : theme.colors.card,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 9,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.active,
        }}
      >
        <Icon name={item.icon} size={18} color="ink2" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="title" color="ink">
          {item.label}
        </Text>
        <Text variant="secondary" color="ink3" numberOfLines={1}>
          {item.detail}
        </Text>
      </View>
      <Icon name="chevronR" size={16} color="ink4" />
    </Pressable>
  );
}

export function MoreScreen(): React.JSX.Element {
  const theme = useTheme();
  const [section, setSection] = useState<Section | null>(null);
  const back = () => setSection(null);

  switch (section) {
    case 'teams':
      return <TeamsScreen onBack={back} />;
    case 'skills':
      return <SkillsScreen onBack={back} />;
    case 'lists':
      return <ListsScreen onBack={back} />;
    case 'graphs':
      return <GraphsScreen onBack={back} />;
    case 'profiles':
      return <ProfilesScreen onBack={back} />;
    case 'settings':
      return <SettingsScreen onBack={back} />;
    default:
      return (
        <Screen title="More" eyebrow="Maestro">
          <View style={{ gap: theme.space[2] }}>
            {MENU.map((item) => (
              <MenuRow key={item.section} item={item} onPress={() => setSection(item.section)} />
            ))}
          </View>
        </Screen>
      );
  }
}
