// Agent identity tile: the three model logos (claude/codex/gemini) as bundled
// images, or a styled `>_` box for plain terminal sessions. Consumes the
// Lexicon DisplayTool vocabulary (never the raw server AgentTool).
import { Image, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { DisplayTool } from '@/domain';

import { Text } from './Text';

const LOGOS = {
  claude: require('../../../assets/logos/claude-code-icon.png'),
  codex: require('../../../assets/logos/openai-codex-icon.png'),
  gemini: require('../../../assets/logos/gemini-logo.png'),
} as const;

export interface AgentAvatarProps {
  kind: DisplayTool;
  size?: number;
}

export function AgentAvatar({ kind, size = 30 }: AgentAvatarProps): React.JSX.Element {
  if (kind === 'terminal') {
    return (
      <View style={[styles.box, { width: size, height: size }]} accessibilityLabel="Terminal session">
        <Text variant="code" color="run" allowFontScaling={false}>
          {'>_'}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.box, { width: size, height: size }]} accessibilityLabel={`${kind} agent`}>
      <Image source={LOGOS[kind]} style={styles.logo} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  box: {
    flexShrink: 0,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.line,
  },
  logo: {
    width: 18,
    height: 18,
  },
}));
