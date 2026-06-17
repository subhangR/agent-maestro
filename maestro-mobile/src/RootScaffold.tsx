import { Text, View } from 'react-native';

// Phase-0 placeholder root. Confirms the native dev client boots green.
// Replaced by Compass's expo-router tree (index.ts → 'expo-router/entry') and
// wrapped by Bedrock's ThemeBoot once the theme layer lands.
export function RootScaffold() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F4F2EC',
      }}
    >
      <Text style={{ color: '#23201B', fontSize: 16 }}>Maestro</Text>
    </View>
  );
}
