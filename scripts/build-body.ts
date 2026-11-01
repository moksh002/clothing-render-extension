// Converts the downloaded MakeHuman CC0 files into compact binaries the extension loads.
//   npx tsx scripts/build-body.ts <downloadDir> [outDir]
// <downloadDir> holds 3dobjs/base.obj and targets/{macrodetails,measure}/*.target as downloaded from
// https://github.com/makehumancommunity/makehuman (makehuman/data), assets released under CC0.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
const out = process.argv[3] ?? 'public/body';
if (!src) throw new Error('usage: build-body.ts <downloadDir> [outDir]');
mkdirSync(out, { recursive: true });

// ---- base mesh (group "body" only) ------------------------------------------------------------
const lines = readFileSync(join(src, '3dobjs/base.obj'), 'utf8').split('\n');
const v: number[] = [];
const vt: number[] = [];
const faces: [number, number][][] = [];
const eyeFaces: Record<string, number[][]> = { 'helper-l-eye': [], 'helper-r-eye': [] };
let group = '';
for (const line of lines) {
  const t = line.trim().split(/\s+/);
  if (t[0] === 'v') v.push(+t[1], +t[2], +t[3]);
  else if (t[0] === 'vt') vt.push(+t[1], +t[2]);
  else if (t[0] === 'g') group = t[1];
  else if (t[0] === 'f' && group in eyeFaces) {
    eyeFaces[group].push(t.slice(1).map((p) => Number(p.split('/')[0]) - 1));
  } else if (t[0] === 'f' && group === 'body') {
    faces.push(t.slice(1).map((p) => {
      const [a, b] = p.split('/');
      return [Number(a) - 1, Number(b) - 1] as [number, number];
    }));
  }
}
const bodyCount = Math.max(...faces.flat().map((p) => p[0])) + 1;

// Eyeball helper meshes ride along after the body vertices: new index = bodyCount + k.
const extraMap = new Map<number, number>();
for (const fs of Object.values(eyeFaces)) for (const f of fs) for (const i of f) if (!extraMap.has(i)) extraMap.set(i, bodyCount + extraMap.size);
const srcCount = bodyCount + extraMap.size;
const eyes = Object.fromEntries(
  Object.entries(eyeFaces).map(([k, fs]) => {
    const tri: number[] = [];
    for (const f of fs) for (let i = 1; i < f.length - 1; i++) tri.push(extraMap.get(f[0])!, extraMap.get(f[i])!, extraMap.get(f[i + 1])!);
    return [k === 'helper-l-eye' ? 'left' : 'right', tri];
  }),
);

// Unique (position, uv) pairs become render vertices.
const key = new Map<string, number>();
const rvSrc: number[] = [];
const rvUv: number[] = [];
const tris: number[] = [];
const vid = ([a, b]: [number, number]) => {
  const k = `${a}/${b}`;
  let i = key.get(k);
  if (i === undefined) {
    i = rvSrc.length;
    key.set(k, i);
    rvSrc.push(a);
    rvUv.push(vt[b * 2], vt[b * 2 + 1]);
  }
  return i;
};
for (const f of faces) {
  const ids = f.map(vid);
  for (let i = 1; i < ids.length - 1; i++) tris.push(ids[0], ids[i], ids[i + 1]);
}

const posList = v.slice(0, bodyCount * 3);
for (const [orig] of extraMap) posList.push(v[orig * 3], v[orig * 3 + 1], v[orig * 3 + 2]);
const positions = new Float32Array(posList);
const rvSrcA = new Uint16Array(rvSrc);
const rvUvA = new Float32Array(rvUv);
const trisA = new Uint32Array(tris);

// ---- targets ----------------------------------------------------------------------------------
interface Entry { name: string; offset: number; count: number; scale: number }
const entries: Entry[] = [];
const chunks: Buffer[] = [];
let offset = 0;
const pad4 = (n: number) => (4 - (n % 4)) % 4;

for (const dir of ['macrodetails', 'measure']) {
  for (const file of readdirSync(join(src, 'targets', dir)).sort()) {
    if (!file.endsWith('.target')) continue;
    const idx: number[] = [];
    const d: number[] = [];
    for (const line of readFileSync(join(src, 'targets', dir, file), 'utf8').split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const t = line.trim().split(/\s+/);
      const orig = +t[0];
      const i = orig < bodyCount ? orig : extraMap.get(orig);
      if (i === undefined) continue; // other helper geometry
      idx.push(i);
      d.push(+t[1], +t[2], +t[3]);
    }
    const maxAbs = Math.max(1e-9, ...d.map(Math.abs));
    const scale = maxAbs / 32767;
    const ib = Buffer.from(new Uint16Array(idx).buffer);
    const db = Buffer.from(new Int16Array(d.map((x) => Math.round(x / scale))).buffer);
    const padding = Buffer.alloc(pad4(ib.length));
    chunks.push(ib, padding, db);
    entries.push({ name: file.replace('.target', ''), offset, count: idx.length, scale });
    offset += ib.length + padding.length + db.length;
  }
}
writeFileSync(join(out, 'targets.bin'), Buffer.concat(chunks));

// ---- base buffer ----------------------------------------------------------------------------------
const parts = [positions, rvSrcA, rvUvA, trisA];
const sizes = parts.map((a) => a.byteLength + pad4(a.byteLength));
const baseOffsets = sizes.map((_, i) => sizes.slice(0, i).reduce((s, x) => s + x, 0));
const base = Buffer.alloc(sizes.reduce((s, x) => s + x, 0));
parts.forEach((a, i) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).copy(base, baseOffsets[i]));
writeFileSync(join(out, 'body.bin'), base);

writeFileSync(
  join(out, 'body.json'),
  JSON.stringify({
    source: 'https://github.com/makehumancommunity/makehuman (makehuman/data), CC0 1.0',
    srcCount,
    bodyCount,
    eyes,
    renderCount: rvSrc.length,
    triCount: tris.length / 3,
    /** Mesh units are decimetres. */
    unitCm: 10,
    layout: {
      positions: { offset: baseOffsets[0], length: positions.length },
      rvSrc: { offset: baseOffsets[1], length: rvSrcA.length },
      rvUv: { offset: baseOffsets[2], length: rvUvA.length },
      tris: { offset: baseOffsets[3], length: trisA.length },
    },
    targets: entries,
  }),
);
writeFileSync(
  join(out, 'LICENSE.txt'),
  'The files in this folder are derived from the MakeHuman base mesh and targets\n(https://github.com/makehumancommunity/makehuman, makehuman/data), which the MakeHuman project\nreleased under CC0 1.0 Universal (see LICENSE.md section C and LICENSE.ASSETS.md in that repository).\nConverted to compact binaries by scripts/build-body.ts.\n',
);
console.log(`render vertices ${rvSrc.length}, triangles ${tris.length / 3}, targets ${entries.length}`);
