import type { BodyDims } from '../../types';
import { loadBodyAssets, type BodyAssets } from './assets';
import { fitBody, type BodyFit } from './fit';
import { NearestVertex, boneMatrices, transformNormal, transformPoint, vertexMatrices } from './skeleton';

export interface BodyMeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  index: Uint32Array;
}

/** Everything needed to move rest-pose geometry into a pose. */
export interface PoseSkin {
  /** One 3x4 matrix per body vertex. */
  vm: Float32Array;
  /** One 3x4 matrix per bone. */
  bones: Float32Array;
  nearest: NearestVertex;
  /** Nearest-vertex lookups restricted to each arm, for sleeves (side +1 is the +x arm). */
  arms: { plus: NearestVertex; minus: NearestVertex };
  /** Lift or lower the whole figure so the lowest point of the body rests on the floor. */
  groundShift: number;
  headMatrix: number[];
}

const nearestCache = new WeakMap<BodyFit, { all: NearestVertex; plus: NearestVertex; minus: NearestVertex }>();
const ARM_BONE = /^(upperarm|lowerarm|wrist|finger|metacarpal)/;

/** Skinning data for a pose (null for the rest pose). */
export function poseSkin(bf: BodyFit, poseId: string): PoseSkin | null {
  if (poseId === 'a-pose') return null;
  const { assets } = bf;
  const bones = boneMatrices(assets, bf.positionsCm, poseId);
  const vm = vertexMatrices(assets, bones);
  let lookups = nearestCache.get(bf);
  if (!lookups) {
    const p0 = bf.positionsCm;
    const isArm = (v: number) => ARM_BONE.test(assets.bones[assets.skinIdx[v * 4]].name);
    lookups = {
      all: new NearestVertex(p0, assets.bodyCount),
      plus: new NearestVertex(p0, assets.bodyCount, (v) => isArm(v) && p0[v * 3] > 0),
      minus: new NearestVertex(p0, assets.bodyCount, (v) => isArm(v) && p0[v * 3] < 0),
    };
    nearestCache.set(bf, lookups);
  }
  const nearest = lookups.all;
  const p = bf.positionsCm;
  const tmp = [0, 0, 0];
  let minY = Infinity;
  for (let v = 0; v < assets.bodyCount; v++) {
    transformPoint(vm, v * 12, p[v * 3], p[v * 3 + 1], p[v * 3 + 2], tmp, 0);
    if (tmp[1] < minY) minY = tmp[1];
  }
  const head = assets.bones.findIndex((b) => b.name === 'head');
  return { vm, bones, nearest, arms: { plus: lookups.plus, minus: lookups.minus }, groundShift: -minY, headMatrix: Array.from(bones.subarray(head * 12, head * 12 + 12)) };
}

/**
 * Move a rest-pose point and its normal into the pose. The skin matrix is blended from the nearest body
 * vertices (only the given arm's for a sleeve), so cloth bends smoothly instead of tearing at seams.
 */
export function skinVertex(skin: PoseSkin, pos: Float32Array | number[], nrm: Float32Array | number[] | null, i: number, arm: 0 | 1 | -1 = 0): void {
  const lookup = arm === 1 ? skin.arms.plus : arm === -1 ? skin.arms.minus : skin.nearest;
  const near = lookup.findK(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], 6);
  const M = new Array<number>(12).fill(0);
  for (const { v, w } of near) for (let m = 0; m < 12; m++) M[m] += w * skin.vm[v * 12 + m];
  const mm = Float32Array.from(M);
  const a = [0, 0, 0];
  transformPoint(mm, 0, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], a, 0);
  pos[i * 3] = a[0]; pos[i * 3 + 1] = a[1]; pos[i * 3 + 2] = a[2];
  if (nrm) {
    transformNormal(mm, 0, nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], a, 0);
    nrm[i * 3] = a[0]; nrm[i * 3 + 1] = a[1]; nrm[i * 3 + 2] = a[2];
  }
}

