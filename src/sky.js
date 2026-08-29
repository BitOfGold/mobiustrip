// sky: one fullscreen triangle, gradient sky above, dark water below,
// hashed stars, everything dithered for the retro look

import { compileProgram, uniforms, BAYER_GLSL } from './render.js';

const VERT_SRC = `#version 300 es
out vec2 vP;
void main() {
  vP = vec2(gl_VertexID == 1 ? 3. : -1., gl_VertexID == 2 ? 3. : -1.);
  gl_Position = vec4(vP, 0., 1.);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 vP;
uniform vec3 camRight, camUp, camFwd;
uniform vec3 halfFov;
out vec4 outColor;
${BAYER_GLSL}
void main() {
  vec3 dir = normalize(camFwd + vP.x * halfFov.x * camRight + (vP.y + halfFov.z) * halfFov.y * camUp);
  float y = dir.y;
  vec3 col = vec3(.55, .82, .48);
  col = mix(col, vec3(.34, .13, .46), smoothstep(.04, .38, y));
  col = mix(col, vec3(.04, .02, .10), smoothstep(.3, .85, y));
  col = mix(col, vec3(.02, .12, .14), smoothstep(.03, .45, -y));
  vec3 cell = floor(dir * 140.);
  float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  col += vec3(.9) * step(.9965, h) * smoothstep(.15, .35, y);
  outColor = vec4(floor(col * 24. + bayer()) / 24., 1.);
}`;

export function initSky(gl) {
  const prog = compileProgram(gl, VERT_SRC, FRAG_SRC);
  const uni = uniforms(gl, prog, ['camRight', 'camUp', 'camFwd', 'halfFov']);
  const vao = gl.createVertexArray();

  return {
    draw(right, up, fwd, fovY, aspect, yShift) {
      gl.useProgram(prog);
      gl.uniform3fv(uni.camRight, right);
      gl.uniform3fv(uni.camUp, up);
      gl.uniform3fv(uni.camFwd, fwd);
      const t = Math.tan(fovY / 2);
      gl.uniform3f(uni.halfFov, t * aspect, t, yShift);
      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
    },
  };
}
