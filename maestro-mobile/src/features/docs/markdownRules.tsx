// Custom react-native-markdown-display rules + theme-driven style map.
//   • fence / code_block → offline syntax-highlighted CodeBlock (copy button).
//   • image              → MarkdownImage (loading state, aspect ratio, error caption).
//   • table              → horizontally-scrollable GFM table styled to Atelier tokens.
// The lib has no types (ambient shim); node shapes are cast locally + minimally.
import { ScrollView, View } from 'react-native';

import { fontFamily, type Theme } from '@/theme';

import { CodeBlock } from './CodeBlock';
import { MarkdownImage } from './MarkdownImage';

// Minimal shapes for the markdown-it AST nodes we touch (lib is untyped).
interface MdNode {
  key: string;
  content?: string;
  sourceInfo?: string;
  info?: string;
  attributes?: { src?: string; alt?: string };
}

/**
 * Build the custom rules object. `image`/`fence`/`code_block`/`table` are
 * overridden; everything else falls back to the library defaults.
 */
export function makeRules(): Record<string, unknown> {
  const codeRule = (node: MdNode): React.JSX.Element => {
    const info = node.sourceInfo ?? node.info ?? '';
    return <CodeBlock key={node.key} code={node.content ?? ''} info={info} />;
  };

  return {
    fence: codeRule,
    code_block: codeRule,
    image: (node: MdNode): React.JSX.Element => {
      const src = node.attributes?.src ?? '';
      const alt = node.attributes?.alt ?? '';
      return <MarkdownImage key={node.key} src={src} alt={alt} />;
    },
    // Wrap the default-rendered table in a horizontal ScrollView so wide tables
    // scroll instead of squashing. `children` is the lib's rendered table body.
    table: (node: MdNode, children: React.ReactNode): React.JSX.Element => (
      <ScrollView key={node.key} horizontal showsHorizontalScrollIndicator style={tableScroll}>
        <View>{children}</View>
      </ScrollView>
    ),
  };
}

const tableScroll = { marginVertical: 8 } as const;

// ── Native markdown styling (theme-driven) ───────────────────────────────────
export function markdownStyles(theme: Theme): Record<string, object> {
  return {
    body: {
      color: theme.colors.ink,
      fontFamily: fontFamily.uiRegular,
      fontSize: 15,
      lineHeight: 23,
    },
    heading1: {
      color: theme.colors.ink,
      fontFamily: fontFamily.uiBold,
      fontSize: 24,
      lineHeight: 30,
      marginTop: 14,
      marginBottom: 6,
    },
    heading2: {
      color: theme.colors.ink,
      fontFamily: fontFamily.uiSemiBold,
      fontSize: 20,
      lineHeight: 26,
      marginTop: 12,
      marginBottom: 6,
    },
    heading3: {
      color: theme.colors.ink,
      fontFamily: fontFamily.uiSemiBold,
      fontSize: 17,
      lineHeight: 22,
      marginTop: 10,
      marginBottom: 4,
    },
    heading4: {
      color: theme.colors.ink,
      fontFamily: fontFamily.uiSemiBold,
      fontSize: 15,
      marginTop: 8,
      marginBottom: 4,
    },
    heading5: { color: theme.colors.ink2, fontFamily: fontFamily.uiSemiBold, fontSize: 14 },
    heading6: { color: theme.colors.ink3, fontFamily: fontFamily.uiSemiBold, fontSize: 13 },
    paragraph: { marginTop: 4, marginBottom: 10 },
    strong: { fontFamily: fontFamily.uiSemiBold },
    em: { fontStyle: 'italic' as const },
    link: { color: theme.colors.brand, textDecorationLine: 'underline' as const },
    list_item: { marginVertical: 2 },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    blockquote: {
      backgroundColor: theme.colors.card,
      borderLeftColor: theme.colors.brand,
      borderLeftWidth: 3,
      borderRadius: theme.radii.sm,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginVertical: 6,
    },
    code_inline: {
      backgroundColor: theme.colors.card,
      color: theme.colors.brand2,
      fontFamily: fontFamily.monoRegular,
      fontSize: 13,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: theme.colors.line,
      paddingHorizontal: 4,
    },
    hr: { backgroundColor: theme.colors.line, height: 1, marginVertical: 12 },
    // Table styling — the custom `table` rule wraps this in a ScrollView.
    table: {
      borderWidth: 1,
      borderColor: theme.colors.line,
      borderRadius: theme.radii.sm,
      overflow: 'hidden',
    },
    thead: { backgroundColor: theme.colors.card },
    th: {
      flex: 0,
      minWidth: 96,
      padding: 8,
      color: theme.colors.ink,
      fontFamily: fontFamily.uiSemiBold,
      fontSize: 13,
      backgroundColor: theme.colors.card,
    },
    tr: { borderColor: theme.colors.line, borderBottomWidth: 1 },
    td: {
      flex: 0,
      minWidth: 96,
      padding: 8,
      color: theme.colors.ink2,
      fontFamily: fontFamily.uiRegular,
      fontSize: 13,
    },
  };
}
