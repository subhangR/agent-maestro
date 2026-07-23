const pptxgen = require('pptxgenjs');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Maestro';
pptx.company = 'Maestro';
pptx.subject = 'Maestro product and community strategy';
pptx.title = 'Maestro Strategy — The open control plane for agentic product work';
pptx.lang = 'en-US';
pptx.theme = {
  headFontFace: 'Liberation Serif',
  bodyFontFace: 'Liberation Sans',
  lang: 'en-US',
};
pptx.defineLayout({ name: 'MAESTRO_WIDE', width: 13.333, height: 7.5 });
pptx.layout = 'MAESTRO_WIDE';

const W = 13.333;
const H = 7.5;
const C = {
  PAPER: 'F4F2EC',
  SURFACE: 'FBFAF6',
  CARD: 'FFFFFF',
  HOVER: 'F2EFE8',
  ACTIVE: 'ECE8DF',
  LINE: 'E7E3D9',
  LINE2: 'D8D3C6',
  INK: '23201B',
  INK2: '5B564C',
  INK3: '8E897B',
  INK4: 'B7B2A4',
  BRAND: 'B26A2B',
  BRAND2: '9A581F',
  BRAND_SOFT: 'F0E3D8',
  RUN: '3E8E5A',
  RUN_SOFT: 'E6F0E9',
  WAIT: 'BD8A2A',
  WAIT_SOFT: 'F4EBD8',
  BLOCK: 'BB4D3D',
  BLOCK_SOFT: 'F5E4E1',
  INFO: '3F6C90',
  INFO_SOFT: 'E3EBF0',
  DARK: '1B1810',
  DARK2: '272219',
  TERM: '100E0A',
  CYAN: '58C4D8',
};
const FONT = {
  UI: 'Liberation Sans',
  SERIF: 'Liberation Serif',
  MONO: 'Liberation Mono',
};

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = __dirname;
const ASSET = {
  icon: path.join(ROOT, 'maestro-ui/src-tauri/icons/icon.png'),
  desktop: path.join(ROOT, '.maestro/redesign/screenshots/full-layout-dark.png'),
  taskModal: path.join(ROOT, '.maestro/redesign/screenshots/CreateTaskModal-dark.png'),
  memberModal: path.join(ROOT, '.maestro/redesign/screenshots/teammembermodal-A-light.png'),
  mobileTasks: path.join(ROOT, 'Maestro Design System - mobile/scraps/mob-tasks.png'),
  mobileTerminal: path.join(ROOT, 'Maestro Design System - mobile/scraps/mob-term3.png'),
  claude: path.join(ROOT, 'maestro-ui/public/agent-icons/claude-code-icon.png'),
  codex: path.join(ROOT, 'maestro-ui/public/agent-icons/openai-codex-icon.png'),
  gemini: path.join(ROOT, 'maestro-ui/public/agent-icons/gemini-logo.png'),
  hermesSvg: path.join(ROOT, 'maestro-ui/public/agent-icons/hermes-agent-icon.svg'),
  hermesPng: path.join(OUT, '.generated-hermes.png'),
};

const metadata = new Map();

async function prepareAssets() {
  if (fs.existsSync(ASSET.hermesSvg)) {
    await sharp(ASSET.hermesSvg).resize(256, 256, { fit: 'contain' }).png().toFile(ASSET.hermesPng);
  }
  for (const p of Object.values(ASSET)) {
    if (!fs.existsSync(p)) continue;
    try {
      const m = await sharp(p).metadata();
      if (m.width && m.height) metadata.set(p, { width: m.width, height: m.height });
    } catch (_) {
      // SVGs are converted above; unsupported assets are simply skipped.
    }
  }
}

function imageFit(p, x, y, w, h, mode = 'contain') {
  const m = metadata.get(p);
  if (!m) return { path: p, x, y, w, h };
  const src = m.width / m.height;
  const box = w / h;
  if (mode === 'cover') {
    if (src > box) {
      const cropW = m.height * box;
      return { path: p, x, y, w, h, sizing: 'crop', crop: { x: (m.width - cropW) / 2, y: 0, w: cropW, h: m.height } };
    }
    const cropH = m.width / box;
    return { path: p, x, y, w, h, sizing: 'crop', crop: { x: 0, y: (m.height - cropH) / 2, w: m.width, h: cropH } };
  }
  let iw = w;
  let ih = h;
  if (src > box) ih = w / src;
  else iw = h * src;
  return { path: p, x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih };
}

function addImage(slide, p, x, y, w, h, mode = 'contain') {
  const cfg = imageFit(p, x, y, w, h, mode);
  if (cfg.sizing === 'crop') {
    slide.addImage({ path: p, x, y, w, h, sizing: { type: 'cover', w, h } });
  } else {
    slide.addImage({ path: p, x: cfg.x, y: cfg.y, w: cfg.w, h: cfg.h });
  }
}

function fillSlide(slide, color = C.PAPER) {
  slide.background = { color };
}

function addFooter(slide, n, dark = false) {
  const color = dark ? '8E897B' : C.INK3;
  slide.addShape(pptx.ShapeType.line, { x: 0.68, y: 7.12, w: 11.97, h: 0, line: { color: dark ? '3A352B' : C.LINE, width: 0.8 } });
  slide.addText('MAESTRO · STRATEGY', { x: 0.72, y: 7.18, w: 2.3, h: 0.14, fontFace: FONT.MONO, fontSize: 7.5, bold: true, charSpacing: 1.5, color, margin: 0 });
  slide.addText(String(n).padStart(2, '0'), { x: 11.84, y: 7.16, w: 0.76, h: 0.16, fontFace: FONT.UI, fontSize: 8, bold: true, color, align: 'right', margin: 0 });
}

function addHeader(slide, section, title, n, opts = {}) {
  const dark = !!opts.dark;
  fillSlide(slide, dark ? C.DARK : C.PAPER);
  const ink = dark ? C.PAPER : C.INK;
  const muted = dark ? 'A9A294' : C.INK3;
  slide.addText(section.toUpperCase(), { x: 0.72, y: 0.37, w: 4.2, h: 0.2, fontFace: FONT.MONO, fontSize: 8.5, bold: true, charSpacing: 1.5, color: opts.accent || C.BRAND, margin: 0 });
  slide.addText(title, { x: 0.72, y: 0.69, w: 11.9, h: opts.titleH || 0.56, fontFace: FONT.SERIF, fontSize: opts.titleSize || 28, bold: true, color: ink, margin: 0, breakLine: false, valign: 'mid' });
  if (opts.subtitle) {
    slide.addText(opts.subtitle, { x: 0.74, y: opts.subtitleY || 1.30, w: 11.7, h: opts.subtitleH || 0.38, fontFace: FONT.UI, fontSize: opts.subtitleSize || 12.5, color: muted, margin: 0, breakLine: false });
  }
  addFooter(slide, n, dark);
}

function addCard(slide, x, y, w, h, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, {
    x, y, w, h,
    rectRadius: 0.08,
    fill: { color: opts.fill || C.CARD, transparency: opts.transparency || 0 },
    line: { color: opts.line || C.LINE, width: opts.lineWidth || 1 },
    shadow: opts.shadow === false ? undefined : { type: 'outer', color: '5A4E3C', blur: 1, angle: 45, distance: 1, opacity: 0.08 },
  });
}

function addPill(slide, text, x, y, w, opts = {}) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w, h: opts.h || 0.32, rectRadius: 0.12, fill: { color: opts.fill || C.ACTIVE }, line: { color: opts.line || C.LINE2, width: 0.7 } });
  slide.addText(text, { x: x + 0.08, y: y + 0.045, w: w - 0.16, h: (opts.h || 0.32) - 0.07, fontFace: opts.mono ? FONT.MONO : FONT.UI, fontSize: opts.size || 8.5, bold: opts.bold !== false, color: opts.color || C.INK2, align: 'center', valign: 'mid', margin: 0, charSpacing: opts.charSpacing || 0 });
}

function addEyebrow(slide, text, x, y, w, color = C.INK3) {
  slide.addText(text.toUpperCase(), { x, y, w, h: 0.2, fontFace: FONT.MONO, fontSize: 8, bold: true, charSpacing: 1.4, color, margin: 0 });
}

function addBullets(slide, items, x, y, w, opts = {}) {
  const gap = opts.gap || 0.5;
  const fontSize = opts.fontSize || 12.2;
  const color = opts.color || C.INK2;
  const dotColor = opts.dotColor || C.BRAND;
  items.forEach((item, i) => {
    const yy = y + i * gap;
    slide.addShape(pptx.ShapeType.ellipse, { x, y: yy + 0.075, w: 0.08, h: 0.08, fill: { color: dotColor }, line: { color: dotColor, transparency: 100 } });
    slide.addText(item, { x: x + 0.18, y: yy, w: w - 0.18, h: gap - 0.04, fontFace: FONT.UI, fontSize, color, margin: 0, breakLine: false, valign: 'top' });
  });
}

function addStep(slide, n, title, body, x, y, w, opts = {}) {
  slide.addShape(pptx.ShapeType.ellipse, { x, y, w: 0.38, h: 0.38, fill: { color: opts.fill || C.INK }, line: { color: opts.fill || C.INK, transparency: 100 } });
  slide.addText(String(n), { x, y: y + 0.03, w: 0.38, h: 0.25, fontFace: FONT.MONO, fontSize: 9.5, bold: true, color: opts.numColor || C.PAPER, align: 'center', margin: 0 });
  slide.addText(title, { x: x + 0.5, y: y - 0.005, w: w - 0.5, h: 0.22, fontFace: FONT.UI, fontSize: opts.titleSize || 12, bold: true, color: opts.color || C.INK, margin: 0 });
  slide.addText(body, { x: x + 0.5, y: y + 0.24, w: w - 0.5, h: opts.bodyH || 0.36, fontFace: FONT.UI, fontSize: opts.bodySize || 9.4, color: opts.muted || C.INK3, margin: 0, breakLine: false });
}

function addStatusTag(slide, text, x, y, type = 'built') {
  const map = {
    built: [C.RUN_SOFT, C.RUN, 'D4E7D9'],
    next: [C.WAIT_SOFT, '8B651F', 'E8DAB9'],
    later: [C.INFO_SOFT, C.INFO, 'CBDDE8'],
    truth: [C.BRAND_SOFT, C.BRAND2, 'DDC5AF'],
  };
  const [fill, color, line] = map[type];
  addPill(slide, text.toUpperCase(), x, y, text.length * 0.075 + 0.34, { fill, color, line, mono: true, size: 7.4, h: 0.26, charSpacing: 0.8 });
}

function addProvider(slide, name, img, x, y, w = 1.45, opts = {}) {
  addCard(slide, x, y, w, 0.62, { fill: opts.fill || C.CARD, line: opts.line || C.LINE2, shadow: false });
  if (img && fs.existsSync(img)) addImage(slide, img, x + 0.12, y + 0.11, 0.34, 0.34, 'contain');
  slide.addText(name, { x: x + 0.52, y: y + 0.17, w: w - 0.62, h: 0.22, fontFace: FONT.UI, fontSize: 10, bold: true, color: opts.color || C.INK, margin: 0, valign: 'mid' });
}

