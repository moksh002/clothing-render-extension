// Turns cut-out garment photos into textures: removes baked-in shading, joins front and back into one
// atlas, and samples a fabric patch for a bump map. Pure pixel maths, tested without a browser.
import type { Look, Pixels } from './segment';

export interface Texture {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray;
}

const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Per-pixel brightness correction that flattens folds and cast shadows while keeping the garment's own
 * colour and print: the local average brightness (inside the mask) is pushed towards the overall average.
 */
function shadeFactors(img: Pixels, look: Look, strength: number): (x: number, y: number) => number {
  const G = 40;
  const gw = G, gh = Math.max(1, Math.round((G * img.height) / img.width));
  const sum = new Float32Array(gw * gh), cnt = new Float32Array(gw * gh);
  let total = 0, n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const mx = Math.min(look.maskWidth - 1, Math.floor((x / img.width) * look.maskWidth));
      const my = Math.min(look.maskHeight - 1, Math.floor((y / img.height) * look.maskHeight));
      if (!look.mask[my * look.maskWidth + mx]) continue;
      const i = (y * img.width + x) * 4;
      const l = lum(img.data[i], img.data[i + 1], img.data[i + 2]);
      const g = Math.min(gh - 1, Math.floor((y / img.height) * gh)) * gw + Math.min(gw - 1, Math.floor((x / img.width) * gw));
      sum[g] += l; cnt[g]++; total += l; n++;
    }
  }
  const mean = n ? total / n : 128;
  // Cell averages, empty cells take the overall mean, then a small box blur.
  const cell = Array.from(sum, (v, i) => (cnt[i] ? v / cnt[i] : mean));
  const blurred = new Float32Array(cell.length);
  const R = 2;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let s = 0, c = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gh) continue;
      s += cell[yy * gw + xx]; c++;
    }
    blurred[y * gw + x] = s / c;
  }
  return (x, y) => {
    const gx = Math.min(gw - 1, Math.max(0, (x / img.width) * gw - 0.5)), gy = Math.min(gh - 1, Math.max(0, (y / img.height) * gh - 0.5));
    const x0 = Math.floor(gx), y0 = Math.floor(gy), x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
    const fx = gx - x0, fy = gy - y0;
    const local = (blurred[y0 * gw + x0] * (1 - fx) + blurred[y0 * gw + x1] * fx) * (1 - fy) + (blurred[y1 * gw + x0] * (1 - fx) + blurred[y1 * gw + x1] * fx) * fy;
    const f = mean / Math.max(30, local);
    return Math.pow(Math.min(1.7, Math.max(0.6, f)), strength);
  };
}

/**
 * Crop the garment out of a photo as a texture. Pixels outside the garment are filled with the garment
 * colour, and a thin border of that colour surrounds it so unmapped faces can point at a plain texel.
 */
