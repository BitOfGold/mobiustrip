// entry point. DEBUG is set by the build (true in dev, false in the ship
// build) and everything behind it gets stripped from the release.

import { mat4Perspective, mat4Mul, dot, hueRGB } from './math.js';
import { trackFrame, makeFrame, wrapU, THICK, W, U_PERIOD } from './track.js';
import { initRibbon } from './render.js';
import { initSky } from './sky.js';
import { buildAtlas, CELL_CRYSTAL, CELL_FLOWER, CELL_STAR, CELL_GLOW } from './atlas.js';
import { initBillboards } from './billboards.js';
import { emitFart, emitSpark, emitConfetti, updateParticles, renderParticles } from './particles.js';
import { makeFreeCam, makeChaseCam, viewFromEyeTarget, camState } from './camera.js';
import { makeInput, MOBILE } from './input.js';
import { makeRace, stepRace, updpositions, RACER_COUNT, LAPS, TINTS } from './race.js';
import { hudBegin, drawText, fitSize, textHalfW, fmtTime, ordinal } from './hud.js';
import { unlockAudio, fartSound, chime, speedup, screech, beep, fanfare, musicTick, setMusic, engine } from './audio.js';

const PHYS_STEP = 1 / 120;
const FOV = 1.1;
const PROJ_SHIFT = 0.3;
const COUNTDOWN = 3.2;

const canvas = document.getElementById('c');
const gl = canvas.getContext('webgl2');

if (!gl) {
  document.body.textContent = 'WebGL2 required';
  throw new Error('no webgl2');
}

// render at half resolution and let css scale it up, looks chunkier and
// runs faster
function resize() {
  canvas.width = innerWidth / 2 | 0;
  canvas.height = innerHeight / 2 | 0;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
onresize = resize;
resize();

gl.enable(gl.DEPTH_TEST);

const ribbon = initRibbon(gl);
const sky = initSky(gl);
const sprites = initBillboards(gl, buildAtlas());
const cam = DEBUG ? makeFreeCam(canvas) : null;
const chase = makeChaseCam();
const input = makeInput();

const INTRO_LEN = 2.6;
const INTRO_SPAN = 1.1;
let mode = 'title';
let race = null, player = null;
let introT = 0, countT = 0, goFlash = 0, prevCount = 0;
let playerPos = RACER_COUNT;
const prevBoost = new Float32Array(RACER_COUNT);
let prevSlow = 0, screechCd = 0;

function startRace(difficulty) {
  race = makeRace(difficulty);
  player = race.racers[0];
  mode = 'intro';
  introT = 0;
  setMusic(true);
}

// any key or tap: unlock audio, pick a menu row, skip the intro, or restart
function gesture(pick, restart) {
  unlockAudio();
  if (mode === 'title') {
    if (pick !== undefined) startRace(pick);
  } else if (mode === 'intro') {
    mode = 'count'; countT = 0; chase.reset(player);
  } else if (mode === 'results' && restart) {
    location.reload();
  }
}

addEventListener('keydown', (e) =>
  gesture({ Digit1: 0, Digit2: 1, Digit3: 2 }[e.code], e.code === 'KeyR'));

addEventListener('pointerdown', (e) => {
  const x = e.clientX / innerWidth * 2 - 1;
  const y = 1 - e.clientY / innerHeight * 2;
  gesture(Math.abs(x) < 0.85 && y < -0.16 && y > -0.6
    ? Math.max(0, Math.min(2, Math.round((-0.24 - y) / 0.14))) : undefined, true);
});

// decorations floating just off the rails
const DECOS = [];
{
  const cells = [CELL_CRYSTAL, CELL_FLOWER, CELL_STAR];
  for (let i = 0; i < 56; i++) {
    const u = i / 56 * U_PERIOD + Math.sin(i * 13.7) * 0.1;
    const kind = i % 3;
    const [r, g, b] = kind === 2 ? [1, 0.95, 0.62]
      : kind === 1 ? hueRGB((i * 0.37) % 1, [], 0.55, 0.45)
      : hueRGB(i * 0.13, [], 0.8, 0.18);
    DECOS.push({
      u,
      v: (i % 2 ? 1 : -1) * (W + 0.7 + Math.sin(i * 7.3) * 0.25),
      cell: cells[kind],
      size: 0.55 + 0.3 * Math.abs(Math.sin(i * 3.1)),
      r, g, b,
    });
  }
}

const proj = new Float32Array(16);
const view = new Float32Array(16);
const viewProj = new Float32Array(16);
const sFrame = makeFrame();
const sVec = [0, 0, 0], sFwd = [0, 0, 0];
const UNICORN_CELL = [0, 0];

// sprite standing on the last sFrame point, lifted off the surface
function lifted(lift, sx, sy, cell, r, g, b, a) {
  sprites.sprite(
    sFrame.p[0] + sFrame.n[0] * lift, sFrame.p[1] + sFrame.n[1] * lift,
    sFrame.p[2] + sFrame.n[2] * lift,
    sx, sy, cell, r, g, b, a, sFrame.n[0], sFrame.n[1], sFrame.n[2]);
}

function put(u, v, lift, sx, sy, cell, r, g, b, a) {
  trackFrame(u, v, sFrame);
  lifted(lift, sx, sy, cell, r, g, b, a);
}

let freeCamOn = false;
if (DEBUG) {
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyC') freeCamOn = !freeCamOn;
  });
}

