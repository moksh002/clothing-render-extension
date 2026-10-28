import { RENDER_WIDTH_FACTOR } from '../fit/fit-config';
import type { FitLabel, FitResult, Gender } from '../types';
import type { Renderer } from './renderer';

export const VIEW_W = 260;
export const VIEW_H = 460;
const CX = VIEW_W / 2;
const GROUND = VIEW_H - 12;
/** Pixels per cm. Tall enough for a 210 cm person to fit the view. */
const SCALE = 2;

// Anatomical levels as fractions of height, measured from the ground.
const NECK_BASE = 0.818;
const ARM_ANGLE = (6 * Math.PI) / 180;

interface Template {
  neckHalfCm: number;
  headRadiusPerHeight: number;
  armWidthPerHeight: number;
  /** How far the side curves pull inwards at the waist (px). Women more than men. */
  waistCurvePx: number;
  chestDropPerHeight: number;
}

const TEMPLATES: Record<Gender, Template> = {
  men: { neckHalfCm: 6, headRadiusPerHeight: 0.0625, armWidthPerHeight: 0.052, waistCurvePx: 1, chestDropPerHeight: 0.095 },
  women: { neckHalfCm: 5, headRadiusPerHeight: 0.06, armWidthPerHeight: 0.046, waistCurvePx: 5, chestDropPerHeight: 0.092 },
};

const COLOURS: Record<FitLabel, string> = {
  tight: '#e5736f',
  fitted: '#a9bddb',
  true: '#a9bddb',
  loose: '#a9bddb',
  oversized: '#a9bddb',
};
const SKIN = '#e9d8c8';
const SKIN_LINE = '#b9a592';

const n = (v: number) => Math.round(v * 10) / 10;

