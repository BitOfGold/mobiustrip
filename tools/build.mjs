// build script.
//   node tools/build.mjs dev   -> watch + dev server
//   node tools/build.mjs ship  -> minify, pack, inline into html, zip
//   node tools/build.mjs size  -> ship and print the byte count

import { build, context } from 'esbuild';
import { minify } from 'terser';
import { Packer } from 'roadroller';
import { deflateRawSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const ZIP_BUDGET = 13312;
const ENTRY = 'src/main.js';
const DIST = 'dist';

const mode = process.argv[2] ?? 'size';

const htmlShell = (js) =>
  '<meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Möbius Trip</title>' +
  '<style>html,body{margin:0;height:100%;overflow:hidden;background:#000;touch-action:none}canvas{display:block;width:100vw;height:100vh;image-rendering:pixelated}</style>' +
  '<canvas id=c></canvas><script>' + js + '</script>';

if (mode === 'dev') {
  const ctx = await context({
    entryPoints: [ENTRY],
    bundle: true,
    outfile: `${DIST}/dev.js`,
    sourcemap: true,
    define: { DEBUG: 'true' },
  });
  await ctx.watch();
  const { hosts, port } = await ctx.serve({ servedir: '.' });
  console.log(`dev server: http://${hosts[0]}:${port}/  (DEBUG=true, watching)`);
} else {
  const zipBytes = await ship();
  const pct = ((zipBytes / ZIP_BUDGET) * 100).toFixed(1);
  console.log(`zip: ${zipBytes} bytes used, ${ZIP_BUDGET - zipBytes} remaining of ${ZIP_BUDGET} (${pct}%)`);
  if (zipBytes > ZIP_BUDGET) {
    console.error('OVER BUDGET');
    process.exit(1);
  }
}

// squeezes whitespace and comments out of the glsl template strings, since
// terser won't touch string contents (#version has to keep its newline)
function golfShaders(src) {
  return src.replace(/`((?:#version 300 es|\s*float )[\s\S]*?)`/g, (m, body) =>
    '`' + body
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}();,=+\-*/<>!?:.&|])\s*/g, '$1')
      .trim()
      .replace(/^#version 300 es ?/, '#version 300 es\n') + '`');
}

// swaps gl.CONSTANT lookups for their fixed numeric values; any name missing
// from the table has to be added here or the build fails on purpose
function inlineGLConsts(src) {
  const GL_CONST = {
    DEPTH_BUFFER_BIT: 256, COLOR_BUFFER_BIT: 16384,
    LINES: 1, TRIANGLES: 4, TRIANGLE_STRIP: 5,
    SRC_ALPHA: 770, ONE_MINUS_SRC_ALPHA: 771, ONE: 1,
    BLEND: 3042, DEPTH_TEST: 2929, TEXTURE_2D: 3553,
    UNSIGNED_BYTE: 5121, UNSIGNED_SHORT: 5123, FLOAT: 5126, RGBA: 6408,
    NEAREST: 9728, TEXTURE_MAG_FILTER: 10240, TEXTURE_MIN_FILTER: 10241,
    ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963,
    STATIC_DRAW: 35044, DYNAMIC_DRAW: 35048,
    FRAGMENT_SHADER: 35632, VERTEX_SHADER: 35633,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
  };
  return src.replace(/\bgl\d*\.([A-Z][A-Z_0-9]*)\b/g, (m, name) => {
    if (GL_CONST[name] === undefined) throw new Error(`unknown WebGL constant gl.${name}`);
    return GL_CONST[name];
  });
}

// bundle -> terser -> roadroller -> html -> zip
async function ship() {
  mkdirSync(DIST, { recursive: true });

  const bundle = await build({
    entryPoints: [ENTRY],
    bundle: true,
    write: false,
    define: { DEBUG: 'false' },
  });
  const bundled = inlineGLConsts(golfShaders(bundle.outputFiles[0].text));

  const tersed = await minify(bundled, {
    module: false,
    toplevel: true,
    ecma: 2020,
    compress: {
      passes: 3, unsafe: true, unsafe_arrows: true, unsafe_math: true,
      unsafe_comps: true, unsafe_methods: true,
      pure_getters: true,
    },
    mangle: { properties: { regex: /^_/ } },
  });
  writeFileSync(`${DIST}/ship.min.js`, tersed.code);

  const packer = new Packer([{ data: tersed.code, type: 'js', action: 'eval' }], {});
  await packer.optimize(2);
  const { firstLine, secondLine } = packer.makeDecoder();
  const packed = firstLine + secondLine;
  if (packed.includes('</script')) throw new Error('packed JS contains </script — needs escaping');

  const html = htmlShell(packed);
  writeFileSync(`${DIST}/index.html`, html);
  const zipPath = `${DIST}/mobiustrip.zip`;
  writeFileSync(zipPath, zipSingleFile('index.html', Buffer.from(html)));

  // run whichever zip recompressor happens to be installed
  for (const [tool, args] of [
    ['./advzip.exe', ['-z', '-4', '-i', '50', zipPath]],
    ['advzip', ['-z', '-4', '-i', '50', zipPath]],
    ['ect', ['-9', '-zip', zipPath]],
  ]) {
    try {
      execFileSync(tool, args, { stdio: 'ignore' });
      break;
    } catch { /* not installed */ }
  }
  return statSync(zipPath).size;
}

// hand-rolled single-file zip so there's no external zip dependency
function zipSingleFile(name, data) {
  const compressed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const nameBuf = Buffer.from(name);
  const dosTime = 0, dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10);
  local.writeUInt16LE(dosDate, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(dosTime, 12);
  central.writeUInt16LE(dosDate, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);

  const localOffset = 0;
  const centralOffset = local.length + nameBuf.length + compressed.length;
  central.writeUInt32LE(localOffset, 42);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBuf.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, nameBuf, compressed, central, nameBuf, end]);
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}