let readout = null;
if (DEBUG) {
  readout = document.createElement('div');
  readout.style.cssText =
    'position:fixed;top:8px;left:8px;color:#fff;font:12px monospace;white-space:pre;text-shadow:0 0 3px #000';
  document.body.appendChild(readout);
}

// picks which unicorn view to draw from the angle between the racer's
// heading and the camera; leaves the racer's frame in sFrame
function racerSprite(r) {
  trackFrame(r.u, r.v, sFrame);
  const arc = Math.hypot(sFrame.dpdu[0], sFrame.dpdu[1], sFrame.dpdu[2]);
  const ct = Math.cos(r.theta), st = Math.sin(r.theta);
  for (let i = 0; i < 3; i++) {
    sFwd[i] = sFrame.dpdu[i] / arc * ct + sFrame.d[i] * st;
    sVec[i] = sFrame.p[i] - camState.eye[i];
  }
  const k = dot(sVec, sFrame.n);
  for (let i = 0; i < 3; i++) sVec[i] -= k * sFrame.n[i];
  const fx = dot(sVec, sFwd);
  const cxv =
    (sFwd[1] * sVec[2] - sFwd[2] * sVec[1]) * sFrame.n[0] +
    (sFwd[2] * sVec[0] - sFwd[0] * sVec[2]) * sFrame.n[1] +
    (sFwd[0] * sVec[1] - sFwd[1] * sVec[0]) * sFrame.n[2];
  const ang = Math.atan2(cxv, fx);
  const biased = Math.min(Math.PI, Math.abs(ang) * 2.4);
  UNICORN_CELL[0] = Math.min(7, Math.floor(biased / (Math.PI / 8)));
  UNICORN_CELL[1] = Math.floor(r.uTotal * 24 / 1.6) % 3;
  return ang < 0 ? -1 : 1;
}

const iEye = [0, 0, 0];
function markTarget() {
  sVec[0] = sFrame.p[0]; sVec[1] = sFrame.p[1]; sVec[2] = sFrame.p[2];
}
function eyeLift(lift) {
  for (let i = 0; i < 3; i++) iEye[i] = sFrame.p[i] + sFrame.n[i] * lift;
  return iEye;
}

// intro camera swoops down from ahead of the player back to the chase spot
function introView(out, t) {
  const s = Math.min(1, t / INTRO_LEN);
  const ease = s * s * (3 - 2 * s);
  trackFrame(player.u, player.v, sFrame);
  markTarget();
  trackFrame(wrapU(player.u + INTRO_SPAN * (1 - ease) - 0.15 * ease), 0, sFrame);
  viewFromEyeTarget(out, eyeLift(THICK + 3.4 - 2.4 * ease), sVec, sFrame.n);
}

// title screen camera just drifts along the track
function titleView(out) {
  const tu = timeS * 0.07;
  trackFrame(wrapU(tu + 0.7), 0, sFrame);
  markTarget();
  trackFrame(wrapU(tu), 0, sFrame);
  viewFromEyeTarget(out, eyeLift(2.4), sVec, sFrame.n);
}

// results camera circles the player
let orbitA = 0;
function orbitView(out, dt) {
  orbitA += dt * 0.5;
  trackFrame(player.u, player.v, sFrame);
  const arc = Math.hypot(sFrame.dpdu[0], sFrame.dpdu[1], sFrame.dpdu[2]);
  const ca = Math.cos(orbitA), sa = Math.sin(orbitA);
  for (let i = 0; i < 3; i++) {
    const t = sFrame.dpdu[i] / arc;
    iEye[i] = sFrame.p[i] + sFrame.n[i] * 1.7 + (t * ca + sFrame.d[i] * sa) * 3.6;
    sVec[i] = sFrame.p[i] + sFrame.n[i] * 0.8;
  }
  viewFromEyeTarget(out, iEye, sVec, sFrame.n);
}