function addNotes(slide, text) {
  if (typeof slide.addNotes === 'function') slide.addNotes(text);
}

// 01 — Cover
{
  const s = pptx.addSlide();
  fillSlide(s, C.DARK);
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 6.75, h: H, fill: { color: C.DARK }, line: { color: C.DARK, transparency: 100 } });
  s.addShape(pptx.ShapeType.rect, { x: 6.75, y: 0, w: 6.583, h: H, fill: { color: C.TERM }, line: { color: C.TERM, transparency: 100 } });
  s.addImage({ path: ASSET.icon, x: 0.74, y: 0.55, w: 0.48, h: 0.48 });
  s.addText('MAESTRO', { x: 1.36, y: 0.66, w: 2.2, h: 0.24, fontFace: FONT.MONO, fontSize: 10.5, bold: true, charSpacing: 2.2, color: C.PAPER, margin: 0 });
  addStatusTag(s, 'Strategy · July 2026', 0.75, 1.48, 'truth');
  s.addText('The open control plane\nfor agentic product work', { x: 0.75, y: 1.96, w: 5.45, h: 1.62, fontFace: FONT.SERIF, fontSize: 34, bold: true, color: C.PAPER, margin: 0, breakLine: false, valign: 'mid' });
  s.addText('Turn ideas into owned, observable, verified outcomes across Claude, Codex, Hermes—and whatever comes next.', { x: 0.78, y: 3.92, w: 5.25, h: 0.86, fontFace: FONT.UI, fontSize: 15.5, color: 'C7C0B2', margin: 0, breakLine: false });
  s.addShape(pptx.ShapeType.line, { x: 0.76, y: 5.46, w: 4.95, h: 0, line: { color: '51493B', width: 1 } });
  s.addText('SYSTEMS TO BUILD SYSTEMS', { x: 0.78, y: 5.71, w: 4.2, h: 0.3, fontFace: FONT.MONO, fontSize: 9.5, bold: true, charSpacing: 2, color: C.BRAND, margin: 0 });
  // Product frame
  s.addShape(pptx.ShapeType.roundRect, { x: 7.2, y: 0.94, w: 5.45, h: 5.46, rectRadius: 0.08, fill: { color: '0D0C09' }, line: { color: '3F382C', width: 1.1 }, shadow: { type: 'outer', color: '000000', blur: 3, angle: 45, distance: 2, opacity: 0.30 } });
  s.addShape(pptx.ShapeType.rect, { x: 7.24, y: 0.98, w: 5.37, h: 0.27, fill: { color: '29241C' }, line: { color: '29241C', transparency: 100 } });
  ['BB4D3D', 'BD8A2A', '3E8E5A'].forEach((c, i) => s.addShape(pptx.ShapeType.ellipse, { x: 7.42 + i * 0.19, y: 1.065, w: 0.07, h: 0.07, fill: { color: c }, line: { color: c, transparency: 100 } }));
  addImage(s, ASSET.desktop, 7.28, 1.27, 5.28, 5.04, 'cover');
  s.addShape(pptx.ShapeType.rect, { x: 7.28, y: 1.27, w: 5.28, h: 5.04, fill: { color: C.TERM, transparency: 68 }, line: { color: C.TERM, transparency: 100 } });
  s.addText('> ··· +', { x: 8.13, y: 2.70, w: 3.6, h: 0.72, fontFace: FONT.MONO, fontSize: 34, bold: true, color: '8CC8FF', align: 'center', margin: 0 });
  s.addText('CAPTURE  →  ASSIGN  →  VERIFY', { x: 7.75, y: 3.58, w: 4.38, h: 0.32, fontFace: FONT.MONO, fontSize: 9, bold: true, charSpacing: 1.1, color: C.PAPER, align: 'center', margin: 0 });
  s.addText('Maestro strategy deck', { x: 10.56, y: 7.11, w: 2.0, h: 0.18, fontFace: FONT.MONO, fontSize: 7.5, color: C.INK3, align: 'right', margin: 0 });
  addNotes(s, 'Open with the category thesis. Maestro is not another coding agent; it is the neutral work system around them.');
}

// 02 — Founder truth
{
  const s = pptx.addSlide();
  addHeader(s, '01 · Why this exists', 'The models got agents. Work did not get a system.', 2, { subtitle: 'The strongest wedge is lived pain—not an invented market problem.' });
  const cards = [
    ['01', 'You felt the pain', 'Multiple agents improved output—but multiplied context switching, duplicated work, and review debt.'],
    ['02', 'You built a working answer', 'Maestro changed how ideas become tasks, how agents are assigned, and how progress stays visible.'],
    ['03', 'The product is the proof', 'Maestro is being built through Maestro: task trees, specialist roles, artifacts, peer review, and iteration.'],
    ['04', 'The story is authentic', '“My process stopped scaling. I built an operating system around it. Now I am opening it to other power users.”'],
  ];
  cards.forEach((c, i) => {
    const x = 0.75 + (i % 2) * 3.36;
    const y = 1.85 + Math.floor(i / 2) * 1.78;
    addCard(s, x, y, 3.08, 1.48, { fill: i === 3 ? C.BRAND_SOFT : C.CARD, line: i === 3 ? 'DABFA7' : C.LINE });
    s.addText(c[0], { x: x + 0.20, y: y + 0.17, w: 0.42, h: 0.28, fontFace: FONT.MONO, fontSize: 10, bold: true, color: C.BRAND, margin: 0 });
    s.addText(c[1], { x: x + 0.68, y: y + 0.14, w: 2.18, h: 0.34, fontFace: FONT.UI, fontSize: 12.5, bold: true, color: C.INK, margin: 0 });
    s.addText(c[2], { x: x + 0.20, y: y + 0.59, w: 2.65, h: 0.67, fontFace: FONT.UI, fontSize: 9.6, color: C.INK2, margin: 0, breakLine: false });
  });
  addCard(s, 7.72, 1.86, 4.83, 3.26, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'Founder transformation', 8.10, 2.18, 3.4, C.BRAND);
  s.addText('Agent chaos was costing me\ntime, attention, and trust.', { x: 8.08, y: 2.60, w: 3.85, h: 0.84, fontFace: FONT.SERIF, fontSize: 22, bold: true, color: C.PAPER, margin: 0 });
  s.addText('I built a shared workflow for defining, assigning, observing, and verifying work—and now I can move multiple products forward without losing ownership or context.', { x: 8.10, y: 3.66, w: 3.85, h: 1.05, fontFace: FONT.UI, fontSize: 12.2, color: 'C7C0B2', margin: 0, breakLine: false });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.75, y: 5.48, w: 11.80, h: 0.82, rectRadius: 0.06, fill: { color: C.INK }, line: { color: C.INK, transparency: 100 } });
  s.addText('STRATEGIC THESIS', { x: 1.02, y: 5.76, w: 1.75, h: 0.20, fontFace: FONT.MONO, fontSize: 8.4, bold: true, charSpacing: 1.3, color: C.BRAND, margin: 0 });
  s.addText('Do not sell “more agents.” Sell control, continuity, and verified progress.', { x: 2.88, y: 5.68, w: 8.92, h: 0.30, fontFace: FONT.UI, fontSize: 15, bold: true, color: C.PAPER, margin: 0 });
  addNotes(s, 'This is the founder-market-fit slide. Keep the narrative in first person when presenting.');
}

// 03 — Problem stack
{
  const s = pptx.addSlide();
  addHeader(s, '02 · Problem', 'The visible problem is session chaos. The valuable problem is deeper.', 3, { subtitle: 'Sell the surface pain. Solve the operating-system gap underneath it.' });
  addEyebrow(s, 'Surface problem', 0.78, 1.82, 2.2, C.BLOCK);
  addCard(s, 0.75, 2.10, 4.12, 2.82, { fill: C.CARD });
  const sessions = [
    ['Claude', 'working · auth refactor', C.BLOCK_SOFT, C.BLOCK],
    ['Codex', 'waiting · tests?', C.INFO_SOFT, C.INFO],
    ['Hermes', 'done · where is output?', C.WAIT_SOFT, '8B651F'],
    ['Claude', 'working · same files', C.RUN_SOFT, C.RUN],
  ];
  sessions.forEach((r, i) => {
    const y = 2.40 + i * 0.56;
    s.addShape(pptx.ShapeType.roundRect, { x: 1.05 + (i % 2) * 0.18, y, w: 3.45, h: 0.42, rectRadius: 0.05, fill: { color: r[2] }, line: { color: r[3], transparency: 58, width: 0.8 } });
    s.addShape(pptx.ShapeType.ellipse, { x: 1.23 + (i % 2) * 0.18, y: y + 0.16, w: 0.07, h: 0.07, fill: { color: r[3] }, line: { color: r[3], transparency: 100 } });
    s.addText(r[0], { x: 1.40 + (i % 2) * 0.18, y: y + 0.09, w: 0.72, h: 0.18, fontFace: FONT.UI, fontSize: 8.7, bold: true, color: C.INK, margin: 0 });
    s.addText(r[1], { x: 2.14 + (i % 2) * 0.18, y: y + 0.09, w: 2.05, h: 0.18, fontFace: FONT.MONO, fontSize: 7.4, color: C.INK2, margin: 0 });
  });
  s.addText('“I have too many agents and cannot keep track.”', { x: 1.05, y: 4.56, w: 3.42, h: 0.28, fontFace: FONT.SERIF, fontSize: 13.5, italic: true, color: C.INK2, margin: 0, align: 'center' });
  // Arrow
  s.addShape(pptx.ShapeType.chevron, { x: 5.12, y: 3.00, w: 0.72, h: 0.92, fill: { color: C.BRAND_SOFT }, line: { color: C.BRAND, transparency: 60 } });
  addEyebrow(s, 'Root problem', 6.15, 1.82, 2.2, C.BRAND);
  addCard(s, 6.12, 2.10, 6.43, 2.82, { fill: C.DARK, line: '443D31' });
  s.addText('No reliable system turns intent into\nowned, verifiable, reusable work.', { x: 6.52, y: 2.55, w: 5.55, h: 0.92, fontFace: FONT.SERIF, fontSize: 23, bold: true, color: C.PAPER, margin: 0, valign: 'mid' });
  addBullets(s, [
    'Ownership and dependencies stay implicit.',
    '“Agent finished” is confused with “work is correct.”',
    'Good prompts, feedback, and decisions disappear with the session.',
  ], 6.58, 3.68, 5.25, { gap: 0.37, fontSize: 10.2, color: 'C7C0B2', dotColor: C.BRAND });
  const outcomes = [
    ['TIME', 'Less context switching and rework'],
    ['MONEY', 'Fewer duplicated runs and wasted tokens'],
    ['CONTROL', 'Clear ownership, evidence, and continuity'],
  ];
  outcomes.forEach((o, i) => {
    const x = 0.75 + i * 3.95;
    addCard(s, x, 5.34, 3.68, 0.86, { fill: i === 2 ? C.BRAND_SOFT : C.SURFACE, shadow: false });
    s.addText(o[0], { x: x + 0.20, y: 5.55, w: 0.78, h: 0.18, fontFace: FONT.MONO, fontSize: 8, bold: true, color: i === 2 ? C.BRAND2 : C.INK3, charSpacing: 1, margin: 0 });
    s.addText(o[1], { x: x + 1.03, y: 5.49, w: 2.40, h: 0.30, fontFace: FONT.UI, fontSize: 10.4, bold: true, color: C.INK, margin: 0, valign: 'mid' });
  });
}

