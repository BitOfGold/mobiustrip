// cameras. the chase cam springs along in track coords and only converts to
// world at the end — doing it in world coords makes the roll pop at the twist.

import { mat4View, cross, normalize } from './math.js';
import { trackFrame, makeFrame, wrapU, THICK } from './track.js';
import { TOP_SPEED, uAbs } from './physics.js';

const CAM_BACK = 3.6;
const CAM_UP = 1.3;
const LOOK_AHEAD = 4;
const OMEGA = 13;
const UP_LAG = 0.06;
const ROLL_MAX = 4;
const SHAKE_F = [6.0, 7.9, 5.3, 43, 56, 74, 24, 31, 19];

// whichever camera ran last leaves its basis here for the sky and sprites
export const camState = {
  eye: [0, 0, 0], right: [0, 0, 0], up: [0, 0, 0], fwd: [0, 0, 0],
};

const vf = makeFrame();
const pf = makeFrame();
const lf = makeFrame();
const vTgt = [0, 0, 0];

// builds the view matrix and camState from eye, target and a rough up
export function viewFromEyeTarget(out, eye, target, upHint) {
  const { right, up, fwd } = camState;
  for (let i = 0; i < 3; i++) {
    camState.eye[i] = eye[i];
    fwd[i] = target[i] - eye[i];
  }
  normalize(fwd, fwd);
  normalize(right, cross(right, fwd, upHint));
  cross(up, right, fwd);
  return mat4View(out, camState.eye, right, up, fwd);
}

export function makeChaseCam() {
  const c = {
    u: 0, v: 0, h: CAM_UP,
    vu: 0, vv: 0, vh: 0,
    upLag: [0, 1, 0],
    fov: 1.1,
    _shake: 0,
  };

  // snap behind the player, e.g. at race start
  c.reset = (player) => {
    trackFrame(player.u, player.v, pf);
    const arc = Math.hypot(pf.dpdu[0], pf.dpdu[1], pf.dpdu[2]);
    c.u = uAbs(player) - CAM_BACK / arc;
    c.v = player.v;
    c.h = CAM_UP;
    c.vu = c.vv = c.vh = 0;
    trackFrame(wrapU(c.u), c.v, vf);
    c.upLag[0] = vf.n[0]; c.upLag[1] = vf.n[1]; c.upLag[2] = vf.n[2];
  };

  c.update = (out, player, dt) => {
    trackFrame(player.u, player.v, pf);
    const arc = Math.hypot(pf.dpdu[0], pf.dpdu[1], pf.dpdu[2]);

    // when the road ahead drops away over a hilltop, raise the camera so
    // you can still see down the far side
    trackFrame(wrapU(uAbs(player) + LOOK_AHEAD / arc), player.v * 0.5, lf);
    const drop = (lf.p[0] - pf.p[0]) * pf.n[0] + (lf.p[1] - pf.p[1]) * pf.n[1]
               + (lf.p[2] - pf.p[2]) * pf.n[2];
    const crestLift = Math.min(4, 1.5 * Math.max(0, -drop));

    const spring = (x, vel, target) => {
      const a = OMEGA * OMEGA * (target - x) - 2 * OMEGA * vel;
      return vel + a * dt;
    };
    c.vu = spring(c.u, c.vu, uAbs(player) - CAM_BACK / arc);
    c.vv = spring(c.v, c.vv, player.v);
    c.vh = spring(c.h, c.vh, CAM_UP + crestLift);
    c.u += c.vu * dt;
    c.v += c.vv * dt;
    c.h += c.vh * dt;

    const fovTarget = 1.04 + 0.16 * (player.speed / TOP_SPEED) ** 1.5
      + (player.boostT > 0 ? 0.1 : 0);
    c.fov += (fovTarget - c.fov) * Math.min(1, dt * 6);

    trackFrame(wrapU(c.u), c.v, vf);
    const dotUp = Math.max(-1, Math.min(1,
      c.upLag[0] * vf.n[0] + c.upLag[1] * vf.n[1] + c.upLag[2] * vf.n[2]));
    const ang = Math.acos(dotUp);
    if (ang > 1e-5) {
      const step = Math.min(ang * Math.min(1, dt / UP_LAG), ROLL_MAX * dt);
      const sA = Math.sin(ang);
      const w1 = Math.sin(ang - step) / sA, w2 = Math.sin(step) / sA;
      for (let i = 0; i < 3; i++) c.upLag[i] = c.upLag[i] * w1 + vf.n[i] * w2;
      normalize(c.upLag, c.upLag);
    }
    for (let i = 0; i < 3; i++)
      vTgt[i] = lf.p[i] + lf.n[i] * 0.8;
    for (let i = 0; i < 3; i++) vf.p[i] += vf.n[i] * (THICK + c.h);
    // shake: slow sway that grows with speed, a buzz on boost, a judder
    // when slowed
    c._shake += dt;
    const sway = Math.min(0.16, 0.12 * (player.speed / TOP_SPEED) ** 3);
    for (let k = 0; k < 9; k++) {
      const amp = k < 3 ? sway
        : k < 6 ? (player.boostT > 0 ? 0.045 : 0)
        : (player.slowT > 0 ? 0.08 : 0);
      vf.p[k % 3] += Math.sin(c._shake * SHAKE_F[k]) * amp;
    }
    return viewFromEyeTarget(out, vf.p, vTgt, c.upLag);
  };

  return c;
}

