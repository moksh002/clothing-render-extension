import type { BodyAssets } from './assets';
import { POSE_BY_ID, type Euler, type Pose } from './poses';

/** Joint positions for every bone (head), cm, from the morphed helper vertices. */
export function boneHeads(assets: BodyAssets, pos: Float32Array): Float32Array {
  const out = new Float32Array(assets.bones.length * 3);
  assets.bones.forEach((b, i) => {
    let x = 0, y = 0, z = 0;
    for (const v of b.head) {
      x += pos[v * 3]; y += pos[v * 3 + 1]; z += pos[v * 3 + 2];
    }
    const n = b.head.length || 1;
    out.set([x / n, y / n, z / n], i * 3);
  });
  return out;
}

const rad = Math.PI / 180;

/** Rotation matrix R = Rz * Ry * Rx (row-major 3x3) from degrees. */
function rotation([ex, ey, ez]: Euler): number[] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(ex * rad), Math.sin(ex * rad), Math.cos(ey * rad), Math.sin(ey * rad), Math.cos(ez * rad), Math.sin(ez * rad)];
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}

/** 3x4 affine matrices (row-major, 12 floats) multiplied: a * b. */
function mul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  const o = new Array<number>(12);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c];
    o[r * 4 + 3] = a[r * 4] * b[3] + a[r * 4 + 1] * b[7] + a[r * 4 + 2] * b[11] + a[r * 4 + 3];
  }
  return o;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** "upperarm01.L" -> { base: "upperarm01", side: "L" }; "spine02" -> side null. */
const split = (name: string) => {
  const m = /^(.*)\.([LR])$/.exec(name);
  return m ? { base: m[1], side: m[2] } : { base: name, side: null };
};

/**
 * One 3x4 matrix per bone for a pose, in rest-pose world coordinates. A bone's rotation turns it about its
 * own joint, and it inherits its parent's motion.
 */
export function boneMatrices(assets: BodyAssets, pos: Float32Array, pose: Pose | string): Float32Array {
  const p = typeof pose === 'string' ? POSE_BY_ID.get(pose)! : pose;
  const heads = boneHeads(assets, pos);
  const out = new Float32Array(assets.bones.length * 12);
  const world: number[][] = [];
  assets.bones.forEach((b, i) => {
    const { base, side } = split(b.name);
    // Which body side a bone is on is decided by where its joint sits, not by its L/R label.
    const hx = heads[i * 3];
    const table = side === null ? p.center : hx >= 0 ? p.plus : p.minus;
    const e = table[base];
    let local = IDENTITY;
    if (e) {
      const R = rotation(e);
      const h = [heads[i * 3], heads[i * 3 + 1], heads[i * 3 + 2]];
      // rotate about the joint: x' = R (x - h) + h
      local = [
        R[0], R[1], R[2], h[0] - (R[0] * h[0] + R[1] * h[1] + R[2] * h[2]),
        R[3], R[4], R[5], h[1] - (R[3] * h[0] + R[4] * h[1] + R[5] * h[2]),
        R[6], R[7], R[8], h[2] - (R[6] * h[0] + R[7] * h[1] + R[8] * h[2]),
      ];
    }
    const parent = b.parent >= 0 ? world[b.parent] : IDENTITY;
    world[i] = mul(parent, local);
    out.set(world[i], i * 12);
  });
  return out;
}

/** Blend the bone matrices into one 3x4 matrix per body vertex using its skin weights. */
export function vertexMatrices(assets: BodyAssets, bones: Float32Array): Float32Array {
  const n = assets.bodyCount;
  const out = new Float32Array(n * 12);
  for (let v = 0; v < n; v++) {
    // Weights are stored as bytes, so renormalise to keep a vertex on an unposed bone exactly where it was.
    let total = 0;
    for (let k = 0; k < 4; k++) total += assets.skinW[v * 4 + k];
    for (let k = 0; k < 4; k++) {
      const w = assets.skinW[v * 4 + k] / (total || 1);
      if (!w) continue;
      const b = assets.skinIdx[v * 4 + k] * 12;
      for (let m = 0; m < 12; m++) out[v * 12 + m] += w * bones[b + m];
    }
  }
  return out;
}