/** Area-weighted vertex normals over the source mesh, copied to the render vertices (so UV seams stay smooth). */
export function bodyMeshData(bf: BodyFit, skin: PoseSkin | null = null): BodyMeshData {
  const { assets } = bf;
  const pos = bf.positionsCm;
  const nSrc = pos.length / 3;
  const nrm = new Float32Array(nSrc * 3);
  const t = assets.srcTris;
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const o of [a, b, c]) {
      nrm[o] += nx; nrm[o + 1] += ny; nrm[o + 2] += nz;
    }
  }
  for (let i = 0; i < nSrc; i++) {
    const l = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
    nrm[i * 3] /= l; nrm[i * 3 + 1] /= l; nrm[i * 3 + 2] /= l;
  }
  const R = assets.rvSrc.length;
  const positions = new Float32Array(R * 3);
  const normals = new Float32Array(R * 3);
  for (let i = 0; i < R; i++) {
    const s = assets.rvSrc[i] * 3;
    positions.set([pos[s], pos[s + 1], pos[s + 2]], i * 3);
    normals.set([nrm[s], nrm[s + 1], nrm[s + 2]], i * 3);
    if (skin) {
      // Body vertices use their own skin weights directly.
      const m = assets.rvSrc[i] * 12;
      transformPoint(skin.vm, m, pos[s], pos[s + 1], pos[s + 2], positions, i * 3);
      transformNormal(skin.vm, m, nrm[s], nrm[s + 1], nrm[s + 2], normals, i * 3);
    }
  }
  return { positions, normals, uvs: assets.rvUv, index: assets.tris };
}

export interface EyeData {
  /** Eyeball centre and radius, cm. */
  centre: [number, number, number];
  radius: number;
  /** Eyeball triangles as positions xyz, for drawing. */
  positions: Float32Array;
  index: Uint32Array;
}

/** The two eyeballs, from the morphed helper meshes. */
export function eyeData(bf: BodyFit): { left: EyeData; right: EyeData } {
  const pos = bf.positionsCm;
  const one = (tri: Uint32Array): EyeData => {
    const ids = [...new Set(tri)];
    const remap = new Map(ids.map((v, i) => [v, i]));
    const positions = new Float32Array(ids.length * 3);
    let cx = 0, cy = 0, cz = 0;
    ids.forEach((v, i) => {
      positions.set([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], i * 3);
      cx += pos[v * 3]; cy += pos[v * 3 + 1]; cz += pos[v * 3 + 2];
    });
    cx /= ids.length; cy /= ids.length; cz /= ids.length;
    const radius = ids.reduce((s, v) => s + Math.hypot(pos[v * 3] - cx, pos[v * 3 + 1] - cy, pos[v * 3 + 2] - cz), 0) / ids.length;
    return { centre: [cx, cy, cz], radius, positions, index: Uint32Array.from(tri, (v) => remap.get(v)!) };
  };
  return { left: one(bf.assets.eyes.left), right: one(bf.assets.eyes.right) };
}

// ---- loading and caching (the fit takes a few hundred ms, and only changes with the profile) -----

let assetsPromise: Promise<BodyAssets> | null = null;
export function getBodyAssets(): Promise<BodyAssets> {
  const base = typeof chrome !== 'undefined' && chrome.runtime?.getURL ? chrome.runtime.getURL('body/') : '/body/';
  assetsPromise ??= loadBodyAssets(base).catch((e) => {
    assetsPromise = null;
    throw e;
  });
  return assetsPromise;
}

const fits = new Map<string, BodyFit>();
const keyOf = (b: BodyDims) =>
  [b.gender, b.heightCm, b.weightKg, b.chestCm, b.waistCm, b.hipsCm, b.shoulderCm, b.inseamCm].map((v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)).join('|');

/** The fitted body for a set of measurements, or null if the body files cannot be loaded. */
export async function getBodyFit(b: BodyDims): Promise<BodyFit | null> {
  const key = keyOf(b);
  const hit = fits.get(key);
  if (hit) return hit;
  try {
    const assets = await getBodyAssets();
    const bf = fitBody(assets, {
      gender: b.gender,
      heightCm: b.heightCm,
      weightKg: b.weightKg,
      chestCm: b.chestCm,
      waistCm: b.waistCm,
      hipsCm: b.hipsCm,
      shoulderCm: b.shoulderCm,
      inseamCm: b.inseamCm,
    });
    if (fits.size > 6) fits.delete(fits.keys().next().value!);
    fits.set(key, bf);
    return bf;
  } catch {
    return null;
  }
}
