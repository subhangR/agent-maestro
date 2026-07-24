// Themed, offline syntax-highlighted code card for fenced/code_block markdown.
// Header: language chip + a "Copy" affordance (expo-clipboard) that flips to
// "Copied" briefly. Body: horizontally-scrollable, mono-font, colored token runs.
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet } from 'react-native-unistyles';

import { fontFamily, useTheme, type Theme } from '@/theme';

import { langLabel, tokenize, type TokenKind } from './syntaxHighlight';

interface CodeBlockProps {
  code: string;
  /** The fence info string (e.g. "ts", "bash title=…"); used for lang + label. */
  info?: string;
}

/** Token kind → theme color. Kept here so it re-derives on theme change. */
function colorFor(kind: TokenKind, theme: Theme): string {
  switch (kind) {
    case 'keyword':
      return theme.colors.brand;
    case 'string':
      return theme.colors.brand2;
    case 'number':
      return theme.colors.brand2;
    case 'boolean':
      return theme.colors.brand;
    case 'comment':
      return theme.colors.ink3;
    case 'property':
      return theme.colors.ink;
    case 'function':
      return theme.colors.ink;
    case 'punctuation':
      return theme.colors.ink2;
    default:
      return theme.colors.ink;
  }
}

export function CodeBlock({ code, info }: CodeBlockProps): React.JSX.Element {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raw = code.replace(/\n$/, '');
  const tokens = useMemo(() => tokenize(raw, info), [raw, info]);
  const label = langLabel(info);

  const onCopy = useCallback(() => {
    void Clipboard.setStringAsync(raw);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1400);
  }, [raw]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.chip}>
          <RNText style={styles.chipText}>{label}</RNText>
        </View>
        <Pressable
          onPress={onCopy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Copy code"
          style={styles.copyBtn}
        >
          <RNText style={[styles.copyText, copied && styles.copiedText]}>
            {copied ? 'Copied' : 'Copy'}
          </RNText>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        contentContainerStyle={styles.codeScroll}
      >
        <RNText style={styles.code} selectable>
          {tokens.map((t, i) => (
            <RNText key={i} style={{ color: colorFor(t.kind, theme) }}>
              {t.text}
            </RNText>
          ))}
        </RNText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.line,
    marginVertical: theme.space[2],
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
    backgroundColor: theme.colors.hover,
  },
  chip: {
    backgroundColor: theme.colors.brandSoft,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.space[2],
    paddingVertical: 2,
  },
  chipText: {
    color: theme.colors.brand,
    fontFamily: fontFamily.monoMedium,
    fontSize: 11,
    textTransform: 'lowercase',
  },
  copyBtn: {
    paddingHorizontal: theme.space[2],
    paddingVertical: 2,
  },
  copyText: {
    color: theme.colors.ink2,
    fontFamily: fontFamily.uiMedium,
    fontSize: 12,
  },
  copiedText: {
    color: theme.colors.brand,
  },
  codeScroll: {
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[3],
  },
  code: {
    fontFamily: fontFamily.monoRegular,
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.ink,
  },
}));
