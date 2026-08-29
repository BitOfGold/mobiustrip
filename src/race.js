// runs the whole race: the field, crystals, collisions and standings.
// no dom or gl in here so the tests can simulate races headless.

import { wrapU, U_PERIOD, W } from './track.js';
import { hueRGB } from './math.js';
import { makeRacer, stepRacer, uAbs } from './physics.js';
import { makeAI, aiControl } from './ai.js';

export const RACER_COUNT = 8;
export const LAPS = 3;

export const TINTS = [[1, 0.97, 0.9]];
for (let i = 1; i < RACER_COUNT; i++) TINTS.push(hueRGB(i / 7, [], 0.75, 0.25));

export const CRYSTAL_COUNT = 26;
const CRYSTAL_RESPAWN = 5;
export const BOOST_TIME = 2.2, SLOW_TIME = 1.8;

// set up the grid, the ai drivers and the crystal spots
export function makeRace(difficulty) {
  const racers = [];
  const ais = [];
  for (let i = 0; i < RACER_COUNT; i++) {
    const slot = i === 0 ? RACER_COUNT - 1 : i - 1;
    const row = slot >> 1;
    const r = makeRacer(-0.28 - row * 0.24, (slot & 1 ? 1 : -1) * 1.15);
    r.finishTime = 0;
    racers.push(r);
    ais.push(i === 0 ? null : makeAI(i, difficulty));
  }
  const crystals = [];
  for (let i = 0; i < CRYSTAL_COUNT; i++) {
    const h1 = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    const h2 = Math.sin(i * 269.5 + 183.3) * 28001.8384;
    crystals.push({
      u: (h1 - Math.floor(h1)) * U_PERIOD,
      v: ((h2 - Math.floor(h2)) * 2 - 1) * (W - 0.8),
      good: i % 2 === 0,
      t: 0,
    });
  }
  return {
    racers,
    ais,
    crystals,
    time: 0,
    order: racers.map((_, i) => i),
  };
}

const aiInp = { steer: 0, throttle: 0, brake: false };

// one physics tick for everyone plus pickups
export function stepRace(race, playerInp, dt, started) {
  const { racers, ais } = race;
  if (started) race.time += dt;
  for (let i = 0; i < racers.length; i++) {
    let inp = aiInp;
    if (i === 0) {
      inp = playerInp ?? aiInp;
      if (playerInp === null) { aiInp.steer = 0; aiInp.throttle = 0; }
    } else {
      aiControl(ais[i], racers[i], racers, aiInp, dt);
    }
    if (!started) inp.throttle = 0;
    stepRacer(racers[i], inp, dt);
    const r = racers[i];
    if (!r.finishTime && r.lap >= LAPS) r.finishTime = race.time;
  }
  collide(racers);

  if (started)
    for (const c of race.crystals) {
      if (c.t > 0) { c.t -= dt; continue; }
      for (const r of racers) {
        let du = wrapU(r.u - c.u);
        if (du > U_PERIOD / 2) du -= U_PERIOD;
        if (Math.abs(du) * 24 < 1.2 && Math.abs(r.v - c.v) < 1) {
          if (c.good) r.boostT = BOOST_TIME; else r.slowT = SLOW_TIME;
          c.t = CRYSTAL_RESPAWN;
          break;
        }
      }
    }
}

// nudge overlapping racers apart. racers on opposite faces of the strip
// share a world position and must not bump, hence the modulo comparison
function collide(racers) {
  for (let i = 0; i < racers.length; i++)
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      let du = wrapU(a.u - b.u);
      if (du > U_PERIOD / 2) du -= U_PERIOD;
      const along = du * 24;
      const dv = a.v - b.v;
      if (Math.abs(along) > 0.9 || Math.abs(dv) > 0.9) continue;
      const push = (0.9 - Math.abs(dv)) * 0.5 * (dv >= 0 ? 1 : -1);
      a.v = Math.max(-W, Math.min(W, a.v + push));
      b.v = Math.max(-W, Math.min(W, b.v - push));
      (along < 0 ? a : b).speed *= 0.985;
    }
}

// sorts the standings, returns where the player is (1 = first)
export function updpositions(race) {
  race.order.sort((x, y) => {
    const a = race.racers[x], b = race.racers[y];
    if (a.finishTime && b.finishTime) return a.finishTime - b.finishTime;
    if (a.finishTime !== 0) return -1;
    if (b.finishTime !== 0) return 1;
    return uAbs(b) - uAbs(a);
  });
  return race.order.indexOf(0) + 1;
}
