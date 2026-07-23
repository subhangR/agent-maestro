// src/features/collab/SpacesScreen.tsx — the Spaces tab root. Auth gate:
//   initializing → spinner · signedOut/error → SignInScreen · signedIn → SpacesHome
// SpacesHome (the real "all my spaces" list + create/join/discover) is built on
// top of this gate by the spaces vertical.
import { View } from 'react-native';

import { Text } from '@/components';
import { useFirebaseAuth } from '@/services/firebaseAuth';
import { useTheme } from '@/theme';

import { SignInScreen } from './SignInScreen';
import { SpacesHome } from './SpacesHome';

export function SpacesScreen(): React.JSX.Element {
  const theme = useTheme();
  const { status } = useFirebaseAuth();

  if (status === 'initializing') {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.paper,
        }}
      >
        <Text variant="eyebrow" color="ink3">
          loading…
        </Text>
      </View>
    );
  }

  if (status === 'signedIn') return <SpacesHome />;
  return <SignInScreen />;
}
