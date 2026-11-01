import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseBodyAssets, type BodyAssets } from '../src/render/body/assets';
import { fitBody, type BodyFit } from '../src/render/body/fit';
import { POSES } from '../src/render/body/poses';
import { poseSkin, skinVertex } from '../src/render/body/model';
import { NearestVertex, boneHeads, boneMatrices, transformPoint, vertexMatrices } from '../src/render/body/skeleton';
import type { BodyProfile } from '../src/types';

const dir = 'public/body/';
const buf = (f: string) => { const b = readFileSync(dir + f); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const man: BodyProfile = { gender: 'men', heightCm: 180, weightKg: 80, chestCm: 102, waistCm: 86, hipsCm: 100, shoulderCm: 46, inseamCm: 82 };

let assets: BodyAssets;
let bf: BodyFit;
beforeAll(() => {
  assets = parseBodyAssets(JSON.parse(readFileSync(dir + 'body.json', 'utf8')), buf('body.bin'), buf('targets.bin'));
  bf = fitBody(assets, man);
}, 60000);

const idx = (name: string) => assets.bones.findIndex((b) => b.name === name);

/** Pose every body vertex and return the posed positions. */
function posed(poseId: string): Float32Array {
  const vm = vertexMatrices(assets, boneMatrices(assets, bf.positionsCm, poseId));
  const out = new Float32Array(assets.bodyCount * 3);
  for (let v = 0; v < assets.bodyCount; v++) transformPoint(vm, v * 12, bf.positionsCm[v * 3], bf.positionsCm[v * 3 + 1], bf.positionsCm[v * 3 + 2], out, v * 3);
  return out;
}

describe('skeleton', () => {
  it('has a root, parents before children, and weights that sum to one', () => {
    expect(assets.bones.length).toBe(163);
    assets.bones.forEach((b, i) => expect(b.parent).toBeLessThan(i));
    for (let v = 0; v < assets.bodyCount; v += 97) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += assets.skinW[v * 4 + k];
      expect(s).toBeGreaterThan(250);
    }
  });

  it('puts the joints where a body has them', () => {
    const h = boneHeads(assets, bf.positionsCm);
    const y = (n: string) => h[idx(n) * 3 + 1];
    const x = (n: string) => h[idx(n) * 3];
    // shoulder above elbow above wrist; hip above knee above ankle
    expect(y('upperarm01.L')).toBeGreaterThan(y('lowerarm01.L'));
    expect(y('lowerarm01.L')).toBeGreaterThan(y('wrist.L'));
    expect(y('upperleg01.L')).toBeGreaterThan(y('lowerleg01.L'));
    // left and right are on opposite sides
    expect(Math.sign(x('upperarm01.L'))).toBe(-Math.sign(x('upperarm01.R')));
    // shoulders are about the measured width apart
    expect(Math.abs(x('upperarm01.L') - x('upperarm01.R'))).toBeGreaterThan(25);
  });
});

describe('posing', () => {
  it('the rest pose leaves every vertex where it was', () => {
    const p = posed('a-pose');
    for (let i = 0; i < p.length; i += 301) expect(p[i]).toBeCloseTo(bf.positionsCm[i], 3);
  });

  it('relaxed lowers the hands and brings them in, but not the head or torso', () => {
    const rest = bf.positionsCm;
    const p = posed('relaxed');
    // find the vertex furthest out on +x (a fingertip) in the rest pose
    let tip = 0;
    for (let v = 1; v < assets.bodyCount; v++) if (rest[v * 3] > rest[tip * 3]) tip = v;
    expect(p[tip * 3]).toBeLessThan(rest[tip * 3] - 15); // moved inwards
    expect(p[tip * 3 + 1]).toBeLessThan(rest[tip * 3 + 1] - 2); // and the hand swings down
    // a head vertex and a mid-torso vertex are untouched
    let head = 0, torso = 0;
    for (let v = 0; v < assets.bodyCount; v++) {
      if (rest[v * 3 + 1] > rest[head * 3 + 1]) head = v;
      if (Math.abs(rest[v * 3]) < 1 && Math.abs(rest[v * 3 + 1] - 0.62 * 180) < 1 && rest[v * 3 + 2] > rest[torso * 3 + 2]) torso = v;
    }
    for (const v of [head, torso]) for (let k = 0; k < 3; k++) expect(p[v * 3 + k]).toBeCloseTo(rest[v * 3 + k], 1);
  });

  it('walking moves one leg forward and the other back', () => {
    const rest = bf.positionsCm;
    const p = posed('walking');
    // lowest vertices on each side of the body are the feet
    const foot = (sign: number) => {
      let best = -1;
      for (let v = 0; v < assets.bodyCount; v++) if (sign * rest[v * 3] > 5 && (best < 0 || rest[v * 3 + 1] < rest[best * 3 + 1])) best = v;
      return best;
    };
    const a = foot(1), b = foot(-1);
    expect(Math.sign(p[a * 3 + 2] - rest[a * 3 + 2])).toBe(-Math.sign(p[b * 3 + 2] - rest[b * 3 + 2]));
    expect(Math.abs(p[a * 3 + 2] - rest[a * 3 + 2])).toBeGreaterThan(8);
  });

  it('every pose is finite and keeps the body about the same size', () => {
    for (const pose of POSES) {
      const p = posed(pose.id);
      expect(p.every(Number.isFinite), pose.id).toBe(true);
      let ymax = -Infinity;
      for (let i = 1; i < p.length; i += 3) ymax = Math.max(ymax, p[i]);
      expect(ymax, pose.id).toBeGreaterThan(170);
      expect(ymax, pose.id).toBeLessThan(190);
    }
  });
});

describe('nearest vertex', () => {
  it('finds a body vertex for a nearby point', () => {
    const nv = new NearestVertex(bf.positionsCm, assets.bodyCount);
    const v = 4000;
    const x = bf.positionsCm[v * 3], y = bf.positionsCm[v * 3 + 1], z = bf.positionsCm[v * 3 + 2];
    expect(nv.find(x + 0.2, y, z)).toBe(v);
  });
});

describe('skinning cloth', () => {
  it('a point on the arm follows the arm, a point on the chest stays put, and the rest pose is untouched', () => {
    const rest = bf.positionsCm;
    expect(poseSkin(bf, 'a-pose')).toBeNull();
    const skin = poseSkin(bf, 'relaxed')!;
    expect(skin.groundShift).toBeCloseTo(0, 0);

    // a point just outside the +x forearm, and one in front of the chest
    let tip = 0;
    for (let v = 1; v < assets.bodyCount; v++) if (rest[v * 3] > rest[tip * 3]) tip = v;
    const arm = [rest[tip * 3] - 2, rest[tip * 3 + 1] + 1, rest[tip * 3 + 2]];
    skinVertex(skin, arm, null, 0, 1);
    expect(arm[0]).toBeLessThan(rest[tip * 3] - 10);

    const chest = [0, 0.72 * 180, 12];
    const before = [...chest];
    skinVertex(skin, chest, null, 0);
    for (let k = 0; k < 3; k++) expect(chest[k]).toBeCloseTo(before[k], 0);
  });

  it('blends several vertices so weights sum to one', () => {
    const nv = new NearestVertex(bf.positionsCm, assets.bodyCount);
    const k = nv.findK(bf.positionsCm[4000 * 3], bf.positionsCm[4000 * 3 + 1], bf.positionsCm[4000 * 3 + 2], 6);
    expect(k.length).toBe(6);
    expect(k.reduce((t, e) => t + e.w, 0)).toBeCloseTo(1, 5);
    expect(k[0].v).toBe(4000);
  });
});
