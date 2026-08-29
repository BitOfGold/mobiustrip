// draws the track ribbon. the mesh is built once at startup straight from
// trackFrame so it always matches the physics.

import { W, THICK, U_PERIOD, trackFrame, makeFrame } from './track.js';

const SEG_U = 1024;
const SEG_V = 5;

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 pos;
layout(location=1) in vec3 nrm;
layout(location=2) in vec2 uv;
uniform mat4 viewProj;
out vec3 vNormal;
out vec2 vUV;
void main() {
  vNormal = nrm;
  vUV = uv;
  gl_Position = viewProj * vec4(pos, 1.);
}`;

// 4x4 dither pattern shared with the sky
export const BAYER_GLSL =
  'const int BAYER[16]=int[16](0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5);' +
  'float bayer(){return (float(BAYER[int(mod(gl_FragCoord.x,4.))+4*int(mod(gl_FragCoord.y,4.))])+.5)/16.;}';

// rainbow bands that dither out toward their edges, chevrons on the middle
// band, yellow rails on the outside
const FRAG_SRC = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec2 vUV;
out vec4 outColor;
${BAYER_GLSL}
void main() {
  float u = vUV.x;
  float m = abs(vUV.y) * ${(1 / W).toFixed(4)};
  float uc = u * ${(1 / (2 * Math.PI)).toFixed(7)};

  float bands = m * 8.;
  float centred = abs(fract(bands) - .5) * 2.;
  float vis = smoothstep(1., .3, centred);
  if (vis < bayer()) discard;

  vec3 col = bands >= 7.
    ? vec3(1., .85, .25)
    : .58 + .42 * cos(6.2832 * ((6. - floor(bands)) / 8.6 + vec3(0., .33, .67)));
  if (bands < 1.) {
    float px = .2;
    float along = floor(uc * 152. / px) * px;
    float lat = floor(abs(vUV.y) / px) * px;
    col = mix(col, vec3(1.), step(fract((along + lat) * .25), .25));
  }

  float light = .5 + .5 * abs(dot(vNormal, normalize(vec3(.4, .8, .3))));
  outColor = vec4(col * light, 1.);
}`;

export const uniforms = (gl, prog, names) =>
  Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)]));

export function compileProgram(gl, vertSrc, fragSrc) {
  const make = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (DEBUG && !gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) + src);
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (DEBUG && !gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

export function initRibbon(gl) {
  const cols = SEG_U + 1, rows = SEG_V + 1;

  const frame = makeFrame();
  const verts = new Float32Array(cols * rows * 8);
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const u = i / SEG_U * U_PERIOD;
      const v = (j / SEG_V * 2 - 1) * W;
      trackFrame(u, v, frame);
      const k = (i * rows + j) * 8;
      for (let c = 0; c < 3; c++) {
        verts[k + c] = frame.p[c] + THICK * frame.n[c];
        verts[k + 3 + c] = frame.n[c];
      }
      verts[k + 6] = u;
      verts[k + 7] = v;
    }

  // one long triangle strip, 0xFFFF restarts between rows
  const strip = new Uint16Array(SEG_V * (cols * 2 + 1));
  let s = 0;
  for (let j = 0; j < SEG_V; j++) {
    for (let i = 0; i < cols; i++) {
      strip[s++] = i * rows + j;
      strip[s++] = i * rows + j + 1;
    }
    strip[s++] = 0xffff;
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const layout = [3, 3, 2];
  for (let loc = 0, off = 0; loc < layout.length; off += layout[loc++] * 4) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, layout[loc], gl.FLOAT, false, 32, off);
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, strip, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

  const prog = compileProgram(gl, VERT_SRC, FRAG_SRC);
  const uni = uniforms(gl, prog, ['viewProj']);

  return {
    draw(viewProj) {
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uni.viewProj, false, viewProj);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLE_STRIP, strip.length, gl.UNSIGNED_SHORT, 0);
      gl.bindVertexArray(null);
    },
  };
}
