// TerminalView — the live terminal surface. Hosts xterm.js inside a WebView and
// bridges it to the PtyTransport seam (Pulse, reached via @/state). This is the
// renderer + the lazy attach policy; Pulse owns the socket, framing, the
// streaming UTF-8 DECODER (output arrives pre-decoded as a string), and the
// send-before-open queue.
//
// Data flow:
//   PTY → RN  : getPtyTransport().onOutput(id, text) → injectJavaScript → term.write
//   RN  → PTY : WebView onMessage {type:'data'}   → write(id, encodeUtf8(data))
//                                  {type:'resize'} → resize(id, cols, rows)
//   lifecycle : attach(id) on mount, detach(id) on unmount; onExit(id, code)
//               renders a '[process exited]' / 'no live PTY (resume needed)' state.
//
// ── DEFERRED VALIDATION (cloud-host waiver) ──────────────────────────────────
// On-device rendering and live-PTY round-trip are DEFERRED to a device-capable
// host: this CI/cloud host is headless (no emulator/dev-client) and node-pty
// won't build here, so the bridge cannot be exercised end-to-end. The gate here
// is `tsc --noEmit` + the serialized android export. The protocol mirrors the
// proven MAESTRO_PTY_HOST=server /pty stream.
//
// ── CDN vs OFFLINE caveat (TODO before production) ───────────────────────────
// xterm.js + the fit addon load from a CDN with a graceful offline fallback
// (a 'terminal unavailable offline' panel). The app's network is VPN-only and
// may lack public internet, so the CDN can silently fail in the field. TODO:
// inline/bundle the xterm UMD + addon-fit + xterm.css as local assets (e.g.
// require()'d strings or a packaged HTML) and load those instead of the CDN so
// the terminal works fully offline. Tracked as a Phase-4 follow-up.

import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet as RNStyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { StyleSheet } from 'react-native-unistyles';

import { Button, Text } from '@/components';
import { getMaestroClient, getPtyTransport, hasPtyTransport } from '@/state';
import { asSessionId } from '@/domain';
import { buildTerminalTheme, useTheme, type Theme, type XtermTheme } from '@/theme';

import { encodeUtf8 } from './utf8';
import { DEFAULT_TERMINAL_FONT_SIZE, measureTerminalSize } from './measureTerminalSize';

// Pinned CDN builds (UMD globals: `Terminal`, `FitAddon`). See the CDN/offline
// caveat above — production should inline these.
const XTERM_VERSION = '5.5.0';
const FIT_ADDON_VERSION = '0.10.0';
const WEBGL_ADDON_VERSION = '0.18.0';
const CANVAS_ADDON_VERSION = '0.7.0';
const XTERM_CSS = `https://cdn.jsdelivr.net/npm/@xterm/xterm@${XTERM_VERSION}/css/xterm.min.css`;
const XTERM_JS = `https://cdn.jsdelivr.net/npm/@xterm/xterm@${XTERM_VERSION}/lib/xterm.min.js`;
const FIT_JS = `https://cdn.jsdelivr.net/npm/@xterm/addon-fit@${FIT_ADDON_VERSION}/lib/addon-fit.min.js`;
// GPU renderers — the default DOM renderer repaints poorly while scrolling on a
// mobile WebView. WebGL is smoothest; Canvas is the fallback; both are optional
// (a load/init failure silently leaves the working DOM renderer in place).
const WEBGL_JS = `https://cdn.jsdelivr.net/npm/@xterm/addon-webgl@${WEBGL_ADDON_VERSION}/lib/addon-webgl.min.js`;
const CANVAS_JS = `https://cdn.jsdelivr.net/npm/@xterm/addon-canvas@${CANVAS_ADDON_VERSION}/lib/addon-canvas.min.js`;

export interface TerminalViewProps {
  /** The session whose PTY this terminal renders. */
  sessionId: string;
  /** Monospace font size (pt). Defaults to DEFAULT_TERMINAL_FONT_SIZE (13). */
  fontSize?: number;
}

/** Messages the WebView posts back to RN. */
type InboundMessage =
  | { type: 'ready' }
  | { type: 'fallback' }
  | { type: 'data'; data: string }
  | { type: 'resize'; cols: number; rows: number };

