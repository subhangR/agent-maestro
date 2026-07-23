// Pure, self-contained HTML builders for the read-only WebView surfaces:
//   • mermaidHtml     — renders a diagram from the OFFLINE vendored bundle
//                       (base64 UMD decoded with the page's own atob + eval).
//   • excalidrawHtml  — statically paints a scene onto a <canvas> with
//                       pinch-to-zoom + pan, image-element placeholders, and the
//                       full existing shape set (rect/ellipse/diamond/line/
//                       arrow/text/freedraw). Read-only; no bridge back.
import type { Theme } from '@/theme';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function safeJson(s: string): unknown {
  try {
    return JSON.parse(s.trim());
  } catch {
    return null;
  }
}

/**
 * Mermaid render page — fully OFFLINE. The vendored bundle is passed as base64
 * on `window.__MERMAID_B64__`; the page decodes it with its own `atob` and
 * `eval`s the UMD, sidestepping any `</script>` escaping problems. If `b64` is
 * null (bundle still importing) or init fails, the raw source `<pre>` is shown.
 */
export function mermaidHtml(code: string, theme: Theme, b64: string | null): string {
  const bg = theme.colors.paper;
  const fg = theme.colors.ink;
  const safe = escapeHtml(code);
  const srcJson = JSON.stringify(safe);
  const b64Json = JSON.stringify(b64 ?? '');
  const themeName = theme.colors.paper.toLowerCase() === '#15130e' ? 'dark' : 'neutral';

  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>
  html,body{margin:0;padding:12px;background:${bg};color:${fg};font-family:-apple-system,system-ui,sans-serif;}
  #d.mermaid{display:flex;justify-content:center;}
  pre{white-space:pre-wrap;word-break:break-word;font-size:12px;color:${fg};opacity:.85;margin:0;}
  .err{font-size:12px;opacity:.6;margin-top:8px;}
  .loading{font-size:12px;opacity:.6;}
</style></head><body>
  <div id="wrap">
    <div class="loading" id="ld">rendering…</div>
    <div class="mermaid" id="d" style="display:none">${safe}</div>
  </div>
  <script>window.__MERMAID_B64__ = ${b64Json};</script>
  <script>
  (function(){
    var d = document.getElementById('d');
    var ld = document.getElementById('ld');
    function showSource(note){
      document.getElementById('wrap').innerHTML =
        '<pre>' + ${srcJson} + '</pre>' + (note ? '<div class="err">'+note+'</div>' : '');
    }
    var b64 = window.__MERMAID_B64__;
    if (!b64) { showSource(''); return; }
    try {
      eval(atob(b64));
    } catch (e) {
      showSource('mermaid failed to load — showing source');
      return;
    }
    try {
      if (!window.mermaid) { showSource('mermaid unavailable — showing source'); return; }
      window.mermaid.initialize({ startOnLoad: false, theme: '${themeName}', securityLevel: 'strict' });
      window.mermaid.run({ nodes: [d] }).then(function(){
        if (ld) ld.style.display='none';
        d.style.display='flex';
      }).catch(function(){ showSource('could not render diagram — showing source'); });
    } catch (e2) {
      showSource('could not render diagram — showing source');
    }
  })();
  </script>
</body></html>`;
}

/**
 * Static Excalidraw scene render with pinch-to-zoom + pan. Elements are painted
 * to a fit-to-view canvas; gestures adjust a view transform and re-render. Image
 * elements get a labelled placeholder rectangle. Read-only.
 */
export function excalidrawHtml(content: string, theme: Theme): string {
  const bg = theme.colors.paper;
  const fg = theme.colors.ink;
  const placeholderBg = theme.colors.card;
  const placeholderLine = theme.colors.line2;
  const data = safeJson(content);
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;padding:0;background:${bg};overflow:hidden;touch-action:none;}
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
    var ctx = cv.getContext('2d');

    // Scene bounds → base fit transform.
    var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
    els.forEach(function(e){ if(e.isDeleted)return; var x=e.x||0,y=e.y||0,w=e.width||0,h=e.height||0;
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+w);maxY=Math.max(maxY,y+h); });
    var pad=24, sw=(maxX-minX)||1, sh=(maxY-minY)||1;
    var fit=Math.min((W-pad*2)/sw,(H-pad*2)/sh,2);
    var baseOx=pad-minX*fit+((W-pad*2)-sw*fit)/2, baseOy=pad-minY*fit+((H-pad*2)-sh*fit)/2;

    // View transform (user zoom/pan) layered on top of the base fit.
    var view = { scale: 1, tx: 0, ty: 0 };
    function eff(){ return { s: fit*view.scale, ox: baseOx*view.scale+view.tx, oy: baseOy*view.scale+view.ty }; }

    function draw(){
      var t = eff(), s=t.s, ox=t.ox, oy=t.oy;
      function tx(x){return x*s+ox;} function ty(y){return y*s+oy;}
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,W,H);
      function stroke(e){ ctx.strokeStyle=e.strokeColor||'${fg}';
        ctx.fillStyle=(e.backgroundColor&&e.backgroundColor!=='transparent')?e.backgroundColor:'transparent';
        ctx.lineWidth=Math.max(1,(e.strokeWidth||1)*s); }
      els.forEach(function(e){ if(e.isDeleted)return; stroke(e);
        var x=tx(e.x||0),y=ty(e.y||0),w=(e.width||0)*s,h=(e.height||0)*s;
        if(e.type==='rectangle'||e.type==='frame'){ ctx.beginPath(); ctx.rect(x,y,w,h);
          if(ctx.fillStyle!=='transparent')ctx.fill(); ctx.stroke(); }
        else if(e.type==='ellipse'){ ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,Math.abs(w/2),Math.abs(h/2),0,0,2*Math.PI);
          if(ctx.fillStyle!=='transparent')ctx.fill(); ctx.stroke(); }
        else if(e.type==='diamond'){ ctx.beginPath(); ctx.moveTo(x+w/2,y); ctx.lineTo(x+w,y+h/2); ctx.lineTo(x+w/2,y+h); ctx.lineTo(x,y+h/2); ctx.closePath();
          if(ctx.fillStyle!=='transparent')ctx.fill(); ctx.stroke(); }
        else if(e.type==='image'){
          ctx.save();
          ctx.fillStyle='${placeholderBg}'; ctx.strokeStyle='${placeholderLine}';
          ctx.lineWidth=Math.max(1,1*s); ctx.setLineDash([Math.max(3,4*s),Math.max(3,4*s)]);
          ctx.beginPath(); ctx.rect(x,y,w,h); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle='${fg}'; ctx.lineWidth=Math.max(1,1.5*s);
          var mx=x+w/2, my=y+h/2, r=Math.min(Math.abs(w),Math.abs(h))*0.18;
          ctx.beginPath(); ctx.arc(mx-r*0.4,my-r*0.4,r*0.4,0,2*Math.PI); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x+w*0.15,y+h*0.8); ctx.lineTo(x+w*0.4,y+h*0.5); ctx.lineTo(x+w*0.6,y+h*0.68); ctx.lineTo(x+w*0.78,y+h*0.45); ctx.lineTo(x+w*0.85,y+h*0.8); ctx.stroke();
          ctx.fillStyle='${fg}'; ctx.font=Math.max(9,11)+'px -apple-system,system-ui,sans-serif';
          ctx.textAlign='center'; ctx.textBaseline='bottom'; ctx.globalAlpha=0.7;
          ctx.fillText('image', mx, y+h-4); ctx.globalAlpha=1; ctx.textAlign='left';
          ctx.restore();
        }
        else if((e.type==='line'||e.type==='arrow'||e.type==='freedraw')&&e.points&&e.points.length){
          ctx.beginPath(); e.points.forEach(function(p,i){ var px=tx((e.x||0)+p[0]),py=ty((e.y||0)+p[1]); i?ctx.lineTo(px,py):ctx.moveTo(px,py); }); ctx.stroke(); }
        else if(e.type==='text'){ ctx.fillStyle=e.strokeColor||'${fg}'; ctx.font=Math.max(8,(e.fontSize||16)*s)+'px -apple-system,system-ui,sans-serif';
          ctx.textBaseline='top'; (String(e.text||'').split('\\n')).forEach(function(ln,i){ ctx.fillText(ln,x,y+i*(e.fontSize||16)*s*1.2); }); }
      });
    }

    // ── Gestures: single-finger pan, two-finger pinch-zoom (read-only) ──
    var pointers = {};
    function pts(){ var a=[]; for(var k in pointers) a.push(pointers[k]); return a; }
    var lastPan=null, pinch=null;
    cv.addEventListener('pointerdown', function(ev){ cv.setPointerCapture(ev.pointerId);
      pointers[ev.pointerId]={x:ev.clientX,y:ev.clientY}; var p=pts();
      if(p.length===1){ lastPan={x:ev.clientX,y:ev.clientY}; pinch=null; }
      else if(p.length===2){ pinch={ d:dist(p[0],p[1]), cx:(p[0].x+p[1].x)/2, cy:(p[0].y+p[1].y)/2 }; lastPan=null; }
    });
    cv.addEventListener('pointermove', function(ev){ if(!pointers[ev.pointerId])return;
      pointers[ev.pointerId]={x:ev.clientX,y:ev.clientY}; var p=pts();
      if(p.length===1 && lastPan){ view.tx+=ev.clientX-lastPan.x; view.ty+=ev.clientY-lastPan.y;
        lastPan={x:ev.clientX,y:ev.clientY}; draw(); }
      else if(p.length===2 && pinch){ var nd=dist(p[0],p[1]); var ncx=(p[0].x+p[1].x)/2, ncy=(p[0].y+p[1].y)/2;
        var f=nd/(pinch.d||1); var ns=Math.max(0.25,Math.min(view.scale*f,8));
        // zoom about the pinch center
        view.tx = ncx - (ncx - view.tx) * (ns/view.scale);
        view.ty = ncy - (ncy - view.ty) * (ns/view.scale);
        view.tx += ncx - pinch.cx; view.ty += ncy - pinch.cy;
        view.scale=ns; pinch={ d:nd, cx:ncx, cy:ncy }; draw(); }
    });
    function up(ev){ delete pointers[ev.pointerId]; var p=pts();
      if(p.length===1){ lastPan={x:p[0].x,y:p[0].y}; pinch=null; } else if(p.length<1){ lastPan=null; pinch=null; } }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    function dist(a,b){ var dx=a.x-b.x, dy=a.y-b.y; return Math.sqrt(dx*dx+dy*dy); }

    draw();
  })();
  </script>
</body></html>`;
}
