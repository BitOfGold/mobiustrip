// sanity tests, plain node, no framework. run: npm test

import { trackFrame, makeFrame, wrapU, U_PERIOD, W, R } from '../src/track.js';

let checks = 0;

function close(a, b, eps, label) {
  checks++;
  const d = Math.abs(a - b);
  if (!(d <= eps)) throw new Error(`${label}: |${a} - ${b}| = ${d} > ${eps}`);
}

function vecClose(a, b, eps, label) {
  for (let i = 0; i < 3; i++) close(a[i], b[i], eps, `${label}[${i}]`);
}

const fa = makeFrame(), fb = makeFrame();

// the strip has to close up after one full lap
for (const v of [-W, -1.2, 0, 0.7, W]) {
  trackFrame(0, v, fa);
  trackFrame(U_PERIOD, v, fb);
  vecClose(fa.p, fb.p, 1e-9, `P(0,${v}) == P(4pi,${v})`);
  vecClose(fa.n, fb.n, 1e-9, `N(0,${v}) == N(4pi,${v})`);
}

// half a lap later you're at the same world spot on the other face
for (let i = 0; i < 40; i++) {
  const u = i / 40 * 2 * Math.PI, v = Math.sin(i * 7) * W;
  trackFrame(u, v, fa);
  trackFrame(u + 2 * Math.PI, -v, fb);
  vecClose(fa.p, fb.p, 1e-9, `P(u+2pi,-v) == P(u,v) @u=${u.toFixed(2)}`);
  for (let k = 0; k < 3; k++) close(fa.n[k], -fb.n[k], 1e-9, `N flips @u=${u.toFixed(2)}`);
}

// the surface normal should never suddenly jump anywhere on the track
{
  const STEPS = 8192, eps = U_PERIOD / STEPS;
  for (const v of [-W, 0, W]) {
    trackFrame(0, v, fa);
    let prev = [...fa.n];
    for (let i = 1; i <= STEPS; i++) {
      trackFrame(i * eps, v, fa);
      const jump = Math.hypot(fa.n[0] - prev[0], fa.n[1] - prev[1], fa.n[2] - prev[2]);
      checks++;
      if (jump > 0.2) throw new Error(`normal jump ${jump} at u=${(i * eps).toFixed(3)}, v=${v}`);
      prev = [...fa.n];
    }
  }
}

// no part of the track should pass close to any other part
{
  const NU = 500, pts = [];
  for (let i = 0; i < NU; i++)
    for (const v of [-W, -W / 2, 0, W / 2, W]) {
      trackFrame(i / NU * U_PERIOD, v, fa);
      pts.push([i / NU * U_PERIOD, v, fa.p[0], fa.p[1], fa.p[2]]);
    }
  let minD = 1e9;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      let du = Math.abs(pts[i][0] - pts[j][0]);
      du = Math.min(du, U_PERIOD - du);
      if (du < 0.3) continue;
      if (Math.abs(du - 2 * Math.PI) < 0.15 && Math.abs(pts[i][1] + pts[j][1]) < 2.5) continue;
      const d = Math.hypot(pts[i][2] - pts[j][2], pts[i][3] - pts[j][3], pts[i][4] - pts[j][4]);
      if (d < minD) minD = d;
    }
  checks++;
  console.log(`  global surface clearance: ${minD.toFixed(2)} world units`);
  if (minD < 1.5) throw new Error(`track self-cuts: clearance ${minD.toFixed(2)}`);
}

// the along-track derivative must stay well away from zero
{
  let minArc = 1e9;
  for (let i = 0; i < 8192; i++) {
    const u = i / 8192 * U_PERIOD;
    for (const v of [-W, 0, W]) {
      trackFrame(u, v, fa);
      minArc = Math.min(minArc, Math.hypot(...fa.dpdu));
    }
  }
  checks++;
  if (minArc < 4) throw new Error(`|dP/du| dips to ${minArc.toFixed(2)} - near-degenerate`);
  console.log(`  min |dP/du| over track: ${minArc.toFixed(2)}`);
}

