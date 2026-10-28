// Finds the garment in a product photo: its main colour, whether it has a print, and where it is.
// Pure functions on RGBA pixel arrays so they can be tested without a browser.

export interface Pixels {
  data: ArrayLike<number>; // RGBA
  width: number;
  height: number;
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Look {
  /** Dominant garment colour as #rrggbb. */
  colour: string;
  /** More than one distinct colour covers the torso (print, stripes, dots). */
  hasPrint: boolean;
  /** Garment bounding box as fractions of the image (0..1). */
  box: Box;
  /** 1 where a downsampled pixel belongs to the garment. */
  mask: Uint8Array;
  maskWidth: number;
  maskHeight: number;
}

type RGB = [number, number, number];

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Classic RGB skin-tone rule. Not perfect; used only to keep faces and arms out of the garment. */
const isSkin = ([r, g, b]: RGB) =>
  r > 95 && g > 40 && b > 20 && Math.max(r, g, b) - Math.min(r, g, b) > 15 && Math.abs(r - g) > 15 && r > g && r > b;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Box-average down to at most `maxW` pixels wide. */
function downsample(img: Pixels, maxW: number): { px: RGB[]; w: number; h: number } {
  const scale = Math.min(1, maxW / img.width);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const px: RGB[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x / w) * img.width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / w) * img.width));
      const y0 = Math.floor((y / h) * img.height);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / h) * img.height));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
        }
      }
      px.push([r / n, g / n, b / n]);
    }
  }
  return { px, w, h };
}

/** Small k-means; returns centres with their share of the points, largest first. */
function kmeans(points: RGB[], k: number): { c: RGB; share: number }[] {
  if (!points.length) return [];
  // Seed with the darkest, lightest and a middle point so clusters start apart.
  const sorted = [...points].sort((p, q) => p[0] + p[1] + p[2] - (q[0] + q[1] + q[2]));
  let centres: RGB[] = Array.from({ length: k }, (_, i) => [...sorted[Math.floor(((i + 0.5) / k) * sorted.length)]] as RGB);
  const assign = new Array<number>(points.length).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    points.forEach((p, i) => {
      let best = 0, bd = Infinity;
      centres.forEach((c, ci) => { const d = dist(p, c); if (d < bd) { bd = d; best = ci; } });
      assign[i] = best;
    });
    centres = centres.map((c, ci) => {
      const m = points.filter((_, i) => assign[i] === ci);
      if (!m.length) return c;
      return [0, 1, 2].map((ch) => m.reduce((s, p) => s + p[ch], 0) / m.length) as RGB;
    });
  }
  return centres
    .map((c, ci) => ({ c, share: assign.filter((a) => a === ci).length / points.length }))
    .filter((x) => x.share > 0)
    .sort((a, b) => b.share - a.share);
}

/** Pixels reachable from the image border through background-coloured pixels. */
function outsideMask(px: RGB[], w: number, h: number, bg: RGB, tol: number): Uint8Array {
  const out = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (out[i] || dist(px[i], bg) > tol) return;
    out[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  return out;
}

/**
 * Connected regions of the silhouette. The garment is the large region highest up the frame
 * (a tee beats the shorts below it) whose centre is not at the very top (hair).
 */
function largestScoredComponent(
  mask: Uint8Array,
  w: number,
  h: number,
  plainLargest = false,
): { mask: Uint8Array; area: number } | null {
  const label = new Int32Array(w * h);
  const comps: { id: number; area: number; cy: number }[] = [];
  let next = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || label[s]) continue;
    next++;
    let area = 0, sumY = 0;
    const stack = [s];
    label[s] = next;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      area++; sumY += y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (mask[j] && !label[j]) { label[j] = next; stack.push(j); }
      }
    }
    comps.push({ id: next, area, cy: sumY / area / h });
  }
  const big = comps.filter((c) => c.area >= 0.04 * w * h);
  const candidates = plainLargest ? big : big.filter((c) => c.cy >= 0.2);
  const pool = candidates.length ? candidates : big.length ? big : comps;
  if (!pool.length) return null;
  const score = (c: { area: number; cy: number }) => (plainLargest ? c.area : c.area * (1 - c.cy));
  const best = pool.reduce((m, c) => (score(c) > score(m) ? c : m));
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) if (label[i] === best.id) out[i] = 1;
  return { mask: out, area: best.area };
}

function hsv([r, g, b]: RGB): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, max ? d / max : 0, max / 255];
}

/** Two colours are different "inks" (not just light and shade) when hue, saturation or lightness gap is large. */
function distinct(a: RGB, b: RGB): boolean {
  const [ha, sa, va] = hsv(a);
  const [hb, sb, vb] = hsv(b);
  const dh = Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
  if (dh > 30 && sa > 0.25 && sb > 0.25) return true;
  if (Math.abs(sa - sb) > 0.35) return true;
  return Math.abs(va - vb) > 0.5;
}

/** Merge clusters that only differ by shading into colour groups, largest first. */
function mergeClusters(clusters: { c: RGB; share: number }[]): { c: RGB; share: number }[] {
  const groups: { c: RGB; share: number }[] = [];
  for (const cl of clusters) {
    const g = groups.find((x) => !distinct(x.c, cl.c));
    if (g) {
      const t = g.share + cl.share;
      g.c = [0, 1, 2].map((ch) => (g.c[ch] * g.share + cl.c[ch] * cl.share) / t) as RGB;
      g.share = t;
    } else groups.push({ ...cl });
  }
  return groups.sort((x, y) => y.share - x.share);
}

