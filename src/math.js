// small vec3/mat4 helpers, everything writes into out so nothing allocates

export function cross(out, a, b) {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x; out[1] = y; out[2] = z;
  return out;
}

export function normalize(out, a) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  out[0] = a[0] / len; out[1] = a[1] / len; out[2] = a[2] / len;
  return out;
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

// yShift slides the picture down the screen so the horizon sits high
export function mat4Perspective(out, fovY, aspect, near, far, yShift = 0) {
  const f = 1 / Math.tan(fovY / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[9] = yShift;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = 2 * far * near / (near - far);
  return out;
}

export function mat4View(out, eye, right, up, fwd) {
  out[0] = right[0]; out[1] = up[0]; out[2] = -fwd[0]; out[3] = 0;
  out[4] = right[1]; out[5] = up[1]; out[6] = -fwd[1]; out[7] = 0;
  out[8] = right[2]; out[9] = up[2]; out[10] = -fwd[2]; out[11] = 0;
  out[12] = -dot(right, eye);
  out[13] = -dot(up, eye);
  out[14] = dot(fwd, eye);
  out[15] = 1;
  return out;
}

// hue 0..1 to rgb, base/amp pick how pastel it comes out
export function hueRGB(h, out = [0, 0, 0], base = 0.5, amp = 0.5) {
  for (let c = 0; c < 3; c++) out[c] = base + amp * Math.cos(6.2832 * (h + c / 3));
  return out;
}

const mulScratch = new Float32Array(16);

// out = a * b, ok if out is also a or b
export function mat4Mul(out, a, b) {
  const r = mulScratch;
  for (let c = 0; c < 4; c++)
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + row] * b[c * 4 + k];
      r[c * 4 + row] = s;
    }
  out.set(r);
  return out;
}