/** Apply a 3x4 matrix at offset `o` of `m` to a point, and write it into `dst`. */
export function transformPoint(m: Float32Array, o: number, x: number, y: number, z: number, dst: Float32Array | number[], d: number): void {
  dst[d] = m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3];
  dst[d + 1] = m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7];
  dst[d + 2] = m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11];
}

/** Rotate a direction (no translation) and normalise. */
export function transformNormal(m: Float32Array, o: number, x: number, y: number, z: number, dst: Float32Array | number[], d: number): void {
  const nx = m[o] * x + m[o + 1] * y + m[o + 2] * z;
  const ny = m[o + 4] * x + m[o + 5] * y + m[o + 6] * z;
  const nz = m[o + 8] * x + m[o + 9] * y + m[o + 10] * z;
  const l = Math.hypot(nx, ny, nz) || 1;
  dst[d] = nx / l; dst[d + 1] = ny / l; dst[d + 2] = nz / l;
}

/** The rest-pose body vertex nearest to each query point, via a coarse grid. */
export class NearestVertex {
  private cells = new Map<number, number[]>();
  private readonly size = 3;
  /** Only the vertices accepted by `include` (default all) can be found. */
  constructor(private pos: Float32Array, count: number, include: (v: number) => boolean = () => true) {
    for (let v = 0; v < count; v++) {
      if (!include(v)) continue;
      const k = this.key(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
      (this.cells.get(k) ?? this.cells.set(k, []).get(k)!).push(v);
    }
  }
  private key(x: number, y: number, z: number) {
    return ((Math.floor(x / this.size) + 64) * 256 + (Math.floor(y / this.size) + 64)) * 256 + (Math.floor(z / this.size) + 64);
  }
  find(x: number, y: number, z: number): number {
    const cx = Math.floor(x / this.size), cy = Math.floor(y / this.size), cz = Math.floor(z / this.size);
    for (let r = 1; r <= 5; r++) {
      let best = -1, bd = Infinity;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const list = this.cells.get(((cx + dx + 64) * 256 + (cy + dy + 64)) * 256 + (cz + dz + 64));
        if (!list) continue;
        for (const v of list) {
          const d = (this.pos[v * 3] - x) ** 2 + (this.pos[v * 3 + 1] - y) ** 2 + (this.pos[v * 3 + 2] - z) ** 2;
          if (d < bd) { bd = d; best = v; }
        }
      }
      if (best >= 0) return best;
    }
    return 0;
  }

  /** The k nearest vertices with inverse-distance weights (summing to one), so a skin blends smoothly. */
  findK(x: number, y: number, z: number, k = 6): { v: number; w: number }[] {
    const cx = Math.floor(x / this.size), cy = Math.floor(y / this.size), cz = Math.floor(z / this.size);
    for (let r = 1; r <= 5; r++) {
      const found: { v: number; d: number }[] = [];
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const list = this.cells.get(((cx + dx + 64) * 256 + (cy + dy + 64)) * 256 + (cz + dz + 64));
        if (!list) continue;
        for (const v of list) found.push({ v, d: Math.hypot(this.pos[v * 3] - x, this.pos[v * 3 + 1] - y, this.pos[v * 3 + 2] - z) });
      }
      if (found.length >= k || r === 5) {
        if (!found.length) return [{ v: 0, w: 1 }];
        found.sort((a, b) => a.d - b.d);
        const top = found.slice(0, k).map(({ v, d }) => ({ v, w: 1 / (d + 0.6) ** 2 }));
        const total = top.reduce((t, e) => t + e.w, 0);
        return top.map((e) => ({ v: e.v, w: e.w / total }));
      }
    }
    return [{ v: 0, w: 1 }];
  }
}