/** Local exit state: undefined = running, number = real exit, null = no live PTY. */
type ExitState = { code: number | null } | undefined;

export function TerminalView({ sessionId, fontSize }: TerminalViewProps): React.JSX.Element {
  const theme = useTheme();
  const connected = hasPtyTransport();
  const resolvedFontSize = fontSize && fontSize > 0 ? fontSize : DEFAULT_TERMINAL_FONT_SIZE;

  const webviewRef = useRef<WebView>(null);
  // The WebView's xterm is ready to receive writes. Output that arrives before
  // 'ready' is buffered here and flushed once the page initializes.
  const readyRef = useRef(false);
  const pendingRef = useRef<string[]>([]);
  const [exit, setExit] = useState<ExitState>(undefined);
  const [offline, setOffline] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  // The HTML is theme-stable for a given theme + font size; rebuild only then.
  const html = useMemo(
    () => buildTerminalHtml(buildTerminalTheme(theme), resolvedFontSize),
    [theme, resolvedFontSize],
  );

  // Write a chunk of pre-decoded output into xterm (or buffer until ready).
  const writeToTerm = (text: string): void => {
    if (!readyRef.current) {
      pendingRef.current.push(text);
      return;
    }
    // JSON.stringify yields a safe JS string literal for injection.
    webviewRef.current?.injectJavaScript(
      `window.__term && window.__term.write(${JSON.stringify(text)});true;`,
    );
  };

  // ── PtyTransport bridge: attach on mount, subscribe, detach on unmount ──────
  useEffect(() => {
    if (!connected) return;
    const id = asSessionId(sessionId);
    const pty = getPtyTransport();

    // Reset per-session render state (the component may be reused across ids).
    readyRef.current = false;
    pendingRef.current = [];
    setExit(undefined);

    pty.attach(id);
    // Seed the PTY with an estimated size immediately; the WebView's FitAddon
    // refines it on-screen and posts an authoritative {type:'resize'}.
    const seed = measureTerminalSize({ fontSize: resolvedFontSize });
    pty.resize(id, seed.cols, seed.rows);

    const offOutput = pty.onOutput(id, (text) => writeToTerm(text));
    const offSize = pty.onSize(id, (size) => {
      // Server-announced size: keep xterm in sync (FitAddon re-fits on layout).
      webviewRef.current?.injectJavaScript(
        `window.__term && window.__term.resize(${size.cols}, ${size.rows});true;`,
      );
    });
    const offExit = pty.onExit(id, (code) => setExit({ code }));

    return () => {
      offOutput();
      offSize();
      offExit();
      pty.detach(id);
      readyRef.current = false;
      pendingRef.current = [];
    };
    // resolvedFontSize only seeds the initial size; re-attaching on font change
    // is unnecessary, so it's intentionally excluded from the dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, sessionId]);

  // ── WebView → RN: keystrokes + fit-driven resizes ──────────────────────────
  const onMessage = (event: WebViewMessageEvent): void => {
    let msg: InboundMessage;
    try {
      msg = JSON.parse(event.nativeEvent.data) as InboundMessage;
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      readyRef.current = true;
      // Flush any output buffered before xterm initialized.
      const buffered = pendingRef.current;
      pendingRef.current = [];
      for (const chunk of buffered) writeToTerm(chunk);
      return;
    }
    if (msg.type === 'fallback') {
      setOffline(true);
      return;
    }
    if (!connected) return;
    const id = asSessionId(sessionId);
    const pty = getPtyTransport();
    if (msg.type === 'data') {
      pty.write(id, encodeUtf8(msg.data));
    } else if (msg.type === 'resize') {
      pty.resize(id, msg.cols, msg.rows);
    }
  };

  // ── Resume: revive a dead PTY via POST /sessions/:id/resume, then re-attach ──
  const onResume = async (): Promise<void> => {
    if (resuming) return;
    setResuming(true);
    setResumeError(null);
    try {
      const id = asSessionId(sessionId);
      const { cols, rows } = measureTerminalSize({ fontSize: resolvedFontSize });
      await getMaestroClient().resumeSession(sessionId, { cols, rows });
      // Server has (re)spawned the PTY — re-attach so the live stream flows again.
      const pty = getPtyTransport();
      pty.attach(id);
      pty.resize(id, cols, rows);
      setExit(undefined);
    } catch (e) {
      setResumeError(e instanceof Error ? e.message : 'Could not resume the session.');
    } finally {
      setResuming(false);
    }
  };

  // ── Pre-connect guard: no transport wired yet ──────────────────────────────
  if (!connected) {
    return <Placeholder theme={theme} message="Not connected — the terminal will attach once realtime is online." />;
  }

  return (
    <View style={styles.root}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled={false}
        setSupportMultipleWindows={false}
        // Keep the soft keyboard from pushing the WebView around; the terminal
        // manages its own scroll.
        keyboardDisplayRequiresUserAction={false}
        hideKeyboardAccessoryView
        automaticallyAdjustContentInsets={false}
      />
      {offline && (
        <Overlay theme={theme}>
          Terminal unavailable offline — xterm.js could not load. (Production should
          bundle the assets locally; see module header TODO.)
        </Overlay>
      )}
      {exit !== undefined && (
        <View style={styles.exitOverlay}>
          <Text variant="secondary" color="ink3" style={styles.centerText}>
            {exit.code === null
              ? 'No live terminal for this session.'
              : `[process exited${exit.code ? ` · code ${exit.code}` : ''}]`}
          </Text>
          {resumeError != null && (
            <Text variant="secondary" color="blockText" style={styles.centerText}>
              {resumeError}
            </Text>
          )}
          <View style={styles.resumeBtn}>
            <Button
              label={resuming ? 'Resuming…' : 'Resume session'}
              icon="refresh"
              variant="primary"
              fullWidth
              disabled={resuming}
              onPress={() => void onResume()}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ── Small themed sub-views ───────────────────────────────────────────────────

function Placeholder({ theme, message }: { theme: Theme; message: string }): React.JSX.Element {
  return (
    <View style={[styles.center, { backgroundColor: theme.colors.surface }]}>
      <Text variant="body" color="ink3" style={styles.centerText}>
        {message}
      </Text>
    </View>
  );
}

function Overlay({ theme, children }: { theme: Theme; children: React.ReactNode }): React.JSX.Element {
  return (
    <View style={[styles.overlay, { backgroundColor: theme.colors.surface }]} pointerEvents="none">
      <Text variant="secondary" color="ink3" style={styles.centerText}>
        {children}
      </Text>
    </View>
  );
}

// ── WebView HTML builder (pure; self-contained) ──────────────────────────────

/**
 * Build the xterm host page. Loads xterm + the fit addon from a CDN with an
 * offline fallback panel, themes the terminal from the Atelier palette, and
 * sets up the postMessage bridge (window.__term for writes; posts back
 * 'ready' / 'data' / 'resize' / 'fallback').
 */
function buildTerminalHtml(xterm: XtermTheme, fontSize: number): string {
  const themeJson = JSON.stringify(xterm);
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${XTERM_CSS}" />
<style>
  html,body{margin:0;padding:0;height:100%;background:${xterm.background};overflow:hidden;}
  #term{width:100%;height:100%;}
  .xterm{padding:6px;}
  /* Native momentum scrolling for the scrollback viewport (smooth touch-drag). */
  .xterm .xterm-viewport{
    -webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;
    will-change:scroll-position;
    scroll-behavior:auto;
  }
  #fallback{display:none;font-family:-apple-system,system-ui,sans-serif;color:${xterm.foreground};
    opacity:.7;font-size:13px;padding:16px;line-height:1.5;}
</style></head><body>
  <div id="term"></div>
  <div id="fallback">Terminal unavailable offline — xterm.js could not load.</div>
  <script>
    function post(m){ try{ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }catch(e){} }
    function showFallback(){
      var t=document.getElementById('term'); if(t) t.style.display='none';
      var f=document.getElementById('fallback'); if(f) f.style.display='block';
      post({type:'fallback'});
    }
  </script>
  <script src="${XTERM_JS}" onerror="showFallback()"></script>
  <script src="${FIT_JS}"></script>
  <script src="${WEBGL_JS}" onerror="window.__noWebgl=1"></script>
  <script src="${CANVAS_JS}" onerror="window.__noCanvas=1"></script>
  <script>
  (function(){
    if(!window.Terminal){ showFallback(); return; }
    try {
      var term = new Terminal({
        fontSize: ${fontSize},
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: ${themeJson},
        cursorBlink: true,
        scrollback: 5000,
        convertEol: false,
        allowProposedApi: true,
        smoothScrollDuration: 0
      });
      var fit = null;
      try { if(window.FitAddon){ fit = new FitAddon.FitAddon(); term.loadAddon(fit); } } catch(e){}
      term.open(document.getElementById('term'));
      // Attach a GPU renderer for smooth scrolling: WebGL first, Canvas fallback.
      // Any failure leaves the working DOM renderer in place (never breaks).
      (function attachRenderer(){
        try {
          if(!window.__noWebgl && window.WebglAddon){
            var w = new WebglAddon.WebglAddon();
            w.onContextLoss(function(){ try{ w.dispose(); }catch(e){} });
            term.loadAddon(w);
            return;
          }
        } catch(e){}
        try {
          if(!window.__noCanvas && window.CanvasAddon){
            term.loadAddon(new CanvasAddon.CanvasAddon());
          }
        } catch(e){}
      })();
      window.__term = term;

      // Inertial (fling) scrolling — Android WebView gives xterm's viewport no
      // native momentum, so we own the touch gesture: drag tracks velocity, and
      // on release we animate a decaying fling for that native acceleration feel.
      (function inertialScroll(){
        var vp = document.querySelector('.xterm-viewport');
        if(!vp) return;
        var lastY=0, lastT=0, vy=0, raf=null, dragging=false;
        function stopFling(){ if(raf){ cancelAnimationFrame(raf); raf=null; } }
        vp.addEventListener('touchstart', function(e){
          stopFling(); dragging=true; vy=0;
          var t=e.touches[0]; lastY=t.clientY; lastT=Date.now();
        }, {passive:true});
        vp.addEventListener('touchmove', function(e){
          if(!dragging || !e.touches.length) return;
          var t=e.touches[0];
          var now=Date.now();
          var dy=t.clientY-lastY;
          var dt=now-lastT || 16;
          vy=dy/dt;                 // px per ms (sampled)
          vp.scrollTop-=dy;         // drag finger down → reveal older output
          lastY=t.clientY; lastT=now;
          e.preventDefault();       // take over from xterm's touch handling
        }, {passive:false});
        vp.addEventListener('touchend', function(){
          dragging=false;
          var v=vy*16;              // px per ~60fps frame
          if(Math.abs(v)<0.5) return;
          var prev=-1;
          (function fling(){
            if(Math.abs(v)<0.4 || vp.scrollTop===prev){ raf=null; return; }
            prev=vp.scrollTop;
            vp.scrollTop-=v;
            v*=0.95;                // friction
            raf=requestAnimationFrame(fling);
          })();
        }, {passive:true});
      })();

      function doFit(){
        try {
          if(fit){ fit.fit(); }
          post({type:'resize', cols: term.cols, rows: term.rows});
        } catch(e){}
      }
      // Forward keystrokes (already control-sequence encoded by xterm) to RN.
      term.onData(function(d){ post({type:'data', data: d}); });
      window.addEventListener('resize', doFit);
      // Defer the first fit a tick so layout has settled.
      setTimeout(function(){ doFit(); post({type:'ready'}); }, 0);
    } catch(e){ showFallback(); }
  })();
  </script>
</body></html>`;
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  web: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.space[5],
  },
  centerText: {
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    borderTopWidth: RNStyleSheet.hairlineWidth,
    borderTopColor: theme.colors.line,
  },
  exitOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: theme.space[2],
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[3],
    paddingBottom: theme.space[5],
    backgroundColor: theme.colors.surface,
    borderTopWidth: RNStyleSheet.hairlineWidth,
    borderTopColor: theme.colors.line,
  },
  resumeBtn: {
    alignSelf: 'stretch',
    marginTop: theme.space[1],
  },
}));
