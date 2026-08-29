// hud text drawn as glyph sprites floating in front of the camera.
// x and y are -1..1 screen coords, size is the glyph height.

import { glyphCell } from './atlas.js';
import { camState } from './camera.js';
import { hueRGB } from './math.js';

const rbCol = [0, 0, 0];

const HUD_DIST = 2;
const ADVANCE = 0.62;

let tanX = 1, tanY = 1, shift = 0, batch = null;

// call once per frame before any drawText
export function hudBegin(spriteBatch, fovY, aspect, projShift) {
  batch = spriteBatch;
  tanY = Math.tan(fovY / 2);
  tanX = tanY * aspect;
  shift = projShift;
}

// biggest size that still fits the string in ndcW of screen width
export const fitSize = (str, base, ndcW) =>
  Math.min(base, ndcW * tanX / tanY / ((str.length - 1) * ADVANCE));

// half the on-screen width of a string, for hugging screen edges
export const textHalfW = (str, size) =>
  ((str.length - 1) * ADVANCE + 1) * size / 2 * tanY / tanX;

// draws str centred on x. rainbow cycles the colours, wave bobs the letters,
// and every string gets a drop shadow drawn slightly behind itself
export function drawText(str, x, y, size, r, g, b, a = 1, rainbow = 0, wave = 0, dist = HUD_DIST) {
  if (dist === HUD_DIST)
    drawText(str, x + size * 0.04, y - size * 0.05, size, 0, 0, 0, a * 0.4, 0, wave, dist + 0.2);
  const { eye, right, up, fwd } = camState;
  const worldSize = size * tanY * dist;
  const adv = worldSize * ADVANCE;
  let wx = (x * tanX * dist) - (str.length - 1) * adv / 2;
  const wy = (y + shift) * tanY * dist;
  let i = 0;
  for (const ch of str) {
    const cell = glyphCell(ch);
    if (cell) {
      if (rainbow) [r, g, b] = hueRGB(i / str.length + rainbow, rbCol, 0.62, 0.38);
      const gy = wy + (wave ? Math.sin(wave + i * 0.8) * worldSize * 0.1 : 0);
      batch.sprite(
        eye[0] + fwd[0] * dist + right[0] * wx + up[0] * gy,
        eye[1] + fwd[1] * dist + right[1] * wx + up[1] * gy,
        eye[2] + fwd[2] * dist + right[2] * wx + up[2] * gy,
        worldSize, worldSize, cell, r, g, b, a,
        up[0], up[1], up[2]);
    }
    wx += adv;
    i++;
  }
}

export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const tenths = Math.floor(t * 10 % 10);
  return `${m}:${s < 10 ? '0' : ''}${s}.${tenths}`;
}

export const ordinal = (pos) => pos + (['ST', 'ND', 'RD'][pos - 1] ?? 'TH');
