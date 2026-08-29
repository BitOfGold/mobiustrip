// the track shape: maps track coords (u along, v across) to a world position.
// the ribbon does a half twist, so one full lap of u is 4*PI, not 2*PI —
// always wrap with wrapU, never by hand.

export const R = 24;
export const W = 5.14;

// wobbles added to the ring radius and height to make corners and hills,
// stored as flat triples of (frequency, amount, phase)
const RAD = [1, 2.6, 5.3, 2, 3.4, 0.9, 3, 2.0, 2.1, 5, 0.9, 4.4];
const VERT = [1, 2.4, 2.6, 3, 0.9, 1.2];

export const LOOP_U0 = 0.9;
const LOOP_R = 12;
export const LOOP_HALF = 0.6;
const LOOP_TILT = 0.8;

// the vertical loop: a bump that swings the track through a full circle,
// fading to nothing outside its window so the rest of the ring is untouched
function loopTerms(s, out) {
  const sig = LOOP_HALF;
  const q = Math.max(1 - (s * s) / (sig * sig), 0);
  if (q === 0) { out[0] = out[1] = out[2] = out[3] = 0; return out; }
  const t = Math.min(1, Math.max(0, (s + sig) / (2 * sig)));
  const psi = 2 * Math.PI * t * t * (3 - 2 * t);
  const dpsi = 2 * Math.PI * 6 * t * (1 - t) / (2 * sig);
  const A = LOOP_R * q * q;
  const dA = -4 * LOOP_R * s * q / (sig * sig);
  const sp = Math.sin(psi), cp = Math.cos(psi);
  out[0] = A * sp;
  out[1] = A * (1 - cp);
  out[2] = dA * sp + A * dpsi * cp;
  out[3] = dA * (1 - cp) + A * dpsi * sp;
  return out;
}
const loopScratch = [0, 0, 0, 0];
export const THICK = 0.05;
export const U_PERIOD = 4 * Math.PI;

export const makeFrame = () => ({
  p: [0, 0, 0],
  dpdu: [0, 0, 0],
  d: [0, 0, 0],
  n: [0, 0, 0],
});

// fills f with position, both slope directions and the surface normal at (u, v)
export function trackFrame(u, v, f) {
  const cu = Math.cos(u), su = Math.sin(u);
  const ch = Math.cos(u / 2), sh = Math.sin(u / 2);

  let rho = R, drho = 0, gy = 0, dgy = 0;
  for (let i = 0; i < RAD.length; i += 3) {
    const k = RAD[i], a = RAD[i + 1], p = k * u + RAD[i + 2];
    rho += a * Math.cos(p);
    drho -= a * k * Math.sin(p);
  }
  for (let i = 0; i < VERT.length; i += 3) {
    const k = VERT[i], a = VERT[i + 1], p = k * u + VERT[i + 2];
    gy += a * Math.sin(p);
    dgy += a * k * Math.cos(p);
  }

  const s = ((u - LOOP_U0 + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const [lt, ly, dlt, dly] = loopTerms(s, loopScratch);

  const dx = ch * cu, dy = sh, dz = ch * su;
  f.d[0] = dx; f.d[1] = dy; f.d[2] = dz;

  const rr = rho + LOOP_TILT * lt;
  f.p[0] = rr * cu - lt * su + v * dx;
  f.p[1] = gy + ly + v * dy;
  f.p[2] = rr * su + lt * cu + v * dz;

  const ca = drho + LOOP_TILT * dlt - lt;
  const cb = rho + LOOP_TILT * lt + dlt;
  const dpx = -0.5 * sh * cu - ch * su;
  const dpy = 0.5 * ch;
  const dpz = -0.5 * sh * su + ch * cu;
  f.dpdu[0] = ca * cu - cb * su + v * dpx;
  f.dpdu[1] = dgy + dly + v * dpy;
  f.dpdu[2] = ca * su + cb * cu + v * dpz;

  const nx = f.dpdu[1] * dz - f.dpdu[2] * dy;
  const ny = f.dpdu[2] * dx - f.dpdu[0] * dz;
  const nz = f.dpdu[0] * dy - f.dpdu[1] * dx;
  const len = Math.hypot(nx, ny, nz) || 1;
  f.n[0] = nx / len; f.n[1] = ny / len; f.n[2] = nz / len;
  return f;
}

// keeps u inside one lap
export function wrapU(u) {
  return ((u % U_PERIOD) + U_PERIOD) % U_PERIOD;
}