// no NaN anywhere, direction and normal stay unit length
for (let i = 0; i < 500; i++) {
  const u = i / 500 * U_PERIOD, v = ((i * 0.618) % 1 * 2 - 1) * W;
  trackFrame(u, v, fa);
  for (const arr of [fa.p, fa.dpdu, fa.d, fa.n])
    for (const x of arr) {
      checks++;
      if (!Number.isFinite(x)) throw new Error(`NaN/Inf at u=${u}, v=${v}`);
    }
  close(Math.hypot(...fa.d), 1, 1e-9, `|D|=1 @u=${u.toFixed(2)}`);
  close(Math.hypot(...fa.n), 1, 1e-9, `|N|=1 @u=${u.toFixed(2)}`);
}

// one edge is shorter than the other, and it swaps sides mid-lap
{
  trackFrame(0.5, -W, fa);
  trackFrame(0.5, W, fb);
  checks++;
  if (Math.hypot(...fa.dpdu) >= Math.hypot(...fb.dpdu))
    throw new Error('v=-W should be the long edge before u=pi');
  trackFrame(4, -W, fa);
  trackFrame(4, W, fb);
  checks++;
  if (Math.hypot(...fa.dpdu) <= Math.hypot(...fb.dpdu))
    throw new Error('edge advantage should flip sign after u=pi');
}

close(wrapU(U_PERIOD + 1), 1, 1e-12, 'wrapU(4pi+1) == 1');
close(wrapU(-1), U_PERIOD - 1, 1e-12, 'wrapU(-1) == 4pi-1');
close(wrapU(3 * Math.PI), 3 * Math.PI, 1e-12, 'wrapU(3pi) == 3pi (no 2pi wrap!)');

// ---- physics ----

const { makeRacer, stepRacer, TOP_SPEED } = await import('../src/physics.js');

const STEP = 1 / 120;
const inp = { steer: 0, throttle: 1, brake: false };

function assertRacerFinite(r, label) {
  for (const x of [r.u, r.v, r.theta, r.speed, r.uTotal])
    if (!Number.isFinite(x)) throw new Error(`${label}: non-finite racer state`);
  checks++;
}

// drives one lap steering toward lineFn(u), returns the time it took
function driveLap(lineFn) {
  const r = makeRacer(0, lineFn ? lineFn(0) : 0);
  let t = 0;
  while (r.lap < 1 && t < 60) {
    if (lineFn) {
      const want = Math.max(-0.55, Math.min(0.55, (lineFn(r.u) - r.v) * 0.5));
      inp.steer = Math.max(-1, Math.min(1, (r.theta - want) * 6));
    } else {
      inp.steer = 0;
    }
    stepRacer(r, inp, STEP);
    t += STEP;
    if ((t / STEP) % 120 < 1) assertRacerFinite(r, 'driveLap');
  }
  inp.steer = 0;
  if (r.lap < 1) throw new Error('driveLap: no lap within 60s');
  return { time: t, r };
}

// straight full-throttle lap finishes in a sane time and is deterministic
{
  const { time, r } = driveLap(null);
  checks++;
  if (time < 15 || time > 24)
    throw new Error(`straight lap time ${time.toFixed(2)}s outside [15, 24]`);
  close(r.v, 0, 1e-9, 'zero steer keeps v = 0');
  checks++;
  if (r.lap !== 1) throw new Error('lap counter should be exactly 1');

  const { r: r2 } = driveLap(null);
  close(r.u, r2.u, 0, 'deterministic u');
  close(r.speed, r2.speed, 0, 'deterministic speed');
}

// taking the crossing line should be a couple seconds faster than the middle
{
  const line = (u) => -Math.tanh(2 * Math.cos(u / 2)) * (W - 0.4);
  const centre = driveLap(() => 0).time;
  const crossed = driveLap(line).time;
  const saved = centre - crossed;
  console.log(`  inner-line advantage: ${saved.toFixed(3)}s ` +
    `(centre ${centre.toFixed(2)}s, crossing ${crossed.toFixed(2)}s)`);
  checks++;
  if (saved < 1.8 || saved > 2.8)
    throw new Error(`inner-line advantage ${saved.toFixed(3)}s outside [1.8, 2.8]`);
}

