// Pure builder for the editable Excalidraw WebView page.
//
// Excalidraw is a React component, so the page loads React 18 + ReactDOM 18 +
// the @excalidraw/excalidraw UMD bundle from a CDN, then mounts <Excalidraw>
// with the injected scene as initialData. Edits are serialized (debounced) and
// posted back to React Native via window.ReactNativeWebView.postMessage.
//
// OFFLINE CAVEAT: this fetches Excalidraw from a CDN. On a VPN-only network with
// no public internet the scripts fail to load and the page shows a graceful
// fallback (see WhiteboardView README). Production should INLINE the Excalidraw
// + React UMD assets and set EXCALIDRAW_ASSET_PATH to a bundled directory.
import type { Theme } from '@/theme';

/** Pinned Excalidraw UMD version. Bump deliberately (API/asset-path coupled). */
const EXCALIDRAW_VERSION = '0.17.6';
const REACT_VERSION = '18.2.0';
const CDN = 'https://unpkg.com';

const REACT_SRC = `${CDN}/react@${REACT_VERSION}/umd/react.production.min.js`;
const REACT_DOM_SRC = `${CDN}/react-dom@${REACT_VERSION}/umd/react-dom.production.min.js`;
const EXCALIDRAW_SRC = `${CDN}/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}/dist/excalidraw.production.min.js`;
const EXCALIDRAW_ASSET_PATH = `${CDN}/@excalidraw/excalidraw@${EXCALIDRAW_VERSION}/dist/`;

/** Message kinds the WebView posts back to RN (see WhiteboardView.onMessage). */
export type WebViewOutMessage =
  | { type: 'ready' }
  | { type: 'scene'; content: string }
  | { type: 'error'; message: string };

/**
 * Build the editor page HTML. `sceneJson` is an Excalidraw scene JSON string
 * (elements + appState); `themeName` selects Excalidraw's light/dark UI.
 */
export function buildEditorHtml(sceneJson: string, themeName: 'light' | 'dark', theme: Theme): string {
  const bg = theme.colors.paper;
  const fg = theme.colors.ink;
  // The scene is embedded as a JS string literal (JSON.stringify on a string →
  // a safely-quoted JS string), parsed inside the page. Avoids HTML-escaping.
  const sceneLiteral = JSON.stringify(sceneJson);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body,#root{margin:0;padding:0;height:100%;width:100%;background:${bg};}
  #root{position:fixed;inset:0;}
  #fallback{display:none;font-family:-apple-system,system-ui,sans-serif;color:${fg};
    padding:20px;font-size:14px;line-height:1.5;}
  #fallback code{opacity:.7;font-size:12px;word-break:break-all;}
</style>
</head><body>
<div id="root"></div>
<div id="fallback">
  <b>Whiteboard editor unavailable offline.</b><br/>
  The Excalidraw editor loads from a CDN and could not be reached. Your scene is
  preserved and editable once the network is back.
</div>
<script>
  window.EXCALIDRAW_ASSET_PATH = ${JSON.stringify(EXCALIDRAW_ASSET_PATH)};
  var RN = window.ReactNativeWebView;
  function post(msg){ try { RN && RN.postMessage(JSON.stringify(msg)); } catch(e){} }
  function showFallback(){
    var f = document.getElementById('fallback'); if (f) f.style.display='block';
    var r = document.getElementById('root'); if (r) r.style.display='none';
  }
  function fail(m){ showFallback(); post({type:'error', message:String(m)}); }
  window.addEventListener('error', function(e){ /* keep editing; report once */ });
</script>
<script src="${REACT_SRC}" onerror="fail('react cdn unreachable')"></script>
<script src="${REACT_DOM_SRC}" onerror="fail('react-dom cdn unreachable')"></script>
<script src="${EXCALIDRAW_SRC}" onerror="fail('excalidraw cdn unreachable')"></script>
<script>
(function(){
  try {
    if (!window.React || !window.ReactDOM || !window.ExcalidrawLib) {
      return fail('excalidraw libraries did not load');
    }
    var React = window.React, ReactDOM = window.ReactDOM, Ex = window.ExcalidrawLib;
    var initial = {};
    try {
      var parsed = JSON.parse(${sceneLiteral} || '{}');
      initial = {
        elements: Array.isArray(parsed.elements) ? parsed.elements : [],
        appState: Object.assign({}, parsed.appState || {}, { collaborators: [] }),
        files: parsed.files || {},
        scrollToContent: true,
      };
    } catch (e) { initial = { elements: [], scrollToContent: true }; }

    // Debounced serialize-and-post on every scene change.
    var timer = null;
    function onChange(elements, appState, files){
      if (timer) clearTimeout(timer);
      timer = setTimeout(function(){
        try {
          var json = Ex.serializeAsJSON(elements, appState, files || {}, 'local');
          post({ type:'scene', content: json });
        } catch (e) { /* transient serialize error — next change retries */ }
      }, 800);
    }

    var el = React.createElement(Ex.Excalidraw, {
      initialData: initial,
      theme: ${JSON.stringify(themeName)},
      onChange: onChange,
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: false } },
    });
    var container = React.createElement('div', { style:{ height:'100%', width:'100%' } }, el);
    var rootEl = document.getElementById('root');
    if (ReactDOM.createRoot) { ReactDOM.createRoot(rootEl).render(container); }
    else { ReactDOM.render(container, rootEl); }
    post({ type:'ready' });
  } catch (e) { fail(e && e.message ? e.message : e); }
})();
</script>
</body></html>`;
}
