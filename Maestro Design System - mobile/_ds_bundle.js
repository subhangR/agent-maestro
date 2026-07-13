/* @ds-bundle: {"format":3,"namespace":"MaestroDesignSystem_a8dfb2","components":[{"name":"MAESTRO_TERMINAL_THEME","sourcePath":"panel-redesign/terminal-theme.ts"},{"name":"MAESTRO_TERMINAL_THEME_DARK","sourcePath":"panel-redesign/terminal-theme.ts"}],"sourceHashes":{"mobile-app/ios-frame.jsx":"be3343be4b51","mobile-app/m-app.jsx":"624a76f0a9d7","mobile-app/m-data.jsx":"614991a75c14","mobile-app/m-docs.jsx":"b48fa59d4822","mobile-app/m-kit.jsx":"21df40f4cedc","mobile-app/m-overlays.jsx":"bc270726702a","mobile-app/m-screens.jsx":"c7b44d7addc9","mobile-app/m-tiles.jsx":"d01aa18b2a92","panel-redesign/app.jsx":"661c8a2876ad","panel-redesign/boards.jsx":"6ff21842933e","panel-redesign/buttons.jsx":"b2f245d95e4d","panel-redesign/design-canvas.jsx":"bd8746af6e58","panel-redesign/icons-team-1.jsx":"a60b9a503ffc","panel-redesign/icons-team-2.jsx":"a7475d896f90","panel-redesign/icons-team-show.jsx":"63585de3f4ff","panel-redesign/kit.jsx":"12431e689e11","panel-redesign/left-panels.jsx":"c34eabbd3c8d","panel-redesign/mobile-sessions.jsx":"3353bcfb4b22","panel-redesign/mobile-tasks.jsx":"730267f2ad88","panel-redesign/mobile-team.jsx":"422eaddd3ea4","panel-redesign/mobile.jsx":"849e9d6eaa36","panel-redesign/modals.jsx":"31a1c38b2495","panel-redesign/right-panels.jsx":"cf8f20b632eb","panel-redesign/shell.jsx":"bfd9ce9309df","panel-redesign/terminal-strip.jsx":"c2452c745f57","panel-redesign/terminal-theme.ts":"f0a06c2fff96","panel-redesign/tiles-show.jsx":"4e3e10492a62","panel-redesign/tiles.jsx":"7a1e5add4aae","panel-redesign/views.jsx":"6af7bef108ae"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.MaestroDesignSystem_a8dfb2 = window.MaestroDesignSystem_a8dfb2 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// mobile-app/ios-frame.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// iOS.jsx — Simplified iOS 26 (Liquid Glass) device frame
// Based on the iOS 26 UI Kit + Figma status bar spec. No assets, no deps.
// Exports (to window): IOSDevice, IOSStatusBar, IOSNavBar, IOSGlassPill, IOSList, IOSListRow, IOSKeyboard
//
// Usage — wrap your screen content in <IOSDevice> to get the bezel, status bar
// and home indicator (props: title, dark, keyboard):
//
//   <IOSDevice title="Settings">
//     ...your screen content...
//   </IOSDevice>
//   <IOSDevice dark title="Search" keyboard>…</IOSDevice>
/* END USAGE */

// ─────────────────────────────────────────────────────────────
// Status bar
// ─────────────────────────────────────────────────────────────
function IOSStatusBar({
  dark = false,
  time = '9:41'
}) {
  const c = dark ? '#fff' : '#000';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 154,
      alignItems: 'center',
      justifyContent: 'center',
      padding: '21px 24px 19px',
      boxSizing: 'border-box',
      position: 'relative',
      zIndex: 20,
      width: '100%'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 1.5
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: '-apple-system, "SF Pro", system-ui',
      fontWeight: 590,
      fontSize: 17,
      lineHeight: '22px',
      color: c
    }
  }, time)), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingTop: 1,
      paddingRight: 1
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "19",
    height: "12",
    viewBox: "0 0 19 12"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "7.5",
    width: "3.2",
    height: "4.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "4.8",
    y: "5",
    width: "3.2",
    height: "7",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "9.6",
    y: "2.5",
    width: "3.2",
    height: "9.5",
    rx: "0.7",
    fill: c
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.4",
    y: "0",
    width: "3.2",
    height: "12",
    rx: "0.7",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "17",
    height: "12",
    viewBox: "0 0 17 12"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z",
    fill: c
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "8.5",
    cy: "10.5",
    r: "1.5",
    fill: c
  })), /*#__PURE__*/React.createElement("svg", {
    width: "27",
    height: "13",
    viewBox: "0 0 27 13"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0.5",
    y: "0.5",
    width: "23",
    height: "12",
    rx: "3.5",
    stroke: c,
    strokeOpacity: "0.35",
    fill: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2",
    y: "2",
    width: "20",
    height: "9",
    rx: "2",
    fill: c
  }), /*#__PURE__*/React.createElement("path", {
    d: "M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z",
    fill: c,
    fillOpacity: "0.4"
  }))));
}

// ─────────────────────────────────────────────────────────────
// Liquid glass pill — blur + tint + shine
// ─────────────────────────────────────────────────────────────
function IOSGlassPill({
  children,
  dark = false,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      height: 44,
      minWidth: 44,
      borderRadius: 9999,
      position: 'relative',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: dark ? '0 2px 6px rgba(0,0,0,0.35), 0 6px 16px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.07), 0 3px 10px rgba(0,0,0,0.06)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.28)' : 'rgba(255,255,255,0.5)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 9999,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15), inset -1px -1px 1px rgba(255,255,255,0.08)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 1,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Navigation bar — glass pills + large title
// ─────────────────────────────────────────────────────────────
function IOSNavBar({
  title = 'Title',
  dark = false,
  trailingIcon = true
}) {
  const muted = dark ? 'rgba(255,255,255,0.6)' : '#404040';
  const text = dark ? '#fff' : '#000';
  const pillIcon = content => /*#__PURE__*/React.createElement(IOSGlassPill, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 36,
      height: 36,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, content));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      paddingTop: 62,
      paddingBottom: 10,
      position: 'relative',
      zIndex: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px'
    }
  }, pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "20",
    viewBox: "0 0 12 20",
    fill: "none",
    style: {
      marginLeft: -1
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M10 2L2 10l8 8",
    stroke: muted,
    strokeWidth: "2.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }))), trailingIcon && pillIcon(/*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "6",
    viewBox: "0 0 22 6"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "3",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "3",
    r: "2.5",
    fill: muted
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "3",
    r: "2.5",
    fill: muted
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 16px',
      fontFamily: '-apple-system, system-ui',
      fontSize: 34,
      fontWeight: 700,
      lineHeight: '41px',
      color: text,
      letterSpacing: 0.4
    }
  }, title));
}

// ─────────────────────────────────────────────────────────────
// Grouped list (inset card, r:26) + row (52px)
// ─────────────────────────────────────────────────────────────
function IOSListRow({
  title,
  detail,
  icon,
  chevron = true,
  isLast = false,
  dark = false
}) {
  const text = dark ? '#fff' : '#000';
  const sec = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const ter = dark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.3)';
  const sep = dark ? 'rgba(84,84,88,0.65)' : 'rgba(60,60,67,0.12)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      minHeight: 52,
      padding: '0 16px',
      position: 'relative',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      letterSpacing: -0.43
    }
  }, icon && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 30,
      height: 30,
      borderRadius: 7,
      background: icon,
      marginRight: 12,
      flexShrink: 0
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      color: text
    }
  }, title), detail && /*#__PURE__*/React.createElement("span", {
    style: {
      color: sec,
      marginRight: 6
    }
  }, detail), chevron && /*#__PURE__*/React.createElement("svg", {
    width: "8",
    height: "14",
    viewBox: "0 0 8 14",
    style: {
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M1 1l6 6-6 6",
    stroke: ter,
    strokeWidth: "2",
    fill: "none",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  })), !isLast && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      left: icon ? 58 : 16,
      height: 0.5,
      background: sep
    }
  }));
}
function IOSList({
  header,
  children,
  dark = false
}) {
  const hc = dark ? 'rgba(235,235,245,0.6)' : 'rgba(60,60,67,0.6)';
  const bg = dark ? '#1C1C1E' : '#fff';
  return /*#__PURE__*/React.createElement("div", null, header && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: '-apple-system, system-ui',
      fontSize: 13,
      color: hc,
      textTransform: 'uppercase',
      padding: '8px 36px 6px',
      letterSpacing: -0.08
    }
  }, header), /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      borderRadius: 26,
      margin: '0 16px',
      overflow: 'hidden'
    }
  }, children));
}

// ─────────────────────────────────────────────────────────────
// Device frame
// ─────────────────────────────────────────────────────────────
function IOSDevice({
  children,
  width = 402,
  height = 874,
  dark = false,
  title,
  keyboard = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      borderRadius: 48,
      overflow: 'hidden',
      position: 'relative',
      background: dark ? '#000' : '#F2F2F7',
      boxShadow: '0 40px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.12)',
      fontFamily: '-apple-system, system-ui, sans-serif',
      WebkitFontSmoothing: 'antialiased'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 11,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 126,
      height: 37,
      borderRadius: 24,
      background: '#000',
      zIndex: 50
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10
    }
  }, /*#__PURE__*/React.createElement(IOSStatusBar, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }
  }, title !== undefined && /*#__PURE__*/React.createElement(IOSNavBar, {
    title: title,
    dark: dark
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto'
    }
  }, children), keyboard && /*#__PURE__*/React.createElement(IOSKeyboard, {
    dark: dark
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 60,
      height: 34,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-end',
      paddingBottom: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width: 139,
      height: 5,
      borderRadius: 100,
      background: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.25)'
    }
  })));
}

// ─────────────────────────────────────────────────────────────
// Keyboard — iOS 26 liquid glass
// ─────────────────────────────────────────────────────────────
function IOSKeyboard({
  dark = false
}) {
  const glyph = dark ? 'rgba(255,255,255,0.7)' : '#595959';
  const sugg = dark ? 'rgba(255,255,255,0.6)' : '#333';
  const keyBg = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  // special-key icons
  const icons = {
    shift: /*#__PURE__*/React.createElement("svg", {
      width: "19",
      height: "17",
      viewBox: "0 0 19 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M9.5 1L1 9.5h4.5V16h8V9.5H18L9.5 1z",
      fill: glyph
    })),
    del: /*#__PURE__*/React.createElement("svg", {
      width: "23",
      height: "17",
      viewBox: "0 0 23 17"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M7 1h13a2 2 0 012 2v11a2 2 0 01-2 2H7l-6-7.5L7 1z",
      fill: "none",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinejoin: "round"
    }), /*#__PURE__*/React.createElement("path", {
      d: "M10 5l7 7M17 5l-7 7",
      stroke: glyph,
      strokeWidth: "1.6",
      strokeLinecap: "round"
    })),
    ret: /*#__PURE__*/React.createElement("svg", {
      width: "20",
      height: "14",
      viewBox: "0 0 20 14"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M18 1v6H4m0 0l4-4M4 7l4 4",
      fill: "none",
      stroke: "#fff",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }))
  };
  const key = (content, {
    w,
    flex,
    ret,
    fs = 25,
    k
  } = {}) => /*#__PURE__*/React.createElement("div", {
    key: k,
    style: {
      height: 42,
      borderRadius: 8.5,
      flex: flex ? 1 : undefined,
      width: w,
      minWidth: 0,
      background: ret ? '#08f' : keyBg,
      boxShadow: '0 1px 0 rgba(0,0,0,0.075)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: '-apple-system, "SF Compact", system-ui',
      fontSize: fs,
      fontWeight: 458,
      color: ret ? '#fff' : glyph
    }
  }, content);
  const row = (keys, pad = 0) => /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      justifyContent: 'center',
      padding: `0 ${pad}px`
    }
  }, keys.map(l => key(l, {
    flex: true,
    k: l
  })));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      zIndex: 15,
      borderRadius: 27,
      overflow: 'hidden',
      padding: '11px 0 2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      boxShadow: dark ? '0 -2px 20px rgba(0,0,0,0.09)' : '0 -1px 6px rgba(0,0,0,0.018), 0 -3px 20px rgba(0,0,0,0.012)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      backdropFilter: 'blur(12px) saturate(180%)',
      WebkitBackdropFilter: 'blur(12px) saturate(180%)',
      background: dark ? 'rgba(120,120,128,0.14)' : 'rgba(255,255,255,0.25)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      borderRadius: 27,
      boxShadow: dark ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.15)' : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.7), inset -1px -1px 1px rgba(255,255,255,0.4)',
      border: dark ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid rgba(0,0,0,0.06)',
      pointerEvents: 'none'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 20,
      alignItems: 'center',
      padding: '8px 22px 13px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, ['"The"', 'the', 'to'].map((w, i) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: i
  }, i > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 25,
      background: '#ccc',
      opacity: 0.3
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      textAlign: 'center',
      fontFamily: '-apple-system, system-ui',
      fontSize: 17,
      color: sugg,
      letterSpacing: -0.43,
      lineHeight: '22px'
    }
  }, w)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13,
      padding: '0 6.5px',
      width: '100%',
      boxSizing: 'border-box',
      position: 'relative'
    }
  }, row(['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']), row(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], 20), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 14.25,
      alignItems: 'center'
    }
  }, key(icons.shift, {
    w: 45,
    k: 'shift'
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6.5,
      flex: 1
    }
  }, ['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(l => key(l, {
    flex: true,
    k: l
  }))), key(icons.del, {
    w: 45,
    k: 'del'
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, key('ABC', {
    w: 92.25,
    fs: 18,
    k: 'abc'
  }), key('', {
    flex: true,
    k: 'space'
  }), key(icons.ret, {
    w: 92.25,
    ret: true,
    k: 'ret'
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      height: 56,
      width: '100%',
      position: 'relative'
    }
  }));
}
Object.assign(window, {
  IOSDevice,
  IOSStatusBar,
  IOSNavBar,
  IOSGlassPill,
  IOSList,
  IOSListRow,
  IOSKeyboard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/ios-frame.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-app.jsx
try { (() => {
/* m-app.jsx — mobile app shell: header, screen switch, now-playing, tab bar, sheets. */
const {
  useState: useStateA
} = React;
const ACTIVE_SESSION = TEAM.coord.children[0]; // fluffy-starlight

function MaestroMobile() {
  const [tab, setTab] = useStateA('sessions');
  const [dark, setDark] = useStateA(false);
  const [termSession, setTermSession] = useStateA(null);
  const [sheet, setSheet] = useStateA(null); // 'command' | 'project' | 'createTask' | 'newMember'
  const [editMember, setEditMember] = useStateA(null);
  const [runTask, setRunTask] = useStateA(null);
  const [picker, setPicker] = useStateA(null);
  const [doc, setDoc] = useStateA(null);
  const [diagram, setDiagram] = useStateA(null);
  const [docsKind, setDocsKind] = useStateA(null);
  const [toast, setToast] = useStateA(null);
  const notify = msg => {
    setToast(msg);
    clearTimeout(window.__mToast);
    window.__mToast = setTimeout(() => setToast(null), 1700);
  };
  const openTerminal = s => setTermSession(s);

  // populate the shared bus so deep tiles can open overlays across babel scopes
  MUI.openPicker = setPicker;
  MUI.openSheet = setSheet;
  MUI.openTerminal = openTerminal;
  MUI.openRun = setRunTask;
  MUI.openDoc = ref => {
    const d = window.resolveDoc(ref);
    if (!d) return;
    if (window.isDiagramDoc(d)) setDiagram(d);else setDoc(d);
  };
  MUI.openDocs = k => setDocsKind(k || 'markdown');
  MUI.notify = notify;
  const toggleDark = () => setDark(d => {
    const nd = !d;
    document.documentElement.dataset.theme = nd ? 'dark' : '';
    return nd;
  });
  const newMember = m => {
    setEditMember(m || null);
    setSheet('newMember');
  };
  return /*#__PURE__*/React.createElement(IOSDevice, {
    dark: dark
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-app"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-head"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-proj",
    onClick: () => setSheet('project')
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-proj__mark"
  }, /*#__PURE__*/React.createElement(Mark, {
    size: 24
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-proj__name"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-proj__live"
  }), " agent-maestro ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 13
  }))), /*#__PURE__*/React.createElement("span", {
    className: "m-head-sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "m-ib",
    onClick: () => notify('Search')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    sw: 1.7
  })), /*#__PURE__*/React.createElement("button", {
    className: "m-ib",
    onClick: () => notify('Notifications')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "bell",
    sw: 1.5
  }))), tab === 'sessions' && /*#__PURE__*/React.createElement(SessionsScreen, {
    onOpen: openTerminal,
    onSpawn: a => notify('Spawn ' + a)
  }), tab === 'tasks' && /*#__PURE__*/React.createElement(TasksScreen, {
    onNewTask: () => setSheet('createTask')
  }), tab === 'members' && /*#__PURE__*/React.createElement(MembersScreen, {
    notify: notify,
    onNewMember: () => newMember(null),
    onEditMember: m => newMember(m)
  }), tab === 'more' && /*#__PURE__*/React.createElement(MoreScreen, {
    dark: dark,
    onToggleDark: toggleDark,
    notify: notify
  }), tab !== 'more' && /*#__PURE__*/React.createElement(NowPlaying, {
    session: ACTIVE_SESSION,
    onOpen: openTerminal
  }), /*#__PURE__*/React.createElement("div", {
    className: "m-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'm-tab' + (tab === 'sessions' ? ' m-tab--active' : ''),
    onClick: () => setTab('sessions')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "layers",
    sw: 1.6
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tab__lbl"
  }, "Sessions"), /*#__PURE__*/React.createElement("span", {
    className: "m-tab__wait"
  })), /*#__PURE__*/React.createElement("button", {
    className: 'm-tab' + (tab === 'tasks' ? ' m-tab--active' : ''),
    onClick: () => setTab('tasks')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "listChecks",
    sw: 1.6
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tab__lbl"
  }, "Tasks")), /*#__PURE__*/React.createElement("div", {
    className: "m-tab m-tab--add"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-fab",
    onClick: () => setSheet('command'),
    "aria-label": "Conduct"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 24,
    sw: 1.8
  }))), /*#__PURE__*/React.createElement("button", {
    className: 'm-tab' + (tab === 'members' ? ' m-tab--active' : ''),
    onClick: () => setTab('members')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    sw: 1.6
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tab__lbl"
  }, "Members")), /*#__PURE__*/React.createElement("button", {
    className: 'm-tab' + (tab === 'more' ? ' m-tab--active' : ''),
    onClick: () => setTab('more')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "menu",
    sw: 1.7
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tab__lbl"
  }, "More"))), termSession && /*#__PURE__*/React.createElement(TerminalSheet, {
    session: termSession,
    onClose: () => setTermSession(null),
    notify: notify
  }), sheet === 'command' && /*#__PURE__*/React.createElement(CommandSheet, {
    onClose: () => setSheet(null),
    notify: notify
  }), sheet === 'project' && /*#__PURE__*/React.createElement(ProjectSheet, {
    onClose: () => setSheet(null),
    notify: notify
  }), sheet === 'createTask' && /*#__PURE__*/React.createElement(CreateTaskSheet, {
    onClose: () => setSheet(null),
    notify: notify
  }), sheet === 'newMember' && /*#__PURE__*/React.createElement(TeamMemberSheet, {
    member: editMember,
    onClose: () => {
      setSheet(null);
      setEditMember(null);
    },
    notify: notify
  }), runTask && /*#__PURE__*/React.createElement(RunConfigSheet, {
    task: runTask,
    onClose: () => setRunTask(null),
    notify: notify
  }), picker && /*#__PURE__*/React.createElement(PickerSheet, {
    config: picker,
    onClose: () => setPicker(null),
    notify: notify
  }), doc && /*#__PURE__*/React.createElement(DocSheet, {
    doc: doc,
    onClose: () => setDoc(null),
    notify: notify
  }), diagram && /*#__PURE__*/React.createElement(DiagramSheet, {
    doc: diagram,
    onClose: () => setDiagram(null),
    notify: notify
  }), docsKind && /*#__PURE__*/React.createElement(DocsSheet, {
    initialKind: docsKind,
    onClose: () => setDocsKind(null),
    notify: notify
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-toast' + (toast ? ' m-toast--in' : '')
  }, toast)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(MaestroMobile, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-app.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-data.jsx
try { (() => {
/* m-data.jsx — content for the mobile app. Adapted from the desktop shell tree.
   Voice: plain, developer-to-developer; agent progress written as the agent speaks.
   Enriched with the detail fields the desktop tiles carry (model, mode, worktree,
   strategy, elapsed, linked tasks, docs) + nested subtask / spawn-chain trees. */

const MEMBERS = {
  rhea: {
    initial: 'R',
    name: 'Rhea',
    color: '#1f6f5f',
    bg: '#dcebe6',
    role: 'Coordinator',
    model: 'opus-4.8'
  },
  kit: {
    initial: 'K',
    name: 'Kit',
    color: '#7a5cc0',
    bg: '#ece4f7',
    role: 'Worker',
    model: 'sonnet-4.5'
  },
  ada: {
    initial: 'A',
    name: 'Ada',
    color: '#b06a2b',
    bg: '#f4e7d6',
    role: 'Worker',
    model: 'sonnet-4.5'
  },
  milo: {
    initial: 'M',
    name: 'Milo',
    color: '#3f6c90',
    bg: '#dde8f1',
    role: 'Worker',
    model: 'haiku-4'
  }
};
const MEMBER_LIST = [{
  ...MEMBERS.rhea,
  status: 'working',
  say: 'Coordinating the reparent strike team',
  sessions: 1,
  tasks: 2,
  mode: 'Coordinator',
  tool: 'claude',
  scope: 'project',
  perms: 'acceptEdits',
  instrument: 'violin',
  identity: 'You lead the terminal-reparenting fix. You read the rendering pipeline carefully, prefer the registry ref over DOM moves, and always re-run fit.fit() after a reparent. Hand off tests to @Ada.',
  skills: ['debugging', 'code-review'],
  caps: {
    spawn: true,
    edit: true,
    rTask: true,
    rSession: true
  }
}, {
  ...MEMBERS.kit,
  status: 'working',
  say: 'Threading the registry ref through the view',
  sessions: 1,
  tasks: 3,
  mode: 'Worker',
  tool: 'claude',
  scope: 'project',
  perms: 'acceptEdits',
  instrument: 'guitar',
  identity: 'You thread state through React views without breaking ownership. Small, surgical diffs.',
  skills: ['write-tests'],
  caps: {
    spawn: false,
    edit: true,
    rTask: true,
    rSession: false
  }
}, {
  ...MEMBERS.ada,
  status: 'idle',
  say: 'Blocked on connection-loss regression test',
  sessions: 0,
  tasks: 1,
  mode: 'Worker',
  tool: 'codex',
  scope: 'project',
  perms: 'interactive',
  instrument: 'piano',
  identity: 'You write the regression tests others skip. You reproduce the bug first, then fix.',
  skills: ['write-tests', 'debugging'],
  caps: {
    spawn: false,
    edit: true,
    rTask: true,
    rSession: false
  }
}, {
  ...MEMBERS.milo,
  status: 'idle',
  say: 'No active session',
  sessions: 0,
  tasks: 0,
  mode: 'Worker',
  tool: 'gemini',
  scope: 'global',
  perms: 'readOnly',
  instrument: 'trumpet',
  identity: 'You review for performance regressions and flag anything that touches the hot path.',
  skills: [],
  caps: {
    spawn: false,
    edit: false,
    rTask: false,
    rSession: false
  }
}];

/* ---------- tasks ---------- (subs may themselves carry subs → multi-level tree) */
const TASKS_IN_PROGRESS = [{
  id: 'a3f9',
  title: 'Fix terminal reparenting crash on board close',
  status: 'in_progress',
  priority: 'high',
  assignees: [MEMBERS.rhea],
  docs: 2,
  active: true,
  pinned: true,
  activity: 'working',
  model: 'opus-4.8',
  due: 'Jun 12',
  updated: '2m ago',
  worktree: true,
  danger: false,
  sessions: [{
    kind: 'working',
    label: 'fluffy-starlight'
  }, {
    kind: 'needsInput',
    label: 'vast-neumann'
  }],
  docList: [{
    id: 'd-tra',
    name: 'terminal-rendering-analysis.md',
    md: true
  }, {
    id: 'd-reparent',
    name: 'reparent-plan.md',
    md: true
  }],
  diagrams: [{
    id: 'g-reparent',
    name: 'reparent-flow'
  }],
  subs: [{
    id: 'b7c2',
    title: 'Audit where terminals get reparented',
    status: 'completed',
    priority: 'medium'
  }, {
    id: 'c1d8',
    title: 'Make board reparent via registry ref',
    status: 'in_progress',
    priority: 'high',
    assignees: [MEMBERS.kit],
    activity: 'working',
    subs: [{
      id: 'c1d8a',
      title: 'Add registry.get(session.id) lookup',
      status: 'completed'
    }, {
      id: 'c1d8b',
      title: 'Swap DOM move for ref reparent',
      status: 'in_progress'
    }]
  }, {
    id: 'd4e1',
    title: 'Thread registry ref to MultiProjectSessionsView',
    status: 'todo',
    priority: 'medium'
  }, {
    id: 'e5f7',
    title: 're-run fit.fit() after the move',
    status: 'todo',
    priority: 'low'
  }, {
    id: 'f8a2',
    title: 'Add regression test for connection loss',
    status: 'blocked',
    priority: 'high',
    assignees: [MEMBERS.ada]
  }]
}, {
  id: 'g2b5',
  title: 'WebSocket pipeline — dedupe session updates',
  status: 'in_progress',
  priority: 'medium',
  assignees: [MEMBERS.kit],
  activity: 'needsInput',
  model: 'sonnet-4.5',
  updated: '14m ago',
  worktree: false,
  docList: [{
    id: 'd-socket',
    name: 'socket-dedupe.md',
    md: true
  }],
  diagrams: [{
    id: 'g-socket',
    name: 'socket-dedupe'
  }]
}];
const TASKS_UP_NEXT = [{
  id: 'h6c9',
  title: 'Add a model-profile indirection layer',
  status: 'todo',
  priority: 'medium',
  assignees: [MEMBERS.rhea, MEMBERS.kit],
  docs: 2,
  model: 'default',
  updated: '1h ago',
  docList: [{
    id: 'd-model',
    name: 'model-profile.md',
    md: true
  }],
  diagrams: [{
    id: 'g-model',
    name: 'model-profile'
  }],
  subs: [{
    id: 'i1d3',
    title: 'Define the profile schema',
    status: 'todo'
  }, {
    id: 'j7e4',
    title: 'Wire spawn to resolve profile → model',
    status: 'todo'
  }]
}, {
  id: 'k3f8',
  title: 'Verify Opus 1M spawns with 1M context window',
  status: 'in_review',
  priority: 'low',
  model: 'opus[1m]',
  updated: '3h ago'
}, {
  id: 'l9a1',
  title: 'Migrate task ordering to server persistence',
  status: 'blocked',
  priority: 'medium',
  assignees: [MEMBERS.ada],
  updated: 'yesterday'
}];
const TASKS_DONE = [{
  id: 'm2b7',
  title: 'Stream agent progress over the socket',
  status: 'completed',
  priority: 'high',
  assignees: [MEMBERS.rhea],
  updated: 'Jun 9'
}, {
  id: 'n4c2',
  title: 'Persist sessions as JSON on disk',
  status: 'completed',
  priority: 'medium',
  assignees: [MEMBERS.kit],
  updated: 'Jun 8'
}, {
  id: 'o8d5',
  title: 'Add the command palette',
  status: 'completed',
  priority: 'low',
  updated: 'Jun 6'
}];

/* ---------- sessions ---------- (children = spawn-chain; arbitrarily deep) */
const TEAM = {
  name: 'Reparent strike team',
  dot: '#2f8f7f',
  count: 4,
  coord: {
    id: 's-rhea',
    kind: 'claude',
    name: 'Rhea · coordinator',
    status: 'run',
    statusText: 'Coordinating',
    live: true,
    say: 'Delegated 2 subtasks to the workers, watching the test run',
    mode: 'Coordinator',
    model: 'opus-4.8',
    strategy: 'parallel',
    elapsed: '12m',
    humanDone: false,
    tasklines: [{
      status: 'in_progress',
      title: 'Fix terminal reparenting crash'
    }],
    taskchips: [{
      status: 'in_progress',
      title: 'Reparent crash'
    }, {
      status: 'blocked',
      title: 'Connection-loss test'
    }],
    docList: [{
      id: 'd-strike',
      name: 'strike-plan.md',
      md: true
    }],
    children: [{
      id: 's-fluffy',
      kind: 'claude',
      name: 'fluffy-starlight',
      status: 'run',
      statusText: 'Running',
      live: true,
      active: true,
      say: 'Reparenting the terminal node, then re-running the fit',
      ctx: 24,
      mode: 'Worker',
      model: 'opus-4.8',
      worktree: 'fix/terminal-reparent',
      elapsed: '4m 12s',
      docs: 2,
      tasklines: [{
        status: 'in_progress',
        title: 'Make board reparent via registry ref'
      }],
      taskchips: [{
        status: 'in_progress',
        title: 'Registry ref reparent'
      }],
      docList: [{
        id: 'd-reparent',
        name: 'reparent-plan.md',
        md: true
      }],
      diagrams: [{
        id: 'g-reparent',
        name: 'reparent-flow'
      }]
    }, {
      id: 's-vast',
      kind: 'claude',
      name: 'vast-neumann',
      status: 'wait',
      statusText: 'Needs input',
      live: true,
      wait: true,
      needsInput: true,
      say: 'Which model profile should the fallback layer default to?',
      mode: 'Worker',
      model: 'sonnet-4.5',
      worktree: 'feat/model-profile',
      elapsed: '7m',
      tasklines: [{
        status: 'blocked',
        title: 'Model-profile indirection layer'
      }]
    }, {
      id: 's-alexa',
      kind: 'codex',
      name: 'Alexa coordinator',
      status: 'run',
      statusText: 'Running',
      live: true,
      say: 'Spawned 2 workers on the voice pipeline',
      mode: 'Coordinator',
      model: 'codex-1',
      strategy: 'sequential',
      elapsed: '21m',
      children: [{
        id: 's-quiet',
        kind: 'codex',
        name: 'quiet-meadow',
        status: 'run',
        statusText: 'Running',
        live: true,
        say: 'Wiring the wake-word endpoint',
        mode: 'Worker',
        model: 'codex-1',
        elapsed: '6m'
      }, {
        id: 's-brave',
        kind: 'codex',
        name: 'brave-summit',
        status: 'idle',
        statusText: 'Idle · waiting on lock',
        live: false,
        say: 'Holding for the shared audio-buffer lock',
        mode: 'Worker',
        model: 'codex-1',
        elapsed: '2m'
      }]
    }]
  }
};
const SESSIONS_IDLE = [{
  id: 's-cosmos',
  kind: 'gemini',
  name: 'concurrent-cosmos',
  status: 'idle',
  statusText: 'Idle · exited clean',
  live: false,
  mode: 'Worker',
  model: 'gemini-2.5-pro',
  elapsed: '—'
}, {
  id: 's-zesty',
  kind: 'terminal',
  name: 'zesty-wave',
  status: 'stopped',
  statusText: 'Stopped · marked done',
  live: false,
  exited: true,
  humanDone: true,
  mode: 'Worker',
  model: 'zsh',
  elapsed: '—'
}];

/* dropdown option sets (translated from the desktop tiles) */
const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked', 'archived'];
const TASK_STATUS_LABEL = {
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Completed',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
  archived: 'Archived'
};
const SESS_STATUS_LABEL = {
  spawning: 'Spawning',
  idle: 'Idle',
  working: 'Working',
  run: 'Running',
  wait: 'Needs input',
  completed: 'Done',
  failed: 'Failed',
  stopped: 'Stopped'
};
const PRIORITIES = ['high', 'medium', 'low'];
const MODELS = ['default', 'opus-4.8', 'sonnet-4.5', 'opus[1m]', 'gemini-2.5-pro', 'codex-1'];
const MODES = ['Worker', 'Coordinator', 'Co-Worker', 'Co-Coordinator'];
const ALL_MEMBERS = [MEMBERS.rhea, MEMBERS.kit, MEMBERS.ada, MEMBERS.milo];

/* ---------- active session terminal transcript (fluffy-starlight) ---------- */
const ACTIVE = {
  name: 'fluffy-starlight',
  model: 'claude · opus-4.8',
  branch: 'fix/terminal-reparent',
  ctxTokens: '48.2k',
  ctxMax: '200k',
  ctxPct: 24,
  cache: 92,
  out: '12.4k',
  turns: 8,
  tools: 23,
  duration: '4m 12s'
};

/* ==========================================================================
   DOCS & DIAGRAMS — the real model from agent-maestro.
   A doc is either kind:'markdown' (rendered in the DocViewer) or kind:'diagram'
   (an Excalidraw scene opened full-screen on the board). Both carry:
   id · title · filePath · kind · addedAt · addedBy · sessionName? · taskId?.
   Diagram scenes use a compact node/edge/note format rendered with rough.js.
   ========================================================================== */
const NOW = Date.now();
const ago = m => NOW - m * 60000;

/* ---- diagram scenes (excalidraw-style) ---- */
const SCENE_REPARENT = {
  w: 700,
  h: 752,
  nodes: [{
    id: 'A',
    x: 268,
    y: 24,
    w: 164,
    h: 60,
    label: 'Board closes',
    shape: 'rect'
  }, {
    id: 'B',
    x: 252,
    y: 120,
    w: 196,
    h: 118,
    label: 'who owns the\nterminal node?',
    shape: 'diamond'
  }, {
    id: 'C',
    x: 36,
    y: 300,
    w: 210,
    h: 82,
    label: 'Board moves\n[data-terminal-id]',
    shape: 'rect',
    fill: 'blue'
  }, {
    id: 'D',
    x: 454,
    y: 300,
    w: 210,
    h: 82,
    label: 'TeamView moves\nterm.element',
    shape: 'rect',
    fill: 'blue'
  }, {
    id: 'E',
    x: 246,
    y: 452,
    w: 208,
    h: 82,
    label: 'reparent via\nregistry ref',
    shape: 'rect',
    fill: 'green'
  }, {
    id: 'F',
    x: 255,
    y: 580,
    w: 190,
    h: 70,
    label: 'ref.reparent(node)',
    shape: 'rect',
    fill: 'green'
  }, {
    id: 'G',
    x: 258,
    y: 668,
    w: 184,
    h: 62,
    label: 're-run fit.fit()',
    shape: 'rect',
    fill: 'yellow'
  }],
  edges: [{
    from: 'A',
    to: 'B'
  }, {
    from: 'B',
    to: 'C',
    label: 'on close'
  }, {
    from: 'B',
    to: 'D',
    label: 'on close'
  }, {
    from: 'C',
    to: 'E',
    label: 'replace',
    dashed: true
  }, {
    from: 'D',
    to: 'E',
    label: 'replace',
    dashed: true
  }, {
    from: 'E',
    to: 'F'
  }, {
    from: 'F',
    to: 'G'
  }],
  notes: [{
    x: 296,
    y: 398,
    text: '✗ they disagree\n→ blank terminal',
    color: 'red'
  }, {
    x: 470,
    y: 686,
    text: '✓ survives',
    color: 'green'
  }]
};
const SCENE_MODEL = {
  w: 640,
  h: 520,
  nodes: [{
    id: 'A',
    x: 240,
    y: 24,
    w: 160,
    h: 58,
    label: 'task spawn',
    shape: 'rect'
  }, {
    id: 'B',
    x: 224,
    y: 118,
    w: 192,
    h: 74,
    label: 'profile\n(frontend-dev)',
    shape: 'rect',
    fill: 'blue'
  }, {
    id: 'C',
    x: 235,
    y: 228,
    w: 170,
    h: 112,
    label: 'profile names\na model?',
    shape: 'diamond'
  }, {
    id: 'D',
    x: 66,
    y: 404,
    w: 168,
    h: 72,
    label: 'use model\nopus-4.8',
    shape: 'rect',
    fill: 'green'
  }, {
    id: 'E',
    x: 404,
    y: 404,
    w: 178,
    h: 72,
    label: 'default\nsonnet-4.5',
    shape: 'rect',
    fill: 'yellow'
  }],
  edges: [{
    from: 'A',
    to: 'B'
  }, {
    from: 'B',
    to: 'C'
  }, {
    from: 'C',
    to: 'D',
    label: 'yes'
  }, {
    from: 'C',
    to: 'E',
    label: 'no',
    dashed: true
  }],
  notes: [{
    x: 426,
    y: 348,
    text: '? which default —\nopen question',
    color: 'red'
  }]
};
const SCENE_SOCKET = {
  w: 640,
  h: 560,
  nodes: [{
    id: 'A',
    x: 232,
    y: 24,
    w: 176,
    h: 70,
    label: 'session.update\ninbound',
    shape: 'rect'
  }, {
    id: 'B',
    x: 235,
    y: 128,
    w: 170,
    h: 110,
    label: 'id seen\nbefore?',
    shape: 'diamond'
  }, {
    id: 'C',
    x: 54,
    y: 300,
    w: 152,
    h: 64,
    label: 'drop\nduplicate',
    shape: 'rect',
    fill: 'red'
  }, {
    id: 'D',
    x: 412,
    y: 300,
    w: 176,
    h: 66,
    label: 'apply update',
    shape: 'rect',
    fill: 'green'
  }, {
    id: 'E',
    x: 222,
    y: 430,
    w: 196,
    h: 78,
    label: 'dedupe cache\nLRU · last 200',
    shape: 'rect',
    fill: 'blue'
  }],
  edges: [{
    from: 'A',
    to: 'B'
  }, {
    from: 'B',
    to: 'C',
    label: 'yes'
  }, {
    from: 'B',
    to: 'D',
    label: 'no'
  }, {
    from: 'D',
    to: 'E',
    label: 'record id'
  }, {
    from: 'E',
    to: 'B',
    dashed: true,
    label: 'lookup'
  }],
  notes: [{
    x: 432,
    y: 58,
    text: '↺ replays on\nreconnect',
    color: 'amber'
  }]
};

/* ---- markdown bodies ---- */
const MD_TRA = `# Terminal reparenting — analysis

When the board closes, the live terminal goes blank. Two code paths move the
same DOM node and disagree on **who owns it**.

## What's happening

- The **board** reparents \`[data-terminal-id]\` — the React-owned container.
- **TeamView** moves \`term.element\` — the xterm node itself.

Both fire on close. The second move lands on a node the first already detached,
so xterm loses its canvas and \`fit()\` runs against a zero-size box.

> Repro: open two sessions, tile them on the board, close the board. The focused
> terminal renders one blank frame, then throws on the next \`fit()\`.

The flow, drawn out:

\`\`\`excalidraw
g-reparent
\`\`\`

## Root cause

\`registry.current.get(session.id)\` already holds the canonical node. The board
should reparent **through the registry ref**, not by querying the DOM for
\`[data-terminal-id]\`.

## Fix in one line

Reparent via the ref, then re-run \`fit.fit()\` once after the move — see
\`reparent-plan.md\`.`;
const MD_REPARENT = `# Reparent plan

Surgical change. Touch only the reparent path.

## Steps

1. In \`MultiProjectSessionsView\`, look up the node with
   \`registry.current.get(session.id)?.term.element\`.
2. Reparent **that** node instead of the \`[data-terminal-id]\` container.
3. Drop the DOM query in the board's close handler.
4. Re-run \`fit.fit()\` once, after the move settles.

## Out of scope

- Don't touch TeamView's own reparent — it's correct.
- No changes to the registry shape.

## Validation

- [x] Two sessions, tile, close board — terminal survives.
- [x] Resize after reparent — no zero-size fit.
- [ ] Connection-loss regression test (owned by @Ada).`;
const MD_SOCKET = `# Socket dedupe

The session stream replays updates on reconnect, so the same \`session.update\`
lands two or three times. The UI flickers and counters double-count.

## Approach

Keep a small **LRU cache** of the last 200 update ids. On each inbound message,
check the cache before applying.

- Seen it? Drop it.
- New? Apply, then record the id.

The cache is keyed by \`update.id\`, not by session — ids are globally unique.`;
const MD_STRIKE = `# Strike plan — reparent

Coordinating three workers on the terminal-reparent fix.

## Assignments

- **Kit** — thread the registry ref through \`MultiProjectSessionsView\`.
- **Ada** — write the connection-loss regression test.
- **Rhea** — review the diff, keep it surgical.

## Strategy

Parallel. Kit and Ada work isolated worktrees; merge behind the test.`;
const MD_MODEL = `# Model-profile indirection

Spawn currently hard-codes a model per task. We want a **profile** layer in
between, so a persona resolves to a model at spawn time.

## Open question

Two profiles can resolve to the same model. **Which model is the default** when
a profile doesn't name one? \`sonnet-4.5\` is the safe pick — cheap, fast, good
enough for most workers.`;
const DOCS = [{
  id: 'd-tra',
  kind: 'markdown',
  title: 'Terminal rendering analysis',
  filePath: 'docs/terminal-rendering-analysis.md',
  addedAt: ago(2),
  addedBy: 'Rhea',
  sessionName: 'fluffy-starlight',
  taskId: 'a3f9',
  content: MD_TRA
}, {
  id: 'd-reparent',
  kind: 'markdown',
  title: 'Reparent plan',
  filePath: 'docs/reparent-plan.md',
  addedAt: ago(6),
  addedBy: 'Kit',
  sessionName: 'fluffy-starlight',
  taskId: 'a3f9',
  content: MD_REPARENT
}, {
  id: 'd-socket',
  kind: 'markdown',
  title: 'Socket dedupe',
  filePath: 'docs/socket-dedupe.md',
  addedAt: ago(48),
  addedBy: 'Kit',
  taskId: 'g2b5',
  content: MD_SOCKET
}, {
  id: 'd-strike',
  kind: 'markdown',
  title: 'Strike plan',
  filePath: 'docs/strike-plan.md',
  addedAt: ago(74),
  addedBy: 'Rhea',
  sessionName: 'Rhea · coordinator',
  content: MD_STRIKE
}, {
  id: 'd-model',
  kind: 'markdown',
  title: 'Model-profile indirection',
  filePath: 'docs/model-profile.md',
  addedAt: ago(190),
  addedBy: 'Rhea',
  taskId: 'h6c9',
  content: MD_MODEL
}, {
  id: 'g-reparent',
  kind: 'diagram',
  title: 'Reparent flow',
  filePath: 'diagrams/reparent-flow.excalidraw',
  addedAt: ago(4),
  addedBy: 'Rhea',
  sessionName: 'fluffy-starlight',
  taskId: 'a3f9',
  scene: SCENE_REPARENT
}, {
  id: 'g-socket',
  kind: 'diagram',
  title: 'Socket dedupe flow',
  filePath: 'diagrams/socket-dedupe.excalidraw',
  addedAt: ago(52),
  addedBy: 'Kit',
  taskId: 'g2b5',
  scene: SCENE_SOCKET
}, {
  id: 'g-model',
  kind: 'diagram',
  title: 'Model-profile resolution',
  filePath: 'diagrams/model-profile.excalidraw',
  addedAt: ago(196),
  addedBy: 'Rhea',
  taskId: 'h6c9',
  scene: SCENE_MODEL
}];
const DOCS_BY_ID = {};
DOCS.forEach(d => {
  DOCS_BY_ID[d.id] = d;
});

/* resolve a doc from a pill ref ({id} | {name} | id-string) */
function resolveDoc(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return DOCS_BY_ID[ref] || DOCS.find(d => d.title === ref) || null;
  if (ref.id && DOCS_BY_ID[ref.id]) return DOCS_BY_ID[ref.id];
  if (ref.kind === 'diagram' || ref.kind === 'markdown') return ref;
  if (ref.name) {
    const base = ref.name.replace(/\.(md|markdown|excalidraw)$/, '');
    return DOCS.find(d => d.filePath.includes(base) || d.title === ref.name) || null;
  }
  return null;
}
function isDiagramDoc(d) {
  return !!d && (d.kind === 'diagram' || /\.excalidraw$/.test(d.filePath || '') || !!d.scene);
}
Object.assign(window, {
  MEMBERS,
  MEMBER_LIST,
  TASKS_IN_PROGRESS,
  TASKS_UP_NEXT,
  TASKS_DONE,
  TEAM,
  SESSIONS_IDLE,
  ACTIVE,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  SESS_STATUS_LABEL,
  PRIORITIES,
  MODELS,
  MODES,
  ALL_MEMBERS,
  DOCS,
  DOCS_BY_ID,
  resolveDoc,
  isDiagramDoc
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-data.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-docs.jsx
try { (() => {
/* m-docs.jsx — Task docs & diagrams for mobile, faithful to agent-maestro's
   DocViewer / ProjectDocsList / ExcalidrawBoard.

   - Markdown docs  → DocSheet: an editorial reader (icon · title · filename ·
     .ext badge · Path/Added/By/Session meta · rendered markdown with mermaid +
     inline ```excalidraw``` embeds).
   - Diagram docs   → DiagramSheet: a full-screen Excalidraw-style board in view
     mode (Edit/View toggle, pan + pinch-free zoom), rendered with rough.js.
   - DocsSheet      → the unified browser: Docs / Diagrams segmented, Open/Done/
     All sub-tabs, done-radio + close, time-ago — a phone port of ProjectDocsList.
   Exports DocSheet, DiagramSheet, DocsSheet to window. */
const {
  useState: useStateD,
  useEffect: useEffectD,
  useRef: useRefD
} = React;

/* ============================ helpers ============================ */
function fmtDate(ts) {
  return new Date(ts).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function docIcon(d) {
  if (window.isDiagramDoc(d)) return '⬡';
  return /\.(md|mdx|markdown)$/.test(d.filePath || '') ? 'M↓' : '{ }';
}
function fileName(p) {
  return (p || '').split('/').pop();
}
function fileExt(p) {
  const parts = (p || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

/* ============================ markdown ============================ */
const MERMAID_LANGS = /^(mermaid|graph|flowchart|sequencediagram|erdiagram|classdiagram|statediagram|gantt|pie|journey|mindmap|timeline)$/i;
function isMermaidish(code) {
  const f = (code.trim().split('\n')[0] || '').trim();
  return /^(graph |flowchart |sequenceDiagram|erDiagram|classDiagram|stateDiagram|gantt|pie |journey|mindmap|timeline)/.test(f);
}
function mdInline(text) {
  const nodes = [];
  let k = 0,
    last = 0,
    m;
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  while (m = re.exec(text)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**') || t.startsWith('__')) nodes.push(/*#__PURE__*/React.createElement("strong", {
      key: k++
    }, t.slice(2, -2)));else if (t[0] === '`') nodes.push(/*#__PURE__*/React.createElement("code", {
      key: k++,
      className: "m-md__code"
    }, t.slice(1, -1)));else if (t[0] === '[') {
      const mm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t);
      nodes.push(/*#__PURE__*/React.createElement("a", {
        key: k++,
        className: "m-md__a",
        href: mm[2],
        onClick: e => e.preventDefault()
      }, mm[1]));
    } else nodes.push(/*#__PURE__*/React.createElement("em", {
      key: k++
    }, t.slice(1, -1)));
    last = m.index + t.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function InlineExcaliEmbed({
  docId,
  onOpen
}) {
  const d = window.DOCS_BY_ID[docId];
  return /*#__PURE__*/React.createElement("button", {
    className: "m-embed",
    onClick: () => d && onOpen && onOpen(d)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-embed__ic"
  }, "\u2B21"), /*#__PURE__*/React.createElement("span", {
    className: "m-embed__body"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-embed__t"
  }, d ? d.title : 'Diagram'), /*#__PURE__*/React.createElement("span", {
    className: "m-embed__sub"
  }, d ? fileName(d.filePath) : docId)), /*#__PURE__*/React.createElement("span", {
    className: "m-embed__open"
  }, "Open ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 13
  })));
}
function MermaidCard({
  lang,
  code
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "m-mermaid"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-mermaid__bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-mermaid__hex"
  }, "\u2B21"), " ", lang || 'mermaid', " diagram"), /*#__PURE__*/React.createElement("pre", {
    className: "m-mermaid__code"
  }, /*#__PURE__*/React.createElement("code", null, code)));
}
function Markdown({
  src,
  onOpenDiagram
}) {
  const lines = (src || '').replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0,
    key = 0;
  const BREAK = /^(#{1,4}\s|>\s?|```|\s*([-*+]|\d+\.)\s|(-{3,}|\*{3,}|_{3,})\s*$)/;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++;
      const code = buf.join('\n');
      if (/^excalidraw$/i.test(lang)) out.push(/*#__PURE__*/React.createElement(InlineExcaliEmbed, {
        key: key++,
        docId: code.trim(),
        onOpen: onOpenDiagram
      }));else if (MERMAID_LANGS.test(lang) || !lang && isMermaidish(code)) out.push(/*#__PURE__*/React.createElement(MermaidCard, {
        key: key++,
        lang: lang,
        code: code
      }));else out.push(/*#__PURE__*/React.createElement("pre", {
        key: key++,
        className: "m-md__pre"
      }, /*#__PURE__*/React.createElement("code", null, code)));
      continue;
    }
    const hm = /^(#{1,4})\s+(.*)$/.exec(line);
    if (hm) {
      const lvl = Math.min(hm[1].length, 4);
      out.push(React.createElement('h' + lvl, {
        key: key++,
        className: 'm-md__h m-md__h' + lvl
      }, mdInline(hm[2])));
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(/*#__PURE__*/React.createElement("hr", {
        key: key++,
        className: "m-md__hr"
      }));
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      out.push(/*#__PURE__*/React.createElement("blockquote", {
        key: key++,
        className: "m-md__quote"
      }, mdInline(buf.join(' '))));
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        let it = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, '');
        const task = /^\[([ xX])\]\s+/.exec(it);
        if (task) {
          const done = task[1].toLowerCase() === 'x';
          it = it.replace(/^\[([ xX])\]\s+/, '');
          items.push(/*#__PURE__*/React.createElement("li", {
            key: i,
            className: 'm-md__task' + (done ? ' m-md__task--done' : '')
          }, /*#__PURE__*/React.createElement("span", {
            className: "m-md__check"
          }, done ? '✓' : ''), /*#__PURE__*/React.createElement("span", null, mdInline(it))));
        } else items.push(/*#__PURE__*/React.createElement("li", {
          key: i
        }, mdInline(it)));
        i++;
      }
      out.push(React.createElement(ordered ? 'ol' : 'ul', {
        key: key++,
        className: 'm-md__list'
      }, items));
      continue;
    }
    if (line.trim() === '') {
      i++;
      continue;
    }
    const buf = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== '' && !BREAK.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push(/*#__PURE__*/React.createElement("p", {
      key: key++,
      className: "m-md__p"
    }, mdInline(buf.join(' '))));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "m-md"
  }, out);
}

/* ============================ excalidraw board (rough.js) ============================ */
const DG_FILL = {
  yellow: '#ffec99',
  blue: '#a5d8ff',
  green: '#b2f2bb',
  red: '#ffc9c9',
  amber: '#ffe2a8',
  violet: '#d0bfff'
};
const DG_NOTE = {
  red: '#bb4d3d',
  green: '#2f7d4f',
  blue: '#2b6cb0',
  amber: '#9a6b12',
  yellow: '#917516'
};
const DG_STROKE = '#1f1d1a';
function rrPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r},${y} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - 2 * r} a${r},${r} 0 0 1 ${-r},${r} h${-(w - 2 * r)} a${r},${r} 0 0 1 ${-r},${-r} v${-(h - 2 * r)} a${r},${r} 0 0 1 ${r},${-r} z`;
}
function edgePoint(a, b, pad) {
  const ac = {
      x: a.x + a.w / 2,
      y: a.y + a.h / 2
    },
    bc = {
      x: b.x + b.w / 2,
      y: b.y + b.h / 2
    };
  const dx = bc.x - ac.x,
    dy = bc.y - ac.y;
  if (dx === 0 && dy === 0) return ac;
  const hw = a.w / 2 + pad,
    hh = a.h / 2 + pad;
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity,
    sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return {
    x: ac.x + dx * s,
    y: ac.y + dy * s
  };
}
function svgEl(tag, attrs) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}
function drawScene(svg, scene) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const R = window.rough;
  const rc = R ? R.svg(svg) : null;
  const byId = {};
  scene.nodes.forEach(n => {
    byId[n.id] = n;
  });
  scene.edges.forEach((e, i) => {
    const a = byId[e.from],
      b = byId[e.to];
    if (!a || !b) return;
    const s = edgePoint(a, b, 6),
      t = edgePoint(b, a, 6);
    const o = {
      roughness: 1.1,
      bowing: 1.2,
      stroke: DG_STROKE,
      strokeWidth: 1.5,
      seed: i * 7 + 3
    };
    if (e.dashed) o.strokeLineDash = [8, 7];
    if (rc) svg.appendChild(rc.line(s.x, s.y, t.x, t.y, o));else svg.appendChild(svgEl('line', {
      x1: s.x,
      y1: s.y,
      x2: t.x,
      y2: t.y,
      stroke: DG_STROKE,
      'stroke-width': 1.5,
      'stroke-dasharray': e.dashed ? '8 7' : ''
    }));
    const ang = Math.atan2(t.y - s.y, t.x - s.x),
      L = 13,
      sp = 0.46;
    const h1 = {
      x: t.x - L * Math.cos(ang - sp),
      y: t.y - L * Math.sin(ang - sp)
    };
    const h2 = {
      x: t.x - L * Math.cos(ang + sp),
      y: t.y - L * Math.sin(ang + sp)
    };
    const ho = {
      roughness: 0.8,
      stroke: DG_STROKE,
      strokeWidth: 1.5,
      seed: i * 7 + 5
    };
    if (rc) {
      svg.appendChild(rc.line(t.x, t.y, h1.x, h1.y, ho));
      svg.appendChild(rc.line(t.x, t.y, h2.x, h2.y, ho));
    } else {
      svg.appendChild(svgEl('line', {
        x1: t.x,
        y1: t.y,
        x2: h1.x,
        y2: h1.y,
        stroke: DG_STROKE,
        'stroke-width': 1.5
      }));
      svg.appendChild(svgEl('line', {
        x1: t.x,
        y1: t.y,
        x2: h2.x,
        y2: h2.y,
        stroke: DG_STROKE,
        'stroke-width': 1.5
      }));
    }
  });
  scene.nodes.forEach((n, i) => {
    const fill = DG_FILL[n.fill];
    const o = {
      roughness: 1,
      bowing: 0.9,
      stroke: DG_STROKE,
      strokeWidth: 1.7,
      seed: i * 13 + 9
    };
    if (fill) {
      o.fill = fill;
      o.fillStyle = 'hachure';
      o.hachureGap = 5.5;
      o.fillWeight = 1.7;
    }
    const cx = n.x + n.w / 2,
      cy = n.y + n.h / 2;
    let node;
    if (rc) {
      if (n.shape === 'diamond') node = rc.polygon([[cx, n.y], [n.x + n.w, cy], [cx, n.y + n.h], [n.x, cy]], o);else if (n.shape === 'ellipse') node = rc.ellipse(cx, cy, n.w, n.h, o);else node = rc.path(rrPath(n.x, n.y, n.w, n.h, 12), o);
    } else {
      node = svgEl(n.shape === 'ellipse' ? 'ellipse' : 'rect', n.shape === 'ellipse' ? {
        cx,
        cy,
        rx: n.w / 2,
        ry: n.h / 2,
        fill: fill || 'none',
        stroke: DG_STROKE,
        'stroke-width': 1.7
      } : {
        x: n.x,
        y: n.y,
        width: n.w,
        height: n.h,
        rx: 12,
        fill: fill || 'none',
        stroke: DG_STROKE,
        'stroke-width': 1.7
      });
    }
    svg.appendChild(node);
  });
}
function ExcaliBoard({
  scene,
  zoom
}) {
  const svgRef = useRefD(null);
  useEffectD(() => {
    if (svgRef.current) drawScene(svgRef.current, scene);
  }, [scene]);
  const byId = {};
  scene.nodes.forEach(n => {
    byId[n.id] = n;
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "m-board__sizer",
    style: {
      width: scene.w * zoom,
      height: scene.h * zoom
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-board__inner",
    style: {
      width: scene.w,
      height: scene.h,
      transform: `scale(${zoom})`
    }
  }, /*#__PURE__*/React.createElement("svg", {
    ref: svgRef,
    className: "m-board__svg",
    width: scene.w,
    height: scene.h,
    viewBox: `0 0 ${scene.w} ${scene.h}`
  }), scene.nodes.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    className: "m-node",
    style: {
      left: n.x,
      top: n.y,
      width: n.w,
      height: n.h
    }
  }, n.label.split('\n').map((l, j) => /*#__PURE__*/React.createElement("span", {
    key: j,
    className: "m-node__l"
  }, l)))), (scene.notes || []).map((nt, i) => /*#__PURE__*/React.createElement("div", {
    key: 'n' + i,
    className: "m-note",
    style: {
      left: nt.x,
      top: nt.y,
      color: DG_NOTE[nt.color] || DG_NOTE.red
    }
  }, nt.text.split('\n').map((l, j) => /*#__PURE__*/React.createElement("span", {
    key: j
  }, l)))), scene.edges.filter(e => e.label).map((e, i) => {
    const a = byId[e.from],
      b = byId[e.to];
    if (!a || !b) return null;
    const s = edgePoint(a, b, 6),
      t = edgePoint(b, a, 6);
    return /*#__PURE__*/React.createElement("div", {
      key: 'el' + i,
      className: "m-elabel",
      style: {
        left: (s.x + t.x) / 2,
        top: (s.y + t.y) / 2
      }
    }, e.label);
  })));
}

/* ============================ DiagramSheet (full-screen board) ============================ */
function DiagramSheet({
  doc,
  onClose,
  notify
}) {
  const scene = doc.scene;
  const [closing, setClosing] = useStateD(false);
  const [edit, setEdit] = useStateD(false);
  const [zoom, setZoom] = useStateD(0.5);
  const stageRef = useRefD(null);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };
  const fit = () => {
    const el = stageRef.current;
    if (!el) return;
    const z = Math.min(1, (el.clientWidth - 28) / scene.w);
    setZoom(Math.max(0.3, +z.toFixed(3)));
  };
  useEffectD(() => {
    fit();
  }, [scene]);
  const bump = d => setZoom(v => Math.min(2, Math.max(0.25, +(v + d).toFixed(2))));
  const toggleEdit = () => {
    const nv = !edit;
    setEdit(nv);
    notify && notify(nv ? 'Edit mode — drawing is best on desktop' : 'View mode');
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'm-scrim' + (closing ? ' m-scrim--out' : ''),
    onClick: close
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-board' + (closing ? ' m-board--out' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-board__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-board__down",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-board__title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-board__hex"
  }, "\u2B21"), /*#__PURE__*/React.createElement("span", {
    className: "m-board__name"
  }, doc.title), /*#__PURE__*/React.createElement("span", {
    className: "m-board__ext"
  }, ".excalidraw")), /*#__PURE__*/React.createElement("button", {
    className: 'm-board__edit' + (edit ? ' m-board__edit--on' : ''),
    onClick: toggleEdit
  }, edit ? 'View' : 'Edit'), /*#__PURE__*/React.createElement("button", {
    className: "m-board__ib",
    onClick: () => notify && notify('Diagram menu')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-board__sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-board__metahex"
  }, edit ? 'EDIT' : 'VIEW'), /*#__PURE__*/React.createElement("span", {
    className: "m-board__submeta"
  }, doc.addedBy ? 'by ' + doc.addedBy : 'project', " \xB7 ", timeAgo(doc.addedAt)), doc.taskId && /*#__PURE__*/React.createElement("span", {
    className: "m-board__task"
  }, "task ", doc.taskId)), /*#__PURE__*/React.createElement("div", {
    className: "m-board__stage",
    ref: stageRef
  }, /*#__PURE__*/React.createElement(ExcaliBoard, {
    scene: scene,
    zoom: zoom
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-board__tools"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-board__zb",
    onClick: () => bump(-0.15),
    "aria-label": "Zoom out"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-board__zsign"
  }, "\u2212")), /*#__PURE__*/React.createElement("button", {
    className: "m-board__pct",
    onClick: fit
  }, Math.round(zoom * 100), "%"), /*#__PURE__*/React.createElement("button", {
    className: "m-board__zb",
    onClick: () => bump(0.15),
    "aria-label": "Zoom in"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-board__zsign"
  }, "+")), /*#__PURE__*/React.createElement("span", {
    className: "m-board__toolsp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "m-board__fit",
    onClick: fit
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "grid",
    size: 14
  }), " Fit"), /*#__PURE__*/React.createElement("button", {
    className: "m-board__export",
    onClick: () => notify && notify('Exported to task')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowUp",
    size: 14
  }), " Export"))));
}

/* ============================ DocSheet (markdown / code reader) ============================ */
function DocSheet({
  doc,
  onClose,
  notify
}) {
  const [closing, setClosing] = useStateD(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };
  const ext = fileExt(doc.filePath);
  const isMd = /^(md|mdx|markdown)$/.test(ext);
  const openDiagram = d => MUI.openDoc(d);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'm-scrim' + (closing ? ' m-scrim--out' : ''),
    onClick: close
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-doc' + (closing ? ' m-doc--out' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-doc__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-doc__down",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__icon"
  }, docIcon(doc)), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__titlecol"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-doc__title"
  }, doc.title), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__path"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__file"
  }, fileName(doc.filePath)), ext && /*#__PURE__*/React.createElement("span", {
    className: "m-doc__ext"
  }, ".", ext))), /*#__PURE__*/React.createElement("button", {
    className: "m-doc__ib",
    onClick: () => {
      notify && notify('Copied');
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 17
  })), /*#__PURE__*/React.createElement("button", {
    className: "m-doc__ib",
    onClick: () => notify && notify('Doc menu')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mi"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__ml"
  }, "Path"), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mv"
  }, doc.filePath)), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mi"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__ml"
  }, "Added"), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mv"
  }, fmtDate(doc.addedAt))), doc.addedBy && /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mi"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__ml"
  }, "By"), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mv"
  }, doc.addedBy)), doc.sessionName && /*#__PURE__*/React.createElement("span", {
    className: "m-doc__mi"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__ml"
  }, "Session"), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__sess"
  }, doc.sessionName))), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__body"
  }, doc.content ? isMd ? /*#__PURE__*/React.createElement(Markdown, {
    src: doc.content,
    onOpenDiagram: openDiagram
  }) : /*#__PURE__*/React.createElement("pre", {
    className: "m-doc__code"
  }, /*#__PURE__*/React.createElement("code", null, doc.content)) : /*#__PURE__*/React.createElement("div", {
    className: "m-doc__empty"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__emptyic"
  }, "\u25CB"), /*#__PURE__*/React.createElement("span", null, "No content available"), /*#__PURE__*/React.createElement("span", {
    className: "m-doc__emptypath"
  }, doc.filePath)))));
}

/* ============================ DocsSheet (browser: docs / diagrams) ============================ */
function DocsSheet({
  initialKind,
  onClose,
  notify
}) {
  const [closing, setClosing] = useStateD(false);
  const [kind, setKind] = useStateD(initialKind === 'diagram' ? 'diagram' : 'markdown');
  const [sub, setSub] = useStateD('open');
  const [status, setStatus] = useStateD({});
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };
  const stOf = id => status[id] || 'open';
  const setSt = (id, v) => setStatus(s => ({
    ...s,
    [id]: v
  }));
  const toggleDone = id => setSt(id, stOf(id) === 'done' ? 'open' : 'done');
  const items = window.DOCS.filter(d => kind === 'diagram' ? window.isDiagramDoc(d) : !window.isDiagramDoc(d));
  const openCount = items.filter(d => stOf(d.id) === 'open').length;
  const doneCount = items.filter(d => stOf(d.id) === 'done').length;
  const visible = sub === 'all' ? items : items.filter(d => stOf(d.id) === sub);
  const noun = kind === 'diagram' ? 'diagrams' : 'documents';
  const empty = sub === 'open' ? `No open ${noun}.` : sub === 'done' ? `No ${noun} marked done.` : `No ${noun} yet.`;
  const open = d => {
    if (stOf(d.id) === 'closed') setSt(d.id, 'open');
    MUI.openDoc(d);
  };
  const SUBS = [['open', 'Open', openCount], ['done', 'Done', doneCount], ['all', 'All', items.length]];
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'm-scrim' + (closing ? ' m-scrim--out' : ''),
    onClick: close
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-doc' + (closing ? ' m-doc--out' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-doc__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-doc__down",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__titlecol"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-doc__title"
  }, "Docs & diagrams"), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__path"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-doc__file"
  }, "agent-maestro"))), /*#__PURE__*/React.createElement("button", {
    className: "m-doc__ib",
    onClick: () => notify && notify(kind === 'diagram' ? 'New diagram' : 'New doc')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-docs__seg"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'm-docs__segi' + (kind === 'markdown' ? ' m-docs__segi--on' : ''),
    onClick: () => {
      setKind('markdown');
      setSub('open');
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-docs__segic"
  }, "M\u2193"), " Docs"), /*#__PURE__*/React.createElement("button", {
    className: 'm-docs__segi' + (kind === 'diagram' ? ' m-docs__segi--on' : ''),
    onClick: () => {
      setKind('diagram');
      setSub('open');
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-docs__segic"
  }, "\u2B21"), " Diagrams")), /*#__PURE__*/React.createElement("div", {
    className: "m-docs__subbar"
  }, SUBS.map(([id, label, n]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'm-docs__sub' + (sub === id ? ' m-docs__sub--on' : ''),
    onClick: () => setSub(id)
  }, label, n > 0 && /*#__PURE__*/React.createElement("span", {
    className: "m-docs__n"
  }, n)))), /*#__PURE__*/React.createElement("div", {
    className: "m-doc__body m-docs__list"
  }, visible.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "m-docs__empty"
  }, empty), visible.map(d => {
    const done = stOf(d.id) === 'done';
    const meta = d.sessionName ? 'session · ' + d.sessionName : d.taskId ? 'task · ' + d.taskId : 'project';
    return /*#__PURE__*/React.createElement("div", {
      key: d.id,
      className: "m-docrow"
    }, /*#__PURE__*/React.createElement("button", {
      className: 'm-docrow__radio' + (done ? ' m-docrow__radio--on' : ''),
      onClick: () => toggleDone(d.id),
      "aria-label": "Mark done"
    }, done && /*#__PURE__*/React.createElement(Icon, {
      name: "check",
      size: 10,
      sw: 2.2
    })), /*#__PURE__*/React.createElement("button", {
      className: "m-docrow__main",
      onClick: () => open(d)
    }, /*#__PURE__*/React.createElement("span", {
      className: 'm-docrow__ic' + (window.isDiagramDoc(d) ? ' m-docrow__ic--dg' : '')
    }, docIcon(d)), /*#__PURE__*/React.createElement("span", {
      className: "m-docrow__body"
    }, /*#__PURE__*/React.createElement("span", {
      className: 'm-docrow__title' + (done ? ' m-docrow__title--done' : '')
    }, d.title), /*#__PURE__*/React.createElement("span", {
      className: "m-docrow__meta"
    }, meta)), /*#__PURE__*/React.createElement("span", {
      className: "m-docrow__time"
    }, timeAgo(d.addedAt))), /*#__PURE__*/React.createElement("button", {
      className: "m-docrow__close",
      onClick: () => setSt(d.id, 'closed'),
      "aria-label": "Close"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "x",
      size: 12,
      sw: 2
    })));
  }), /*#__PURE__*/React.createElement("div", {
    className: "m-bottompad"
  }))));
}
Object.assign(window, {
  Markdown,
  DocSheet,
  DiagramSheet,
  DocsSheet,
  ExcaliBoard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-docs.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-kit.jsx
try { (() => {
/* m-kit.jsx — mobile shared primitives: Icon, Mark, Glyph, Avatar, AgentTile.
   Self-contained (does not depend on the desktop kit). Exports to window. */

const M_ICONS = {
  search: 'M11 11l3.5 3.5M7.5 13a5.5 5.5 0 100-11 5.5 5.5 0 000 11z',
  plus: 'M8 3.5v9M3.5 8h9',
  chevronR: 'M6 3.5L10.5 8 6 12.5',
  chevronD: 'M3.5 6L8 10.5 12.5 6',
  chevronL: 'M10 3.5L5.5 8 10 12.5',
  chevronUp: 'M3.5 10L8 5.5 12.5 10',
  sliders: 'M3 5h7M12.5 5H13M3 11h.5M6 11h7M9 3.5v3M5 9.5v3',
  play: 'M5 3.5l7 4.5-7 4.5z',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5v1.5M8 13v1.5M3.05 3.05l1.06 1.06M11.9 11.9l1.05 1.05M1.5 8H3M13 8h1.5M3.05 12.95l1.06-1.06M11.9 4.1l1.05-1.05',
  pin: 'M6 2h4l-.5 3.5L11 8H5l1.5-2.5L6 2zM8 8v5',
  more: 'M4 8h.01M8 8h.01M12 8h.01',
  check: 'M3.5 8.5L6.5 11.5 12.5 5',
  clock: 'M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z',
  gitBranch: 'M5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 5v3a3 3 0 003 3M12.5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM11 5v.5a3 3 0 01-3 3M5 12.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  listChecks: 'M3 4l1 1 1.5-1.5M3 9l1 1 1.5-1.5M8 4h5M8 9h5M8 13.5h5',
  users: 'M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13M10.5 7.2a2 2 0 000-4M11 9.9c1.5.2 2.5 1.3 2.5 3.1',
  sparkles: 'M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6zM12.5 9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z',
  folder: 'M2.5 4.5A1 1 0 013.5 3.5h2.4l1 1.3H12.5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1z',
  terminal: 'M3 4l3 3-3 3M8 11h5',
  layers: 'M8 2l5.5 3L8 8 2.5 5 8 2zM2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3',
  x: 'M4 4l8 8M12 4l-8 8',
  arrowRight: 'M3 8h9M8.5 4l4 4-4 4',
  arrowUp: 'M8 13V3.5M4 7l4-4 4 4',
  inbox: 'M2.5 9.5h3l1 1.5h3l1-1.5h3M2.5 9.5l1.8-5.5h7.4l1.8 5.5v3a1 1 0 01-1 1h-10a1 1 0 01-1-1z',
  team: 'M8 6.5a2 2 0 100-4 2 2 0 000 4zM3.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM12.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM5 14c0-1.6 1.3-2.6 3-2.6s3 1 3 2.6',
  graph: 'M4 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM12 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM8 14.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM5.3 4.1l1.7 5M10.7 4.1L9 9.1',
  archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6a1 1 0 001 1h7a1 1 0 001-1v-6M6.5 9h3',
  grid: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z',
  pen: 'M2.5 13.5l2.5-.6 7-7-1.9-1.9-7 7zM10.6 4.6l1.9 1.9 1.3-1.3a1 1 0 000-1.4l-.5-.5a1 1 0 00-1.4 0z',
  refresh: 'M13 7a5 5 0 10-1.2 4.2M13 3.5V7h-3.5',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5h-1v-8h7v1',
  info: 'M8 7.2v4M8 4.8h.01M8 14A6 6 0 108 2a6 6 0 000 12z',
  doc: 'M5 2h5l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4M6.5 9h4M6.5 11.5h2.5',
  teamview: 'M2.5 3.5h11v9h-11zM8 3.5v9M2.5 8h11',
  sun: 'M8 11a3 3 0 100-6 3 3 0 000 6zM8 1.7v1.6M8 12.7v1.6M2.6 2.6l1.1 1.1M12.3 12.3l1.1 1.1M1.7 8h1.6M12.7 8h1.6M2.6 13.4l1.1-1.1M12.3 3.7l1.1-1.1',
  moon: 'M13.4 9.3A5.5 5.5 0 116.7 2.6 4.6 4.6 0 0013.4 9.3z',
  paperclip: 'M12.5 7l-5.2 5.2a2.6 2.6 0 01-3.7-3.7l5.6-5.6a1.7 1.7 0 012.4 2.4l-5.4 5.4a.85.85 0 01-1.2-1.2L9.9 4.4',
  bot: 'M5 6.5h6a1 1 0 011 1V12a1 1 0 01-1 1H5a1 1 0 01-1-1V7.5a1 1 0 011-1zM8 4v2.5M6.4 9.2h.01M9.6 9.2h.01M3.5 8.5v2.2M12.5 8.5v2.2',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  bell: 'M8 2a4 4 0 00-4 4c0 3-1.2 4-1.2 4h10.4S12 9 12 6a4 4 0 00-4-4zM6.5 13a1.6 1.6 0 003 0',
  film: 'M2.5 3.5h11v9h-11zM5.5 3.5v9M10.5 3.5v9M2.5 6.5h3M10.5 6.5h3M2.5 9.5h3M10.5 9.5h3',
  cast: 'M2.5 11.5a2 2 0 012 2M2.5 8.5a5 5 0 015 5M2.5 5.5a8 8 0 018 8M2.6 13.4h.01',
  spell: 'M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6z',
  calendar: 'M3 4.5h10v9H3zM3 7h10M5.5 2.5v2M10.5 2.5v2',
  shield: 'M8 2l4.5 1.8v3.4c0 3-1.9 5-4.5 6-2.6-1-4.5-3-4.5-6V3.8L8 2z',
  music: 'M6 12.5a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0zM6 11V4l7-1.6v7M13 9.4a1.8 1.8 0 11-3.6 0 1.8 1.8 0 013.6 0z',
  at: 'M8 11a3 3 0 100-6 3 3 0 000 6zM11 8v.8a2 2 0 004 0V8a6 6 0 10-2.3 4.7',
  hash: 'M5.5 2.5L4 13.5M12 2.5l-1.5 11M2.5 5.5h11M2 10.5h11'
};
function Icon({
  name,
  size = 16,
  sw = 1.6,
  style,
  className
}) {
  const d = M_ICONS[name] || M_ICONS.info;
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    className: className,
    "aria-hidden": "true"
  }, d.split('M').filter(Boolean).map((seg, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: 'M' + seg
  })));
}

/* Maestro mark — command chevron spawning parallel agents: ›··+ */
function Mark({
  size = 22
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 7l4 5-4 5",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "14.5",
    cy: "12",
    r: "1.1",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18.2",
    cy: "12",
    r: "1.1",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12.5 12h.01",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  }));
}

/* drawn status glyph (task + session statuses) */
function Glyph({
  kind,
  size = 16
}) {
  const ring = /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6"
  });
  let inner = null;
  switch (kind) {
    case 'todo':
    case 'idle':
      inner = ring;
      break;
    case 'in_progress':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        opacity: "0.28"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round",
        pathLength: "100",
        strokeDasharray: "62 100",
        transform: "rotate(-90 8 8)"
      }));
      break;
    case 'working':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "2.6",
        fill: "currentColor"
      }));
      break;
    case 'in_review':
      inner = /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeDasharray: "2 2.3"
      });
      break;
    case 'completed':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        fill: "currentColor"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5 8.2l2.1 2.1L11 6.4",
        fill: "none",
        stroke: "var(--pn-card)",
        strokeWidth: "1.7",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }));
      break;
    case 'cancelled':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("path", {
        d: "M4.5 11.5l7-7",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }));
      break;
    case 'blocked':
    case 'failed':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("path", {
        d: "M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }));
      break;
    case 'archived':
    case 'stopped':
      inner = /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "3",
        width: "10",
        height: "10",
        rx: "2.5",
        fill: kind === 'stopped' ? 'currentColor' : 'none',
        stroke: "currentColor",
        strokeWidth: "1.6"
      });
      break;
    case 'spawning':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("path", {
        d: "M8 2a6 6 0 000 12z",
        fill: "currentColor"
      }));
      break;
    case 'needsInput':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        fill: "currentColor"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M8 4.6v4",
        stroke: "var(--pn-surface)",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "11",
        r: "0.95",
        fill: "var(--pn-surface)"
      }));
      break;
    default:
      inner = ring;
  }
  return /*#__PURE__*/React.createElement("span", {
    className: 'm-stat m-stat--' + kind,
    style: {
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    "aria-hidden": "true"
  }, inner));
}
function Avatar({
  a,
  lg
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'm-av' + (lg ? ' m-mav' : ''),
    style: {
      color: a.color,
      background: a.bg || 'var(--pn-active)'
    }
  }, a.initial);
}
function Avatars({
  list
}) {
  if (!list || !list.length) return null;
  if (list.length === 1) return /*#__PURE__*/React.createElement(Avatar, {
    a: list[0]
  });
  return /*#__PURE__*/React.createElement("span", {
    className: "m-av-group"
  }, list.slice(0, 3).map((a, i) => /*#__PURE__*/React.createElement(Avatar, {
    key: i,
    a: a
  })));
}
const M_AGENT_SRC = {
  claude: '../assets/claude-code-icon.png',
  codex: '../assets/openai-codex-icon.png',
  gemini: '../assets/gemini-logo.png'
};
function AgentTile({
  kind
}) {
  if (kind === 'terminal') return /*#__PURE__*/React.createElement("div", {
    className: "m-agent m-agent--term"
  }, ">_");
  return /*#__PURE__*/React.createElement("div", {
    className: "m-agent"
  }, /*#__PURE__*/React.createElement("img", {
    src: M_AGENT_SRC[kind],
    alt: kind
  }));
}

/* small circular context gauge for the now-playing strip */
function Gauge({
  pct,
  size = 24
}) {
  const r = (size - 5) / 2,
    c = 2 * Math.PI * r,
    off = c * (1 - pct / 100);
  return /*#__PURE__*/React.createElement("span", {
    className: "m-gauge"
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: `0 0 ${size} ${size}`
  }, /*#__PURE__*/React.createElement("circle", {
    className: "m-gauge__track",
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    strokeWidth: "2.5"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "m-gauge__fill",
    cx: size / 2,
    cy: size / 2,
    r: r,
    fill: "none",
    strokeWidth: "2.5",
    strokeDasharray: c,
    strokeDashoffset: off
  })));
}
Object.assign(window, {
  Icon,
  Mark,
  Glyph,
  Avatar,
  Avatars,
  AgentTile,
  Gauge,
  M_AGENT_SRC
});

/* Shared mobile-UI bus — lets deep tiles open app-level overlays (pickers,
   sheets) and fire toasts across the separate babel scopes. m-app populates
   these on each render; tiles call window.MUI.openPicker(…) / .notify(…). */
const MUI = {
  openPicker: () => {},
  openSheet: () => {},
  openTerminal: () => {},
  openRun: () => {},
  openDoc: () => {},
  openDocs: () => {},
  notify: () => {}
};
window.MUI = MUI;
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-kit.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-overlays.jsx
try { (() => {
/* m-overlays.jsx — now-playing strip + terminal sheet + command/project sheets. */
const {
  useState: useStateO
} = React;

/* model label per agent kind */
function modelFor(kind) {
  return {
    claude: 'claude · opus-4.8',
    codex: 'codex-1',
    gemini: 'gemini-2.5-pro',
    terminal: 'zsh'
  }[kind] || 'claude';
}

/* ---------------- NOW PLAYING strip ---------------- */
function NowPlaying({
  session,
  onOpen
}) {
  if (!session) return null;
  return /*#__PURE__*/React.createElement("button", {
    className: "m-np",
    onClick: () => onOpen(session)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-np__tile"
  }, /*#__PURE__*/React.createElement("img", {
    src: M_AGENT_SRC[session.kind],
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-np__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-np__name"
  }, session.name), /*#__PURE__*/React.createElement("div", {
    className: "m-np__say"
  }, session.say, /*#__PURE__*/React.createElement("span", {
    className: "m-tcursor"
  }))), /*#__PURE__*/React.createElement("span", {
    className: "m-np__live"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-np__gauge"
  }, /*#__PURE__*/React.createElement(Gauge, {
    pct: session.ctx || 24,
    size: 26
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-np__up"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronUp"
  })));
}

/* ---------------- TERMINAL SHEET ---------------- */
function richTranscript() {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "l-prompt"
  }, "\u203A"), " Analyzing terminal reparenting in ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "AppWorkspace.tsx")), /*#__PURE__*/React.createElement("div", {
    className: "l-dim"
  }, "\xA0\xA0Read SessionTerminal.tsx \xB7 MultiProjectSessionsView.tsx"), /*#__PURE__*/React.createElement("div", {
    className: "l-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-acc"
  }, "\u25CF"), " The board moves ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "[data-terminal-id]"), " \u2014 the React-owned"), /*#__PURE__*/React.createElement("div", {
    className: "l-dim"
  }, "\xA0\xA0container \u2014 while TeamView moves ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "term.element"), ". They disagree."), /*#__PURE__*/React.createElement("div", {
    className: "l-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-acc"
  }, "\u25CF"), " Editing ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "MultiProjectSessionsView.tsx")), /*#__PURE__*/React.createElement("div", {
    className: "l-ok"
  }, "\xA0\xA0+ reparent registry.current.get(session.id)?.term.element"), /*#__PURE__*/React.createElement("div", {
    className: "l-ok"
  }, "\xA0\xA0+ re-run fit.fit() after the move"), /*#__PURE__*/React.createElement("div", {
    className: "l-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-ok"
  }, "\u2713"), " ", /*#__PURE__*/React.createElement("span", {
    className: "l-dim"
  }, "Integration tests \u2014 14 of 18 passing")), /*#__PURE__*/React.createElement("div", {
    className: "l-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-prompt"
  }, "\u203A"), " Reparenting the terminal node, then I'll re-run the fit", /*#__PURE__*/React.createElement("span", {
    className: "m-tcursor2"
  })));
}
function waitTranscript(s) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "l-prompt"
  }, "\u203A"), " Building the model-profile indirection layer"), /*#__PURE__*/React.createElement("div", {
    className: "l-dim"
  }, "\xA0\xA0Read constants/models.ts \xB7 spawn/resolveModel.ts"), /*#__PURE__*/React.createElement("div", {
    className: "l-block"
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-acc"
  }, "\u25CF"), " Two profiles can resolve to the same model. Need a default."), /*#__PURE__*/React.createElement("div", {
    className: "l-block",
    style: {
      color: '#d9aa49'
    }
  }, "\u23F8 ", s.say), /*#__PURE__*/React.createElement("div", {
    className: "l-dim"
  }, "\xA0\xA0Waiting for your reply\u2026", /*#__PURE__*/React.createElement("span", {
    className: "m-tcursor2"
  })));
}
function idleTranscript(s) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "l-prompt"
  }, "\u203A"), " ", s.say), /*#__PURE__*/React.createElement("div", {
    className: "l-block l-dim"
  }, "\u2014 session ended. Resume to attach a live terminal again."));
}
function TerminalSheet({
  session,
  onClose,
  notify
}) {
  const [closing, setClosing] = useStateO(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };
  if (!session) return null;
  const live = session.live;
  const isActive = session.id === 's-fluffy';
  const isWait = session.status === 'wait';
  const branch = isActive ? 'fix/terminal-reparent' : isWait ? 'feat/model-profile' : '—';
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'm-scrim' + (closing ? ' m-scrim--out' : ''),
    onClick: close
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-term' + (closing ? ' m-term--out' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-term__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-term__down",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-term__title"
  }, live && /*#__PURE__*/React.createElement("span", {
    className: "m-tdot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-term__name"
  }, session.name), /*#__PURE__*/React.createElement("span", {
    className: "m-term__model"
  }, "\xB7 ", modelFor(session.kind))), /*#__PURE__*/React.createElement("button", {
    className: "m-term__ib",
    onClick: () => notify('Session menu')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-term__branch"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch"
  }), " ", branch, " ", live && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: '#5aa777'
    }
  }, "\u25CF live")), /*#__PURE__*/React.createElement("div", {
    className: "m-term__body"
  }, isActive ? richTranscript() : isWait ? waitTranscript(session) : idleTranscript(session)), live && /*#__PURE__*/React.createElement("div", {
    className: "m-tstrip"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-tstrip__log",
    onClick: () => notify('Session log')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 13
  }), " Log", /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__live"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__livedot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__livetag"
  }, "LIVE"))), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__div"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__stat m-tstrip__stat--amber"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "\u26A1", ACTIVE.cache, "%"), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "cache")), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, ACTIVE.ctxTokens), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "ctx ", ACTIVE.ctxPct, "%")), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, ACTIVE.turns), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "turns")), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, ACTIVE.tools), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "tools")), /*#__PURE__*/React.createElement("span", {
    className: "m-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, ACTIVE.duration), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "elapsed"))), live ? /*#__PURE__*/React.createElement("div", {
    className: "m-term__input"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-term__field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-tslash"
  }, "\u203A"), " ", isWait ? 'Answer ' + session.name + '…' : 'Reply to ' + session.name + '…'), /*#__PURE__*/React.createElement("button", {
    className: "m-term__send",
    onClick: () => notify('Sent')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowUp",
    sw: 2
  }))) : /*#__PURE__*/React.createElement("div", {
    className: "m-term__input"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-term__field",
    style: {
      justifyContent: 'center',
      color: '#e6e0d3',
      cursor: 'pointer'
    },
    onClick: () => notify('Resuming ' + session.name)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  }), " Resume session"))));
}

/* ---------------- bottom sheet shell ---------------- */
function BottomSheet({
  title,
  onClose,
  children,
  raise
}) {
  const [closing, setClosing] = useStateO(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'm-scrim' + (raise ? ' m-scrim--raise' : '') + (closing ? ' m-scrim--out' : ''),
    onClick: close
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-sheet' + (raise ? ' m-sheet--raise' : '') + (closing ? ' m-sheet--out' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-sheet__grab"
  }), title && /*#__PURE__*/React.createElement("div", {
    className: "m-sheet__title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "m-sheet__scroll"
  }, typeof children === 'function' ? children(close) : children)));
}

/* ---------------- COMMAND SHEET ---------------- */
function CommandSheet({
  onClose,
  notify
}) {
  const opt = (close, icon, img, lbl, sub, kbd, action) => /*#__PURE__*/React.createElement("button", {
    className: "m-cmd__row",
    onClick: () => {
      if (action) {
        action();
      } else {
        notify(lbl);
        close();
      }
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-cmd__ic"
  }, img ? /*#__PURE__*/React.createElement("img", {
    src: img,
    alt: ""
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: icon
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-cmd__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-cmd__lbl"
  }, lbl), /*#__PURE__*/React.createElement("div", {
    className: "m-cmd__sub"
  }, sub)), kbd && /*#__PURE__*/React.createElement("span", {
    className: "m-cmd__kbd"
  }, kbd));
  return /*#__PURE__*/React.createElement(BottomSheet, {
    title: "Conduct",
    onClose: onClose
  }, close => /*#__PURE__*/React.createElement("div", {
    className: "m-cmd"
  }, opt(close, 'plus', null, 'New task', 'Add a task to the queue', 'N', () => MUI.openSheet('createTask')), opt(close, null, M_AGENT_SRC.claude, 'Spawn Claude', 'Worker or orchestrator'), opt(close, null, M_AGENT_SRC.codex, 'Spawn Codex', 'OpenAI agent'), opt(close, null, M_AGENT_SRC.gemini, 'Spawn Gemini', 'Google agent'), opt(close, 'terminal', null, 'New terminal', 'Plain tmux session'), opt(close, 'users', null, 'New team member', 'Add an agent persona', null, () => MUI.openSheet('newMember')), opt(close, 'team', null, 'New team', 'Group workers under a coordinator'), opt(close, 'spell', null, 'Cast spell', 'Inject a contextual prompt')));
}

/* ---------------- PROJECT SWITCHER ---------------- */
function ProjectSheet({
  onClose,
  notify
}) {
  return /*#__PURE__*/React.createElement(BottomSheet, {
    title: "Projects",
    onClose: onClose
  }, close => /*#__PURE__*/React.createElement("div", {
    style: {
      paddingBottom: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-projrow",
    style: {
      borderTop: 'none'
    },
    onClick: () => close()
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-dot m-dot--run"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__name"
  }, "agent-maestro"), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__meta"
  }, "4 sessions"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--pn-brand)',
      display: 'grid',
      placeItems: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    sw: 2
  }))), /*#__PURE__*/React.createElement("button", {
    className: "m-projrow",
    onClick: () => {
      notify('voice-alexa');
      close();
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-dot m-dot--run"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__name"
  }, "voice-alexa"), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__meta"
  }, "2 sessions")), /*#__PURE__*/React.createElement("button", {
    className: "m-projrow",
    onClick: () => {
      notify('All projects');
      close();
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-dot m-dot--idle"
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__name"
  }, "design-tokens"), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__meta"
  }, "idle")), /*#__PURE__*/React.createElement("button", {
    className: "m-projrow",
    onClick: () => {
      notify('New project');
      close();
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--pn-ink-3)',
      display: 'grid',
      placeItems: 'center',
      width: 7
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-projrow__name",
    style: {
      color: 'var(--pn-ink-2)'
    }
  }, "New project"))));
}

/* ---------------- PICKER SHEET (mobile translation of the desktop dropdown) ---------------- */
function PickerSheet({
  config,
  onClose,
  notify
}) {
  const [sel, setSel] = useStateO(config.multi ? config.current || [] : config.current);
  if (!config) return null;
  const isCur = v => config.multi ? sel.includes(v) : sel === v;
  const pick = (close, v) => {
    if (config.multi) {
      config.onToggle && config.onToggle(v);
      setSel(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
    } else {
      config.onSelect && config.onSelect(v);
      close();
    }
  };
  return /*#__PURE__*/React.createElement(BottomSheet, {
    title: config.title,
    onClose: onClose,
    raise: true
  }, close => /*#__PURE__*/React.createElement("div", {
    className: "m-picker"
  }, config.options.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    className: 'm-picker__row' + (isCur(o.value) ? ' m-picker__row--cur' : ''),
    onClick: () => pick(close, o.value)
  }, o.glyph && /*#__PURE__*/React.createElement(Glyph, {
    kind: o.glyph,
    size: 16
  }), o.avatar && /*#__PURE__*/React.createElement(Avatar, {
    a: o.avatar
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-picker__lbl"
  }, o.label), isCur(o.value) && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 15,
    sw: 2,
    className: "m-picker__chk"
  }))), config.multi && /*#__PURE__*/React.createElement("button", {
    className: "m-picker__done",
    onClick: close
  }, "Done")));
}

/* ---------------- FORM SHEET shell (header / scroll body / sticky footer) ---------------- */
function FormSheet({
  onClose,
  children
}) {
  const [closing, setClosing] = useStateO(false);
  const close = () => {
    setClosing(true);
    setTimeout(onClose, 300);
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'm-scrim' + (closing ? ' m-scrim--out' : ''),
    onClick: close
  }), /*#__PURE__*/React.createElement("div", {
    className: 'm-formsheet' + (closing ? ' m-sheet--out' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-sheet__grab"
  }), typeof children === 'function' ? children(close) : children));
}
function FTabs({
  tabs,
  tab,
  setTab
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "m-ftabs"
  }, tabs.map(([id, label, icon, n]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'm-ftab' + (tab === id ? ' m-ftab--active' : ''),
    onClick: () => setTab(id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 14
  }), " ", label, n != null && /*#__PURE__*/React.createElement("span", {
    className: "m-ftab__n"
  }, n))));
}

/* settings-list primitives (iOS-style grouped rows) */
function SetRow({
  icon,
  label,
  children,
  onTap,
  last
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'm-setrow' + (last ? ' m-setrow--last' : '') + (onTap ? '' : ' m-setrow--static'),
    onClick: onTap,
    disabled: !onTap
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__lbl"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__val"
  }, children), onTap && /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 15,
    className: "m-setrow__chev"
  }));
}
function SetSwitch({
  icon,
  label,
  desc,
  on,
  onToggle,
  last
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'm-setrow' + (last ? ' m-setrow--last' : ''),
    onClick: onToggle
  }, icon && /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 16
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__txt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__lbl"
  }, label), desc && /*#__PURE__*/React.createElement("span", {
    className: "m-setrow__desc"
  }, desc)), /*#__PURE__*/React.createElement("span", {
    className: 'm-switch m-switch--sm' + (on ? ' m-switch--on' : '')
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-switch__knob"
  })));
}

/* ---------------- CREATE TASK ---------------- */
function CreateTaskSheet({
  onClose,
  notify
}) {
  const [priority, setPriority] = useStateO('high');
  const [worktree, setWorktree] = useStateO(true);
  const [danger, setDanger] = useStateO(false);
  const [model, setModel] = useStateO('opus-4.8');
  const [assignees, setAssignees] = useStateO([window.MEMBERS.rhea]);
  const pdot = {
    high: 'var(--pn-block)',
    medium: 'var(--pn-wait)',
    low: 'var(--pn-idle)'
  };
  const plabel = p => p === 'medium' ? 'Medium' : p[0].toUpperCase() + p.slice(1);
  const toggleAssignee = name => setAssignees(prev => {
    const m = window.ALL_MEMBERS.find(x => x.name === name);
    return prev.some(x => x.name === name) ? prev.filter(x => x.name !== name) : [...prev, m];
  });
  return /*#__PURE__*/React.createElement(FormSheet, {
    onClose: onClose
  }, close => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "m-fhead"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-fcrumb"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "listChecks",
    size: 12
  }), " ", /*#__PURE__*/React.createElement("b", null, "agent-maestro"), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 10
  }), " New task"), /*#__PURE__*/React.createElement("button", {
    className: "m-fclose",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  })), /*#__PURE__*/React.createElement("input", {
    className: "m-ftitle",
    placeholder: "Untitled task",
    defaultValue: "Fix terminal reparenting crash on board close"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-fbody m-fbody--text"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "m-textarea m-textarea--full",
    placeholder: "Describe the task \u2014 type @ to reference a file, # to pull in a skill.",
    defaultValue: "The board reparents [data-terminal-id]; TeamView moves term.element. Make the board reparent via the registry ref instead, then re-run fit.fit().\n\nKeep the diff surgical — touch only the reparent path and re-run fit.fit() once after the move."
  }), /*#__PURE__*/React.createElement("div", {
    className: "m-chiprow m-chiprow--text"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-mchip",
    onClick: () => notify('Attach')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "paperclip",
    size: 13
  }), " Attach"), /*#__PURE__*/React.createElement("button", {
    className: "m-mchip",
    onClick: () => notify('Reference')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "at",
    size: 13
  }), " Reference"), /*#__PURE__*/React.createElement("button", {
    className: "m-mchip",
    onClick: () => notify('Skill')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "hash",
    size: 13
  }), " Skill"), /*#__PURE__*/React.createElement("span", {
    className: "m-mchip m-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), " terminal-rendering-analysis.md ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Configuration"), /*#__PURE__*/React.createElement("div", {
    className: "m-setlist"
  }, /*#__PURE__*/React.createElement(SetRow, {
    icon: "sliders",
    label: "Priority",
    onTap: () => MUI.openPicker({
      title: 'Priority',
      current: priority,
      options: window.PRIORITIES.map(p => ({
        value: p,
        label: plabel(p)
      })),
      onSelect: setPriority
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-pdot",
    style: {
      background: pdot[priority]
    }
  }), plabel(priority))), /*#__PURE__*/React.createElement(SetRow, {
    icon: "calendar",
    label: "Due date",
    onTap: () => notify('Pick a date')
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, "Jun 12, 2026")), /*#__PURE__*/React.createElement(SetRow, {
    icon: "users",
    label: "Assignees",
    onTap: () => MUI.openPicker({
      title: 'Assignees',
      multi: true,
      current: assignees.map(a => a.name),
      options: window.ALL_MEMBERS.map(m => ({
        value: m.name,
        label: m.name,
        avatar: m
      })),
      onToggle: toggleAssignee
    })
  }, assignees.length ? /*#__PURE__*/React.createElement(Avatars, {
    list: assignees
  }) : /*#__PURE__*/React.createElement("span", {
    className: "m-setval m-setval--muted"
  }, "Unassigned")), /*#__PURE__*/React.createElement(SetRow, {
    icon: "bot",
    label: "Agent & model",
    last: true,
    onTap: () => MUI.openPicker({
      title: 'Model',
      current: model,
      options: window.MODELS.filter(m => m !== 'default').map(m => ({
        value: m,
        label: m
      })),
      onSelect: setModel
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, /*#__PURE__*/React.createElement("img", {
    className: "m-setval__agent",
    src: M_AGENT_SRC.claude,
    alt: ""
  }), model)))), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Execution"), /*#__PURE__*/React.createElement("div", {
    className: "m-setlist"
  }, /*#__PURE__*/React.createElement(SetSwitch, {
    icon: "gitBranch",
    label: "Git worktree",
    desc: "Run on an isolated branch",
    on: worktree,
    onToggle: () => setWorktree(v => !v)
  }), /*#__PURE__*/React.createElement(SetSwitch, {
    icon: "shield",
    label: "YOLO permissions",
    desc: "Auto-approve every action \u2014 no prompts",
    on: danger,
    onToggle: () => setDanger(v => !v),
    last: true
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Skills ", /*#__PURE__*/React.createElement("span", {
    className: "m-setgroup__n"
  }, "2")), /*#__PURE__*/React.createElement("div", {
    className: "m-chiprow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-mchip m-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), " code-review ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-mchip m-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), " write-tests ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  })), /*#__PURE__*/React.createElement("button", {
    className: "m-mchip",
    onClick: () => notify('Add skill')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12
  }), " Add skill")))), /*#__PURE__*/React.createElement("div", {
    className: "m-ffoot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-ffoot__btns"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-btn",
    onClick: close
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "m-btn",
    onClick: () => {
      notify('Task created');
      close();
    }
  }, "Create"), /*#__PURE__*/React.createElement("button", {
    className: "m-btn m-btn--primary",
    style: {
      flex: '0 0 auto'
    },
    onClick: () => {
      notify('Created & started');
      close();
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 14
  }), " Start")))));
}

/* ---------------- NEW TEAM MEMBER ---------------- */
function TeamMemberSheet({
  member,
  onClose,
  notify
}) {
  const MODE_LABEL = {
    worker: 'Worker',
    orch: 'Orchestrator',
    cowork: 'Co-Worker',
    cocoord: 'Co-Coordinator'
  };
  const PERM_LABEL = {
    acceptEdits: 'Accept edits',
    interactive: 'Interactive',
    readOnly: 'Read only',
    bypass: 'Bypass — auto-approve'
  };
  const TOOL_LABEL = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini'
  };
  const [mode, setMode] = useStateO(member && member.mode === 'Coordinator' ? 'orch' : 'worker');
  const [global, setGlobal] = useStateO((member && member.scope) === 'global');
  const [tool, setTool] = useStateO(member && member.tool || 'claude');
  const [model, setModel] = useStateO(member && member.model || 'opus-4.8');
  const [perms, setPerms] = useStateO(member && member.perms || 'acceptEdits');
  const [instr, setInstr] = useStateO(member && member.instrument || 'violin');
  const init = member && member.caps || {
    spawn: false,
    edit: true,
    rTask: true,
    rSession: true
  };
  const [caps, setCaps] = useStateO(init);
  const toggleCap = k => setCaps(c => ({
    ...c,
    [k]: !c[k]
  }));
  const editing = !!member;
  return /*#__PURE__*/React.createElement(FormSheet, {
    onClose: onClose
  }, close => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "m-fhead"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-fcrumb"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 12
  }), " ", /*#__PURE__*/React.createElement("b", null, "agent-maestro"), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 10
  }), " ", editing ? 'Edit member' : 'New team member'), /*#__PURE__*/React.createElement("button", {
    className: "m-fclose",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-fhead__id"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-avatar-edit",
    style: member ? {
      color: member.color,
      background: member.bg
    } : null
  }, member ? member.initial : 'R'), /*#__PURE__*/React.createElement("input", {
    className: "m-ftitle",
    placeholder: "Name \u2014 e.g. Frontend Dev",
    defaultValue: member ? member.name : ''
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-fbody m-fbody--text"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Role ", /*#__PURE__*/React.createElement("span", {
    className: "m-req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "m-input",
    placeholder: "e.g. test runner",
    defaultValue: member ? member.say : 'Reparent strike lead'
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-fld m-fld--grow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Identity"), /*#__PURE__*/React.createElement("textarea", {
    className: "m-textarea m-textarea--full m-textarea--mono",
    placeholder: "Describe this member's persona, expertise, and how they approach tasks\u2026",
    defaultValue: member ? member.identity : "You lead the terminal-reparenting fix. You read the rendering pipeline carefully, prefer the registry ref over DOM moves, and always re-run fit.fit() after a reparent. Hand off tests to @Ada."
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Configuration"), /*#__PURE__*/React.createElement("div", {
    className: "m-setlist"
  }, /*#__PURE__*/React.createElement(SetRow, {
    icon: "users",
    label: "Mode",
    onTap: () => MUI.openPicker({
      title: 'Mode',
      current: mode,
      options: Object.keys(MODE_LABEL).map(k => ({
        value: k,
        label: MODE_LABEL[k]
      })),
      onSelect: setMode
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, MODE_LABEL[mode])), /*#__PURE__*/React.createElement(SetRow, {
    icon: "bot",
    label: "Agent",
    onTap: () => MUI.openPicker({
      title: 'Agent',
      current: tool,
      options: Object.keys(TOOL_LABEL).map(k => ({
        value: k,
        label: TOOL_LABEL[k]
      })),
      onSelect: setTool
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, /*#__PURE__*/React.createElement("img", {
    className: "m-setval__agent",
    src: M_AGENT_SRC[tool],
    alt: ""
  }), TOOL_LABEL[tool])), /*#__PURE__*/React.createElement(SetRow, {
    icon: "layers",
    label: "Model",
    onTap: () => MUI.openPicker({
      title: 'Model',
      current: model,
      options: window.MODELS.filter(m => m !== 'default').map(m => ({
        value: m,
        label: m
      })),
      onSelect: setModel
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, model)), /*#__PURE__*/React.createElement(SetRow, {
    icon: "shield",
    label: "Permissions",
    last: true,
    onTap: () => MUI.openPicker({
      title: 'Permissions',
      current: perms,
      options: Object.keys(PERM_LABEL).map(k => ({
        value: k,
        label: PERM_LABEL[k]
      })),
      onSelect: setPerms
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval"
  }, PERM_LABEL[perms])))), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Capabilities"), /*#__PURE__*/React.createElement("div", {
    className: "m-setlist"
  }, /*#__PURE__*/React.createElement(SetSwitch, {
    label: "Spawn sessions",
    desc: "Can create new agent sessions",
    on: caps.spawn,
    onToggle: () => toggleCap('spawn')
  }), /*#__PURE__*/React.createElement(SetSwitch, {
    label: "Edit tasks",
    desc: "Create, edit and delete tasks",
    on: caps.edit,
    onToggle: () => toggleCap('edit')
  }), /*#__PURE__*/React.createElement(SetSwitch, {
    label: "Report task-level",
    desc: "Report progress on individual tasks",
    on: caps.rTask,
    onToggle: () => toggleCap('rTask')
  }), /*#__PURE__*/React.createElement(SetSwitch, {
    label: "Report session-level",
    desc: "Report session-wide progress",
    on: caps.rSession,
    onToggle: () => toggleCap('rSession'),
    last: true
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Scope & sound"), /*#__PURE__*/React.createElement("div", {
    className: "m-setlist"
  }, /*#__PURE__*/React.createElement(SetSwitch, {
    icon: "graph",
    label: "Global scope",
    desc: "Available across every project",
    on: global,
    onToggle: () => setGlobal(v => !v)
  }), /*#__PURE__*/React.createElement(SetRow, {
    icon: "music",
    label: "Instrument",
    last: true,
    onTap: () => MUI.openPicker({
      title: 'Instrument',
      current: instr,
      options: ['piano', 'guitar', 'violin', 'trumpet', 'drums'].map(i => ({
        value: i,
        label: i[0].toUpperCase() + i.slice(1)
      })),
      onSelect: setInstr
    })
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-setval",
    style: {
      textTransform: 'capitalize'
    }
  }, instr)))), /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-setgroup__lbl"
  }, "Skills"), /*#__PURE__*/React.createElement("div", {
    className: "m-chiprow"
  }, (member && member.skills || ['debugging']).map(sk => /*#__PURE__*/React.createElement("span", {
    key: sk,
    className: "m-mchip m-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), " ", sk, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  }))), /*#__PURE__*/React.createElement("button", {
    className: "m-mchip",
    onClick: () => notify('Add skill')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12
  }), " Add skill")))), /*#__PURE__*/React.createElement("div", {
    className: "m-ffoot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-ffoot__btns"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-btn",
    onClick: close
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "m-btn m-btn--primary",
    onClick: () => {
      notify(editing ? 'Member saved' : 'Member created');
      close();
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: editing ? 'check' : 'plus',
    size: 14
  }), " ", editing ? 'Save changes' : 'Create member')))));
}

/* ---------------- RUN TASK — mobile-first launch configuration panel ---------------- */
function RunConfigSheet({
  task,
  onClose,
  notify
}) {
  const t = task || {};
  const [tool, setTool] = useStateO(t.tool || 'claude');
  const [model, setModel] = useStateO(t.model && t.model !== 'default' ? t.model : 'opus-4.8');
  const [perms, setPerms] = useStateO('accept');
  const [worktree, setWorktree] = useStateO(!!t.worktree);
  const [assignees] = useStateO(t.assignees || []);
  const PERMS = [['safe', 'Safe'], ['accept', 'Accept edits'], ['yolo', 'YOLO']];
  return /*#__PURE__*/React.createElement(FormSheet, {
    onClose: onClose
  }, close => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "m-fhead"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-fcrumb"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 12
  }), " ", /*#__PURE__*/React.createElement("b", null, "agent-maestro"), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 10
  }), " Run task"), /*#__PURE__*/React.createElement("button", {
    className: "m-fclose",
    onClick: close
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-runtitle"
  }, t.title || 'Untitled task')), /*#__PURE__*/React.createElement("div", {
    className: "m-fbody"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Agent"), /*#__PURE__*/React.createElement("div", {
    className: "m-toolsel"
  }, [['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([k, label]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: 'm-tool' + (tool === k ? ' m-tool--active' : ''),
    onClick: () => setTool(k)
  }, /*#__PURE__*/React.createElement("img", {
    src: M_AGENT_SRC[k],
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-tool__name"
  }, label))))), /*#__PURE__*/React.createElement("div", {
    className: "m-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Model"), /*#__PURE__*/React.createElement("select", {
    className: "m-select",
    value: model,
    onChange: e => setModel(e.target.value)
  }, window.MODELS.filter(m => m !== 'default').map(m => /*#__PURE__*/React.createElement("option", {
    key: m
  }, m)))), /*#__PURE__*/React.createElement("div", {
    className: "m-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Permissions"), /*#__PURE__*/React.createElement("div", {
    className: "m-seg"
  }, PERMS.map(([k, label]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: 'm-seg-i' + (perms === k ? ' m-seg-i--active' : ''),
    onClick: () => setPerms(k)
  }, label))), perms === 'yolo' && /*#__PURE__*/React.createElement("span", {
    className: "m-runwarn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 12
  }), " Auto-approves every action \u2014 no prompts.")), /*#__PURE__*/React.createElement("div", {
    className: "m-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Isolation"), /*#__PURE__*/React.createElement("button", {
    className: 'm-toggle m-toggle--lg' + (worktree ? ' m-toggle--wt' : ''),
    onClick: () => setWorktree(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 14
  }), " ", worktree ? 'Git worktree — isolated branch' : 'In-place — current branch')), /*#__PURE__*/React.createElement("div", {
    className: "m-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-flabel"
  }, "Assign to"), /*#__PURE__*/React.createElement("div", {
    className: "m-chiprow"
  }, assignees.length > 0 ? assignees.map(a => /*#__PURE__*/React.createElement("span", {
    key: a.name,
    className: "m-mchip m-mchip--ref"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-av",
    style: {
      width: 18,
      height: 18,
      fontSize: 9,
      color: a.color,
      background: a.bg
    }
  }, a.initial), " ", a.name)) : /*#__PURE__*/React.createElement("span", {
    className: "m-fhint",
    style: {
      padding: 0
    }
  }, "Unassigned \u2014 runs as a fresh session"), /*#__PURE__*/React.createElement("button", {
    className: "m-mchip",
    onClick: () => notify('Assign')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12
  }), " Add"))), /*#__PURE__*/React.createElement("div", {
    className: "m-runsummary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "terminal",
    size: 13
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-runsummary__t"
  }, "Spawns a ", tool, " session on ", /*#__PURE__*/React.createElement("b", null, model), ", ", perms === 'safe' ? 'asking before edits' : perms === 'yolo' ? 'auto-approving everything' : 'accepting edits', ", ", worktree ? 'in an isolated worktree' : 'on the current branch', "."))), /*#__PURE__*/React.createElement("div", {
    className: "m-ffoot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-ffoot__btns"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-btn",
    onClick: close
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "m-btn m-btn--primary",
    style: {
      flex: '0 0 auto'
    },
    onClick: () => {
      notify('Running ' + (t.title || 'task'));
      close();
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 14
  }), " Run task")))));
}
Object.assign(window, {
  NowPlaying,
  TerminalSheet,
  CommandSheet,
  ProjectSheet,
  BottomSheet,
  PickerSheet,
  FormSheet,
  CreateTaskSheet,
  TeamMemberSheet,
  RunConfigSheet
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-overlays.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-screens.jsx
try { (() => {
/* m-screens.jsx — the four primary screens + their rows.
   Reads primitives + tiles + data from window (separate babel scopes). */
const {
  useState
} = React;

/* ---------------- SESSIONS (home) ---------------- */
function SessionsScreen({
  onOpen,
  onSpawn
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-title"
  }, /*#__PURE__*/React.createElement("h1", null, "Sessions"), /*#__PURE__*/React.createElement("div", {
    className: "m-title__sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-dot m-dot--run"
  }), " 4 running ", /*#__PURE__*/React.createElement("b", null, "\xB7"), " 1 needs input ", /*#__PURE__*/React.createElement("b", null, "\xB7"), " 2 idle")), /*#__PURE__*/React.createElement("div", {
    className: "m-spawn"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-chip",
    onClick: () => onSpawn('Terminal')
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-plus"
  }, "\uFF0B"), " Terminal"), /*#__PURE__*/React.createElement("button", {
    className: "m-chip",
    onClick: () => onSpawn('Claude')
  }, /*#__PURE__*/React.createElement("img", {
    src: M_AGENT_SRC.claude,
    alt: ""
  }), " Claude"), /*#__PURE__*/React.createElement("button", {
    className: "m-chip",
    onClick: () => onSpawn('Codex')
  }, /*#__PURE__*/React.createElement("img", {
    src: M_AGENT_SRC.codex,
    alt: ""
  }), " Codex"), /*#__PURE__*/React.createElement("button", {
    className: "m-chip",
    onClick: () => onSpawn('Gemini')
  }, /*#__PURE__*/React.createElement("img", {
    src: M_AGENT_SRC.gemini,
    alt: ""
  }), " Gemini")), /*#__PURE__*/React.createElement("div", {
    className: "m-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-sec__lbl"
  }, "Running ", /*#__PURE__*/React.createElement("span", {
    className: "m-count"
  }, "\xB7 4")), /*#__PURE__*/React.createElement("span", {
    className: "m-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-team"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-team__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-team__dot",
    style: {
      background: TEAM.dot
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-team__name"
  }, TEAM.name), /*#__PURE__*/React.createElement("span", {
    className: "m-team__count"
  }, TEAM.count, " sessions")), /*#__PURE__*/React.createElement(MSessionTile, {
    s: TEAM.coord
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-sec__lbl"
  }, "Idle ", /*#__PURE__*/React.createElement("span", {
    className: "m-count"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "m-sec__line"
  })), SESSIONS_IDLE.map(s => /*#__PURE__*/React.createElement(MSessionTile, {
    key: s.id,
    s: s
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-bottompad"
  }));
}

/* ---------------- TASKS ---------------- */
function TasksScreen({
  onNewTask
}) {
  const [tab, setTab] = useState('current');
  const [filter, setFilter] = useState('All');
  const sections = tab === 'done' ? [['Completed', TASKS_DONE.length, TASKS_DONE]] : tab === 'pinned' ? [['Pinned', 1, TASKS_IN_PROGRESS.filter(t => t.pinned)]] : [['In progress', TASKS_IN_PROGRESS.length, TASKS_IN_PROGRESS], ['Up next', TASKS_UP_NEXT.length, TASKS_UP_NEXT]];
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-title"
  }, /*#__PURE__*/React.createElement("h1", null, "Tasks"), /*#__PURE__*/React.createElement("div", {
    className: "m-title__sub"
  }, "agent-maestro ", /*#__PURE__*/React.createElement("b", null, "\xB7"), " 6 open ", /*#__PURE__*/React.createElement("b", null, "\xB7"), " 8 done")), /*#__PURE__*/React.createElement("div", {
    className: "m-actionbar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-btn m-btn--primary",
    onClick: onNewTask
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }), " New task"), /*#__PURE__*/React.createElement("button", {
    className: "m-btn",
    "aria-label": "Sort"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 17
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-subtabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'm-subtab' + (tab === 'current' ? ' m-subtab--active' : ''),
    onClick: () => setTab('current')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "listChecks"
  }), " 6"), /*#__PURE__*/React.createElement("button", {
    className: 'm-subtab' + (tab === 'pinned' ? ' m-subtab--active' : ''),
    onClick: () => setTab('pinned')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pin"
  }), " 1"), /*#__PURE__*/React.createElement("button", {
    className: 'm-subtab' + (tab === 'done' ? ' m-subtab--active' : ''),
    onClick: () => setTab('done')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check"
  }), " 8"), /*#__PURE__*/React.createElement("button", {
    className: "m-subtab",
    "aria-label": "Archived"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "archive"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "m-filters"
  }, ['All', 'High', 'Mine'].map(f => /*#__PURE__*/React.createElement("button", {
    key: f,
    className: 'm-filter' + (filter === f ? ' m-filter--active' : ''),
    onClick: () => setFilter(f)
  }, f))), sections.map(([label, count, list]) => /*#__PURE__*/React.createElement(React.Fragment, {
    key: label
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-sec__lbl"
  }, label, " ", /*#__PURE__*/React.createElement("span", {
    className: "m-count"
  }, "\xB7 ", count)), /*#__PURE__*/React.createElement("span", {
    className: "m-sec__line"
  })), list.map(t => /*#__PURE__*/React.createElement(MTaskTile, {
    key: t.id,
    t: t
  })))), /*#__PURE__*/React.createElement("div", {
    className: "m-bottompad"
  }));
}

/* ---------------- MEMBERS ---------------- */
function MembersScreen({
  notify,
  onNewMember,
  onEditMember
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-title"
  }, /*#__PURE__*/React.createElement("h1", null, "Members"), /*#__PURE__*/React.createElement("div", {
    className: "m-title__sub"
  }, "4 members ", /*#__PURE__*/React.createElement("b", null, "\xB7"), " 2 active")), /*#__PURE__*/React.createElement("div", {
    className: "m-actionbar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-btn m-btn--primary",
    onClick: onNewMember
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 16
  }), " New member"), /*#__PURE__*/React.createElement("button", {
    className: "m-btn",
    "aria-label": "New team",
    onClick: () => notify('New team')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "team",
    size: 17
  }))), MEMBER_LIST.map(m => /*#__PURE__*/React.createElement("button", {
    key: m.name,
    className: "m-mcard",
    onClick: () => onEditMember && onEditMember(m)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-mav",
    style: {
      color: m.color,
      background: m.bg
    }
  }, m.initial), /*#__PURE__*/React.createElement("div", {
    className: "m-mcard__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-mcard__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-mcard__name"
  }, m.name), /*#__PURE__*/React.createElement("span", {
    className: 'm-mcard__role' + (m.role === 'Coordinator' ? ' m-mcard__role--coord' : '')
  }, m.role)), /*#__PURE__*/React.createElement("div", {
    className: "m-mcard__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'm-dot m-dot--' + (m.status === 'working' ? 'run' : 'idle') + (m.status === 'working' ? ' m-dot--live' : '')
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-mcard__model"
  }, m.model), /*#__PURE__*/React.createElement("span", {
    className: "m-mcard__model"
  }, "\xB7 ", m.sessions, " live \xB7 ", m.tasks, " tasks")), /*#__PURE__*/React.createElement("div", {
    className: "m-mcard__say"
  }, m.say)), /*#__PURE__*/React.createElement("span", {
    className: "m-mcard__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "m-bottompad"
  }));
}

/* ---------------- MORE ---------------- */
function MoreScreen({
  dark,
  onToggleDark,
  notify
}) {
  const mdCount = window.DOCS.filter(d => !window.isDiagramDoc(d)).length;
  const dgCount = window.DOCS.filter(d => window.isDiagramDoc(d)).length;
  const Row = ({
    icon,
    label,
    n,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    className: "m-lrow",
    onClick: onClick || (() => notify(label))
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-lrow__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-lrow__lbl"
  }, label), n != null && /*#__PURE__*/React.createElement("span", {
    className: "m-lrow__n"
  }, n), /*#__PURE__*/React.createElement("span", {
    className: "m-lrow__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })));
  return /*#__PURE__*/React.createElement("div", {
    className: "m-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-title"
  }, /*#__PURE__*/React.createElement("h1", null, "More")), /*#__PURE__*/React.createElement("div", {
    className: "m-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-sec__lbl"
  }, "Workspace"), /*#__PURE__*/React.createElement("span", {
    className: "m-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-group"
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "team",
    label: "Teams",
    n: "3"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "sparkles",
    label: "Skills & spells",
    n: "12"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "doc",
    label: "Docs",
    n: mdCount,
    onClick: () => MUI.openDocs('markdown')
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "pen",
    label: "Diagrams",
    n: dgCount,
    onClick: () => MUI.openDocs('diagram')
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "inbox",
    label: "Lists",
    n: "2"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "folder",
    label: "Files"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-sec__lbl"
  }, "Session"), /*#__PURE__*/React.createElement("span", {
    className: "m-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-group"
  }, /*#__PURE__*/React.createElement(Row, {
    icon: "layers",
    label: "Resources"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "graph",
    label: "Whiteboard",
    onClick: () => MUI.openDocs('diagram')
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "film",
    label: "Recordings",
    n: "5"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-sec__lbl"
  }, "App"), /*#__PURE__*/React.createElement("span", {
    className: "m-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-group"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-lrow",
    onClick: onToggleDark
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-lrow__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: dark ? 'sun' : 'moon'
  })), /*#__PURE__*/React.createElement("span", {
    className: "m-lrow__lbl"
  }, "Dark mode"), /*#__PURE__*/React.createElement("span", {
    className: 'm-switch' + (dark ? ' m-switch--on' : '')
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-switch__knob"
  }))), /*#__PURE__*/React.createElement(Row, {
    icon: "bell",
    label: "Notifications"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "settings",
    label: "Settings"
  }), /*#__PURE__*/React.createElement(Row, {
    icon: "info",
    label: "About Maestro"
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-bottompad"
  }));
}
Object.assign(window, {
  SessionsScreen,
  TasksScreen,
  MembersScreen,
  MoreScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-screens.jsx", error: String((e && e.message) || e) }); }

// mobile-app/m-tiles.jsx
try { (() => {
/* m-tiles.jsx — mobile Task & Session tiles, translated from the desktop kit.
   Carries the full desktop depth: multi-level trees (expand/collapse), a tap-to-
   open detail panel, inline editors (status / priority / assignee / model / mode)
   that open as bottom-sheet pickers via window.MUI, selection + done state, and
   linked-task / doc chips. Exports MTaskNode + MSessionNode to window. */
const {
  useState: useStateT
} = React;
const M_TASK_LABEL = window.TASK_STATUS_LABEL;
const M_SESS_LABEL = window.SESS_STATUS_LABEL;

/* ---- inline editable badge → opens an app-level picker sheet ---- */
function MBadge({
  kind,
  label,
  glyph,
  avatars,
  model,
  caret = true,
  onTap,
  tone
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'm-badge' + (tone ? ' m-badge--' + tone : '') + (model ? ' m-badge--model' : ''),
    onClick: e => {
      e.stopPropagation();
      onTap && onTap();
    }
  }, glyph && /*#__PURE__*/React.createElement(Glyph, {
    kind: glyph,
    size: 13
  }), avatars && avatars.length > 0 && /*#__PURE__*/React.createElement(Avatars, {
    list: avatars
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-badge__t"
  }, label), caret && /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 11,
    className: "m-badge__caret"
  }));
}

/* picker option builders */
const statusOpts = () => window.TASK_STATUSES.map(s => ({
  value: s,
  label: M_TASK_LABEL[s],
  glyph: s
}));
const prioOpts = () => window.PRIORITIES.map(p => ({
  value: p,
  label: p[0].toUpperCase() + p.slice(1)
}));
const modelOpts = () => window.MODELS.map(m => ({
  value: m,
  label: m
}));
const modeOpts = () => window.MODES.map(m => ({
  value: m,
  label: m
}));
const memberOpts = () => window.ALL_MEMBERS.map(m => ({
  value: m.name,
  label: m.name,
  avatar: m
}));

/* =========================== TASK TILE =========================== */
function MTaskTile({
  t,
  depth = 0
}) {
  const [status, setStatus] = useStateT(t.status);
  const [priority, setPriority] = useStateT(t.priority || 'medium');
  const [assignees, setAssignees] = useStateT(t.assignees || []);
  const [model, setModel] = useStateT(t.model || 'default');
  const [danger, setDanger] = useStateT(!!t.danger);
  const [worktree, setWorktree] = useStateT(!!t.worktree);
  const [collapsed, setCollapsed] = useStateT(depth > 0);
  const [open, setOpen] = useStateT(false);
  const hasKids = t.subs && t.subs.length > 0;
  const done = status === 'completed';
  const prioCls = priority === 'high' ? 'high' : priority === 'medium' ? 'med' : 'low';
  const runCfg = () => ({
    title: t.title,
    model,
    danger,
    worktree,
    assignees,
    tool: t.tool
  });
  const toggleAssignee = name => setAssignees(prev => {
    const m = window.ALL_MEMBERS.find(x => x.name === name);
    return prev.some(x => x.name === name) ? prev.filter(x => x.name !== name) : [...prev, m];
  });
  return /*#__PURE__*/React.createElement("div", {
    className: 'm-tt' + (t.active ? ' m-tt--active' : '') + (done ? ' m-tt--done' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-tt__main"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'm-tt__arrow' + (hasKids ? '' : ' m-tt__arrow--empty') + (hasKids && !collapsed ? ' m-tt__arrow--open' : ''),
    onClick: () => hasKids && setCollapsed(c => !c),
    "aria-label": "Toggle subtasks"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })), hasKids && /*#__PURE__*/React.createElement("span", {
    className: "m-tt__count"
  }, t.subs.length), /*#__PURE__*/React.createElement("button", {
    className: "m-tt__glyph",
    onClick: () => setStatus(s => s === 'completed' ? 'todo' : 'completed'),
    "aria-label": "Toggle complete"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: done ? 'completed' : status,
    size: 18
  })), /*#__PURE__*/React.createElement("button", {
    className: "m-tt__titlebtn",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-tt__title"
  }, t.pinned && /*#__PURE__*/React.createElement(Icon, {
    name: "pin",
    size: 12,
    className: "m-pin"
  }), t.title), /*#__PURE__*/React.createElement("span", {
    className: "m-tt__sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-tag-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'm-tag m-tag--' + prioCls
  }, priority === 'medium' ? 'med' : priority)), /*#__PURE__*/React.createElement("span", {
    className: "m-tt__id"
  }, "#", t.id, hasKids ? ` · ${t.subs.length}` : ''), assignees.length > 0 && /*#__PURE__*/React.createElement(Avatars, {
    list: assignees
  }), t.docs > 0 && /*#__PURE__*/React.createElement("span", {
    className: "m-mini"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), t.docs))), /*#__PURE__*/React.createElement("span", {
    className: "m-tt__trail"
  }, t.activity && /*#__PURE__*/React.createElement(Glyph, {
    kind: t.activity,
    size: 15
  }), /*#__PURE__*/React.createElement("button", {
    className: "m-tt__run",
    onClick: e => {
      e.stopPropagation();
      MUI.openRun(runCfg());
    },
    "aria-label": "Run task"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 13
  })), /*#__PURE__*/React.createElement("span", {
    className: 'm-tt__exp' + (open ? ' m-tt__exp--open' : '')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 15
  })))), open && /*#__PURE__*/React.createElement("div", {
    className: "m-tt__meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-metarow"
  }, /*#__PURE__*/React.createElement(MBadge, {
    glyph: status,
    label: M_TASK_LABEL[status],
    tone: 'status-' + status,
    onTap: () => MUI.openPicker({
      title: 'Status',
      current: status,
      options: statusOpts(),
      onSelect: setStatus
    })
  }), /*#__PURE__*/React.createElement(MBadge, {
    label: priority.toUpperCase(),
    tone: priority === 'high' ? 'prio-high' : null,
    onTap: () => MUI.openPicker({
      title: 'Priority',
      current: priority,
      options: prioOpts(),
      onSelect: setPriority
    })
  }), /*#__PURE__*/React.createElement(MBadge, {
    avatars: assignees,
    label: assignees.length ? assignees.length > 1 ? assignees.length + ' members' : assignees[0].name : 'Assign',
    onTap: () => MUI.openPicker({
      title: 'Assignees',
      current: assignees.map(a => a.name),
      multi: true,
      options: memberOpts(),
      onToggle: toggleAssignee
    })
  }), /*#__PURE__*/React.createElement(MBadge, {
    model: true,
    label: model,
    tone: model !== (t.model || 'default') ? 'override' : null,
    onTap: () => MUI.openPicker({
      title: 'Model',
      current: model,
      options: modelOpts(),
      onSelect: setModel
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "m-metarow"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'm-toggle' + (danger ? ' m-toggle--danger' : ''),
    onClick: () => setDanger(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 13
  }), " ", danger ? 'YOLO' : 'Safe'), /*#__PURE__*/React.createElement("button", {
    className: 'm-toggle' + (worktree ? ' m-toggle--wt' : ''),
    onClick: () => setWorktree(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 13
  }), " ", worktree ? 'worktree' : 'in-place'), t.due && /*#__PURE__*/React.createElement("span", {
    className: "m-mini"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 12
  }), " ", t.due), /*#__PURE__*/React.createElement("span", {
    className: "m-metatime"
  }, "updated ", t.updated || 'just now')), t.sessions && /*#__PURE__*/React.createElement("div", {
    className: "m-metarow"
  }, t.sessions.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: 'm-actchip m-actchip--' + s.kind
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: s.kind === 'needsInput' ? 'needsInput' : s.kind,
    size: 11
  }), " ", s.label))), (t.docList || t.diagrams) && /*#__PURE__*/React.createElement("div", {
    className: "m-metarow"
  }, t.docList && t.docList.map((d, i) => /*#__PURE__*/React.createElement("button", {
    key: 'd' + i,
    className: "m-docpill",
    onClick: () => MUI.openDoc(d)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__ic"
  }, d.md ? 'M↓' : '{}'), /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__t"
  }, d.name))), t.diagrams && t.diagrams.map((d, i) => /*#__PURE__*/React.createElement("button", {
    key: 'g' + i,
    className: "m-docpill m-docpill--dg",
    onClick: () => MUI.openDoc(d)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__ic"
  }, "\u2B21"), /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__t"
  }, d.name))), /*#__PURE__*/React.createElement("button", {
    className: "m-docpill m-docpill--add",
    onClick: () => MUI.notify('Attach doc')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " Doc")), /*#__PURE__*/React.createElement("div", {
    className: "m-metarow"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-metabtn m-metabtn--run",
    onClick: () => MUI.openRun(runCfg())
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 13
  }), " Run task"), /*#__PURE__*/React.createElement("button", {
    className: "m-metabtn",
    onClick: () => MUI.notify('Add subtask')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13
  }), " Subtask"))), hasKids && !collapsed && /*#__PURE__*/React.createElement("div", {
    className: "m-kids"
  }, t.subs.map(s => /*#__PURE__*/React.createElement(MTaskTile, {
    key: s.id,
    t: s,
    depth: depth + 1
  }))));
}

/* =========================== SESSION TILE =========================== */
function MSessionTile({
  s,
  depth = 0
}) {
  const [mode, setMode] = useStateT(s.mode || 'Worker');
  const [done, setDone] = useStateT(!!s.humanDone);
  const [collapsed, setCollapsed] = useStateT(false);
  const [open, setOpen] = useStateT(false);
  const hasKids = s.children && s.children.length > 0;
  const live = s.live;
  const statusKind = s.needsInput ? 'needsInput' : s.status === 'run' ? 'working' : s.status;
  return /*#__PURE__*/React.createElement("div", {
    className: 'm-st' + (s.active ? ' m-st--selected' : '') + (s.needsInput ? ' m-st--wait' : '') + (s.exited ? ' m-st--exited' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-st__main"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'm-st__arrow' + (hasKids ? '' : ' m-st__arrow--empty') + (hasKids && !collapsed ? ' m-st__arrow--open' : ''),
    onClick: () => hasKids && setCollapsed(c => !c),
    "aria-label": "Toggle spawned sessions"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })), hasKids && /*#__PURE__*/React.createElement("span", {
    className: "m-st__count"
  }, s.children.length), s.exited ? /*#__PURE__*/React.createElement("span", {
    className: "m-st__radio m-st__radio--archived"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: "archived",
    size: 13
  })) : /*#__PURE__*/React.createElement("button", {
    className: 'm-st__radio' + (done ? ' m-st__radio--on' : ''),
    onClick: () => setDone(v => !v),
    "aria-label": "Mark done"
  }, done && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 10,
    sw: 2.2
  })), /*#__PURE__*/React.createElement("button", {
    className: "m-st__titlebtn",
    onClick: () => MUI.openTerminal(s)
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: s.kind
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-st__titlecol"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-st__name"
  }, s.name, done && !s.exited && /*#__PURE__*/React.createElement("span", {
    className: "m-st__donetag"
  }, "done")), /*#__PURE__*/React.createElement("span", {
    className: "m-st__statusline"
  }, live ? /*#__PURE__*/React.createElement("span", {
    className: "m-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'm-dot m-dot--' + s.status + ' m-dot--live'
  })) : /*#__PURE__*/React.createElement("span", {
    className: 'm-dot m-dot--' + s.status
  }), /*#__PURE__*/React.createElement("span", {
    className: 'm-st__statustext' + (s.status === 'run' ? ' m-st__statustext--run' : s.status === 'wait' ? ' m-st__statustext--wait' : '')
  }, s.statusText)))), /*#__PURE__*/React.createElement("span", {
    className: "m-st__trail"
  }, s.docs > 0 && /*#__PURE__*/React.createElement("span", {
    className: "m-mini"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), s.docs), /*#__PURE__*/React.createElement("span", {
    className: "m-st__statusglyph"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: statusKind,
    size: 16
  })), /*#__PURE__*/React.createElement("button", {
    className: 'm-st__exp' + (open ? ' m-st__exp--open' : ''),
    onClick: () => setOpen(v => !v),
    "aria-label": "Details"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 15
  })))), s.tasklines && /*#__PURE__*/React.createElement("div", {
    className: "m-st__tasklines"
  }, s.tasklines.map((tl, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "m-st__taskline"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: tl.status,
    size: 13
  }), /*#__PURE__*/React.createElement("span", {
    className: "m-st__tasklineLabel"
  }, tl.title)))), open && /*#__PURE__*/React.createElement("div", {
    className: "m-st__meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "m-metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-metalabel"
  }, "Status"), /*#__PURE__*/React.createElement("div", {
    className: "m-metacontent"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'm-badge m-badge--status-' + statusKind
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: statusKind,
    size: 12
  }), " ", (M_SESS_LABEL[s.status] || s.status).toUpperCase()), /*#__PURE__*/React.createElement(MBadge, {
    label: mode,
    onTap: () => MUI.openPicker({
      title: 'Mode',
      current: mode,
      options: modeOpts(),
      onSelect: setMode
    })
  }), s.model && /*#__PURE__*/React.createElement("span", {
    className: "m-badge m-badge--model"
  }, s.model.toUpperCase()), s.strategy && /*#__PURE__*/React.createElement("span", {
    className: "m-badge"
  }, s.strategy), s.worktree && /*#__PURE__*/React.createElement("span", {
    className: "m-badge"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 11
  }), " ", s.worktree), /*#__PURE__*/React.createElement("span", {
    className: "m-metatime"
  }, s.elapsed || 'live'))), s.taskchips && /*#__PURE__*/React.createElement("div", {
    className: "m-metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-metalabel"
  }, "Tasks"), /*#__PURE__*/React.createElement("div", {
    className: "m-metacontent"
  }, s.taskchips.map((tc, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "m-taskchip"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: tc.status,
    size: 12
  }), /*#__PURE__*/React.createElement("span", {
    className: "t"
  }, tc.title))))), s.docList && /*#__PURE__*/React.createElement("div", {
    className: "m-metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-metalabel"
  }, "Docs"), /*#__PURE__*/React.createElement("div", {
    className: "m-metacontent"
  }, s.docList.map((d, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "m-docpill",
    onClick: () => MUI.openDoc(d)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__ic"
  }, d.md ? 'M↓' : '{}'), /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__t"
  }, d.name))))), s.diagrams && /*#__PURE__*/React.createElement("div", {
    className: "m-metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-metalabel"
  }, "Diagrams"), /*#__PURE__*/React.createElement("div", {
    className: "m-metacontent"
  }, s.diagrams.map((d, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "m-docpill m-docpill--dg",
    onClick: () => MUI.openDoc(d)
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__ic"
  }, "\u2B21"), /*#__PURE__*/React.createElement("span", {
    className: "m-docpill__t"
  }, d.name))))), /*#__PURE__*/React.createElement("div", {
    className: "m-metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "m-metalabel"
  }, "Actions"), /*#__PURE__*/React.createElement("div", {
    className: "m-metacontent"
  }, /*#__PURE__*/React.createElement("button", {
    className: "m-metabtn",
    onClick: () => MUI.openTerminal(s)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "terminal",
    size: 13
  }), " Open"), !live && !s.exited && /*#__PURE__*/React.createElement("button", {
    className: "m-metabtn",
    onClick: () => MUI.notify('Resume ' + s.name)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 13
  }), " Resume"), /*#__PURE__*/React.createElement("button", {
    className: "m-metabtn",
    onClick: () => MUI.notify('Copied @' + s.name)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 13
  }), " Copy ref"), !s.exited && /*#__PURE__*/React.createElement("button", {
    className: "m-metabtn m-metabtn--danger",
    onClick: () => MUI.notify('Close ' + s.name)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 13
  }), " Close")))), hasKids && !collapsed && /*#__PURE__*/React.createElement("div", {
    className: "m-kids m-kids--st"
  }, s.children.map(c => /*#__PURE__*/React.createElement(MSessionTile, {
    key: c.id,
    s: c,
    depth: depth + 1
  }))));
}
Object.assign(window, {
  MTaskTile,
  MSessionTile,
  MBadge
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "mobile-app/m-tiles.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/app.jsx
try { (() => {
/* app.jsx — assembles the panel layout exploration onto the design canvas. */
const {
  useState
} = React;
const W = 360;
const H = 884;
function App() {
  return /*#__PURE__*/React.createElement(DesignCanvas, null, /*#__PURE__*/React.createElement(DCSection, {
    id: "left",
    title: "Maestro panel \xB7 left",
    subtitle: "Project, tasks, team, skills \u2014 three layout directions"
  }, /*#__PURE__*/React.createElement(DCArtboard, {
    id: "left-a",
    label: "A \xB7 Ledger \u2014 editorial & airy",
    width: W,
    height: H
  }, /*#__PURE__*/React.createElement(LedgerLeft, null)), /*#__PURE__*/React.createElement(DCArtboard, {
    id: "left-b",
    label: "B \xB7 Stack \u2014 grouped & structured",
    width: W,
    height: H
  }, /*#__PURE__*/React.createElement(StackLeft, null)), /*#__PURE__*/React.createElement(DCArtboard, {
    id: "left-c",
    label: "C \xB7 Console \u2014 terminal-influenced",
    width: W,
    height: H
  }, /*#__PURE__*/React.createElement(ConsoleLeft, null))), /*#__PURE__*/React.createElement(DCSection, {
    id: "right",
    title: "Spaces panel \xB7 right",
    subtitle: "Sessions & resources \u2014 three layout directions"
  }, /*#__PURE__*/React.createElement(DCArtboard, {
    id: "right-a",
    label: "A \xB7 Roster \u2014 status-grouped rows",
    width: W,
    height: H
  }, /*#__PURE__*/React.createElement(RosterRight, null)), /*#__PURE__*/React.createElement(DCArtboard, {
    id: "right-b",
    label: "B \xB7 Cards \u2014 calm cards",
    width: W,
    height: H
  }, /*#__PURE__*/React.createElement(CardsRight, null)), /*#__PURE__*/React.createElement(DCArtboard, {
    id: "right-c",
    label: "C \xB7 Now playing \u2014 live activity",
    width: W,
    height: H
  }, /*#__PURE__*/React.createElement(NowPlayingRight, null))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/app.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/boards.jsx
try { (() => {
/* boards.jsx — Project board, Full (multi-project) board, and Team view.
   Relies on kit.jsx (Icon, AgentTile) + tiles.jsx (Glyph, Avatar). */

const BCOLUMNS = [{
  status: 'todo',
  label: 'Backlog'
}, {
  status: 'blocked',
  label: 'Blocked'
}, {
  status: 'in_progress',
  label: 'In progress'
}, {
  status: 'in_review',
  label: 'Review'
}, {
  status: 'completed',
  label: 'Done'
}];
const PRIO_DOT = {
  high: 'var(--pn-block)',
  medium: 'var(--pn-wait)',
  low: 'var(--pn-idle)'
};
function BoardCard({
  t,
  badge
}) {
  const blocked = t.status === 'blocked';
  const done = t.status === 'completed';
  const active = t.status === 'in_progress';
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-bcard' + (blocked ? ' pn-bcard--blocked' : '') + (done ? ' pn-bcard--done' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-bcard__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__pdot",
    style: {
      background: PRIO_DOT[t.priority]
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__title"
  }, t.title), active && /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__glyph pn-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run pn-dot--live"
  })), blocked && /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__glyph"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: "blocked",
    size: 14
  })), done && /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__glyph"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: "completed",
    size: 14
  }))), badge && /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__pbadge",
    style: {
      color: badge.color,
      borderColor: badge.color
    }
  }, badge.name), /*#__PURE__*/React.createElement("div", {
    className: "pn-bcard__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tag pn-tag--{p}",
    style: {
      color: t.priority === 'high' ? 'var(--pn-block)' : 'var(--pn-ink-3)'
    }
  }, t.priority === 'medium' ? 'MED' : t.priority.toUpperCase()), t.subTotal > 0 && /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__prog"
  }, t.subDone, "/", t.subTotal, /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__progbar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: t.subDone / t.subTotal * 100 + '%'
    }
  }))), t.due && /*#__PURE__*/React.createElement("span", {
    className: 'pn-bcard__due' + (t.overdue ? ' pn-bcard__due--over' : '')
  }, t.overdue ? 'Overdue' : 'Due ' + t.due)), /*#__PURE__*/React.createElement("div", {
    className: "pn-bcard__foot"
  }, t.assignee && /*#__PURE__*/React.createElement(Avatar, {
    a: t.assignee
  }), t.sessions > 0 && /*#__PURE__*/React.createElement("span", {
    className: "pn-bcard__sessions"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot ' + (active ? 'pn-dot--run' : 'pn-dot--idle')
  }), t.sessions + ' session' + (t.sessions !== 1 ? 's' : '')), (t.status === 'todo' || t.status === 'blocked') && /*#__PURE__*/React.createElement("button", {
    className: "pn-bcard__run"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-prompt"
  }, "$"), " work on")));
}
function Column({
  col,
  tasks,
  badge,
  collapsed,
  onToggle
}) {
  const list = tasks.filter(t => t.status === col.status);
  if (collapsed) {
    return /*#__PURE__*/React.createElement("div", {
      className: "pn-bcol--collapsed",
      onClick: onToggle,
      title: col.label
    }, /*#__PURE__*/React.createElement(Glyph, {
      kind: col.status === 'todo' ? 'todo' : col.status,
      size: 15
    }), /*#__PURE__*/React.createElement("span", {
      className: "pn-bcol__count"
    }, list.length), /*#__PURE__*/React.createElement("span", {
      className: "pn-bcol__label"
    }, col.label));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-bcol"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-bcol__hd",
    onClick: onToggle,
    style: {
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: col.status === 'todo' ? 'todo' : col.status,
    size: 14
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-bcol__label"
  }, col.label), /*#__PURE__*/React.createElement("span", {
    className: "pn-bcol__count"
  }, list.length)), /*#__PURE__*/React.createElement("div", {
    className: "pn-bcol__body"
  }, list.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "pn-bcol__empty"
  }, "no tasks") : list.map(t => /*#__PURE__*/React.createElement(BoardCard, {
    key: t.id,
    t: t,
    badge: badge
  }))));
}
function ProjectBoard({
  tasks
}) {
  const [collapsed, setCollapsed] = React.useState({});
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-bd-hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-bd-hd__title"
  }, "agent-maestro"), /*#__PURE__*/React.createElement("span", {
    className: "pn-bd-hd__sub"
  }, "8 tasks \xB7 3 active"), /*#__PURE__*/React.createElement("span", {
    className: "pn-bd-hd__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 14
  }), " Filter"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New task")), /*#__PURE__*/React.createElement("div", {
    className: "pn-bcols"
  }, BCOLUMNS.map(col => /*#__PURE__*/React.createElement(Column, {
    key: col.status,
    col: col,
    tasks: tasks,
    collapsed: !!collapsed[col.status],
    onToggle: () => setCollapsed(c => ({
      ...c,
      [col.status]: !c[col.status]
    }))
  }))));
}
function ProjectRow({
  proj,
  tasks
}) {
  const [open, setOpen] = React.useState(true);
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-mpr"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mpr__hd",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-mpr__dot",
    style: {
      background: proj.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-mpr__name"
  }, proj.name), /*#__PURE__*/React.createElement("span", {
    className: "pn-mpr__count"
  }, tasks.length, " tasks"), /*#__PURE__*/React.createElement("span", {
    className: "pn-mpr__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: open ? 'chevronD' : 'chevronR',
    size: 14
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "pn-bcols"
  }, BCOLUMNS.map(col => /*#__PURE__*/React.createElement(Column, {
    key: col.status,
    col: col,
    tasks: tasks,
    badge: proj
  }))));
}
function FullBoard({
  projects
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-screen",
    style: {
      paddingBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-bd-hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-bd-hd__title"
  }, "All projects"), /*#__PURE__*/React.createElement("span", {
    className: "pn-bd-hd__sub"
  }, projects.length, " projects"), /*#__PURE__*/React.createElement("span", {
    className: "pn-bd-hd__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 14
  }), " Group by status")), /*#__PURE__*/React.createElement("div", {
    style: {
      paddingTop: 14
    }
  }, projects.map(p => /*#__PURE__*/React.createElement(ProjectRow, {
    key: p.id,
    proj: p,
    tasks: p.tasks
  }))));
}

/* ---------------- TEAM VIEW ---------------- */
function TVStats({
  total,
  active
}) {
  if (!total) return null;
  return /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__stats"
  }, /*#__PURE__*/React.createElement("span", null, total, " ", total === 1 ? 'worker' : 'workers'), active > 0 && /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__statchip",
    style: {
      color: 'var(--pn-run)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run"
  }), active), total - active > 0 && /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__statchip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--idle"
  }), total - active));
}
function TVTerm({
  lines
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__term"
  }, lines.map((l, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    dangerouslySetInnerHTML: {
      __html: l
    }
  })));
}
function WorkerCol({
  w,
  collapsed,
  onToggle
}) {
  if (collapsed) {
    return /*#__PURE__*/React.createElement("div", {
      className: "pn-tv__col pn-tv__col--collapsed",
      onClick: onToggle,
      title: 'Expand ' + w.name
    }, /*#__PURE__*/React.createElement("div", {
      className: "pn-tv__colv"
    }, /*#__PURE__*/React.createElement(AgentTile, {
      kind: w.agent
    }), w.needsInput ? /*#__PURE__*/React.createElement(Glyph, {
      kind: "needsInput",
      size: 14
    }) : /*#__PURE__*/React.createElement(Glyph, {
      kind: w.status,
      size: 14
    }), /*#__PURE__*/React.createElement("span", {
      className: "pn-tv__colvname"
    }, w.name)));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-tv__col' + (w.needsInput ? ' pn-tv__col--needs' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__slothd"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: w.agent
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__slotname"
  }, w.name), w.needsInput ? /*#__PURE__*/React.createElement(Glyph, {
    kind: "needsInput",
    size: 14
  }) : /*#__PURE__*/React.createElement(Glyph, {
    kind: w.status,
    size: 14
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__slotsp"
  }), w.branch && /*#__PURE__*/React.createElement("span", {
    className: "pn-mini",
    title: 'worktree ' + w.branch
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 12
  })), !w.live && !w.drill && /*#__PURE__*/React.createElement("button", {
    className: "pn-tv__colbtn",
    title: "Resume"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-tv__colbtn",
    title: "Collapse column",
    onClick: onToggle
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }))), w.live ? /*#__PURE__*/React.createElement(TVTerm, {
    lines: w.term
  }) : /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__ph"
  }, /*#__PURE__*/React.createElement("span", null, "No live terminal"), w.resumable && /*#__PURE__*/React.createElement("button", {
    className: "pn-tv__ph__resume"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  }), " Resume")), w.drill && /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__drillbar"
  }, w.subTotal, " ", w.subTotal === 1 ? 'worker' : 'workers', " \u2014 drill in", /*#__PURE__*/React.createElement("span", {
    className: "arrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 13
  }))));
}
function TeamView() {
  const [coordW, setCoordW] = React.useState(440);
  const [collapsed, setCollapsed] = React.useState({});
  const [dragging, setDragging] = React.useState(false);
  const bodyRef = React.useRef(null);
  const dragRef = React.useRef(false);
  const toggle = name => setCollapsed(c => ({
    ...c,
    [name]: !c[name]
  }));
  React.useEffect(() => {
    const mv = e => {
      if (!dragRef.current || !bodyRef.current) return;
      const r = bodyRef.current.getBoundingClientRect();
      setCoordW(Math.max(300, Math.min(r.width * 0.62, e.clientX - r.left)));
    };
    const up = () => {
      if (!dragRef.current) return;
      dragRef.current = false;
      setDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', up);
    };
  }, []);
  const onDown = e => {
    e.preventDefault();
    dragRef.current = true;
    setDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const rootTerm = ['<span class="l-prompt">›</span> Coordinating the reparent fix across 3 workers', '<span class="l-dim">&nbsp;&nbsp;spawned fluffy-starlight, vast-neumann, alexa</span>', '<span class="l-dim">&nbsp;&nbsp;waiting on the registry-ref change before tests</span>', '<span class="l-prompt">›</span> Reviewing fluffy-starlight\'s diff<span class="pn-tv__tcursor"></span>'];
  const workers = [{
    name: 'fluffy-starlight',
    agent: 'claude',
    status: 'working',
    live: true,
    branch: 'fix/reparent',
    term: ['<span class="l-prompt">›</span> Editing MultiProjectSessionsView.tsx', '<span class="l-ok">&nbsp;&nbsp;+ registry.current.get(id)?.term.element</span>', '<span class="l-dim">&nbsp;&nbsp;re-running fit.fit()…</span>']
  }, {
    name: 'vast-neumann',
    agent: 'claude',
    status: 'working',
    live: true,
    needsInput: true,
    term: ['<span class="l-prompt">›</span> Should the profile layer be per-project', '<span class="l-prompt">&nbsp;&nbsp;or global?&nbsp;<span class="pn-tv__tcursor"></span></span>']
  }, {
    name: 'Alexa coordinator',
    agent: 'codex',
    status: 'working',
    live: true,
    drill: true,
    subTotal: 2,
    term: ['<span class="l-prompt">›</span> Delegating to 2 sub-workers', '<span class="l-dim">&nbsp;&nbsp;voice-router · directive-parser</span>']
  }, {
    name: 'swift-harbor',
    agent: 'claude',
    status: 'working',
    live: true,
    term: ['<span class="l-prompt">›</span> Writing regression test', '<span class="l-ok">&nbsp;&nbsp;✓ reconnect keeps terminal mounted</span>']
  }, {
    name: 'concurrent-cosmos',
    agent: 'gemini',
    status: 'idle',
    live: false,
    resumable: true
  }, {
    name: 'zesty-wave',
    agent: 'terminal',
    status: 'stopped',
    live: false,
    resumable: false
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-screen pn-tv"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__title"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "claude",
    lg: true
  }), " Rhea"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__pill pn-tv__pill--active"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run"
  }), " Active"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__count"
  }, "7 members"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__hint"
  }, "click child to drill \xB7 double-click to open \xB7 Esc to close"), /*#__PURE__*/React.createElement("button", {
    className: "pn-tv__close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__crumbs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tv__crumb"
  }, /*#__PURE__*/React.createElement(Avatar, {
    a: {
      initial: 'M',
      color: '#3f6c90',
      bg: '#dde8f1'
    }
  }), " maestro-lead"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__crumb-sep"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 12
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-tv__crumb pn-tv__crumb--current"
  }, /*#__PURE__*/React.createElement(Avatar, {
    a: {
      initial: 'R',
      color: '#1f6f5f',
      bg: '#dcebe6'
    }
  }), " Rhea")), /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__body",
    ref: bodyRef
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__coord",
    style: {
      width: coordW
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__coordhd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__coordring"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "claude",
    lg: true
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__coordname"
  }, "Rhea"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__coordbadge"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "baton"
  }), " Coordinator"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tv__slotsp"
  }), /*#__PURE__*/React.createElement(TVStats, {
    total: 3,
    active: 2
  })), /*#__PURE__*/React.createElement(TVTerm, {
    lines: rootTerm
  })), /*#__PURE__*/React.createElement("div", {
    className: 'pn-tv__resize' + (dragging ? ' pn-tv__resize--active' : ''),
    onMouseDown: onDown
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-tv__workers"
  }, workers.map(w => /*#__PURE__*/React.createElement(WorkerCol, {
    key: w.name,
    w: w,
    collapsed: !!collapsed[w.name],
    onToggle: () => toggle(w.name)
  })))));
}

/* ---------------- data + showcase ---------------- */
const RHEA = {
  initial: 'R',
  name: 'Rhea',
  color: '#1f6f5f',
  bg: '#dcebe6'
};
const KIT = {
  initial: 'K',
  name: 'Kit',
  color: '#7a5cc0',
  bg: '#ece4f7'
};
const ADA = {
  initial: 'A',
  name: 'Ada',
  color: '#b06a2b',
  bg: '#f4e7d6'
};
const PROJ_TASKS = [{
  id: 'b1',
  title: 'Fix terminal reparenting crash on board close',
  priority: 'high',
  status: 'in_progress',
  subDone: 1,
  subTotal: 3,
  sessions: 2,
  assignee: RHEA,
  due: 'Jun 12'
}, {
  id: 'b2',
  title: 'WebSocket pipeline — dedupe session updates',
  priority: 'medium',
  status: 'in_progress',
  subTotal: 0,
  sessions: 1,
  assignee: KIT
}, {
  id: 'b3',
  title: 'Add a model-profile indirection layer',
  priority: 'medium',
  status: 'todo',
  subDone: 0,
  subTotal: 2,
  sessions: 0,
  assignee: RHEA
}, {
  id: 'b4',
  title: 'Voice directives — Alexa coordinator handoff',
  priority: 'low',
  status: 'todo',
  subTotal: 0,
  sessions: 0
}, {
  id: 'b5',
  title: 'Migrate task ordering to server persistence',
  priority: 'medium',
  status: 'blocked',
  subTotal: 0,
  sessions: 1,
  assignee: ADA,
  due: 'Jun 5',
  overdue: true
}, {
  id: 'b6',
  title: 'Verify Opus 1M spawns with 1M context window',
  priority: 'low',
  status: 'in_review',
  subTotal: 0,
  sessions: 1,
  assignee: KIT
}, {
  id: 'b7',
  title: 'Add /loop recurring command',
  priority: 'low',
  status: 'completed',
  subTotal: 0,
  sessions: 0
}, {
  id: 'b8',
  title: 'Dedup notification sounds per instrument',
  priority: 'medium',
  status: 'completed',
  subDone: 2,
  subTotal: 2,
  sessions: 0
}];
const PROJECTS = [{
  id: 'p1',
  name: 'agent-maestro',
  color: '#1f6f5f',
  tasks: PROJ_TASKS.slice(0, 6)
}, {
  id: 'p2',
  name: 'voice-alexa',
  color: '#7a5cc0',
  tasks: [{
    id: 'v1',
    title: 'Wake-word false positives on "Alexa stop"',
    priority: 'high',
    status: 'in_progress',
    subTotal: 0,
    sessions: 1,
    assignee: ADA
  }, {
    id: 'v2',
    title: 'Coordinator handoff protocol spec',
    priority: 'medium',
    status: 'todo',
    subTotal: 0,
    sessions: 0
  }, {
    id: 'v3',
    title: 'Latency budget for directive routing',
    priority: 'low',
    status: 'in_review',
    subTotal: 0,
    sessions: 0,
    assignee: KIT
  }]
}, {
  id: 'p3',
  name: 'maestro-server',
  color: '#b06a2b',
  tasks: [{
    id: 's1',
    title: 'JSON store compaction on startup',
    priority: 'medium',
    status: 'completed',
    subTotal: 0,
    sessions: 0
  }, {
    id: 's2',
    title: 'WebSocket backpressure handling',
    priority: 'high',
    status: 'blocked',
    subTotal: 0,
    sessions: 0,
    assignee: RHEA
  }]
}];
function Boards() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-bd-stage"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "pn-bd-cap"
  }, "Team view \u2014 agent sessions"), /*#__PURE__*/React.createElement(TeamView, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "pn-bd-cap"
  }, "Project board"), /*#__PURE__*/React.createElement(ProjectBoard, {
    tasks: PROJ_TASKS
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "pn-bd-cap"
  }, "Full board \u2014 all projects"), /*#__PURE__*/React.createElement(FullBoard, {
    projects: PROJECTS
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Boards, null));
Object.assign(window, {
  TeamView,
  ProjectBoard,
  FullBoard,
  BoardCard
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/boards.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/buttons.jsx
try { (() => {
/* buttons.jsx — Run + Coordinate buttons. Relies on kit.jsx (Icon). */

/* play triangle that nudges on hover (run) */
function RunGlyph() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M5 3.2l8 4.8-8 4.8z",
    fill: "currentColor"
  }));
}
/* conductor → spawning parallel agents (coordinate); dots fan out on hover */
function CoordGlyph() {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 16 16",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "4",
    cy: "8",
    r: "2.1",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("path", {
    className: "pn-spawn__line",
    d: "M5.8 8h4",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round"
  }), /*#__PURE__*/React.createElement("g", {
    className: "pn-spawn__node pn-spawn__n1"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "1.7",
    fill: "currentColor"
  })), /*#__PURE__*/React.createElement("g", {
    className: "pn-spawn__node pn-spawn__n2",
    style: {
      opacity: 0.0
    }
  }), /*#__PURE__*/React.createElement("g", {
    className: "pn-spawn__node pn-spawn__n3"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "1.7",
    fill: "currentColor"
  })));
}
function RunButton({
  solid,
  sm,
  kbd
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'pn-run2 pn-run2--run' + (solid ? ' pn-run2--solid' : '') + (sm ? ' pn-run2--sm' : '')
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__chip"
  }, /*#__PURE__*/React.createElement(RunGlyph, null)), /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__label"
  }, "run", !sm && /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__sub"
  }, "single worker")), kbd && /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__kbd"
  }, "\u2318\u21B5"));
}
function CoordButton({
  solid,
  sm,
  kbd
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'pn-run2 pn-run2--coord' + (solid ? ' pn-run2--solid' : '') + (sm ? ' pn-run2--sm' : '')
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__chip"
  }, /*#__PURE__*/React.createElement(CoordGlyph, null)), /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__label"
  }, "coordinate", !sm && /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__sub"
  }, "spawn a team")), kbd && /*#__PURE__*/React.createElement("span", {
    className: "pn-run2__kbd"
  }, "\u21E7\u2318\u21B5"));
}
function SplitRun({
  avatar
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-split"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-split__play"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-split__av"
  }, avatar || '🎻'), "run with Rhea"), /*#__PURE__*/React.createElement("span", {
    className: "pn-split__div"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-split__caret"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })));
}
function Buttons() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-stage"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "pn-b2-h"
  }, "Run & Coordinate"), /*#__PURE__*/React.createElement("p", {
    className: "pn-b2-sub"
  }, "The two ways to start work on a task. ", /*#__PURE__*/React.createElement("strong", null, "Run"), " executes with a single worker; ", /*#__PURE__*/React.createElement("strong", null, "Coordinate"), " hands it to an orchestrator that spawns a team. Run reads green/go; coordinate reads brass/conductor \u2014 the play nudges, the spawn-dots fan out."), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-cap"
  }, "Default pair \u2014 hover to see them animate"), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-row"
  }, /*#__PURE__*/React.createElement(RunButton, {
    kbd: true
  }), /*#__PURE__*/React.createElement(CoordButton, {
    kbd: true
  })), /*#__PURE__*/React.createElement("p", {
    className: "pn-b2-note"
  }, "Resting: a hairline button with a soft accent chip. Hover: border picks up the accent, the chip fills, the glyph animates."), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-cap"
  }, "Solid \u2014 when run is the single primary action"), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-row"
  }, /*#__PURE__*/React.createElement(RunButton, {
    solid: true
  }), /*#__PURE__*/React.createElement(CoordButton, {
    solid: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-cap"
  }, "Compact \u2014 in a task row / footer"), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-row"
  }, /*#__PURE__*/React.createElement(RunButton, {
    sm: true
  }), /*#__PURE__*/React.createElement(CoordButton, {
    sm: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-cap"
  }, "Split run \u2014 pick which member executes"), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-row"
  }, /*#__PURE__*/React.createElement(SplitRun, null)), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-cap"
  }, "In context"), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-ctx"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-ctx__t"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-ctx__title"
  }, "Fix terminal reparenting crash"), /*#__PURE__*/React.createElement("div", {
    className: "pn-b2-ctx__sub"
  }, "3 subtasks \xB7 high priority \xB7 unassigned")), /*#__PURE__*/React.createElement(RunButton, {
    sm: true
  }), /*#__PURE__*/React.createElement(CoordButton, {
    sm: true
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Buttons, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/buttons.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/design-canvas.jsx
try { (() => {
// @ds-adherence-ignore -- omelette starter scaffold (raw elements/hex/px by design)

/* BEGIN USAGE */
// DesignCanvas.jsx — Figma-ish design canvas wrapper
// Warm gray grid bg + Sections + Artboards + PostIt notes.
// Exports (to window): DesignCanvas, DCSection, DCArtboard, DCPostIt.
// Artboards are reorderable (grip-drag), deletable, labels/titles are
// inline-editable, and any artboard can be opened in a fullscreen focus
// overlay (←/→/Esc). State persists to a .design-canvas.state.json sidecar
// via the host bridge. No assets, no deps.
//
// Usage:
//   <DesignCanvas>
//     <DCSection id="onboarding" title="Onboarding" subtitle="First-run variants">
//       <DCArtboard id="a" label="A · Dusk" width={260} height={480}>…</DCArtboard>
//       <DCArtboard id="b" label="B · Minimal" width={260} height={480}>…</DCArtboard>
//     </DCSection>
//   </DesignCanvas>
//
// Artboards are static design frames, not scroll regions — never use
// height: 100% + overflow: auto/scroll on inner elements; size each artboard
// to fit its content (explicit pixel height, or let it grow).
/* END USAGE */

const DC = {
  bg: '#f0eee9',
  grid: 'rgba(0,0,0,0.06)',
  label: 'rgba(60,50,40,0.7)',
  title: 'rgba(40,30,20,0.85)',
  subtitle: 'rgba(60,50,40,0.6)',
  postitBg: '#fef4a8',
  postitText: '#5a4a2a',
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif'
};

// One-time CSS injection (classes are dc-prefixed so they don't collide with
// the hosted design's own styles).
if (typeof document !== 'undefined' && !document.getElementById('dc-styles')) {
  const s = document.createElement('style');
  s.id = 'dc-styles';
  s.textContent = ['.dc-editable{cursor:text;outline:none;white-space:nowrap;border-radius:3px;padding:0 2px;margin:0 -2px}', '.dc-editable:focus{background:#fff;box-shadow:0 0 0 1.5px #c96442}', '[data-dc-slot]{transition:transform .18s cubic-bezier(.2,.7,.3,1)}', '[data-dc-slot].dc-dragging{transition:none;z-index:10;pointer-events:none}', '[data-dc-slot].dc-dragging .dc-card{box-shadow:0 12px 40px rgba(0,0,0,.25),0 0 0 2px #c96442;transform:scale(1.02)}',
  // isolation:isolate contains artboard content's z-indexes so a
  // z-indexed child (sticky navbar etc.) can't paint over .dc-header or
  // the .dc-menu popover that drops into the top of the card.
  '.dc-card{isolation:isolate;transition:box-shadow .15s,transform .15s}', '.dc-card *{scrollbar-width:none}', '.dc-card *::-webkit-scrollbar{display:none}',
  // Per-artboard header: grip + label on the left, delete/expand on the
  // right. Single flex row; when the artboard's on-screen width is too
  // narrow for both the label yields (ellipsis, then hidden entirely below
  // ~4ch via the container query) and the buttons stay on the row.
  '.dc-header{position:absolute;bottom:100%;left:-4px;margin-bottom:calc(4px * var(--dc-inv-zoom,1));z-index:2;', '  display:flex;align-items:center;container-type:inline-size}', '.dc-labelrow{display:flex;align-items:center;gap:4px;height:24px;flex:1 1 auto;min-width:0}', '.dc-grip{flex:0 0 auto;cursor:grab;display:flex;align-items:center;padding:5px 4px;border-radius:4px;transition:background .12s,opacity .12s}', '.dc-grip:hover{background:rgba(0,0,0,.08)}', '.dc-grip:active{cursor:grabbing}', '.dc-labeltext{flex:1 1 auto;min-width:0;cursor:pointer;border-radius:4px;padding:3px 6px;', '  display:flex;align-items:center;transition:background .12s;overflow:hidden}',
  // Below ~4ch of label room: hide the label entirely, and drop the grip to
  // hover-only (same reveal rule as .dc-btns) so a narrow header is clean
  // until the card is moused.
  '@container (max-width: 110px){', '  .dc-labeltext{display:none}', '  .dc-grip{opacity:0}', '  [data-dc-slot]:hover .dc-grip{opacity:1}', '}', '.dc-labeltext:hover{background:rgba(0,0,0,.05)}', '.dc-labeltext .dc-editable{overflow:hidden;text-overflow:ellipsis;max-width:100%}', '.dc-labeltext .dc-editable:focus{overflow:visible;text-overflow:clip}', '.dc-btns{flex:0 0 auto;margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s}', '[data-dc-slot]:hover .dc-btns,.dc-btns:has(.dc-menu){opacity:1}', '.dc-expand,.dc-kebab{width:22px;height:22px;border-radius:5px;border:none;cursor:pointer;padding:0;', '  background:transparent;color:rgba(60,50,40,.7);display:flex;align-items:center;justify-content:center;', '  font:inherit;transition:background .12s,color .12s}', '.dc-expand:hover,.dc-kebab:hover{background:rgba(0,0,0,.06);color:#2a251f}',
  // Slot hosting an open menu floats above later siblings (which otherwise
  // paint on top — same z-index:auto, later DOM order) so the popup isn't
  // clipped by the next card.
  '[data-dc-slot]:has(.dc-menu){z-index:10}', '.dc-menu{position:absolute;top:100%;right:0;margin-top:4px;background:#fff;border-radius:8px;', '  box-shadow:0 8px 28px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.05);padding:4px;min-width:160px;z-index:10}', '.dc-menu button{display:block;width:100%;padding:7px 10px;border:0;background:transparent;', '  border-radius:5px;font-family:inherit;font-size:13px;font-weight:500;line-height:1.2;', '  color:#29261b;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap}', '.dc-menu button:hover{background:rgba(0,0,0,.05)}', '.dc-menu hr{border:0;border-top:1px solid rgba(0,0,0,.08);margin:4px 2px}', '.dc-menu .dc-danger{color:#c96442}', '.dc-menu .dc-danger:hover{background:rgba(201,100,66,.1)}',
  // Chrome (titles / labels / buttons) counter-scales against the viewport
  // zoom so it stays a constant on-screen size. --dc-inv-zoom is set by
  // DCViewport on every transform update and inherits to all descendants —
  // any overlay inside the world (e.g. a TweaksPanel on an artboard) can use
  // it the same way.
  //
  // The header uses transform:scale (out-of-flow, so layout impact doesn't
  // matter) with its world-space width set to card-width / inv-zoom so that
  // after counter-scaling its on-screen width exactly matches the card's —
  // that's what lets the container query + text-overflow behave against the
  // card's visible edge at every zoom level.
  //
  // The section head uses CSS zoom instead of transform so its layout box
  // grows with the counter-scale, pushing the card row down — otherwise the
  // constant-screen-size title would overflow into the (shrinking) world-
  // space gap and overlap the artboard headers at low zoom.
  '.dc-header{width:calc((100% + 4px) / var(--dc-inv-zoom,1));', '  transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom left}', '.dc-sectionhead{zoom:var(--dc-inv-zoom,1)}'].join('\n');
  document.head.appendChild(s);
}
const DCCtx = React.createContext(null);

// Recursively unwrap React.Fragment so <>…</> grouping doesn't hide
// DCSection/DCArtboard children from the type-based walks below.
function dcFlatten(children) {
  const out = [];
  React.Children.forEach(children, c => {
    if (c && c.type === React.Fragment) out.push(...dcFlatten(c.props.children));else out.push(c);
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// DesignCanvas — stateful wrapper around the pan/zoom viewport.
// Owns runtime state (per-section order, renamed titles/labels, hidden
// artboards, focused artboard). Order/titles/labels/hidden persist to a
// .design-canvas.state.json
// sidecar next to the HTML. Reads go via plain fetch() so the saved
// arrangement is visible anywhere the HTML + sidecar are served together
// (omelette preview, direct link, downloaded zip). Writes go through the
// host's window.omelette bridge — editing requires the omelette runtime.
// Focus is ephemeral.
// ─────────────────────────────────────────────────────────────
const DC_STATE_FILE = '.design-canvas.state.json';
function DesignCanvas({
  children,
  minScale,
  maxScale,
  style
}) {
  const [state, setState] = React.useState({
    sections: {},
    focus: null
  });
  // Hold rendering until the sidecar read settles so the saved order/titles
  // appear on first paint (no source-order flash). didRead gates writes until
  // the read settles so the empty initial state can't clobber a slow read;
  // skipNextWrite suppresses the one echo-write that would otherwise follow
  // hydration.
  const [ready, setReady] = React.useState(false);
  const didRead = React.useRef(false);
  const skipNextWrite = React.useRef(false);
  React.useEffect(() => {
    let off = false;
    fetch('./' + DC_STATE_FILE).then(r => r.ok ? r.json() : null).then(saved => {
      if (off || !saved || !saved.sections) return;
      skipNextWrite.current = true;
      setState(s => ({
        ...s,
        sections: saved.sections
      }));
    }).catch(() => {}).finally(() => {
      didRead.current = true;
      if (!off) setReady(true);
    });
    const t = setTimeout(() => {
      if (!off) setReady(true);
    }, 150);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, []);
  React.useEffect(() => {
    if (!didRead.current) return;
    if (skipNextWrite.current) {
      skipNextWrite.current = false;
      return;
    }
    const t = setTimeout(() => {
      window.omelette?.writeFile(DC_STATE_FILE, JSON.stringify({
        sections: state.sections
      })).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [state.sections]);

  // Build registries synchronously from children so FocusOverlay can read
  // them in the same render. Fragments are flattened; wrapping in other
  // elements still opts out of focus/reorder.
  const registry = {}; // slotId -> { sectionId, artboard }
  const sectionMeta = {}; // sectionId -> { title, subtitle, slotIds[] }
  const sectionOrder = [];
  dcFlatten(children).forEach(sec => {
    if (!sec || sec.type !== DCSection) return;
    const sid = sec.props.id ?? sec.props.title;
    if (!sid) return;
    sectionOrder.push(sid);
    const persisted = state.sections[sid] || {};
    const abs = [];
    dcFlatten(sec.props.children).forEach(ab => {
      if (!ab || ab.type !== DCArtboard) return;
      const aid = ab.props.id ?? ab.props.label;
      if (aid) abs.push([aid, ab]);
    });
    // hidden is scoped to one source revision — when the agent regenerates
    // (artboard-ID set changes), prior deletes don't apply to new content.
    const srcKey = abs.map(([k]) => k).join('\x1f');
    const hidden = persisted.srcKey === srcKey ? persisted.hidden || [] : [];
    const srcIds = [];
    abs.forEach(([aid, ab]) => {
      if (hidden.includes(aid)) return;
      registry[`${sid}/${aid}`] = {
        sectionId: sid,
        artboard: ab
      };
      srcIds.push(aid);
    });
    const kept = (persisted.order || []).filter(k => srcIds.includes(k));
    sectionMeta[sid] = {
      title: persisted.title ?? sec.props.title,
      subtitle: sec.props.subtitle,
      slotIds: [...kept, ...srcIds.filter(k => !kept.includes(k))]
    };
  });
  const api = React.useMemo(() => ({
    state,
    section: id => state.sections[id] || {},
    patchSection: (id, p) => setState(s => ({
      ...s,
      sections: {
        ...s.sections,
        [id]: {
          ...s.sections[id],
          ...(typeof p === 'function' ? p(s.sections[id] || {}) : p)
        }
      }
    })),
    setFocus: slotId => setState(s => ({
      ...s,
      focus: slotId
    }))
  }), [state]);

  // Esc exits focus; any outside pointerdown commits an in-progress rename.
  React.useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') api.setFocus(null);
    };
    const onPd = e => {
      const ae = document.activeElement;
      if (ae && ae.isContentEditable && !ae.contains(e.target)) ae.blur();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPd, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPd, true);
    };
  }, [api]);
  return /*#__PURE__*/React.createElement(DCCtx.Provider, {
    value: api
  }, /*#__PURE__*/React.createElement(DCViewport, {
    minScale: minScale,
    maxScale: maxScale,
    style: style
  }, ready && children), state.focus && registry[state.focus] && /*#__PURE__*/React.createElement(DCFocusOverlay, {
    entry: registry[state.focus],
    sectionMeta: sectionMeta,
    sectionOrder: sectionOrder
  }));
}

// ─────────────────────────────────────────────────────────────
// DCViewport — transform-based pan/zoom (internal)
//
// Input mapping (Figma-style):
//   • trackpad pinch  → zoom   (ctrlKey wheel; Safari gesture* events)
//   • trackpad scroll → pan    (two-finger)
//   • mouse wheel     → zoom   (notched; distinguished from trackpad scroll)
//   • middle-drag / primary-drag-on-bg → pan
//
// Transform state lives in a ref and is written straight to the DOM
// (translate3d + will-change) so wheel ticks don't go through React —
// keeps pans at 60fps on dense canvases.
// ─────────────────────────────────────────────────────────────
function DCViewport({
  children,
  minScale = 0.1,
  maxScale = 8,
  style = {}
}) {
  const vpRef = React.useRef(null);
  const worldRef = React.useRef(null);
  const tf = React.useRef({
    x: 0,
    y: 0,
    scale: 1
  });
  // Persist viewport across reloads so the user lands back where they were
  // after an agent edit or browser refresh. The sandbox origin is already
  // per-project; pathname keeps multiple canvas files in one project apart.
  const tfKey = 'dc-viewport:' + location.pathname;
  const saveT = React.useRef(0);
  const lastPostedScale = React.useRef();
  const apply = React.useCallback(() => {
    const {
      x,
      y,
      scale
    } = tf.current;
    const el = worldRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    // Exposed for zoom-invariant chrome (labels, buttons, TweaksPanel).
    el.style.setProperty('--dc-inv-zoom', String(1 / scale));
    // Keep the host toolbar's % readout in sync with the canvas scale. Pan
    // ticks leave scale unchanged — skip the cross-frame post for those.
    if (lastPostedScale.current !== scale) {
      lastPostedScale.current = scale;
      window.parent.postMessage({
        type: '__dc_zoom',
        scale
      }, '*');
    }
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    }, 200);
  }, [tfKey]);
  React.useLayoutEffect(() => {
    const flush = () => {
      clearTimeout(saveT.current);
      try {
        localStorage.setItem(tfKey, JSON.stringify(tf.current));
      } catch {}
    };
    try {
      const s = JSON.parse(localStorage.getItem(tfKey) || 'null');
      if (s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.scale)) {
        tf.current = {
          x: s.x,
          y: s.y,
          scale: Math.min(maxScale, Math.max(minScale, s.scale))
        };
        apply();
      }
    } catch {}
    // Flush on pagehide and unmount so a reload within the 200ms debounce
    // window doesn't drop the last pan/zoom.
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  React.useEffect(() => {
    const vp = vpRef.current;
    if (!vp) return;
    const zoomAt = (cx, cy, factor) => {
      const r = vp.getBoundingClientRect();
      const px = cx - r.left,
        py = cy - r.top;
      const t = tf.current;
      const next = Math.min(maxScale, Math.max(minScale, t.scale * factor));
      const k = next / t.scale;
      // --dc-inv-zoom consumers (.dc-sectionhead's CSS zoom, each section's
      // marginBottom) reflow on every scale change, vertically shifting the
      // world layout — so a world point mathematically pinned under the cursor
      // drifts as you zoom (content creeps up on zoom-in, down on zoom-out).
      // Anchor the DOM element under the cursor instead: record its screen Y,
      // apply the transform + --dc-inv-zoom, then cancel whatever vertical
      // drift the reflow introduced so it stays put on screen.
      let marker = null,
        markerY0 = 0;
      if (k !== 1) {
        const hit = document.elementFromPoint(cx, cy);
        marker = hit && hit.closest ? hit.closest('[data-dc-slot],[data-dc-section]') : null;
        if (marker) markerY0 = marker.getBoundingClientRect().top;
      }
      // keep the world point under the cursor fixed
      t.x = px - (px - t.x) * k;
      t.y = py - (py - t.y) * k;
      t.scale = next;
      apply();
      if (marker) {
        // A pure zoom around (cx, cy) maps screen Y → cy + (Y - cy) * k. Any
        // departure after the --dc-inv-zoom reflow is the layout drift.
        const drift = marker.getBoundingClientRect().top - (cy + (markerY0 - cy) * k);
        if (Math.abs(drift) > 0.1) {
          t.y -= drift;
          apply();
        }
      }
    };

    // Mouse-wheel vs trackpad-scroll heuristic. A physical wheel sends
    // line-mode deltas (Firefox) or large integer pixel deltas with no X
    // component (Chrome/Safari, typically multiples of 100/120). Trackpad
    // two-finger scroll sends small/fractional pixel deltas, often with
    // non-zero deltaX. ctrlKey is set by the browser for trackpad pinch.
    const isMouseWheel = e => e.deltaMode !== 0 || e.deltaX === 0 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 40;
    const onWheel = e => {
      e.preventDefault();
      if (isGesturing) return; // Safari: gesture* owns the pinch — discard concurrent wheels
      if ((e.ctrlKey || e.metaKey) && !isMouseWheel(e)) {
        // trackpad pinch, or ctrl/cmd + smooth-scroll mouse. Notched
        // wheels fall through to the fixed-step branch below.
        zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.01));
      } else if (isMouseWheel(e)) {
        // notched mouse wheel — fixed-ratio step per click
        zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.18));
      } else {
        // trackpad two-finger scroll — pan
        tf.current.x -= e.deltaX;
        tf.current.y -= e.deltaY;
        apply();
      }
    };

    // Safari sends native gesture* events for trackpad pinch with a smooth
    // e.scale; preferring these over the ctrl+wheel fallback gives a much
    // better feel there. No-ops on other browsers. Safari also fires
    // ctrlKey wheel events during the same pinch — isGesturing makes
    // onWheel drop those entirely so they neither zoom nor pan.
    let gsBase = 1;
    let isGesturing = false;
    const onGestureStart = e => {
      e.preventDefault();
      isGesturing = true;
      gsBase = tf.current.scale;
    };
    const onGestureChange = e => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, gsBase * e.scale / tf.current.scale);
    };
    const onGestureEnd = e => {
      e.preventDefault();
      isGesturing = false;
    };

    // Drag-pan: middle button anywhere, or primary button on canvas
    // background (anything that isn't an artboard or an inline editor).
    let drag = null;
    const onPointerDown = e => {
      const onBg = !e.target.closest('[data-dc-slot], .dc-editable');
      if (!(e.button === 1 || e.button === 0 && onBg)) return;
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      drag = {
        id: e.pointerId,
        lx: e.clientX,
        ly: e.clientY
      };
      vp.style.cursor = 'grabbing';
    };
    const onPointerMove = e => {
      if (!drag || e.pointerId !== drag.id) return;
      tf.current.x += e.clientX - drag.lx;
      tf.current.y += e.clientY - drag.ly;
      drag.lx = e.clientX;
      drag.ly = e.clientY;
      apply();
    };
    const onPointerUp = e => {
      if (!drag || e.pointerId !== drag.id) return;
      vp.releasePointerCapture(e.pointerId);
      drag = null;
      vp.style.cursor = '';
    };

    // Host-driven zoom (toolbar % menu). Zooms around viewport centre so the
    // visible midpoint stays fixed — matching the host's iframe-zoom feel.
    const onHostMsg = e => {
      const d = e.data;
      if (d && d.type === '__dc_set_zoom' && typeof d.scale === 'number') {
        const r = vp.getBoundingClientRect();
        zoomAt(r.left + r.width / 2, r.top + r.height / 2, d.scale / tf.current.scale);
      } else if (d && d.type === '__dc_probe') {
        // Host's [readyGen] reset asks whether a canvas is present; it
        // fires on the iframe's native 'load', which for canvases with
        // images/fonts is after our mount-time announce, so re-announce.
        // Clear the pan-tick guard so apply() re-posts the current scale
        // even if it's unchanged — the host just reset dcScale to 1.
        window.parent.postMessage({
          type: '__dc_present'
        }, '*');
        lastPostedScale.current = undefined;
        apply();
      }
    };
    window.addEventListener('message', onHostMsg);
    // Announce canvas mode so the host toolbar proxies its % control here
    // instead of scaling the iframe element (which would just shrink the
    // viewport window of an infinite canvas). The apply() that follows emits
    // the initial __dc_zoom so the toolbar % is correct before first pinch.
    // lastPostedScale reset mirrors the __dc_probe handler: the layout
    // effect's restore-path apply() may already have posted the restored
    // scale (before __dc_present), so clear the guard to re-post it in order.
    window.parent.postMessage({
      type: '__dc_present'
    }, '*');
    lastPostedScale.current = undefined;
    apply();
    vp.addEventListener('wheel', onWheel, {
      passive: false
    });
    vp.addEventListener('gesturestart', onGestureStart, {
      passive: false
    });
    vp.addEventListener('gesturechange', onGestureChange, {
      passive: false
    });
    vp.addEventListener('gestureend', onGestureEnd, {
      passive: false
    });
    vp.addEventListener('pointerdown', onPointerDown);
    vp.addEventListener('pointermove', onPointerMove);
    vp.addEventListener('pointerup', onPointerUp);
    vp.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('message', onHostMsg);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('gesturestart', onGestureStart);
      vp.removeEventListener('gesturechange', onGestureChange);
      vp.removeEventListener('gestureend', onGestureEnd);
      vp.removeEventListener('pointerdown', onPointerDown);
      vp.removeEventListener('pointermove', onPointerMove);
      vp.removeEventListener('pointerup', onPointerUp);
      vp.removeEventListener('pointercancel', onPointerUp);
    };
  }, [apply, minScale, maxScale]);
  const gridSvg = `url("data:image/svg+xml,%3Csvg width='120' height='120' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M120 0H0v120' fill='none' stroke='${encodeURIComponent(DC.grid)}' stroke-width='1'/%3E%3C/svg%3E")`;
  return /*#__PURE__*/React.createElement("div", {
    ref: vpRef,
    className: "design-canvas",
    style: {
      height: '100vh',
      width: '100vw',
      background: DC.bg,
      overflow: 'hidden',
      overscrollBehavior: 'none',
      touchAction: 'none',
      position: 'relative',
      fontFamily: DC.font,
      boxSizing: 'border-box',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    ref: worldRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      transformOrigin: '0 0',
      willChange: 'transform',
      width: 'max-content',
      minWidth: '100%',
      minHeight: '100%',
      padding: '60px 0 80px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: -6000,
      backgroundImage: gridSvg,
      backgroundSize: '120px 120px',
      pointerEvents: 'none',
      zIndex: -1
    }
  }), children));
}

// ─────────────────────────────────────────────────────────────
// DCSection — editable title + h-row of artboards in persisted order
// ─────────────────────────────────────────────────────────────
function DCSection({
  id,
  title,
  subtitle,
  children,
  gap = 48
}) {
  const ctx = React.useContext(DCCtx);
  const sid = id ?? title;
  const all = React.Children.toArray(dcFlatten(children));
  const artboards = all.filter(c => c && c.type === DCArtboard);
  const rest = all.filter(c => !(c && c.type === DCArtboard));
  const sec = ctx && sid && ctx.section(sid) || {};
  // Must match DesignCanvas's srcKey computation exactly (it filters falsy
  // IDs), or onDelete persists a srcKey that DesignCanvas never recognizes.
  const allIds = artboards.map(a => a.props.id ?? a.props.label).filter(Boolean);
  const srcKey = allIds.join('\x1f');
  const hidden = sec.srcKey === srcKey ? sec.hidden || [] : [];
  const srcOrder = allIds.filter(k => !hidden.includes(k));
  const order = React.useMemo(() => {
    const kept = (sec.order || []).filter(k => srcOrder.includes(k));
    return [...kept, ...srcOrder.filter(k => !kept.includes(k))];
  }, [sec.order, srcOrder.join('|')]);
  const byId = Object.fromEntries(artboards.map(a => [a.props.id ?? a.props.label, a]));

  // marginBottom counter-scales so the on-screen gap between sections stays
  // constant — otherwise at low zoom the (world-space) gap collapses while
  // the screen-constant sectionhead below it doesn't, and the title reads as
  // belonging to the section above. paddingBottom below is just enough for
  // the 24px artboard-header (abs-positioned above each card) plus ~8px, so
  // the title sits tight against its own row at every zoom.
  return /*#__PURE__*/React.createElement("div", {
    "data-dc-section": sid,
    style: {
      marginBottom: 'calc(80px * var(--dc-inv-zoom, 1))',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '0 60px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-sectionhead",
    style: {
      paddingBottom: 36
    }
  }, /*#__PURE__*/React.createElement(DCEditable, {
    tag: "div",
    value: sec.title ?? title,
    onChange: v => ctx && sid && ctx.patchSection(sid, {
      title: v
    }),
    style: {
      fontSize: 28,
      fontWeight: 600,
      color: DC.title,
      letterSpacing: -0.4,
      marginBottom: 6,
      display: 'inline-block'
    }
  }), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      color: DC.subtitle
    }
  }, subtitle))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap,
      padding: '0 60px',
      alignItems: 'flex-start',
      width: 'max-content'
    }
  }, order.map(k => /*#__PURE__*/React.createElement(DCArtboardFrame, {
    key: k,
    sectionId: sid,
    artboard: byId[k],
    order: order,
    label: (sec.labels || {})[k] ?? byId[k].props.label,
    onRename: v => ctx && ctx.patchSection(sid, x => ({
      labels: {
        ...x.labels,
        [k]: v
      }
    })),
    onReorder: next => ctx && ctx.patchSection(sid, {
      order: next
    }),
    onDelete: () => ctx && ctx.patchSection(sid, x => ({
      hidden: [...(x.srcKey === srcKey ? x.hidden || [] : []), k],
      srcKey
    })),
    onFocus: () => ctx && ctx.setFocus(`${sid}/${k}`)
  }))), rest);
}

// DCArtboard — marker; rendered by DCArtboardFrame via DCSection.
function DCArtboard() {
  return null;
}

// Per-artboard export (kind: 'png' | 'html'). Both paths share the same
// self-contained clone: computed styles baked in, @font-face / <img> /
// inline-style background-image urls inlined as data URIs. PNG wraps the
// clone in foreignObject→canvas at 3× the artboard's natural width×height
// (same pipeline the host uses for page captures); HTML wraps it in a
// minimal standalone document. Both are independent of viewport zoom.
async function dcExport(node, w, h, name, kind) {
  try {
    await document.fonts.ready;
  } catch {}
  const toDataURL = url => fetch(url).then(r => r.blob()).then(b => new Promise(res => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => res(url);
    fr.readAsDataURL(b);
  })).catch(() => url);

  // Collect @font-face rules. ss.cssRules throws SecurityError on
  // cross-origin sheets (e.g. fonts.googleapis.com) — in that case fetch
  // the CSS text directly (those endpoints send ACAO:*) and regex-extract
  // the blocks. @import and @media/@supports are walked so nested
  // @font-face rules aren't missed.
  const fontRules = [],
    pending = [],
    seen = new Set();
  const scrapeCss = href => {
    if (seen.has(href)) return;
    seen.add(href);
    pending.push(fetch(href).then(r => r.text()).then(css => {
      for (const m of css.match(/@font-face\s*{[^}]*}/g) || []) fontRules.push({
        css: m,
        base: href
      });
      for (const m of css.matchAll(/@import\s+(?:url\()?['"]?([^'")\s;]+)/g)) scrapeCss(new URL(m[1], href).href);
    }).catch(() => {}));
  };
  const walk = (rules, base) => {
    for (const r of rules) {
      if (r.type === CSSRule.FONT_FACE_RULE) fontRules.push({
        css: r.cssText,
        base
      });else if (r.type === CSSRule.IMPORT_RULE && r.styleSheet) {
        const ibase = r.styleSheet.href || base;
        try {
          walk(r.styleSheet.cssRules, ibase);
        } catch {
          scrapeCss(ibase);
        }
      } else if (r.cssRules) walk(r.cssRules, base);
    }
  };
  for (const ss of document.styleSheets) {
    const base = ss.href || location.href;
    try {
      walk(ss.cssRules, base);
    } catch {
      if (ss.href) scrapeCss(ss.href);
    }
  }
  while (pending.length) await pending.shift();
  const fontCss = (await Promise.all(fontRules.map(async rule => {
    let out = rule.css,
      m;
    const re = /url\((['"]?)([^'")]+)\1\)/g;
    while (m = re.exec(rule.css)) {
      if (m[2].indexOf('data:') === 0) continue;
      let abs;
      try {
        abs = new URL(m[2], rule.base).href;
      } catch {
        continue;
      }
      out = out.split(m[0]).join('url("' + (await toDataURL(abs)) + '")');
    }
    return out;
  }))).join('\n');
  const cloneStyled = src => {
    if (src.nodeType === 8 || src.nodeType === 1 && src.tagName === 'SCRIPT') return document.createTextNode('');
    const dst = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = getComputedStyle(src);
      let txt = '';
      for (let i = 0; i < cs.length; i++) txt += cs[i] + ':' + cs.getPropertyValue(cs[i]) + ';';
      dst.setAttribute('style', txt + 'animation:none;transition:none;');
      if (src.tagName === 'CANVAS') try {
        const im = document.createElement('img');
        im.src = src.toDataURL();
        im.setAttribute('style', txt);
        return im;
      } catch {}
    }
    for (let c = src.firstChild; c; c = c.nextSibling) dst.appendChild(cloneStyled(c));
    return dst;
  };
  const clone = cloneStyled(node);
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  // Drop the card's own shadow/radius so the export is a flush w×h rect;
  // the artboard's own background (if any) is already in the computed style.
  clone.style.boxShadow = 'none';
  clone.style.borderRadius = '0';
  const jobs = [];
  clone.querySelectorAll('img').forEach(el => {
    const s = el.getAttribute('src');
    if (s && s.indexOf('data:') !== 0) jobs.push(toDataURL(el.src).then(d => el.setAttribute('src', d)));
  });
  [clone, ...clone.querySelectorAll('*')].forEach(el => {
    const bg = el.style.backgroundImage;
    if (!bg) return;
    let m;
    const re = /url\(["']?([^"')]+)["']?\)/g;
    while (m = re.exec(bg)) {
      const tok = m[0],
        url = m[1];
      if (url.indexOf('data:') === 0) continue;
      jobs.push(toDataURL(url).then(d => {
        el.style.backgroundImage = el.style.backgroundImage.split(tok).join('url("' + d + '")');
      }));
    }
  });
  await Promise.all(jobs);
  const xml = new XMLSerializer().serializeToString(clone);
  const save = (blob, ext) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  if (kind === 'html') {
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title>' + (fontCss ? '<style>' + fontCss + '</style>' : '') + '</head><body style="margin:0">' + xml + '</body></html>';
    return save(new Blob([html], {
      type: 'text/html'
    }), 'html');
  }

  // PNG: the SVG's own width/height must be the output resolution — an
  // <img>-loaded SVG rasterizes at its intrinsic size, so sizing it at 1×
  // and ctx.scale()-ing up would just upscale a 1× bitmap. viewBox maps the
  // w×h foreignObject onto the px·w × px·h SVG canvas so the browser renders
  // the HTML at full resolution.
  const px = 3;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w * px + '" height="' + h * px + '" viewBox="0 0 ' + w + ' ' + h + '"><foreignObject width="' + w + '" height="' + h + '">' + (fontCss ? '<style><![CDATA[' + fontCss + ']]></style>' : '') + xml + '</foreignObject></svg>';
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = () => rej(new Error('svg load failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const cv = document.createElement('canvas');
  cv.width = w * px;
  cv.height = h * px;
  cv.getContext('2d').drawImage(img, 0, 0);
  cv.toBlob(blob => save(blob, 'png'), 'image/png');
}
function DCArtboardFrame({
  sectionId,
  artboard,
  label,
  order,
  onRename,
  onReorder,
  onFocus,
  onDelete
}) {
  const {
    id: rawId,
    label: rawLabel,
    width = 260,
    height = 480,
    children,
    style = {}
  } = artboard.props;
  const id = rawId ?? rawLabel;
  const ref = React.useRef(null);
  const cardRef = React.useRef(null);
  const menuRef = React.useRef(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // ⋯ menu: close on any outside pointerdown. Two-click delete lives inside
  // the menu — first click arms the row, second commits; closing disarms.
  React.useEffect(() => {
    if (!menuOpen) {
      setConfirming(false);
      return;
    }
    const off = e => {
      if (!menuRef.current || !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', off, true);
    return () => document.removeEventListener('pointerdown', off, true);
  }, [menuOpen]);
  const doExport = kind => {
    setMenuOpen(false);
    if (!cardRef.current) return;
    const name = String(label || id || 'artboard').replace(/[^\w\s.-]+/g, '_');
    dcExport(cardRef.current, width, height, name, kind).catch(e => console.error('[design-canvas] export failed:', e));
  };

  // Live drag-reorder: dragged card sticks to cursor; siblings slide into
  // their would-be slots in real time via transforms. DOM order only
  // changes on drop.
  const onGripDown = e => {
    e.preventDefault();
    e.stopPropagation();
    const me = ref.current;
    // translateX is applied in local (pre-scale) space but pointer deltas and
    // getBoundingClientRect().left are screen-space — divide by the viewport's
    // current scale so the dragged card tracks the cursor at any zoom level.
    const scale = me.getBoundingClientRect().width / me.offsetWidth || 1;
    const peers = Array.from(document.querySelectorAll(`[data-dc-section="${sectionId}"] [data-dc-slot]`));
    const homes = peers.map(el => ({
      el,
      id: el.dataset.dcSlot,
      x: el.getBoundingClientRect().left
    }));
    const slotXs = homes.map(h => h.x);
    const startIdx = order.indexOf(id);
    const startX = e.clientX;
    let liveOrder = order.slice();
    me.classList.add('dc-dragging');
    const layout = () => {
      for (const h of homes) {
        if (h.id === id) continue;
        const slot = liveOrder.indexOf(h.id);
        h.el.style.transform = `translateX(${(slotXs[slot] - h.x) / scale}px)`;
      }
    };
    const move = ev => {
      const dx = ev.clientX - startX;
      me.style.transform = `translateX(${dx / scale}px)`;
      const cur = homes[startIdx].x + dx;
      let nearest = 0,
        best = Infinity;
      for (let i = 0; i < slotXs.length; i++) {
        const d = Math.abs(slotXs[i] - cur);
        if (d < best) {
          best = d;
          nearest = i;
        }
      }
      if (liveOrder.indexOf(id) !== nearest) {
        liveOrder = order.filter(k => k !== id);
        liveOrder.splice(nearest, 0, id);
        layout();
      }
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      const finalSlot = liveOrder.indexOf(id);
      me.classList.remove('dc-dragging');
      me.style.transform = `translateX(${(slotXs[finalSlot] - homes[startIdx].x) / scale}px)`;
      // After the settle transition, kill transitions + clear transforms +
      // commit the reorder in the same frame so there's no visual snap-back.
      setTimeout(() => {
        for (const h of homes) {
          h.el.style.transition = 'none';
          h.el.style.transform = '';
        }
        if (liveOrder.join('|') !== order.join('|')) onReorder(liveOrder);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          for (const h of homes) h.el.style.transition = '';
        }));
      }, 180);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
  };
  return /*#__PURE__*/React.createElement("div", {
    ref: ref,
    "data-dc-slot": id,
    style: {
      position: 'relative',
      flexShrink: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-header",
    "data-omelette-chrome": "",
    style: {
      color: DC.label
    },
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-labelrow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dc-grip",
    onPointerDown: onGripDown,
    title: "Drag to reorder"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "9",
    height: "13",
    viewBox: "0 0 9 13",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "2",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "6.5",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "2",
    cy: "11",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "7",
    cy: "11",
    r: "1.1"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-labeltext",
    onClick: onFocus,
    title: "Click to focus"
  }, /*#__PURE__*/React.createElement(DCEditable, {
    value: label,
    onChange: onRename,
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 15,
      fontWeight: 500,
      color: DC.label,
      lineHeight: 1
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "dc-btns"
  }, /*#__PURE__*/React.createElement("div", {
    ref: menuRef,
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "dc-kebab",
    title: "More",
    onClick: () => setMenuOpen(o => !o)
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "2.5",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "6",
    cy: "6",
    r: "1.1"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9.5",
    cy: "6",
    r: "1.1"
  }))), menuOpen && /*#__PURE__*/React.createElement("div", {
    className: "dc-menu",
    onPointerDown: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('png')
  }, "Download PNG"), /*#__PURE__*/React.createElement("button", {
    onClick: () => doExport('html')
  }, "Download HTML"), /*#__PURE__*/React.createElement("hr", null), /*#__PURE__*/React.createElement("button", {
    className: "dc-danger",
    onClick: () => {
      if (confirming) {
        setMenuOpen(false);
        onDelete();
      } else setConfirming(true);
    }
  }, confirming ? 'Click again to delete' : 'Delete'))), /*#__PURE__*/React.createElement("button", {
    className: "dc-expand",
    onClick: onFocus,
    title: "Focus"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "12",
    height: "12",
    viewBox: "0 0 12 12",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M7 1h4v4M5 11H1V7M11 1L7.5 4.5M1 11l3.5-3.5"
  }))))), /*#__PURE__*/React.createElement("div", {
    ref: cardRef,
    className: "dc-card",
    style: {
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,.08),0 4px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      width,
      height,
      background: '#fff',
      ...style
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb',
      fontSize: 13,
      fontFamily: DC.font
    }
  }, id)));
}

// Inline rename — commits on blur or Enter.
function DCEditable({
  value,
  onChange,
  style,
  tag = 'span',
  onClick
}) {
  const T = tag;
  return /*#__PURE__*/React.createElement(T, {
    className: "dc-editable",
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: onClick,
    onPointerDown: e => e.stopPropagation(),
    onBlur: e => onChange && onChange(e.currentTarget.textContent),
    onKeyDown: e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.currentTarget.blur();
      }
    },
    style: style
  }, value);
}

// ─────────────────────────────────────────────────────────────
// Focus mode — overlay one artboard; ←/→ within section, ↑/↓ across
// sections, Esc or backdrop click to exit.
// ─────────────────────────────────────────────────────────────
function DCFocusOverlay({
  entry,
  sectionMeta,
  sectionOrder
}) {
  const ctx = React.useContext(DCCtx);
  const {
    sectionId,
    artboard
  } = entry;
  const sec = ctx.section(sectionId);
  const meta = sectionMeta[sectionId];
  const peers = meta.slotIds;
  const aid = artboard.props.id ?? artboard.props.label;
  const idx = peers.indexOf(aid);
  const secIdx = sectionOrder.indexOf(sectionId);
  const go = d => {
    const n = peers[(idx + d + peers.length) % peers.length];
    if (n) ctx.setFocus(`${sectionId}/${n}`);
  };
  const goSection = d => {
    // Sections whose artboards are all deleted have slotIds:[] — step past
    // them to the next non-empty section so ↑/↓ doesn't dead-end.
    const n = sectionOrder.length;
    for (let i = 1; i < n; i++) {
      const ns = sectionOrder[((secIdx + d * i) % n + n) % n];
      const first = sectionMeta[ns] && sectionMeta[ns].slotIds[0];
      if (first) {
        ctx.setFocus(`${ns}/${first}`);
        return;
      }
    }
  };
  React.useEffect(() => {
    const k = e => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        go(-1);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        go(1);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        goSection(-1);
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        goSection(1);
      }
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });
  const {
    width = 260,
    height = 480,
    children
  } = artboard.props;
  const [vp, setVp] = React.useState({
    w: window.innerWidth,
    h: window.innerHeight
  });
  React.useEffect(() => {
    const r = () => setVp({
      w: window.innerWidth,
      h: window.innerHeight
    });
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const scale = Math.max(0.1, Math.min((vp.w - 200) / width, (vp.h - 260) / height, 2));
  const [ddOpen, setDd] = React.useState(false);
  const Arrow = ({
    dir,
    onClick
  }) => /*#__PURE__*/React.createElement("button", {
    onClick: e => {
      e.stopPropagation();
      onClick();
    },
    style: {
      position: 'absolute',
      top: '50%',
      [dir]: 28,
      transform: 'translateY(-50%)',
      border: 'none',
      background: 'rgba(255,255,255,.08)',
      color: 'rgba(255,255,255,.9)',
      width: 44,
      height: 44,
      borderRadius: 22,
      fontSize: 18,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .15s'
    },
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.18)',
    onMouseLeave: e => e.currentTarget.style.background = 'rgba(255,255,255,.08)'
  }, /*#__PURE__*/React.createElement("svg", {
    width: "18",
    height: "18",
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: dir === 'left' ? 'M11 3L5 9l6 6' : 'M7 3l6 6-6 6'
  })));

  // Portal to body so position:fixed is the real viewport regardless of any
  // transform on DesignCanvas's ancestors (including the canvas zoom itself).
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement("div", {
    onClick: () => ctx.setFocus(null),
    onWheel: e => e.preventDefault(),
    style: {
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      background: 'rgba(24,20,16,.6)',
      backdropFilter: 'blur(14px)',
      fontFamily: DC.font,
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 72,
      display: 'flex',
      alignItems: 'flex-start',
      padding: '16px 20px 0',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setDd(o => !o),
    style: {
      border: 'none',
      background: 'transparent',
      color: '#fff',
      cursor: 'pointer',
      padding: '6px 8px',
      borderRadius: 6,
      textAlign: 'left',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 18,
      fontWeight: 600,
      letterSpacing: -0.3
    }
  }, meta.title), /*#__PURE__*/React.createElement("svg", {
    width: "11",
    height: "11",
    viewBox: "0 0 11 11",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    style: {
      opacity: .7
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: "M2 4l3.5 3.5L9 4"
  }))), meta.subtitle && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      opacity: .6,
      fontWeight: 400,
      marginTop: 2
    }
  }, meta.subtitle)), ddOpen && /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: '100%',
      left: 0,
      marginTop: 4,
      background: '#2a251f',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,.4)',
      padding: 4,
      minWidth: 200,
      zIndex: 10
    }
  }, sectionOrder.filter(sid => sectionMeta[sid].slotIds.length).map(sid => /*#__PURE__*/React.createElement("button", {
    key: sid,
    onClick: () => {
      setDd(false);
      const f = sectionMeta[sid].slotIds[0];
      if (f) ctx.setFocus(`${sid}/${f}`);
    },
    style: {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: 'none',
      cursor: 'pointer',
      background: sid === sectionId ? 'rgba(255,255,255,.1)' : 'transparent',
      color: '#fff',
      padding: '8px 12px',
      borderRadius: 5,
      fontSize: 14,
      fontWeight: sid === sectionId ? 600 : 400,
      fontFamily: 'inherit'
    }
  }, sectionMeta[sid].title)))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => ctx.setFocus(null),
    onMouseEnter: e => e.currentTarget.style.background = 'rgba(255,255,255,.12)',
    onMouseLeave: e => e.currentTarget.style.background = 'transparent',
    style: {
      border: 'none',
      background: 'transparent',
      color: 'rgba(255,255,255,.7)',
      width: 32,
      height: 32,
      borderRadius: 16,
      fontSize: 20,
      cursor: 'pointer',
      lineHeight: 1,
      transition: 'background .12s'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 64,
      bottom: 56,
      left: 100,
      right: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width: width * scale,
      height: height * scale,
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      width,
      height,
      transform: `scale(${scale})`,
      transformOrigin: 'top left',
      background: '#fff',
      borderRadius: 2,
      overflow: 'hidden',
      boxShadow: '0 20px 80px rgba(0,0,0,.4)'
    }
  }, children || /*#__PURE__*/React.createElement("div", {
    style: {
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#bbb'
    }
  }, aid))), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      fontSize: 14,
      fontWeight: 500,
      opacity: .85,
      textAlign: 'center'
    }
  }, (sec.labels || {})[aid] ?? artboard.props.label, /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: .5,
      marginLeft: 10,
      fontVariantNumeric: 'tabular-nums'
    }
  }, idx + 1, " / ", peers.length))), /*#__PURE__*/React.createElement(Arrow, {
    dir: "left",
    onClick: () => go(-1)
  }), /*#__PURE__*/React.createElement(Arrow, {
    dir: "right",
    onClick: () => go(1)
  }), /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: 8
    }
  }, peers.map((p, i) => /*#__PURE__*/React.createElement("button", {
    key: p,
    onClick: () => ctx.setFocus(`${sectionId}/${p}`),
    style: {
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      width: 6,
      height: 6,
      borderRadius: 3,
      background: i === idx ? '#fff' : 'rgba(255,255,255,.3)'
    }
  })))), document.body);
}

// ─────────────────────────────────────────────────────────────
// Post-it — absolute-positioned sticky note
// ─────────────────────────────────────────────────────────────
function DCPostIt({
  children,
  top,
  left,
  right,
  bottom,
  rotate = -2,
  width = 180
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top,
      left,
      right,
      bottom,
      width,
      background: DC.postitBg,
      padding: '14px 16px',
      fontFamily: '"Comic Sans MS", "Marker Felt", "Segoe Print", cursive',
      fontSize: 14,
      lineHeight: 1.4,
      color: DC.postitText,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
      transform: `rotate(${rotate}deg)`,
      zIndex: 5
    }
  }, children);
}
Object.assign(window, {
  DesignCanvas,
  DCSection,
  DCArtboard,
  DCPostIt
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/design-canvas.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/icons-team-1.jsx
try { (() => {
/* icons-team-1.jsx — Team member emblems, batch 1: Instruments & Notation.
   Monoline family, 24px grid, stroke currentColor. Brass accents = .ti-acc. */

const TEAM_ICONS_1 = [{
  id: 'violin',
  name: 'Violin',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "2.6",
    r: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3.6V6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 6c-2.4 0-3.8 1.7-3.8 3.5 0 1 .6 1.7.6 2.5s-.6 1.5-.6 2.5C8.2 19.3 9.6 21 12 21s3.8-1.7 3.8-4.5c0-1-.6-1.7-.6-2.5s.6-1.5.6-2.5C15.8 7.7 14.4 6 12 6z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M12 8.5v9.5"
  }))
}, {
  id: 'cello',
  name: 'Cello',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "2.4",
    r: ".9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3.3V5.5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M12 21v2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5.5c-2.6 0-4.1 1.9-4.1 3.8 0 1.1.6 1.8.6 2.7s-.6 1.6-.6 2.7C7.9 18.9 9.4 21 12 21s4.1-2.1 4.1-4.3c0-1.1-.6-1.8-.6-2.7s.6-1.7.6-2.7C16.1 7.4 14.6 5.5 12 5.5z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7.5v11"
  }))
}, {
  id: 'piano',
  name: 'Piano',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "4",
    y: "6.5",
    width: "16",
    height: "11.5",
    rx: "1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 13.5h16"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 13.5V18M12 13.5V18M16 13.5V18"
  }), /*#__PURE__*/React.createElement("rect", {
    className: "ti-acc",
    x: "6.7",
    y: "6.5",
    width: "1.4",
    height: "4.2",
    rx: ".3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    className: "ti-acc",
    x: "10.4",
    y: "6.5",
    width: "1.4",
    height: "4.2",
    rx: ".3",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("rect", {
    className: "ti-acc",
    x: "14.1",
    y: "6.5",
    width: "1.4",
    height: "4.2",
    rx: ".3",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'grand',
  name: 'Grand piano',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 5h7c4.4 0 7 2.8 7 7s-2.6 7-7 7H8a2 2 0 01-2-2V5z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9.5 5v14"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9.5 8.5h7"
  }))
}, {
  id: 'trumpet',
  name: 'Trumpet',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 12h3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 12h9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M15 8.6c2.6-.6 4.5.4 4.5 3.4s-1.9 4-4.5 3.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M15 8.6v6.8"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M8 12V8.8M11 12V8.8M14 12V8.8"
  }))
}, {
  id: 'horn',
  name: 'French horn',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "13",
    cy: "12",
    r: "6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "13",
    cy: "12",
    r: "2.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 12c-2 0-3.5-1.4-3.5-3.2S5 6 6.5 6.4"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M13 6v3"
  }))
}, {
  id: 'sax',
  name: 'Saxophone',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M11 3v8c0 3-1 5-3.5 5.4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7.5 16.4c-2.2.3-3.5-1-3.5-2.7 0-1.4 1-2.4 2.3-2.4 1 0 1.7.6 1.7 1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "13",
    cy: "3",
    r: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3h1"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M11 6.5h-.01M11 9h-.01"
  }))
}, {
  id: 'flute',
  name: 'Flute',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 9.5l15-4.5a1.4 1.4 0 011 2.6l-15 4.5A1.4 1.4 0 014 9.5z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M8 9.3h.01M11 8.4h.01M14 7.5h.01"
  }))
}, {
  id: 'clarinet',
  name: 'Clarinet',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M8 3l8 14.5a2 2 0 01-3.5 2L4.5 5",
    transform: "rotate(8 12 12)"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9.5 7.5h.01M11 10h.01M12.5 12.5h.01",
    transform: "rotate(8 12 12)"
  }))
}, {
  id: 'harp',
  name: 'Harp',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 4v14"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 4c8 0 11 4 11 13"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9 7v8M12 9v6.5M14.5 12v4"
  }))
}, {
  id: 'snare',
  name: 'Snare drum',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("ellipse", {
    cx: "12",
    cy: "8",
    rx: "8",
    ry: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 8v5c0 1.7 3.6 3 8 3s8-1.3 8-3V8"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M6 10.5l2.5 3M12 11v3.5M18 10.5l-2.5 3"
  }))
}, {
  id: 'timpani',
  name: 'Timpani',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("ellipse", {
    cx: "12",
    cy: "7.5",
    rx: "8",
    ry: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 8c-.6 3 .4 8 2 9.5M19 8c.6 3-.4 8-2 9.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 17.5h10"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M16 4l3-1.5"
  }))
}, {
  id: 'guitar',
  name: 'Guitar',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M11.5 8.5c-2.4 0-4 1.7-4 3.8 0 1.1.5 1.7.5 2.6 0 1.9-1.2 3.3.8 4.4 1 .6 3.4.6 4.4 0 2-1.1.8-2.5.8-4.4 0-.9.5-1.5.5-2.6 0-2.1-1.6-3.8-3-3.8"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11.7",
    cy: "13.8",
    r: "1.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M13 8.5l4-5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M17 3.5l1.5-1"
  }))
}, {
  id: 'bass',
  name: 'Double bass',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "2.4",
    r: ".9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3.3V5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M12 21.5v1.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 5c-2.8 0-4.4 2-4.4 4 0 1.2.7 1.9.7 2.9s-.7 1.7-.7 2.9c0 2.6 1.6 4.7 4.4 4.7s4.4-2.1 4.4-4.7c0-1.2-.7-1.9-.7-2.9s.7-1.8.7-2.9c0-2-1.6-4-4.4-4z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 7v12"
  }))
}, {
  id: 'xylophone',
  name: 'Xylophone',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 16l2-9M9 16l1.3-9M14 16l.7-9M19 15.5V7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M3.5 16h16"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M15 4.5l2.5 1.5"
  }))
}, {
  id: 'baton',
  name: 'Baton',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 19.5l11-11"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "16.5",
    cy: "7",
    r: "2.4",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "4.5",
    cy: "19",
    r: "1.2"
  }))
}, {
  id: 'metronome',
  name: 'Metronome',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 4h6l3 16H6z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M13.5 6.5l-2 9"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 15h10"
  }))
}, {
  id: 'tuningfork',
  name: 'Tuning fork',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M8 3v7a4 4 0 008 0V3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 14v6"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9.5 20.5h5"
  }))
}, {
  id: 'stand',
  name: 'Music stand',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 6h12l-2 5H8z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 11v8"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M8.5 20.5l3.5-2 3.5 2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 4v2"
  }))
}, {
  id: 'treble',
  name: 'Treble clef',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M13 3c-1.6.4-2.5 2-2.5 3.8 0 2.3 2.5 3.6 2.5 6.4 0 2-1.4 3.3-3 3.3-1.3 0-2.2-.9-2.2-2 0-.9.6-1.6 1.5-1.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11.5 6.5L12 18.5c.1 2-.8 3-2.4 3"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "9.2",
    cy: "20",
    r: "1.1",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'quaver',
  name: 'Quaver',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("ellipse", {
    cx: "8",
    cy: "17",
    rx: "2.6",
    ry: "2",
    transform: "rotate(-20 8 17)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.3 16V5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M10.3 5c2.5.6 4 2 4 4.5"
  }))
}, {
  id: 'beamed',
  name: 'Beamed notes',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("ellipse", {
    cx: "7",
    cy: "17",
    rx: "2.3",
    ry: "1.8",
    transform: "rotate(-20 7 17)"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "16",
    cy: "15.5",
    rx: "2.3",
    ry: "1.8",
    transform: "rotate(-20 16 15.5)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 16.3V6M18 14.8V4.5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9 6l9-1.5v2.5L9 8.5z",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'rest',
  name: 'Rest',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M10 4c1.5 1.5 1 3-1 4 2.5 1 3 2.5 1.5 4.5 1.5 0 2.5 1 2.5 2.4 0 1.5-1.2 2.6-2.8 2.6"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M11 20c-1.6 0-2.6-1-2.6-2.2"
  }))
}, {
  id: 'crescendo',
  name: 'Crescendo',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M19 6L5 12l14 6"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M5 12h9"
  }))
}, {
  id: 'pitch',
  name: 'Pitch pegs',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "8",
    y: "3",
    width: "8",
    height: "13",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 16v5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M8 7h-2M8 10h-2M16 7h2M16 10h2"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "21",
    r: "1"
  }))
}];
Object.assign(window, {
  TEAM_ICONS_1
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/icons-team-1.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/icons-team-2.jsx
try { (() => {
/* icons-team-2.jsx — Team member emblems, batch 2: Atelier & Celestial.
   Same monoline family. Brass accents = .ti-acc. */

const TEAM_ICONS_2 = [{
  id: 'quill',
  name: 'Quill',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M4 20c6-1 9-3 12-7 2.5-3.3 3-7 3-9-2.5.6-6 1.4-9 4-3 2.6-4.5 6-6 12z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9 15c2-1 4-2.5 5.5-4.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 20l3-3"
  }))
}, {
  id: 'inkwell',
  name: 'Inkwell',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 11h12v4a4 4 0 01-4 4h-4a4 4 0 01-4-4z"
  }), /*#__PURE__*/React.createElement("ellipse", {
    cx: "12",
    cy: "11",
    rx: "6",
    ry: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14 11V4l3-1.5"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "12",
    cy: "14.5",
    r: "1.6",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'compass',
  name: 'Compass',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "12",
    cy: "4.5",
    r: "1.4",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11.4 5.6L6 19M12.6 5.6L18 19"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8.7 12.5l6.6 0"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 19l1.5-1.5M18 19l-1.5-1.5"
  }))
}, {
  id: 'triangle',
  name: 'Set square',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 5v14h14z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 14h5v5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M5 9h2M5 12h2"
  }))
}, {
  id: 'gear',
  name: 'Gear',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 3v2.5M12 18.5V21M21 12h-2.5M5.5 12H3M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8M18.4 18.4l-1.8-1.8M7.4 7.4L5.6 5.6"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "12",
    cy: "12",
    r: ".8",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'anvil',
  name: 'Anvil',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 8h11c0 2-1.5 3-3.5 3H10c3 0 5 1.5 5 4H7c0-2 1-3 1-3H5a2 2 0 010-4z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 19h6"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M11 15v4"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M17 8h2"
  }))
}, {
  id: 'beaker',
  name: 'Beaker',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M9 3v6l-4 8.5a2 2 0 001.8 2.9h10.4A2 2 0 0019 17.5L15 9V3"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M8 3h8"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M7 14h10"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "11",
    cy: "17",
    r: ".7",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "14",
    cy: "18",
    r: ".5",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'mortar',
  name: 'Mortar',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 11h14c0 4-3 7-7 7s-7-3-7-7z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 11h16"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M13 10l5-7"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10 18v2.5M14 18v2.5M8 20.5h8"
  }))
}, {
  id: 'telescope',
  name: 'Telescope',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3.5 13.5l11-5 1.6 3.4-11 5z",
    transform: "rotate(-4 9 11)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M14.5 8.5l3-1.4 1.6 3.4-3 1.4z",
    transform: "rotate(-4 9 11)"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 14.5L6 21M10 13L13 20"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9 20h-4"
  }))
}, {
  id: 'hourglass',
  name: 'Hourglass',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 3h12M6 21h12"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M10 18h4"
  }))
}, {
  id: 'candle',
  name: 'Candle',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "9",
    y: "9",
    width: "6",
    height: "11",
    rx: "1"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 9V7"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M12 6.5c1.5-1 1.5-2.5.5-4-.3 1.5-2 1.5-2 3 0 .6.6 1 1.5 1z",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M7 20h10"
  }))
}, {
  id: 'lantern',
  name: 'Lantern',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("rect", {
    x: "7",
    y: "6",
    width: "10",
    height: "12",
    rx: "2"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M9 3h6M12 3v3M8 18l-1 2M16 18l1 2"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "12",
    cy: "12",
    r: "2.4",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'key',
  name: 'Key',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M10.8 10.8L20 20"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M17 17l2-2M14 14l2-2"
  }))
}, {
  id: 'magnet',
  name: 'Magnet',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M6 4v8a6 6 0 0012 0V4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 9h4M14 9h4"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M6 4h4v5H6zM14 4h4v5h-4z",
    fill: "currentColor",
    stroke: "none",
    opacity: "0.9"
  }))
}, {
  id: 'sun',
  name: 'Sun',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12 2.5V5M12 19v2.5M21.5 12H19M5 12H2.5M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7M18.4 18.4l-1.7-1.7M7.3 7.3L5.6 5.6"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "12",
    cy: "12",
    r: "1.4",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'moon',
  name: 'Crescent',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M20 13.5A8 8 0 119.5 4 6.4 6.4 0 0020 13.5z"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "15.5",
    cy: "8.5",
    r: ".9",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'comet',
  name: 'Comet',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
    cx: "16",
    cy: "8",
    r: "3.5"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M13.5 10.5L4 20M16 11.5l-6 8.5M11.5 9l-6 6"
  }))
}, {
  id: 'star',
  name: 'Star',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l2.5 5.7 6.2.6-4.7 4.1 1.4 6.1L12 16.9 6.6 19.6 8 13.5 3.3 9.4l6.2-.6z"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "12",
    cy: "11.5",
    r: "1.1",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'constellation',
  name: 'Constellation',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M5 6l5 4 4-3 5 6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "5",
    cy: "6",
    r: "1.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "10",
    cy: "10",
    r: "1.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "14",
    cy: "7",
    r: "1.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "19",
    cy: "13",
    r: "1.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "18",
    r: "1.3"
  }))
}, {
  id: 'mountain',
  name: 'Summit',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 19l6-11 4 6 2-3 6 8z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M7.5 13l1.5-2.5 1.5 2.5z",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'wave',
  name: 'Wave',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M3 9c2-2 4-2 6 0M3 14c2-2 4-2 6 0M3 19c2-2 4-2 6 0"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M13 7c3-3 6-3 8 0 2 3-1 6-4 4"
  }))
}, {
  id: 'leaf',
  name: 'Leaf',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M20 4C9 4 4 9 4 17c0 1 0 2 .5 3C12 19 18 14 20 4z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M5 19c4-7 8-10 13-12"
  }))
}, {
  id: 'feather',
  name: 'Feather',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M19 5c-7-2-13 3-13 10v3l3-3c5 0 11-3 10-10z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M6 18L10 14M16 7l-4 4M14 11l-3 0M16 7l0 3"
  }))
}, {
  id: 'flame',
  name: 'Flame',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3c0 4-5 5-5 10a5 5 0 0010 0c0-2-1-3.5-2.5-5C13 9 13 6 12 3z"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M12 19a2.5 2.5 0 002-4c0 2-2 1.5-2 4z",
    fill: "currentColor",
    stroke: "none"
  }))
}, {
  id: 'crystal',
  name: 'Crystal',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M12 3l6 5-6 13-6-13z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M6 8h12M12 3v18"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M9 8l3-5 3 5"
  }))
}, {
  id: 'owl',
  name: 'Owl',
  svg: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("path", {
    d: "M5 9a7 7 0 1114 0v4a7 7 0 01-14 0z"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M5 9L3 5M19 9l2-4"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "9",
    cy: "10",
    r: "1.6"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "15",
    cy: "10",
    r: "1.6"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "9",
    cy: "10",
    r: ".5",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "ti-acc",
    cx: "15",
    cy: "10",
    r: ".5",
    fill: "currentColor",
    stroke: "none"
  }), /*#__PURE__*/React.createElement("path", {
    className: "ti-acc",
    d: "M12 12.5l-1 1.5h2z",
    fill: "currentColor",
    stroke: "none"
  }))
}];
Object.assign(window, {
  TEAM_ICONS_2
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/icons-team-2.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/icons-team-show.jsx
try { (() => {
/* icons-team-show.jsx — renders all 50 emblems + style variants. */

function Tile({
  icon,
  cls
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: 'ti-tile ' + (cls || '')
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24"
  }, icon.svg));
}
function Gallery() {
  const all = [...window.TEAM_ICONS_1, ...window.TEAM_ICONS_2];
  const instruments = window.TEAM_ICONS_1.slice(0, 15);
  const notation = window.TEAM_ICONS_1.slice(15);
  const atelier = window.TEAM_ICONS_2.slice(0, 14);
  const celestial = window.TEAM_ICONS_2.slice(14);
  const hero = all.find(i => i.id === 'baton');
  const Section = ({
    label,
    count,
    items
  }) => /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "ti-cap"
  }, label, " ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--pn-ink-4)'
    }
  }, "\xB7 ", count), /*#__PURE__*/React.createElement("span", {
    className: "ln"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ti-grid"
  }, items.map(ic => /*#__PURE__*/React.createElement("div", {
    className: "ti-cell",
    key: ic.id,
    title: ic.id
  }, /*#__PURE__*/React.createElement(Tile, {
    icon: ic
  }), /*#__PURE__*/React.createElement("span", {
    className: "ti-name"
  }, ic.name)))));
  return /*#__PURE__*/React.createElement("div", {
    className: "ti-stage"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "ti-h"
  }, "Team member emblems"), /*#__PURE__*/React.createElement("p", {
    className: "ti-sub"
  }, "Fifty bespoke avatars in one monoline family \u2014 instruments, notation, atelier tools and celestial marks \u2014 drawn on a 24px grid with a single brass accent each. Pick a glyph + a tile style per member."), /*#__PURE__*/React.createElement("div", {
    className: "ti-cap"
  }, "Tile styles", /*#__PURE__*/React.createElement("span", {
    className: "ln"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ti-variants"
  }, [['Paper', ''], ['Ring', 'ti-tile--ring'], ['Tint', 'ti-tile--tint'], ['Sage', 'ti-tile--sage'], ['Solid', 'ti-tile--solid'], ['Ink', 'ti-tile--ink']].map(([label, cls]) => /*#__PURE__*/React.createElement("div", {
    className: "ti-vcol",
    key: label
  }, /*#__PURE__*/React.createElement(Tile, {
    icon: hero,
    cls: 'ti-tile--lg ' + cls
  }), /*#__PURE__*/React.createElement("span", {
    className: "ti-vlabel"
  }, label)))), /*#__PURE__*/React.createElement(Section, {
    label: "Instruments",
    count: instruments.length,
    items: instruments
  }), /*#__PURE__*/React.createElement(Section, {
    label: "Notation & conducting",
    count: notation.length,
    items: notation
  }), /*#__PURE__*/React.createElement(Section, {
    label: "Atelier & craft",
    count: atelier.length,
    items: atelier
  }), /*#__PURE__*/React.createElement(Section, {
    label: "Celestial & nature",
    count: celestial.length,
    items: celestial
  }));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Gallery, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/icons-team-show.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/kit.jsx
try { (() => {
/* kit.jsx — shared line icons + the Maestro mark. Exports to window. */
const PN_ICONS = {
  search: 'M11 11l3.5 3.5M7.5 13a5.5 5.5 0 100-11 5.5 5.5 0 000 11z',
  plus: 'M8 3.5v9M3.5 8h9',
  chevronR: 'M6 3.5L10.5 8 6 12.5',
  chevronD: 'M3.5 6L8 10.5 12.5 6',
  chevronL: 'M10 3.5L5.5 8 10 12.5',
  sliders: 'M3 5h7M12.5 5H13M3 11h.5M6 11h7M9 3.5v3M5 9.5v3',
  play: 'M5 3.5l7 4.5-7 4.5z',
  settings: 'M8 10a2 2 0 100-4 2 2 0 000 4zM8 1.5v1.5M8 13v1.5M3.05 3.05l1.06 1.06M11.9 11.9l1.05 1.05M1.5 8H3M13 8h1.5M3.05 12.95l1.06-1.06M11.9 4.1l1.05-1.05',
  pin: 'M6 2h4l-.5 3.5L11 8H5l1.5-2.5L6 2zM8 8v5',
  more: 'M4 8h.01M8 8h.01M12 8h.01',
  check: 'M3.5 8.5L6.5 11.5 12.5 5',
  clock: 'M8 4.5V8l2.5 1.5M8 14A6 6 0 108 2a6 6 0 000 12z',
  gitBranch: 'M5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM5 5v3a3 3 0 003 3M12.5 3.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM11 5v.5a3 3 0 01-3 3M5 12.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z',
  listChecks: 'M3 4l1 1 1.5-1.5M3 9l1 1 1.5-1.5M8 4h5M8 9h5M8 13.5h5',
  users: 'M6 7.5a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5zM2.5 13c0-2 1.6-3.2 3.5-3.2S9.5 11 9.5 13M10.5 7.2a2 2 0 000-4M11 9.9c1.5.2 2.5 1.3 2.5 3.1',
  sparkles: 'M8 2.5l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1 1-2.6zM12.5 9l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5.5-1.3z',
  folder: 'M2.5 4.5A1 1 0 013.5 3.5h2.4l1 1.3H12.5a1 1 0 011 1v6a1 1 0 01-1 1h-9a1 1 0 01-1-1z',
  terminal: 'M3 4l3 3-3 3M8 11h5',
  layers: 'M8 2l5.5 3L8 8 2.5 5 8 2zM2.5 8L8 11l5.5-3M2.5 11L8 14l5.5-3',
  mic: 'M8 2a2 2 0 012 2v4a2 2 0 11-4 0V4a2 2 0 012-2zM4 8a4 4 0 008 0M8 12v2',
  x: 'M4 4l8 8M12 4l-8 8',
  arrowRight: 'M3 8h9M8.5 4l4 4-4 4',
  filter: 'M2.5 4h11l-4.2 5v3.5L6.7 14V9L2.5 4z',
  dotsGrip: 'M5.5 4h.01M5.5 8h.01M5.5 12h.01M10.5 4h.01M10.5 8h.01M10.5 12h.01',
  inbox: 'M2.5 9.5h3l1 1.5h3l1-1.5h3M2.5 9.5l1.8-5.5h7.4l1.8 5.5v3a1 1 0 01-1 1h-10a1 1 0 01-1-1z',
  team: 'M8 6.5a2 2 0 100-4 2 2 0 000 4zM3.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM12.5 11a1.8 1.8 0 100-3.6 1.8 1.8 0 000 3.6zM5 14c0-1.6 1.3-2.6 3-2.6s3 1 3 2.6',
  graph: 'M4 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM12 4.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM8 14.5a1.6 1.6 0 100-3.2 1.6 1.6 0 000 3.2zM5.3 4.1l1.7 5M10.7 4.1L9 9.1',
  archive: 'M2.5 3.5h11v3h-11zM3.5 6.5v6a1 1 0 001 1h7a1 1 0 001-1v-6M6.5 9h3',
  grid: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5h-4.5zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5h-4.5z',
  pen: 'M2.5 13.5l2.5-.6 7-7-1.9-1.9-7 7zM10.6 4.6l1.9 1.9 1.3-1.3a1 1 0 000-1.4l-.5-.5a1 1 0 00-1.4 0z',
  refresh: 'M13 7a5 5 0 10-1.2 4.2M13 3.5V7h-3.5',
  copy: 'M5.5 5.5h7v8h-7zM3.5 10.5h-1v-8h7v1',
  info: 'M8 7.2v4M8 4.8h.01M8 14A6 6 0 108 2a6 6 0 000 12z',
  shield: 'M8 2l5 2v4c0 3-2.2 5.2-5 6-2.8-.8-5-3-5-6V4l5-2z',
  doc: 'M5 2h5l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM10 2v4h4M6.5 9h4M6.5 11.5h2.5',
  teamview: 'M2.5 3.5h11v9h-11zM8 3.5v9M2.5 8h11',
  sun: 'M8 11a3 3 0 100-6 3 3 0 000 6zM8 1.7v1.6M8 12.7v1.6M2.6 2.6l1.1 1.1M12.3 12.3l1.1 1.1M1.7 8h1.6M12.7 8h1.6M2.6 13.4l1.1-1.1M12.3 3.7l1.1-1.1',
  moon: 'M13.4 9.3A5.5 5.5 0 116.7 2.6 4.6 4.6 0 0013.4 9.3z',
  calendar: 'M3 4.5h10v9H3zM3 7h10M5.5 2.5v3M10.5 2.5v3',
  music: 'M6 12a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zM6 12V4l7.5-1.6V10M13.5 10a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0z',
  paperclip: 'M12.5 7l-5.2 5.2a2.6 2.6 0 01-3.7-3.7l5.6-5.6a1.7 1.7 0 012.4 2.4l-5.4 5.4a.85.85 0 01-1.2-1.2L9.9 4.4',
  at: 'M10.6 8a2.6 2.6 0 11-2.6-2.6M10.6 5.4v3.1a1.8 1.8 0 003.4-.6A6 6 0 108 14',
  hash: 'M6.2 2.5L4.6 13.5M11.4 2.5L9.8 13.5M3 5.6h10.4M2.6 10.4H13',
  bot: 'M5 6.5h6a1 1 0 011 1V12a1 1 0 01-1 1H5a1 1 0 01-1-1V7.5a1 1 0 011-1zM8 4v2.5M6.4 9.2h.01M9.6 9.2h.01M3.5 8.5v2.2M12.5 8.5v2.2',
  baton: 'M3.4 12.6l7.2-7.2M10 4.1a1.7 1.7 0 102.4 2.4 1.7 1.7 0 00-2.4-2.4z',
  folderOpen: 'M2.5 5a1 1 0 011-1h2.2l1 1.3H12a1 1 0 011 1v.7H5.2a1 1 0 00-.95.7L2.5 13M2.5 5v7.5',
  alert: 'M8 2.5l5.5 9.5h-11zM8 6.5v3M8 11.2h.01',
  trash: 'M3.5 4.5h9M6 4.5V3h4v1.5M5 4.5l.5 8a1 1 0 001 1h3a1 1 0 001-1l.5-8M6.7 7v4M9.3 7v4',
  fileCode: 'M5 2h4l3.5 3.5V13a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM9 2v4h4M6.5 9.5L5.3 10.7 6.5 12M9.5 9.5l1.2 1.2L9.5 12',
  archiveBox: 'M2.5 3.5h11v3h-11zM3.5 6.5v6a1 1 0 001 1h7a1 1 0 001-1v-6M6.5 9h3',
  globe: 'M8 14A6 6 0 108 2a6 6 0 000 12zM2.5 8h11M8 2c1.8 1.6 2.8 3.8 2.8 6S9.8 12.4 8 14M8 2C6.2 3.6 5.2 5.8 5.2 8S6.2 12.4 8 14',
  download: 'M8 2.5v7M5 6.5L8 9.5 11 6.5M3.5 12.5h9',
  star: 'M8 2l1.6 3.7 4 .4-3 2.7.9 3.9L8 10.7l-3.5 2 .9-3.9-3-2.7 4-.4z',
  playFill: 'M5 3.2l8 4.8-8 4.8z'
};
function Icon({
  name,
  size = 16,
  sw = 1.6,
  style,
  className
}) {
  const d = PN_ICONS[name];
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: style,
    className: className,
    "aria-hidden": "true"
  }, d.split('M').filter(Boolean).map((seg, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: 'M' + seg
  })));
}

/* The Maestro mark — command chevron spawning parallel agents: ›··+
   Drawn as a simple, confident glyph (no complex illustration). */
function Mark({
  size = 22
}) {
  return /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": "true"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 7l4 5-4 5",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "14.5",
    cy: "12",
    r: "1.1",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "18.2",
    cy: "12",
    r: "1.1",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M12.5 12h.01",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round"
  }));
}

/* agent logo helper */
const PN_AGENT_SRC = {
  claude: '../assets/claude-code-icon.png',
  codex: '../assets/openai-codex-icon.png',
  gemini: '../assets/gemini-logo.png'
};
function AgentTile({
  kind,
  lg
}) {
  if (kind === 'terminal') {
    return /*#__PURE__*/React.createElement("div", {
      className: 'pn-agent pn-agent--term' + (lg ? ' pn-agent--lg' : '')
    }, ">_");
  }
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-agent' + (lg ? ' pn-agent--lg' : '')
  }, /*#__PURE__*/React.createElement("img", {
    src: PN_AGENT_SRC[kind],
    alt: kind
  }));
}
Object.assign(window, {
  Icon,
  Mark,
  AgentTile
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/kit.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/left-panels.jsx
try { (() => {
/* left-panels.jsx — three layouts for the Maestro (left) panel.
   A · Ledger   — editorial, airy, hairline rows, sectioned
   B · Stack    — grouped collapsible, structured, denser
   C · Console  — refined terminal-influenced, mono-forward            */

/* ----- shared row pieces ----- */
function TaskRow({
  status,
  title,
  prio,
  id,
  subs,
  assignee,
  sel
}) {
  const dotClass = {
    run: 'pn-dot--run',
    wait: 'pn-dot--wait',
    todo: 'pn-dot--idle',
    block: 'pn-dot--block'
  }[status] || 'pn-dot--idle';
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-row' + (sel ? ' pn-row--sel' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-row__lead"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot-wrap'
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot ' + dotClass + (status === 'run' ? ' pn-dot--live' : '')
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-row__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-row__title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "pn-row__sub"
  }, prio && /*#__PURE__*/React.createElement("span", {
    className: 'pn-tag pn-tag--' + prio
  }, prio), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "#", id, subs ? ` · ${subs} subtasks` : ''))), /*#__PURE__*/React.createElement("div", {
    className: "pn-row__trail"
  }, assignee && /*#__PURE__*/React.createElement(AgentTile, {
    kind: assignee
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-row__run",
    title: "Run"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play"
  }))));
}

/* ============================== A · LEDGER ============================== */
function LedgerLeft() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-mark"
  }, /*#__PURE__*/React.createElement(Mark, null)), /*#__PURE__*/React.createElement("span", {
    className: "pn-proj"
  }, "agent-maestro ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 13
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Settings"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tab pn-tab--active"
  }, "Tasks ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "6")), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab"
  }, "Team ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "4")), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab"
  }, "Skills"), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab"
  }, "Lists ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "2"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search tasks"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-kbd"
  }, "\u2318K")), /*#__PURE__*/React.createElement("div", {
    className: "pn-filters"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-filter pn-filter--active"
  }, "All"), /*#__PURE__*/React.createElement("button", {
    className: "pn-filter"
  }, "High"), /*#__PURE__*/React.createElement("button", {
    className: "pn-filter"
  }, "Mine"), /*#__PURE__*/React.createElement("button", {
    className: "pn-filter",
    style: {
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 13
  }), " Sort")), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "In progress ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, /*#__PURE__*/React.createElement(TaskRow, {
    status: "run",
    title: "Fix terminal reparenting crash on board close",
    prio: "high",
    id: "142",
    subs: 3,
    assignee: "claude"
  }), /*#__PURE__*/React.createElement(TaskRow, {
    status: "run",
    title: "WebSocket pipeline \u2014 dedupe session updates",
    prio: "med",
    id: "138",
    assignee: "codex"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Up next ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 4")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, /*#__PURE__*/React.createElement(TaskRow, {
    status: "todo",
    title: "Add a model-profile indirection layer",
    prio: "med",
    id: "151",
    subs: 2
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-sub__check"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 10,
    sw: 2
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-sub__title"
  }, "Define profile config schema")), /*#__PURE__*/React.createElement("div", {
    className: "pn-sub pn-sub--done"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-sub__check"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 10,
    sw: 2
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-sub__title"
  }, "Audit current model strings")), /*#__PURE__*/React.createElement(TaskRow, {
    status: "todo",
    title: "Verify Opus 1M spawns with 1M context window",
    prio: "low",
    id: "149"
  }), /*#__PURE__*/React.createElement(TaskRow, {
    status: "block",
    title: "Migrate task ordering to server persistence",
    prio: "med",
    id: "144",
    assignee: "gemini"
  }), /*#__PURE__*/React.createElement(TaskRow, {
    status: "todo",
    title: "Voice directives \u2014 Alexa coordinator handoff",
    prio: "low",
    id: "156"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary pn-btn--block"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New task ", /*#__PURE__*/React.createElement("span", {
    className: "pn-kbd",
    style: {
      color: 'rgba(244,242,236,.6)',
      borderColor: 'rgba(244,242,236,.25)',
      background: 'transparent'
    }
  }, "\u2318N"))));
}

/* ============================== B · STACK ============================== */
function StackGroup({
  label,
  count,
  open,
  children,
  prog
}) {
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    className: "pn-stack-head"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: open ? 'chevronD' : 'chevronR',
    size: 13
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-stack-title"
  }, label), /*#__PURE__*/React.createElement("span", {
    className: "pn-chip"
  }, count), prog != null && /*#__PURE__*/React.createElement("span", {
    className: "pn-stack-prog"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: prog + '%'
    }
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, children));
}
function StackRow({
  status,
  title,
  prio,
  id,
  assignee
}) {
  const dotClass = {
    run: 'pn-dot--run',
    wait: 'pn-dot--wait',
    todo: 'pn-dot--idle',
    block: 'pn-dot--block'
  }[status] || 'pn-dot--idle';
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-srow"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot ' + dotClass
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-srow__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-srow__title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "pn-srow__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "#", id), /*#__PURE__*/React.createElement("span", {
    className: 'pn-prio pn-prio--' + prio
  }, prio))), assignee && /*#__PURE__*/React.createElement(AgentTile, {
    kind: assignee
  }));
}
function StackLeft() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-mark"
  }, /*#__PURE__*/React.createElement(Mark, null)), /*#__PURE__*/React.createElement("span", {
    className: "pn-proj"
  }, "agent-maestro ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 13
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-seg"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-seg-i pn-seg-i--active"
  }, "List"), /*#__PURE__*/React.createElement("button", {
    className: "pn-seg-i"
  }, "Board"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tab pn-tab--active"
  }, "Tasks ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "6")), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab"
  }, "Team ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "4")), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab"
  }, "Skills"), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab"
  }, "Lists ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "2"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search tasks"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    style: {
      width: 22,
      height: 22
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "filter",
    size: 13
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement(StackGroup, {
    label: "High priority",
    count: 1,
    open: true,
    prog: 0
  }, /*#__PURE__*/React.createElement(StackRow, {
    status: "run",
    title: "Fix terminal reparenting crash on board close",
    prio: "high",
    id: "142",
    assignee: "claude"
  })), /*#__PURE__*/React.createElement(StackGroup, {
    label: "In progress",
    count: 2,
    open: true,
    prog: 40
  }, /*#__PURE__*/React.createElement(StackRow, {
    status: "run",
    title: "WebSocket pipeline \u2014 dedupe session updates",
    prio: "med",
    id: "138",
    assignee: "codex"
  }), /*#__PURE__*/React.createElement(StackRow, {
    status: "block",
    title: "Migrate task ordering to server persistence",
    prio: "med",
    id: "144",
    assignee: "gemini"
  })), /*#__PURE__*/React.createElement(StackGroup, {
    label: "Backlog",
    count: 3,
    open: true,
    prog: 0
  }, /*#__PURE__*/React.createElement(StackRow, {
    status: "todo",
    title: "Add a model-profile indirection layer",
    prio: "med",
    id: "151"
  }), /*#__PURE__*/React.createElement(StackRow, {
    status: "todo",
    title: "Verify Opus 1M spawns with 1M context window",
    prio: "low",
    id: "149"
  }), /*#__PURE__*/React.createElement(StackRow, {
    status: "todo",
    title: "Voice directives \u2014 Alexa coordinator handoff",
    prio: "low",
    id: "156"
  })), /*#__PURE__*/React.createElement(StackGroup, {
    label: "Done",
    count: 8,
    open: false
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary pn-btn--block"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New task"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn",
    title: "Run selected"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 13
  }))));
}

/* ============================== C · CONSOLE ============================== */
function ConRow({
  idx,
  status,
  title,
  prio,
  k
}) {
  const dotClass = {
    run: 'pn-dot--run',
    wait: 'pn-dot--wait',
    todo: 'pn-dot--idle',
    block: 'pn-dot--block'
  }[status] || 'pn-dot--idle';
  const prioColor = {
    high: 'var(--pn-block)',
    med: 'var(--pn-ink-3)',
    low: 'var(--pn-ink-4)'
  }[prio];
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-con-row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-con-row__idx"
  }, idx), /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot ' + dotClass
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-con-row__title"
  }, title), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta",
    style: {
      color: prioColor,
      textTransform: 'uppercase',
      fontSize: 10
    }
  }, prio), /*#__PURE__*/React.createElement("span", {
    className: "pn-con-row__k"
  }, k));
}
function ConsoleLeft() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-panel"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-con-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-prompt"
  }, "\u203A"), /*#__PURE__*/React.createElement("span", null, "maestro/"), /*#__PURE__*/React.createElement("span", {
    className: "pn-proj-n"
  }, "agent-maestro"), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "6 open")), /*#__PURE__*/React.createElement("div", {
    className: "pn-con-input"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-prompt"
  }, "\u2318"), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1
    }
  }, "search or run a command\u2026"), /*#__PURE__*/React.createElement("span", {
    className: "pn-kbd"
  }, "K")), /*#__PURE__*/React.createElement("div", {
    className: "pn-con-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-con-tab pn-con-tab--active"
  }, "Tasks"), /*#__PURE__*/React.createElement("button", {
    className: "pn-con-tab"
  }, "Team"), /*#__PURE__*/React.createElement("button", {
    className: "pn-con-tab"
  }, "Skills"), /*#__PURE__*/React.createElement("button", {
    className: "pn-con-tab"
  }, "Lists")), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-con-rule"
  }, /*#__PURE__*/React.createElement("span", null, "running"), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--pn-run)'
    }
  }, "2")), /*#__PURE__*/React.createElement(ConRow, {
    idx: "142",
    status: "run",
    title: "Fix terminal reparenting crash",
    prio: "high",
    k: "\u21B5 open"
  }), /*#__PURE__*/React.createElement(ConRow, {
    idx: "138",
    status: "run",
    title: "WebSocket \u2014 dedupe session updates",
    prio: "med",
    k: "\u21B5 open"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-con-rule"
  }, /*#__PURE__*/React.createElement("span", null, "queued"), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  }), /*#__PURE__*/React.createElement("span", null, "4")), /*#__PURE__*/React.createElement(ConRow, {
    idx: "151",
    status: "todo",
    title: "Model-profile indirection layer",
    prio: "med",
    k: "r run"
  }), /*#__PURE__*/React.createElement(ConRow, {
    idx: "149",
    status: "todo",
    title: "Verify Opus 1M context window",
    prio: "low",
    k: "r run"
  }), /*#__PURE__*/React.createElement(ConRow, {
    idx: "144",
    status: "block",
    title: "Migrate task ordering to server",
    prio: "med",
    k: "r run"
  }), /*#__PURE__*/React.createElement(ConRow, {
    idx: "156",
    status: "todo",
    title: "Voice directives \u2014 Alexa handoff",
    prio: "low",
    k: "r run"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-con-rule"
  }, /*#__PURE__*/React.createElement("span", null, "done"), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  }), /*#__PURE__*/React.createElement("span", null, "8")), /*#__PURE__*/React.createElement(ConRow, {
    idx: "140",
    status: "todo",
    title: "Add /loop recurring command",
    prio: "low",
    k: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-foot",
    style: {
      fontFamily: 'var(--pn-mono)'
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary pn-btn--block",
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-prompt",
    style: {
      color: 'rgba(244,242,236,.7)'
    }
  }, "$"), " maestro new task")));
}
Object.assign(window, {
  LedgerLeft,
  StackLeft,
  ConsoleLeft
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/left-panels.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/mobile-sessions.jsx
try { (() => {
/* mobile-sessions.jsx — Sessions list, Terminal screen, Team view, Board. */
const {
  useState: msS
} = React;

/* =====================================================================
   SESSIONS
   ===================================================================== */
function SessCard({
  s,
  child,
  onOpen,
  onActions
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'mb-scard' + (s.needs ? ' mb-scard--needs' : '') + (child ? ' mb-scard--child' : ''),
    onClick: () => onOpen && onOpen(s)
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-scard__agent"
  }, s.agent === 'terminal' ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--pn-mono)',
      color: 'var(--pn-run)',
      fontWeight: 700
    }
  }, ">_") : /*#__PURE__*/React.createElement("img", {
    src: '../assets/' + (s.agent === 'claude' ? 'claude-code-icon' : s.agent === 'codex' ? 'openai-codex-icon' : 'gemini-logo') + '.png',
    alt: ""
  }), s.live && /*#__PURE__*/React.createElement("span", {
    className: "mb-livedot",
    style: {
      background: s.dot
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-scard__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-scard__name"
  }, s.name), /*#__PURE__*/React.createElement("div", {
    className: "mb-scard__status"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot pn-dot--' + s.status + (s.live && s.status === 'run' ? ' pn-dot--live' : ''),
    style: {
      position: 'relative'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: 'mb-scard__statustext' + (s.status === 'run' ? ' mb-scard__statustext--run' : s.status === 'wait' ? ' mb-scard__statustext--wait' : '')
  }, s.statusText))), /*#__PURE__*/React.createElement("div", {
    className: "mb-scard__trail"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-scard__elapsed"
  }, s.elapsed), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost",
    style: {
      width: 28,
      height: 28
    },
    onClick: e => {
      e.stopPropagation();
      onActions && onActions(s);
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more",
    size: 16
  }))));
}
function SessionsScreen({
  nav
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mb-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-head__title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-head__eyebrow"
  }, "Spaces"), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__h"
  }, "Sessions")), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn",
    onClick: () => nav.push('teamview'),
    title: "Team view"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "teamview"
  })), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-launch"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-launchbtn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "plus"
  }, "\uFF0B"), " Terminal"), /*#__PURE__*/React.createElement("button", {
    className: "mb-launchbtn"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/claude-code-icon.png",
    alt: ""
  }), " Claude"), /*#__PURE__*/React.createElement("button", {
    className: "mb-launchbtn"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/openai-codex-icon.png",
    alt: ""
  }), " Codex"), /*#__PURE__*/React.createElement("button", {
    className: "mb-launchbtn"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/gemini-logo.png",
    alt: ""
  }), " Gemini")), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Reparent strike team"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-team"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-team__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-team__dot",
    style: {
      background: '#2f8f7f'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-team__name"
  }, "Rhea \xB7 coordinator"), /*#__PURE__*/React.createElement("span", {
    className: "mb-team__count"
  }, "4 sessions")), /*#__PURE__*/React.createElement(SessCard, {
    s: {
      name: 'Rhea',
      agent: 'claude',
      status: 'run',
      statusText: 'Coordinating 3 workers',
      elapsed: '14m',
      live: true,
      dot: '#7FC08C'
    },
    onOpen: () => nav.push('terminal'),
    onActions: s => nav.sheet('sessActions', s)
  }), M_SESSIONS_LIVE.map(s => /*#__PURE__*/React.createElement(SessCard, {
    key: s.id,
    s: s,
    child: true,
    onOpen: () => nav.push('terminal'),
    onActions: s => nav.sheet('sessActions', s)
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Idle ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), M_SESSIONS_IDLE.map(s => /*#__PURE__*/React.createElement(SessCard, {
    key: s.id,
    s: s,
    onOpen: () => nav.push('terminal'),
    onActions: s => nav.sheet('sessActions', s)
  }))), /*#__PURE__*/React.createElement("button", {
    className: "mb-fab",
    onClick: () => nav.sheet('newSession')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })));
}

/* =====================================================================
   TERMINAL (full screen)
   ===================================================================== */
function CtxGaugeM({
  pct
}) {
  const r = 8,
    c = 2 * Math.PI * r,
    off = c * (1 - pct / 100);
  return /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__gauge"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "22",
    height: "22",
    viewBox: "0 0 22 22"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: r,
    fill: "none",
    stroke: "#38301f",
    strokeWidth: "2.3"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "11",
    cy: "11",
    r: r,
    fill: "none",
    stroke: "#7FC08C",
    strokeWidth: "2.3",
    strokeLinecap: "round",
    strokeDasharray: c,
    strokeDashoffset: off,
    transform: "rotate(-90 11 11)"
  })));
}
function TerminalScreen({
  nav
}) {
  const [log, setLog] = msS(false);
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-term"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-term__hd"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-term__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    style: {
      color: '#897f6b',
      paddingLeft: 0
    },
    onClick: () => nav.setTab('sessions')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  })), /*#__PURE__*/React.createElement("span", {
    className: "d"
  }), /*#__PURE__*/React.createElement("b", null, "fluffy-starlight"), /*#__PURE__*/React.createElement("button", {
    className: "mb-term__switch",
    onClick: () => nav.sheet('switchSession')
  }, "claude \xB7 opus-4.8 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 12
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-term__body"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u203A"), " Analyzing terminal reparenting in ", /*#__PURE__*/React.createElement("span", {
    className: "f"
  }, "AppWorkspace.tsx")), /*#__PURE__*/React.createElement("div", {
    className: "dim"
  }, "\xA0\xA0Read SessionTerminal.tsx \xB7 MultiProjectSessionsView.tsx"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u25CF"), " The board moves ", /*#__PURE__*/React.createElement("span", {
    className: "f"
  }, "[data-terminal-id]"), " while"), /*#__PURE__*/React.createElement("div", {
    className: "dim"
  }, "\xA0\xA0TeamView moves ", /*#__PURE__*/React.createElement("span", {
    className: "f"
  }, "term.element"), ". They disagree."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u25CF"), " Editing ", /*#__PURE__*/React.createElement("span", {
    className: "f"
  }, "MultiProjectSessionsView.tsx")), /*#__PURE__*/React.createElement("div", {
    className: "ok"
  }, "\xA0\xA0+ registry.current.get(id)?.term.element"), /*#__PURE__*/React.createElement("div", {
    className: "ok"
  }, "\xA0\xA0+ re-run fit.fit() after the move"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ok"
  }, "\u2713"), " ", /*#__PURE__*/React.createElement("span", {
    className: "dim"
  }, "tests \u2014 14 of 18 passing")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u203A"), " Reparenting the node now", /*#__PURE__*/React.createElement("span", {
    className: "mb-tcur"
  }))), /*#__PURE__*/React.createElement("div", {
    className: 'mb-tlog' + (log ? ' mb-tlog--open' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tlog__in"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tlog__turn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-tlog__role mb-tlog__role--u"
  }, "you"), /*#__PURE__*/React.createElement("span", {
    className: "mb-tlog__txt"
  }, "Fix the terminal reparenting crash when the board closes.")), /*#__PURE__*/React.createElement("div", {
    className: "mb-tlog__turn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-tlog__role mb-tlog__role--a"
  }, "claude"), /*#__PURE__*/React.createElement("span", {
    className: "mb-tlog__txt"
  }, "Routing the board through the registry ref, then re-running fit.")))), /*#__PURE__*/React.createElement("div", {
    className: "mb-tstrip"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-tstrip__btn",
    onClick: () => setLog(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: log ? 'chevronD' : 'layers'
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-tstrip__stats"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__stat"
  }, /*#__PURE__*/React.createElement(CtxGaugeM, {
    pct: 24
  }), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "48.2k"), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "/200k")), /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__div"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__stat mb-tstrip__stat--a"
  }, "\u26A1", /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "92%"), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "cache")), /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "8"), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "turns")), /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "23"), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "tools")), /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "\u29D7"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, "4m"))), /*#__PURE__*/React.createElement("span", {
    className: "mb-tstrip__div"
  }), /*#__PURE__*/React.createElement("button", {
    className: "mb-tstrip__btn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "paperclip"
  })), /*#__PURE__*/React.createElement("button", {
    className: "mb-tstrip__btn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pen"
  })), /*#__PURE__*/React.createElement("button", {
    className: "mb-tstrip__btn mb-tstrip__btn--cast"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 16
    }
  }, "\u2726"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-term__composer"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-term__input"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ph"
  }, "Type / for commands\u2026")), /*#__PURE__*/React.createElement("button", {
    className: "mb-term__send"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight"
  }))));
}

/* =====================================================================
   TEAM VIEW (coordinator + horizontal workers)
   ===================================================================== */
function TeamViewScreen({
  nav
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-push"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    onClick: nav.pop
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }), " Sessions"), /*#__PURE__*/React.createElement("span", {
    className: "mb-subhead__t"
  }, "Team view"), /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead__r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tv"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      padding: '6px 16px 10px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-meta",
    style: {
      fontSize: 12
    }
  }, "maestro-lead"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 12,
    style: {
      color: 'var(--pn-ink-4)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: 'var(--pn-ink)'
    }
  }, "Rhea")), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__coord"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__coordhd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-av-emblem",
    style: {
      width: 34,
      height: 34,
      boxShadow: '0 0 0 1.5px var(--pn-brand), 0 0 0 3px var(--pn-card)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24"
  }, emblemById('violin').svg)), /*#__PURE__*/React.createElement("span", {
    className: "mb-tv__coordname"
  }, "Rhea"), /*#__PURE__*/React.createElement("span", {
    className: "mb-tv__badge"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "baton"
  }), " Coordinator")), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__coordterm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u203A"), " Coordinating reparent fix across 3 workers"), /*#__PURE__*/React.createElement("div", {
    className: "dim"
  }, "\xA0\xA0reviewing fluffy-starlight's diff\u2026"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-dlabel",
    style: {
      padding: '4px 16px 8px'
    }
  }, "Workers \xB7 3"), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__workers"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wcard",
    onClick: () => nav.push('terminal')
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__whd"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "claude"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-tv__wname"
  }, "fluffy-starlight"), /*#__PURE__*/React.createElement(Glyph, {
    kind: "working",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wterm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u203A"), " Editing view"), /*#__PURE__*/React.createElement("div", {
    className: "ok"
  }, "+ registry ref"), /*#__PURE__*/React.createElement("div", {
    style: {
      color: '#897f6b'
    }
  }, "re-running fit\u2026"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wcard mb-tv__wcard--needs",
    onClick: () => nav.push('terminal')
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__whd"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "claude"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-tv__wname"
  }, "vast-neumann"), /*#__PURE__*/React.createElement(Glyph, {
    kind: "needsInput",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wterm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u203A"), " Per-project or"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\xA0\xA0global?", /*#__PURE__*/React.createElement("span", {
    className: "mb-tcur"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wfoot",
    style: {
      color: 'var(--pn-wait)'
    }
  }, "Needs input ", /*#__PURE__*/React.createElement("span", {
    className: "ar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 13
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wcard",
    onClick: () => nav.push('teamview')
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__whd"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "codex"
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-tv__wname"
  }, "Alexa coordinator"), /*#__PURE__*/React.createElement(Glyph, {
    kind: "working",
    size: 14
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wterm"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "\u203A"), " Delegating to 2"), /*#__PURE__*/React.createElement("div", {
    className: "dim"
  }, "\xA0\xA0sub-workers")), /*#__PURE__*/React.createElement("div", {
    className: "mb-tv__wfoot"
  }, "2 workers \u2014 drill in ", /*#__PURE__*/React.createElement("span", {
    className: "ar"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "arrowRight",
    size: 13
  }))))))));
}

/* =====================================================================
   BOARD (horizontal snap columns)
   ===================================================================== */
const M_BCOLS = [{
  status: 'todo',
  label: 'Backlog',
  tasks: [{
    id: '151',
    title: 'Add a model-profile indirection layer',
    priority: 'medium'
  }, {
    id: '156',
    title: 'Voice directives — Alexa handoff',
    priority: 'low'
  }]
}, {
  status: 'blocked',
  label: 'Blocked',
  tasks: [{
    id: '144',
    title: 'Migrate task ordering to server persistence',
    priority: 'medium'
  }]
}, {
  status: 'in_progress',
  label: 'In progress',
  tasks: [{
    id: '142',
    title: 'Fix terminal reparenting crash on board close',
    priority: 'high',
    sessions: 2
  }, {
    id: '138',
    title: 'WebSocket — dedupe session updates',
    priority: 'medium',
    sessions: 1
  }]
}, {
  status: 'in_review',
  label: 'Review',
  tasks: [{
    id: '149',
    title: 'Verify Opus 1M context window',
    priority: 'low'
  }]
}, {
  status: 'completed',
  label: 'Done',
  tasks: [{
    id: '140',
    title: 'Add /loop recurring command',
    priority: 'low'
  }]
}];
const M_PRIO_DOT = {
  high: 'var(--pn-block)',
  medium: 'var(--pn-wait)',
  low: 'var(--pn-idle)'
};
function BoardScreen({
  nav
}) {
  const [idx, setIdx] = msS(2);
  const onScroll = e => {
    const w = e.target.firstChild.offsetWidth + 12;
    setIdx(Math.round(e.target.scrollLeft / w));
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-push"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    onClick: nav.pop
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }), " Tasks"), /*#__PURE__*/React.createElement("span", {
    className: "mb-subhead__t"
  }, "agent-maestro \xB7 board"), /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead__r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-pagedots"
  }, M_BCOLS.map((c, i) => /*#__PURE__*/React.createElement("i", {
    key: i,
    className: i === idx ? 'on' : ''
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-board",
    onScroll: onScroll,
    ref: el => {
      if (el && !el._init) {
        el._init = true;
        el.scrollLeft = (el.firstChild.offsetWidth + 12) * 2;
      }
    }
  }, M_BCOLS.map(col => /*#__PURE__*/React.createElement("div", {
    className: "mb-bcol",
    key: col.status
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-bcol__hd"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: col.status,
    size: 15
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-bcol__t"
  }, col.label), /*#__PURE__*/React.createElement("span", {
    className: "mb-bcol__n"
  }, col.tasks.length)), /*#__PURE__*/React.createElement("div", {
    className: "mb-bcol__body"
  }, col.tasks.map(t => /*#__PURE__*/React.createElement("div", {
    className: "mb-bcard",
    key: t.id,
    onClick: () => nav.push('taskDetail', {
      ...t,
      status: col.status,
      subs: null
    })
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-bcard__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-bcard__pdot",
    style: {
      background: M_PRIO_DOT[t.priority]
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-bcard__t"
  }, t.title)), /*#__PURE__*/React.createElement("div", {
    className: "mb-bcard__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-meta"
  }, "#", t.id), t.sessions && /*#__PURE__*/React.createElement("span", {
    className: "mb-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run"
  }), t.sessions), (col.status === 'todo' || col.status === 'blocked') && /*#__PURE__*/React.createElement("button", {
    className: "mb-tag mb-tag--green",
    style: {
      marginLeft: 'auto',
      padding: '3px 9px'
    }
  }, "$ work on")))))))));
}
Object.assign(window, {
  SessionsScreen,
  TerminalScreen,
  TeamViewScreen,
  BoardScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/mobile-sessions.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/mobile-tasks.jsx
try { (() => {
/* mobile.jsx — Maestro mobile app: shell, bottom nav, router, all screens.
   Relies on kit.jsx (Icon, AgentTile), tiles.jsx (Glyph, Avatar),
   icons-team-1/2.jsx (emblems). */
const {
  useState: mS
} = React;

/* ---------------- shared data ---------------- */
const M_AV = {
  rhea: {
    initial: 'R',
    name: 'Rhea',
    color: '#1f6f5f',
    bg: '#dcebe6',
    emblem: 'violin'
  },
  kit: {
    initial: 'K',
    name: 'Kit',
    color: '#7a5cc0',
    bg: '#ece4f7',
    emblem: 'piano'
  },
  ada: {
    initial: 'A',
    name: 'Ada',
    color: '#b06a2b',
    bg: '#f4e7d6',
    emblem: 'snare'
  },
  milo: {
    initial: 'M',
    name: 'Milo',
    color: '#3f6c90',
    bg: '#dde8f1',
    emblem: 'trumpet'
  }
};
function emblemById(id) {
  const all = [...(window.TEAM_ICONS_1 || []), ...(window.TEAM_ICONS_2 || [])];
  return all.find(e => e.id === id);
}
function Emblem({
  id,
  cls
}) {
  const e = emblemById(id);
  if (!e) return null;
  return /*#__PURE__*/React.createElement("span", {
    className: cls || 'mb-av-emblem'
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24"
  }, e.svg));
}
const M_TASKS = [{
  id: '142',
  title: 'Fix terminal reparenting crash on board close',
  status: 'in_progress',
  priority: 'high',
  assignee: M_AV.rhea,
  subs: [{
    title: 'Audit where terminals get reparented',
    status: 'completed'
  }, {
    title: 'Make board reparent via registry ref',
    status: 'in_progress'
  }, {
    title: 'Add regression test for connection loss',
    status: 'blocked'
  }],
  activity: 'working',
  sessionText: 'fluffy-starlight · editing SessionTerminal.tsx',
  docs: 2,
  due: 'Jun 14'
}, {
  id: '138',
  title: 'WebSocket pipeline — dedupe session updates',
  status: 'in_progress',
  priority: 'medium',
  assignee: M_AV.kit,
  activity: 'needsInput',
  sessionText: 'Alexa coordinator · needs your input'
}, {
  id: '151',
  title: 'Add a model-profile indirection layer',
  status: 'todo',
  priority: 'medium',
  assignee: M_AV.rhea,
  subs: [{
    title: 'Define profile config schema',
    status: 'todo'
  }, {
    title: 'Audit current model strings',
    status: 'completed'
  }],
  docs: 1
}, {
  id: '149',
  title: 'Verify Opus 1M spawns with 1M context window',
  status: 'in_review',
  priority: 'low'
}, {
  id: '144',
  title: 'Migrate task ordering to server persistence',
  status: 'blocked',
  priority: 'medium',
  assignee: M_AV.ada
}, {
  id: '156',
  title: 'Voice directives — Alexa coordinator handoff',
  status: 'todo',
  priority: 'low'
}];
const M_SESSIONS_LIVE = [{
  id: 's1',
  name: 'fluffy-starlight',
  agent: 'claude',
  status: 'run',
  statusText: 'Editing SessionTerminal.tsx',
  elapsed: '4m',
  live: true,
  dot: '#7FC08C'
}, {
  id: 's2',
  name: 'Alexa coordinator',
  agent: 'codex',
  status: 'wait',
  statusText: 'Needs your input',
  elapsed: '12m',
  live: true,
  dot: '#D9AA49',
  needs: true
}];
const M_SESSIONS_IDLE = [{
  id: 's3',
  name: 'concurrent-cosmos',
  agent: 'gemini',
  status: 'idle',
  statusText: 'Idle',
  elapsed: '1h',
  live: false,
  dot: '#A29C8E'
}, {
  id: 's4',
  name: 'zesty-wave',
  agent: 'terminal',
  status: 'idle',
  statusText: 'Exited · code 0',
  elapsed: '3h',
  live: false,
  dot: '#A29C8E'
}];
const M_LABEL = {
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Completed',
  cancelled: 'Cancelled',
  blocked: 'Blocked'
};

/* =====================================================================
   STATUS BAR + HEADER
   ===================================================================== */
function StatusBar() {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-status"
  }, /*#__PURE__*/React.createElement("span", null, "9:41"), /*#__PURE__*/React.createElement("span", {
    className: "mb-status__r"
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 18 18",
    fill: "currentColor"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1",
    y: "11",
    width: "3",
    height: "5",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "5.5",
    y: "8",
    width: "3",
    height: "8",
    rx: "1"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "10",
    y: "5",
    width: "3",
    height: "11",
    rx: "1",
    opacity: "0.4"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "14.5",
    y: "2",
    width: "3",
    height: "14",
    rx: "1",
    opacity: "0.4"
  })), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 18 18",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.5"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M9 4.5C6 4.5 3.4 5.6 1.5 7.4M9 4.5c3 0 5.6 1.1 7.5 2.9M9 9c1.6 0 3.1.6 4.2 1.7M9 13.5l.01-.01"
  })), /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 26 18",
    fill: "none"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "1",
    y: "3.5",
    width: "21",
    height: "11",
    rx: "3",
    stroke: "currentColor",
    strokeWidth: "1.3",
    opacity: "0.5"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "2.6",
    y: "5.1",
    width: "16",
    height: "7.8",
    rx: "1.6",
    fill: "currentColor"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "23.4",
    y: "7",
    width: "1.6",
    height: "4",
    rx: "0.8",
    fill: "currentColor",
    opacity: "0.5"
  }))));
}

/* =====================================================================
   TASKS
   ===================================================================== */
function TaskCard({
  t,
  onOpen
}) {
  const done = t.status === 'completed';
  return /*#__PURE__*/React.createElement("div", {
    className: 'mb-tcard' + (done ? ' mb-tcard--done' : ''),
    onClick: () => onOpen(t)
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tcard__main"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-tcard__stat"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: t.status,
    size: 20
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-tcard__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-tcard__title"
  }, t.title), /*#__PURE__*/React.createElement("div", {
    className: "mb-tcard__meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'mb-pill' + (t.priority === 'high' ? ' mb-pill--high' : t.priority === 'medium' ? ' mb-pill--med' : '')
  }, t.priority), /*#__PURE__*/React.createElement("span", {
    className: "mb-meta"
  }, "#", t.id), t.subs && /*#__PURE__*/React.createElement("span", {
    className: "mb-meta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "listChecks",
    size: 12
  }), t.subs.length), t.docs && /*#__PURE__*/React.createElement("span", {
    className: "mb-meta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), t.docs), t.assignee && /*#__PURE__*/React.createElement("span", {
    className: "mb-av",
    style: {
      marginLeft: 'auto',
      color: t.assignee.color,
      background: t.assignee.bg
    }
  }, t.assignee.initial)))), t.sessionText && /*#__PURE__*/React.createElement("div", {
    className: "mb-tcard__sub"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-tcard__subt"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: t.activity === 'needsInput' ? 'needsInput' : 'working',
    size: 14
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-tcard__subtext"
  }, t.sessionText)), /*#__PURE__*/React.createElement("span", {
    className: "mb-tcard__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 15
  }))));
}
function TasksScreen({
  nav
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mb-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-head__title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-head__eyebrow"
  }, "Project"), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__proj"
  }, "agent-maestro ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 13
  }))), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn",
    onClick: () => nav.push('board'),
    title: "Board"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "grid"
  })), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search tasks"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-chips"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-chip mb-chip--on"
  }, "All ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "6")), /*#__PURE__*/React.createElement("button", {
    className: "mb-chip"
  }, "In progress ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "2")), /*#__PURE__*/React.createElement("button", {
    className: "mb-chip"
  }, "High"), /*#__PURE__*/React.createElement("button", {
    className: "mb-chip"
  }, "Mine"), /*#__PURE__*/React.createElement("button", {
    className: "mb-chip"
  }, "Blocked ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "1"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "In progress ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), M_TASKS.filter(t => t.status === 'in_progress').map(t => /*#__PURE__*/React.createElement(TaskCard, {
    key: t.id,
    t: t,
    onOpen: t => nav.push('taskDetail', t)
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Up next ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "\xB7 4")), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), M_TASKS.filter(t => t.status !== 'in_progress').map(t => /*#__PURE__*/React.createElement(TaskCard, {
    key: t.id,
    t: t,
    onOpen: t => nav.push('taskDetail', t)
  }))), /*#__PURE__*/React.createElement("button", {
    className: "mb-fab",
    onClick: () => nav.sheet('createTask')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })));
}
function TaskDetail({
  nav,
  data: t
}) {
  const [status, setStatus] = mS(t.status);
  const [danger, setDanger] = mS(false);
  const [worktree, setWorktree] = mS(true);
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-push"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    onClick: nav.pop
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }), " Tasks"), /*#__PURE__*/React.createElement("span", {
    className: "mb-subhead__t"
  }, "#", t.id), /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead__r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 11
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setStatus(s => s === 'completed' ? 'todo' : 'completed'),
    style: {
      background: 'none',
      border: 'none',
      padding: 0,
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: status,
    size: 24
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__title",
    style: {
      flex: 1
    }
  }, t.title)), t.id === '142' && /*#__PURE__*/React.createElement("div", {
    className: "mb-d__desc"
  }, "The board reparents ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13,
      color: 'var(--pn-brand-2)'
    }
  }, "[data-terminal-id]"), " while TeamView moves ", /*#__PURE__*/React.createElement("code", {
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13,
      color: 'var(--pn-brand-2)'
    }
  }, "term.element"), ". Route the board through the registry ref, then re-run fit.fit()."), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlabel"
  }, "Run this task"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-btn mb-btn--run mb-btn--block",
    onClick: () => nav.sheet('runConfig')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 15
  }), " Run"), /*#__PURE__*/React.createElement("button", {
    className: "mb-btn mb-btn--coord mb-btn--block",
    onClick: () => nav.sheet('coordConfig')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "baton",
    size: 16
  }), " Coordinate"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Status"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: status,
    size: 15
  }), " ", M_LABEL[status], " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Priority"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval",
    style: {
      color: t.priority === 'high' ? 'var(--pn-block)' : 'var(--pn-ink)'
    }
  }, t.priority.toUpperCase(), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Assignee"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, t.assignee ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("span", {
    className: "mb-av",
    style: {
      width: 22,
      height: 22,
      color: t.assignee.color,
      background: t.assignee.bg
    }
  }, t.assignee.initial), " ", t.assignee.name) : 'Unassigned', " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Model"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval",
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13
    }
  }, "opus-4.8 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), t.due && /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Due"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-meta"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 13
  }), " ", t.due)))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-toggle__ic",
    style: danger ? {
      background: 'var(--pn-block-soft)',
      color: 'var(--pn-block)'
    } : null
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__name"
  }, danger ? 'YOLO mode' : 'Safe mode'), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__desc"
  }, "Auto-approve all tool calls")), /*#__PURE__*/React.createElement("button", {
    className: 'mb-switch mb-switch--danger' + (danger ? ' mb-switch--on' : ''),
    onClick: () => setDanger(v => !v)
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-toggle__ic",
    style: worktree ? {
      background: 'var(--pn-run-soft)',
      color: 'var(--pn-run)'
    } : null
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__name"
  }, worktree ? 'Git worktree' : 'In-place'), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__desc"
  }, "Isolate changes on a branch")), /*#__PURE__*/React.createElement("button", {
    className: 'mb-switch' + (worktree ? ' mb-switch--on' : ''),
    onClick: () => setWorktree(v => !v)
  }))), t.subs && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlabel"
  }, "Subtasks \xB7 ", t.subs.length), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, t.subs.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: s.status,
    size: 16
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      color: s.status === 'completed' ? 'var(--pn-ink-4)' : 'var(--pn-ink)',
      textDecoration: s.status === 'completed' ? 'line-through' : 'none'
    }
  }, s.title), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 15,
    style: {
      color: 'var(--pn-ink-4)'
    }
  }))))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlabel"
  }, "Documents \xB7 2"), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 16,
    style: {
      color: 'var(--pn-ink-4)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14
    }
  }, "terminal-rendering-analysis.md"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 15,
    style: {
      color: 'var(--pn-ink-4)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "layers",
    size: 16,
    style: {
      color: 'var(--pn-ink-4)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14
    }
  }, "reparent-flow diagram"), /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 15,
    style: {
      color: 'var(--pn-ink-4)'
    }
  })))))));
}
Object.assign(window, {
  StatusBar,
  TasksScreen,
  TaskDetail,
  Emblem,
  emblemById,
  M_AV,
  M_TASKS,
  M_SESSIONS_LIVE,
  M_SESSIONS_IDLE,
  M_LABEL
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/mobile-tasks.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/mobile-team.jsx
try { (() => {
/* mobile-team.jsx — Team members, More menu, Skills, Files, + all sheets/dialogs. */
const {
  useState: mtS
} = React;

/* =====================================================================
   TEAM MEMBERS
   ===================================================================== */
const M_MEMBERS = [{
  ...M_AV.rhea,
  role: 'Reparent strike lead',
  agent: 'claude',
  model: 'Opus 4.8',
  isDefault: true,
  identity: 'You lead the terminal-reparenting fix. Prefer the registry ref over DOM moves; always re-run fit.fit().',
  skills: ['debugging', 'code-review'],
  mode: 'Coordinator'
}, {
  ...M_AV.kit,
  role: 'Pipeline & WebSocket',
  agent: 'codex',
  model: '5.3-codex',
  identity: 'You own the realtime pipeline. Keep updates idempotent and deduped.',
  skills: ['write-tests'],
  mode: 'Worker'
}, {
  ...M_AV.ada,
  role: 'Test runner',
  agent: 'claude',
  model: 'Haiku',
  profile: 'fast-haiku',
  scope: 'global',
  identity: 'You run and triage the test suite.',
  mode: 'Worker'
}];
function TeamScreen({
  nav
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mb-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-head__title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-head__eyebrow"
  }, "Project"), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__h"
  }, "Team")), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-chips"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-chip mb-chip--on"
  }, "Active ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "3")), /*#__PURE__*/React.createElement("button", {
    className: "mb-chip"
  }, "Archived ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "1"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Members"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), M_MEMBERS.map((m, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "mb-row",
    style: {
      background: 'var(--pn-card)',
      margin: '0 16px 9px',
      border: '1px solid var(--pn-line)',
      borderRadius: 14,
      borderBottom: '1px solid var(--pn-line)'
    },
    onClick: () => nav.push('memberDetail', m)
  }, /*#__PURE__*/React.createElement(Emblem, {
    id: m.emblem,
    cls: "mb-av-emblem"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mb-row__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-row__name"
  }, m.name, " ", m.isDefault && /*#__PURE__*/React.createElement("span", {
    className: "mb-tag mb-tag--green"
  }, "DEFAULT")), /*#__PURE__*/React.createElement("div", {
    className: "mb-row__sub"
  }, m.role, " \xB7 ", m.mode)), m.profile ? /*#__PURE__*/React.createElement("span", {
    className: "mb-tag mb-tag--brand"
  }, "\u25C8 ", m.profile) : /*#__PURE__*/React.createElement("span", {
    className: "mb-tag"
  }, m.model), /*#__PURE__*/React.createElement("span", {
    className: "mb-row__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))))), /*#__PURE__*/React.createElement("button", {
    className: "mb-fab",
    onClick: () => nav.sheet('createMember')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })));
}
function MemberDetail({
  nav,
  data: m
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-push"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    onClick: nav.pop
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }), " Team"), /*#__PURE__*/React.createElement("span", {
    className: "mb-subhead__t"
  }, m.name), /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead__r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13
    }
  }, /*#__PURE__*/React.createElement(Emblem, {
    id: m.emblem,
    cls: "mb-av-emblem"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__title",
    style: {
      fontSize: 22
    }
  }, m.name), /*#__PURE__*/React.createElement("div", {
    className: "mb-meta",
    style: {
      fontSize: 13,
      marginTop: 2
    }
  }, m.role))), /*#__PURE__*/React.createElement("button", {
    className: "mb-btn mb-btn--primary mb-btn--block"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 15
  }), " Run with ", m.name), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Mode"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, m.mode)), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Agent"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: m.agent
  }), " ", m.model)), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Scope"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, m.scope === 'global' ? 'Global' : 'Project')), m.profile && /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Profile"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval",
    style: {
      color: 'var(--pn-brand)'
    }
  }, "\u25C8 ", m.profile))), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlabel"
  }, "Identity"), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__desc",
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13
    }
  }, m.identity)), m.skills && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlabel"
  }, "Skills"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 7,
      flexWrap: 'wrap'
    }
  }, m.skills.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "mb-tag",
    style: {
      padding: '4px 9px',
      fontSize: 11
    }
  }, s)))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-row",
    style: {
      background: 'var(--pn-card)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pen",
    size: 17,
    style: {
      color: 'var(--pn-ink-3)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "mb-row__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-row__name",
    style: {
      fontSize: 14
    }
  }, "Edit member")), /*#__PURE__*/React.createElement("span", {
    className: "mb-row__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("button", {
    className: "mb-row",
    style: {
      background: 'var(--pn-card)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "archiveBox",
    size: 17,
    style: {
      color: 'var(--pn-ink-3)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "mb-row__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-row__name",
    style: {
      fontSize: 14
    }
  }, "Archive")))))));
}

/* =====================================================================
   MORE menu + Skills + Files
   ===================================================================== */
function MoreScreen({
  nav
}) {
  const item = (icon, name, sub, to, badge) => /*#__PURE__*/React.createElement("button", {
    className: "mb-row",
    style: {
      background: 'var(--pn-card)'
    },
    onClick: () => to && (typeof to === 'function' ? to() : nav.push(to))
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-toggle__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-row__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-row__name"
  }, name), /*#__PURE__*/React.createElement("div", {
    className: "mb-row__sub"
  }, sub)), badge && /*#__PURE__*/React.createElement("span", {
    className: "mb-tag mb-tag--brand"
  }, badge), /*#__PURE__*/React.createElement("span", {
    className: "mb-row__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })));
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "mb-head"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-head__title"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-head__eyebrow"
  }, "agent-maestro"), /*#__PURE__*/React.createElement("span", {
    className: "mb-head__h"
  }, "More"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Workspace"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-card-list"
  }, item('sparkles', 'Skills', '4 installed · marketplace', 'skills'), item('folder', 'Files', '~/code/agent-maestro · 5 changes', 'files'), item('grid', 'Board', 'Kanban across all tasks', 'board'), item('graph', 'Dependency graph', 'Task relationships', null)), /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Projects"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-card-list"
  }, item('listChecks', 'agent-maestro', '6 tasks · 4 sessions', null), item('listChecks', 'voice-alexa', '3 tasks · 1 session', null), item('plus', 'Add project', 'Open a folder', null)), /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "App"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-card-list"
  }, item('settings', 'Settings', 'Theme, models, defaults', () => nav.sheet('settings')), item('bot', 'Voice & directives', 'Alexa coordinator', null))));
}
function SkillsScreenM({
  nav
}) {
  const card = s => /*#__PURE__*/React.createElement("div", {
    className: "mb-skill",
    key: s.name
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-skill__top"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-skill__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles"
  })), /*#__PURE__*/React.createElement("span", {
    className: "mb-skill__name"
  }, s.name), /*#__PURE__*/React.createElement("span", {
    className: "mb-tag"
  }, s.src), s.ver && /*#__PURE__*/React.createElement("span", {
    className: "mb-tag mb-tag--brand"
  }, "v", s.ver)), /*#__PURE__*/React.createElement("div", {
    className: "mb-skill__desc"
  }, s.desc));
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-push"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    onClick: nav.pop
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }), " More"), /*#__PURE__*/React.createElement("span", {
    className: "mb-subhead__t"
  }, "Skills"), /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead__r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-chips"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-chip mb-chip--on"
  }, "Installed ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "4")), /*#__PURE__*/React.createElement("button", {
    className: "mb-chip"
  }, "Marketplace")), /*#__PURE__*/React.createElement("div", {
    className: "mb-body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Project \xB7 2"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), [{
    name: 'code-review',
    src: '.claude',
    ver: '1.2',
    desc: 'Reviews diffs for correctness, style, and missed edge cases before a PR.'
  }, {
    name: 'write-tests',
    src: '.claude',
    ver: '0.9',
    desc: 'Generates and runs unit + integration tests for changed modules.'
  }].map(card), /*#__PURE__*/React.createElement("div", {
    className: "mb-sec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__t"
  }, "Global \xB7 2"), /*#__PURE__*/React.createElement("span", {
    className: "mb-sec__line"
  })), [{
    name: 'debugging',
    src: '.agents',
    ver: '2.0',
    desc: 'Systematic root-cause analysis: reproduce, bisect, isolate, fix.'
  }, {
    name: 'find-skills',
    src: '.claude',
    desc: 'Discover relevant skills for your project from skills.sh.'
  }].map(card)));
}
const M_TREE = [{
  name: 'src',
  kind: 'folder',
  depth: 0,
  open: true
}, {
  name: 'components',
  kind: 'folder',
  depth: 1,
  open: true
}, {
  name: 'SessionTerminal.tsx',
  kind: 'file',
  depth: 2,
  git: 'm',
  active: true
}, {
  name: 'TeamView.tsx',
  kind: 'file',
  depth: 2,
  git: 'm'
}, {
  name: 'MaestroPanel.tsx',
  kind: 'file',
  depth: 2
}, {
  name: 'terminal-theme.ts',
  kind: 'file',
  depth: 1,
  git: 'a'
}, {
  name: 'old-theme.css',
  kind: 'file',
  depth: 0,
  git: 'd'
}, {
  name: 'README.md',
  kind: 'file',
  depth: 0,
  git: 'm'
}];
function FilesScreenM({
  nav
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-push"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-back",
    onClick: nav.pop
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronL"
  }), " More"), /*#__PURE__*/React.createElement("span", {
    className: "mb-subhead__t"
  }, "Files"), /*#__PURE__*/React.createElement("div", {
    className: "mb-subhead__r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-body",
    style: {
      paddingTop: 6
    }
  }, M_TREE.map((f, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: "mb-row",
    style: {
      paddingLeft: 16 + f.depth * 18,
      paddingTop: 11,
      paddingBottom: 11,
      background: f.active ? 'var(--pn-active)' : 'var(--pn-surface)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: f.kind === 'folder' ? f.open ? 'folderOpen' : 'folder' : f.name.endsWith('.md') ? 'doc' : 'fileCode',
    size: 16,
    style: {
      color: f.kind === 'folder' ? 'var(--pn-brand-2)' : 'var(--pn-ink-4)',
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      fontSize: 14,
      color: f.git === 'd' ? 'var(--pn-ink-4)' : 'var(--pn-ink-2)',
      textDecoration: f.git === 'd' ? 'line-through' : 'none',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, f.name), f.git && /*#__PURE__*/React.createElement("span", {
    className: 'mb-fgit mb-fgit--' + f.git
  }, f.git.toUpperCase())))));
}

/* =====================================================================
   SHEETS + DIALOGS
   ===================================================================== */
function Sheet({
  title,
  onClose,
  children,
  foot
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-sheet-scrim",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sheet",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-sheet__grip"
  }), title && /*#__PURE__*/React.createElement("div", {
    className: "mb-sheet__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-sheet__h"
  }, title), /*#__PURE__*/React.createElement("button", {
    className: "mb-iconbtn mb-iconbtn--ghost",
    onClick: onClose
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-sheet__body"
  }, children), foot && /*#__PURE__*/React.createElement("div", {
    className: "mb-sheet__foot"
  }, foot)));
}
function CreateTaskSheet({
  nav
}) {
  const [prio, setPrio] = mtS('medium');
  const dot = {
    high: 'var(--pn-block)',
    medium: 'var(--pn-wait)',
    low: 'var(--pn-idle)'
  };
  return /*#__PURE__*/React.createElement(Sheet, {
    title: "New task",
    onClose: nav.closeSheet,
    foot: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "mb-btn mb-btn--ghost",
      onClick: nav.closeSheet
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "mb-btn mb-btn--run mb-btn--block"
    }, "Create & run"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("input", {
    className: "mb-input",
    style: {
      fontFamily: 'var(--pn-serif)',
      fontSize: 19
    },
    placeholder: "Task title",
    autoFocus: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "mb-textarea",
    placeholder: "Describe the task \u2014 @ to reference a file, # for a skill"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-flabel"
  }, "Priority"), /*#__PURE__*/React.createElement("div", {
    className: "mb-prio"
  }, ['high', 'medium', 'low'].map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    className: prio === p ? 'on' : '',
    onClick: () => setPrio(p)
  }, /*#__PURE__*/React.createElement("span", {
    className: "d",
    style: {
      background: dot[p]
    }
  }), p[0].toUpperCase() + p.slice(1))))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Assignee"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-av",
    style: {
      width: 22,
      height: 22,
      color: M_AV.rhea.color,
      background: M_AV.rhea.bg
    }
  }, "R"), " Rhea ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Model"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval",
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13
    }
  }, "opus-4.8 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })))));
}
function CreateMemberSheet({
  nav
}) {
  const [emblem, setEmblem] = mtS('violin');
  const [agent, setAgent] = mtS('claude');
  const [mode, setMode] = mtS('worker');
  const emblems = ['violin', 'piano', 'trumpet', 'snare', 'guitar', 'harp', 'quill', 'compass', 'gear', 'beaker', 'sun', 'owl'];
  return /*#__PURE__*/React.createElement(Sheet, {
    title: "New team member",
    onClose: nav.closeSheet,
    foot: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      className: "mb-btn mb-btn--ghost",
      onClick: nav.closeSheet
    }, "Cancel"), /*#__PURE__*/React.createElement("button", {
      className: "mb-btn mb-btn--primary mb-btn--block"
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "plus",
      size: 15
    }), " Create"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("input", {
    className: "mb-input",
    style: {
      fontFamily: 'var(--pn-serif)',
      fontSize: 19
    },
    placeholder: "Name"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-flabel"
  }, "Emblem"), /*#__PURE__*/React.createElement("div", {
    className: "mb-emblems"
  }, emblems.map(id => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'mb-emblem' + (emblem === id ? ' mb-emblem--on' : ''),
    onClick: () => setEmblem(id)
  }, /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24"
  }, emblemById(id).svg))))), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-flabel"
  }, "Role"), /*#__PURE__*/React.createElement("input", {
    className: "mb-input",
    placeholder: "e.g. frontend specialist"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-flabel"
  }, "Mode"), /*#__PURE__*/React.createElement("div", {
    className: "mb-prio"
  }, /*#__PURE__*/React.createElement("button", {
    className: mode === 'worker' ? 'on' : '',
    onClick: () => setMode('worker')
  }, "Worker"), /*#__PURE__*/React.createElement("button", {
    className: mode === 'orch' ? 'on' : '',
    onClick: () => setMode('orch')
  }, "Orchestrator"))), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-flabel"
  }, "Agent"), /*#__PURE__*/React.createElement("div", {
    className: "mb-agents"
  }, [['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([k, l]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: 'mb-agent' + (agent === k ? ' mb-agent--on' : ''),
    onClick: () => setAgent(k)
  }, /*#__PURE__*/React.createElement("img", {
    src: '../assets/' + (k === 'claude' ? 'claude-code-icon' : k === 'codex' ? 'openai-codex-icon' : 'gemini-logo') + '.png',
    alt: ""
  }), l)))), /*#__PURE__*/React.createElement("div", {
    className: "mb-field"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-flabel"
  }, "Identity"), /*#__PURE__*/React.createElement("textarea", {
    className: "mb-textarea",
    placeholder: "Persona, expertise, how they work\u2026"
  })));
}
function RunConfigSheet({
  nav,
  coord
}) {
  return /*#__PURE__*/React.createElement(Sheet, {
    title: coord ? 'Coordinate' : 'Run task',
    onClose: nav.closeSheet,
    foot: /*#__PURE__*/React.createElement("button", {
      className: 'mb-btn mb-btn--block ' + (coord ? 'mb-btn--coord' : 'mb-btn--run')
    }, coord ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Icon, {
      name: "baton",
      size: 16
    }), " Spawn team") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Icon, {
      name: "play",
      size: 15
    }), " Run now"))
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__desc",
    style: {
      fontSize: 13
    }
  }, coord ? 'An orchestrator will spawn a team and delegate subtasks.' : 'A single worker executes this task.'), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, coord ? 'Coordinator' : 'Worker'), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-av",
    style: {
      width: 22,
      height: 22,
      color: M_AV.rhea.color,
      background: M_AV.rhea.bg
    }
  }, "R"), " Rhea ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Model"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval",
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13
    }
  }, "opus-4.8 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), coord && /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Max workers"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, "3 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })))), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-toggle__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch"
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__name"
  }, "Git worktree"), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__desc"
  }, "Isolate on a branch")), /*#__PURE__*/React.createElement("button", {
    className: "mb-switch mb-switch--on"
  })));
}
function SessActionsSheet({
  nav,
  data: s
}) {
  return /*#__PURE__*/React.createElement(Sheet, {
    onClose: nav.closeSheet
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      paddingBottom: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-scard__agent",
    style: {
      width: 42,
      height: 42
    }
  }, s && s.agent === 'terminal' ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--pn-mono)',
      color: 'var(--pn-run)',
      fontWeight: 700
    }
  }, ">_") : /*#__PURE__*/React.createElement("img", {
    src: '../assets/' + (s && s.agent === 'codex' ? 'openai-codex-icon' : s && s.agent === 'gemini' ? 'gemini-logo' : 'claude-code-icon') + '.png',
    alt: ""
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 600
    }
  }, s ? s.name : 'Session'), /*#__PURE__*/React.createElement("div", {
    className: "mb-meta"
  }, s ? s.statusText : ''))), /*#__PURE__*/React.createElement("div", {
    className: "mb-actlist"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow",
    onClick: () => {
      nav.closeSheet();
      nav.push('terminal');
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "terminal"
  }), " Open terminal"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "teamview"
  }), " Team view ", /*#__PURE__*/React.createElement("span", {
    className: "mb-actrow__sub"
  }, "3 workers")), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  }), " Resume session"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy"
  }), " Copy reference"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check"
  }), " Mark done"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow mb-actrow--danger",
    onClick: () => nav.sheet('confirmClose', s)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }), " Close session")));
}
function NewSessionSheet({
  nav
}) {
  return /*#__PURE__*/React.createElement(Sheet, {
    title: "New session",
    onClose: nav.closeSheet
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-actlist"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow",
    onClick: () => {
      nav.closeSheet();
      nav.push('terminal');
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 19,
      textAlign: 'center',
      fontFamily: 'var(--pn-mono)',
      color: 'var(--pn-run)',
      fontWeight: 700
    }
  }, ">_"), " Plain terminal"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/claude-code-icon.png",
    style: {
      width: 19,
      height: 19
    },
    alt: ""
  }), " Claude Code"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/openai-codex-icon.png",
    style: {
      width: 19,
      height: 19
    },
    alt: ""
  }), " Codex"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/gemini-logo.png",
    style: {
      width: 19,
      height: 19
    },
    alt: ""
  }), " Gemini"), /*#__PURE__*/React.createElement("button", {
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users"
  }), " Run a team member ", /*#__PURE__*/React.createElement("span", {
    className: "mb-actrow__sub"
  }, "3"))));
}
function SwitchSessionSheet({
  nav
}) {
  const all = [{
    name: 'Rhea',
    agent: 'claude',
    sub: 'coordinating',
    on: false
  }, {
    name: 'fluffy-starlight',
    agent: 'claude',
    sub: 'editing',
    on: true
  }, {
    name: 'Alexa coordinator',
    agent: 'codex',
    sub: 'needs input',
    on: false
  }];
  return /*#__PURE__*/React.createElement(Sheet, {
    title: "Switch session",
    onClose: nav.closeSheet
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-actlist"
  }, all.map(s => /*#__PURE__*/React.createElement("button", {
    key: s.name,
    className: "mb-actrow"
  }, /*#__PURE__*/React.createElement("img", {
    src: '../assets/' + (s.agent === 'codex' ? 'openai-codex-icon' : 'claude-code-icon') + '.png',
    style: {
      width: 19,
      height: 19
    },
    alt: ""
  }), " ", s.name, " ", /*#__PURE__*/React.createElement("span", {
    className: "mb-actrow__sub"
  }, s.on ? '● current' : s.sub)))));
}
function SettingsSheet({
  nav
}) {
  const [dark, setDark] = mtS(document.documentElement.dataset.theme === 'dark');
  const toggle = () => setDark(d => {
    const nd = !d;
    document.documentElement.dataset.theme = nd ? 'dark' : '';
    return nd;
  });
  return /*#__PURE__*/React.createElement(Sheet, {
    title: "Settings",
    onClose: nav.closeSheet
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-toggle__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: dark ? 'moon' : 'sun'
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__b"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__name"
  }, "Dark theme"), /*#__PURE__*/React.createElement("div", {
    className: "mb-toggle__desc"
  }, "Warm graphite")), /*#__PURE__*/React.createElement("button", {
    className: 'mb-switch' + (dark ? ' mb-switch--on' : ''),
    onClick: toggle
  })), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__group"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Default model"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval",
    style: {
      fontFamily: 'var(--pn-mono)',
      fontSize: 13
    }
  }, "opus-4.8 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Default mode"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, "Safe ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "mb-d__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowlabel"
  }, "Notifications"), /*#__PURE__*/React.createElement("span", {
    className: "mb-d__rowval"
  }, "On ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })))));
}
function ConfirmCloseDialog({
  nav,
  data: s
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-dlg-scrim",
    onClick: nav.closeSheet
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlg",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-dlg__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "mb-dlg__ic mb-dlg__ic--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 22,
    sw: 2
  })), /*#__PURE__*/React.createElement("span", {
    className: "mb-dlg__t"
  }, "Close session")), /*#__PURE__*/React.createElement("div", {
    className: "mb-dlg__body"
  }, "Close ", /*#__PURE__*/React.createElement("strong", null, s ? s.name : 'this session'), "? Its live terminal will be stopped \u2014 the record stays in Archived."), /*#__PURE__*/React.createElement("div", {
    className: "mb-dlg__foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-btn mb-btn--danger mb-btn--block",
    onClick: nav.closeSheet
  }, "Close session"), /*#__PURE__*/React.createElement("button", {
    className: "mb-btn mb-btn--ghost mb-btn--block",
    onClick: nav.closeSheet
  }, "Cancel"))));
}
Object.assign(window, {
  TeamScreen,
  MemberDetail,
  MoreScreen,
  SkillsScreenM,
  FilesScreenM,
  Sheet,
  CreateTaskSheet,
  CreateMemberSheet,
  RunConfigSheet,
  SessActionsSheet,
  NewSessionSheet,
  SwitchSessionSheet,
  SettingsSheet,
  ConfirmCloseDialog
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/mobile-team.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/mobile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* mobile.jsx — shell: phone frame, bottom nav, router, sheet host. */
const {
  useState: mainS
} = React;
const NAV = [{
  id: 'tasks',
  icon: 'listChecks',
  label: 'Tasks'
}, {
  id: 'sessions',
  icon: 'layers',
  label: 'Sessions',
  badge: true
}, {
  id: '_terminal',
  icon: 'terminal',
  label: '',
  center: true
}, {
  id: 'team',
  icon: 'users',
  label: 'Team'
}, {
  id: 'more',
  icon: 'more',
  label: 'More'
}];
const SCREENS = {
  tasks: 'TasksScreen',
  sessions: 'SessionsScreen',
  team: 'TeamScreen',
  more: 'MoreScreen'
};
const PUSH = {
  taskDetail: 'TaskDetail',
  teamview: 'TeamViewScreen',
  board: 'BoardScreen',
  memberDetail: 'MemberDetail',
  skills: 'SkillsScreenM',
  files: 'FilesScreenM',
  terminal: 'TerminalScreen'
};
const SHEETS = {
  createTask: 'CreateTaskSheet',
  createMember: 'CreateMemberSheet',
  runConfig: 'RunConfigSheet',
  coordConfig: 'RunConfigSheet',
  sessActions: 'SessActionsSheet',
  newSession: 'NewSessionSheet',
  switchSession: 'SwitchSessionSheet',
  settings: 'SettingsSheet',
  confirmClose: 'ConfirmCloseDialog'
};
function App() {
  const [tab, setTab] = mainS('tasks');
  const [stack, setStack] = mainS([]); // [{screen, data}]
  const [sheet, setSheet] = mainS(null); // {name, data}

  const nav = {
    setTab: t => {
      setStack([]);
      setTab(t);
    },
    push: (screen, data) => setStack(s => [...s, {
      screen,
      data
    }]),
    pop: () => setStack(s => s.slice(0, -1)),
    sheet: (name, data) => setSheet({
      name,
      data
    }),
    closeSheet: () => setSheet(null)
  };
  const top = stack[stack.length - 1];
  const TabComp = window[SCREENS[tab]];
  let PushComp = null;
  if (top) PushComp = window[PUSH[top.screen]];
  let SheetComp = null;
  if (sheet) SheetComp = window[SHEETS[sheet.name]];
  const sheetExtra = sheet && sheet.name === 'coordConfig' ? {
    coord: true
  } : {};
  const onNav = n => {
    if (n.center) {
      nav.push('terminal');
      return;
    }
    nav.setTab(n.id);
  };
  const terminalActive = top && top.screen === 'terminal';
  return /*#__PURE__*/React.createElement("div", {
    className: "mb-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-phone"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-island"
  }), /*#__PURE__*/React.createElement("div", {
    className: "mb-screen-clip"
  }, /*#__PURE__*/React.createElement(StatusBar, null), TabComp ? /*#__PURE__*/React.createElement(TabComp, {
    nav: nav
  }) : null, !terminalActive && /*#__PURE__*/React.createElement("div", {
    className: "mb-nav"
  }, NAV.map(n => n.center ? /*#__PURE__*/React.createElement("div", {
    className: "mb-navcenter",
    key: n.id
  }, /*#__PURE__*/React.createElement("button", {
    className: "mb-navcenter__btn",
    onClick: () => onNav(n)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: n.icon
  }))) : /*#__PURE__*/React.createElement("button", {
    key: n.id,
    className: 'mb-navbtn' + (tab === n.id && !top ? ' mb-navbtn--on' : ''),
    onClick: () => onNav(n)
  }, n.badge && /*#__PURE__*/React.createElement("span", {
    className: "mb-navbtn__badge"
  }), /*#__PURE__*/React.createElement(Icon, {
    name: n.icon
  }), /*#__PURE__*/React.createElement("span", {
    className: "mb-navbtn__lab"
  }, n.label)))), stack.map((entry, i) => {
    const C = window[PUSH[entry.screen]];
    if (!C) return null;
    return /*#__PURE__*/React.createElement(C, {
      key: i,
      nav: nav,
      data: entry.data
    });
  }), SheetComp && /*#__PURE__*/React.createElement(SheetComp, _extends({
    nav: nav,
    data: sheet.data
  }, sheetExtra)))));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/mobile.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/modals.jsx
try { (() => {
/* modals.jsx — Create Task & New Team Member, in the new theme.
   Relies on kit.jsx (Icon, AgentTile) + tiles.jsx (Avatar, Glyph). */

const MEM = [{
  initial: 'R',
  name: 'Rhea',
  color: '#1f6f5f',
  bg: '#dcebe6'
}, {
  initial: 'K',
  name: 'Kit',
  color: '#7a5cc0',
  bg: '#ece4f7'
}, {
  initial: 'A',
  name: 'Ada',
  color: '#b06a2b',
  bg: '#f4e7d6'
}];

/* ============================ CREATE TASK ============================ */
function CreateTaskModal() {
  const [priority, setPriority] = React.useState('medium');
  const [tab, setTab] = React.useState('details');
  const [worktree, setWorktree] = React.useState(false);
  const [danger, setDanger] = React.useState(false);
  const [assignees] = React.useState([MEM[0]]);
  const pdot = {
    high: 'var(--pn-block)',
    medium: 'var(--pn-wait)',
    low: 'var(--pn-idle)'
  };
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__hd"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__hdmain"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__crumb"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "listChecks"
  }), " ", /*#__PURE__*/React.createElement("b", null, "agent-maestro"), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 11
  }), " New task"), /*#__PURE__*/React.createElement("input", {
    className: "pn-mdl__titleinput",
    placeholder: "Untitled task",
    defaultValue: "Fix terminal reparenting crash on board close"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-mdl__close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-desc pn-fld"
  }, /*#__PURE__*/React.createElement("textarea", {
    className: "pn-textarea",
    placeholder: "Describe the task \u2014 type @ to reference a file, # to pull in a skill.",
    defaultValue: "The board reparents [data-terminal-id]; TeamView moves term.element. Make the board reparent via the registry ref instead, then re-run fit.fit()."
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-desc__bar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-mchip"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "paperclip"
  }), " Attach"), /*#__PURE__*/React.createElement("button", {
    className: "pn-mchip"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "at"
  }), " Reference"), /*#__PURE__*/React.createElement("button", {
    className: "pn-mchip"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "hash"
  }), " Skill"), /*#__PURE__*/React.createElement("span", {
    className: "pn-mchip pn-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), " terminal-rendering-analysis.md ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  }))))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mtabs"
  }, [['details', 'Details', 'sliders'], ['skills', 'Skills', 'sparkles'], ['subtasks', 'Subtasks', 'listChecks'], ['refs', 'References', 'at']].map(([id, label, icon]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'pn-mtab' + (tab === id ? ' pn-mtab--active' : ''),
    onClick: () => setTab(id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon
  }), " ", label, id === 'skills' && /*#__PURE__*/React.createElement("span", {
    className: "pn-mtab__n"
  }, "2")))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__body",
    style: {
      maxHeight: 220,
      paddingTop: 16,
      paddingBottom: 16
    }
  }, tab === 'details' && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Priority"), /*#__PURE__*/React.createElement("div", {
    className: "pn-prio-pills"
  }, ['high', 'medium', 'low'].map(p => /*#__PURE__*/React.createElement("button", {
    key: p,
    className: 'pn-prio-pill' + (priority === p ? ' pn-prio-pill--active' : ''),
    onClick: () => setPriority(p)
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-pdot",
    style: {
      background: pdot[p]
    }
  }), p === 'medium' ? 'Medium' : p[0].toUpperCase() + p.slice(1))))), /*#__PURE__*/React.createElement("div", {
    className: "pn-frow"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-fld",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Due date"), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "calendar",
    size: 14,
    style: {
      position: 'absolute',
      left: 10,
      top: 10,
      color: 'var(--pn-ink-4)'
    }
  }), /*#__PURE__*/React.createElement("input", {
    className: "pn-input",
    style: {
      paddingLeft: 32
    },
    placeholder: "No due date",
    defaultValue: "Jun 12, 2026"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Isolation"), /*#__PURE__*/React.createElement("button", {
    className: 'pn-toggle' + (worktree ? ' pn-toggle--on-wt' : ''),
    onClick: () => setWorktree(v => !v),
    style: {
      height: 38
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 14
  }), " ", worktree ? 'Git worktree' : 'In-place')), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Permissions"), /*#__PURE__*/React.createElement("button", {
    className: 'pn-toggle' + (danger ? ' pn-toggle--on-danger' : ''),
    onClick: () => setDanger(v => !v),
    style: {
      height: 38
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 14
  }), " ", danger ? 'YOLO' : 'Safe')))), tab === 'skills' && /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Skills attached ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "2")), /*#__PURE__*/React.createElement("div", {
    className: "pn-desc__bar",
    style: {
      marginTop: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-mchip pn-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), " code-review ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-mchip pn-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), " write-tests ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-mchip"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12
  }), " Add skill"))), tab === 'subtasks' && /*#__PURE__*/React.createElement("div", {
    className: "pn-fhint"
  }, "No subtasks yet. Subtasks appear here once the task is created."), tab === 'refs' && /*#__PURE__*/React.createElement("div", {
    className: "pn-fhint"
  }, "Reference other tasks to give this one context. None linked yet.")), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__footL"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel",
    style: {
      letterSpacing: '0.06em'
    }
  }, "Assignee"), /*#__PURE__*/React.createElement(Avatar, {
    a: assignees[0]
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-assignadd"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-badge pn-badge--model",
    style: {
      marginLeft: 4
    }
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "claude"
  }), " opus-4.8 ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 9,
    className: "pn-badge__caret"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__footR"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn"
  }, "Create"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 13
  }), " Create & start"))));
}

/* ========================= NEW TEAM MEMBER ========================= */
function TeamMemberModal() {
  const [mode, setMode] = React.useState('worker');
  const [scope, setScope] = React.useState('project');
  const [tool, setTool] = React.useState('claude');
  const [instr, setInstr] = React.useState('violin');
  const [tab, setTab] = React.useState('caps');
  const [caps, setCaps] = React.useState({
    spawn: false,
    edit: true,
    rTask: true,
    rSession: true
  });
  const toggleCap = k => setCaps(c => ({
    ...c,
    [k]: !c[k]
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__hd"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__hdmain"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__crumb"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users"
  }), " ", /*#__PURE__*/React.createElement("b", null, "agent-maestro"), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR",
    size: 11
  }), " New team member"), /*#__PURE__*/React.createElement("input", {
    className: "pn-mdl__titleinput",
    placeholder: "Name \u2014 e.g. Frontend Dev",
    defaultValue: "Rhea"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-mdl__close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-frow",
    style: {
      alignItems: 'flex-end'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Avatar"), /*#__PURE__*/React.createElement("button", {
    className: "pn-avatar-edit",
    title: "Pick avatar"
  }, "R")), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld",
    style: {
      flex: 1,
      minWidth: 160
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Role ", /*#__PURE__*/React.createElement("span", {
    className: "req"
  }, "*")), /*#__PURE__*/React.createElement("input", {
    className: "pn-input",
    placeholder: "e.g. frontend specialist, test runner",
    defaultValue: "Reparent strike lead"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Mode"), /*#__PURE__*/React.createElement("div", {
    className: "pn-seg"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'pn-seg-i' + (mode === 'worker' ? ' pn-seg-i--active' : ''),
    onClick: () => setMode('worker')
  }, "Worker"), /*#__PURE__*/React.createElement("button", {
    className: 'pn-seg-i' + (mode === 'orch' ? ' pn-seg-i--active' : ''),
    onClick: () => setMode('orch')
  }, "Orchestrator"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Scope"), /*#__PURE__*/React.createElement("button", {
    className: 'pn-toggle' + (scope === 'global' ? ' pn-toggle--on-wt' : ''),
    onClick: () => setScope(s => s === 'global' ? 'project' : 'global'),
    style: {
      height: 30
    }
  }, scope === 'global' ? 'Global' : 'Project'))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Identity"), /*#__PURE__*/React.createElement("textarea", {
    className: "pn-textarea pn-textarea--mono",
    placeholder: "Describe this member's persona, expertise, and how they approach tasks\u2026",
    defaultValue: "You lead the terminal-reparenting fix. You read the rendering pipeline carefully, prefer the registry ref over DOM moves, and always re-run fit.fit() after a reparent. Hand off tests to @Ada."
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Agent & model"), /*#__PURE__*/React.createElement("div", {
    className: "pn-toolsel"
  }, [['claude', 'Claude'], ['codex', 'Codex'], ['gemini', 'Gemini']].map(([k, label]) => /*#__PURE__*/React.createElement("button", {
    key: k,
    className: 'pn-tool' + (tool === k ? ' pn-tool--active' : ''),
    onClick: () => setTool(k)
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: k
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-tool__name"
  }, label)))), /*#__PURE__*/React.createElement("div", {
    className: "pn-frow",
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-fld",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("select", {
    className: "pn-select",
    defaultValue: "opus-4.8"
  }, /*#__PURE__*/React.createElement("option", null, "opus-4.8"), /*#__PURE__*/React.createElement("option", null, "sonnet-4.5"), /*#__PURE__*/React.createElement("option", null, "opus[1m]"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fld",
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("select", {
    className: "pn-select",
    defaultValue: "acceptEdits"
  }, /*#__PURE__*/React.createElement("option", {
    value: "acceptEdits"
  }, "Accept edits"), /*#__PURE__*/React.createElement("option", null, "Interactive"), /*#__PURE__*/React.createElement("option", null, "Read only"), /*#__PURE__*/React.createElement("option", null, "Bypass \u2014 auto-approve")))))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mtabs"
  }, [['caps', 'Capabilities', 'shield'], ['skills', 'Skills', 'sparkles'], ['sound', 'Sound', 'music']].map(([id, label, icon]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'pn-mtab' + (tab === id ? ' pn-mtab--active' : ''),
    onClick: () => setTab(id)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon
  }), " ", label))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__body",
    style: {
      maxHeight: 210
    }
  }, tab === 'caps' && /*#__PURE__*/React.createElement("div", {
    className: "pn-caps"
  }, [['spawn', 'Spawn sessions', 'Can create new agent sessions'], ['edit', 'Edit tasks', 'Create, edit and delete tasks'], ['rTask', 'Report task-level', 'Report progress on individual tasks'], ['rSession', 'Report session-level', 'Report session-wide progress']].map(([k, name, desc]) => /*#__PURE__*/React.createElement("div", {
    key: k,
    className: "pn-cap",
    onClick: () => toggleCap(k)
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-cap__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-cap__name"
  }, name), /*#__PURE__*/React.createElement("div", {
    className: "pn-cap__desc"
  }, desc)), /*#__PURE__*/React.createElement("span", {
    className: 'pn-switch' + (caps[k] ? ' pn-switch--on' : '')
  })))), tab === 'skills' && /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, "Skills"), /*#__PURE__*/React.createElement("div", {
    className: "pn-desc__bar",
    style: {
      marginTop: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-mchip pn-mchip--ref"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 12
  }), " debugging ", /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 11
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-mchip"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12
  }), " Add skill"))), tab === 'sound' && /*#__PURE__*/React.createElement("div", {
    className: "pn-fld"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-flabel"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "music",
    size: 12
  }), " Instrument \u2014 each agent plays a distinct voice"), /*#__PURE__*/React.createElement("div", {
    className: "pn-instr"
  }, ['piano', 'guitar', 'violin', 'trumpet', 'drums'].map(i => /*#__PURE__*/React.createElement("button", {
    key: i,
    className: 'pn-instr-i' + (instr === i ? ' pn-instr-i--active' : ''),
    onClick: () => setInstr(i)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "music"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-instr-i__name"
  }, i)))))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__foot"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__footL"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-savehint"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--idle"
  }), " \u2318\u21B5 to save")), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl__footR"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 13
  }), " Create member"))));
}
function Modals() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl-cap"
  }, "Create task"), /*#__PURE__*/React.createElement(CreateTaskModal, null)), /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl-col"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mdl-cap"
  }, "New team member"), /*#__PURE__*/React.createElement(TeamMemberModal, null)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Modals, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/modals.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/right-panels.jsx
try { (() => {
/* right-panels.jsx — three layouts for the Spaces (right) panel.
   A · Roster     — clean status-grouped rows
   B · Cards      — calm cards on white
   C · NowPlaying — live "what each agent is doing" (the signature move) */

function SpacesToolbar({
  active
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-tabs",
    style: {
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: 'pn-tab' + (active === 'sessions' ? ' pn-tab--active' : ''),
    style: {
      paddingTop: 13
    }
  }, "Sessions ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "4")), /*#__PURE__*/React.createElement("button", {
    className: 'pn-tab' + (active === 'resources' ? ' pn-tab--active' : ''),
    style: {
      paddingTop: 13
    }
  }, "Resources"), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "New space",
    style: {
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Collapse",
    style: {
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })));
}
function QuickLaunch() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-quick"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-plus"
  }, "\uFF0B"), " Terminal"), /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/claude-code-icon.png",
    alt: ""
  }), " Claude"), /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/openai-codex-icon.png",
    alt: ""
  }), " Codex"), /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/gemini-logo.png",
    alt: ""
  }), " Gemini"));
}

/* ============================== A · ROSTER ============================== */
function SessRow({
  kind,
  name,
  status,
  statusText,
  elapsed,
  tasks,
  live,
  active,
  wait
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-sess' + (active ? ' pn-sess--active' : '') + (wait ? ' pn-sess--wait' : '')
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: kind,
    lg: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__name"
  }, name), /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__status"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot-wrap'
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot pn-dot--' + status + (live ? ' pn-dot--live' : '')
  })), /*#__PURE__*/React.createElement("span", {
    className: 'pn-sess__statustext' + (status === 'wait' ? ' pn-sess__statustext--wait' : status === 'run' ? ' pn-sess__statustext--run' : '')
  }, statusText), elapsed && /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "\xB7 ", elapsed))), /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__trail"
  }, tasks && /*#__PURE__*/React.createElement("span", {
    className: "pn-chip"
  }, tasks), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    style: {
      width: 24,
      height: 24
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  }))));
}
function RosterRight() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-panel",
    style: {
      borderLeft: '1px solid var(--pn-line-2)'
    }
  }, /*#__PURE__*/React.createElement(SpacesToolbar, {
    active: "sessions"
  }), /*#__PURE__*/React.createElement(QuickLaunch, null), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Running ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, /*#__PURE__*/React.createElement(SessRow, {
    kind: "claude",
    name: "fluffy-starlight",
    status: "run",
    statusText: "Editing SessionTerminal.tsx",
    elapsed: "4m",
    tasks: "#142",
    live: true,
    active: true
  }), /*#__PURE__*/React.createElement(SessRow, {
    kind: "codex",
    name: "Alexa coordinator",
    status: "run",
    statusText: "Running test suite",
    elapsed: "12m",
    tasks: "3",
    live: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Needs input ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 1")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, /*#__PURE__*/React.createElement(SessRow, {
    kind: "claude",
    name: "vast-neumann",
    status: "wait",
    statusText: "Waiting on your reply",
    elapsed: "2m",
    tasks: "#151",
    wait: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Idle ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 1")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, /*#__PURE__*/React.createElement(SessRow, {
    kind: "gemini",
    name: "concurrent-cosmos",
    status: "idle",
    statusText: "Idle",
    elapsed: "1h"
  }), /*#__PURE__*/React.createElement(SessRow, {
    kind: "terminal",
    name: "zesty-wave",
    status: "idle",
    statusText: "Exited \xB7 code 0",
    elapsed: "3h"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--block"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New session")));
}

/* ============================== B · CARDS ============================== */
function SessCard({
  kind,
  name,
  pill,
  pillText,
  activity,
  tasks,
  elapsed,
  live
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-card-s"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-card-s__top"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: kind,
    lg: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-card-s__name"
  }, name), /*#__PURE__*/React.createElement("span", {
    className: 'pn-pill pn-pill--' + pill
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot pn-dot--' + (pill === 'run' ? 'run' : pill === 'wait' ? 'wait' : 'idle') + (live ? ' pn-dot--live' : '')
  })), pillText)), /*#__PURE__*/React.createElement("div", {
    className: "pn-card-s__act"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-caret"
  }, "\u203A"), /*#__PURE__*/React.createElement("span", null, activity)), /*#__PURE__*/React.createElement("div", {
    className: "pn-card-s__foot"
  }, tasks && /*#__PURE__*/React.createElement("span", {
    className: "pn-chip"
  }, tasks), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta",
    style: {
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 12,
    style: {
      verticalAlign: '-2px',
      marginRight: 4
    }
  }), elapsed)));
}
function CardsRight() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-panel",
    style: {
      borderLeft: '1px solid var(--pn-line-2)'
    }
  }, /*#__PURE__*/React.createElement(SpacesToolbar, {
    active: "sessions"
  }), /*#__PURE__*/React.createElement(QuickLaunch, null), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-cards"
  }, /*#__PURE__*/React.createElement(SessCard, {
    kind: "claude",
    name: "fluffy-starlight",
    pill: "run",
    pillText: "Running",
    live: true,
    activity: "Reparenting terminal nodes via registry\u2026",
    tasks: "#142",
    elapsed: "4m"
  }), /*#__PURE__*/React.createElement(SessCard, {
    kind: "claude",
    name: "vast-neumann",
    pill: "wait",
    pillText: "Needs input",
    activity: "Asking: which Opus 1M gap to close?",
    tasks: "#151",
    elapsed: "2m"
  }), /*#__PURE__*/React.createElement(SessCard, {
    kind: "codex",
    name: "Alexa coordinator",
    pill: "run",
    pillText: "Running",
    live: true,
    activity: "Running integration tests on staging\u2026",
    tasks: "3 tasks",
    elapsed: "12m"
  }), /*#__PURE__*/React.createElement(SessCard, {
    kind: "gemini",
    name: "concurrent-cosmos",
    pill: "idle",
    pillText: "Idle",
    activity: "Last: summarized the WebSocket pipeline",
    tasks: "#138",
    elapsed: "1h"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--block"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New session")));
}

/* ============================== C · NOW PLAYING ============================== */
function NpItem({
  kind,
  name,
  elapsed,
  say,
  typing,
  prog
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-np__item"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-np__top"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: kind,
    lg: true
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-np__name"
  }, name), /*#__PURE__*/React.createElement("span", {
    className: "pn-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run pn-dot--live"
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-np__elapsed"
  }, elapsed)), /*#__PURE__*/React.createElement("div", {
    className: "pn-np__say"
  }, "\u201C", say, "\u201D", typing && /*#__PURE__*/React.createElement("span", {
    className: "pn-typing"
  }, /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null))), /*#__PURE__*/React.createElement("div", {
    className: "pn-np__bar"
  }, /*#__PURE__*/React.createElement("i", {
    style: {
      width: prog + '%'
    }
  })));
}
function NowPlayingRight() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-panel",
    style: {
      borderLeft: '1px solid var(--pn-line-2)'
    }
  }, /*#__PURE__*/React.createElement(SpacesToolbar, {
    active: "sessions"
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '16px 16px 10px',
      display: 'flex',
      alignItems: 'baseline',
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--pn-serif)',
      fontSize: 20,
      fontWeight: 500,
      color: 'var(--pn-ink)',
      whiteSpace: 'nowrap'
    }
  }, "Now playing"), /*#__PURE__*/React.createElement("span", {
    className: "pn-chip",
    style: {
      marginLeft: 'auto'
    }
  }, "2 live")), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-np"
  }, /*#__PURE__*/React.createElement(NpItem, {
    kind: "claude",
    name: "fluffy-starlight",
    elapsed: "4m12s",
    say: "Reparenting the terminal node, then I\u2019ll re-run the fit",
    typing: true,
    prog: 62
  }), /*#__PURE__*/React.createElement(NpItem, {
    kind: "codex",
    name: "Alexa coordinator",
    elapsed: "12m",
    say: "Integration tests passing \u2014 14 of 18 green so far",
    typing: true,
    prog: 78
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head",
    style: {
      paddingTop: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Needs you ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 1")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-list"
  }, /*#__PURE__*/React.createElement(SessRow, {
    kind: "claude",
    name: "vast-neumann",
    status: "wait",
    statusText: "Asking about the Opus 1M gap",
    elapsed: "2m",
    tasks: "#151",
    wait: true
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-offstage"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Off stage"), /*#__PURE__*/React.createElement("div", {
    className: "pn-off-row"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "gemini"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-off-row__name"
  }, "concurrent-cosmos"), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "idle \xB7 1h")), /*#__PURE__*/React.createElement("div", {
    className: "pn-off-row"
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: "terminal"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-off-row__name"
  }, "zesty-wave"), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "exited \xB7 3h")))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-foot"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--block"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New session")));
}
Object.assign(window, {
  RosterRight,
  CardsRight,
  NowPlayingRight
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/right-panels.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/shell.jsx
try { (() => {
/* shell.jsx — the full app shell in context, reskinned in the new theme.
   Structure is faithful to the real app:
   [top bar] · [icon rail | Maestro panel | terminal | Spaces panel | spaces rail] */

/* ---------- left: task row (Ledger style, no color left-bar) ---------- */
function TRow({
  status,
  title,
  prio,
  id,
  subs,
  assignee,
  live
}) {
  const dc = {
    run: 'pn-dot--run',
    wait: 'pn-dot--wait',
    todo: 'pn-dot--idle',
    block: 'pn-dot--block'
  }[status] || 'pn-dot--idle';
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-row"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-row__lead"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot ' + dc + (live ? ' pn-dot--live' : '')
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-row__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-row__title"
  }, title), /*#__PURE__*/React.createElement("div", {
    className: "pn-row__sub"
  }, prio && /*#__PURE__*/React.createElement("span", {
    className: 'pn-tag pn-tag--' + prio
  }, prio), /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "#", id, subs ? ` · ${subs} subtasks` : ''))), /*#__PURE__*/React.createElement("div", {
    className: "pn-row__trail"
  }, assignee && /*#__PURE__*/React.createElement(AgentTile, {
    kind: assignee
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-row__run",
    title: "Run"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play"
  }))));
}

/* ---------- right: session row ---------- */
function SRow({
  kind,
  name,
  status,
  statusText,
  elapsed,
  tasks,
  live,
  active,
  wait
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-sess' + (active ? ' pn-sess--active' : '') + (wait ? ' pn-sess--wait' : '')
  }, /*#__PURE__*/React.createElement(AgentTile, {
    kind: kind,
    lg: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__name"
  }, name), /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__status"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-dot pn-dot--' + status + (live ? ' pn-dot--live' : '')
  })), /*#__PURE__*/React.createElement("span", {
    className: 'pn-sess__statustext' + (status === 'wait' ? ' pn-sess__statustext--wait' : status === 'run' ? ' pn-sess__statustext--run' : '')
  }, statusText), elapsed && /*#__PURE__*/React.createElement("span", {
    className: "pn-meta"
  }, "\xB7 ", elapsed))), /*#__PURE__*/React.createElement("div", {
    className: "pn-sess__trail"
  }, tasks && /*#__PURE__*/React.createElement("span", {
    className: "pn-chip"
  }, tasks), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    style: {
      width: 24,
      height: 24
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  }))));
}

/* ---------- shell tree data ---------- */
const RHEA_S = {
  initial: 'R',
  name: 'Rhea',
  color: '#1f6f5f',
  bg: '#dcebe6'
};
const KIT_S = {
  initial: 'K',
  name: 'Kit',
  color: '#7a5cc0',
  bg: '#ece4f7'
};
const ADA_S = {
  initial: 'A',
  name: 'Ada',
  color: '#b06a2b',
  bg: '#f4e7d6'
};
const SHELL_TASK_TREE = [{
  id: 'st1',
  title: 'Fix terminal reparenting crash on board close',
  status: 'in_progress',
  priority: 'high',
  assignees: [RHEA_S],
  docs: 2,
  subtaskCount: 3,
  activity: 'working',
  active: true,
  pinned: true,
  children: [{
    id: 'st1a',
    title: 'Audit where terminals get reparented',
    status: 'completed',
    priority: 'medium',
    assignees: [KIT_S]
  }, {
    id: 'st1b',
    title: 'Make board reparent via registry ref',
    status: 'in_progress',
    priority: 'high',
    assignees: [RHEA_S],
    subtaskCount: 2,
    children: [{
      id: 'st1b1',
      title: 'Thread registry ref to MultiProjectSessionsView',
      status: 'todo',
      priority: 'medium'
    }, {
      id: 'st1b2',
      title: 're-run fit.fit() after the move',
      status: 'todo',
      priority: 'low'
    }]
  }, {
    id: 'st1c',
    title: 'Add regression test for connection loss',
    status: 'blocked',
    priority: 'medium',
    assignees: [ADA_S]
  }]
}, {
  id: 'st2',
  title: 'WebSocket pipeline — dedupe session updates',
  status: 'in_progress',
  priority: 'medium',
  assignees: [KIT_S],
  activity: 'needsInput'
}];
const SHELL_TASK_NEXT = [{
  id: 'st3',
  title: 'Add a model-profile indirection layer',
  status: 'todo',
  priority: 'medium',
  assignees: [RHEA_S, KIT_S],
  docs: 1,
  subtaskCount: 2
}, {
  id: 'st4',
  title: 'Verify Opus 1M spawns with 1M context window',
  status: 'in_review',
  priority: 'low'
}, {
  id: 'st5',
  title: 'Migrate task ordering to server persistence',
  status: 'blocked',
  priority: 'medium',
  assignees: [ADA_S]
}];
const SHELL_COORD = {
  id: 'ss1',
  title: 'Rhea · coordinator',
  agent: 'claude',
  status: 'working',
  live: true,
  childCount: 3,
  tasklines: [{
    status: 'in_progress',
    title: 'Fix terminal reparenting crash'
  }],
  children: [{
    id: 'ss1a',
    title: 'fluffy-starlight',
    agent: 'claude',
    status: 'working',
    live: true,
    tasklines: [{
      status: 'in_progress',
      title: 'Make board reparent via registry ref'
    }]
  }, {
    id: 'ss1b',
    title: 'vast-neumann',
    agent: 'claude',
    status: 'working',
    live: true,
    needsInput: true,
    tasklines: [{
      status: 'todo',
      title: 'Model-profile indirection layer'
    }]
  }, {
    id: 'ss1c',
    title: 'Alexa coordinator',
    agent: 'codex',
    status: 'working',
    live: true
  }]
};
const SHELL_SESS_IDLE = [{
  id: 'ss2',
  title: 'concurrent-cosmos',
  agent: 'gemini',
  status: 'idle',
  live: false
}, {
  id: 'ss3',
  title: 'zesty-wave',
  agent: 'terminal',
  status: 'stopped',
  live: false,
  humanDone: true
}];

/* ---------- icon rail (far left) ---------- */
const RAIL = [['tasks', 'listChecks', 'Tasks', 6], ['members', 'users', 'Members', 4], ['teams', 'team', 'Teams', null], ['skills', 'sparkles', 'Skills', null], ['lists', 'inbox', 'Lists', 2], ['graphs', 'graph', 'Graphs', null], ['files', 'folder', 'Files', null]];
function IconRail() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-rail"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-rail-mark"
  }, /*#__PURE__*/React.createElement(Mark, {
    size: 24
  })), RAIL.map(([id, icon, label, badge]) => /*#__PURE__*/React.createElement("button", {
    key: id,
    className: 'pn-rail-btn' + (id === 'tasks' ? ' pn-rail-btn--active' : ''),
    title: label
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    sw: 1.55
  }), badge ? /*#__PURE__*/React.createElement("span", {
    className: "pn-rail-badge"
  }, badge) : null)), /*#__PURE__*/React.createElement("span", {
    className: "pn-rail-spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-rail-btn",
    title: "Whiteboard"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pen",
    sw: 1.55
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-rail-btn",
    title: "Settings"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "settings",
    sw: 1.55
  })));
}

/* ---------- Maestro panel (left content) ---------- */
function MaestroPanel() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-mp"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-proj"
  }, "agent-maestro ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 13
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Standup"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "more"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-subbar"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary",
    style: {
      height: 30
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New task"), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-subtab pn-subtab--active",
    title: "Current"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "listChecks"
  }), " 6"), /*#__PURE__*/React.createElement("button", {
    className: "pn-subtab",
    title: "Pinned"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pin"
  }), " 1"), /*#__PURE__*/React.createElement("button", {
    className: "pn-subtab",
    title: "Completed"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "check"
  }), " 8"), /*#__PURE__*/React.createElement("button", {
    className: "pn-subtab",
    title: "Archived"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "archive"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search tasks"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-kbd"
  }, "\u2318K")), /*#__PURE__*/React.createElement("div", {
    className: "pn-filters"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-filter pn-filter--active"
  }, "All"), /*#__PURE__*/React.createElement("button", {
    className: "pn-filter"
  }, "High"), /*#__PURE__*/React.createElement("button", {
    className: "pn-filter"
  }, "Mine"), /*#__PURE__*/React.createElement("button", {
    className: "pn-filter",
    style: {
      marginLeft: 'auto'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sliders",
    size: 13
  }), " Sort")), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "In progress ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), SHELL_TASK_TREE.map(n => /*#__PURE__*/React.createElement(TaskNode, {
    key: n.id,
    node: n,
    expandedId: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Up next ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 3")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), SHELL_TASK_NEXT.map(n => /*#__PURE__*/React.createElement(TaskNode, {
    key: n.id,
    node: n,
    expandedId: ""
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }));
}

/* ---------- terminal (center, stays dark) ---------- */
function Terminal() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-term"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-term-bar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tdot"
  }), /*#__PURE__*/React.createElement("b", null, "fluffy-starlight"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tslash"
  }, "\xB7"), /*#__PURE__*/React.createElement("span", null, "claude \xB7 opus-4.8"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      color: '#6a6457'
    }
  }, "fix/terminal-reparent")), /*#__PURE__*/React.createElement("div", {
    className: "pn-term-body"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    className: "l-prompt"
  }, "\u203A"), " Analyzing terminal reparenting in ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "AppWorkspace.tsx")), /*#__PURE__*/React.createElement("div", {
    className: "l-dim"
  }, "\xA0\xA0Read SessionTerminal.tsx \xB7 MultiProjectSessionsView.tsx"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-acc"
  }, "\u25CF"), " The board moves ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "[data-terminal-id]"), " \u2014 the React-owned"), /*#__PURE__*/React.createElement("div", {
    className: "l-dim"
  }, "\xA0\xA0container \u2014 while TeamView moves ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "term.element"), ". They disagree."), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-acc"
  }, "\u25CF"), " Editing ", /*#__PURE__*/React.createElement("span", {
    className: "l-file"
  }, "MultiProjectSessionsView.tsx")), /*#__PURE__*/React.createElement("div", {
    className: "l-ok"
  }, "\xA0\xA0+ reparent registry.current.get(session.id)?.term.element"), /*#__PURE__*/React.createElement("div", {
    className: "l-ok"
  }, "\xA0\xA0+ re-run fit.fit() after the move"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-ok"
  }, "\u2713"), " ", /*#__PURE__*/React.createElement("span", {
    className: "l-dim"
  }, "Integration tests \u2014 14 of 18 passing")), /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 10
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "l-prompt"
  }, "\u203A"), " Reparenting the terminal node, then I'll re-run the fit", /*#__PURE__*/React.createElement("span", {
    className: "pn-tcursor"
  }))), /*#__PURE__*/React.createElement(TerminalStrip, null));
}

/* ---------- Spaces panel (right content) ---------- */
function SpacesPanel() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-sp"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tabs",
    style: {
      paddingTop: 0
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tab pn-tab--active",
    style: {
      paddingTop: 14
    }
  }, "Sessions ", /*#__PURE__*/React.createElement("span", {
    className: "pn-tab-n"
  }, "4")), /*#__PURE__*/React.createElement("button", {
    className: "pn-tab",
    style: {
      paddingTop: 14
    }
  }, "Resources"), /*#__PURE__*/React.createElement("span", {
    className: "pn-head-spacer",
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "New space",
    style: {
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Collapse",
    style: {
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-quick"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-plus"
  }, "\uFF0B"), " Terminal"), /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/claude-code-icon.png",
    alt: ""
  }), " Claude"), /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/openai-codex-icon.png",
    alt: ""
  }), " Codex"), /*#__PURE__*/React.createElement("button", {
    className: "pn-qchip"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/gemini-logo.png",
    alt: ""
  }), " Gemini")), /*#__PURE__*/React.createElement("div", {
    className: "pn-scroll"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Running ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 4")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-team"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-team__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-team__dot",
    style: {
      background: '#2f8f7f'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-team__name"
  }, "Reparent strike team"), /*#__PURE__*/React.createElement("span", {
    className: "pn-team__count"
  }, "4 sessions")), /*#__PURE__*/React.createElement(SessionNode, {
    node: SHELL_COORD,
    expandedId: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-sec-head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, "Idle ", /*#__PURE__*/React.createElement("span", {
    className: "pn-count"
  }, "\xB7 2")), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), SHELL_SESS_IDLE.map(n => /*#__PURE__*/React.createElement(SessionNode, {
    key: n.id,
    node: n,
    expandedId: ""
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-fade"
  }));
}

/* ---------- spaces rail (far right) ---------- */
function SpacesRail() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-srail"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-srail-s",
    title: "New space",
    style: {
      background: 'var(--pn-ink)',
      borderColor: 'var(--pn-ink)',
      color: 'var(--pn-paper)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-srail-s",
    title: "Expand"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "grid"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-rail-div"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-srail-s pn-srail-s--active",
    title: "fluffy-starlight"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/claude-code-icon.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-srail-pulse"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-srail-s",
    title: "Alexa coordinator"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/openai-codex-icon.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-srail-pulse"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-srail-s",
    title: "vast-neumann"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/claude-code-icon.png",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-srail-wait"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-srail-s",
    title: "concurrent-cosmos"
  }, /*#__PURE__*/React.createElement("img", {
    src: "../assets/gemini-logo.png",
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-srail-s pn-agent--term pn-srail-s--exited",
    title: "zesty-wave"
  }, ">_"));
}

/* ---------- top bar ---------- */
function TopBar() {
  const [dark, setDark] = React.useState(false);
  const toggle = () => setDark(d => {
    const nd = !d;
    document.documentElement.dataset.theme = nd ? 'dark' : '';
    return nd;
  });
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-top"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-lights"
  }, /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null), /*#__PURE__*/React.createElement("i", null)), /*#__PURE__*/React.createElement("div", {
    className: "pn-ptabs"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-ptab pn-ptab--active"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run"
  }), " agent-maestro"), /*#__PURE__*/React.createElement("span", {
    className: "pn-ptab"
  }, "voice-alexa"), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    style: {
      width: 26,
      height: 26
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-top-r"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: dark ? 'Light mode' : 'Dark mode',
    onClick: toggle
  }, /*#__PURE__*/React.createElement(Icon, {
    name: dark ? 'sun' : 'moon'
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Command"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-kbd"
  }, "\u2318K"))));
}
function Shell() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-shell"
  }, /*#__PURE__*/React.createElement(TopBar, null), /*#__PURE__*/React.createElement("div", {
    className: "pn-shell-body"
  }, /*#__PURE__*/React.createElement(IconRail, null), /*#__PURE__*/React.createElement(MaestroPanel, null), /*#__PURE__*/React.createElement(Terminal, null), /*#__PURE__*/React.createElement(SpacesPanel, null), /*#__PURE__*/React.createElement(SpacesRail, null)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Shell, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/shell.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/terminal-strip.jsx
try { (() => {
/* terminal-strip.jsx — the fused bottom strip (stats + log toggle + actions).
   Relies on kit.jsx (Icon). Self-contained dark palette via terminal-strip.css. */

function CtxGauge({
  pct
}) {
  const r = 10,
    c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__gauge"
  }, /*#__PURE__*/React.createElement("svg", {
    width: "26",
    height: "26",
    viewBox: "0 0 26 26"
  }, /*#__PURE__*/React.createElement("circle", {
    className: "pn-tstrip__gauge__track",
    cx: "13",
    cy: "13",
    r: r,
    fill: "none",
    strokeWidth: "2.5"
  }), /*#__PURE__*/React.createElement("circle", {
    className: "pn-tstrip__gauge__fill",
    cx: "13",
    cy: "13",
    r: r,
    fill: "none",
    strokeWidth: "2.5",
    strokeDasharray: c,
    strokeDashoffset: off
  })));
}
function TerminalStrip({
  stats,
  live = true,
  defaultOpen = false
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const s = stats || {
    ctxTokens: '48.2k',
    ctxPct: 24,
    ctxMax: '200k',
    cache: 92,
    out: '12.4k',
    turns: 8,
    tools: 23,
    duration: '4m 12s',
    model: 'opus-4.8'
  };
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'pn-tlog' + (open ? ' pn-tlog--open' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__inner"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__turn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__role pn-tlog__role--user"
  }, "you"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__text"
  }, "Fix the terminal reparenting crash when the board closes.")), /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__turn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__role pn-tlog__role--asst"
  }, "claude"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__text"
  }, "The board reparents ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#CBB98A'
    }
  }, "[data-terminal-id]"), " while TeamView moves ", /*#__PURE__*/React.createElement("span", {
    style: {
      color: '#CBB98A'
    }
  }, "term.element"), ". I'll route the board through the registry ref.")), /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__tool"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__toolchev"
  }, "\u25B8"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__toolname"
  }, "Edit"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__toolsum"
  }, "MultiProjectSessionsView.tsx"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__diffstat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "add"
  }, "+12"), " ", /*#__PURE__*/React.createElement("span", {
    className: "rem"
  }, "\u22124"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__bash"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__bashcmd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "p"
  }, "$"), "npm test -- reparent"), /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__bashout"
  }, "PASS  reparent keeps terminal mounted", '\n', "PASS  fit() re-runs after move")), /*#__PURE__*/React.createElement("div", {
    className: "pn-tlog__turn"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__role pn-tlog__role--asst"
  }, "claude"), /*#__PURE__*/React.createElement("span", {
    className: "pn-tlog__text"
  }, "Reparenting the node now, then re-running the fit.")))), /*#__PURE__*/React.createElement("div", {
    className: 'pn-tstrip' + (open ? ' pn-tstrip--open' : '')
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tstrip__log",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__chev"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__title"
  }, "Session Log"), live && /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__live"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__livedot"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__livetag"
  }, "LIVE"))), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__div"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-tstrip__stats"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__ctx"
  }, /*#__PURE__*/React.createElement(CtxGauge, {
    pct: s.ctxPct
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__ctxlabels"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__ctxval"
  }, /*#__PURE__*/React.createElement("b", null, s.ctxTokens), " / ", s.ctxMax), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__ctxsub"
  }, "context \xB7 ", s.ctxPct, "%"))), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__div"
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__stat pn-tstrip__stat--amber"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__bolt"
  }, "\u26A1"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.cache, "%"), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "cache")), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "out"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.out)), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.turns), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "turns")), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.tools), /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "tools")), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__stat"
  }, /*#__PURE__*/React.createElement("span", {
    className: "k"
  }, "\u29D7"), /*#__PURE__*/React.createElement("span", {
    className: "v"
  }, s.duration))), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__model"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dotmod"
  }), s.model), /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__div"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-tstrip__actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tstrip__btn",
    "data-tip": "Attach files \u2014 inject @paths"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "paperclip"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-tstrip__btn",
    "data-tip": "Draw \u2014 sketch into session"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "pen"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-tstrip__btn pn-tstrip__btn--cast",
    "data-tip": "Cast spell \u2014 inject prompt"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-tstrip__spark"
  }, "\u2726")))));
}
Object.assign(window, {
  TerminalStrip
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/terminal-strip.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/terminal-theme.ts
try { (() => {
/* ==========================================================================
 * MAESTRO · TERMINAL THEME  (xterm.js ITheme)
 * --------------------------------------------------------------------------
 * The terminal is rendered by xterm.js, so its colors come from THIS object,
 * not from CSS. Drop this in and use it where the Terminal is constructed:
 *
 *     import { MAESTRO_TERMINAL_THEME } from "./terminal-theme";
 *
 *     const term = new Terminal({
 *       allowProposedApi: true,
 *       cursorBlink: true,
 *       disableStdin: props.readOnly,
 *       fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
 *       fontSize: 13,
 *       theme: MAESTRO_TERMINAL_THEME,        // <- was the cold-blue partial theme
 *       scrollback: 5000,
 *     });
 *
 * To switch it live (e.g. when the app toggles light/dark), set:
 *     term.options.theme = MAESTRO_TERMINAL_THEME_DARK;
 * xterm re-reads .options.theme on assignment, so no re-create needed.
 *
 * WHY A FULL PALETTE: a partial theme (just bg/fg/cursor) leaves the 16 ANSI
 * colors at xterm's neon defaults — so git diffs, `ls`, test output and syntax
 * highlighting still look "AI cold". Defining all 16, warm + desaturated, is
 * what makes the whole terminal feel like part of the design system.
 *
 * The hexes below are the same warm-graphite palette as the panel tokens:
 *   bg = paper's dark twin, fg = warm parchment, accent = brass (--pn-brand).
 * ========================================================================== */

/* Used when the app chrome is LIGHT (light panels around a dark terminal). */
const MAESTRO_TERMINAL_THEME = {
  background: "#1B1812",
  // warm graphite (a touch lighter than dark-mode)
  foreground: "#D9D2C4",
  // warm parchment text
  cursor: "#E0A45A",
  // brass baton
  cursorAccent: "#1B1812",
  // glyph under block cursor
  selectionBackground: "rgba(224,164,90,0.22)",
  // brass wash, not cyan
  selectionForeground: "#F3EEE2",
  // ----- normal ANSI (warm, desaturated — never neon) -----
  black: "#322D24",
  // also used as low-contrast / comments
  red: "#CB7059",
  // errors, deletions   (matches --pn-block family)
  green: "#74B083",
  // success, additions  (matches --pn-run family)
  yellow: "#D2A24C",
  // warnings, prompts    (matches --pn-wait family)
  blue: "#6E9BC4",
  // info, links          (warm steel, matches --pn-info)
  magenta: "#B98BC0",
  // keywords
  cyan: "#6FB2A8",
  // strings / teal accent
  white: "#CFC8BA",
  // default text

  // ----- bright ANSI -----
  brightBlack: "#6B6453",
  // dim metadata, line numbers
  brightRed: "#DC8B73",
  brightGreen: "#8FC79C",
  brightYellow: "#E6B968",
  brightBlue: "#88B0D6",
  brightMagenta: "#CCA0D2",
  brightCyan: "#86C4BA",
  brightWhite: "#EFE9DB"
};

/* Used when the app chrome is DARK — the terminal sits a touch darker than the
   panels so it still reads as a distinct surface. Same ink/ANSI, deeper bg. */
const MAESTRO_TERMINAL_THEME_DARK = {
  ...MAESTRO_TERMINAL_THEME,
  background: "#100E0A",
  cursorAccent: "#100E0A"
};

/* Optional: keep it in lockstep with the CSS tokens. If you'd rather drive the
   terminal bg from --pn-term-bg, read it at construction time:

     const css = getComputedStyle(document.documentElement);
     const theme = {
       ...MAESTRO_TERMINAL_THEME,
       background: css.getPropertyValue("--pn-term-bg").trim() || "#1B1812",
       cursor:     css.getPropertyValue("--pn-brand").trim()   || "#E0A45A",
     };
*/
Object.assign(__ds_scope, { MAESTRO_TERMINAL_THEME, MAESTRO_TERMINAL_THEME_DARK });
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/terminal-theme.ts", error: String((e && e.message) || e) }); }

// panel-redesign/tiles-show.jsx
try { (() => {
/* tiles-show.jsx — showcase: full task tree, session spawn tree, state galleries. */

const RHEA = {
  initial: 'R',
  name: 'Rhea',
  color: '#1f6f5f',
  bg: '#dcebe6'
};
const KIT = {
  initial: 'K',
  name: 'Kit',
  color: '#7a5cc0',
  bg: '#ece4f7'
};
const ADA = {
  initial: 'A',
  name: 'Ada',
  color: '#b06a2b',
  bg: '#f4e7d6'
};

/* ---- task tree (one root expanded to show every attribute + its subtree) ---- */
const TASK_TREE = [{
  id: 't1',
  title: 'Fix terminal reparenting crash on board close',
  status: 'in_progress',
  priority: 'high',
  assignees: [RHEA],
  docs: 2,
  subtaskCount: 3,
  activity: 'working',
  model: 'opus-4.8',
  active: true,
  pinned: true,
  dangerous: false,
  worktree: true,
  due: 'Jun 12',
  updated: '4m ago',
  sessions: [{
    kind: 'working',
    label: 'WORKING'
  }, {
    kind: 'needsInput',
    label: 'NEEDS INPUT'
  }],
  docList: [{
    name: 'terminal-rendering-analysis.md',
    md: true
  }, {
    name: 'registry.ts',
    md: false
  }],
  diagrams: ['reparent-flow'],
  children: [{
    id: 't1a',
    title: 'Audit where terminals get reparented',
    status: 'completed',
    priority: 'medium',
    assignees: [KIT],
    updated: '1h ago'
  }, {
    id: 't1b',
    title: 'Make board reparent via registry ref',
    status: 'in_progress',
    priority: 'high',
    assignees: [RHEA],
    activity: 'working',
    subtaskCount: 2,
    updated: '4m ago',
    children: [{
      id: 't1b1',
      title: 'Thread registry ref to MultiProjectSessionsView',
      status: 'todo',
      priority: 'medium'
    }, {
      id: 't1b2',
      title: 're-run fit.fit() after the move',
      status: 'todo',
      priority: 'low'
    }]
  }, {
    id: 't1c',
    title: 'Add regression test for connection loss',
    status: 'blocked',
    priority: 'medium',
    assignees: [ADA],
    updated: '20m ago'
  }]
}, {
  id: 't2',
  title: 'Add a model-profile indirection layer',
  status: 'todo',
  priority: 'medium',
  assignees: [RHEA, KIT],
  docs: 1,
  subtaskCount: 2,
  model: 'default',
  updated: '2h ago'
}, {
  id: 't3',
  title: 'Verify Opus 1M spawns with 1M context window',
  status: 'in_review',
  priority: 'low',
  model: 'opus[1m]',
  updated: '5h ago'
}, {
  id: 't4',
  title: 'Migrate task ordering to server persistence',
  status: 'cancelled',
  priority: 'medium',
  updated: '1d ago'
}];

/* ---- session spawn tree (coordinator → workers) inside a team group ---- */
const COORD = {
  id: 's1',
  title: 'Rhea',
  agent: 'claude',
  avatars: [RHEA],
  status: 'working',
  live: true,
  mode: 'Coordinator',
  model: 'opus-4.8',
  childCount: 3,
  tasklines: [{
    status: 'in_progress',
    title: 'Fix terminal reparenting crash on board close'
  }],
  children: [{
    id: 's1a',
    title: 'fluffy-starlight',
    agent: 'claude',
    status: 'working',
    live: true,
    tasklines: [{
      status: 'in_progress',
      title: 'Make board reparent via registry ref'
    }]
  }, {
    id: 's1b',
    title: 'vast-neumann',
    agent: 'claude',
    status: 'working',
    live: true,
    needsInput: true,
    tasklines: [{
      status: 'todo',
      title: 'Add a model-profile indirection layer'
    }]
  }, {
    id: 's1c',
    title: 'Alexa coordinator',
    agent: 'codex',
    status: 'working',
    live: true,
    worktree: 'feat/voice',
    docs: 1
  }]
};
const SESS_OTHERS = [{
  id: 's2',
  title: 'concurrent-cosmos',
  agent: 'gemini',
  status: 'idle',
  live: false,
  humanDone: false,
  mode: 'Worker',
  model: 'gemini-2.5-pro',
  strategy: 'parallel',
  worktree: 'exp/cosmos',
  docs: 2,
  elapsed: '23m',
  taskchips: [{
    status: 'completed',
    title: 'Summarize WebSocket pipeline'
  }, {
    status: 'todo',
    title: 'Draft fix plan'
  }],
  docList: [{
    name: 'pipeline-notes.md',
    md: true
  }, {
    name: 'patch.diff',
    md: false
  }]
}, {
  id: 's3',
  title: 'zesty-wave',
  agent: 'terminal',
  status: 'stopped',
  live: false,
  humanDone: true
}, {
  id: 's4',
  title: 'sleepy-redo',
  agent: 'claude',
  status: 'stopped',
  live: false,
  archived: true
}];

/* ---- galleries ---- */
const TASK_STATES = ['todo', 'in_progress', 'in_review', 'blocked', 'completed', 'cancelled', 'archived'];
const SESS_STATES = [{
  k: 'spawning',
  live: true
}, {
  k: 'working',
  live: true
}, {
  k: 'needsInput',
  live: true
}, {
  k: 'idle',
  live: true
}, {
  k: 'completed',
  live: false,
  done: true
}, {
  k: 'failed',
  live: false
}, {
  k: 'stopped',
  live: false
}];
function Frame({
  icon,
  title,
  sub,
  children
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-showcol"
  }, sub && /*#__PURE__*/React.createElement("div", {
    className: "pn-showsub"
  }, sub), /*#__PURE__*/React.createElement("div", {
    className: "pn-showframe"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-showframe__hd"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: icon,
    size: 15,
    style: {
      color: 'var(--pn-ink-3)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, title)), children));
}
function Show() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-showstage"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 820,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-showcap",
    style: {
      marginBottom: 8
    }
  }, "Maestro \xB7 tiles + trees"), /*#__PURE__*/React.createElement("div", {
    className: "pn-showsub",
    style: {
      fontSize: 13,
      lineHeight: 1.5
    }
  }, "Task & session tiles with every attribute, and the nesting that matters most \u2014 subtask trees and coordinator\u2192worker spawn chains. Status reads through drawn glyphs, words and dots; team identity is a ring/dot, never a colored bar.")), /*#__PURE__*/React.createElement("div", {
    className: "pn-showrow"
  }, /*#__PURE__*/React.createElement(Frame, {
    icon: "listChecks",
    title: "Task tree",
    sub: "Parent \u2192 subtasks (2 levels). Top task expanded to show full meta."
  }, TASK_TREE.map(n => /*#__PURE__*/React.createElement(TaskNode, {
    key: n.id,
    node: n,
    expandedId: "t1"
  }))), /*#__PURE__*/React.createElement(Frame, {
    icon: "terminal",
    title: "Session spawn tree",
    sub: "Coordinator spawns workers, grouped as a team. One worker needs input; one session expanded."
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-team"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-team__head"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-team__dot",
    style: {
      background: '#2f8f7f'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-team__name"
  }, "Reparent strike team"), /*#__PURE__*/React.createElement("span", {
    className: "pn-team__count"
  }, "4 sessions")), /*#__PURE__*/React.createElement(SessionNode, {
    node: COORD,
    expandedId: ""
  })), SESS_OTHERS.map(n => /*#__PURE__*/React.createElement(SessionNode, {
    key: n.id,
    node: n,
    expandedId: "s2"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-showcol"
  }, /*#__PURE__*/React.createElement(Frame, {
    icon: "grid",
    title: "Task states"
  }, TASK_STATES.map(st => /*#__PURE__*/React.createElement(TaskTile, {
    key: st,
    t: {
      id: st,
      title: TASK_LABELfor(st),
      status: st,
      priority: st === 'blocked' ? 'high' : 'medium'
    }
  }))), /*#__PURE__*/React.createElement(Frame, {
    icon: "grid",
    title: "Session states"
  }, SESS_STATES.map(s => /*#__PURE__*/React.createElement(SessionTile, {
    key: s.k,
    s: {
      id: s.k,
      title: SESS_LABELfor(s),
      agent: 'claude',
      status: s.k === 'needsInput' ? 'working' : s.k,
      needsInput: s.k === 'needsInput',
      live: s.live,
      humanDone: s.done
    }
  }))))));
}
function TASK_LABELfor(st) {
  const m = {
    todo: 'Todo task',
    in_progress: 'Working on it now',
    in_review: 'Up for review',
    blocked: 'Blocked on dependency',
    completed: 'Finished and shipped',
    cancelled: 'Cancelled — out of scope',
    archived: 'Archived task'
  };
  return m[st];
}
function SESS_LABELfor(s) {
  const m = {
    spawning: 'Spawning…',
    working: 'Working session',
    needsInput: 'Needs your input',
    idle: 'Idle session',
    completed: 'Done session',
    failed: 'Failed session',
    stopped: 'Exited session'
  };
  return m[s.k];
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Show, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/tiles-show.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/tiles.jsx
try { (() => {
/* tiles.jsx — interactive Task & Session tiles + trees.
   Expand/collapse (trees + tile meta), inline-edit dropdowns (portal popovers).
   Relies on kit.jsx (Icon, AgentTile). */
const {
  useState,
  useRef,
  useLayoutEffect
} = React;

/* ---------------- drawn status glyph ---------------- */
function Glyph({
  kind,
  size = 16
}) {
  const ring = /*#__PURE__*/React.createElement("circle", {
    cx: "8",
    cy: "8",
    r: "6",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6"
  });
  let inner = null;
  switch (kind) {
    case 'todo':
    case 'idle':
      inner = ring;
      break;
    case 'in_progress':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        opacity: "0.28"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeLinecap: "round",
        pathLength: "100",
        strokeDasharray: "62 100",
        transform: "rotate(-90 8 8)"
      }));
      break;
    case 'working':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "2.6",
        fill: "currentColor"
      }));
      break;
    case 'in_review':
      inner = /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: "1.6",
        strokeDasharray: "2 2.3"
      });
      break;
    case 'completed':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        fill: "currentColor"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M5 8.2l2.1 2.1L11 6.4",
        fill: "none",
        stroke: "var(--pn-card)",
        strokeWidth: "1.7",
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }));
      break;
    case 'cancelled':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("path", {
        d: "M4.5 11.5l7-7",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }));
      break;
    case 'blocked':
    case 'failed':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("path", {
        d: "M5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6",
        stroke: "currentColor",
        strokeWidth: "1.5",
        strokeLinecap: "round"
      }));
      break;
    case 'archived':
    case 'stopped':
      inner = /*#__PURE__*/React.createElement("rect", {
        x: "3",
        y: "3",
        width: "10",
        height: "10",
        rx: "2.5",
        fill: kind === 'stopped' ? 'currentColor' : 'none',
        stroke: "currentColor",
        strokeWidth: "1.6"
      });
      break;
    case 'spawning':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, ring, /*#__PURE__*/React.createElement("path", {
        d: "M8 2a6 6 0 000 12z",
        fill: "currentColor"
      }));
      break;
    case 'needsInput':
      inner = /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "8",
        r: "6.5",
        fill: "currentColor"
      }), /*#__PURE__*/React.createElement("path", {
        d: "M8 4.6v4",
        stroke: "var(--pn-surface)",
        strokeWidth: "1.6",
        strokeLinecap: "round"
      }), /*#__PURE__*/React.createElement("circle", {
        cx: "8",
        cy: "11",
        r: "0.95",
        fill: "var(--pn-surface)"
      }));
      break;
    default:
      inner = ring;
  }
  return /*#__PURE__*/React.createElement("span", {
    className: 'pn-stat pn-stat--' + kind,
    style: {
      width: size,
      height: size
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    "aria-hidden": "true"
  }, inner));
}
const TASK_LABEL = {
  todo: 'Todo',
  in_progress: 'In progress',
  in_review: 'In review',
  completed: 'Completed',
  cancelled: 'Cancelled',
  blocked: 'Blocked',
  archived: 'Archived'
};
const SESS_LABEL = {
  spawning: 'Spawning',
  idle: 'Idle',
  working: 'Working',
  completed: 'Done',
  failed: 'Failed',
  stopped: 'Stopped'
};
const TASK_STATUSES = ['todo', 'in_progress', 'in_review', 'completed', 'cancelled', 'blocked', 'archived'];
const PRIORITIES = ['high', 'medium', 'low'];
const MODELS = ['default', 'opus-4.8', 'sonnet-4.5', 'opus[1m]', 'gemini-2.5-pro', 'codex-1'];
const MODES = ['Worker', 'Coordinator', 'Co-Worker', 'Co-Coordinator'];
const ALL_MEMBERS = [{
  initial: 'R',
  name: 'Rhea',
  color: '#1f6f5f',
  bg: '#dcebe6'
}, {
  initial: 'K',
  name: 'Kit',
  color: '#7a5cc0',
  bg: '#ece4f7'
}, {
  initial: 'A',
  name: 'Ada',
  color: '#b06a2b',
  bg: '#f4e7d6'
}, {
  initial: 'M',
  name: 'Milo',
  color: '#3f6c90',
  bg: '#dde8f1'
}];
function Avatar({
  a
}) {
  return /*#__PURE__*/React.createElement("span", {
    className: "pn-av",
    style: {
      color: a.color,
      background: a.bg || 'var(--pn-active)'
    }
  }, a.initial);
}
function Avatars({
  list
}) {
  if (!list || !list.length) return null;
  if (list.length === 1) return /*#__PURE__*/React.createElement(Avatar, {
    a: list[0]
  });
  return /*#__PURE__*/React.createElement("span", {
    className: "pn-av-group"
  }, list.slice(0, 3).map((a, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "pn-av pn-av--stack",
    style: {
      color: a.color,
      background: a.bg || 'var(--pn-active)'
    }
  }, a.initial)));
}

/* portal popover anchored to a trigger ref */
function Menu({
  anchorRef,
  onClose,
  children
}) {
  const [p, setP] = useState(null);
  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setP({
      top: Math.min(r.bottom + 4, window.innerHeight - 280),
      left: Math.min(r.left, window.innerWidth - 196)
    });
  }, []);
  if (!p) return null;
  return ReactDOM.createPortal(/*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "pn-pop-ov",
    onClick: e => {
      e.stopPropagation();
      onClose();
    }
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-pop",
    style: {
      top: p.top,
      left: p.left
    },
    onClick: e => e.stopPropagation()
  }, children)), document.body);
}
function Opt({
  cur,
  onClick,
  children
}) {
  return /*#__PURE__*/React.createElement("button", {
    className: 'pn-opt' + (cur ? ' pn-opt--cur' : ''),
    onClick: onClick
  }, children, cur && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 12,
    sw: 2,
    className: "pn-opt__chk"
  }));
}

/* ---------------- TASK TILE ---------------- */
function TaskTile({
  t,
  collapsed,
  onToggleCollapse,
  defaultExpanded
}) {
  const [open, setOpen] = useState(!!defaultExpanded);
  const [status, setStatus] = useState(t.status);
  const [priority, setPriority] = useState(t.priority || 'medium');
  const [assignees, setAssignees] = useState(t.assignees || []);
  const [model, setModel] = useState(t.model || 'default');
  const [danger, setDanger] = useState(!!t.dangerous);
  const [worktree, setWorktree] = useState(!!t.worktree);
  const [menu, setMenu] = useState(null);
  const sRef = useRef(),
    pRef = useRef(),
    aRef = useRef(),
    mRef = useRef();
  const hasKids = t.children && t.children.length > 0 || t.subtaskCount > 0;
  const toggleAssignee = m => setAssignees(prev => prev.some(x => x.name === m.name) ? prev.filter(x => x.name !== m.name) : [...prev, m]);
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-tt' + (status === 'completed' ? ' pn-tt--completed' : '') + (t.active ? ' pn-tt--active' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__main"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'pn-tt__arrow ' + (hasKids ? collapsed ? '' : 'pn-tt__arrow--expanded' : 'pn-tt__arrow--empty'),
    onClick: () => hasKids && onToggleCollapse && onToggleCollapse(),
    title: hasKids ? 'Toggle subtasks' : 'Add subtask'
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })), hasKids && /*#__PURE__*/React.createElement("span", {
    className: "pn-tt__arrowCount"
  }, t.subtaskCount || (t.children ? t.children.length : 0)), /*#__PURE__*/React.createElement("button", {
    className: "pn-tt__status",
    title: TASK_LABEL[status] + ' — click to toggle complete',
    onClick: () => setStatus(s => s === 'completed' ? 'todo' : 'completed')
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: status
  })), t.pinned && /*#__PURE__*/React.createElement(Icon, {
    name: "pin",
    size: 12,
    style: {
      color: 'var(--pn-brand)',
      flex: '0 0 auto'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: 'pn-tt__title' + (!t.title ? ' pn-tt__title--untitled' : ''),
    onClick: () => setOpen(v => !v)
  }, t.title || 'Untitled'), t.active && /*#__PURE__*/React.createElement("span", {
    className: "pn-tt__activedot",
    title: "Current session is on this task"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__inline"
  }, priority && /*#__PURE__*/React.createElement("span", {
    className: 'pn-tag pn-tag--' + (priority === 'high' ? 'high' : priority === 'medium' ? 'med' : 'low')
  }, priority === 'medium' ? 'med' : priority), assignees.length > 0 && /*#__PURE__*/React.createElement(Avatars, {
    list: assignees
  }), t.docs > 0 && /*#__PURE__*/React.createElement("span", {
    className: "pn-mini"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), t.docs), t.activity && /*#__PURE__*/React.createElement("span", {
    className: 'pn-stat pn-stat--' + (t.activity === 'needsInput' ? 'needsInput' : t.activity),
    title: 'Session ' + t.activity
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: t.activity === 'needsInput' ? 'needsInput' : t.activity,
    size: 14
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-tt__run",
    title: "Run task"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play"
  })), /*#__PURE__*/React.createElement("button", {
    className: 'pn-tt__ind' + (open ? ' pn-tt__ind--open' : ''),
    title: "Details",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })))), open && /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__metarow"
  }, /*#__PURE__*/React.createElement("button", {
    ref: sRef,
    className: 'pn-badge pn-badge--btn pn-badge--status-' + status,
    onClick: () => setMenu(menu === 's' ? null : 's')
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: status,
    size: 12
  }), " ", TASK_LABEL[status], " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 9,
    className: "pn-badge__caret"
  })), /*#__PURE__*/React.createElement("button", {
    ref: pRef,
    className: 'pn-badge pn-badge--btn' + (priority === 'high' ? ' pn-badge--prio-high' : ''),
    onClick: () => setMenu(menu === 'p' ? null : 'p')
  }, priority.toUpperCase(), " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 9,
    className: "pn-badge__caret"
  })), /*#__PURE__*/React.createElement("button", {
    ref: aRef,
    className: "pn-badge pn-badge--btn",
    onClick: () => setMenu(menu === 'a' ? null : 'a')
  }, assignees.length ? /*#__PURE__*/React.createElement(Avatars, {
    list: assignees
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 12
  }), " ", assignees.length ? assignees.length > 1 ? assignees.length + ' members' : assignees[0].name : 'Assign', " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 9,
    className: "pn-badge__caret"
  })), /*#__PURE__*/React.createElement("button", {
    ref: mRef,
    className: 'pn-badge pn-badge--btn pn-badge--model' + (model !== (t.model || 'default') ? ' is-override' : ''),
    onClick: () => setMenu(menu === 'm' ? null : 'm')
  }, model, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 9,
    className: "pn-badge__caret"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__metarow"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'pn-toggle' + (danger ? ' pn-toggle--on-danger' : ''),
    onClick: () => setDanger(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "shield",
    size: 13
  }), " ", danger ? 'YOLO' : 'Safe'), /*#__PURE__*/React.createElement("button", {
    className: 'pn-toggle' + (worktree ? ' pn-toggle--on-wt' : ''),
    onClick: () => setWorktree(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 13
  }), " ", worktree ? 'worktree' : 'in-place'), t.due && /*#__PURE__*/React.createElement("span", {
    className: "pn-mini",
    style: {
      color: t.overdue ? 'var(--pn-block)' : 'var(--pn-ink-3)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "clock",
    size: 12
  }), " ", t.due), /*#__PURE__*/React.createElement("span", {
    className: "pn-tt__time"
  }, "updated ", t.updated || 'just now')), t.sessions && /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__metarow"
  }, t.sessions.map((s, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: 'pn-actchip pn-actchip--' + s.kind
  }, s.label))), (t.docList || t.diagrams) && /*#__PURE__*/React.createElement("div", {
    className: "pn-tt__metarow"
  }, t.docList && t.docList.map((d, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "pn-docpill"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill__ic"
  }, d.md ? 'M↓' : '{}'), /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill__t"
  }, d.name))), t.diagrams && t.diagrams.map((d, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "pn-docpill"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill__ic"
  }, "\u2B21"), /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill__t"
  }, d))), /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill pn-docpill--add"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 11
  }), " Diagram"))), menu === 's' && /*#__PURE__*/React.createElement(Menu, {
    anchorRef: sRef,
    onClose: () => setMenu(null)
  }, TASK_STATUSES.map(s => /*#__PURE__*/React.createElement(Opt, {
    key: s,
    cur: s === status,
    onClick: () => {
      setStatus(s);
      setMenu(null);
    }
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: s,
    size: 14
  }), " ", TASK_LABEL[s]))), menu === 'p' && /*#__PURE__*/React.createElement(Menu, {
    anchorRef: pRef,
    onClose: () => setMenu(null)
  }, PRIORITIES.map(p => /*#__PURE__*/React.createElement(Opt, {
    key: p,
    cur: p === priority,
    onClick: () => {
      setPriority(p);
      setMenu(null);
    }
  }, p.toUpperCase()))), menu === 'a' && /*#__PURE__*/React.createElement(Menu, {
    anchorRef: aRef,
    onClose: () => setMenu(null)
  }, ALL_MEMBERS.map(m => /*#__PURE__*/React.createElement(Opt, {
    key: m.name,
    cur: assignees.some(x => x.name === m.name),
    onClick: () => toggleAssignee(m)
  }, /*#__PURE__*/React.createElement(Avatar, {
    a: m
  }), " ", m.name))), menu === 'm' && /*#__PURE__*/React.createElement(Menu, {
    anchorRef: mRef,
    onClose: () => setMenu(null)
  }, MODELS.map(m => /*#__PURE__*/React.createElement(Opt, {
    key: m,
    cur: m === model,
    onClick: () => {
      setModel(m);
      setMenu(null);
    }
  }, m))));
}
function TaskNode({
  node,
  expandedId
}) {
  const [collapsed, setCollapsed] = useState(node.collapsed ?? false);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(TaskTile, {
    t: node,
    collapsed: collapsed,
    onToggleCollapse: () => setCollapsed(c => !c),
    defaultExpanded: node.id === expandedId
  }), node.children && !collapsed && /*#__PURE__*/React.createElement("div", {
    className: "pn-kids"
  }, node.children.map(c => /*#__PURE__*/React.createElement(TaskNode, {
    key: c.id,
    node: c,
    expandedId: expandedId
  }))));
}

/* ---------------- SESSION TILE ---------------- */
function SessionTile({
  s,
  collapsed,
  onToggleCollapse,
  defaultExpanded
}) {
  const [open, setOpen] = useState(!!defaultExpanded);
  const [mode, setMode] = useState(s.mode || 'Worker');
  const [done, setDone] = useState(!!s.humanDone);
  const [menu, setMenu] = useState(false);
  const modeRef = useRef();
  const hasKids = s.children && s.children.length > 0 || s.childCount > 0;
  const live = s.live;
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-st' + (s.needsInput ? ' pn-st--needsInput' : '') + (s.selected ? ' pn-st--selected' : '') + (s.archived ? ' pn-st--archived' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-st__main"
  }, /*#__PURE__*/React.createElement("button", {
    className: 'pn-st__arrow ' + (hasKids ? collapsed ? '' : 'pn-st__arrow--expanded' : 'pn-st__arrow--empty'),
    disabled: !hasKids,
    onClick: () => hasKids && onToggleCollapse && onToggleCollapse()
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })), hasKids && /*#__PURE__*/React.createElement("span", {
    className: "pn-st__arrowCount"
  }, s.childCount || (s.children ? s.children.length : 0)), s.archived ? /*#__PURE__*/React.createElement("span", {
    className: "pn-st__radio pn-st__radio--archived",
    title: "Archived"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: "archived",
    size: 13
  })) : /*#__PURE__*/React.createElement("button", {
    className: 'pn-st__radio' + (done ? ' pn-st__radio--on' : ''),
    title: "Mark done",
    onClick: () => setDone(v => !v)
  }, done && /*#__PURE__*/React.createElement(Icon, {
    name: "check",
    size: 10,
    sw: 2.2
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-st__title",
    onClick: () => setOpen(v => !v)
  }, s.agent && /*#__PURE__*/React.createElement(AgentTile, {
    kind: s.agent
  }), s.avatars && /*#__PURE__*/React.createElement(Avatars, {
    list: s.avatars
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-st__titleText"
  }, s.title)), done && !s.archived && /*#__PURE__*/React.createElement("span", {
    className: "pn-st__tag pn-st__tag--done"
  }, "done"), !s.archived && (live ? /*#__PURE__*/React.createElement("span", {
    className: "pn-st__live pn-dot-wrap"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dot pn-dot--run pn-dot--live",
    style: {
      position: 'absolute',
      inset: 0
    }
  })) : /*#__PURE__*/React.createElement("span", {
    className: "pn-st__stopped",
    title: "No live terminal"
  })), s.docs > 0 && /*#__PURE__*/React.createElement("span", {
    className: "pn-mini"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "doc",
    size: 12
  }), s.docs), s.worktree && /*#__PURE__*/React.createElement("span", {
    className: "pn-mini",
    title: 'worktree ' + s.worktree
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 12
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-st__statusglyph",
    title: s.needsInput ? 'Needs input' : SESS_LABEL[s.status]
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: s.needsInput ? 'needsInput' : s.status,
    size: 16
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-st__actions"
  }, hasKids && /*#__PURE__*/React.createElement("button", {
    className: "pn-st__btn",
    title: "Team view"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "teamview"
  })), !live && !s.archived && /*#__PURE__*/React.createElement("button", {
    className: "pn-st__resume",
    title: "Resume"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  }), " Resume"), !s.archived && /*#__PURE__*/React.createElement("button", {
    className: "pn-st__btn pn-st__btn--danger",
    title: "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  })), s.archived && /*#__PURE__*/React.createElement("button", {
    className: "pn-st__btn",
    title: "Restore"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-st__btn",
    title: "Copy reference"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-st__btn",
    title: "Details",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD"
  })))), s.tasklines && /*#__PURE__*/React.createElement("div", {
    className: "pn-st__tasklines"
  }, s.tasklines.map((tl, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    className: "pn-st__taskline"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: tl.status,
    size: 13
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-st__tasklineLabel"
  }, tl.title)))), open && /*#__PURE__*/React.createElement("div", {
    className: "pn-st__meta"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-st__metalabel"
  }, "Status"), /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metacontent"
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-badge pn-badge--status-' + (s.needsInput ? 'needsInput' : s.status)
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: s.needsInput ? 'needsInput' : s.status,
    size: 12
  }), " ", s.needsInput ? 'NEEDS INPUT' : SESS_LABEL[s.status].toUpperCase()), /*#__PURE__*/React.createElement("button", {
    ref: modeRef,
    className: "pn-badge pn-badge--btn",
    onClick: () => setMenu(v => !v)
  }, mode, " ", /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 9,
    className: "pn-badge__caret"
  })), s.model && /*#__PURE__*/React.createElement("span", {
    className: "pn-badge pn-badge--model"
  }, s.model.toUpperCase()), s.strategy && /*#__PURE__*/React.createElement("span", {
    className: "pn-badge"
  }, s.strategy), s.worktree && /*#__PURE__*/React.createElement("span", {
    className: "pn-badge"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "gitBranch",
    size: 11
  }), " ", s.worktree), /*#__PURE__*/React.createElement("span", {
    className: "pn-st__time pn-tt__time",
    style: {
      marginLeft: 'auto'
    }
  }, s.elapsed || 'live'))), s.taskchips && /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-st__metalabel"
  }, "Tasks"), /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metacontent"
  }, s.taskchips.map((tc, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "pn-st__taskchip"
  }, /*#__PURE__*/React.createElement(Glyph, {
    kind: tc.status,
    size: 12
  }), /*#__PURE__*/React.createElement("span", {
    className: "t"
  }, tc.title))))), s.docList && /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-st__metalabel"
  }, "Docs"), /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metacontent"
  }, s.docList.map((d, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: "pn-docpill"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill__ic"
  }, d.md ? 'M↓' : '{}'), /*#__PURE__*/React.createElement("span", {
    className: "pn-docpill__t"
  }, d.name))))), /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metasec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-st__metalabel"
  }, "Actions"), /*#__PURE__*/React.createElement("div", {
    className: "pn-st__metacontent"
  }, /*#__PURE__*/React.createElement("button", {
    className: "pn-st__actbtn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "info",
    size: 13
  }), " Details"), /*#__PURE__*/React.createElement("button", {
    className: "pn-st__actbtn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "copy",
    size: 13
  }), " Copy ref")))), menu && /*#__PURE__*/React.createElement(Menu, {
    anchorRef: modeRef,
    onClose: () => setMenu(false)
  }, MODES.map(m => /*#__PURE__*/React.createElement(Opt, {
    key: m,
    cur: m === mode,
    onClick: () => {
      setMode(m);
      setMenu(false);
    }
  }, m))));
}
function SessionNode({
  node,
  expandedId
}) {
  const [collapsed, setCollapsed] = useState(node.collapsed ?? false);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(SessionTile, {
    s: node,
    collapsed: collapsed,
    onToggleCollapse: () => setCollapsed(c => !c),
    defaultExpanded: node.id === expandedId
  }), node.children && !collapsed && /*#__PURE__*/React.createElement("div", {
    className: "pn-kids pn-kids--st"
  }, node.children.map(c => /*#__PURE__*/React.createElement(SessionNode, {
    key: c.id,
    node: c,
    expandedId: expandedId
  }))));
}
Object.assign(window, {
  Glyph,
  TaskTile,
  TaskNode,
  SessionTile,
  SessionNode,
  Avatar,
  Avatars
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/tiles.jsx", error: String((e && e.message) || e) }); }

// panel-redesign/views.jsx
try { (() => {
/* views.jsx — Team members list, Files tree, Skills list, Confirm dialogs.
   Relies on kit.jsx (Icon, AgentTile) + tiles.jsx (Avatar). */
const {
  useState: uS
} = React;

/* ============================ TEAM MEMBERS ============================ */
function MemberRow({
  m,
  archived
}) {
  const [open, setOpen] = uS(m.open || false);
  return /*#__PURE__*/React.createElement("div", {
    className: 'pn-mem' + (archived ? ' pn-mem--archived' : '')
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__main",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    className: 'pn-mem__av' + (m.isDefault ? ' pn-mem__av--ring' : '')
  }, m.avatar), /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__name"
  }, m.name), m.role && /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__role"
  }, m.role)), /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__badges"
  }, m.profile ? /*#__PURE__*/React.createElement("span", {
    className: "pn-mbadge pn-mbadge--profile"
  }, "\u25C8 ", m.profile) : /*#__PURE__*/React.createElement("span", {
    className: "pn-mbadge pn-mbadge--model"
  }, /*#__PURE__*/React.createElement("img", {
    src: '../assets/' + (m.agent === 'claude' ? 'claude-code-icon' : m.agent === 'codex' ? 'openai-codex-icon' : 'gemini-logo') + '.png',
    alt: ""
  }), " ", m.model), m.scope === 'global' && /*#__PURE__*/React.createElement("span", {
    className: "pn-mbadge pn-mbadge--global"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "globe",
    size: 11
  }), " GLOBAL"), m.isDefault && /*#__PURE__*/React.createElement("span", {
    className: "pn-mbadge pn-mbadge--default"
  }, "DEFAULT")), /*#__PURE__*/React.createElement("span", {
    className: 'pn-mem__chev' + (open ? ' pn-mem__chev--open' : '')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronD",
    size: 14
  }))), open && /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__exp"
  }, m.role && /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__blocklabel"
  }, "Role"), /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__blocktext"
  }, m.role)), m.identity && /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__blocklabel"
  }, "Instructions"), /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__blocktext pn-mem__blocktext--mono"
  }, m.identity)), m.skills && /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__block"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__blocklabel"
  }, "Skills"), /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__skills"
  }, m.skills.map(s => /*#__PURE__*/React.createElement("span", {
    key: s,
    className: "pn-skill__tag"
  }, s)))), /*#__PURE__*/React.createElement("div", {
    className: "pn-mem__actions"
  }, !archived && /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary",
    style: {
      height: 28
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "play",
    size: 12
  }), " Run"), /*#__PURE__*/React.createElement("span", {
    className: "pn-sp"
  }), archived ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn",
    style: {
      height: 28
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh",
    size: 12
  }), " Restore"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost",
    style: {
      height: 28,
      color: 'var(--pn-block)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 12
  }), " Delete")) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    className: "pn-btn",
    style: {
      height: 28
    }
  }, m.isDefault ? 'Configure' : 'Edit'), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost",
    style: {
      height: 28
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "archiveBox",
    size: 12
  }), " Archive")))));
}
const MEMBERS = [{
  name: 'Rhea',
  avatar: '🎻',
  role: 'Reparent strike lead',
  agent: 'claude',
  model: 'Opus 4.8',
  isDefault: true,
  identity: 'You lead the terminal-reparenting fix. Prefer the registry ref over DOM moves; always re-run fit.fit() after a reparent.',
  skills: ['debugging', 'code-review']
}, {
  name: 'Kit',
  avatar: '🎹',
  role: 'Pipeline & WebSocket',
  agent: 'codex',
  model: '5.3-codex',
  identity: 'You own the realtime pipeline. Keep session updates idempotent and deduped.',
  skills: ['write-tests']
}, {
  name: 'Ada',
  avatar: '🥁',
  role: 'Test runner',
  profile: 'fast-haiku',
  agent: 'claude',
  model: 'Haiku',
  scope: 'global',
  identity: 'You run and triage the test suite, reporting failures crisply.'
}];
function TeamMembersView() {
  const [tab, setTab] = uS('active');
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-vframe pn-vframe--tall"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vhd"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "users",
    size: 17,
    style: {
      color: 'var(--pn-ink-3)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-vhd__title"
  }, "Team"), /*#__PURE__*/React.createElement("span", {
    className: "pn-chip"
  }, MEMBERS.length), /*#__PURE__*/React.createElement("span", {
    className: "pn-vhd__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary",
    style: {
      height: 30
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 14
  }), " New member")), /*#__PURE__*/React.createElement("div", {
    className: "pn-vsearch"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: "Search members"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-vsec"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vtoggle"
  }, /*#__PURE__*/React.createElement("button", {
    className: tab === 'active' ? 'on' : '',
    onClick: () => setTab('active')
  }, "Active ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "3")), /*#__PURE__*/React.createElement("button", {
    className: tab === 'archived' ? 'on' : '',
    onClick: () => setTab('archived')
  }, "Archived ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "1")))), /*#__PURE__*/React.createElement("div", {
    className: "pn-vscroll"
  }, tab === 'active' ? MEMBERS.map((m, i) => /*#__PURE__*/React.createElement(MemberRow, {
    key: i,
    m: i === 0 ? {
      ...m,
      open: true
    } : m
  })) : /*#__PURE__*/React.createElement(MemberRow, {
    m: {
      name: 'Milo',
      avatar: '🎺',
      role: 'Docs writer (retired)',
      agent: 'gemini',
      model: 'Gemini 2.5'
    },
    archived: true
  })));
}

/* ============================ FILES ============================ */
function FRow({
  f
}) {
  const [open, setOpen] = uS(f.open ?? true);
  const pad = 10 + f.depth * 15;
  const isFolder = f.kind === 'folder';
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: 'pn-frow' + (f.active ? ' pn-frow--active' : ''),
    style: {
      paddingLeft: pad
    },
    onClick: () => isFolder && setOpen(v => !v)
  }, isFolder ? /*#__PURE__*/React.createElement("span", {
    className: 'pn-frow__tw' + (open ? ' pn-frow__tw--open' : '')
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronR"
  })) : /*#__PURE__*/React.createElement("span", {
    className: "pn-frow__tw"
  }), /*#__PURE__*/React.createElement("span", {
    className: 'pn-frow__ic pn-frow__ic--' + (isFolder ? 'folder' : 'file')
  }, isFolder ? /*#__PURE__*/React.createElement(Icon, {
    name: open ? 'folderOpen' : 'folder',
    size: 14
  }) : /*#__PURE__*/React.createElement(Icon, {
    name: f.code ? 'fileCode' : 'doc',
    size: 13
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-frow__name",
    style: f.git === 'd' ? {
      textDecoration: 'line-through',
      opacity: 0.6
    } : null
  }, f.name), f.git && /*#__PURE__*/React.createElement("span", {
    className: 'pn-frow__git pn-frow__git--' + f.git
  }, f.git === 'm' ? 'M' : f.git === 'a' ? 'A' : f.git === 'd' ? 'D' : '?')), isFolder && open && f.children && f.children.map((c, i) => /*#__PURE__*/React.createElement(FRow, {
    key: i,
    f: c
  })));
}
const TREE = [{
  name: 'src',
  kind: 'folder',
  depth: 0,
  open: true,
  children: [{
    name: 'components',
    kind: 'folder',
    depth: 1,
    open: true,
    children: [{
      name: 'SessionTerminal.tsx',
      kind: 'file',
      code: true,
      depth: 2,
      git: 'm',
      active: true
    }, {
      name: 'TeamView.tsx',
      kind: 'file',
      code: true,
      depth: 2,
      git: 'm'
    }, {
      name: 'MaestroPanel.tsx',
      kind: 'file',
      code: true,
      depth: 2
    }]
  }, {
    name: 'stores',
    kind: 'folder',
    depth: 1,
    open: false,
    children: []
  }, {
    name: 'terminal-theme.ts',
    kind: 'file',
    code: true,
    depth: 1,
    git: 'a'
  }, {
    name: 'main.tsx',
    kind: 'file',
    code: true,
    depth: 1
  }]
}, {
  name: 'docs',
  kind: 'folder',
  depth: 0,
  open: false,
  children: []
}, {
  name: 'old-theme.css',
  kind: 'file',
  depth: 0,
  git: 'd'
}, {
  name: 'package.json',
  kind: 'file',
  depth: 0
}, {
  name: 'README.md',
  kind: 'file',
  depth: 0,
  git: 'm'
}];
function FilesView() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-vframe pn-vframe--tall"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vhd"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "folder",
    size: 16,
    style: {
      color: 'var(--pn-ink-3)'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vhd__title"
  }, "Files"), /*#__PURE__*/React.createElement("div", {
    className: "pn-files__path"
  }, "~/code/agent-maestro")), /*#__PURE__*/React.createElement("span", {
    className: "pn-vhd__sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Refresh"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "refresh"
  })), /*#__PURE__*/React.createElement("button", {
    className: "pn-ib",
    title: "Close"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-vscroll",
    style: {
      paddingTop: 6
    }
  }, TREE.map((f, i) => /*#__PURE__*/React.createElement(FRow, {
    key: i,
    f: f
  }))), /*#__PURE__*/React.createElement("div", {
    className: "pn-files__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-files__footchip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-frow__git pn-frow__git--m"
  }, "M"), " 3"), /*#__PURE__*/React.createElement("span", {
    className: "pn-files__footchip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-frow__git pn-frow__git--a"
  }, "A"), " 1"), /*#__PURE__*/React.createElement("span", {
    className: "pn-files__footchip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-frow__git pn-frow__git--d"
  }, "D"), " 1"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto'
    }
  }, "main")));
}

/* ============================ SKILLS ============================ */
function SkillCard({
  s
}) {
  const [open, setOpen] = uS(s.open || false);
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-skill"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__hd",
    onClick: () => setOpen(v => !v)
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__namerow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__name"
  }, s.name), /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__badges"
  }, s.source && /*#__PURE__*/React.createElement("span", {
    className: "pn-sbadge pn-sbadge--src"
  }, s.source), s.version && /*#__PURE__*/React.createElement("span", {
    className: "pn-sbadge pn-sbadge--ver"
  }, "v", s.version))), /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__desc"
  }, s.desc))), open && /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__exp"
  }, s.triggers && /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__rowlabel"
  }, "triggers"), /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__rowval"
  }, s.triggers)), s.tags && /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__rowlabel"
  }, "tags"), /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__rowval"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__tags"
  }, s.tags.map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    className: "pn-skill__tag"
  }, t))))), s.path && /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__row"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__rowlabel"
  }, "path"), /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__rowval pn-skill__path"
  }, s.path))));
}
const PROJECT_SKILLS = [{
  name: 'code-review',
  source: '.claude',
  version: '1.2',
  desc: 'Reviews diffs for correctness, style, and missed edge cases before a PR.',
  triggers: 'review, pr, diff',
  tags: ['quality', 'git'],
  path: '.claude/skills/code-review/SKILL.md',
  open: true
}, {
  name: 'write-tests',
  source: '.claude',
  version: '0.9',
  desc: 'Generates and runs unit + integration tests for changed modules.',
  triggers: 'test, coverage',
  tags: ['testing']
}];
const GLOBAL_SKILLS = [{
  name: 'debugging',
  source: '.agents',
  version: '2.0',
  desc: 'Systematic root-cause analysis: reproduce, bisect, isolate, fix.',
  triggers: 'bug, crash, repro',
  tags: ['debug']
}, {
  name: 'find-skills',
  source: '.claude',
  desc: 'Discover relevant skills for your project from skills.sh.',
  tags: ['meta']
}];
function SkillsView() {
  const [tab, setTab] = uS('installed');
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-vframe pn-vframe--tall"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vhd"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles",
    size: 16,
    style: {
      color: 'var(--pn-ink-3)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "pn-vhd__title"
  }, "Skills"), /*#__PURE__*/React.createElement("span", {
    className: "pn-vhd__sp"
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-vtoggle"
  }, /*#__PURE__*/React.createElement("button", {
    className: tab === 'installed' ? 'on' : '',
    onClick: () => setTab('installed')
  }, "Installed ", /*#__PURE__*/React.createElement("span", {
    className: "n"
  }, "4")), /*#__PURE__*/React.createElement("button", {
    className: tab === 'market' ? 'on' : '',
    onClick: () => setTab('market')
  }, "Marketplace"))), /*#__PURE__*/React.createElement("div", {
    className: "pn-vsearch"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search"
  }), /*#__PURE__*/React.createElement("input", {
    placeholder: tab === 'installed' ? 'Filter skills' : 'Search skills.sh'
  })), tab === 'installed' ? /*#__PURE__*/React.createElement("div", {
    className: "pn-vscroll",
    style: {
      paddingTop: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vsec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "folder",
    size: 11,
    style: {
      verticalAlign: '-1px',
      marginRight: 5
    }
  }), "Project \xB7 ", PROJECT_SKILLS.length), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), PROJECT_SKILLS.map((s, i) => /*#__PURE__*/React.createElement(SkillCard, {
    key: i,
    s: s
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-vsec"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-eyebrow"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "globe",
    size: 11,
    style: {
      verticalAlign: '-1px',
      marginRight: 5
    }
  }), "Global \xB7 ", GLOBAL_SKILLS.length), /*#__PURE__*/React.createElement("span", {
    className: "pn-line"
  })), GLOBAL_SKILLS.map((s, i) => /*#__PURE__*/React.createElement(SkillCard, {
    key: i,
    s: s
  }))) : /*#__PURE__*/React.createElement("div", {
    className: "pn-vscroll",
    style: {
      padding: '14px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--pn-serif)',
      fontSize: 17,
      color: 'var(--pn-ink)',
      marginBottom: 4
    }
  }, "skills.sh"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--pn-ink-3)',
      marginBottom: 14
    }
  }, "The open agent-skills ecosystem. Works with Claude Code, Codex, Gemini & more."), [{
    n: 'nextjs',
    r: 'vercel/next.js-skill',
    d: 'Next.js development best practices',
    i: '2.1k'
  }, {
    n: 'typescript',
    r: 'anthropics/typescript-skill',
    d: 'TypeScript best practices',
    i: '5.4k'
  }, {
    n: 'react',
    r: 'facebook/react-skill',
    d: 'React development patterns',
    i: '4.0k'
  }].map(x => /*#__PURE__*/React.createElement("div", {
    key: x.n,
    className: "pn-skill"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__ic"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "sparkles"
  })), /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__namerow"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__name"
  }, x.n), /*#__PURE__*/React.createElement("span", {
    className: "pn-skill__badges"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-sbadge"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "download",
    size: 9,
    style: {
      verticalAlign: '-1px',
      marginRight: 2
    }
  }), x.i))), /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__desc"
  }, x.d), /*#__PURE__*/React.createElement("div", {
    className: "pn-skill__path",
    style: {
      marginTop: 4
    }
  }, x.r)), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn",
    style: {
      height: 26,
      alignSelf: 'center'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "plus",
    size: 12
  }), " Add"))))));
}

/* ============================ CONFIRM DIALOGS ============================ */
function CloseSessionDialog({
  name,
  childCount,
  liveCount,
  working
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-scrim"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dlg__icon pn-dlg__icon--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "x",
    size: 18,
    sw: 2
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-dlg__title"
  }, "Close session")), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__msg"
  }, "Close ", /*#__PURE__*/React.createElement("strong", null, name), childCount ? /*#__PURE__*/React.createElement(React.Fragment, null, " and its ", childCount, " sub-session", childCount === 1 ? '' : 's') : '', "?"), (liveCount || working) && /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__warn pn-dlg__warn--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert",
    size: 14
  }), working ? /*#__PURE__*/React.createElement("span", null, "This session has an agent currently working. Closing will stop it.") : /*#__PURE__*/React.createElement("span", null, liveCount, " live terminal", liveCount === 1 ? '' : 's', " will be stopped. The record", childCount ? 's stay' : ' stays', " in Archived."))), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn",
    style: {
      background: 'var(--pn-block)',
      color: '#fff',
      borderColor: 'var(--pn-block)'
    }
  }, "Close session"))));
}
function DiscardDialog() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-scrim"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dlg__icon pn-dlg__icon--warn"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "alert",
    size: 18
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-dlg__title"
  }, "Unsaved changes")), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__msg"
  }, "You have unsaved task details. Are you sure you want to discard them?")), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, "Keep editing"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--primary"
  }, "Discard"))));
}
function DeleteTaskDialog() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-scrim"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__hd"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-dlg__icon pn-dlg__icon--danger"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "trash",
    size: 17
  })), /*#__PURE__*/React.createElement("span", {
    className: "pn-dlg__title"
  }, "Delete task")), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__body"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__msg"
  }, "Are you sure you want to delete ", /*#__PURE__*/React.createElement("strong", null, "\"Fix terminal reparenting crash\""), "? This task has ", /*#__PURE__*/React.createElement("strong", null, "3 subtasks"), " that will also be deleted.")), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg__foot"
  }, /*#__PURE__*/React.createElement("span", {
    className: "pn-sp"
  }), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn pn-btn--ghost"
  }, "Cancel"), /*#__PURE__*/React.createElement("button", {
    className: "pn-btn",
    style: {
      background: 'var(--pn-block)',
      color: '#fff',
      borderColor: 'var(--pn-block)'
    }
  }, "Delete"))));
}
function Views() {
  return /*#__PURE__*/React.createElement("div", {
    className: "pn-vstage"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap"
  }, "Team members"), /*#__PURE__*/React.createElement(TeamMembersView, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap"
  }, "Files"), /*#__PURE__*/React.createElement(FilesView, null)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap"
  }, "Skills"), /*#__PURE__*/React.createElement(SkillsView, null)), /*#__PURE__*/React.createElement("div", {
    className: "pn-dlg-stage"
  }, /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap"
  }, "Close session \u2014 with sub-sessions"), /*#__PURE__*/React.createElement(CloseSessionDialog, {
    name: "Rhea",
    childCount: 3,
    liveCount: 2
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap",
    style: {
      marginTop: 8
    }
  }, "Close session \u2014 agent working"), /*#__PURE__*/React.createElement(CloseSessionDialog, {
    name: "fluffy-starlight",
    working: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap",
    style: {
      marginTop: 8
    }
  }, "Delete task"), /*#__PURE__*/React.createElement(DeleteTaskDialog, null), /*#__PURE__*/React.createElement("div", {
    className: "pn-vcap",
    style: {
      marginTop: 8
    }
  }, "Discard changes"), /*#__PURE__*/React.createElement(DiscardDialog, null)));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(Views, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "panel-redesign/views.jsx", error: String((e && e.message) || e) }); }

__ds_ns.MAESTRO_TERMINAL_THEME = __ds_scope.MAESTRO_TERMINAL_THEME;

__ds_ns.MAESTRO_TERMINAL_THEME_DARK = __ds_scope.MAESTRO_TERMINAL_THEME_DARK;

})();
