// computer drivers. no waypoints, the racing line is just a formula, plus
// per-driver wobble, reaction lag, and rubber banding toward the player.

import { W } from './track.js';
import { uAbs } from './physics.js';

export const DIFFICULTIES = [
  { lineErr: 0.9, react: 0.4, top: 0.86, rubber: 0.6 },
  { lineErr: 0.45, react: 0.22, top: 0.95, rubber: 0.3 },
  { lineErr: 0.18, react: 0.09, top: 1.04, rubber: 0 },
];

const LINE_MARGIN = 0.7;
const OVERTAKE_R = 1.6;

// hug whichever edge is shorter right now
export function raceLine(u) {
  return -Math.tanh(2.2 * Math.cos(u / 2)) * (W - LINE_MARGIN);
}

export function makeAI(index, difficulty) {
  const d = DIFFICULTIES[difficulty];
  return {
    d,
    phase: index * 2.39996,
    vtLag: 0,
  };
}

// fills inp with steering and throttle for one ai racer
export function aiControl(ai, self, racers, inp, dt) {
  let vt = raceLine(self.u)
    + ai.d.lineErr * (Math.sin(self.u * 1.7 + ai.phase)
                    + 0.6 * Math.sin(self.u * 3.1 + 2 * ai.phase));

  for (const other of racers) {
    if (other === self) continue;
    const ahead = uAbs(other) - uAbs(self);
    if (ahead > 0 && ahead * 24 < OVERTAKE_R && Math.abs(other.v - self.v) < 1.1)
      vt += self.v >= other.v ? 0.9 : -0.9;
  }
  vt = Math.max(-(W - 0.4), Math.min(W - 0.4, vt));

  ai.vtLag += (vt - ai.vtLag) * Math.min(1, dt / ai.d.react);

  const want = Math.max(-0.55, Math.min(0.55, (ai.vtLag - self.v) * 0.5));
  inp.steer = Math.max(-1, Math.min(1, (self.theta - want) * 6));

  const gap = uAbs(racers[0]) - uAbs(self);
  inp.throttle = ai.d.top * (1 + ai.d.rubber * Math.max(-0.35, Math.min(0.45, gap * 0.5)));
  inp.brake = false;
  return inp;
}
