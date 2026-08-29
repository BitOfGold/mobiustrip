// Dev-only: global surface self-distance scan (not part of npm test).
const {trackFrame, makeFrame, W, U_PERIOD} = await import('../src/track.js');
const f = makeFrame();
const NU = 700, VS = [-W, -W/2, 0, W/2, W];
const pts = [];
for (let i = 0; i < NU; i++)
  for (const v of VS) {
    const u = i / NU * U_PERIOD;
    trackFrame(u, v, f);
    pts.push([u, v, f.p[0], f.p[1], f.p[2]]);
  }
let minD = 1e9, best = null;
for (let i = 0; i < pts.length; i++)
  for (let j = i + 1; j < pts.length; j++) {
    let du = Math.abs(pts[i][0] - pts[j][0]);
    du = Math.min(du, U_PERIOD - du);
    if (du < 0.3) continue;
    if (Math.abs(du - 2*Math.PI) < 0.06 && Math.abs(pts[i][1] + pts[j][1]) < 0.5) continue;
    const d = Math.hypot(pts[i][2]-pts[j][2], pts[i][3]-pts[j][3], pts[i][4]-pts[j][4]);
    if (d < minD) { minD = d; best = [pts[i][0], pts[j][0]]; }
  }
console.log('min', minD.toFixed(3), 'at u', best[0].toFixed(2), '/', best[1].toFixed(2));
