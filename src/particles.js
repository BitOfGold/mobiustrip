// particle pool in flat arrays, nothing allocates while the game runs.
// particles live in track coords so trails follow the surface.

import { trackFrame, makeFrame, wrapU, THICK } from './track.js';
import { hueRGB } from './math.js';
import { CELL_PUFF, CELL_SPARK, CELL_STAR } from './atlas.js';

export const MAX_PARTICLES = 2048;

const U = new Float32Array(MAX_PARTICLES), V = new Float32Array(MAX_PARTICLES);
const H = new Float32Array(MAX_PARTICLES);
const DU = new Float32Array(MAX_PARTICLES), DV = new Float32Array(MAX_PARTICLES);
const DH = new Float32Array(MAX_PARTICLES);
const LIFE = new Float32Array(MAX_PARTICLES), MAXLIFE = new Float32Array(MAX_PARTICLES);
const SIZE = new Float32Array(MAX_PARTICLES), GRAV = new Float32Array(MAX_PARTICLES);
const CR = new Float32Array(MAX_PARTICLES), CG = new Float32Array(MAX_PARTICLES);
const CB = new Float32Array(MAX_PARTICLES);
const KIND = new Uint8Array(MAX_PARTICLES);
const CELLS = [CELL_PUFF, CELL_SPARK, CELL_STAR];
const FIELDS = [U, V, H, DU, DV, DH, LIFE, MAXLIFE, SIZE, GRAV, CR, CG, CB];

let alive = 0;

// seeded random so replays look the same
let rngState = 1235;
function rnd() {
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function spawn(kind, u, v, h, du, dv, dh, life, size, r, g, b, grav) {
  if (alive >= MAX_PARTICLES) return;
  const i = alive++;
  KIND[i] = kind;
  U[i] = u; V[i] = v; H[i] = h;
  DU[i] = du; DV[i] = dv; DH[i] = dh;
  LIFE[i] = MAXLIFE[i] = life;
  SIZE[i] = size; GRAV[i] = grav;
  CR[i] = r; CG[i] = g; CB[i] = b;
}

const col = [0, 0, 0];
const RED = [1, 0.25, 0.2];

// rainbow exhaust puff behind a racer, red when they got slowed
export function emitFart(racer, hue, red) {
  const [r, g, b] = red ? RED : hueRGB(hue, col);
  spawn(0, racer.u - 0.02, racer.v + (rnd() - 0.5) * 0.3, 0.08 + rnd() * 0.1,
    -0.008 - rnd() * 0.008, (rnd() - 0.5) * 0.3, 0.1 + rnd() * 0.15,
    0.7 + rnd() * 0.4, 0.6 + rnd() * 0.36, r, g, b, 0);
}

// sparks off the rail when grinding it
export function emitSpark(racer, intensity) {
  const inward = -Math.sign(racer.v);
  spawn(1, racer.u, racer.v, 0.15,
    (rnd() - 0.2) * 0.04, inward * (0.5 + rnd() * 2), 1.5 + rnd() * 3 * intensity,
    0.25 + rnd() * 0.2, 0.15 + rnd() * 0.12,
    1, 0.75 + rnd() * 0.25, 0.3 + rnd() * 0.3, 25);
}

// winner confetti
export function emitConfetti(u, v) {
  const [r, g, b] = hueRGB(rnd(), col);
  spawn(2, u + (rnd() - 0.5) * 0.12, v + (rnd() - 0.5) * 3, 2.2 + rnd() * 1.2,
    0, (rnd() - 0.5) * 0.8, 0.3,
    2 + rnd(), 0.14 + rnd() * 0.1, r, g, b, 4);
}

// move everything, dead slots get the last live particle swapped in
export function updateParticles(dt) {
  for (let i = 0; i < alive; i++) {
    LIFE[i] -= dt;
    DH[i] -= GRAV[i] * dt;
    U[i] += DU[i] * dt;
    V[i] += DV[i] * dt;
    H[i] += DH[i] * dt;
    if (LIFE[i] <= 0 || (KIND[i] !== 0 && H[i] <= 0)) {
      alive--;
      for (const A of FIELDS) A[i] = A[alive];
      KIND[i] = KIND[alive];
      i--;
    }
  }
}

const pf = makeFrame();

export function renderParticles(batch) {
  for (let i = 0; i < alive; i++) {
    trackFrame(wrapU(U[i]), V[i], pf);
    const fade = LIFE[i] / MAXLIFE[i];
    const grow = KIND[i] === 0 ? 2 - fade : 1;
    const size = SIZE[i] * grow;
    batch.sprite(
      pf.p[0] + pf.n[0] * (THICK + H[i]), pf.p[1] + pf.n[1] * (THICK + H[i]),
      pf.p[2] + pf.n[2] * (THICK + H[i]),
      size, size, CELLS[KIND[i]],
      CR[i], CG[i], CB[i], Math.min(1, fade * 1.6),
      pf.n[0], pf.n[1], pf.n[2]);
  }
}