// you can't leave the ribbon, and grinding the rail costs speed
{
  const r = makeRacer(0, 0);
  for (let i = 0; i < 240; i++) stepRacer(r, inp, STEP);
  const speedBefore = r.speed;
  let scraped = false, maxAbsV = 0;
  inp.steer = 1;
  for (let i = 0; i < 480; i++) {
    stepRacer(r, inp, STEP);
    scraped ||= r.scrape > 0;
    maxAbsV = Math.max(maxAbsV, Math.abs(r.v));
    assertRacerFinite(r, 'rail grind');
  }
  inp.steer = 0;
  checks += 3;
  if (maxAbsV > W + 1e-9) throw new Error(`left the ribbon: |v| reached ${maxAbsV}`);
  if (!scraped) throw new Error('rail contact never set scrape');
  if (r.speed > speedBefore * 0.8)
    throw new Error(`grinding barely slowed: ${speedBefore.toFixed(1)} -> ${r.speed.toFixed(1)}`);
  for (let i = 0; i < 240; i++) {
    const want = Math.max(-0.55, Math.min(0.55, (0 - r.v) * 0.5));
    inp.steer = Math.max(-1, Math.min(1, (r.theta - want) * 6));
    stepRacer(r, inp, STEP);
  }
  inp.steer = 0;
  checks++;
  if (Math.abs(r.v) > 0.5 * W || r.scrape !== 0) throw new Error('failed to leave the rail');
}

// ---- chase camera ----

{
  const { makeChaseCam, camState } = await import('../src/camera.js');
  const chase = makeChaseCam();
  const view = new Float32Array(16);
  const r = makeRacer(0, 0);
  inp.steer = 0;
  chase.reset(r);
  const prevUp = [0, 1, 0];
  let minDot = 1;
  // the camera must never flip or pop anywhere around the track
  let first = true;
  while (r.lap < 2) {
    stepRacer(r, inp, STEP);
    stepRacer(r, inp, STEP);
    chase.update(view, r, 2 * STEP);
    for (const arr of [camState.eye, camState.up, camState.fwd])
      for (const x of arr) {
        checks++;
        if (!Number.isFinite(x)) throw new Error('non-finite camera state');
      }
    if (!first) {
      const d = camState.up[0] * prevUp[0] + camState.up[1] * prevUp[1] + camState.up[2] * prevUp[2];
      minDot = Math.min(minDot, d);
      checks++;
      if (d < 0.85) throw new Error(`camera roll pop: up.prevUp = ${d.toFixed(4)} at u=${r.u.toFixed(2)}`);
    }
    prevUp[0] = camState.up[0]; prevUp[1] = camState.up[1]; prevUp[2] = camState.up[2];
    first = false;
    checks++;
    if (chase.fov < 0.9 || chase.fov > 1.7) throw new Error(`fov out of range: ${chase.fov}`);
  }
  console.log(`  camera continuity: min frame-to-frame up.up' = ${minDot.toFixed(4)}`);

  // starting from a grid slot the camera has to be behind the racer
  const { uAbs } = await import('../src/physics.js');
  const g = makeRacer(-1.0, 1.15);
  chase.reset(g);
  checks++;
  if (!(chase.u < uAbs(g))) throw new Error('chase camera not behind staggered start');
  for (let i = 0; i < 240; i++) { stepRacer(g, inp, STEP); chase.update(view, g, STEP); }
  checks++;
  if (!(chase.u < uAbs(g))) throw new Error('chase camera drifted ahead of racer');
}

// ---- ai and race ----

