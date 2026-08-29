// one instanced quad pass for every sprite in the game. sprites face the
// camera but stand up along the track surface, and their scale snaps to
// steps for that chunky arcade zoom.

import { compileProgram, uniforms } from './render.js';
import { CELL, ATLAS_SIZE } from './atlas.js';

const FLOATS = 14;

const VERT_SRC = `#version 300 es
layout(location=0) in vec3 ipos;
layout(location=1) in vec2 isize;
layout(location=2) in vec2 icell;
layout(location=3) in vec4 itint;
layout(location=4) in vec3 iup;
uniform mat4 viewProj;
uniform vec3 camPos;
out vec2 vUV;
out vec4 vTint;
void main() {
  vec2 q = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1));
  vec3 toCam = camPos - ipos;
  float dist = max(length(toCam), .01);
  vec3 right = normalize(cross(iup, toCam));
  float zoom = 12. / dist;
  float k = max(floor(zoom * 32.), 1.) / 32. / zoom;
  vec3 wp = ipos + right * ((q.x - .5) * abs(isize.x) * k) + iup * (q.y * isize.y * k);
  vUV = (icell + vec2(isize.x < 0. ? 1. - q.x : q.x, 1. - q.y)) * ${CELL}. / ${ATLAS_SIZE}.;
  vTint = itint;
  gl_Position = viewProj * vec4(wp, 1.);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vUV;
in vec4 vTint;
uniform sampler2D atlas;
out vec4 outColor;
void main() {
  vec4 tx = texture(atlas, vUV);
  if (tx.a < .4) discard;
  outColor = vec4(vTint.rgb * tx.rgb, tx.a * vTint.a);
}`;

const CAPACITY = 1024;

export function initBillboards(gl, atlasCanvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlasCanvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  const prog = compileProgram(gl, VERT_SRC, FRAG_SRC);
  const uni = uniforms(gl, prog, ['viewProj', 'camPos']);

  const data = new Float32Array(CAPACITY * FLOATS);
  const sorted = new Float32Array(CAPACITY * FLOATS);
  const dist = new Float32Array(CAPACITY);
  const order = new Uint32Array(CAPACITY);
  let count = 0;
  const camPos = [0, 0, 0];

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, sorted.byteLength, gl.DYNAMIC_DRAW);
  const layout = [3, 2, 2, 4, 3];
  for (let loc = 0, off = 0; loc < layout.length; off += layout[loc++] * 4) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, layout[loc], gl.FLOAT, false, FLOATS * 4, off);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);

  return {
    begin(eye) {
      camPos[0] = eye[0]; camPos[1] = eye[1]; camPos[2] = eye[2];
      count = 0;
    },
    // negative sizeX draws the cell mirrored
    sprite(x, y, z, sizeX, sizeY, cell, r, g, b, a, upX, upY, upZ) {
      if (count >= CAPACITY) return;
      const o = count * FLOATS;
      data[o] = x; data[o + 1] = y; data[o + 2] = z;
      data[o + 3] = sizeX; data[o + 4] = sizeY;
      data[o + 5] = cell[0]; data[o + 6] = cell[1];
      data[o + 7] = r; data[o + 8] = g; data[o + 9] = b; data[o + 10] = a;
      data[o + 11] = upX; data[o + 12] = upY; data[o + 13] = upZ;
      const dx = x - camPos[0], dy = y - camPos[1], dz = z - camPos[2];
      dist[count] = dx * dx + dy * dy + dz * dz;
      count++;
    },
    // sort far to near then draw the lot in one call
    flush(viewProj) {
      if (!count) return;
      for (let i = 0; i < count; i++) order[i] = i;
      order.subarray(0, count).sort((a, b) => dist[b] - dist[a]);
      for (let i = 0; i < count; i++)
        sorted.set(data.subarray(order[i] * FLOATS, order[i] * FLOATS + FLOATS), i * FLOATS);
      gl.useProgram(prog);
      gl.uniformMatrix4fv(uni.viewProj, false, viewProj);
      gl.uniform3fv(uni.camPos, camPos);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, sorted.subarray(0, count * FLOATS));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
      gl.disable(gl.BLEND);
    },
  };
}