/** Build the full SVG markup for a FitResult. Pure, so it can be tested. */
export function buildSvg(fit: FitResult): string {
  const { body, garment: g } = fit;
  const t = TEMPLATES[body.gender];
  const H = body.heightCm;
  const s = SCALE;

  // Vertical landmarks (px, y grows downward).
  const topY = GROUND - H * s;
  const neckY = GROUND - NECK_BASE * H * s;
  const chestY = neckY + t.chestDropPerHeight * H * s;
  const waistY = neckY + 0.2 * H * s;
  const hipY = neckY + body.torsoLengthCm * s;
  const crotchY = GROUND - body.inseamCm * s;
  const hemY = neckY + g.lengthCm * s;

  // Front-view half widths (px). Same factor for body and garment.
  const half = (circ: number, f: number) => (f * circ * s) / 2;
  const bodyChestH = half(body.chestCm, RENDER_WIDTH_FACTOR.chest);
  const bodyWaistH = half(body.waistCm, RENDER_WIDTH_FACTOR.waist);
  const bodyHipH = half(body.hipsCm, RENDER_WIDTH_FACTOR.hips);
  const shoulderH = (body.shoulderCm * s) / 2;
  const neckH = t.neckHalfCm * s;

  // Body half-width at a given y, for keeping the garment from sinking into the body.
  const bodyHalfAt = (y: number) => {
    const pts: [number, number][] = [
      [neckY, neckH],
      [chestY, bodyChestH],
      [waistY, bodyWaistH],
      [hipY, bodyHipH],
      [crotchY, bodyHipH * 0.95],
    ];
    if (y <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [y1, w1] = pts[i];
      const [y0, w0] = pts[i - 1];
      if (y <= y1) return w0 + ((w1 - w0) * (y - y0)) / Math.max(1e-6, y1 - y0);
    }
    return pts[pts.length - 1][1];
  };

  // ---- Body ----
  const sideL = (x1: number, y1: number, x2: number, y2: number, bulge: number) =>
    `Q ${n(CX - ((x1 + x2) / 2 - bulge))} ${n((y1 + y2) / 2)} ${n(CX - x2)} ${n(y2)}`;

  const torsoPath = [
    `M ${n(CX - neckH)} ${n(neckY)}`,
    `L ${n(CX - shoulderH)} ${n(neckY + 6)}`,
    `L ${n(CX - bodyChestH)} ${n(chestY)}`,
    sideL(bodyChestH, chestY, bodyWaistH, waistY, t.waistCurvePx),
    sideL(bodyWaistH, waistY, bodyHipH, hipY, t.waistCurvePx),
    `L ${n(CX - bodyHipH * 0.95)} ${n(crotchY)}`,
    `L ${n(CX + bodyHipH * 0.95)} ${n(crotchY)}`,
    `L ${n(CX + bodyHipH)} ${n(hipY)}`,
  ];
  // The right side is drawn bottom-up so the path closes back at the neck.
  const rightUp = [
    `Q ${n(CX + (bodyHipH + bodyWaistH) / 2 - t.waistCurvePx)} ${n((hipY + waistY) / 2)} ${n(CX + bodyWaistH)} ${n(waistY)}`,
    `Q ${n(CX + (bodyWaistH + bodyChestH) / 2 - t.waistCurvePx)} ${n((waistY + chestY) / 2)} ${n(CX + bodyChestH)} ${n(chestY)}`,
    `L ${n(CX + shoulderH)} ${n(neckY + 6)}`,
    `L ${n(CX + neckH)} ${n(neckY)}`,
    'Z',
  ];
  const torso = [...torsoPath, ...rightUp].join(' ');

  const legW = bodyHipH * 0.92;
  const kneeY = GROUND - 0.285 * H * s;
  const leg = (dir: 1 | -1) => {
    const x = (d: number) => n(CX + dir * d);
    return [
      `M ${x(1.5)} ${n(crotchY)}`,
      `L ${x(legW)} ${n(crotchY)}`,
      `L ${x(legW * 0.72)} ${n(kneeY)}`,
      `L ${x(legW * 0.55)} ${n(GROUND)}`,
      `L ${x(legW * 0.1 + 4)} ${n(GROUND)}`,
      `L ${x(legW * 0.18 + 2)} ${n(kneeY)}`,
      'Z',
    ].join(' ');
  };

  // Arms hang from the shoulder tips, angled slightly outwards.
  const armW = t.armWidthPerHeight * H * s;
  const armLen = body.armLengthCm * s;
  const armTop = (dir: 1 | -1) => ({ x: CX + dir * (shoulderH - armW / 2), y: neckY + armW / 2 + 2 });
  const dirVec = (dir: 1 | -1) => ({ x: dir * Math.sin(ARM_ANGLE), y: Math.cos(ARM_ANGLE) });
  const arm = (dir: 1 | -1) => {
    const a = armTop(dir);
    const d = dirVec(dir);
    return `<line x1="${n(a.x)}" y1="${n(a.y)}" x2="${n(a.x + d.x * armLen)}" y2="${n(a.y + d.y * armLen)}" stroke="${SKIN}" stroke-width="${n(armW)}" stroke-linecap="round"/>`;
  };

  const headR = t.headRadiusPerHeight * H * s;
  const head = `<circle cx="${CX}" cy="${n(topY + headR)}" r="${n(headR)}" fill="${SKIN}" stroke="${SKIN_LINE}"/>`;
  const neck = `<rect x="${n(CX - neckH * 0.85)}" y="${n(topY + headR * 1.7)}" width="${n(neckH * 1.7)}" height="${n(neckY - (topY + headR * 1.7) + 4)}" fill="${SKIN}"/>`;

  // ---- Garment ----
  const colour = COLOURS[fit.label.chest];
  const lowColour = COLOURS[fit.label.waist];
  const gChestH = Math.max(half(g.chestCm, RENDER_WIDTH_FACTOR.chest), bodyChestH);
  const gWaistH = Math.max(half(Math.max(g.waistCm, g.chestCm * 0.9), RENDER_WIDTH_FACTOR.waist), bodyWaistH);
  const gHemH = Math.max(half(g.chestCm * 0.98, RENDER_WIDTH_FACTOR.hips), bodyHalfAt(hemY) + 1);
  const gShoulderH = Math.max((g.shoulderCm * s) / 2, shoulderH);
  // Dropped shoulder: the seam sits lower on the arm as shoulder ease grows.
  const drop = Math.min(18, Math.max(0, fit.easeCm.shoulder - 3) * 1.6);
  const collarH = neckH + 5;

  const garmentPath = [
    `M ${n(CX - collarH)} ${n(neckY - 4)}`,
    `L ${n(CX - gShoulderH)} ${n(neckY + 4 + drop)}`,
    `L ${n(CX - gChestH)} ${n(Math.max(chestY, neckY + 4 + drop + 6))}`,
    `L ${n(CX - gWaistH)} ${n(waistY)}`,
    `L ${n(CX - gHemH)} ${n(hemY)}`,
    `L ${n(CX + gHemH)} ${n(hemY)}`,
    `L ${n(CX + gWaistH)} ${n(waistY)}`,
    `L ${n(CX + gChestH)} ${n(Math.max(chestY, neckY + 4 + drop + 6))}`,
    `L ${n(CX + gShoulderH)} ${n(neckY + 4 + drop)}`,
    `L ${n(CX + collarH)} ${n(neckY - 4)}`,
    `Q ${CX} ${n(neckY + 18)} ${n(CX - collarH)} ${n(neckY - 4)}`,
    'Z',
  ].join(' ');

  // Sleeves follow the arm. Looser garments get wider sleeves.
  const sleeveGap = Math.min(14, Math.max(0, fit.easeCm.chest * 0.35));
  const sleeveLen = g.sleeveCm * s;
  const sleeve = (dir: 1 | -1) => {
    if (sleeveLen <= 0) return '';
    const a = armTop(dir);
    const d = dirVec(dir);
    const x1 = a.x - d.x * (armW / 2 + drop * 0.3);
    const y1 = a.y - d.y * (armW / 2) + drop;
    return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(a.x + d.x * sleeveLen)}" y2="${n(a.y + d.y * sleeveLen)}" stroke="url(#fitGrad)" stroke-width="${n(armW + sleeveGap * 2)}" stroke-linecap="butt"/>`;
  };

  const aria = `${body.gender === 'men' ? 'Men' : 'Women'} figure wearing size ${g.sizeLabel}: chest ${fit.label.chest}, hem at ${fit.hemAt}`;

  return [
    `<defs><linearGradient id="fitGrad" gradientUnits="userSpaceOnUse" x1="0" y1="${n(chestY)}" x2="0" y2="${n(hemY)}">`,
    `<stop offset="0" stop-color="${colour}"/><stop offset="1" stop-color="${lowColour}"/></linearGradient></defs>`,
    `<title>${aria}</title>`,
    `<line x1="${CX - 70}" y1="${GROUND}" x2="${CX + 70}" y2="${GROUND}" stroke="#d4d8de" stroke-width="2"/>`,
    `<g id="body" stroke="${SKIN_LINE}" stroke-width="1">`,
    `<path d="${leg(1)}" fill="${SKIN}"/><path d="${leg(-1)}" fill="${SKIN}"/>`,
    arm(1),
    arm(-1),
    `<path id="torso" d="${torso}" fill="${SKIN}"/>`,
    neck,
    head,
    `</g>`,
    `<g id="garment" stroke="#6f7f9a" stroke-width="1" stroke-linejoin="round" opacity="0.93">`,
    sleeve(1),
    sleeve(-1),
    `<path d="${garmentPath}" fill="url(#fitGrad)"/>`,
    `</g>`,
  ].join('');
}

export class SvgRenderer implements Renderer {
  render(fit: FitResult, el: SVGElement): void {
    el.setAttribute('viewBox', `0 0 ${VIEW_W} ${VIEW_H}`);
    el.setAttribute('role', 'img');
    el.innerHTML = buildSvg(fit);
  }
}
