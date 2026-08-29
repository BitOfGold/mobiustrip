// sprite sheet: one 512px canvas drawn at startup. unicorns on the top rows,
// small props on row 3, the font on rows 4-7.

export const CELL = 64, ATLAS_SIZE = 512;

export const CELL_SPARK = [2, 3], CELL_PUFF = [3, 3];
export const CELL_CRYSTAL = [4, 3], CELL_FLOWER = [5, 3];
export const CELL_STAR = [6, 3], CELL_GLOW = [7, 3];

// every string the game prints has to be spelled from these
export const GLYPHS = '0123456789ACDEFGHILNOPRSTUWY/:.MBÖ';
const glyphCells = {};
GLYPHS.split('').forEach((ch, i) => {
  glyphCells[ch] = i < 32 ? [i % 8, 4 + (i >> 3)] : [i - 32, 3];
});
export const glyphCell = (ch) => glyphCells[ch];

// tiny path language: each letter is a canvas op, coords are charCode-40
export function drawPacked(ctx, ops) {
  let i = 0;
  const val = () => ops.charCodeAt(i++) - 40;
  ctx.beginPath();
  while (i < ops.length) {
    const op = ops[i++];
    if (op === 'M') ctx.moveTo(val(), val());
    else if (op === 'L') ctx.lineTo(val(), val());
    else if (op === 'Q') ctx.quadraticCurveTo(val(), val(), val(), val());
    else if (op === 'A') { const x = val(), y = val(), r = val(); ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, 7); }
    else if (op === 'F') { ctx.fillStyle = grey(val() / 9); ctx.fill(); ctx.beginPath(); }
  }
}

const grey = (g) => `rgb(${g * 255 | 0},${g * 255 | 0},${g * 255 | 0})`;

const CRYSTAL = 'MH*L]HLHfL3HF,MH.LXHLHbL8HF0MH.LHbL8HF.AN>+F1';
const STAR4 = 'MH,QKEdHQKKHdQEK,HQEEH,F1';
const FLOWER = 'AH;1F0ATD1F0AOS1F0AAS1F0A<D1F0AHG.F,';

// draws one unicorn pose, 8 view angles times 3 run frames; only the right
// side is drawn, the shader mirrors it for the left
function drawUnicorn(ctx, yawK, gallop) {
  const phi = (yawK + 0.5) * Math.PI / 8;
  const s = Math.sin(phi);
  const c = Math.cos(phi);
  const rx = 8 + 12 * s;
  const cx = 32, cy = 36;
  const headX = cx + 16 * s, headY = cy - 11 - 2 * (1 - s);

  const leg = (x, sway, lift, shade) => {
    ctx.strokeStyle = grey(shade);
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, cy + 4);
    ctx.quadraticCurveTo(x + sway * 0.4, cy + 12, x + sway, cy + 20 - lift);
    ctx.stroke();
  };
  const sweep = [5, 0, -5][gallop] * Math.max(s, 0.25);
  const lift = [0, 3, 1][gallop];
  const xF = cx + (rx - 5) * s, xB = cx - (rx - 5) * s;
  const split = 4 * Math.abs(c);

  leg(xF + split, sweep, lift, 0.5);
  leg(xB - split, -sweep, [1, 0, 3][gallop], 0.5);

  ctx.strokeStyle = grey(0.55);
  ctx.lineWidth = 3;
  ctx.beginPath();
  const tx = cx - (rx + 1) * s;
  ctx.moveTo(tx, cy - 6);
  ctx.quadraticCurveTo(tx - 8 - 4 * (1 - s), cy - 2 + gallop, tx - 5 - 4 * (1 - s), cy + 12);
  ctx.stroke();

  ctx.fillStyle = grey(0.85);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, 9, -0.12 * s, 0, 7);
  ctx.fill();

  leg(xF - split, sweep, lift, 0.78);
  leg(xB + split, -sweep, [1, 0, 3][gallop], 0.78);

  ctx.fillStyle = grey(0.85);
  ctx.beginPath();
  ctx.moveTo(cx + (rx - 8) * s - 4, cy - 4);
  ctx.lineTo(headX - 3, headY + 2);
  ctx.lineTo(headX + 3, headY + 4);
  ctx.lineTo(cx + (rx - 8) * s + 5, cy + 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(headX, headY, 5, 0, 7);
  ctx.ellipse(headX + 4 * s + 1, headY + 2, 4, 2.6, 0.15, 0, 7);
  ctx.fill();

  ctx.strokeStyle = grey(0.5);
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(headX - 1, headY - 4);
  ctx.quadraticCurveTo(cx + (rx - 10) * s - 2, cy - 12, cx + (rx - 14) * s - 4, cy - 5);
  ctx.stroke();

  ctx.fillStyle = grey(0.98);
  ctx.beginPath();
  ctx.moveTo(headX - 2, headY - 4);
  ctx.lineTo(headX + 2, headY - 3);
  ctx.lineTo(headX + 3 * s + 1, headY - 13);
  ctx.fill();

  if (s > 0.35) {
    ctx.fillStyle = grey(0.1);
    ctx.fillRect(headX + 1, headY - 2, 2, 2);
  }
}

export function buildAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');

  const inCell = (col, row, fn) => {
    ctx.save();
    ctx.translate(col * CELL, row * CELL);
    ctx.beginPath();
    ctx.rect(0, 0, CELL, CELL);
    ctx.clip();
    fn();
    ctx.restore();
  };

  for (let g = 0; g < 3; g++)
    for (let k = 0; k < 8; k++)
      inCell(k, g, () => drawUnicorn(ctx, k, g));

  inCell(...CELL_CRYSTAL, () => drawPacked(ctx, CRYSTAL));
  inCell(...CELL_FLOWER, () => drawPacked(ctx, FLOWER));
  inCell(...CELL_STAR, () => drawPacked(ctx, STAR4));

  const radial = (col, row, stops) => inCell(col, row, () => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    for (const [t, c] of stops) g.addColorStop(t, c);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CELL, CELL);
  });
  radial(...CELL_PUFF, [[0, 'rgba(255,255,255,.9)'], [0.6, 'rgba(255,255,255,.35)'], [1, 'rgba(255,255,255,0)']]);
  radial(...CELL_GLOW, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.5)'], [1, 'rgba(255,255,255,0)']]);
  inCell(...CELL_SPARK, () => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(32, 12); ctx.lineTo(38, 26); ctx.lineTo(52, 32); ctx.lineTo(38, 38);
    ctx.lineTo(32, 52); ctx.lineTo(26, 38); ctx.lineTo(12, 32); ctx.lineTo(26, 26);
    ctx.fill();
  });

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const ch of GLYPHS) {
    const [col, row] = glyphCells[ch];
    ctx.font = `bold ${ch === 'Ö' ? 44 : 52}px monospace`;
    inCell(col, row, () => ctx.fillText(ch, 32, ch === 'Ö' ? 40 : 36));
  }

  return canvas;
}