// debug fly camera, drag to look and wasd to move
export function makeFreeCam(canvas) {
  const cam = {
    eye: [0, 16, 48],
    yaw: 0,
    pitch: -0.32,
    speed: 14,
    _keys: new Set(),
    _right: [0, 0, 0], _up: [0, 0, 0], _fwd: [0, 0, 0],
  };

  let dragging = false;
  canvas.addEventListener('mousedown', () => { dragging = true; });
  addEventListener('mouseup', () => { dragging = false; });
  addEventListener('mousemove', (e) => {
    if (!dragging) return;
    cam.yaw += e.movementX * 0.005;
    cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch - e.movementY * 0.005));
  });
  addEventListener('wheel', (e) => {
    cam.speed *= Math.pow(1.1, -Math.sign(e.deltaY));
  });
  addEventListener('keydown', (e) => cam._keys.add(e.code));
  addEventListener('keyup', (e) => cam._keys.delete(e.code));

  cam.update = (dt) => {
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    cam._fwd[0] = cp * sy; cam._fwd[1] = sp; cam._fwd[2] = -cp * cy;
    cam._right[0] = cy; cam._right[1] = 0; cam._right[2] = sy;
    cam._up[0] = cam._right[1] * cam._fwd[2] - cam._right[2] * cam._fwd[1];
    cam._up[1] = cam._right[2] * cam._fwd[0] - cam._right[0] * cam._fwd[2];
    cam._up[2] = cam._right[0] * cam._fwd[1] - cam._right[1] * cam._fwd[0];

    const k = cam._keys;
    const step = cam.speed * (k.has('ShiftLeft') || k.has('ShiftRight') ? 4 : 1) * dt;
    const move = (vec, sign) => {
      cam.eye[0] += vec[0] * sign * step;
      cam.eye[1] += vec[1] * sign * step;
      cam.eye[2] += vec[2] * sign * step;
    };
    if (k.has('KeyW')) move(cam._fwd, 1);
    if (k.has('KeyS')) move(cam._fwd, -1);
    if (k.has('KeyD')) move(cam._right, 1);
    if (k.has('KeyA')) move(cam._right, -1);
    if (k.has('KeyE')) cam.eye[1] += step;
    if (k.has('KeyQ')) cam.eye[1] -= step;
  };

  cam.view = (out) => {
    for (let i = 0; i < 3; i++) {
      camState.eye[i] = cam.eye[i];
      camState.right[i] = cam._right[i];
      camState.up[i] = cam._up[i];
      camState.fwd[i] = cam._fwd[i];
    }
    return mat4View(out, cam.eye, cam._right, cam._up, cam._fwd);
  };

  return cam;
}
