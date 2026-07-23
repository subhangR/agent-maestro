const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const dir = path.join(__dirname, 'render');
  const files = fs.readdirSync(dir).filter((f) => /^slide-\d+\.png$/.test(f)).sort();
  const cols = 4;
  const tileW = 520;
  const tileH = 293;
  const gap = 18;
  const labelH = 28;
  const rows = Math.ceil(files.length / cols);
  const width = cols * tileW + (cols + 1) * gap;
  const height = rows * (tileH + labelH) + (rows + 1) * gap;
  const composite = [];

  for (let i = 0; i < files.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = gap + col * (tileW + gap);
    const top = gap + row * (tileH + labelH + gap);
    const img = await sharp(path.join(dir, files[i])).resize(tileW, tileH, { fit: 'fill' }).png().toBuffer();
    const label = Buffer.from(`<svg width="${tileW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#23201B"/><text x="12" y="19" font-family="DejaVu Sans Mono" font-size="13" font-weight="700" fill="#F4F2EC">SLIDE ${String(i + 1).padStart(2, '0')}</text></svg>`);
    composite.push({ input: img, left, top });
    composite.push({ input: label, left, top: top + tileH });
  }

  await sharp({ create: { width, height, channels: 4, background: '#D8D3C6' } })
    .composite(composite)
    .png()
    .toFile(path.join(__dirname, 'Maestro_Strategy_Deck_contact_sheet.png'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