export function buildTexture(img: Pixels, look: Look, opts: { maxSide?: number; deshade?: number } = {}): Texture {
  const maxSide = opts.maxSide ?? 256;
  const bx0 = Math.floor(look.box.x0 * img.width);
  const by0 = Math.floor(look.box.y0 * img.height);
  const bw = Math.max(1, Math.ceil((look.box.x1 - look.box.x0) * img.width));
  const bh = Math.max(1, Math.ceil((look.box.y1 - look.box.y0) * img.height));
  const scale = Math.min(1, maxSide / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  const pad = 2;
  const W = w + pad * 2;
  const H = h + pad * 2;
  const fill = [parseInt(look.colour.slice(1, 3), 16), parseInt(look.colour.slice(3, 5), 16), parseInt(look.colour.slice(5, 7), 16)];
  const factor = opts.deshade ? shadeFactors(img, look, opts.deshade) : () => 1;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const inside = x >= pad && y >= pad && x < W - pad && y < H - pad;
      let rgb = fill;
      if (inside) {
        const sx = Math.min(img.width - 1, bx0 + Math.floor(((x - pad) / w) * bw));
        const sy = Math.min(img.height - 1, by0 + Math.floor(((y - pad) / h) * bh));
        const mx = Math.min(look.maskWidth - 1, Math.floor((sx / img.width) * look.maskWidth));
        const my = Math.min(look.maskHeight - 1, Math.floor((sy / img.height) * look.maskHeight));
        if (look.mask[my * look.maskWidth + mx]) {
          const i = (sy * img.width + sx) * 4;
          const f = factor(sx, sy);
          rgb = [img.data[i] * f, img.data[i + 1] * f, img.data[i + 2] * f];
        }
      }
      data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

export interface Atlas {
  texture: Texture;
  /** Inner u-range (excluding the border) of each photo within the atlas. */
  front?: { u0: number; u1: number };
  back?: { u0: number; u1: number };
}

const PAD = 2;

/** Place the front and back cut-outs side by side at a common height. */
export function buildAtlas(front?: Texture, back?: Texture): Atlas | null {
  const parts = [front, back].filter((t): t is Texture => !!t);
  if (!parts.length) return null;
  const H = Math.max(...parts.map((t) => t.height));
  const scaled = parts.map((t) => ({ t, w: Math.max(1, Math.round((t.width * H) / t.height)) }));
  const W = scaled.reduce((s, p) => s + p.w, 0);
  const data = new Uint8ClampedArray(W * H * 4);
  let xo = 0;
  const ranges: { u0: number; u1: number }[] = [];
  for (const { t, w } of scaled) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.min(t.width - 1, Math.floor((x / w) * t.width));
        const sy = Math.min(t.height - 1, Math.floor((y / H) * t.height));
        const s = (sy * t.width + sx) * 4, o = (y * W + xo + x) * 4;
        data[o] = t.data[s]; data[o + 1] = t.data[s + 1]; data[o + 2] = t.data[s + 2]; data[o + 3] = 255;
      }
    }
    ranges.push({ u0: (xo + PAD) / W, u1: (xo + w - PAD) / W });
    xo += w;
  }
  const atlas: Atlas = { texture: { width: W, height: H, data } };
  let i = 0;
  if (front) atlas.front = ranges[i++];
  if (back) atlas.back = ranges[i++];
  return atlas;
}

/**
 * A greyscale bump patch of the fabric: the largest square fully inside the garment, high-passed so folds
 * and shading drop out and only the weave or knit remains, mirrored 2x2 so it tiles without seams.
 */
export function fabricPatch(img: Pixels, look: Look): Texture | null {
  const S = Math.floor(Math.min(img.width, img.height) * 0.28);
  if (S < 24) return null;
  const inMask = (x: number, y: number) => {
    const mx = Math.min(look.maskWidth - 1, Math.floor((x / img.width) * look.maskWidth));
    const my = Math.min(look.maskHeight - 1, Math.floor((y / img.height) * look.maskHeight));
    return look.mask[my * look.maskWidth + mx] === 1;
  };
  let best: { x: number; y: number; score: number } | null = null;
  const step = Math.max(4, Math.floor(S / 4));
  for (let y = 0; y + S <= img.height; y += step) {
    for (let x = 0; x + S <= img.width; x += step) {
      let ok = 0, n = 0;
      for (let k = 0; k < 25; k++) {
        n++;
        if (inMask(x + ((k % 5) / 4) * (S - 1), y + (Math.floor(k / 5) / 4) * (S - 1))) ok++;
      }
      if (ok < n) continue;
      const cx = x + S / 2 - img.width / 2, cy = y + S / 2 - img.height * 0.55;
      const score = -Math.hypot(cx, cy); // prefer the middle of the garment
      if (!best || score > best.score) best = { x, y, score };
    }
  }
  if (!best) return null;

  // Luminance patch, then subtract a local average (high-pass).
  const L = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = ((best.y + y) * img.width + best.x + x) * 4;
    L[y * S + x] = lum(img.data[i], img.data[i + 1], img.data[i + 2]);
  }
  const R = Math.max(2, Math.round(S / 12));
  const hp = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let s = 0, c = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
      s += L[yy * S + xx]; c++;
    }
    hp[y * S + x] = L[y * S + x] - s / c;
  }
  let var_ = 0;
  for (const v of hp) var_ += v * v;
  const sd = Math.sqrt(var_ / hp.length) || 1;
  // Mirror 2x2 so the edges match when tiled, and map to 0..255 around mid-grey.
  const T = S * 2;
  const data = new Uint8ClampedArray(T * T * 4);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const sx = x < S ? x : T - 1 - x, sy = y < S ? y : T - 1 - y;
    const v = Math.max(0, Math.min(255, 128 + (hp[sy * S + sx] / sd) * 40));
    const o = (y * T + x) * 4;
    data[o] = data[o + 1] = data[o + 2] = v; data[o + 3] = 255;
  }
  return { width: T, height: T, data };
}
