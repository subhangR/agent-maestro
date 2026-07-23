// DocViewerScreen — the full-screen, pushed doc reader. A navigation header
// (back + title + copy/share) over a DocsViewer that fills the rest of the
// screen. Reached via routes.docViewer(docId, source, sourceId); it re-hydrates
// the owning entity's docs to get the content (see useDocResolver).
import { useState } from 'react';
import { Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet } from 'react-native-unistyles';

import { IconButton, Text } from '@/components';
import { useTheme } from '@/theme';

import type { DocSource } from '../../../navigation/routes';
import { DocsViewer } from './DocsViewer';
import { docKindLabel } from './docKind';
import { useDocResolver } from './useDocResolver';

export interface DocViewerScreenProps {
  docId: string;
  source: DocSource;
  sourceId: string;
}

export function DocViewerScreen({ docId, source, sourceId }: DocViewerScreenProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { doc, loading, error } = useDocResolver(source, sourceId, docId);
  const [copied, setCopied] = useState(false);

  const content = doc?.content ?? '';

  const onCopy = async (): Promise<void> => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const onShare = async (): Promise<void> => {
    if (!content) return;
    try {
      await Share.share({ title: doc?.title ?? 'Document', message: content });
    } catch {
      /* user dismissed the share sheet — nothing to do */
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + theme.space[2] }]}>
      <View style={styles.header}>
        <IconButton icon="chevronL" onPress={() => router.back()} accessibilityLabel="Back" />
        <View style={styles.headerCol}>
          <Text variant="h3" color="ink" numberOfLines={1}>
            {doc?.title ?? 'Document'}
          </Text>
          {doc != null && (
            <Text variant="secondary" color="ink3" numberOfLines={1}>
              {docKindLabel(doc)}
            </Text>
          )}
        </View>
        {content.length > 0 && (
          <>
            <IconButton
              icon="copy"
              onPress={() => void onCopy()}
              accessibilityLabel={copied ? 'Copied' : 'Copy content'}
            />
            <IconButton icon="arrowUp" onPress={() => void onShare()} accessibilityLabel="Share" />
          </>
        )}
      </View>

      {copied && (
        <Text variant="secondary" color="brand" style={styles.copied}>
          Copied to clipboard
        </Text>
      )}

      <View style={styles.body}>
        {loading ? (
          <Centered label="Loading…" />
        ) : error != null ? (
          <Centered label={error} tone="blockText" />
        ) : content.length === 0 ? (
          <Centered
            label={`“${doc?.title ?? 'This document'}” has no readable content${
              doc?.filePath ? ` (file: ${doc.filePath})` : ''
            }.`}
          />
        ) : (
          <DocsViewer content={content} serverKind={doc?.kind} />
        )}
      </View>
    </View>
  );
}

function Centered({ label, tone = 'ink3' }: { label: string; tone?: 'ink3' | 'blockText' }): React.JSX.Element {
  return (
    <View style={styles.centered}>
      <Text variant="secondary" color={tone} style={styles.centeredText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.paper,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: theme.space[3],
    paddingBottom: theme.space[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.line,
  },
  headerCol: {
    flex: 1,
    gap: 2,
  },
  copied: {
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[2],
  },
  body: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.space[6],
    paddingVertical: theme.space[8],
  },
  centeredText: {
    textAlign: 'center',
  },
}));