// 04 — Audience
{
  const s = pptx.addSlide();
  addHeader(s, '03 · Audience', 'Start with the people who already feel the coordination pain.', 4, { subtitle: 'The first 100–1,000 users are not “everyone who uses AI.”' });
  const cols = [
    {
      x: 0.75, w: 5.75, tag: ['PRIMARY BEACHHEAD', 'built'], title: 'Frontier-tool power users',
      body: 'Daily users of Claude Code, Codex, and Hermes who already run several sessions, projects, and worktrees.',
      bullets: ['Terminal + Git native', 'Model-switching by instinct', 'Active on X, GitHub, Discord, Reddit', 'Pain is immediate—not educational'],
      fill: C.DARK, titleColor: C.PAPER, bodyColor: 'C7C0B2'
    },
    {
      x: 6.75, w: 2.72, tag: ['SECOND', 'next'], title: 'Solo product builders',
      body: 'Indie hackers and tiny AI-native teams seeking leverage without coordination overhead.',
      bullets: ['Many hats', 'Outcome driven', 'Need repeatability'],
      fill: C.CARD, titleColor: C.INK, bodyColor: C.INK2
    },
    {
      x: 9.72, w: 2.83, tag: ['EXPAND', 'later'], title: 'Free/local entrants',
      body: 'Creators entering through Ollama and local models via mobile and short-form content.',
      bullets: ['Cost sensitive', 'Needs guided setup', 'Broader audience'],
      fill: C.CARD, titleColor: C.INK, bodyColor: C.INK2
    },
  ];
  cols.forEach((c, idx) => {
    addCard(s, c.x, 1.86, c.w, 3.93, { fill: c.fill, line: idx === 0 ? '403A30' : C.LINE });
    addStatusTag(s, c.tag[0], c.x + 0.24, 2.08, c.tag[1]);
    s.addText(c.title, { x: c.x + 0.26, y: 2.55, w: c.w - 0.52, h: idx === 0 ? 0.45 : 0.68, fontFace: FONT.SERIF, fontSize: idx === 0 ? 22 : 16.5, bold: true, color: c.titleColor, margin: 0 });
    s.addText(c.body, { x: c.x + 0.26, y: idx === 0 ? 3.13 : 3.34, w: c.w - 0.52, h: idx === 0 ? 0.72 : 0.92, fontFace: FONT.UI, fontSize: idx === 0 ? 11.2 : 9.7, color: c.bodyColor, margin: 0, breakLine: false });
    addBullets(s, c.bullets, c.x + 0.28, idx === 0 ? 4.12 : 4.48, c.w - 0.55, { gap: idx === 0 ? 0.37 : 0.35, fontSize: idx === 0 ? 9.8 : 8.7, color: c.bodyColor, dotColor: idx === 0 ? C.BRAND : C.INK3 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.75, y: 6.08, w: 11.80, h: 0.56, rectRadius: 0.05, fill: { color: C.BRAND_SOFT }, line: { color: 'DDC5AF', width: 0.8 } });
  s.addText('NOT NOW', { x: 1.00, y: 6.28, w: 0.83, h: 0.16, fontFace: FONT.MONO, fontSize: 7.6, bold: true, charSpacing: 1, color: C.BRAND2, margin: 0 });
  s.addText('Casual chatbot users · enterprise procurement-led buyers · teams seeking only a Jira replacement', { x: 1.97, y: 6.23, w: 9.95, h: 0.24, fontFace: FONT.UI, fontSize: 10.7, color: C.INK2, margin: 0 });
}

// 05 — Positioning
{
  const s = pptx.addSlide();
  addHeader(s, '04 · Positioning', 'Own the workflow layer—not the model layer.', 5, { subtitle: 'Freedom of tools. Discipline of process.' });
  addCard(s, 0.75, 1.82, 7.56, 4.55, { fill: C.DARK, line: '413A2E' });
  addEyebrow(s, 'Category', 1.13, 2.17, 2.1, C.BRAND);
  s.addText('Agentic Product\nManagement', { x: 1.10, y: 2.58, w: 4.55, h: 1.15, fontFace: FONT.SERIF, fontSize: 31, bold: true, color: C.PAPER, margin: 0 });
  s.addText('The system that coordinates intent, humans, agents, tools, code, evidence, and organizational memory in one delivery loop.', { x: 1.13, y: 3.96, w: 5.55, h: 0.92, fontFace: FONT.UI, fontSize: 13.1, color: 'C7C0B2', margin: 0, breakLine: false });
  addProvider(s, 'Claude', ASSET.claude, 1.14, 5.40, 1.38, { fill: C.DARK2, line: '4A4235', color: C.PAPER });
  addProvider(s, 'Codex', ASSET.codex, 2.66, 5.40, 1.38, { fill: C.DARK2, line: '4A4235', color: C.PAPER });
  addProvider(s, 'Hermes', ASSET.hermesPng, 4.18, 5.40, 1.50, { fill: C.DARK2, line: '4A4235', color: C.PAPER });
  addPill(s, 'ANY NEXT RUNTIME', 5.84, 5.54, 1.95, { fill: '332D23', line: '51483A', color: C.BRAND, mono: true, size: 7.4, h: 0.30 });
  addCard(s, 8.62, 1.82, 3.93, 2.16, { fill: C.CARD });
  addEyebrow(s, 'One-line position', 8.92, 2.14, 2.3, C.BRAND);
  s.addText('Maestro is the open control plane for agentic product work.', { x: 8.92, y: 2.57, w: 3.26, h: 0.93, fontFace: FONT.SERIF, fontSize: 20, bold: true, color: C.INK, margin: 0 });
  addCard(s, 8.62, 4.22, 3.93, 2.15, { fill: C.SURFACE, shadow: false });
  addEyebrow(s, 'Not', 8.92, 4.52, 1.0, C.BLOCK);
  addBullets(s, ['another model', 'a multi-terminal wrapper', 'a generic autonomy framework', 'a replacement for GitHub review'], 8.92, 4.90, 3.25, { gap: 0.34, fontSize: 9.6, color: C.INK2, dotColor: C.BLOCK });
}

// 06 — Core loop
{
  const s = pptx.addSlide();
  addHeader(s, '05 · Product loop', 'The product is the closed loop—not the number of agents.', 6, { subtitle: 'Software is built progressively. Maestro makes the progression explicit.' });
  const steps = [
    ['1', 'CAPTURE', 'Idea becomes durable'],
    ['2', 'DEFINE', 'Outcome + scope + proof'],
    ['3', 'ASSIGN', 'Owner + runtime + isolation'],
    ['4', 'EXECUTE', 'Local, remote, or parallel'],
    ['5', 'OBSERVE', 'Progress, blockers, artifacts'],
    ['6', 'VERIFY', 'Evidence against acceptance'],
    ['7', 'LEARN', 'Memory, template, skill'],
    ['8', 'SHARE', 'Collab with provenance'],
  ];
  const pos = [
    [0.78, 2.04], [3.04, 2.04], [5.30, 2.04], [7.56, 2.04],
    [7.56, 4.55], [5.30, 4.55], [3.04, 4.55], [0.78, 4.55],
  ];
  // connectors first
  for (let i = 0; i < pos.length; i++) {
    const a = pos[i];
    const b = pos[(i + 1) % pos.length];
    const ax = a[0] + 1.72;
    const ay = a[1] + 0.83;
    const bx = b[0] + 0.18;
    const by = b[1] + 0.83;
    if (i === 3) {
      s.addShape(pptx.ShapeType.line, { x: a[0] + 0.93, y: a[1] + 1.65, w: 0, h: 0.86, line: { color: C.BRAND, width: 1.5, beginArrowType: 'none', endArrowType: 'triangle' } });
    } else if (i === 7) {
      s.addShape(pptx.ShapeType.line, { x: a[0] + 0.93, y: a[1], w: 0, h: -0.86, line: { color: C.BRAND, width: 1.5, beginArrowType: 'none', endArrowType: 'triangle' } });
    } else {
      s.addShape(pptx.ShapeType.line, { x: ax, y: ay, w: bx - ax, h: by - ay, line: { color: C.LINE2, width: 1.4, beginArrowType: 'none', endArrowType: 'triangle' } });
    }
  }
  steps.forEach((st, i) => {
    const [x, y] = pos[i];
    const accent = i === 5 ? C.BRAND : i === 6 ? C.RUN : C.INK;
    addCard(s, x, y, 1.92, 1.66, { fill: i === 5 ? C.BRAND_SOFT : C.CARD, line: i === 5 ? 'DABFA7' : C.LINE, shadow: false });
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.16, y: y + 0.17, w: 0.34, h: 0.34, fill: { color: accent }, line: { color: accent, transparency: 100 } });
    s.addText(st[0], { x: x + 0.16, y: y + 0.22, w: 0.34, h: 0.19, fontFace: FONT.MONO, fontSize: 8.5, bold: true, color: C.PAPER, align: 'center', margin: 0 });
    s.addText(st[1], { x: x + 0.62, y: y + 0.23, w: 1.08, h: 0.20, fontFace: FONT.MONO, fontSize: 8.2, bold: true, charSpacing: 0.7, color: accent, margin: 0 });
    s.addText(st[2], { x: x + 0.17, y: y + 0.78, w: 1.52, h: 0.48, fontFace: FONT.UI, fontSize: 10.2, bold: true, color: C.INK2, align: 'center', margin: 0, valign: 'mid' });
  });
  addCard(s, 10.02, 2.04, 2.54, 4.17, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'The real aha', 10.34, 2.40, 1.85, C.BRAND);
  s.addText('“I left, came back, understood what happened—and trusted the result.”', { x: 10.34, y: 2.92, w: 1.88, h: 1.55, fontFace: FONT.SERIF, fontSize: 19.5, italic: true, bold: true, color: C.PAPER, margin: 0, align: 'center', valign: 'mid' });
  s.addShape(pptx.ShapeType.line, { x: 10.43, y: 4.77, w: 1.69, h: 0, line: { color: '4C4436', width: 1 } });
  s.addText('Spawning agents is an action. Closing the loop is the product.', { x: 10.34, y: 5.05, w: 1.88, h: 0.68, fontFace: FONT.UI, fontSize: 9.8, color: 'BEB6A7', margin: 0, align: 'center' });
}

