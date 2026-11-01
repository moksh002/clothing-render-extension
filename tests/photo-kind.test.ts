import { describe, expect, it } from 'vitest';
import { classifyPose, type Landmark } from '../src/look/photo-kind';

/** A 33-point pose with only the torso set; everything else is out of frame. */
function pose(o: { shL: number; shR: number; hipL?: number; hipR?: number; hips?: boolean; shY?: number; hipY?: number }): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
  const shY = o.shY ?? 0.3, hipY = o.hipY ?? 0.6;
  lm[11] = { x: o.shL, y: shY, visibility: 1 };
  lm[12] = { x: o.shR, y: shY, visibility: 1 };
  const hv = o.hips === false ? 0 : 1;
  lm[23] = { x: o.hipL ?? o.shL, y: hipY, visibility: hv };
  lm[24] = { x: o.hipR ?? o.shR, y: hipY, visibility: hv };
  return lm;
}

describe('photo kind from pose', () => {
  it('front: the left shoulder is on the image right', () => {
    expect(classifyPose(pose({ shL: 0.65, shR: 0.35 })).kind).toBe('front');
  });

  it('back: the left shoulder is on the image left', () => {
    expect(classifyPose(pose({ shL: 0.35, shR: 0.65 })).kind).toBe('back');
  });

  it('side: shoulders nearly overlap', () => {
    expect(classifyPose(pose({ shL: 0.52, shR: 0.48 })).kind).toBe('side');
  });

  it('close-up: hips or shoulders out of frame', () => {
    expect(classifyPose(pose({ shL: 0.65, shR: 0.35, hips: false })).kind).toBe('closeup');
    const lm = pose({ shL: 0.65, shR: 0.35 });
    lm[12] = { x: -0.1, y: 0.3, visibility: 1 };
    expect(classifyPose(lm).kind).toBe('closeup');
  });

  it('none when there is no pose', () => {
    expect(classifyPose(null).kind).toBe('none');
    expect(classifyPose([]).kind).toBe('none');
  });

  it('region spans shoulders to just below the hips, with a margin', () => {
    const r = classifyPose(pose({ shL: 0.65, shR: 0.35 })).region!;
    expect(r.x0).toBeLessThan(0.35);
    expect(r.x1).toBeGreaterThan(0.65);
    expect(r.y0).toBeLessThan(0.3);
    expect(r.y1).toBeGreaterThan(0.6);
  });
});