/**
 * Analyse a product photo. Works for model shots and flat-lays on a plain background.
 * Returns null if no garment-like region is found.
 */
export function extractLook(img: Pixels): Look | null {
  const { px, w, h } = downsample(img, 96);

  // Background = median of the border ring.
  const ring: RGB[] = [];
  const edge = Math.max(1, Math.round(w * 0.05));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < edge || y < edge || x >= w - edge || y >= h - edge) ring.push(px[y * w + x]);
  const bg: RGB = [median(ring.map((p) => p[0])), median(ring.map((p) => p[1])), median(ring.map((p) => p[2]))];

  // Silhouette: everything that is not background (flood filled from the border) and not skin.
  const outside = outsideMask(px, w, h, bg, 24);
  const pickComponent = (skinFilter: boolean) => {
    const sil = new Uint8Array(w * h);
    for (let i = 0; i < sil.length; i++) if (!outside[i] && (!skinFilter || !isSkin(px[i]))) sil[i] = 1;
    return largestScoredComponent(sil, w, h);
  };
  // A tan or brown garment can look like skin; if the filter leaves almost nothing, ignore it.
  let comp = pickComponent(true);
  if (!comp || comp.area < 0.05 * w * h) comp = pickComponent(false) ?? comp;
  if (!comp || comp.area < 0.04 * w * h) return null;
  // Full-length shot (feet visible): a top ends around half way down the figure, so drop the
  // trousers or skirt below it. Close-ups cannot be cut this way and rely on colour instead.
  let figTop = h, figBottom = 0;
  for (let i = 0; i < outside.length; i++) {
    if (outside[i]) continue;
    const y = Math.floor(i / w);
    figTop = Math.min(figTop, y);
    figBottom = Math.max(figBottom, y);
  }
  const fullBody = figBottom < 0.97 * h && figBottom - figTop > 0.7 * h;
  const cutY = fullBody ? figTop + 0.54 * (figBottom - figTop) : h;
  const region = new Uint8Array(w * h);
  for (let i = 0; i < region.length; i++) if (comp.mask[i] && Math.floor(i / w) <= cutY) region[i] = 1;

  // Colour groups inside the region. Shading (shadow vs highlight) must not count as a print.
  const pts: RGB[] = [];
  for (let i = 0; i < region.length; i++) if (region[i]) pts.push(px[i]);
  const groups = mergeClusters(kmeans(pts, 4));
  const main = groups[0];

  // The garment is the main colour's biggest connected patch, plus anything enclosed by it (a print).
  const nearestGroup = (p: RGB) => groups.reduce((m, g, gi) => (dist(p, g.c) < dist(p, groups[m].c) ? gi : m), 0);
  const mainOnly = new Uint8Array(w * h);
  for (let i = 0; i < mainOnly.length; i++) if (region[i] && nearestGroup(px[i]) === 0) mainOnly[i] = 1;
  const patch = largestScoredComponent(mainOnly, w, h, true);
  if (!patch) return null;
  const mask = new Uint8Array(patch.mask);
  // Flood the image from its border over non-garment pixels; whatever stays unreached is enclosed.
  const reach = new Uint8Array(w * h);
  const stack: number[] = [];
  const seed = (x: number, y: number) => {
    const i = y * w + x;
    if (!mask[i] && !reach[i]) { reach[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
  for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    if (x + 1 < w) seed(x + 1, y);
    if (x > 0) seed(x - 1, y);
    if (y + 1 < h) seed(x, y + 1);
    if (y > 0) seed(x, y - 1);
  }
  let holes = 0;
  for (let i = 0; i < mask.length; i++) if (!mask[i] && !reach[i]) { mask[i] = 1; holes++; }
  const hasPrint = holes >= 0.025 * patch.area;

  // Trim hair or collar-level strands above the shoulders: start at the first row that is nearly
  // as wide as the widest row.
  const rowCount = (y: number) => {
    let c = 0;
    for (let x = 0; x < w; x++) c += mask[y * w + x];
    return c;
  };
  const counts = Array.from({ length: h }, (_, y) => rowCount(y));
  const widest = Math.max(...counts);
  const firstWide = counts.findIndex((c) => c >= 0.55 * widest);
  for (let y = 0; y < firstWide; y++) for (let x = 0; x < w; x++) mask[y * w + x] = 0;

  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const x = i % w, y = (i - x) / w;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1);
  }

  return {
    colour: hex(main.c),
    hasPrint,
    box: { x0: x0 / w, y0: y0 / h, x1: x1 / w, y1: y1 / h },
    mask,
    maskWidth: w,
    maskHeight: h,
  };
}

export interface Texture {
  width: number;
  height: number;
  /** RGBA */
  data: Uint8ClampedArray;
}

/**
 * Crop the garment out of the photo as a texture. Pixels outside the garment (background, skin) are
 * filled with the garment colour, and a thin border of that colour surrounds it so back faces can
 * point at a plain texel.
 */
export function buildTexture(img: Pixels, look: Look, maxSide = 256): Texture {
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
          rgb = [img.data[i], img.data[i + 1], img.data[i + 2]];
        }
      }
      data[o] = rgb[0]; data[o + 1] = rgb[1]; data[o + 2] = rgb[2]; data[o + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}