// 07 — Two spaces
{
  const s = pptx.addSlide();
  addHeader(s, '06 · Product architecture', 'Two spaces. One shared work graph.', 7, { subtitle: 'Execution and collaboration stay distinct—but exchange the same durable objects.' });
  addCard(s, 0.75, 1.92, 5.30, 3.93, { fill: C.DARK, line: '423B30' });
  addStatusTag(s, 'Execution', 1.05, 2.18, 'built');
  s.addText('Agentic Coding Space', { x: 1.04, y: 2.65, w: 4.45, h: 0.45, fontFace: FONT.SERIF, fontSize: 23, bold: true, color: C.PAPER, margin: 0 });
  addBullets(s, ['Projects, tasks, dependencies', 'Claude · Codex · Hermes · terminals', 'Sessions, logs, prompts, checkpoints', 'Git + worktree isolation', 'Teams, skills, memory, permissions'], 1.08, 3.38, 4.36, { gap: 0.40, fontSize: 10.5, color: 'C7C0B2', dotColor: C.BRAND });
  addCard(s, 7.28, 1.92, 5.27, 3.93, { fill: C.CARD, line: C.LINE2 });
  addStatusTag(s, 'Collaboration', 7.58, 2.18, 'built');
  s.addText('Collab Space', { x: 7.57, y: 2.65, w: 4.3, h: 0.45, fontFace: FONT.SERIF, fontSize: 23, bold: true, color: C.INK, margin: 0 });
  addBullets(s, ['Repo-scoped spaces + channels', 'Shared tasks, personas, spells, docs', 'Push / pull / adopt / install', 'Visible provenance', 'Humans now; agents increasingly in the loop'], 7.61, 3.38, 4.36, { gap: 0.40, fontSize: 10.5, color: C.INK2, dotColor: C.BRAND });
  // bridge
  s.addShape(pptx.ShapeType.roundRect, { x: 5.62, y: 2.45, w: 2.08, h: 2.84, rectRadius: 0.08, fill: { color: C.BRAND_SOFT }, line: { color: 'DABFA7', width: 1.1 } });
  addEyebrow(s, 'Shared currency', 5.87, 2.78, 1.58, C.BRAND2);
  ['TASK', 'TEAM MEMBER', 'SKILL / SPELL', 'DOC / ARTIFACT', 'EVIDENCE'].forEach((t, i) => addPill(s, t, 5.88, 3.20 + i * 0.36, 1.54, { fill: C.CARD, line: 'D7C2AE', color: C.INK2, mono: true, size: 7.1, h: 0.26 }));
  s.addShape(pptx.ShapeType.line, { x: 5.47, y: 3.86, w: -0.66, h: 0, line: { color: C.BRAND, width: 1.4, beginArrowType: 'triangle', endArrowType: 'triangle' } });
  s.addShape(pptx.ShapeType.line, { x: 7.86, y: 3.86, w: 0.66, h: 0, line: { color: C.BRAND, width: 1.4, beginArrowType: 'triangle', endArrowType: 'triangle' } });
  s.addText('The durable asset is not the chat transcript. It is the reusable work object—and the proof attached to it.', { x: 1.18, y: 6.18, w: 10.97, h: 0.37, fontFace: FONT.SERIF, fontSize: 15.3, italic: true, color: C.INK2, align: 'center', margin: 0 });
}

// 08 — MVP evidence
{
  const s = pptx.addSlide();
  addHeader(s, '07 · Product proof', 'The MVP already has a meaningful strategic shape.', 8, { subtitle: 'These are not roadmap slogans; they are visible product primitives.' });
  addCard(s, 0.75, 1.80, 7.55, 4.88, { fill: C.DARK, line: '40392E' });
  addImage(s, ASSET.desktop, 0.89, 1.94, 7.27, 4.60, 'cover');
  s.addShape(pptx.ShapeType.roundRect, { x: 0.93, y: 6.05, w: 2.42, h: 0.34, rectRadius: 0.05, fill: { color: C.TERM, transparency: 8 }, line: { color: '5A5142', width: 0.7 } });
  s.addText('REAL PRODUCT SCREEN', { x: 1.10, y: 6.15, w: 2.08, h: 0.14, fontFace: FONT.MONO, fontSize: 7.3, bold: true, charSpacing: 1.1, color: C.PAPER, margin: 0 });
  const proof = [
    ['01', 'Ideas → tasks', 'Durable capture, hierarchy, references, acceptance.'],
    ['02', 'One workspace', 'Multiple tools, projects, terminals, and sessions.'],
    ['03', 'Team members', 'Reusable identity, runtime, permissions, memory, skills.'],
    ['04', 'Deliberate orchestration', 'Worker, queue, tree, batch, DAG, and teams.'],
    ['05', 'Collab + Git', 'Shared work objects around the code system of record.'],
  ];
  proof.forEach((p, i) => {
    const y = 1.83 + i * 0.94;
    s.addText(p[0], { x: 8.75, y: y + 0.12, w: 0.36, h: 0.18, fontFace: FONT.MONO, fontSize: 8.4, bold: true, color: C.BRAND, margin: 0 });
    s.addText(p[1], { x: 9.20, y: y + 0.07, w: 2.85, h: 0.24, fontFace: FONT.UI, fontSize: 11.3, bold: true, color: C.INK, margin: 0 });
    s.addText(p[2], { x: 9.20, y: y + 0.36, w: 3.12, h: 0.36, fontFace: FONT.UI, fontSize: 8.9, color: C.INK3, margin: 0 });
    if (i < proof.length - 1) s.addShape(pptx.ShapeType.line, { x: 8.76, y: y + 0.82, w: 3.56, h: 0, line: { color: C.LINE, width: 0.7 } });
  });
  addStatusTag(s, 'Built now', 10.97, 6.14, 'built');
  addNotes(s, 'Screenshot from the current Maestro product. Make clear that capability depth varies, but the primitives exist.');
}

// 09 — Task contract
{
  const s = pptx.addSlide();
  addHeader(s, '08 · Work protocol', 'A good task is a contract—not a prompt.', 9, { subtitle: 'Make ownership, boundaries, dependencies, and proof visible before execution starts.' });
  const fields = [
    ['OUTCOME', 'What must be true?'], ['OWNER', 'Who may act now?'], ['SCOPE', 'Included—and excluded'],
    ['INPUTS', 'Context to read first'], ['DEPENDENCIES', 'What blocks / unblocks'], ['ISOLATION', 'Tree, branch, worktree'],
    ['ACCEPTANCE', 'Observable success'], ['EVIDENCE', 'Diff, test, screenshot'], ['REVIEWER', 'Independent check'],
  ];
  fields.forEach((f, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.75 + col * 2.47;
    const y = 1.86 + row * 1.18;
    addCard(s, x, y, 2.24, 0.93, { fill: i === 7 ? C.BRAND_SOFT : C.CARD, line: i === 7 ? 'D8BDA3' : C.LINE, shadow: false });
    s.addText(f[0], { x: x + 0.17, y: y + 0.16, w: 1.87, h: 0.17, fontFace: FONT.MONO, fontSize: 7.5, bold: true, charSpacing: 0.9, color: i === 7 ? C.BRAND2 : C.INK3, margin: 0 });
    s.addText(f[1], { x: x + 0.17, y: y + 0.47, w: 1.87, h: 0.24, fontFace: FONT.UI, fontSize: 9.5, bold: true, color: C.INK, margin: 0 });
  });
  addCard(s, 8.43, 1.86, 4.12, 3.29, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'Anti-duplication rules', 8.75, 2.17, 2.6, C.BRAND);
  addBullets(s, [
    'Claim before execution.',
    'One accountable owner; many contributors.',
    'Declare the edit and decision surface.',
    'Represent dependencies explicitly.',
    'Label exploration separately from implementation.',
    'Attach artifacts to the task.',
    'Completion without evidence goes to review—not done.',
  ], 8.76, 2.62, 3.42, { gap: 0.35, fontSize: 9.4, color: 'C7C0B2', dotColor: C.BRAND });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.75, y: 5.58, w: 11.80, h: 0.80, rectRadius: 0.05, fill: { color: C.RUN_SOFT }, line: { color: 'CFE0D4', width: 0.8 } });
  s.addText('STATE MODEL', { x: 1.00, y: 5.88, w: 1.18, h: 0.18, fontFace: FONT.MONO, fontSize: 8.1, bold: true, charSpacing: 1, color: C.RUN, margin: 0 });
  s.addText('PROPOSED  →  READY  →  CLAIMED  →  WORKING  →  IN REVIEW  →  VERIFIED  →  DONE', { x: 2.34, y: 5.83, w: 9.55, h: 0.24, fontFace: FONT.MONO, fontSize: 9.2, bold: true, color: C.INK2, margin: 0, align: 'center' });
}

// 10 — Assignment and verification
{
  const s = pptx.addSlide();
  addHeader(s, '09 · Control system', 'Assignment routes the work. Verification earns “done.”', 10, { subtitle: 'Do not ask one agent to be planner, implementer, and judge by default.' });
  addCard(s, 0.75, 1.88, 5.68, 4.42, { fill: C.CARD });
  addEyebrow(s, 'Assignment protocol', 1.07, 2.18, 2.4, C.BRAND);
  const assign = [
    ['1', 'Classify the task', 'explore · design · build · debug · review'],
    ['2', 'Match the specialist', 'identity · skills · permissions · memory'],
    ['3', 'Choose the runtime', 'best-fit capability—not favorite vendor'],
    ['4', 'Choose isolation', 'shared tree · worktree · sandbox · read-only'],
    ['5', 'Set checkpoints', 'plan approval for risky or ambiguous work'],
  ];
  assign.forEach((a, i) => addStep(s, a[0], a[1], a[2], 1.08, 2.65 + i * 0.65, 4.82, { titleSize: 10.8, bodySize: 8.4, bodyH: 0.24 }));
  addCard(s, 6.68, 1.88, 5.87, 4.42, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'Verification protocol', 7.02, 2.18, 2.6, C.BRAND);
  const verify = [
    ['READ', 'Outcome + acceptance'],
    ['INSPECT', 'Artifact, diff, or design'],
    ['RUN', 'Named checks and tests'],
    ['COMPARE', 'References + contract'],
    ['RECORD', 'Findings as executable deltas'],
    ['DECIDE', 'Approve · return · split follow-up'],
  ];
  verify.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 7.04 + col * 2.56;
    const y = 2.74 + row * 0.91;
    s.addShape(pptx.ShapeType.roundRect, { x, y, w: 2.28, h: 0.67, rectRadius: 0.05, fill: { color: C.DARK2 }, line: { color: '504638', width: 0.8 } });
    s.addText(v[0], { x: x + 0.16, y: y + 0.12, w: 0.82, h: 0.16, fontFace: FONT.MONO, fontSize: 7.4, bold: true, charSpacing: 0.8, color: C.BRAND, margin: 0 });
    s.addText(v[1], { x: x + 0.16, y: y + 0.34, w: 1.93, h: 0.20, fontFace: FONT.UI, fontSize: 8.7, color: C.PAPER, margin: 0 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.75, y: 6.52, w: 11.80, h: 0.39, rectRadius: 0.04, fill: { color: C.BRAND }, line: { color: C.BRAND, transparency: 100 } });
  s.addText('DONE REQUIRES EVIDENCE.', { x: 1.05, y: 6.635, w: 2.35, h: 0.16, fontFace: FONT.MONO, fontSize: 8.6, bold: true, charSpacing: 1.1, color: C.PAPER, margin: 0 });
  s.addText('A completion message is a claim. The evidence bundle is the proof.', { x: 3.55, y: 6.60, w: 8.20, h: 0.20, fontFace: FONT.UI, fontSize: 10.2, bold: true, color: C.PAPER, margin: 0 });
}

