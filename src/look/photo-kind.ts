// Decide what a product photo shows from body-pose landmarks (MediaPipe's 33-point layout).
// Pure, so it can be tested without the model.

export interface Landmark {
  x: number; // 0..1 across the image
  y: number; // 0..1 down the image
  visibility?: number;
}

export type PhotoKind = 'front' | 'back' | 'side' | 'closeup' | 'none';

export interface PhotoAnalysis {
  kind: PhotoKind;
  /** Region of the image to look for the garment in, as fractions: shoulders to just below the hips, with sleeves. */
  region?: { x0: number; y0: number; x1: number; y1: number };
  /** Shoulder-to-hip distance as a fraction of image height; bigger means a closer shot. */
  torsoLen?: number;
  /** Shoulder width over torso length: about 0.8 or more when square-on, lower when turned. */
  frontal?: number;
}

const SH_L = 11, SH_R = 12, EL_L = 13, EL_R = 14, WR_L = 15, WR_R = 16, HIP_L = 23, HIP_R = 24;

const vis = (l: Landmark | undefined) => {
  if (!l) return 0;
  const inFrame = l.x > -0.02 && l.x < 1.02 && l.y > -0.02 && l.y < 1.02;
  return inFrame ? (l.visibility ?? 1) : 0;
};

export function classifyPose(lm: Landmark[] | null | undefined): PhotoAnalysis {
  if (!lm || lm.length < 25) return { kind: 'none' };
  const shoulders = vis(lm[SH_L]) > 0.5 && vis(lm[SH_R]) > 0.5;
  const hips = vis(lm[HIP_L]) > 0.5 && vis(lm[HIP_R]) > 0.5;
  if (!shoulders) return { kind: 'closeup' };
  if (!hips) return { kind: 'closeup' };

  const shY = (lm[SH_L].y + lm[SH_R].y) / 2;
  const hipY = (lm[HIP_L].y + lm[HIP_R].y) / 2;
  const torsoLen = hipY - shY;
  const span = Math.abs(lm[SH_L].x - lm[SH_R].x);

  // Sleeves reach past the shoulders, so include the elbows (and wrists when they are near the body).
  const xs = [lm[SH_L].x, lm[SH_R].x, lm[HIP_L].x, lm[HIP_R].x];
  for (const i of [EL_L, EL_R, WR_L, WR_R]) if (vis(lm[i]) > 0.5) xs.push(lm[i].x);
  const pad = 0.04;
  const region = {
    x0: Math.max(0, Math.min(...xs) - pad),
    x1: Math.min(1, Math.max(...xs) + pad),
    y0: Math.max(0, shY - 0.12 * torsoLen),
    y1: Math.min(1, hipY + 0.3 * torsoLen),
  };

  // Seen from the side the shoulders nearly overlap.
  const frontal = span / torsoLen;
  if (span < 0.4 * torsoLen) return { kind: 'side', region, torsoLen, frontal };

  // The model reports facial landmarks as visible even from behind, so facing comes from the shoulders:
  // the person's left shoulder (landmark 11) is on the image's right when they face the camera, and on
  // the image's left when they face away.
  return { kind: lm[SH_L].x > lm[SH_R].x ? 'front' : 'back', region, torsoLen, frontal };
}
