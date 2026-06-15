import { writeFileSync } from 'node:fs';

const rnd = () => Math.floor(Math.random() * 2 ** 31);
const base = (e) => ({
  angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
  strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
  frameId: null, roundness: null, seed: rnd(), version: 1, versionNonce: rnd(),
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false, ...e,
});
const estLineW = (s, fs) => s.length * fs * 0.55;

// Convert simplified MCP elements -> proper Excalidraw elements (labels -> bound text).
function convert(src) {
  const out = [];
  for (const el of src) {
    if (el.type === 'cameraUpdate' || el.type === 'delete') continue;
    if (el.type === 'text') {
      const fs = el.fontSize || 16;
      const lines = String(el.text).split('\n');
      out.push(base({
        id: el.id, type: 'text', x: el.x, y: el.y,
        width: Math.max(...lines.map((l) => estLineW(l, fs))), height: lines.length * fs * 1.25,
        strokeColor: el.strokeColor || '#1e1e1e', fontSize: fs, fontFamily: 1,
        text: el.text, textAlign: 'left', verticalAlign: 'top', containerId: null,
        originalText: el.text, lineHeight: 1.25,
      }));
      continue;
    }
    const label = el.label;
    const shape = base({
      id: el.id, type: el.type, x: el.x, y: el.y, width: el.width, height: el.height,
      strokeColor: el.strokeColor || '#1e1e1e',
      backgroundColor: el.backgroundColor || 'transparent',
      fillStyle: el.fillStyle || 'solid', strokeWidth: el.strokeWidth || 2,
      roughness: el.roughness ?? 1, opacity: el.opacity ?? 100,
      roundness: el.roundness || null,
    });
    if (el.type === 'arrow') {
      shape.points = el.points || [[0, 0], [el.width, el.height]];
      shape.lastCommittedPoint = null;
      shape.startBinding = null; shape.endBinding = null;
      shape.startArrowhead = el.startArrowhead || null;
      shape.endArrowhead = el.endArrowhead ?? 'arrow';
    }
    if (label) {
      const tid = el.id + '_t';
      shape.boundElements = [{ type: 'text', id: tid }];
      out.push(shape);
      const fs = label.fontSize || 16;
      const lines = String(label.text).split('\n');
      const tw = Math.max(...lines.map((l) => estLineW(l, fs)));
      const th = lines.length * fs * 1.25;
      const cx = el.x + (el.width || 0) / 2;
      const cy = el.y + (el.height || 0) / 2;
      out.push(base({
        id: tid, type: 'text', x: cx - tw / 2, y: cy - th / 2, width: tw, height: th,
        strokeColor: '#1e1e1e', fontSize: fs, fontFamily: 1, text: label.text,
        textAlign: 'center', verticalAlign: 'middle', containerId: el.id,
        originalText: label.text, lineHeight: 1.25,
      }));
    } else {
      out.push(shape);
    }
  }
  return out;
}

function doc(elements) {
  return JSON.stringify({
    type: 'excalidraw', version: 2, source: 'https://maestro.local',
    elements: convert(elements),
    appState: { gridSize: null, viewBackgroundColor: '#ffffff' }, files: {},
  }, null, 2);
}

import { diagrams } from './diagrams-data.mjs';
for (const d of diagrams) {
  const path = new URL(`./${d.file}`, import.meta.url).pathname;
  writeFileSync(path, doc(d.elements));
  console.log('wrote', d.file, '(' + convert(d.elements).length + ' elements)');
}