// 11 — Onboarding and mobile
{
  const s = pptx.addSlide();
  addHeader(s, '10 · Activation', 'Onboard users to one closed loop—not every feature.', 11, { subtitle: 'First-run promise: bring one real task; leave with one verified result and a reusable setup.' });
  addCard(s, 0.75, 1.84, 7.16, 4.90, { fill: C.CARD });
  const onboarding = [
    ['1', 'Connect a repo', 'Detect working directory + Git remote.'],
    ['2', 'Choose a starter lane', 'Bug · feature · review · design exploration.'],
    ['3', 'Define with a template', 'Outcome · scope · acceptance · evidence.'],
    ['4', 'Pick a specialist + runtime', 'Default safely; explain the tradeoff.'],
    ['5', 'Start in the right isolation', 'Worktree for edits; read-only for review.'],
    ['6', 'Verify and save the win', 'Approve evidence; preserve memory or template.'],
  ];
  onboarding.forEach((a, i) => addStep(s, a[0], a[1], a[2], 1.08, 2.18 + i * 0.69, 6.25, { titleSize: 11.1, bodySize: 8.8, bodyH: 0.25, fill: i === 5 ? C.BRAND : C.INK }));
  addEyebrow(s, 'Get work done on the move', 8.34, 1.86, 3.5, C.BRAND);
  addCard(s, 8.22, 2.22, 1.98, 4.42, { fill: C.DARK, line: '433B2F' });
  addImage(s, ASSET.mobileTasks, 8.33, 2.34, 1.76, 4.18, 'contain');
  addCard(s, 10.45, 2.22, 1.98, 4.42, { fill: C.DARK, line: '433B2F' });
  addImage(s, ASSET.mobileTerminal, 10.56, 2.34, 1.76, 4.18, 'contain');
  addStatusTag(s, 'Mobile foundation', 9.62, 6.47, 'next');
  addNotes(s, 'Mobile should focus on glance, approve, redirect, unblock, and message—not replicate the full desktop workspace.');
}

// 12 — Team members
{
  const s = pptx.addSlide();
  addHeader(s, '11 · Reusable organization', 'Team members are Skills++.', 12, { subtitle: 'A skill is reusable instruction. A team member is a reusable operating identity.' });
  addCard(s, 0.75, 1.84, 5.75, 4.88, { fill: C.DARK, line: '403A30' });
  addStatusTag(s, 'Reusable role', 1.08, 2.12, 'truth');
  s.addText('Frontend Lead', { x: 1.08, y: 2.56, w: 3.1, h: 0.48, fontFace: FONT.SERIF, fontSize: 24, bold: true, color: C.PAPER, margin: 0 });
  s.addText('“Own interface quality, preserve the design system, and require visual evidence before completion.”', { x: 1.10, y: 3.20, w: 4.80, h: 0.90, fontFace: FONT.SERIF, fontSize: 15, italic: true, color: 'C7C0B2', margin: 0, align: 'center', valign: 'mid' });
  const attrs = [
    ['IDENTITY', 'How it thinks'], ['RUNTIME', 'Agent + model'], ['PERMISSIONS', 'What it may do'],
    ['MEMORY', 'What survives'], ['SKILLS', 'Playbooks loaded'], ['POSITION', 'Where it sits'],
  ];
  attrs.forEach((a, i) => {
    const x = 1.08 + (i % 2) * 2.44;
    const y = 4.43 + Math.floor(i / 2) * 0.62;
    s.addText(a[0], { x, y, w: 1.02, h: 0.15, fontFace: FONT.MONO, fontSize: 7.1, bold: true, color: C.BRAND, charSpacing: 0.7, margin: 0 });
    s.addText(a[1], { x: x + 1.08, y: y - 0.01, w: 1.10, h: 0.18, fontFace: FONT.UI, fontSize: 8.5, color: C.PAPER, margin: 0 });
  });
  addCard(s, 6.76, 1.84, 5.79, 4.88, { fill: C.CARD });
  addImage(s, ASSET.memberModal, 6.93, 2.00, 5.45, 4.57, 'contain');
  s.addShape(pptx.ShapeType.roundRect, { x: 7.08, y: 6.12, w: 2.00, h: 0.34, rectRadius: 0.05, fill: { color: C.PAPER, transparency: 6 }, line: { color: C.LINE2, width: 0.8 } });
  s.addText('CURRENT UI', { x: 7.29, y: 6.22, w: 1.58, h: 0.14, fontFace: FONT.MONO, fontSize: 7.4, bold: true, charSpacing: 1.1, color: C.INK2, margin: 0 });
  addPill(s, 'Skills', 9.48, 6.14, 0.76, { mono: true, size: 7.2, h: 0.28 });
  addPill(s, 'Memory', 10.35, 6.14, 0.90, { mono: true, size: 7.2, h: 0.28 });
  addPill(s, 'Hierarchy', 11.37, 6.14, 0.98, { mono: true, size: 7.2, h: 0.28 });
}

// 13 — Design & review loop
{
  const s = pptx.addSlide();
  addHeader(s, '12 · Design quality', 'Turn design feedback into an executable improvement loop.', 13, { subtitle: 'Separate exploration, decision, implementation, review, and learning.' });
  const stages = [
    ['01', 'BRIEF', 'User · problem · constraints'],
    ['02', 'EXPLORE', '2–3 materially different paths'],
    ['03', 'CHOOSE', 'Decision + rejected alternatives'],
    ['04', 'CONTRACT', 'States · behavior · tokens · proof'],
    ['05', 'BUILD', 'Clear ownership boundary'],
    ['06', 'REVIEW', 'Independent check'],
    ['07', 'LEARN', 'Token · component · checklist · skill'],
  ];
  stages.forEach((st, i) => {
    const x = 0.76 + i * 1.78;
    if (i < stages.length - 1) s.addShape(pptx.ShapeType.line, { x: x + 1.47, y: 2.76, w: 0.31, h: 0, line: { color: C.BRAND, width: 1.2, endArrowType: 'triangle' } });
    addCard(s, x, 2.06, 1.50, 1.45, { fill: i === 5 ? C.BRAND_SOFT : C.CARD, line: i === 5 ? 'D8BDA4' : C.LINE, shadow: false });
    s.addText(st[0], { x: x + 0.13, y: 2.22, w: 0.34, h: 0.17, fontFace: FONT.MONO, fontSize: 7.4, bold: true, color: C.BRAND, margin: 0 });
    s.addText(st[1], { x: x + 0.13, y: 2.56, w: 1.18, h: 0.20, fontFace: FONT.MONO, fontSize: 8.2, bold: true, charSpacing: 0.7, color: C.INK, align: 'center', margin: 0 });
    s.addText(st[2], { x: x + 0.12, y: 2.94, w: 1.22, h: 0.34, fontFace: FONT.UI, fontSize: 7.7, color: C.INK3, align: 'center', margin: 0 });
  });
  addCard(s, 0.75, 4.02, 7.14, 2.28, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'Review axes', 1.07, 4.35, 1.7, C.BRAND);
  const axes = ['User outcome', 'Information hierarchy', 'Design-system consistency', 'All states + breakpoints', 'Accessibility', 'Correctness + regressions', 'Visual evidence'];
  axes.forEach((a, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    s.addShape(pptx.ShapeType.ellipse, { x: 1.10 + col * 3.18, y: 4.82 + row * 0.34, w: 0.06, h: 0.06, fill: { color: C.BRAND }, line: { color: C.BRAND, transparency: 100 } });
    s.addText(a, { x: 1.24 + col * 3.18, y: 4.76 + row * 0.34, w: 2.80, h: 0.18, fontFace: FONT.UI, fontSize: 9.1, color: C.PAPER, margin: 0 });
  });
  addCard(s, 8.18, 4.02, 4.37, 2.28, { fill: C.CARD });
  addEyebrow(s, 'Every finding', 8.48, 4.35, 1.8, C.BRAND);
  const fmt = [
    ['WHAT', 'Observable issue'], ['WHY', 'Violated need or contract'], ['FIX', 'Smallest clear correction'], ['PROOF', 'How review will verify'],
  ];
  fmt.forEach((f, i) => {
    s.addText(f[0], { x: 8.50, y: 4.78 + i * 0.34, w: 0.65, h: 0.16, fontFace: FONT.MONO, fontSize: 7.2, bold: true, color: i === 3 ? C.RUN : C.BRAND, margin: 0 });
    s.addText(f[1], { x: 9.23, y: 4.75 + i * 0.34, w: 2.75, h: 0.20, fontFace: FONT.UI, fontSize: 9.2, color: C.INK2, margin: 0 });
  });
}

