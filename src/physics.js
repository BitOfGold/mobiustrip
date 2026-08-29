// driving physics, all in track coords. theta is the heading relative to
// straight ahead, positive drifts toward +v.

import { trackFrame, makeFrame, wrapU, U_PERIOD, W } from './track.js';

export const TOP_SPEED = 22;
export const DRAG = 1.2;
export const ACCEL = TOP_SPEED * DRAG;
export const BRAKE = 30;
export const TURN_RATE = 2.4;
export const RAIL_FRICTION = 0.6;

const frame = makeFrame();

export const BOOST_TOP = 1.42;
export const SLOW_FACTOR = 0.6;
export const CROSS_BOOST = 0.7;
export const CROSS_CD = 2.2;

export function makeRacer(u = 0, v = 0) {
  return {
    u: wrapU(u), v,
    uStart: u,
    theta: 0, speed: 0,
    uTotal: 0,
    lap: 0,
    scrape: 0,
    boostT: 0, slowT: 0,
    crossCd: 0,
  };
}

// real position along the track, comparable between racers
export const uAbs = (r) => r.uStart + r.uTotal;

// one physics tick for one racer
export function stepRacer(r, input, dt) {
  trackFrame(r.u, r.v, frame);
  const arc = Math.hypot(frame.dpdu[0], frame.dpdu[1], frame.dpdu[2]);

  if (r.boostT > 0) r.boostT -= dt;
  if (r.slowT > 0) r.slowT -= dt;

  const turn = TURN_RATE / (1 + r.speed / TOP_SPEED);
  r.theta -= input.steer * turn * dt;
  const slow = r.slowT > 0 ? SLOW_FACTOR : 1;
  r.speed += (input.throttle * slow * ACCEL - DRAG * r.speed) * dt;
  if (r.boostT > 0)
    r.speed = Math.min(r.speed + ACCEL * 1.6 * dt, TOP_SPEED * BOOST_TOP);
  if (input.brake) r.speed = Math.max(0, r.speed - BRAKE * dt);

  const du = r.speed * Math.cos(r.theta) * dt / arc;
  r.uTotal += du;
  r.u = wrapU(r.uStart + r.uTotal);
  const vPrev = r.v;
  r.v += r.speed * Math.sin(r.theta) * dt;

  // crossing the middle line gives a short boost, with a cooldown so you
  // can't farm it by wiggling
  if (r.crossCd > 0) r.crossCd -= dt;
  if (vPrev * r.v < 0 && r.crossCd <= 0) {
    r.boostT = Math.max(r.boostT, CROSS_BOOST);
    r.crossCd = CROSS_CD;
  }
  r.lap = Math.max(r.lap, Math.floor(r.uTotal / U_PERIOD));

  // side rails: hitting one at an angle costs speed and straightens you out
  r.scrape = 0;
  if (Math.abs(r.v) > W) {
    const side = Math.sign(r.v);
    r.v = side * W;
    const outward = side * Math.sin(r.theta);
    if (outward > 0) {
      r.speed *= 1 - RAIL_FRICTION * outward;
      r.theta = side > 0 ? Math.min(r.theta, 0) : Math.max(r.theta, 0);
      r.scrape = outward;
    }
  }
}
