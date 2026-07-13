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
import { useTheme, type Theme } from '@/theme';

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

  const html = useMemo(() => {
    if (resolvedKind === 'mermaid') {
      return mermaidHtml(extractMermaid(content) ?? content, theme);
    }
    if (resolvedKind === 'excalidraw') {
      return excalidrawHtml(content, theme);
    }
    return null;
  }, [resolvedKind, content, theme]);

  return (
    <View style={styles.root}>
      {title != null && (
        <Text variant="title" color="ink" numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      )}

      {resolvedKind === 'markdown' ? (
        <ScrollView style={styles.flex} contentContainerStyle={styles.mdContent}>
          <Markdown style={markdownStyles(theme)}>{content || '_Empty document._'}</Markdown>
        </ScrollView>
      ) : (
        <WebView
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

// ── WebView HTML builders (pure; self-contained) ─────────────────────────────

/** Mermaid render page: loads mermaid from CDN; on failure shows the raw source. */
function mermaidHtml(code: string, theme: Theme): string {
  const bg = theme.colors.paper;
  const fg = theme.colors.ink;
  const safe = escapeHtml(code);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  html,body{margin:0;padding:12px;background:${bg};color:${fg};font-family:-apple-system,system-ui,sans-serif;}
  .mermaid{display:flex;justify-content:center;}
  pre{white-space:pre-wrap;word-break:break-word;font-size:12px;color:${fg};opacity:.85;}
  .err{font-size:12px;opacity:.6;margin-top:8px;}
</style></head><body>
  <div class="mermaid" id="d">${safe}</div>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"
    onerror="document.getElementById('d').outerHTML='<pre>'+${JSON.stringify(safe)}+'</pre><div class=err>mermaid.js unavailable offline — showing source</div>'"></script>
  <script>
    try { if (window.mermaid) { mermaid.initialize({ startOnLoad: true, theme: 'neutral' }); } }
    catch (e) { document.getElementById('d').outerHTML = '<pre>'+${JSON.stringify(safe)}+'</pre>'; }
  </script>
</body></html>`;
}

/** Static Excalidraw scene render: paint elements onto a fit-to-view canvas. */
function excalidrawHtml(content: string, theme: Theme): string {
  const bg = theme.colors.paper;
  const fg = theme.colors.ink;
  const data = safeJson(content);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  html,body{margin:0;padding:0;background:${bg};overflow:hidden;}
  #c{width:100%;height:100%;display:block;}
  #msg{font-family:-apple-system,system-ui,sans-serif;color:${fg};opacity:.6;font-size:12px;padding:12px;}
</style></head><body>
  <canvas id="c"></canvas>
  <div id="msg" style="display:none">Unreadable diagram scene.</div>
  <script>
  (function(){
    var scene = ${JSON.stringify(data)};
    var els = (scene && scene.elements) || [];
    var cv = document.getElementById('c');
    if (!els.length) { cv.style.display='none'; document.getElementById('msg').style.display='block'; return; }
    var dpr = window.devicePixelRatio || 1;
    var W = window.innerWidth, H = window.innerHeight;
    cv.width = W*dpr; cv.height = H*dpr; cv.style.width=W+'px'; cv.style.height=H+'px';
    var ctx = cv.getContext('2d'); ctx.scale(dpr,dpr);
    // Fit bounds → viewport.
    var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
    els.forEach(function(e){ if(e.isDeleted)return; var x=e.x||0,y=e.y||0,w=e.width||0,h=e.height||0;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+w);maxY=Math.max(maxY,y+h); });
    var pad=24, sw=(maxX-minX)||1, sh=(maxY-minY)||1;
    var scale=Math.min((W-pad*2)/sw,(H-pad*2)/sh,2);
    var ox=pad-minX*scale+((W-pad*2)-sw*scale)/2, oy=pad-minY*scale+((H-pad*2)-sh*scale)/2;
    function tx(x){return x*scale+ox;} function ty(y){return y*scale+oy;}
    function stroke(e){ ctx.strokeStyle=e.strokeColor||'${fg}'; ctx.fillStyle=(e.backgroundColor&&e.backgroundColor!=='transparent')?e.backgroundColor:'transparent';
      ctx.lineWidth=Math.max(1,(e.strokeWidth||1)*scale); }
    els.forEach(function(e){ if(e.isDeleted)return; stroke(e);
      var x=tx(e.x||0),y=ty(e.y||0),w=(e.width||0)*scale,h=(e.height||0)*scale;
      if(e.type==='rectangle'||e.type==='frame'){ ctx.beginPath(); ctx.rect(x,y,w,h);
        if(ctx.fillStyle!=='transparent')ctx.fill(); ctx.stroke(); }
      else if(e.type==='ellipse'){ ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,2*Math.PI);
        if(ctx.fillStyle!=='transparent')ctx.fill(); ctx.stroke(); }
      else if(e.type==='diamond'){ ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath();
        if(ctx.fillStyle!=='transparent')ctx.fill(); ctx.stroke(); }
      else if((e.type==='line'||e.type==='arrow'||e.type==='freedraw')&&e.points&&e.points.length){
        ctx.beginPath(); e.points.forEach(function(p,i){ var px=tx((e.x||0)+p[0]),py=ty((e.y||0)+p[1]); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.stroke(); }
      else if(e.type==='text'){ ctx.fillStyle=e.strokeColor||'${fg}'; ctx.font=Math.max(8,(e.fontSize||16)*scale)+'px -apple-system,system-ui,sans-serif';
        ctx.textBaseline='top'; (String(e.text||'').split('\\n')).forEach(function(ln,i){ ctx.fillText(ln,x,y+i*(e.fontSize||16)*scale*1.2); }); }
    });
  })();
  </script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s.trim());
  } catch {
    return null;
  }
}

// ── Native markdown styling (theme-driven) ───────────────────────────────────
function markdownStyles(theme: Theme): Record<string, object> {
  return {
    body: { color: theme.colors.ink, fontSize: 15, lineHeight: 22 },
    heading1: { color: theme.colors.ink, fontSize: 22, fontWeight: '700', marginTop: 12, marginBottom: 6 },
    heading2: { color: theme.colors.ink, fontSize: 19, fontWeight: '700', marginTop: 10, marginBottom: 6 },
    heading3: { color: theme.colors.ink, fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 4 },
    link: { color: theme.colors.brand },
    blockquote: {
      backgroundColor: theme.colors.card,
      borderLeftColor: theme.colors.brand,
      borderLeftWidth: 3,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    code_inline: {
      backgroundColor: theme.colors.card,
      color: theme.colors.ink,
      fontFamily: 'monospace',
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    code_block: {
      backgroundColor: theme.colors.card,
      color: theme.colors.ink,
      fontFamily: 'monospace',
      borderRadius: 6,
      padding: 10,
    },
    fence: {
      backgroundColor: theme.colors.card,
      color: theme.colors.ink,
      fontFamily: 'monospace',
      borderRadius: 6,
      padding: 10,
    },
    hr: { backgroundColor: theme.colors.line, height: 1 },
    table: { borderColor: theme.colors.line },
    tr: { borderColor: theme.colors.line },
  };
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