const fartAcc = new Float32Array(RACER_COUNT);
let confettiAcc = 0;
let lastT = 0, acc = 0, timeS = 0;
function frame(t) {
  const dt = Math.min((t - lastT) / 1000, 0.1);
  lastT = t;
  timeS += dt;

  const inp = input.read();
  const racing = mode === 'race' || mode === 'results';
  if (mode === 'count') {
    countT += dt;
    const n = Math.ceil(COUNTDOWN - countT - 0.2);
    if (n !== prevCount && n >= 1 && n <= 3) beep(false);
    prevCount = n;
    if (countT >= COUNTDOWN) { mode = 'race'; goFlash = 0.9; beep(true); }
  }
  if (racing || mode === 'count') {
    acc += dt;
    while (acc >= PHYS_STEP) {
      stepRace(race, mode === 'results' ? null : inp, PHYS_STEP, racing);
      acc -= PHYS_STEP;

      for (let i = 0; i < RACER_COUNT; i++) {
        const r = race.racers[i];
        const boosting = r.boostT > 0, slowed = r.slowT > 0;
        if ((boosting || slowed) && r.speed > 2) {
          fartAcc[i] += PHYS_STEP * (10 + r.speed);
          while (fartAcc[i] >= 1) {
            fartAcc[i] -= 1;
            emitFart(r, (i / RACER_COUNT + r.uTotal * 2) % 1, !boosting);
          }
        }
        if (r.scrape > 0.02) emitSpark(r, Math.min(r.scrape * 3, 1));
      }
    }
    playerPos = updpositions(race);
    if (mode === 'race' && player.finishTime) { mode = 'results'; orbitA = 0; fanfare(); }

    // sound cues, triggered when boost/slow timers jump up
    for (let i = 0; i < RACER_COUNT; i++) {
      const r = race.racers[i];
      if (r.boostT - prevBoost[i] > 0.3) {
        let gap = Math.abs(wrapU(r.u - player.u));
        gap = Math.min(gap, U_PERIOD - gap) * 24;
        fartSound(0.72 + i * 0.09, i === 0 ? 0.5 : 0.45 * Math.max(0, 1 - gap / 45));
        if (i === 0) (r.boostT > 1.5 ? chime(true) : speedup());
      }
      prevBoost[i] = r.boostT;
    }
    if (player.slowT > prevSlow + 0.3) chime(false);
    prevSlow = player.slowT;
    screechCd -= dt;
    if (player.scrape > 0.02 && screechCd <= 0) { screech(); screechCd = 0.09; }
  }
  engine(player ? player.speed : 0, player ? player.boostT > 0 : false);
  musicTick(dt);
  updateParticles(dt);

  if (mode === 'results' && playerPos === 1) {
    confettiAcc += dt * 30;
    while (confettiAcc >= 1) { confettiAcc -= 1; emitConfetti(player.u, player.v); }
  }

  let fov = 1.15;
  if (DEBUG && freeCamOn) {
    cam.update(dt);
    cam.view(view);
    fov = FOV;
  } else if (mode === 'title') {
    titleView(view);
  } else if (mode === 'intro') {
    introT += dt;
    introView(view, introT);
    if (introT >= INTRO_LEN) { mode = 'count'; countT = 0; chase.reset(player); }
  } else if (mode === 'results') {
    orbitView(view, dt);
    fov = 1.05;
  } else {
    chase.update(view, player, dt);
    fov = chase.fov;
  }
  mat4Perspective(proj, fov, canvas.width / canvas.height, 0.1, 200, PROJ_SHIFT);
  mat4Mul(viewProj, proj, view);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  sky.draw(camState.right, camState.up, camState.fwd, fov, canvas.width / canvas.height, PROJ_SHIFT);
  ribbon.draw(viewProj);

  sprites.begin(camState.eye);

  if (race) {
    for (let i = 0; i < RACER_COUNT; i++) {
      const r = race.racers[i];
      const tint = TINTS[i];
      const mirror = racerSprite(r);
      lifted(THICK, mirror * 1.3, 1.3, UNICORN_CELL, tint[0], tint[1], tint[2], 1);
    }

    for (const c of race.crystals) {
      if (c.t > 0) continue;
      const pulse = 1.5 + 0.24 * Math.sin(timeS * 5 + c.u * 3);
      put(c.u, c.v, 0.25, pulse, pulse, CELL_CRYSTAL,
        c.good ? 0.35 : 1, c.good ? 1 : 0.3, c.good ? 0.5 : 0.35, 1);
    }
  }

  for (const d of DECOS)
    put(d.u, d.v, 0, d.size, d.size, d.cell, d.r, d.g, d.b, 1);

  // glowing dots along both rails
  for (let i = 0; i * 0.16 < U_PERIOD; i++) {
    const px = i & 1;
    put(i * 0.16, W - 0.08, THICK, 0.34, 0.34, CELL_GLOW, 1, px ? 0.55 : 1, px ? 0.85 : 1, 1);
    put(i * 0.16, -(W - 0.08), THICK, 0.34, 0.34, CELL_GLOW, 1, px ? 0.55 : 1, px ? 0.85 : 1, 1);
  }

  renderParticles(sprites);

  hudBegin(sprites, fov, canvas.width / canvas.height, PROJ_SHIFT);
  if (mode === 'title') {
    const rb = timeS * 0.25, wave = timeS * 3;
    if (MOBILE) {
      const ts = fitSize('MÖBIUS', 0.34, 1.7);
      drawText('MÖBIUS', 0, 0.36 + ts * 0.58, ts, 1, 1, 1, 1, rb, wave);
      drawText('TRIP', 0, 0.36 - ts * 0.58, ts, 1, 1, 1, 1, rb + 0.55, wave + 5.6);
    } else {
      drawText('MÖBIUS TRIP', 0, 0.33, 0.34, 1, 1, 1, 1, rb, wave);
    }
    drawText('A RACE ON A STRIP WITH ONE SIDE', 0, MOBILE ? 0.05 : 0.18,
      fitSize('A RACE ON A STRIP WITH ONE SIDE', 0.05, 1.8), 0.8, 0.85, 1, 0.9);
    drawText('CHOOSE OPPONENTS:', 0, -0.1, 0.06, 1, 1, 1, 0.9);
    drawText('1 FOAL', 0, -0.24, 0.08, 0.6, 1, 0.7);
    drawText('2 STALLION', 0, -0.38, 0.08, 1, 0.9, 0.5);
    drawText('3 ALICORN', 0, -0.52, 0.08, 1, 0.6, 0.7);
  }
  if (mode === 'count') {
    const n = Math.ceil(COUNTDOWN - countT - 0.2);
    if (n >= 1 && n <= 3) drawText(String(n), 0, 0.05, 0.3, 1, 0.9, 0.3);
  }
  if (goFlash > 0) {
    goFlash -= dt;
    drawText('GO', 0, 0.05, 0.34, 0.5, 1, 0.5);
  }
  if (racing) {
    const lap = `LAP ${Math.min(player.lap + 1, LAPS)}/${LAPS}`;
    const pos = ordinal(playerPos);
    if (MOBILE) {
      drawText(lap, -0.93 + textHalfW(lap, 0.09), 0.62, 0.09, 1, 1, 1);
      drawText(pos, 0.93 - textHalfW(pos, 0.12), 0.62, 0.12, 1, 0.85, 0.4);
    } else {
      drawText(lap, -0.72, 0.78, 0.09, 1, 1, 1);
      drawText(pos, 0.74, 0.78, 0.12, 1, 0.85, 0.4);
    }
    drawText(fmtTime(race.time), 0, 0.84, 0.07, 1, 1, 1, 0.9);
  }
  if (mode === 'results') {
    drawText(playerPos === 1 ? 'YOU WIN' : 'FINISH', 0, 0.32, 0.2,
      1, playerPos === 1 ? 0.9 : 1, playerPos === 1 ? 0.3 : 1);
    drawText(ordinal(playerPos), 0, 0.1, 0.26, 1, 0.85, 0.4);
    drawText(fmtTime(player.finishTime), 0, -0.08, 0.09, 1, 1, 1);
    drawText('R OR TAP TO RESTART', 0, -0.5, 0.07, 0.8, 0.9, 1, 0.5 + 0.5 * Math.sin(timeS * 4));
  }

  sprites.flush(viewProj);

  if (DEBUG && player) {
    readout.textContent =
      `u=${player.u.toFixed(2)} v=${player.v.toFixed(2)} ` +
      `θ=${player.theta.toFixed(2)}\nspeed=${player.speed.toFixed(1)} lap=${player.lap} pos=${playerPos}` +
      (player.scrape > 0 ? ' SCRAPE' : '');
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (DEBUG) console.log('MÖBIUS TRIP: arrows/WASD=drive R/click=restart | C=free cam');
