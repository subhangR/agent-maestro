// DocsViewer — the READ-ONLY document/diagram surface. Renders a server doc by
// content kind:
//   • markdown   → react-native-markdown-display (native RN render)
//   • mermaid    → a read-only WebView hosting mermaid.js (fenced ```mermaid```
//                  or a bare diagram body); falls back to the raw source if the
//                  CDN script can't load (offline).
//   • excalidraw → a read-only WebView that statically paints the scene's
//                  elements (rect / ellipse / diamond / line / arrow / text /
//                  freedraw) onto a fit-to-view <canvas>. No editor, no deps.
//
// Editing (draw-to-asset, the rough.js board) is Relay / Phase 5 — this is the
// viewer only. The kind is auto-detected from the content unless passed in.
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { WebView } from 'react-native-webview';
import Markdown from 'react-native-markdown-display';
import { StyleSheet } from 'react-native-unistyles';

import { Text } from '@/components';
import { useTheme } from '@/theme';

import { makeRules, markdownStyles } from './markdownRules';
import { useMermaidRuntime } from './useMermaidRuntime';
import { excalidrawHtml, mermaidHtml } from './webviewHtml';

export type DocContentKind = 'markdown' | 'mermaid' | 'excalidraw';

export interface DocsViewerProps {
  /** Raw document content (markdown text, a mermaid body, or excalidraw JSON). */
  content: string;
  /** Explicit kind; auto-detected from `content` (+ `serverKind`) when omitted. */
  kind?: DocContentKind;
  /** Optional title rendered above the body. */
  title?: string;
  /** The server DocEntry.kind hint ('markdown' default, 'diagram' for .excalidraw). */
  serverKind?: 'markdown' | 'diagram';
}

// Mermaid diagram bodies start with one of these keywords (used for the bare,
// un-fenced case where a .mmd doc is stored without a ```mermaid``` fence).
const MERMAID_KEYWORDS = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'erDiagram',
  'gantt',
  'pie',
  'journey',
  'gitGraph',
  'mindmap',
  'timeline',
  'quadrantChart',
];

const MERMAID_FENCE = /```mermaid\s+([\s\S]*?)```/;

/** Is this string an Excalidraw scene JSON? (`type:'excalidraw'` or an elements[]). */
function isExcalidrawSceneJson(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return parsed?.type === 'excalidraw' || Array.isArray(parsed?.elements);
  } catch {
    return false;
  }
}

/** Pull the mermaid body out of a ```mermaid``` fence, or detect a bare body. */
function extractMermaid(content: string): string | null {
  const fenced = MERMAID_FENCE.exec(content);
  if (fenced && fenced[1] != null) return fenced[1].trim();
  const head = content.trim().split(/\s+/)[0] ?? '';
  if (MERMAID_KEYWORDS.some((k) => head === k || head.startsWith(k))) return content.trim();
  return null;
}

/** Resolve the content kind: explicit prop → excalidraw → mermaid → markdown. */
export function detectDocKind(content: string, serverKind?: 'markdown' | 'diagram'): DocContentKind {
  if (isExcalidrawSceneJson(content)) return 'excalidraw';
  if (extractMermaid(content) != null) return 'mermaid';
  // A 'diagram' doc that didn't parse as excalidraw/mermaid still renders as text.
  return serverKind === 'diagram' && content.trim().startsWith('{') ? 'excalidraw' : 'markdown';
}

export function DocsViewer({ content, kind, title, serverKind }: DocsViewerProps): React.JSX.Element {
  const theme = useTheme();
  const resolvedKind = kind ?? detectDocKind(content, serverKind);

  // Lazily load the vendored offline mermaid bundle only when rendering mermaid.
  const mermaid = useMermaidRuntime(resolvedKind === 'mermaid');

  const html = useMemo(() => {
    if (resolvedKind === 'mermaid') {
      // Pass the base64 bundle (or null while still importing → raw-source page).
      return mermaidHtml(extractMermaid(content) ?? content, theme, mermaid.b64);
    }
    if (resolvedKind === 'excalidraw') {
      return excalidrawHtml(content, theme);
    }
    return null;
  }, [resolvedKind, content, theme, mermaid.b64]);

  // Stable rules object for react-native-markdown-display.
  const rules = useMemo(() => makeRules(), []);
  const mdStyles = useMemo(() => markdownStyles(theme), [theme]);

  return (
    <View style={styles.root}>
      {title != null && (
        <Text variant="title" color="ink" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      )}

      {resolvedKind === 'markdown' ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.mdContent}>
          <Markdown style={mdStyles} rules={rules}>
            {content || '_Empty document._'}
          </Markdown>
        </ScrollView>
      ) : (
        <WebView
          // `key` remounts the mermaid page once the offline bundle resolves so
          // the injected base64 flips from '' (loading) to the real UMD.
          key={resolvedKind === 'mermaid' ? `mermaid-${mermaid.b64 != null}` : resolvedKind}
          originWhitelist={['*']}
          source={{ html: html ?? '' }}
          style={styles.flex}
          scrollEnabled
          // Read-only: no JS bridge back, no navigation, no file access.
          javaScriptEnabled
          domStorageEnabled={false}
          setSupportMultipleWindows={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.paper,
  },
  flex: {
    flex: 1,
    backgroundColor: theme.colors.paper,
  },
  title: {
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[2],
  },
  mdContent: {
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
  },
}));