// 14 — Collab
{
  const s = pptx.addSlide();
  addHeader(s, '13 · Collab', 'Collaboration should share executable context—not just messages.', 14, { subtitle: 'Repo-scoped spaces become the Agentic Product Management layer.' });
  addCard(s, 0.75, 1.86, 3.62, 4.79, { fill: C.CARD });
  addStatusTag(s, 'Built now', 1.04, 2.14, 'built');
  s.addText('A credible foundation', { x: 1.04, y: 2.61, w: 2.90, h: 0.35, fontFace: FONT.SERIF, fontSize: 19.5, bold: true, color: C.INK, margin: 0 });
  addBullets(s, ['Auth + repo discovery', 'Public / private spaces', 'Channels + messaging', 'Members roster', 'Share tasks, personas, spells', 'Files + docs', 'Push / pull provenance', 'Deployed security rules + tests'], 1.06, 3.16, 2.88, { gap: 0.36, fontSize: 9.5, color: C.INK2, dotColor: C.RUN });
  addCard(s, 4.70, 1.86, 4.03, 4.79, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'The shared stream', 5.02, 2.16, 2.3, C.BRAND);
  // conceptual stream
  const msgs = [
    ['Rhea', 'Design contract attached', C.BRAND_SOFT],
    ['Arun', 'Pulled task #142', C.INFO_SOFT],
    ['Code Reviewer', '3 findings · 1 blocker', C.RUN_SOFT],
  ];
  msgs.forEach((m, i) => {
    const y = 2.72 + i * 0.94;
    s.addShape(pptx.ShapeType.roundRect, { x: 5.02, y, w: 3.39, h: 0.72, rectRadius: 0.05, fill: { color: m[2] }, line: { color: '5B5142', transparency: 78, width: 0.7 } });
    s.addShape(pptx.ShapeType.ellipse, { x: 5.18, y: y + 0.18, w: 0.32, h: 0.32, fill: { color: i === 2 ? C.RUN : C.BRAND }, line: { color: C.PAPER, width: 0.7 } });
    s.addText(m[0], { x: 5.64, y: y + 0.13, w: 1.46, h: 0.18, fontFace: FONT.UI, fontSize: 8.8, bold: true, color: C.INK, margin: 0 });
    s.addText(m[1], { x: 5.64, y: y + 0.38, w: 2.48, h: 0.18, fontFace: FONT.UI, fontSize: 8.4, color: C.INK2, margin: 0 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 5.02, y: 5.72, w: 3.39, h: 0.48, rectRadius: 0.05, fill: { color: C.TERM }, line: { color: '4B4336' } });
  s.addText('@CodeReviewer review PR #42', { x: 5.24, y: 5.88, w: 2.94, h: 0.18, fontFace: FONT.MONO, fontSize: 8.1, color: C.PAPER, margin: 0 });
  addCard(s, 9.06, 1.86, 3.49, 4.79, { fill: C.BRAND_SOFT, line: 'D9C0A8' });
  addStatusTag(s, 'Next', 9.36, 2.14, 'next');
  s.addText('The killer flow', { x: 9.36, y: 2.61, w: 2.70, h: 0.35, fontFace: FONT.SERIF, fontSize: 19.5, bold: true, color: C.INK, margin: 0 });
  s.addText('@agent', { x: 9.36, y: 3.24, w: 0.94, h: 0.26, fontFace: FONT.MONO, fontSize: 12.5, bold: true, color: C.BRAND2, margin: 0 });
  s.addText('mention', { x: 10.45, y: 3.27, w: 1.17, h: 0.22, fontFace: FONT.UI, fontSize: 10.5, color: C.INK2, margin: 0 });
  ['INVOKE', 'WORK', 'POST RESULT', 'CONTINUE'].forEach((t, i) => {
    const y = 3.82 + i * 0.52;
    s.addShape(pptx.ShapeType.ellipse, { x: 9.43, y: y + 0.04, w: 0.18, h: 0.18, fill: { color: i === 3 ? C.RUN : C.BRAND }, line: { color: C.PAPER, width: 0.7 } });
    if (i < 3) s.addShape(pptx.ShapeType.line, { x: 9.52, y: y + 0.23, w: 0, h: 0.31, line: { color: C.BRAND, width: 1 } });
    s.addText(t, { x: 9.78, y, w: 1.82, h: 0.22, fontFace: FONT.MONO, fontSize: 8.4, bold: true, color: C.INK, margin: 0 });
  });
  s.addText('Humans and agents share the same work context, attribution, and history.', { x: 9.37, y: 5.97, w: 2.64, h: 0.42, fontFace: FONT.UI, fontSize: 8.7, color: C.INK2, align: 'center', margin: 0 });
}

// 15 — Competitive truth
{
  const s = pptx.addSlide();
  addHeader(s, '14 · Competitive reality', 'Native orchestration is improving. That validates the category.', 15, { subtitle: 'Maestro cannot win on “they do not orchestrate.” It must win on neutrality, continuity, and workflow discipline.' });
  const x0 = 0.75;
  const y0 = 1.88;
  const widths = [2.60, 1.60, 1.75, 1.72, 1.85, 2.12];
  const headers = ['PRODUCT TYPE', 'MULTI-AGENT', 'CROSS-PROVIDER', 'DURABLE WORK', 'VERIFICATION', 'COLLAB AROUND WORK'];
  let xx = x0;
  headers.forEach((h, i) => {
    s.addShape(pptx.ShapeType.rect, { x: xx, y: y0, w: widths[i], h: 0.60, fill: { color: C.INK }, line: { color: C.INK, width: 0.5 } });
    s.addText(h, { x: xx + 0.08, y: y0 + 0.18, w: widths[i] - 0.16, h: 0.20, fontFace: FONT.MONO, fontSize: 7.1, bold: true, color: C.PAPER, align: i === 0 ? 'left' : 'center', margin: 0 });
    xx += widths[i];
  });
  const rows = [
    ['Provider-native', 'strong', 'one', 'provider', 'growing', 'provider'],
    ['IDE-native agent', 'growing', 'limited', 'editor', 'diff-led', 'secondary'],
    ['Generic PM / chat', 'none', 'agnostic', 'human', 'manual', 'strong'],
    ['MAESTRO', 'integrates', 'YES', 'SHARED GRAPH', 'EVIDENCE GATE', 'EXECUTABLE'],
  ];
  const mark = (v) => {
    if (['YES', 'SHARED GRAPH', 'EVIDENCE GATE', 'EXECUTABLE'].includes(v)) return { fill: C.RUN_SOFT, color: C.RUN, bold: true };
    if (v === 'one' || v === 'limited' || v === 'provider' || v === 'editor' || v === 'manual' || v === 'secondary') return { fill: C.WAIT_SOFT, color: '8B651F' };
    if (v === 'none') return { fill: C.BLOCK_SOFT, color: C.BLOCK };
    return { fill: C.SURFACE, color: C.INK2 };
  };
  rows.forEach((r, ri) => {
    let x = x0;
    const y = y0 + 0.60 + ri * 0.78;
    r.forEach((v, ci) => {
      const isMaestro = ri === 3;
      s.addShape(pptx.ShapeType.rect, { x, y, w: widths[ci], h: 0.78, fill: { color: isMaestro ? C.DARK : (ri % 2 ? C.SURFACE : C.CARD) }, line: { color: C.LINE2, width: 0.6 } });
      if (ci === 0) {
        s.addText(v, { x: x + 0.16, y: y + 0.26, w: widths[ci] - 0.30, h: 0.20, fontFace: isMaestro ? FONT.MONO : FONT.UI, fontSize: isMaestro ? 9.2 : 10.2, bold: isMaestro, charSpacing: isMaestro ? 0.9 : 0, color: isMaestro ? C.PAPER : C.INK, margin: 0 });
      } else {
        const m = mark(v);
        addPill(s, v, x + 0.12, y + 0.23, widths[ci] - 0.24, { fill: isMaestro ? '2D372D' : m.fill, line: isMaestro ? '526655' : C.LINE2, color: isMaestro ? '8FD0A4' : m.color, mono: true, size: 7.1, h: 0.31, bold: true });
      }
      x += widths[ci];
    });
  });
  addCard(s, 0.75, 5.38, 11.80, 0.88, { fill: C.BRAND_SOFT, line: 'D9C0A8', shadow: false });
  s.addText('STRATEGIC RULE', { x: 1.02, y: 5.70, w: 1.42, h: 0.18, fontFace: FONT.MONO, fontSize: 7.8, bold: true, charSpacing: 1.0, color: C.BRAND2, margin: 0 });
  s.addText('Integrate provider-native strengths. Own the shared plan, ownership, evidence, and cross-tool memory.', { x: 2.60, y: 5.62, w: 9.20, h: 0.33, fontFace: FONT.UI, fontSize: 12.3, bold: true, color: C.INK, margin: 0, align: 'center' });
  s.addText('Sources: Anthropic Claude Code agent teams / parallel agents · OpenAI Codex app · Nous Hermes Agent docs (accessed July 2026)', { x: 0.82, y: 6.67, w: 11.60, h: 0.17, fontFace: FONT.MONO, fontSize: 6.4, color: C.INK3, align: 'center', margin: 0 });
  addNotes(s, 'Current official sources: https://code.claude.com/docs/en/agents ; https://code.claude.com/docs/en/agent-teams ; https://openai.com/index/introducing-the-codex-app/ ; https://hermes-agent.nousresearch.com/docs/');
}

// 16 — Moat flywheel
{
  const s = pptx.addSlide();
  addHeader(s, '15 · Durable advantage', 'The moat is accumulated workflow memory—not another adapter.', 16, { subtitle: 'Every completed loop should make the next loop easier, safer, and more reusable.' });
  // central
  s.addShape(pptx.ShapeType.ellipse, { x: 4.95, y: 2.98, w: 3.42, h: 1.91, fill: { color: C.DARK }, line: { color: C.BRAND, width: 1.4 }, shadow: { type: 'outer', color: '5A4E3C', blur: 2, angle: 45, distance: 1, opacity: 0.12 } });
  addEyebrow(s, 'Compounding asset', 5.60, 3.34, 2.2, C.BRAND);
  s.addText('WORKFLOW\nMEMORY', { x: 5.52, y: 3.69, w: 2.28, h: 0.63, fontFace: FONT.MONO, fontSize: 15, bold: true, charSpacing: 1.2, color: C.PAPER, align: 'center', margin: 0 });
  const nodes = [
    [0.90, 2.39, 'REAL RUNS', 'Tasks + evidence'],
    [5.22, 1.84, 'FEEDBACK', 'Where the system breaks'],
    [9.54, 2.39, 'PATTERNS', 'Teams + templates + skills'],
    [9.54, 4.91, 'BETTER LOOPS', 'Less rework + more trust'],
    [5.22, 5.46, 'PROOF', 'Outcome stories + reuse'],
    [0.90, 4.91, 'COMMUNITY', 'More builders + artifacts'],
  ];
  const center = [6.66, 3.93];
  nodes.forEach((n, i) => {
    const x = n[0], y = n[1];
    const nodeCenter = [x + 1.45, y + 0.63];
    s.addShape(pptx.ShapeType.line, { x: center[0], y: center[1], w: nodeCenter[0] - center[0], h: nodeCenter[1] - center[1], line: { color: C.LINE2, width: 1.0, transparency: 15 } });
    addCard(s, x, y, 2.90, 1.00, { fill: i % 2 ? C.BRAND_SOFT : C.CARD, line: i % 2 ? 'D9C0A8' : C.LINE, shadow: false });
    s.addText(n[2], { x: x + 0.18, y: y + 0.17, w: 2.54, h: 0.20, fontFace: FONT.MONO, fontSize: 8.4, bold: true, charSpacing: 0.8, color: i % 2 ? C.BRAND2 : C.INK, align: 'center', margin: 0 });
    s.addText(n[3], { x: x + 0.18, y: y + 0.53, w: 2.54, h: 0.22, fontFace: FONT.UI, fontSize: 9.2, color: C.INK2, align: 'center', margin: 0 });
  });
  // Repaint the hub above the spokes so connectors terminate cleanly at its edge.
  s.addShape(pptx.ShapeType.ellipse, { x: 4.95, y: 2.98, w: 3.42, h: 1.91, fill: { color: C.DARK }, line: { color: C.BRAND, width: 1.4 } });
  addEyebrow(s, 'Compounding asset', 5.60, 3.34, 2.2, C.BRAND);
  s.addText('WORKFLOW\nMEMORY', { x: 5.52, y: 3.69, w: 2.28, h: 0.63, fontFace: FONT.MONO, fontSize: 15, bold: true, charSpacing: 1.2, color: C.PAPER, align: 'center', margin: 0 });
  s.addText('Adapters widen the network. The reusable organization inside the network creates switching value.', { x: 2.00, y: 6.73, w: 9.32, h: 0.22, fontFace: FONT.SERIF, fontSize: 12.5, italic: true, color: C.INK2, align: 'center', margin: 0 });
}

// 17 — GTM
{
  const s = pptx.addSlide();
  addHeader(s, '16 · Go to market', 'Community before cloud. Outcomes before monetization.', 17, { subtitle: 'The immediate goal is 100–1,000 retained builders who repeatedly complete real work.' });
  addCard(s, 0.75, 1.87, 4.20, 4.65, { fill: C.DARK, line: '403A30' });
  s.addText('100 → 1,000', { x: 1.13, y: 2.37, w: 3.42, h: 0.75, fontFace: FONT.MONO, fontSize: 28, bold: true, color: C.PAPER, align: 'center', margin: 0 });
  s.addText('retained power users', { x: 1.25, y: 3.17, w: 3.18, h: 0.30, fontFace: FONT.SERIF, fontSize: 17, italic: true, color: C.BRAND, align: 'center', margin: 0 });
  s.addShape(pptx.ShapeType.line, { x: 1.38, y: 3.78, w: 2.93, h: 0, line: { color: '51493B', width: 1 } });
  s.addText('The goal is not reach. It is repeated, verified work—and visible proof that the workflow improves.', { x: 1.20, y: 4.18, w: 3.30, h: 1.02, fontFace: FONT.UI, fontSize: 12.1, color: 'C7C0B2', align: 'center', margin: 0, valign: 'mid' });
  addPill(s, 'NO CLOUD RUSH', 1.73, 5.74, 2.27, { fill: '302A21', line: '51483A', color: C.BRAND, mono: true, size: 8.2, h: 0.33 });
  const tactics = [
    ['X / TWITTER', 'Founder build logs, 60-second workflow clips, honest failure reports.'],
    ['WEEKLY MAESTRO RUN', 'One objective, task tree, agent mix, evidence, outcome.'],
    ['WORKFLOW LIBRARY', 'Templates, team members, review rubrics, skills, spells.'],
    ['OFFICE HOURS', 'Onboard live. Watch where users fail. Fix recurring blockers.'],
    ['PUBLIC FEEDBACK LOOP', 'Show which user feedback changed the product and why.'],
    ['LOCAL / FREE PATH', 'Ollama and curated models for the broader creator audience—later.'],
  ];
  tactics.forEach((t, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 5.28 + col * 3.66;
    const y = 1.88 + row * 1.43;
    addCard(s, x, y, 3.38, 1.18, { fill: i === 1 ? C.BRAND_SOFT : C.CARD, line: i === 1 ? 'D9C0A8' : C.LINE, shadow: false });
    s.addText(t[0], { x: x + 0.18, y: y + 0.18, w: 3.02, h: 0.18, fontFace: FONT.MONO, fontSize: 7.7, bold: true, charSpacing: 0.8, color: i === 1 ? C.BRAND2 : C.INK, margin: 0 });
    s.addText(t[1], { x: x + 0.18, y: y + 0.49, w: 2.98, h: 0.44, fontFace: FONT.UI, fontSize: 8.8, color: C.INK2, margin: 0 });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 5.28, y: 6.19, w: 7.04, h: 0.38, rectRadius: 0.04, fill: { color: C.RUN_SOFT }, line: { color: 'CEE0D3', width: 0.8 } });
  s.addText('ACQUISITION HOOK', { x: 5.53, y: 6.31, w: 1.55, h: 0.15, fontFace: FONT.MONO, fontSize: 7.2, bold: true, charSpacing: 0.8, color: C.RUN, margin: 0 });
  s.addText('“If your AI team lives across six terminals and your memory, you have an operating-system problem.”', { x: 7.20, y: 6.27, w: 4.78, h: 0.18, fontFace: FONT.UI, fontSize: 8.9, bold: true, color: C.INK2, margin: 0, align: 'center' });
}

// 18 — Roadmap + 90 day
{
  const s = pptx.addSlide();
  addHeader(s, '17 · Sequence', 'Improve the loop, widen the ecosystem, then earn the cloud.', 18, { subtitle: 'Roadmap order follows user pull and retention—not feature count.' });
  const phases = [
    ['NOW', 'built', ['Desktop + browser', 'Tasks · sessions · teams', 'Multi-runtime control', 'Git / worktrees', 'Collab foundation']],
    ['NEXT', 'next', ['Guided first run', 'Task contracts + claims', 'Evidence + review gates', 'Design workflow', 'Mobile approvals', 'Agent-in-Collab flow']],
    ['THEN', 'later', ['Provider adapter SDK', 'Ollama / local models', 'Grok · Llama · Kimi · GLM', 'Portable workflow library']],
    ['LATER', 'truth', ['Cloud sync after pull', 'Shared org libraries', 'Governance + audit', 'Optional managed runtime']],
  ];
  phases.forEach((p, i) => {
    const x = 0.75 + i * 3.00;
    addCard(s, x, 1.84, 2.75, 3.39, { fill: i === 0 ? C.DARK : C.CARD, line: i === 0 ? '403A30' : C.LINE, shadow: false });
    addStatusTag(s, p[0], x + 0.22, 2.09, p[1]);
    addBullets(s, p[2], x + 0.25, 2.69, 2.25, { gap: 0.40, fontSize: 9.2, color: i === 0 ? 'C7C0B2' : C.INK2, dotColor: i === 0 ? C.BRAND : C.INK3 });
  });
  addEyebrow(s, 'Ninety-day operating plan', 0.77, 5.58, 2.8, C.BRAND);
  const ninety = [
    ['DAYS 1–30', 'ACTIVATION', 'One-task onboarding · 20–30 live onboardings · instrument first verified outcome'],
    ['DAYS 31–60', 'RETENTION', 'Evidence bundles · reusable starter teams · multi-provider reliability · weekly public runs'],
    ['DAYS 61–90', 'COMMUNITY PROOF', 'Workflow library · five case studies · Collab sharing · choose next bets from observed use'],
  ];
  ninety.forEach((n, i) => {
    const x = 0.75 + i * 3.95;
    s.addShape(pptx.ShapeType.roundRect, { x, y: 5.92, w: 3.68, h: 0.85, rectRadius: 0.05, fill: { color: i === 1 ? C.BRAND_SOFT : C.SURFACE }, line: { color: i === 1 ? 'D9C0A8' : C.LINE2, width: 0.8 } });
    s.addText(n[0], { x: x + 0.16, y: 6.08, w: 0.95, h: 0.16, fontFace: FONT.MONO, fontSize: 6.9, bold: true, color: C.INK3, margin: 0 });
    s.addText(n[1], { x: x + 1.20, y: 6.05, w: 2.25, h: 0.18, fontFace: FONT.MONO, fontSize: 7.6, bold: true, charSpacing: 0.6, color: i === 1 ? C.BRAND2 : C.INK, margin: 0 });
    s.addText(n[2], { x: x + 0.16, y: 6.34, w: 3.30, h: 0.27, fontFace: FONT.UI, fontSize: 7.5, color: C.INK2, margin: 0, align: 'center' });
  });
}

// 19 — Metrics and risks
{
  const s = pptx.addSlide();
  addHeader(s, '18 · Operating discipline', 'Measure verified progress. Design against the obvious risks.', 19, { subtitle: 'Avoid vanity metrics that reward motion without outcomes.' });
  addCard(s, 0.75, 1.85, 4.44, 4.84, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'North star', 1.08, 2.18, 1.8, C.BRAND);
  s.addText('VERIFIED\nWORK LOOPS', { x: 1.12, y: 2.72, w: 3.72, h: 0.95, fontFace: FONT.MONO, fontSize: 23, bold: true, charSpacing: 1.0, color: C.PAPER, align: 'center', margin: 0 });
  s.addText('per weekly active user', { x: 1.28, y: 3.78, w: 3.40, h: 0.31, fontFace: FONT.SERIF, fontSize: 16, italic: true, color: C.BRAND, align: 'center', margin: 0 });
  s.addShape(pptx.ShapeType.line, { x: 1.34, y: 4.41, w: 3.25, h: 0, line: { color: '51493B', width: 1 } });
  addBullets(s, ['Time to first verified outcome', 'Week 1 / week 4 retained builders', '% tasks with owner + acceptance + evidence', 'Templates / team members reused', 'Users running more than one provider', 'Outcome stories with before / after proof'], 1.10, 4.72, 3.62, { gap: 0.31, fontSize: 8.6, color: 'C7C0B2', dotColor: C.BRAND });
  addEyebrow(s, 'Risks → responses', 5.54, 1.90, 2.5, C.BRAND);
  const risks = [
    ['Frontier bundling', 'Own cross-provider workflow; integrate native capabilities.'],
    ['Complexity', 'Teach one closed loop; reveal power progressively.'],
    ['Low-quality agent output', 'Make evidence, review roles, and checkpoints first-class.'],
    ['Vague “everything” story', 'Keep the wedge: multi-agent software delivery for power users.'],
    ['Integration churn', 'Explicit adapters, capability detection, graceful fallback.'],
    ['Slack-clone drift', 'Tie every conversation to executable work objects.'],
  ];
  risks.forEach((r, i) => {
    const y = 2.28 + i * 0.73;
    addCard(s, 5.51, y, 7.04, 0.57, { fill: i % 2 ? C.SURFACE : C.CARD, shadow: false });
    s.addText(r[0], { x: 5.74, y: y + 0.17, w: 1.82, h: 0.18, fontFace: FONT.UI, fontSize: 9.2, bold: true, color: C.BLOCK, margin: 0 });
    s.addText('→', { x: 7.61, y: y + 0.13, w: 0.30, h: 0.24, fontFace: FONT.UI, fontSize: 12, bold: true, color: C.BRAND, align: 'center', margin: 0 });
    s.addText(r[1], { x: 8.02, y: y + 0.13, w: 4.18, h: 0.26, fontFace: FONT.UI, fontSize: 8.7, color: C.INK2, margin: 0, valign: 'mid' });
  });
  s.addText('Do not optimize for: total sessions · total tasks created · raw signups · token volume without outcomes', { x: 5.57, y: 6.72, w: 6.90, h: 0.19, fontFace: FONT.MONO, fontSize: 7.1, color: C.INK3, align: 'center', margin: 0 });
}

// 20 — Messaging
{
  const s = pptx.addSlide();
  addHeader(s, '19 · Narrative', 'Lead with control. Prove it with the workflow.', 20, { subtitle: 'The message should sound like a builder sharing a solved problem—not a category essay.' });
  addCard(s, 0.75, 1.85, 7.30, 4.80, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'Primary headline', 1.10, 2.20, 2.3, C.BRAND);
  s.addText('Orchestrate any agent.\nKeep control of the work.', { x: 1.08, y: 2.70, w: 5.98, h: 1.12, fontFace: FONT.SERIF, fontSize: 29, bold: true, color: C.PAPER, margin: 0 });
  s.addText('Maestro turns ideas into owned, observable, verified work across Claude, Codex, Hermes—and whatever you use next.', { x: 1.12, y: 4.16, w: 5.91, h: 0.82, fontFace: FONT.UI, fontSize: 13.0, color: 'C7C0B2', margin: 0 });
  s.addShape(pptx.ShapeType.roundRect, { x: 1.10, y: 5.52, w: 5.77, h: 0.59, rectRadius: 0.05, fill: { color: '2D2820' }, line: { color: '4F4638', width: 0.8 } });
  s.addText('FREEDOM OF TOOLS.  DISCIPLINE OF PROCESS.', { x: 1.32, y: 5.72, w: 5.33, h: 0.19, fontFace: FONT.MONO, fontSize: 8.9, bold: true, charSpacing: 1.2, color: C.BRAND, align: 'center', margin: 0 });
  addCard(s, 8.34, 1.85, 4.21, 2.28, { fill: C.CARD });
  addEyebrow(s, 'Founder story', 8.68, 2.18, 1.8, C.BRAND);
  s.addText('“I did not build Maestro because agents could not code. I built it because my process stopped scaling when I used more of them.”', { x: 8.67, y: 2.60, w: 3.53, h: 0.99, fontFace: FONT.SERIF, fontSize: 15.5, italic: true, color: C.INK, align: 'center', margin: 0, valign: 'mid' });
  addCard(s, 8.34, 4.39, 4.21, 2.26, { fill: C.BRAND_SOFT, line: 'D9C0A8' });
  addEyebrow(s, 'Community CTA', 8.68, 4.72, 1.9, C.BRAND2);
  s.addText('Bring one painful workflow.\nRun it through Maestro.\nShow us where the system breaks.', { x: 8.66, y: 5.15, w: 3.54, h: 0.95, fontFace: FONT.SERIF, fontSize: 17, bold: true, color: C.INK, align: 'center', margin: 0 });
}

// 21 — Strategy on one page
{
  const s = pptx.addSlide();
  addHeader(s, '20 · Strategy on one page', 'One wedge. One loop. One open control plane.', 21, { subtitle: 'The decision summary.' });
  const blocks = [
    ['WHO FIRST', 'Power users of Claude, Codex, and Hermes already coordinating multiple sessions.'],
    ['SURFACE PAIN', 'Too many agents, terminals, projects, and partial contexts to track.'],
    ['ROOT PROBLEM', 'No shared system for owned, verifiable, reusable agentic work.'],
    ['CATEGORY', 'Agentic Product Management.'],
    ['PRODUCT', 'Tasks + agents + tools + Git + artifacts + review + memory + Collab.'],
    ['UNIQUE', 'Cross-provider freedom with disciplined process; team members as Skills++.'],
    ['MOAT', 'Accumulated workflow memory, reusable organization, and community artifacts.'],
    ['GOAL NOW', '100–1,000 retained builders. Improve hard. Publish proof.'],
    ['SEQUENCE', 'Perfect the loop → expand adapters/local models → release cloud after pull.'],
  ];
  blocks.forEach((b, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.75 + col * 3.96;
    const y = 1.82 + row * 1.55;
    const highlight = [2, 4, 7].includes(i);
    addCard(s, x, y, 3.67, 1.25, { fill: highlight ? C.DARK : C.CARD, line: highlight ? '403A30' : C.LINE, shadow: false });
    s.addText(b[0], { x: x + 0.19, y: y + 0.18, w: 3.28, h: 0.17, fontFace: FONT.MONO, fontSize: 7.6, bold: true, charSpacing: 0.9, color: highlight ? C.BRAND : C.INK3, margin: 0 });
    s.addText(b[1], { x: x + 0.19, y: y + 0.49, w: 3.25, h: 0.52, fontFace: FONT.UI, fontSize: 9.5, bold: highlight, color: highlight ? C.PAPER : C.INK2, margin: 0, valign: 'mid' });
  });
  s.addShape(pptx.ShapeType.roundRect, { x: 0.75, y: 6.57, w: 11.80, h: 0.38, rectRadius: 0.04, fill: { color: C.BRAND }, line: { color: C.BRAND, transparency: 100 } });
  s.addText('MAESTRO = THE OPEN CONTROL PLANE FOR AGENTIC PRODUCT WORK', { x: 1.05, y: 6.69, w: 11.20, h: 0.16, fontFace: FONT.MONO, fontSize: 8.9, bold: true, charSpacing: 1.2, color: C.PAPER, align: 'center', margin: 0 });
}

// 22 — Operating templates
{
  const s = pptx.addSlide();
  addHeader(s, 'Appendix A', 'Two operating templates to ship with the product.', 22, { subtitle: 'The strategy becomes valuable when it changes daily behavior.' });
  addCard(s, 0.75, 1.86, 5.76, 4.88, { fill: C.CARD });
  addStatusTag(s, 'Template 01', 1.06, 2.14, 'truth');
  s.addText('Executable task', { x: 1.06, y: 2.58, w: 3.0, h: 0.35, fontFace: FONT.SERIF, fontSize: 20, bold: true, color: C.INK, margin: 0 });
  const taskTemplate = [
    ['OUTCOME', 'What will be true?'], ['OWNER', 'One accountable actor'], ['SCOPE', 'In / out'],
    ['INPUTS', 'Read first'], ['DEPENDENCIES', 'Blocks / unblocks'], ['ISOLATION', 'Worktree / read-only'],
    ['ACCEPTANCE', 'Observable checks'], ['EVIDENCE', 'Artifact / diff / test'], ['REVIEWER', 'Independent judge'],
  ];
  taskTemplate.forEach((f, i) => {
    const y = 3.16 + i * 0.34;
    s.addText(f[0], { x: 1.08, y, w: 1.23, h: 0.16, fontFace: FONT.MONO, fontSize: 7.1, bold: true, color: i === 7 ? C.BRAND : C.INK3, margin: 0 });
    s.addText(f[1], { x: 2.43, y: y - 0.01, w: 3.45, h: 0.18, fontFace: FONT.UI, fontSize: 8.8, color: C.INK2, margin: 0 });
  });
  addCard(s, 6.78, 1.86, 5.77, 4.88, { fill: C.DARK, line: '403A30' });
  addStatusTag(s, 'Template 02', 7.10, 2.14, 'truth');
  s.addText('Review finding', { x: 7.10, y: 2.58, w: 3.0, h: 0.35, fontFace: FONT.SERIF, fontSize: 20, bold: true, color: C.PAPER, margin: 0 });
  const reviewTemplate = [
    ['WHAT', 'State the observable issue.'],
    ['WHY', 'Name the violated user need, contract, or system rule.'],
    ['FIX', 'Describe the smallest clear correction.'],
    ['PROOF', 'Define how the reviewer will verify it.'],
  ];
  reviewTemplate.forEach((f, i) => {
    const y = 3.18 + i * 0.77;
    s.addShape(pptx.ShapeType.roundRect, { x: 7.10, y, w: 4.84, h: 0.56, rectRadius: 0.05, fill: { color: C.DARK2 }, line: { color: '4E4537', width: 0.8 } });
    s.addText(f[0], { x: 7.30, y: y + 0.18, w: 0.73, h: 0.16, fontFace: FONT.MONO, fontSize: 7.4, bold: true, color: i === 3 ? '8FD0A4' : C.BRAND, margin: 0 });
    s.addText(f[1], { x: 8.13, y: y + 0.15, w: 3.55, h: 0.22, fontFace: FONT.UI, fontSize: 9.0, color: C.PAPER, margin: 0 });
  });
  s.addText('Review feedback becomes an owned improvement queue—not another conversation to remember.', { x: 7.14, y: 6.39, w: 4.75, h: 0.22, fontFace: FONT.SERIF, fontSize: 11.5, italic: true, color: 'C7C0B2', align: 'center', margin: 0 });
}

// 23 — Sources & status
{
  const s = pptx.addSlide();
  addHeader(s, 'Appendix B', 'Evidence base and claim discipline.', 23, { subtitle: 'Built, next, and later are intentionally separated throughout the deck.' });
  addCard(s, 0.75, 1.86, 5.45, 4.86, { fill: C.CARD });
  addEyebrow(s, 'Internal product evidence', 1.07, 2.18, 2.8, C.BRAND);
  const internal = [
    'README.md — desktop, CLI, browser, tasks, sessions, local-first architecture',
    'CLAUDE.md — domain entities, runtimes, team members, skills, Git',
    'docs/workflow-strategies.md — queue, tree, batch, DAG coordination',
    'docs/TEAM_MEMBERS_UNDERSTANDING.md — identities, memory, permissions, hierarchy',
    'docs/collab-design/design-spec/00-OVERVIEW.md — Collab purpose and current status',
    'docs/COLLAB_SPACE_VERIFICATION_LOG.md — deployed rules and test evidence',
    'docs/collab-design/design-spec/08-FULL-VISION-ROADMAP.md — future Collab features',
    'maestro-mobile/ + Maestro Design System - mobile/ — mobile foundation',
  ];
  addBullets(s, internal, 1.08, 2.64, 4.70, { gap: 0.42, fontSize: 8.7, color: C.INK2, dotColor: C.BRAND });
  addCard(s, 6.48, 1.86, 6.07, 2.58, { fill: C.DARK, line: '403A30' });
  addEyebrow(s, 'Current category evidence', 6.83, 2.18, 2.9, C.BRAND);
  s.addText('Anthropic · Claude Code parallel agents and agent teams', { x: 6.84, y: 2.68, w: 5.18, h: 0.24, fontFace: FONT.UI, fontSize: 10.2, bold: true, color: C.PAPER, margin: 0 });
  s.addText('code.claude.com/docs/en/agents  ·  /agent-teams', { x: 6.84, y: 2.98, w: 5.18, h: 0.19, fontFace: FONT.MONO, fontSize: 7.1, color: 'AFA798', margin: 0 });
  s.addText('OpenAI · Introducing the Codex app', { x: 6.84, y: 3.36, w: 5.18, h: 0.24, fontFace: FONT.UI, fontSize: 10.2, bold: true, color: C.PAPER, margin: 0 });
  s.addText('openai.com/index/introducing-the-codex-app/', { x: 6.84, y: 3.66, w: 5.18, h: 0.19, fontFace: FONT.MONO, fontSize: 7.1, color: 'AFA798', margin: 0 });
  s.addText('Nous Research · Hermes Agent documentation', { x: 6.84, y: 4.02, w: 5.18, h: 0.24, fontFace: FONT.UI, fontSize: 10.2, bold: true, color: C.PAPER, margin: 0 });
  addCard(s, 6.48, 4.72, 6.07, 2.00, { fill: C.BRAND_SOFT, line: 'D9C0A8' });
  addEyebrow(s, 'Status legend', 6.83, 5.03, 1.8, C.BRAND2);
  addStatusTag(s, 'Built now', 6.84, 5.47, 'built');
  s.addText('Implemented product foundation', { x: 8.18, y: 5.51, w: 3.85, h: 0.19, fontFace: FONT.UI, fontSize: 9.1, color: C.INK2, margin: 0 });
  addStatusTag(s, 'Next', 6.84, 5.87, 'next');
  s.addText('Near-term strategic priority', { x: 7.80, y: 5.91, w: 4.23, h: 0.19, fontFace: FONT.UI, fontSize: 9.1, color: C.INK2, margin: 0 });
  addStatusTag(s, 'Later', 6.84, 6.27, 'later');
  s.addText('Expansion after demonstrated pull', { x: 7.88, y: 6.31, w: 4.15, h: 0.19, fontFace: FONT.UI, fontSize: 9.1, color: C.INK2, margin: 0 });
}

async function main() {
  await prepareAssets();
  const out = path.join(OUT, 'Maestro_Strategy_Deck.pptx');
  await pptx.writeFile({ fileName: out });
  process.stdout.write(`Wrote ${out}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