{
  const { makeAI, aiControl, raceLine } = await import('../src/ai.js');
  const { makeRace, stepRace, updpositions } = await import('../src/race.js');
  const { U_PERIOD } = await import('../src/track.js');

  // each difficulty finishes a lap, and harder ones are faster
  const lapTimes = [];
  for (let diff = 0; diff < 3; diff++) {
    const r = makeRacer(0, raceLine(0));
    const ai = makeAI(3, diff);
    const ainp = { steer: 0, throttle: 0, brake: false };
    let t = 0;
    while (r.lap < 1 && t < 40) {
      aiControl(ai, r, [r], ainp, STEP);
      stepRacer(r, ainp, STEP);
      t += STEP;
      if ((t / STEP) % 120 < 1) assertRacerFinite(r, `AI diff ${diff}`);
    }
    checks++;
    if (r.lap < 1 || t < 14 || t > 30)
      throw new Error(`AI diff ${diff} lap time ${t.toFixed(2)}s outside [14, 30]`);
    lapTimes.push(t);
  }
  console.log(`  AI lap times: foal ${lapTimes[0].toFixed(2)}s, stallion ${lapTimes[1].toFixed(2)}s, alicorn ${lapTimes[2].toFixed(2)}s`);
  checks++;
  if (!(lapTimes[2] < lapTimes[0]))
    throw new Error('alicorn should out-pace foal');

  // let a full field run for a while, nothing blows up
  const race = makeRace(1);
  for (let t = 0; t < 50; t += STEP) stepRace(race, null, STEP, true);
  updpositions(race);
  checks++;
  if (new Set(race.order).size !== 8) throw new Error('standings must rank all 8');
  for (const r of race.racers) {
    assertRacerFinite(r, 'race sim');
    checks++;
    if (r === race.racers[0]) continue;
    if (r.uTotal < U_PERIOD) throw new Error('an AI failed to finish lap 1 in 50s');
  }
}

// crossing the middle line gives the boost
{
  const r = makeRacer(0, 0.4);
  for (let i = 0; i < 240; i++) stepRacer(r, inp, STEP);
  r.theta = -0.3;
  let crossed = false;
  for (let i = 0; i < 240; i++) {
    stepRacer(r, inp, STEP);
    if (r.boostT > 0) { crossed = true; break; }
  }
  checks++;
  if (!crossed) throw new Error('centreline crossing gave no boost');
}

// ---- crystals ----

{
  const { makeRace: mr, stepRace: sr } = await import('../src/race.js');
  const { BOOST_TOP, SLOW_FACTOR } = await import('../src/physics.js');
  const race = mr(1);
  const green = race.crystals.find((c) => c.good);
  const red = race.crystals.find((c) => !c.good);
  checks += 2;
  if (!green || !red) throw new Error('need both crystal colours');
  if (race.crystals.some((c) => Math.abs(c.v) > W - 0.7)) throw new Error('crystal off track');

  // green boosts past top speed and the crystal respawns
  const p = race.racers[0];
  p.u = green.u; p.uStart = green.u; p.uTotal = 0; p.v = green.v; p.speed = TOP_SPEED;
  inp.steer = 0;
  sr(race, inp, STEP, true);
  checks += 2;
  if (p.boostT <= 0) throw new Error('green crystal gave no boost');
  if (green.t <= 0) throw new Error('crystal not respawning');
  for (let i = 0; i < 120; i++) stepRacer(p, inp, STEP);
  checks++;
  if (p.speed < TOP_SPEED * 1.2 || p.speed > TOP_SPEED * BOOST_TOP + 1e-6)
    throw new Error(`boost speed ${p.speed.toFixed(1)} out of range`);

  // red slows you down while it lasts
  p.boostT = 0; p.slowT = 0; p.speed = TOP_SPEED;
  p.u = red.u; p.uStart = red.u; p.uTotal = 0; p.v = red.v;
  sr(race, inp, STEP, true);
  checks++;
  if (p.slowT <= 0) throw new Error('red crystal did not slow');
  for (let i = 0; i < 120; i++) { p.slowT = 1; stepRacer(p, inp, STEP); }
  checks++;
  if (p.speed > TOP_SPEED * (SLOW_FACTOR + 0.12))
    throw new Error(`red crystal barely slowed: ${p.speed.toFixed(1)}`);
}

console.log(`PASS — ${checks} checks (R=${R}, W=${W}, top ${TOP_SPEED} u/s)`);
